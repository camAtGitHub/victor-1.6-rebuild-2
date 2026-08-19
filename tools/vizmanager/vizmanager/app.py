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

from vizmanager import theme
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
from vizmanager.session import Session
from vizmanager.udp import ANKICONN, VIZ_PORT, UdpServer, bind_viz, local_ipv4s
from vizmanager.view2d import View2D
from vizmanager.view3d import View3D, _pan_axes
from vizmanager.world import protocol_rgb

MIN_SIZE = (1280, 720)
DEFAULT_SIZE = (1600, 900)
TAB_3D, TAB_2D, TAB_MAP = 0, 1, 2
TAB_NAMES = ("3D", "2D", "Map")
CONNECT_TIMEOUT_S = 8.0
STALE_S = 2.0
PPS_WINDOW_S = 1.0
FIREWALL_WIN = "New-NetFirewallRule -Protocol UDP -LocalPort 5252,5200"
STATUS_LIVE = "LIVE"
STATUS_DEGRADED = "DEGRADED"
STATUS_DISCONNECTED = "DISCONNECTED"
EMPTY_CAMERA = "No ImageChunk (enable VisionMode::Viz)"
_RIGHT_W = 300
_CAM_MIN_W = 320
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


def layout_rects(width, height):
    """MASTER.md layout. WORLD is the largest pane. Returns (x, y, w, h) tuples."""
    w = max(int(width), MIN_SIZE[0])
    h = max(int(height), MIN_SIZE[1])
    chrome_h = theme.CHROME_H
    log_h = theme.LOG_H_COLLAPSED
    body_top = chrome_h
    body_h = h - chrome_h - log_h
    right_w = _RIGHT_W
    cam_w = _CAM_MIN_W
    world_w = w - cam_w - right_w
    if world_w < cam_w or world_w < right_w:
        world_w = max(w // 2, cam_w + 1, right_w + 1)
        leftover = w - world_w
        right_w = min(_RIGHT_W, leftover // 2)
        if right_w < 220:
            right_w = leftover // 3
        cam_w = leftover - right_w
        if cam_w < 1:
            cam_w = 1
            world_w = w - cam_w - right_w
    tab_h = _TAB_H
    stack_h = body_h * 2 // 5
    state_h = body_h - stack_h
    return {
        "window": (0, 0, w, h),
        "chrome": (0, 0, w, chrome_h),
        "camera": (0, body_top, cam_w, body_h),
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
            if self.engine_ui is None:
                self.error = connect_error_message(self.host_ip)

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
        self.host_ip = args.host_ip or (local_ipv4s()[0] if local_ipv4s() else "")
        self.bind_addr = args.bind or "0.0.0.0"
        self.viz_port = int(args.viz_port)
        self.ui_port = int(args.ui_port)
        self.session = Session()
        self.view2d = View2D(self.session.world)
        self.view3d = View3D(self.session.world)
        self.tab = TAB_3D
        self.render_paused = False
        self.ip_text = self.robot_ip
        self.ip_focused = False
        self.connect_error = None
        self.last_error = ""
        self.viz = None
        self.redirector = None
        self._pkt_times = []
        self._last_pkt_t = None
        self._last_draw = {"camera": None, "world": None, "camera_frame": None}
        self._fonts = {}
        self._drag = None
        self._cam_bytes = None

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
        if not self.host_ip:
            self.connect_error = "need --host-ip (no LAN IPv4 found)"
            self.last_error = self.connect_error
            return
        self.stop_connect()
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
        if self.redirector is not None:
            self.redirector.close()
            self.redirector = None

    def connecting(self):
        return self.redirector is not None and self.redirector.connecting

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

        rects = layout_rects(*size)
        if event.type == pygame.MOUSEBUTTONDOWN:
            self._on_mouse_down(event, rects)
        elif event.type == pygame.MOUSEBUTTONUP:
            self._drag = None
        elif event.type == pygame.MOUSEMOTION:
            self._on_mouse_move(event, rects)
        elif event.type == pygame.MOUSEWHEEL:
            self._on_wheel(event, rects)
        elif event.type == pygame.TEXTINPUT and self.ip_focused:
            for ch in event.text:
                if ch in "0123456789." and len(self.ip_text) < 15:
                    self.ip_text += ch
        elif event.type == pygame.KEYDOWN:
            self._on_key(event)

    def _on_key(self, event):
        import pygame

        if event.key == pygame.K_ESCAPE:
            if self.ip_focused:
                self.ip_focused = False
            else:
                self.connect_error = None
            return
        if self.ip_focused:
            if event.key == pygame.K_BACKSPACE:
                self.ip_text = self.ip_text[:-1]
            elif event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                self.ip_focused = False
                self.start_connect()
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
        elif event.key == pygame.K_SPACE:
            self.render_paused = not self.render_paused

    def _chrome_widgets(self, rects):
        cx, cy, cw, ch = rects["chrome"]
        pad = theme.SPACE[1]
        pip_x = cx + pad
        word_x = pip_x + _PIP_D + pad
        field_x = word_x + 110
        field_w = 168
        field_h = theme.CONTROL_H
        field_y = cy + (ch - field_h) // 2
        btn_w = 108
        btn_h = ch
        btn_x = cx + cw - btn_w
        disc_w = 84
        pps_x = field_x + field_w + pad
        return {
            "pip": (pip_x, cy + (ch - _PIP_D) // 2, _PIP_D, _PIP_D),
            "word": (word_x, cy, 110, ch),
            "ip": (field_x, field_y, field_w, field_h),
            "pps": (pps_x, cy, 90, ch),
            "disconnect": (btn_x - disc_w, cy, disc_w, ch),
            "connect": (btn_x, cy, btn_w, btn_h),
        }

    def _on_mouse_down(self, event, rects):
        widgets = self._chrome_widgets(rects)
        pos = event.pos
        self.ip_focused = _hit(widgets["ip"], pos)
        if event.button == 1 and _hit(widgets["connect"], pos):
            if not self.connecting():
                self.start_connect()
            return
        if event.button == 1 and _hit(widgets["disconnect"], pos):
            if self.redirector is not None and not self.connecting():
                self.stop_connect()
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

    def _on_mouse_move(self, event, rects):
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
            else:
                self.view3d.azimuth = (self.view3d.azimuth - dx * 0.4) % 360.0
                self.view3d.elevation = max(
                    -89.0, min(89.0, self.view3d.elevation + dy * 0.4)
                )
        elif self.tab == TAB_2D:
            self.view2d.follow_robot = False
            self.view2d.center_x -= dx / max(self.view2d.ppm, 1.0)
            self.view2d.center_y += dy / max(self.view2d.ppm, 1.0)

    def _on_wheel(self, event, rects):
        import pygame

        if not _hit(rects["world_view"], pygame.mouse.get_pos()):
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
        else:
            names, size = (
                (theme.FONT_MONO, "DejaVu Sans Mono", "Consolas"),
                theme.FONT_HUD_PX if kind == "mono" else 11,
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

        rects = layout_rects(*screen.get_size())
        screen.fill(theme.BG_VOID)
        self._draw_chrome(screen, rects)
        self._draw_camera(screen, rects)
        self._draw_world(screen, rects)
        self._draw_stack_state(screen, rects)
        self._draw_log(screen, rects)
        if self.connect_error:
            self._draw_connect_error(screen, rects)

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

        pps_txt = "{0:.0f} pps".format(self.pps())
        if self.render_paused:
            pps_txt = pps_txt + "  PAUSED"
        pps_img = ui.render(pps_txt, True, theme.WARN if self.render_paused else theme.TEXT_MUTED)
        screen.blit(
            pps_img,
            (widgets["pps"][0], chrome.y + (chrome.h - pps_img.get_height()) // 2),
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
        box = pygame.Rect(ip.x, y, min(max_w, rects["chrome"][2] - ip.x - 8), h)
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
        if self.render_paused:
            frame = self._last_draw.get("camera_frame")
        else:
            frame = self.session.overlay.frame
            self._last_draw["camera_frame"] = frame
        if frame is None:
            self._centered(screen, r, EMPTY_CAMERA, theme.TEXT_MUTED)
            return
        try:
            import numpy as np
        except ImportError:
            self._centered(screen, r, EMPTY_CAMERA, theme.TEXT_MUTED)
            return
        arr = np.ascontiguousarray(frame)
        h, w = arr.shape[0], arr.shape[1]
        if h < 1 or w < 1:
            self._centered(screen, r, EMPTY_CAMERA, theme.TEXT_MUTED)
            return
        self._cam_bytes = arr.tobytes()
        src = pygame.image.frombuffer(self._cam_bytes, (w, h), "RGB")
        scale = min(r.w / float(w), r.h / float(h))
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        scaled = pygame.transform.smoothscale(src, (nw, nh))
        dest = scaled.get_rect(center=r.center)
        screen.blit(scaled, dest)

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
        if self.tab == TAB_MAP and not has_tiles:
            self._centered(surf, surf.get_rect(), "No MemoryMap tiles", theme.TEXT_MUTED)
        elif disconnected and not has_robot:
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

    def _paint_2d(self, surf):
        self.view2d.width, self.view2d.height = surf.get_size()
        self.view2d.draw(surf)

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
        for mesh in self.view3d.meshes():
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
        self.view2d.width, self.view2d.height = w, h
        grid = theme.GRID
        for (x0, y0), (x1, y1) in self.view2d.grid_lines():
            pygame.draw.line(
                surf,
                grid,
                self.view2d.world_to_screen(x0, y0),
                self.view2d.world_to_screen(x1, y1),
                1,
            )
        for x, y, rw, rh, color in self.session.world.fill_rects(w, h):
            pygame.draw.rect(surf, protocol_rgb(color), (x, y, rw, rh))

    def _draw_stack_state(self, screen, rects):
        import pygame

        stack_r = pygame.Rect(rects["stack"])
        state_r = pygame.Rect(rects["state"])
        stack_s = pygame.Surface(stack_r.size)
        state_s = pygame.Surface(state_r.size)
        self.session.hud.draw_stack(stack_s)
        self.session.hud.draw_state(state_s)
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
        img = font.render(text, True, color)
        dest.blit(img, img.get_rect(center=rect.center))


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
