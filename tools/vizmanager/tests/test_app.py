"""CLI argparse + locked layout. Headless bind smoke; does not open a window."""

from __future__ import annotations

import os
import re
import socket
import sys
import time
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager import theme
from vizmanager.app import (
    CONNECT_TIMEOUT_S,
    DEFAULT_SIZE,
    EMPTY_MAP,
    EMPTY_MAP_FRAME,
    EMPTY_MAP_HINT,
    FIREWALL_WIN,
    MIN_SIZE,
    STATUS_DEGRADED,
    STATUS_DISCONNECTED,
    STATUS_LIVE,
    Redirector,
    TAB_2D,
    VizApp,
    _CAM_DEFAULT_W,
    _CAM_MIN_W,
    _SPLITTER_W,
    _WORLD_MIN_W,
    build_parser,
    clamp_cam_w,
    connect_error_message,
    image_to_pane,
    layout_rects,
    letterbox_dest,
    map_grid_lines,
    map_path_highlight_pts,
    map_robot_pts,
    status_for,
    _RIGHT_W,
)
from vizmanager import overlay_panel
from vizmanager.sensors import OverlaySettings
from vizmanager.udp import ANKICONN
from vizmanager.view3d import DRAW_OBJECTS_RATE_SEC
from vizmanager.world import MM_TO_M, World

try:
    import pygame
except ImportError:
    pygame = None

_LAYOUT_KEYS = {
    "window",
    "chrome",
    "camera",
    "splitter",
    "world",
    "world_tabs",
    "world_view",
    "stack",
    "state",
    "log",
}
_VIZ = os.path.join(os.path.dirname(__file__), "..", "vizmanager")
_HEX = re.compile(r"#[0-9A-Fa-f]{3,8}\b")


def _click(app, pos, button=1, clicks=1):
    rects = app._layout(DEFAULT_SIZE)
    app._on_mouse_down(
        SimpleNamespace(pos=pos, button=button, clicks=clicks),
        rects,
    )
    return rects


def _center(rect):
    return (rect[0] + rect[2] // 2, rect[1] + rect[3] // 2)


def test_parser_robot_and_listen_only():
    parser = build_parser()
    robot = parser.parse_args(["--robot", "192.168.50.155"])
    assert robot.robot == "192.168.50.155"
    assert robot.listen_only is False
    assert robot.bind == "0.0.0.0"
    listen = parser.parse_args(["--listen-only"])
    assert listen.listen_only is True
    assert listen.robot is None


def test_parser_rejects_both_modes():
    parser = build_parser()
    try:
        parser.parse_args(["--robot", "192.168.50.155", "--listen-only"])
    except SystemExit:
        return
    raise AssertionError("expected SystemExit when both --robot and --listen-only")


def test_layout_world_largest_default_and_min():
    for size in (DEFAULT_SIZE, MIN_SIZE):
        rects = layout_rects(*size)
        stack = rects["stack"][2] * rects["stack"][3]
        state = rects["state"][2] * rects["state"][3]
        world = rects["world"][2] * rects["world"][3]
        assert world > stack
        assert world > state
        assert rects["chrome"][3] == theme.CHROME_H
        assert rects["log"][3] == theme.LOG_H_COLLAPSED
        assert rects["window"][2] >= MIN_SIZE[0]
        assert rects["window"][3] >= MIN_SIZE[1]
        assert rects["camera"][2] >= _CAM_MIN_W
        assert rects["world"][2] >= _WORLD_MIN_W
    default = layout_rects(*DEFAULT_SIZE)
    assert default["camera"][2] == _CAM_DEFAULT_W
    assert _CAM_DEFAULT_W == 2 * 320
    assert default["world"][2] >= default["camera"][2]
    assert default["stack"][2] == _RIGHT_W
    assert default["state"][2] == _RIGHT_W
    assert _RIGHT_W == 380


def test_layout_cam_w_is_clamped_and_splitter_sits_on_the_seam():
    wide = layout_rects(*DEFAULT_SIZE, cam_w=400)
    assert wide["camera"][2] == 400
    assert wide["world"][0] == 400
    too_big = layout_rects(*DEFAULT_SIZE, cam_w=10000)
    assert too_big["camera"][2] == clamp_cam_w(DEFAULT_SIZE[0], 10000)
    assert too_big["world"][2] >= _WORLD_MIN_W
    too_small = layout_rects(*DEFAULT_SIZE, cam_w=1)
    assert too_small["camera"][2] == _CAM_MIN_W
    rects = layout_rects(*DEFAULT_SIZE, cam_w=500)
    split = rects["splitter"]
    assert split[2] == _SPLITTER_W
    cam = rects["camera"]
    world = rects["world"]
    seam = cam[0] + cam[2]
    assert split[0] <= seam <= split[0] + split[2]
    assert world[0] == seam


def test_letterbox_maps_image_pixels_onto_the_pane():
    pane = (0, 36, 640, 360)
    dest, scale = letterbox_dest(320, 180, pane)
    assert scale == 2.0
    assert dest == (0, 36, 640, 360)
    x, y = image_to_pane(10, 20, dest, scale)
    assert (x, y) == (20.0, 76.0)
    # Pillarbox: frame narrower than pane aspect.
    dest2, scale2 = letterbox_dest(100, 100, (0, 0, 400, 200))
    assert scale2 == 2.0
    assert dest2[2] == 200
    assert dest2[3] == 200
    assert dest2[0] == 100


def test_app_splitter_drag_changes_cam_w():
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        assert app.cam_w == _CAM_DEFAULT_W
        app.apply_splitter_x(400, DEFAULT_SIZE[0])
        assert app.cam_w == 400
        app.apply_splitter_x(0, DEFAULT_SIZE[0])
        assert app.cam_w == _CAM_MIN_W
        app.reset_cam_w()
        assert app.cam_w == _CAM_DEFAULT_W
    finally:
        app.close()


def test_status_words_not_color_only():
    assert status_for(0, 0.0, False, None) == STATUS_DISCONNECTED
    assert status_for(1, 0.0, False, 10.0) == STATUS_DEGRADED
    assert status_for(1, 12.0, True, 0.1) == STATUS_LIVE


def test_connect_error_has_firewall_fix():
    msg = connect_error_message("192.168.50.10")
    assert "5103" in msg
    assert "5252" in msg
    assert "5200" in msg
    assert FIREWALL_WIN in msg
    assert "iptables" in msg
    assert "192.168.50.10" in msg
    assert "0.0.0.0" in msg


def test_ip_hit_target_at_least_32px():
    widgets = None
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        rects = layout_rects(*DEFAULT_SIZE)
        widgets = app._chrome_widgets(rects)
    finally:
        app.close()
    visual = widgets["ip"]
    hit = widgets["ip_hit"]
    assert visual[3] == theme.CONTROL_H
    assert hit[3] >= 32
    assert hit[2] == visual[2]


def test_map_empty_overlay_tells_how_to_activate():
    assert EMPTY_MAP == "No MemoryMap tiles"
    assert EMPTY_MAP_HINT == "Open WebViz NavMap to activate."
    assert EMPTY_MAP_FRAME == "Once tiles activate press 'F' to centre on robot"


def _map_robot(**kw):
    from types import SimpleNamespace

    fields = dict(
        x_trans_m=0.0,
        y_trans_m=0.0,
        z_trans_m=0.0,
        rot_rad=0.0,
        rot_axis_x=0.0,
        rot_axis_y=0.0,
        rot_axis_z=1.0,
        head_angle=0.0,
        lift_angle=0.0,
    )
    fields.update(kw)
    return SimpleNamespace(**fields)


def test_map_robot_pts_tip_at_origin_and_pans():
    world = World()
    assert map_robot_pts(world, 100, 100) == ()
    world.set_robot(_map_robot())
    pts = map_robot_pts(world, 100, 100)
    assert len(pts) == 3
    assert pts[0] == (50, 50)
    # Base 80 mm behind (+X heading), 25 mm half-width, Y flipped.
    assert pts[1] == (-30, 25)
    assert pts[2] == (-30, 75)
    panned = map_robot_pts(world, 100, 100, origin_x=10.0, origin_y=-4.0)
    assert panned[0] == (60, 46)


def _path_line(path_id=1, **kw):
    fields = dict(
        pathID=path_id,
        x_start_m=0.0,
        y_start_m=0.0,
        z_start_m=0.0,
        x_end_m=0.5,
        y_end_m=0.0,
        z_end_m=0.0,
    )
    fields.update(kw)
    return SimpleNamespace(**fields)


def _path_arc(path_id=1, **kw):
    fields = dict(
        pathID=path_id,
        x_center_m=0.0,
        y_center_m=0.0,
        radius_m=1.0,
        start_rad=0.0,
        sweep_rad=0.4,
    )
    fields.update(kw)
    return SimpleNamespace(**fields)


def _robot_state(curr=0):
    return SimpleNamespace(state=SimpleNamespace(currPathSegment=curr))


def test_map_path_highlight_only_active_segment():
    world = World()
    world.append_path_line(_path_line())
    world.append_path_arc(_path_arc())
    settings = OverlaySettings()
    assert map_path_highlight_pts(world, 100, 100) == ()
    strips = map_path_highlight_pts(
        world, 100, 100, settings=settings, robot_state=_robot_state(0)
    )
    assert len(strips) == 1
    # Line (0,0)->(0.5,0) m: 1 mm = 1 px, Y flip, origin at pane center.
    assert strips[0] == ((50, 50), (550, 50))
    panned = map_path_highlight_pts(
        world,
        100,
        100,
        origin_x=10.0,
        origin_y=-4.0,
        settings=settings,
        robot_state=_robot_state(0),
    )
    assert panned[0][0] == (60, 46)
    arc = map_path_highlight_pts(
        world, 100, 100, settings=settings, robot_state=_robot_state(1)
    )
    assert len(arc) == 1
    expected_arc = world.paths[1].segment_polyline_m(1)
    assert len(arc[0]) == len(expected_arc)
    x_m, y_m, _z = expected_arc[0]
    assert arc[0][0] == (
        int(round(x_m / MM_TO_M + 50.0)),
        int(round(-y_m / MM_TO_M + 50.0)),
    )
    assert map_path_highlight_pts(
        world, 100, 100, settings=settings, robot_state=_robot_state(5)
    ) == ()
    assert map_path_highlight_pts(
        world, 100, 100, settings=settings, robot_state=_robot_state(-1)
    ) == ()
    off = OverlaySettings()
    off.path_highlight = False
    assert map_path_highlight_pts(
        world, 100, 100, settings=off, robot_state=_robot_state(0)
    ) == ()


def test_map_grid_is_1mm_px_not_view2d_metres():
    lines = map_grid_lines(100, 100, origin_x=0.0, origin_y=0.0, step_mm=50)
    assert lines
    xs = {a[0] for (a, b) in lines if a[0] == b[0]}
    ys = {a[1] for (a, b) in lines if a[1] == b[1]}
    # pane center (50, 50) is the MemoryMap origin; 50 mm = 50 px.
    assert 50 in xs
    assert 50 in ys
    for (a, b) in lines:
        assert a[0] == b[0] or a[1] == b[1]


def test_connect_timeout_error_is_dismissible_and_not_relatched():
    redir = Redirector("127.0.0.1", "127.0.0.1", "127.0.0.1", 0)
    try:
        redir.t0 = time.time() - (CONNECT_TIMEOUT_S + 1.0)
        redir.poll(time.time())
        assert redir.error
        assert "5103" in redir.error
        assert redir.connecting is False
        redir.dismiss_error()
        assert redir.error is None
        redir.poll(time.time())
        assert redir.error is None
    finally:
        redir.close()


def test_ui_handshake_clears_timeout_error():
    redir = Redirector("127.0.0.1", "127.0.0.1", "127.0.0.1", 0)
    sender = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        redir.t0 = time.time() - (CONNECT_TIMEOUT_S + 1.0)
        redir.poll(time.time())
        assert redir.error
        port = redir.ui.getsockname()[1]
        sender.sendto(ANKICONN, ("127.0.0.1", port))
        redir.poll(time.time())
        assert redir.error is None
        assert redir.engine_ui is not None
        assert redir.redirected is True
    finally:
        sender.close()
        redir.close()


def test_app_esc_dismiss_does_not_come_back_on_drain():
    parser = build_parser()
    args = parser.parse_args(["--listen-only", "--bind", "127.0.0.1", "--viz-port", "0"])
    app = VizApp(args)
    redir = Redirector("127.0.0.1", "127.0.0.1", "127.0.0.1", 0)
    try:
        redir.t0 = time.time() - (CONNECT_TIMEOUT_S + 1.0)
        redir.poll(time.time())
        app.redirector = redir
        app.drain(0.0)
        assert app.connect_error
        app.dismiss_connect_error()
        assert app.connect_error is None
        assert redir.error is None
        app.drain(0.0)
        assert app.connect_error is None
    finally:
        app.redirector = None
        redir.close()
        app.close()


def test_world_meshes_cached_for_draw_objects_rate():
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        first = app._world_meshes()
        t0 = app._mesh_cache_t
        second = app._world_meshes()
        assert second is first
        assert app._mesh_cache_t is t0
        app._mesh_cache_t = time.monotonic() - (DRAW_OBJECTS_RATE_SEC + 0.01)
        app._world_meshes()
        assert app._mesh_cache_t > t0
    finally:
        app.close()


def test_host_field_shown_when_host_ip_forced():
    parser = build_parser()
    args = parser.parse_args(["--listen-only", "--host-ip", "10.1.2.3"])
    app = VizApp(args)
    try:
        assert app.show_host_field is True
        assert app.host_text == "10.1.2.3"
        widgets = app._chrome_widgets(layout_rects(*DEFAULT_SIZE))
        assert widgets["host"][2] > 0
        assert widgets["ip"][3] == theme.CONTROL_H
        assert widgets["host_hit"][3] >= 32
    finally:
        app.close()


def test_handshake_enables_viz_http_and_close_disables():
    import vizmanager.app as appmod

    calls = []

    def fake_set(robot, enable, timeout=None, urlopen=None):
        calls.append((robot, bool(enable)))
        return None

    orig = appmod.set_viz_mode
    appmod.set_viz_mode = fake_set
    parser = build_parser()
    args = parser.parse_args(["--listen-only", "--bind", "127.0.0.1", "--viz-port", "0"])
    app = VizApp(args)
    redir = Redirector("192.168.50.155", "127.0.0.1", "127.0.0.1", 0)
    sender = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        app.robot_ip = "192.168.50.155"
        app.redirector = redir
        port = redir.ui.getsockname()[1]
        sender.sendto(ANKICONN, ("127.0.0.1", port))
        app.drain(0.5)
        assert redir.redirected is True
        assert calls == [("192.168.50.155", True)]
        assert app._viz_http_enabled is True
        app.close()
        assert calls == [("192.168.50.155", True), ("192.168.50.155", False)]
        assert app._viz_http_enabled is False
    finally:
        appmod.set_viz_mode = orig
        sender.close()
        app.redirector = None
        redir.close()
        app.close()


def test_listen_only_bind_handshake_counts():
    parser = build_parser()
    args = parser.parse_args(["--listen-only", "--bind", "127.0.0.1", "--viz-port", "0"])
    app = VizApp(args)
    try:
        assert app.bind_viz()
        port = app.viz.sock.getsockname()[1]
        sender = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sender.sendto(ANKICONN, ("127.0.0.1", port))
            app.drain(0.5)
        finally:
            sender.close()
        assert app.session.handshakes == 1
        assert app.session.packets >= 1
        assert app.status() in (STATUS_LIVE, STATUS_DEGRADED)
    finally:
        app.close()


def test_overlay_settings_on_app_default_closed():
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        assert isinstance(app.overlays, OverlaySettings)
        assert app.overlays.panel_open is False
        assert app.overlays.cliff_dots is True
    finally:
        app.close()


def test_draw_state_passes_app_overlays():
    app_src = open(os.path.join(_VIZ, "app.py"), encoding="utf-8").read()
    assert "self.session.hud.draw_state(state_s, self.overlays)" in app_src
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        from vizmanager import codec

        app.overlays.cliff_hud = False
        if not codec.generated_available():
            assert app.session.hud.state_lines(app.overlays)[6] == ""
            return
        MessageViz = codec.MessageViz
        payload_cls = MessageViz.typeByTag(MessageViz.Tag.RobotStateMessage)
        payload = payload_cls()
        app.session.process_datagram(MessageViz(RobotStateMessage=payload).pack())
        assert app.session.hud.state_lines(app.overlays)[6] == ""
        app.overlays.cliff_hud = True
        assert "Cliff:" in app.session.hud.state_lines(app.overlays)[6]
    finally:
        app.close()


def test_layout_rects_key_set_unchanged():
    rects = layout_rects(*DEFAULT_SIZE)
    assert set(rects) == _LAYOUT_KEYS
    assert rects["chrome"][3] == theme.CHROME_H


def test_overlays_chrome_left_of_disconnect_muted_width():
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        widgets = app._chrome_widgets(layout_rects(*DEFAULT_SIZE))
        ov = widgets["overlays"]
        disc = widgets["disconnect"]
        conn = widgets["connect"]
        assert ov[2] == 84
        assert ov[3] == theme.CHROME_H
        assert ov[3] >= 32
        assert ov[0] + ov[2] == disc[0]
        assert disc[0] + disc[2] == conn[0]
    finally:
        app.close()


def test_click_overlays_toggles_panel_open():
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        widgets = app._chrome_widgets(layout_rects(*DEFAULT_SIZE))
        pos = _center(widgets["overlays"])
        assert app.overlays.panel_open is False
        _click(app, pos)
        assert app.overlays.panel_open is True
        _click(app, pos)
        assert app.overlays.panel_open is False
    finally:
        app.close()


def test_checkbox_hit_flips_cliff_dots():
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        app.overlays.panel_open = True
        assert app.overlays.cliff_dots is True
        world_view = layout_rects(*DEFAULT_SIZE)["world_view"]
        row = None
        for field, _label, rect, _index in overlay_panel.iter_rows(world_view):
            if field == "cliff_dots":
                row = rect
                break
        assert row is not None
        _click(app, _center(row))
        assert app.overlays.cliff_dots is False
        assert app.overlays.panel_open is True
    finally:
        app.close()


def test_click_outside_panel_on_world_closes():
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        app.tab = TAB_2D
        app.overlays.panel_open = True
        tabs = layout_rects(*DEFAULT_SIZE)["world_tabs"]
        _click(app, (tabs[0] + 8, tabs[1] + 8))
        assert app.overlays.panel_open is False
        assert app.tab == TAB_2D
        assert app._drag is None

        app.overlays.panel_open = True
        world_view = layout_rects(*DEFAULT_SIZE)["world_view"]
        pos = (world_view[0] + 8, world_view[1] + 8)
        assert overlay_panel.hit_panel(pos, world_view) is False
        _click(app, pos)
        assert app.overlays.panel_open is False
        assert app._drag is None
    finally:
        app.close()


def test_wheel_over_panel_does_not_zoom():
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        app.overlays.panel_open = True
        rects = layout_rects(*DEFAULT_SIZE)
        panel = overlay_panel.panel_rect(rects["world_view"])
        dist = app.view3d.distance
        ppm = app.view2d.ppm
        app._on_wheel(SimpleNamespace(pos=_center(panel), y=1), rects)
        assert app.view3d.distance == dist
        assert app.view2d.ppm == ppm
        app.overlays.panel_open = False
        app._on_wheel(SimpleNamespace(pos=_center(panel), y=1), rects)
        assert app.view3d.distance != dist
    finally:
        app.close()


def test_connect_is_only_accent_dim_fill():
    panel = open(os.path.join(_VIZ, "overlay_panel.py"), encoding="utf-8").read()
    sensors = open(os.path.join(_VIZ, "sensors.py"), encoding="utf-8").read()
    app_src = open(os.path.join(_VIZ, "app.py"), encoding="utf-8").read()
    assert "ACCENT_DIM" not in panel
    assert "ACCENT_DIM" not in sensors
    fills = [line.strip() for line in app_src.splitlines() if "ACCENT_DIM" in line]
    assert len(fills) == 1
    assert "draw.rect" in fills[0]
    assert "ACCENT_DIM" in fills[0]


def test_no_raw_hex_in_overlay_panel_or_sensors():
    for name in ("overlay_panel.py", "sensors.py"):
        text = open(os.path.join(_VIZ, name), encoding="utf-8").read()
        assert _HEX.search(text) is None, name


def test_key_o_toggles_panel_open():
    if pygame is None:
        pytest.skip("pygame not installed")
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        assert app.overlays.panel_open is False
        app._on_key(SimpleNamespace(key=pygame.K_o))
        assert app.overlays.panel_open is True
        app._on_key(SimpleNamespace(key=pygame.K_o))
        assert app.overlays.panel_open is False
    finally:
        app.close()


def test_esc_closes_overlay_panel_before_connect_error():
    if pygame is None:
        pytest.skip("pygame not installed")
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        app.overlays.panel_open = True
        app.connect_error = "firewall"
        app._on_key(SimpleNamespace(key=pygame.K_ESCAPE))
        assert app.overlays.panel_open is False
        assert app.connect_error == "firewall"
        app._on_key(SimpleNamespace(key=pygame.K_ESCAPE))
        assert app.connect_error is None
    finally:
        app.close()


def test_overlay_panel_space_flips_focus_not_pause():
    if pygame is None:
        pytest.skip("pygame not installed")
    parser = build_parser()
    args = parser.parse_args(["--listen-only"])
    app = VizApp(args)
    try:
        app.overlays.panel_open = True
        app._overlay_focus = overlay_panel.CHECKBOX_FIELDS.index("cliff_dots")
        assert app.overlays.cliff_dots is True
        assert app.render_paused is False
        app._on_key(SimpleNamespace(key=pygame.K_SPACE))
        assert app.overlays.cliff_dots is False
        assert app.render_paused is False
        app._on_key(SimpleNamespace(key=pygame.K_UP))
        assert app._overlay_focus == overlay_panel.CHECKBOX_FIELDS.index("path_seg_hud")
        app._on_key(SimpleNamespace(key=pygame.K_RETURN))
        assert app.overlays.path_seg_hud is False
    finally:
        app.close()

