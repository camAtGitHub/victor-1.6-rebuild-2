"""CLI argparse + locked layout. Headless bind smoke; does not open a window."""

from __future__ import annotations

import os
import socket
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager import theme
from vizmanager.app import (
    CONNECT_TIMEOUT_S,
    DEFAULT_SIZE,
    FIREWALL_WIN,
    MIN_SIZE,
    STATUS_DEGRADED,
    STATUS_DISCONNECTED,
    STATUS_LIVE,
    Redirector,
    VizApp,
    build_parser,
    connect_error_message,
    layout_rects,
    map_grid_lines,
    status_for,
)
from vizmanager.udp import ANKICONN
from vizmanager.view3d import DRAW_OBJECTS_RATE_SEC


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
        world = rects["world"][2] * rects["world"][3]
        camera = rects["camera"][2] * rects["camera"][3]
        stack = rects["stack"][2] * rects["stack"][3]
        state = rects["state"][2] * rects["state"][3]
        assert world > camera
        assert world > stack
        assert world > state
        assert rects["chrome"][3] == theme.CHROME_H
        assert rects["log"][3] == theme.LOG_H_COLLAPSED
        assert rects["window"][2] >= MIN_SIZE[0]
        assert rects["window"][3] >= MIN_SIZE[1]


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
