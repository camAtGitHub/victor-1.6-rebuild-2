"""VizManager CLI + locked desktop layout.

python -m vizmanager --robot 192.168.50.155
python -m vizmanager --listen-only

pygame chrome; vispy 3D optional (WORLD 3D falls back to projected wires / 2D).
If pygame is missing, --listen-only / --robot still bind UDP and print pkt/s.
"""

from __future__ import annotations

import argparse
import errno
import math
import select
import socket
import struct
import sys
import time

from vizmanager import overlay_panel, theme
from vizmanager.connect import (
    E2G_PING,
    MAX_MSG,
    UI_MSG_PORT,
    UI_REG_PORT,
    pack_ad_reg,
    pack_ping,
    pack_redirect_viz,
    send_ankiconn_and,
)
from vizmanager.sensors import OverlaySettings
from vizmanager.session import Session
from vizmanager.udp import (
    ANKICONN,
    VIZ_PORT,
    UdpServer,
    bind_viz,
    host_ip_needs_picker,
    local_ipv4s,
)
from vizmanager.vision_http import set_viz_mode
from vizmanager.view2d import View2D, robot_marker_points_m
from vizmanager.view3d import (
    DRAW_OBJECTS_RATE_SEC,
    View3D,
    _MAX_ORBIT_VEL,
    _MIN_ORBIT_DT,
    _clamp_orbit_vel,
    _orbit_dt,
    _pan_axes,
)
from vizmanager.world import MM_TO_M, protocol_rgb

MIN_SIZE = (1280, 720)
DEFAULT_SIZE = (1680, 900)
TAB_3D, TAB_2D, TAB_MAP = 0, 1, 2
TAB_NAMES = ("3D", "2D", "Map")
CONNECT_TIMEOUT_S = 8.0
STALE_S = 2.0
PPS_WINDOW_S = 1.0
FIREWALL_WIN = (
    "New-NetFirewallRule -DisplayName 'Vector Viz' -Direction Inbound "
    "-Protocol UDP -LocalPort 5252,5200 -Action Allow"
)
STATUS_LIVE = "LIVE"
STATUS_DEGRADED = "DEGRADED"
STATUS_DISCONNECTED = "DISCONNECTED"
EMPTY_CAMERA = "No ImageChunk (enable VisionMode::Viz)"
EMPTY_MAP = "No MemoryMap tiles"
EMPTY_MAP_HINT = "Open WebViz NavMap to activate."
EMPTY_MAP_FRAME = "Once tiles activate press 'F' to centre on robot"
# STACK+STATE. HUD is 12px mono (~8 px/char). Splitter only resizes CAMERA|WORLD.
_RIGHT_W = 300 + 10 * 8
_CAM_MIN_W = 320
_CAM_DEFAULT_W = 640  # 100% bigger than the original 320px satellite
_WORLD_MIN_W = 320
_SPLITTER_W = 8
_TAB_H = 24
_PIP_D = 8


def pygame_available():
    try:
        import pygame  # noqa: F401
    except ImportError:
        return False
    return True


def build_parser():
    parser = argparse.ArgumentParser(
        description="Host VizManager — UDP Viz server on port 5252 (stock RedirectViz)"
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--robot", metavar="IP", help="robot LAN IP; stock RedirectViz via connect.py")
    mode.add_argument(
        "--listen-only",
        action="store_true",
        help="bind viz UDP only (no RedirectViz / no UI :5200)",
    )
    parser.add_argument("--host-ip", help="this host LAN IP (RedirectViz payload)")
    parser.add_argument("--bind", default="0.0.0.0", help="bind address (default 0.0.0.0)")
    parser.add_argument("--viz-port", type=int, default=VIZ_PORT)
    parser.add_argument("--ui-port", type=int, default=UI_MSG_PORT)
    return parser


def clamp_cam_w(width, cam_w, right_w=_RIGHT_W):
    """Keep CAMERA >= 320px and WORLD >= 320px at the current window width."""
    w = max(int(width), MIN_SIZE[0])
    max_cam = w - int(right_w) - _WORLD_MIN_W
    max_cam = max(_CAM_MIN_W, max_cam)
    return max(_CAM_MIN_W, min(int(cam_w), max_cam))


def letterbox_dest(frame_w, frame_h, pane):
    """Fit (frame_w, frame_h) inside pane (x, y, w, h). Returns (dest, scale).

    dest is (x, y, w, h) of the letterboxed image. Overlay image-pixels map
    through image_to_pane using this dest + scale.
    """
    px, py, pw, ph = pane
    if frame_w < 1 or frame_h < 1 or pw < 1 or ph < 1:
        return (px, py, max(1, pw), max(1, ph)), 1.0
    scale = min(pw / float(frame_w), ph / float(frame_h))
    nw = max(1, int(round(frame_w * scale)))
    nh = max(1, int(round(frame_h * scale)))
    dx = px + (pw - nw) // 2
    dy = py + (ph - nh) // 2
    return (dx, dy, nw, nh), scale


def image_to_pane(x, y, dest, scale):
    """Map JPEG-pixel (x, y) onto the letterboxed dest rect."""
    return dest[0] + x * scale, dest[1] + y * scale


def layout_rects(width, height, cam_w=None):
    """MASTER.md layout. Default CAMERA is 640px; drag the splitter to change.

    WORLD stays at least _WORLD_MIN_W. At DEFAULT_SIZE, WORLD is still the
    widest pane. Returns (x, y, w, h) tuples.
    """
    w = max(int(width), MIN_SIZE[0])
    h = max(int(height), MIN_SIZE[1])
    chrome_h = theme.CHROME_H
    log_h = theme.LOG_H_COLLAPSED
    body_top = chrome_h
    body_h = h - chrome_h - log_h
    right_w = _RIGHT_W
    wanted = _CAM_DEFAULT_W if cam_w is None else cam_w
    if w - right_w < _CAM_MIN_W + _WORLD_MIN_W:
        world_w = max(w // 2, _CAM_MIN_W + 1, right_w + 1)
        leftover = w - world_w
        right_w = min(_RIGHT_W, leftover // 2)
        if right_w < 220:
            right_w = leftover // 3
        cam_w = leftover - right_w
        if cam_w < 1:
            cam_w = 1
            world_w = w - cam_w - right_w
    else:
        cam_w = clamp_cam_w(w, wanted, right_w)
        world_w = w - cam_w - right_w
    tab_h = _TAB_H
    stack_h = body_h * 2 // 5
    state_h = body_h - stack_h
    split_x = cam_w - _SPLITTER_W // 2
    return {
        "window": (0, 0, w, h),
        "chrome": (0, 0, w, chrome_h),
        "camera": (0, body_top, cam_w, body_h),
        "splitter": (split_x, body_top, _SPLITTER_W, body_h),
        "world": (cam_w, body_top, world_w, body_h),
        "world_tabs": (cam_w, body_top, world_w, tab_h),
        "world_view": (cam_w, body_top + tab_h, world_w, body_h - tab_h),
        "stack": (cam_w + world_w, body_top, right_w, stack_h),
        "state": (cam_w + world_w, body_top + stack_h, right_w, state_h),
        "log": (0, h - log_h, w, log_h),
    }


def status_for(handshakes, recent_pps, has_frame, last_pkt_age):
    """LIVE / DEGRADED / DISCONNECTED — never color-only (caller draws pip + word)."""
    connected = handshakes > 0 or recent_pps > 0
    if not connected:
        return STATUS_DISCONNECTED
    stale = last_pkt_age is None or last_pkt_age > STALE_S
    if has_frame and not stale and recent_pps > 0:
        return STATUS_LIVE
    return STATUS_DEGRADED


def map_robot_pts(world, width, height, origin_x=0.0, origin_y=0.0):
    """Screen pixels of the SetRobot triangle in MemoryMap space (1 mm = 1 px)."""
    pts_m = robot_marker_points_m(world)
    if not pts_m:
        return ()
    cx = 0.5 * width
    cy = 0.5 * height
    out = []
    for x_m, y_m in pts_m:
        x_mm = x_m / MM_TO_M
        y_mm = y_m / MM_TO_M
        sx = int(round(x_mm + cx + origin_x))
        sy = int(round(-y_mm + cy + origin_y))
        out.append((sx, sy))
    return tuple(out)


def map_path_highlight_pts(
    world, width, height, origin_x=0.0, origin_y=0.0, settings=None, robot_state=None
):
    """Screen pixels of the active path segment (1 mm = 1 px). Empty if none."""
    if settings is None:
        settings = OverlaySettings()
    if not settings.path_highlight or robot_state is None:
        return ()
    curr = robot_state.state.currPathSegment
    if curr < 0:
        return ()
    cx = 0.5 * width
    cy = 0.5 * height
    out = []
    for path in world.paths.values():
        strip = path.segment_polyline_m(curr)
        if not strip:
            continue
        pts = []
        for p in strip:
            x_m, y_m, _z = world.apply_origin(*p)
            x_mm = x_m / MM_TO_M
            y_mm = y_m / MM_TO_M
            sx = int(round(x_mm + cx + origin_x))
            sy = int(round(-y_mm + cy + origin_y))
            pts.append((sx, sy))
        if len(pts) >= 2:
            out.append(tuple(pts))
    return tuple(out)


def map_grid_lines(width, height, origin_x=0.0, origin_y=0.0, step_mm=50):
    """Axis-aligned grid in MemoryMap space: 1 mm = 1 px, origin at pane center.

    `origin_x` / `origin_y` are pan offsets in the same pixel/mm units as
    `World.fill_rects` (Y already flipped).
    """
    step = float(step_mm)
    if step <= 0:
        return ()
    cx = 0.5 * width + origin_x
    cy = 0.5 * height + origin_y
    lines = []
    x = cx % step
    if x < 0:
        x += step
    while x <= width + 1e-9:
        lines.append(((int(round(x)), 0), (int(round(x)), int(height))))
        x += step
    y = cy % step
    if y < 0:
        y += step
    while y <= height + 1e-9:
        lines.append(((0, int(round(y))), (int(width), int(round(y)))))
        y += step
    return tuple(lines)


def connect_error_message(host_ip, viz_port=VIZ_PORT, ui_port=UI_MSG_PORT):
    """Cause + recovery under the IP field (firewall 5103 / 5252 / 5200)."""
    host = host_ip or "YOUR_HOST_LAN_IP"
    robot_fix = (
        "iptables -I INPUT -p udp --dport {0} -s {1} -j ACCEPT".format(UI_REG_PORT, host)
    )
    return (
        "Robot did not register UI — allow UDP {0} on the robot ({1}). "
        "This host must allow UDP {2}+{3} inbound (Windows: {4}). Bind 0.0.0.0."
    ).format(UI_REG_PORT, robot_fix, viz_port, ui_port, FIREWALL_WIN)


def _valid_ipv4(text):
    parts = text.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(0 <= int(p) <= 255 for p in parts)
    except ValueError:
        return False


def _recvfrom(sock):
    try:
        return sock.recvfrom(MAX_MSG)
    except (socket.timeout, BlockingIOError, InterruptedError):
        return None
    except OSError as exc:
        if exc.errno in (errno.EAGAIN, errno.EWOULDBLOCK):
            return None
        raise


class Redirector:
    """Non-blocking stock RedirectViz. Uses connect.py packers; does not own viz :5252.

    connect.run() is blocking and binds viz+UI; the app polls the same path with
    select so Session can keep the Viz UDP server.
    """

    def __init__(self, robot, host_ip, bind_addr, ui_port):
        self.robot = robot
        self.host_ip = host_ip
        self.ui_port = ui_port
        self.ui = bind_viz(bind_addr, ui_port)
        self.ui.settimeout(0)
        self.reg = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.reg.settimeout(0.2)
        self.dest_reg = (robot, UI_REG_PORT)
        self.engine_ui = None
        self.redirected = False
        self.connecting = True
        self.error = None
        self.error_dismissed = False
        self.t0 = time.time()
        self.last_reg = 0.0
        self.last_ping = 0.0
        self.ping_n = 0

    def fileno(self):
        return self.ui.fileno()

    def poll(self, now):
        if self.engine_ui is None and now - self.last_reg > 0.15:
            try:
                send_ankiconn_and(
                    self.reg, self.dest_reg, pack_ad_reg(self.host_ip, self.ui_port)
                )
            except OSError as exc:
                self.error = "reg send failed: {0}".format(exc)
            self.last_reg = now

        got = _recvfrom(self.ui)
        while got is not None:
            data, addr = got
            if data == ANKICONN:
                self.engine_ui = addr
                self.connecting = False
                self.error = None
                if not self.redirected:
                    pkt = pack_redirect_viz(self.host_ip)
                    try:
                        self.ui.sendto(pkt, addr)
                        self.redirected = True
                    except OSError as exc:
                        self.error = "RedirectViz send failed: {0}".format(exc)
            elif data and data[0] == E2G_PING and len(data) >= 14:
                counter, tsent, _is_resp = struct.unpack_from("<IdB", data, 1)
                if self.engine_ui is None:
                    self.engine_ui = addr
                    self.connecting = False
                    self.error = None
                try:
                    self.ui.sendto(pack_ping(counter, tsent, True), addr)
                except OSError:
                    pass
            got = _recvfrom(self.ui)

        if self.engine_ui is not None and now - self.last_ping > 1.0:
            self.ping_n += 1
            try:
                self.ui.sendto(
                    pack_ping(self.ping_n, now * 1000.0, True), self.engine_ui
                )
            except OSError:
                pass
            self.last_ping = now

        if self.connecting and now - self.t0 >= CONNECT_TIMEOUT_S:
            self.connecting = False
            if self.engine_ui is None and not self.error_dismissed:
                self.error = connect_error_message(self.host_ip)

    def dismiss_error(self):
        """Esc: drop the banner; do not re-latch a dismissed timeout."""
        self.error = None
        self.error_dismissed = True

    def close(self):
        for sock in (self.ui, self.reg):
            if sock is None:
                continue
            try:
                sock.close()
            except OSError:
                pass
        self.ui = None
        self.reg = None


def _project_point(x, y, z, view3d, width, height):
    az = view3d.azimuth
    el = view3d.elevation
    right, cam_up = _pan_axes(az, el)
    cel = math.cos(math.radians(el))
    sel = math.sin(math.radians(el))
    saz = math.sin(math.radians(az))
    caz = math.cos(math.radians(az))
    forward = (-cel * saz, cel * caz, -sel)
    cx, cy, cz = view3d.center
    dist = max(view3d.distance, 0.05)
    eye = (cx - forward[0] * dist, cy - forward[1] * dist, cz - forward[2] * dist)
    px, py, pz = x - eye[0], y - eye[1], z - eye[2]
    cam_x = px * right[0] + py * right[1] + pz * right[2]
    cam_y = px * cam_up[0] + py * cam_up[1] + pz * cam_up[2]
    cam_z = px * forward[0] + py * forward[1] + pz * forward[2]
    if cam_z <= 0.02:
        return None
    f = (0.5 * height) / math.tan(math.radians(22.5))
    sx = 0.5 * width + cam_x * f / cam_z
    sy = 0.5 * height - cam_y * f / cam_z
    return (int(round(sx)), int(round(sy)))


class VizApp:
    def __init__(self, args):
        self.args = args
        self.listen_only = bool(args.listen_only)
        self.robot_ip = args.robot or ""
        self._lan_ips = local_ipv4s()
        self.host_ip = args.host_ip or (self._lan_ips[0] if self._lan_ips else "")
        self.host_text = self.host_ip
        self.host_focused = False
        self.show_host_field = host_ip_needs_picker(self._lan_ips, args.host_ip)
        self._viz_http_enabled = False
        self._viz_http_tried = False
        self._viz_http_error = None
        self.bind_addr = args.bind or "0.0.0.0"
        self.viz_port = int(args.viz_port)
        self.ui_port = int(args.ui_port)
        self.session = Session()
        self.view2d = View2D(self.session.world)
        self.view3d = View3D(self.session.world)
        self.tab = TAB_3D
        self.cam_w = _CAM_DEFAULT_W
        self.render_paused = False
        self.ip_text = self.robot_ip
        self.ip_focused = False
        self.connect_error = None
        self.last_error = ""
        if self.show_host_field and self._lan_ips:
            self.last_error = "host IPv4 candidates: {0}".format(
                ", ".join(self._lan_ips)
            )
        self.viz = None
        self.redirector = None
        self._pkt_times = []
        self._last_pkt_t = None
        self._last_draw = {"camera": None, "world": None, "camera_frame": None}
        self._fonts = {}
        self._drag = None
        self._split_drag = False
        self._splitter_hover = False
        self._cam_bytes = None
        self._mesh_cache = None
        self._mesh_cache_t = None
        self._map_ox = 0.0
        self._map_oy = 0.0
        self._az_vel = 0.0
        self._el_vel = 0.0
        self._orbit_t = None
        self.overlays = OverlaySettings()
        self._overlay_focus = 0

    def pps(self, now=None):
        now = time.time() if now is None else now
        cutoff = now - PPS_WINDOW_S
        self._pkt_times = [t for t in self._pkt_times if t >= cutoff]
        return float(len(self._pkt_times))

    def status(self):
        now = time.time()
        age = None if self._last_pkt_t is None else now - self._last_pkt_t
        has_frame = self.session.overlay.frame is not None
        return status_for(self.session.handshakes, self.pps(now), has_frame, age)

    def bind_viz(self):
        try:
            self.viz = UdpServer.bind(self.bind_addr, self.viz_port)
            self.viz.sock.settimeout(0)
        except OSError as exc:
            self.viz = None
            self.last_error = "Could not bind UDP {0}: {1}".format(self.viz_port, exc)
            self.connect_error = self.last_error
            return False
        return True

    def start_connect(self):
        robot = self.ip_text.strip()
        if not _valid_ipv4(robot):
            self.connect_error = "Enter a robot IPv4"
            self.last_error = self.connect_error
            return
        if self.show_host_field:
            host = self.host_text.strip()
            if not _valid_ipv4(host):
                self.connect_error = (
                    "Enter a host IPv4 the robot can ping (not VPN/Hyper-V/WSL)"
                )
                self.last_error = self.connect_error
                return
            self.host_ip = host
        if not self.host_ip:
            self.connect_error = "need --host-ip (no LAN IPv4 found)"
            self.last_error = self.connect_error
            return
        self.stop_connect()
        self._viz_http_tried = False
        self._viz_http_error = None
        self.robot_ip = robot
        self.ip_text = robot
        try:
            self.redirector = Redirector(
                robot, self.host_ip, self.bind_addr, self.ui_port
            )
        except OSError as exc:
            self.connect_error = "Could not bind UDP {0}: {1}".format(self.ui_port, exc)
            self.last_error = self.connect_error
            self.redirector = None
            return
        self.connect_error = None

    def stop_connect(self):
        self._disable_viz_http()
        if self.redirector is not None:
            self.redirector.close()
            self.redirector = None

    def _disable_viz_http(self):
        if not self._viz_http_enabled:
            return
        robot = self.robot_ip
        self._viz_http_enabled = False
        if robot:
            set_viz_mode(robot, False)

    def _maybe_enable_viz_http(self):
        if self._viz_http_tried or self.redirector is None:
            return
        if not self.redirector.redirected:
            return
        self._viz_http_tried = True
        err = set_viz_mode(self.robot_ip, True)
        if err:
            self._viz_http_error = err
            self.connect_error = (
                "VisionMode::Viz HTTP failed on :8888 — CAMERA stays empty. {0}".format(
                    err
                )
            )
            self.last_error = self.connect_error
            return
        self._viz_http_enabled = True
        self._viz_http_error = None

    def connecting(self):
        return self.redirector is not None and self.redirector.connecting

    def apply_splitter_x(self, x, window_w):
        """Set CAMERA width from the splitter's window-x (drag)."""
        self.cam_w = clamp_cam_w(window_w, int(x))

    def reset_cam_w(self):
        self.cam_w = _CAM_DEFAULT_W

    def _layout(self, size):
        return layout_rects(size[0], size[1], cam_w=self.cam_w)

    def drain(self, timeout=0.0):
        socks = []
        if self.viz is not None and self.viz.sock is not None:
            socks.append(self.viz.sock)
        if self.redirector is not None and self.redirector.ui is not None:
            socks.append(self.redirector.ui)
        if socks:
            try:
                select.select(socks, [], [], timeout)
            except (ValueError, OSError):
                pass
        now = time.time()
        if self.viz is not None:
            while True:
                got = _recvfrom(self.viz.sock)
                if got is None:
                    break
                data, addr = got
                self.session.process_datagram(data, addr)
                self._pkt_times.append(now)
                self._last_pkt_t = now
        if self.redirector is not None:
            self.redirector.poll(now)
            if self.redirector.error:
                self.connect_error = self.redirector.error
                self.last_error = self.redirector.error
            elif self.redirector.engine_ui is not None and not self._viz_http_error:
                self.connect_error = None
            self._maybe_enable_viz_http()

    def dismiss_connect_error(self):
        self.connect_error = None
        if self.redirector is not None:
            self.redirector.dismiss_error()

    def close(self):
        self.stop_connect()
        if self.viz is not None:
            self.viz.close()
            self.viz = None

    def run(self):
        if not self.bind_viz() and not pygame_available():
            print(self.last_error, file=sys.stderr)
            return 1
        if not self.listen_only and self.robot_ip:
            self.ip_text = self.robot_ip
            self.start_connect()
        if pygame_available():
            return self._run_pygame()
        return self._run_headless()

    def _run_headless(self):
        mode = "listen-only" if self.listen_only else "robot {0}".format(self.robot_ip)
        print("vizmanager {0}  UDP {1}:{2}".format(mode, self.bind_addr, self.viz_port))
        if not self.listen_only:
            print("ui  listen   UDP {0}:{1}".format(self.bind_addr, self.ui_port))
            print("registering  {0}:{1}  host_ip={2}".format(
                self.robot_ip, UI_REG_PORT, self.host_ip
            ))
        print("need inbound THIS host: UDP {0} (viz)".format(self.viz_port), end="")
        if not self.listen_only:
            print(" and UDP {0} (engine UI)".format(self.ui_port))
            print("need inbound ROBOT:     UDP {0}".format(UI_REG_PORT))
            print("Windows: {0}".format(FIREWALL_WIN))
        else:
            print()
            print("Windows: {0}".format(FIREWALL_WIN))
        print("ctrl-c to stop")
        last = 0.0
        try:
            while True:
                self.drain(0.25)
                now = time.time()
                if now - last >= 1.0:
                    print(
                        "{0:.1f} pkt/s  packets={1} handshakes={2}  {3}".format(
                            self.pps(now),
                            self.session.packets,
                            self.session.handshakes,
                            self.status(),
                        )
                    )
                    if self.connect_error:
                        print(self.connect_error)
                    last = now
        except KeyboardInterrupt:
            print()
        finally:
            self.close()
        return 0 if self.session.handshakes else 1

    def _run_pygame(self):
        import pygame

        pygame.init()
        pygame.display.set_caption("VizManager")
        screen = pygame.display.set_mode(DEFAULT_SIZE, pygame.RESIZABLE)
        clock = pygame.time.Clock()
        running = True
        try:
            while running:
                for event in pygame.event.get():
                    if event.type == pygame.QUIT:
                        running = False
                    else:
                        self._handle_event(event, screen.get_size())
                self.drain(0.0)
                size = screen.get_size()
                if size[0] < MIN_SIZE[0] or size[1] < MIN_SIZE[1]:
                    screen = pygame.display.set_mode(
                        (max(size[0], MIN_SIZE[0]), max(size[1], MIN_SIZE[1])),
                        pygame.RESIZABLE,
                    )
                self._draw(screen)
                pygame.display.flip()
                clock.tick(30)
        finally:
            self.close()
            pygame.quit()
        return 0

    def _handle_event(self, event, size):
        import pygame

        rects = self._layout(size)
        if event.type == pygame.MOUSEBUTTONDOWN:
            self._on_mouse_down(event, rects)
        elif event.type == pygame.MOUSEBUTTONUP:
            self._drag = None
            self._split_drag = False
            self._orbit_t = time.monotonic()
        elif event.type == pygame.MOUSEMOTION:
            self._on_mouse_move(event, rects)
        elif event.type == pygame.MOUSEWHEEL:
            self._on_wheel(event, rects)
        elif event.type == pygame.TEXTINPUT and (self.ip_focused or self.host_focused):
            target = "host" if self.host_focused else "robot"
            text = self.host_text if target == "host" else self.ip_text
            for ch in event.text:
                if ch in "0123456789." and len(text) < 15:
                    text += ch
            if target == "host":
                self.host_text = text
            else:
                self.ip_text = text
        elif event.type == pygame.KEYDOWN:
            self._on_key(event)

    def _on_key(self, event):
        import pygame

        if event.key == pygame.K_ESCAPE:
            if overlay_panel.close_if_open(self.overlays):
                return
            if self.ip_focused or self.host_focused:
                self.ip_focused = False
                self.host_focused = False
            else:
                self.dismiss_connect_error()
            return
        if self.ip_focused or self.host_focused:
            if event.key == pygame.K_BACKSPACE:
                if self.host_focused:
                    self.host_text = self.host_text[:-1]
                else:
                    self.ip_text = self.ip_text[:-1]
            elif event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                self.ip_focused = False
                self.host_focused = False
                self.start_connect()
            return
        if event.key == pygame.K_o:
            overlay_panel.toggle_open(self.overlays)
            if self.overlays.panel_open:
                self._overlay_focus = 0
            return
        if self.overlays.panel_open:
            if event.key == pygame.K_UP:
                self._overlay_focus = overlay_panel.move_focus(self._overlay_focus, -1)
                return
            if event.key == pygame.K_DOWN:
                self._overlay_focus = overlay_panel.move_focus(self._overlay_focus, 1)
                return
            if event.key in (pygame.K_SPACE, pygame.K_RETURN, pygame.K_KP_ENTER):
                overlay_panel.toggle_index(self.overlays, self._overlay_focus)
                return
        if event.key == pygame.K_h and self.show_host_field and self._lan_ips:
            cur = self.host_text.strip()
            try:
                idx = self._lan_ips.index(cur)
            except ValueError:
                idx = -1
            self.host_text = self._lan_ips[(idx + 1) % len(self._lan_ips)]
            self.host_ip = self.host_text
            return
        if event.key in (pygame.K_1, pygame.K_KP1):
            self.tab = TAB_3D
        elif event.key in (pygame.K_2, pygame.K_KP2):
            self.tab = TAB_2D
        elif event.key in (pygame.K_3, pygame.K_KP3):
            self.tab = TAB_MAP
        elif event.key == pygame.K_f:
            self.view2d.frame_robot()
            self.view2d.follow_robot = True
            self.view3d.frame_robot()
            self._frame_map()
        elif event.key == pygame.K_SPACE:
            self.render_paused = not self.render_paused

    def _chrome_widgets(self, rects):
        cx, cy, cw, ch = rects["chrome"]
        pad = theme.SPACE[1]
        pip_x = cx + pad
        word_x = pip_x + _PIP_D + pad
        field_x = word_x + 110
        field_w = 140 if self.show_host_field else 168
        field_h = theme.CONTROL_H
        field_y = cy + (ch - field_h) // 2
        hit_h = max(32, field_h)
        hit_y = cy + (ch - hit_h) // 2
        btn_w = 108
        btn_h = ch
        btn_x = cx + cw - btn_w
        disc_w = 84
        host_x = field_x + field_w + pad
        host_w = field_w if self.show_host_field else 0
        ov_w = 84
        disc_x = btn_x - disc_w
        ov_x = disc_x - ov_w
        pps_x = host_x + host_w + pad if self.show_host_field else field_x + field_w + pad
        pps_w = 70 if self.show_host_field else 90
        max_pps_w = ov_x - pps_x - pad
        if pps_w > max_pps_w:
            pps_w = max(0, max_pps_w)
        return {
            "pip": (pip_x, cy + (ch - _PIP_D) // 2, _PIP_D, _PIP_D),
            "word": (word_x, cy, 110, ch),
            "ip": (field_x, field_y, field_w, field_h),
            "ip_hit": (field_x, hit_y, field_w, hit_h),
            "host": (host_x, field_y, host_w, field_h),
            "host_hit": (host_x, hit_y, host_w, hit_h),
            "pps": (pps_x, cy, pps_w, ch),
            "overlays": (ov_x, cy, ov_w, ch),
            "disconnect": (disc_x, cy, disc_w, ch),
            "connect": (btn_x, cy, btn_w, btn_h),
        }

    def _on_mouse_down(self, event, rects):
        widgets = self._chrome_widgets(rects)
        pos = event.pos
        self.ip_focused = _hit(widgets["ip_hit"], pos)
        self.host_focused = bool(
            self.show_host_field and widgets["host_hit"][2] > 0 and _hit(widgets["host_hit"], pos)
        )
        if self.host_focused:
            self.ip_focused = False
        if event.button == 1 and _hit(rects["splitter"], pos):
            if getattr(event, "clicks", 1) >= 2:
                self.reset_cam_w()
                self._split_drag = False
                return
            self._split_drag = True
            self.apply_splitter_x(pos[0], rects["window"][2])
            return
        if event.button == 1 and _hit(widgets["connect"], pos):
            if not self.connecting():
                self.start_connect()
            return
        if event.button == 1 and _hit(widgets["disconnect"], pos):
            if self.redirector is not None and not self.connecting():
                self.stop_connect()
            return
        if event.button == 1 and _hit(widgets["overlays"], pos):
            overlay_panel.toggle_open(self.overlays)
            if self.overlays.panel_open:
                self._overlay_focus = 0
            return
        if self.overlays.panel_open:
            view = rects["world_view"]
            if overlay_panel.hit_panel(pos, view):
                if event.button == 1:
                    field = overlay_panel.hit_checkbox(pos, view)
                    if field:
                        overlay_panel.toggle_field(self.overlays, field)
                        self._overlay_focus = overlay_panel.CHECKBOX_FIELDS.index(field)
                return
            if event.button == 1 and _hit(rects["world"], pos):
                self.overlays.panel_open = False
                return
        tabs = rects["world_tabs"]
        if event.button == 1 and _hit(tabs, pos):
            tw = tabs[2] // 3
            idx = min(2, max(0, (pos[0] - tabs[0]) // max(tw, 1)))
            self.tab = idx
            return
        view = rects["world_view"]
        if _hit(view, pos) and event.button in (1, 2, 3):
            import pygame

            mods = pygame.key.get_mods()
            pan = event.button in (2, 3) or bool(mods & pygame.KMOD_SHIFT)
            self._drag = (pos, pan)
            self._orbit_t = time.monotonic()
            if self.tab == TAB_3D:
                self._az_vel = 0.0
                self._el_vel = 0.0

    def _on_mouse_move(self, event, rects):
        import pygame

        if self.overlays.panel_open and not self._drag and not self._split_drag:
            idx = overlay_panel.row_index_at(event.pos, rects["world_view"])
            if idx is not None:
                self._overlay_focus = idx
        hover = _hit(rects["splitter"], event.pos)
        self._splitter_hover = hover or self._split_drag
        try:
            if self._splitter_hover:
                pygame.mouse.set_cursor(pygame.SYSTEM_CURSOR_SIZEWE)
            else:
                pygame.mouse.set_cursor(pygame.SYSTEM_CURSOR_ARROW)
        except Exception:
            pass
        if self._split_drag:
            self.apply_splitter_x(event.pos[0], rects["window"][2])
            return
        drag = self._drag
        if not drag:
            return
        if hasattr(event, "buttons") and not any(event.buttons):
            self._drag = None
            return
        (lx, ly), pan = drag
        x, y = event.pos
        dx, dy = x - lx, y - ly
        self._drag = ((x, y), pan)
        now = time.monotonic()
        raw_dt = now - self._orbit_t if self._orbit_t is not None else _MIN_ORBIT_DT
        self._orbit_t = now
        dt = _orbit_dt(raw_dt)
        if self.tab == TAB_3D:
            if pan:
                s = 0.002 * self.view3d.distance
                right, cam_up = _pan_axes(self.view3d.azimuth, self.view3d.elevation)
                cx, cy, cz = self.view3d.center
                self.view3d.center = (
                    cx - s * dx * right[0] + s * dy * cam_up[0],
                    cy - s * dx * right[1] + s * dy * cam_up[1],
                    cz - s * dx * right[2] + s * dy * cam_up[2],
                )
                self._az_vel = 0.0
                self._el_vel = 0.0
            else:
                daz = -dx * 0.4
                delv = dy * 0.4
                self.view3d.azimuth = (self.view3d.azimuth + daz) % 360.0
                self.view3d.elevation = max(
                    -89.0, min(89.0, self.view3d.elevation + delv)
                )
                self._az_vel = _clamp_orbit_vel(daz / dt)
                self._el_vel = _clamp_orbit_vel(delv / dt)
        elif self.tab == TAB_2D:
            self.view2d.follow_robot = False
            self.view2d.center_x -= dx / max(self.view2d.ppm, 1.0)
            self.view2d.center_y += dy / max(self.view2d.ppm, 1.0)
        elif self.tab == TAB_MAP:
            self._map_ox += dx
            self._map_oy += dy

    def _on_wheel(self, event, rects):
        pos = getattr(event, "pos", None)
        if pos is None:
            import pygame

            pos = pygame.mouse.get_pos()
        if not _hit(rects["world_view"], pos):
            return
        if self.overlays.panel_open and overlay_panel.hit_panel(pos, rects["world_view"]):
            return
        dy = getattr(event, "y", 0)
        if self.tab == TAB_3D:
            factor = math.pow(0.9, dy)
            self.view3d.distance = max(0.05, min(50.0, self.view3d.distance * factor))
        elif self.tab == TAB_2D:
            factor = math.pow(1.1, dy)
            self.view2d.ppm = max(20.0, min(800.0, self.view2d.ppm * factor))

    def _font(self, pg, kind):
        key = kind
        if key in self._fonts:
            return self._fonts[key]
        if kind == "ui":
            names, size = (theme.FONT_UI, "DejaVu Sans", "Segoe UI"), theme.FONT_CHROME_PX
        elif kind == "label":
            names, size = (theme.FONT_UI, "DejaVu Sans"), theme.FONT_LABEL_PX
        elif kind == "log":
            names, size = (
                (theme.FONT_MONO, "DejaVu Sans Mono", "Consolas"),
                theme.FONT_LABEL_PX,
            )
        elif kind == "overlay":
            names, size = (
                (theme.FONT_MONO, "DejaVu Sans Mono", "Consolas"),
                theme.FONT_HUD_PX,
            )
        else:
            names, size = (
                (theme.FONT_MONO, "DejaVu Sans Mono", "Consolas"),
                theme.FONT_HUD_PX,
            )
        font = None
        for name in names:
            path = pg.font.match_font(name)
            if path:
                font = pg.font.Font(path, size)
                break
        if font is None:
            font = pg.font.Font(None, size)
        self._fonts[key] = font
        return font

    def _draw(self, screen):
        import pygame

        rects = self._layout(screen.get_size())
        self._coast_orbit()
        screen.fill(theme.BG_VOID)
        self._draw_chrome(screen, rects)
        self._draw_camera(screen, rects)
        self._draw_world(screen, rects)
        self._draw_stack_state(screen, rects)
        self._draw_log(screen, rects)
        if self.connect_error:
            self._draw_connect_error(screen, rects)
        if self.overlays.panel_open:
            overlay_panel.draw(
                screen,
                self._font(pygame, "ui"),
                self._font(pygame, "label"),
                self.overlays,
                rects["world_view"],
                self._overlay_focus,
            )

    def _draw_chrome(self, screen, rects):
        import pygame

        pg = pygame
        chrome = pygame.Rect(rects["chrome"])
        pg.draw.rect(screen, theme.BG_BASE, chrome)
        pg.draw.line(
            screen, theme.BORDER, chrome.bottomleft, chrome.bottomright, 1
        )
        widgets = self._chrome_widgets(rects)
        status = self.status()
        pip = pygame.Rect(widgets["pip"])
        if status == STATUS_LIVE:
            pg.draw.circle(screen, theme.LIVE, pip.center, _PIP_D // 2)
        elif status == STATUS_DEGRADED:
            pg.draw.circle(screen, theme.WARN, pip.center, _PIP_D // 2)
            cover = pygame.Rect(pip.centerx, pip.y, pip.w, pip.h)
            pg.draw.rect(screen, theme.BG_BASE, cover)
            pg.draw.circle(screen, theme.WARN, pip.center, _PIP_D // 2, 1)
        else:
            pg.draw.circle(screen, theme.DANGER, pip.center, _PIP_D // 2, 1)
        ui = self._font(pg, "ui")
        word = ui.render(status, True, theme.TEXT)
        screen.blit(word, (widgets["word"][0], chrome.y + (chrome.h - word.get_height()) // 2))

        ip_rect = pygame.Rect(widgets["ip"])
        pg.draw.rect(screen, theme.BG_ELEVATED, ip_rect)
        pg.draw.rect(screen, theme.BORDER, ip_rect, 1)
        if self.ip_focused:
            pg.draw.rect(screen, theme.ACCENT, ip_rect.inflate(4, 4), 2)
        shown = self.ip_text or "robot IPv4"
        ip_col = theme.TEXT if self.ip_text else theme.TEXT_MUTED
        ip_img = ui.render(shown[:15], True, ip_col)
        screen.blit(ip_img, (ip_rect.x + 6, ip_rect.y + (ip_rect.h - ip_img.get_height()) // 2))

        if self.show_host_field:
            host_rect = pygame.Rect(widgets["host"])
            pg.draw.rect(screen, theme.BG_ELEVATED, host_rect)
            pg.draw.rect(screen, theme.BORDER, host_rect, 1)
            if self.host_focused:
                pg.draw.rect(screen, theme.ACCENT, host_rect.inflate(4, 4), 2)
            host_shown = self.host_text or "host IPv4"
            host_col = theme.TEXT if self.host_text else theme.TEXT_MUTED
            host_img = ui.render(host_shown[:15], True, host_col)
            screen.blit(
                host_img,
                (host_rect.x + 6, host_rect.y + (host_rect.h - host_img.get_height()) // 2),
            )

        pps_txt = "{0:.0f} pps".format(self.pps())
        if self.render_paused:
            pps_txt = pps_txt + "  PAUSED"
        pps_img = ui.render(pps_txt, True, theme.WARN if self.render_paused else theme.TEXT_MUTED)
        screen.blit(
            pps_img,
            (widgets["pps"][0], chrome.y + (chrome.h - pps_img.get_height()) // 2),
        )

        ov_lab = ui.render("Overlays", True, theme.TEXT_MUTED)
        ov_r = pygame.Rect(widgets["overlays"])
        screen.blit(
            ov_lab, (ov_r.x + 8, ov_r.y + (ov_r.h - ov_lab.get_height()) // 2)
        )

        if self.redirector is not None and not self.connecting():
            disc = ui.render("Disconnect", True, theme.TEXT_MUTED)
            dr = pygame.Rect(widgets["disconnect"])
            screen.blit(
                disc, (dr.x + 8, dr.y + (dr.h - disc.get_height()) // 2)
            )

        btn = pygame.Rect(widgets["connect"])
        connecting = self.connecting()
        disabled = connecting
        pg.draw.rect(screen, theme.BG_ELEVATED if disabled else theme.ACCENT_DIM, btn)
        label = "Connecting..." if connecting else "Connect"
        col = theme.TEXT_MUTED if disabled else theme.TEXT
        lab = ui.render(label, True, col)
        screen.blit(lab, lab.get_rect(center=btn.center))
        if not disabled:
            pg.draw.rect(screen, theme.ACCENT, btn, 2)

    def _draw_connect_error(self, screen, rects):
        import pygame

        widgets = self._chrome_widgets(rects)
        ip = pygame.Rect(widgets["ip"])
        font = self._font(pygame, "log")
        text = self.connect_error
        # wrap under the IP field
        max_w = rects["chrome"][2] - ip.x - theme.SPACE[1]
        lines = _wrap(font, text, max_w)
        y = theme.CHROME_H + 2
        pad = theme.SPACE[0]
        h = pad * 2 + len(lines) * (font.get_height() + 2)
        box = pygame.Rect(
            ip.x, y, min(max_w, rects["chrome"][2] - ip.x - theme.SPACE[1]), h
        )
        pygame.draw.rect(screen, theme.BG_ELEVATED, box)
        pygame.draw.rect(screen, theme.DANGER, box, 1)
        ty = box.y + pad
        for line in lines:
            img = font.render(line, True, theme.DANGER)
            screen.blit(img, (box.x + pad, ty))
            ty += font.get_height() + 2

    def _draw_camera(self, screen, rects):
        import pygame

        r = pygame.Rect(rects["camera"])
        pygame.draw.rect(screen, theme.BG_VOID, r)
        pygame.draw.rect(screen, theme.BORDER, r, 1)
        overlay = self.session.overlay
        if self.render_paused:
            frame = self._last_draw.get("camera_frame")
            texts = self._last_draw.get("camera_texts") or ()
            info = self._last_draw.get("camera_info") or (0, "", "")
        else:
            frame = overlay.frame
            texts = list(overlay.texts)
            info = (overlay.info_timestamp, overlay.info_exp, overlay.info_awb)
            self._last_draw["camera_frame"] = frame
            self._last_draw["camera_texts"] = texts
            self._last_draw["camera_info"] = info
        dest = None
        scale = 1.0
        if frame is None:
            self._centered(screen, r, EMPTY_CAMERA, theme.TEXT_MUTED)
        else:
            try:
                import numpy as np
            except ImportError:
                self._centered(screen, r, EMPTY_CAMERA, theme.TEXT_MUTED)
                np = None
            if np is not None:
                arr = np.ascontiguousarray(frame)
                h, w = arr.shape[0], arr.shape[1]
                if h < 1 or w < 1:
                    self._centered(screen, r, EMPTY_CAMERA, theme.TEXT_MUTED)
                else:
                    self._cam_bytes = arr.tobytes()
                    src = pygame.image.frombuffer(self._cam_bytes, (w, h), "RGB")
                    dest, scale = letterbox_dest(w, h, (r.x, r.y, r.w, r.h))
                    scaled = pygame.transform.smoothscale(src, (dest[2], dest[3]))
                    screen.blit(scaled, dest[:2])
                    self._draw_camera_overlays(screen, dest, scale, texts, info)
        self._draw_splitter(screen, rects)

    def _draw_splitter(self, screen, rects):
        import pygame

        seam = rects["camera"][2]
        y = rects["camera"][1]
        h = rects["camera"][3]
        color = theme.ACCENT if self._splitter_hover else theme.BORDER
        pygame.draw.line(screen, color, (seam, y), (seam, y + h), 1)

    def _blit_overlay_text(self, screen, font, text, pos, color):
        """12px HUD type with a 1px drop shadow (Webots drawText). pos is top-left."""
        if not text:
            return
        x, y = int(round(pos[0])), int(round(pos[1]))
        shadow = font.render(text, True, theme.BG_VOID)
        glyph = font.render(text, True, color)
        screen.blit(shadow, (x + 1, y + 1))
        screen.blit(glyph, (x, y))

    def _draw_camera_overlays(self, screen, dest, scale, texts, info):
        import pygame

        font = self._font(pygame, "overlay")
        for item in texts:
            px, py = image_to_pane(item.x, item.y, dest, scale)
            self._blit_overlay_text(screen, font, item.text, (px, py), item.rgb)
        ts, exp_text, awb_text = info
        pad = theme.SPACE[0]
        line_h = font.get_height()
        dx, dy, dw, dh = dest
        if ts or exp_text or awb_text:
            self._blit_overlay_text(
                screen,
                font,
                str(ts),
                (dx + pad, dy + dh - pad - line_h),
                theme.DANGER,
            )
            if exp_text:
                img_w = font.size(exp_text)[0]
                self._blit_overlay_text(
                    screen,
                    font,
                    exp_text,
                    (dx + dw - pad - img_w, dy + dh - pad - line_h),
                    theme.DANGER,
                )
            if awb_text:
                img_w = font.size(awb_text)[0]
                self._blit_overlay_text(
                    screen,
                    font,
                    awb_text,
                    (dx + dw - pad - img_w, dy + dh - pad - 2 * line_h),
                    theme.DANGER,
                )

    def _draw_world(self, screen, rects):
        import pygame

        tabs = pygame.Rect(rects["world_tabs"])
        view = pygame.Rect(rects["world_view"])
        pygame.draw.rect(screen, theme.BG_PANEL, tabs)
        pygame.draw.rect(screen, theme.BG_VOID, view)
        pygame.draw.rect(screen, theme.BORDER, pygame.Rect(rects["world"]), 1)
        ui = self._font(pygame, "ui")
        tw = tabs.w // 3
        for i, name in enumerate(TAB_NAMES):
            tr = pygame.Rect(tabs.x + i * tw, tabs.y, tw, tabs.h)
            col = theme.ACCENT if i == self.tab else theme.TEXT_MUTED
            img = ui.render(name, True, col)
            screen.blit(img, img.get_rect(center=tr.center))
            if i == self.tab:
                pygame.draw.line(
                    screen, theme.ACCENT, (tr.x + 8, tr.bottom - 2), (tr.right - 8, tr.bottom - 2), 2
                )
        if self.render_paused:
            cached = self._last_draw.get("world")
            if cached is not None:
                screen.blit(cached, view)
                return
        surf = screen.subsurface(view).copy()
        if self.tab == TAB_2D:
            self._paint_2d(surf)
        elif self.tab == TAB_MAP:
            self._paint_map(surf)
        else:
            self._paint_3d(surf)
        self._world_empty_overlay(surf)
        screen.blit(surf, view)
        self._last_draw["world"] = surf

    def _world_empty_overlay(self, surf):
        disconnected = self.status() == STATUS_DISCONNECTED
        has_robot = self.session.world.robot is not None
        has_tiles = bool(self.session.world.nav_tiles)
        if disconnected and not has_robot:
            self._centered(
                surf,
                surf.get_rect(),
                "No Viz stream — not connected. Use Connect.",
                theme.TEXT_MUTED,
            )
        elif self.session.handshakes and self.pps() == 0 and not has_robot:
            self._centered(
                surf,
                surf.get_rect(),
                "No Viz stream — waiting for packets (ANKI_DEV_CHEATS).",
                theme.TEXT_MUTED,
            )
        elif self.tab == TAB_MAP and not has_tiles:
            self._centered(
                surf,
                surf.get_rect(),
                EMPTY_MAP + "\n" + EMPTY_MAP_HINT + "\n" + EMPTY_MAP_FRAME,
                theme.TEXT_MUTED,
            )

    def _paint_2d(self, surf):
        self.view2d.width, self.view2d.height = surf.get_size()
        self.view2d.draw(
            surf,
            settings=self.overlays,
            robot_state=self.session.hud.robot_state,
        )

    def _world_meshes(self):
        now = time.monotonic()
        if (
            self._mesh_cache is None
            or self._mesh_cache_t is None
            or (now - self._mesh_cache_t) >= DRAW_OBJECTS_RATE_SEC
        ):
            self._mesh_cache = self.view3d.meshes(
                settings=self.overlays,
                robot_state=self.session.hud.robot_state,
            )
            self._mesh_cache_t = now
        return self._mesh_cache

    def _coast_orbit(self):
        if self._drag or self.tab != TAB_3D:
            return
        if abs(self._az_vel) < 0.5 and abs(self._el_vel) < 0.5:
            self._az_vel = 0.0
            self._el_vel = 0.0
            return
        now = time.monotonic()
        raw_dt = now - self._orbit_t if self._orbit_t is not None else _MIN_ORBIT_DT
        self._orbit_t = now
        dt = max(float(raw_dt), 1e-3)
        decay = math.exp(-dt * 1000.0 / max(theme.MOTION_MS, 1))
        self._az_vel *= decay
        self._el_vel *= decay
        if abs(self._az_vel) > _MAX_ORBIT_VEL:
            self._az_vel = _clamp_orbit_vel(self._az_vel)
        if abs(self._el_vel) > _MAX_ORBIT_VEL:
            self._el_vel = _clamp_orbit_vel(self._el_vel)
        if abs(self._az_vel) < 0.5 and abs(self._el_vel) < 0.5:
            self._az_vel = 0.0
            self._el_vel = 0.0
            return
        self.view3d.azimuth = (self.view3d.azimuth + self._az_vel * dt) % 360.0
        self.view3d.elevation = max(
            -89.0, min(89.0, self.view3d.elevation + self._el_vel * dt)
        )

    def _frame_map(self):
        robot = self.session.world.robot
        if robot is None:
            self._map_ox = 0.0
            self._map_oy = 0.0
            return
        x, y, _z = self.session.world.apply_origin(
            robot.x_trans_m, robot.y_trans_m, robot.z_trans_m
        )
        self._map_ox = -x / MM_TO_M
        self._map_oy = y / MM_TO_M

    def _paint_3d(self, surf):
        import pygame

        w, h = surf.get_size()
        self.view3d.set_size(w, h)
        surf.fill(theme.BG_VOID)
        pg = pygame
        for mesh in self.view3d.grid_lines():
            self._stroke_mesh(pg, surf, mesh, w, h)
        for mesh in self.view3d.axes_lines():
            self._stroke_mesh(pg, surf, mesh, w, h)
        for mesh in self._world_meshes():
            self._stroke_mesh(pg, surf, mesh, w, h)

    def _stroke_mesh(self, pg, surf, mesh, w, h):
        pts = []
        for p in mesh.points:
            if len(p) == 2:
                p = (p[0], p[1], 0.0)
            sp = _project_point(p[0], p[1], p[2], self.view3d, w, h)
            pts.append(sp)
        connect = getattr(mesh, "connect", "segments")
        if connect == "segments":
            for i in range(0, len(pts) - 1, 2):
                a, b = pts[i], pts[i + 1]
                if a and b:
                    pg.draw.line(surf, mesh.color, a, b, 1)
        else:
            loop = connect == "loop"
            drawn = [p for p in pts if p is not None]
            if len(drawn) >= 2:
                pg.draw.lines(surf, mesh.color, loop, drawn, 1)

    def _paint_map(self, surf):
        import pygame

        w, h = surf.get_size()
        surf.fill(theme.BG_VOID)
        ox, oy = self._map_ox, self._map_oy
        for (x0, y0), (x1, y1) in map_grid_lines(w, h, ox, oy):
            pygame.draw.line(surf, theme.GRID, (x0, y0), (x1, y1), 1)
        for x, y, rw, rh, color in self.session.world.fill_rects(w, h, ox, oy):
            pygame.draw.rect(surf, protocol_rgb(color), (x, y, rw, rh))
        pts = map_robot_pts(self.session.world, w, h, ox, oy)
        if len(pts) >= 3:
            pygame.draw.polygon(surf, theme.ACCENT, pts, 1)
        for strip in map_path_highlight_pts(
            self.session.world,
            w,
            h,
            ox,
            oy,
            settings=self.overlays,
            robot_state=self.session.hud.robot_state,
        ):
            if len(strip) >= 2:
                pygame.draw.lines(surf, theme.ACCENT, False, strip, 1)

    def _draw_stack_state(self, screen, rects):
        import pygame

        stack_r = pygame.Rect(rects["stack"])
        state_r = pygame.Rect(rects["state"])
        stack_s = pygame.Surface(stack_r.size)
        state_s = pygame.Surface(state_r.size)
        self.session.hud.draw_stack(stack_s)
        self.session.hud.draw_state(state_s, self.overlays)
        dock = self.session.hud.docking_state_line()
        if dock:
            font = self._font(pygame, "mono")
            img = font.render(dock, True, theme.TEXT)
            state_s.blit(img, (theme.PANEL_PAD, state_s.get_height() - img.get_height() - theme.PANEL_PAD))
        pygame.draw.rect(screen, theme.BORDER, stack_r, 1)
        pygame.draw.rect(screen, theme.BORDER, state_r, 1)
        screen.blit(stack_s, stack_r)
        screen.blit(state_s, state_r)

    def _draw_log(self, screen, rects):
        import pygame

        r = pygame.Rect(rects["log"])
        pygame.draw.rect(screen, theme.BG_PANEL, r)
        pygame.draw.line(screen, theme.BORDER, r.topleft, r.topright, 1)
        font = self._font(pygame, "log")
        err = self.last_error or self.connect_error or ""
        line1 = "{0:.0f} pkt/s   packets={1} handshakes={2}".format(
            self.pps(), self.session.packets, self.session.handshakes
        )
        vis = self.session.hud.vision_schedule_lines()
        extra = "  ".join(vis[:4]) if vis else ""
        y = r.y + theme.PANEL_PAD
        for text, col in (
            (line1, theme.TEXT),
            (extra, theme.TEXT_MUTED),
            (err, theme.DANGER),
        ):
            if not text:
                continue
            img = font.render(text[:180], True, col)
            screen.blit(img, (r.x + theme.PANEL_PAD, y))
            y += font.get_height() + 2

    def _centered(self, dest, rect, text, color):
        import pygame

        if not isinstance(rect, pygame.Rect):
            rect = pygame.Rect(rect)
        font = self._font(pygame, "ui")
        imgs = [font.render(line, True, color) for line in text.split("\n")]
        gap = 2
        total_h = sum(img.get_height() for img in imgs) + gap * (len(imgs) - 1)
        y = rect.centery - total_h // 2
        for img in imgs:
            dest.blit(img, img.get_rect(midtop=(rect.centerx, y)))
            y += img.get_height() + gap


def _hit(rect, pos):
    x, y, w, h = rect
    return x <= pos[0] < x + w and y <= pos[1] < y + h


def _wrap(font, text, max_w):
    words = text.split()
    lines, cur = [], ""
    for word in words:
        trial = (cur + " " + word).strip()
        if font.size(trial)[0] <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines or [text]


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.robot and not args.listen_only and not pygame_available():
        parser.error("need --robot IP or --listen-only (pygame not installed)")
    app = VizApp(args)
    return app.run()


if __name__ == "__main__":
    sys.exit(main())
