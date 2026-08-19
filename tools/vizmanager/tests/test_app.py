"""CLI argparse + locked layout. Headless bind smoke; does not open a window."""

from __future__ import annotations

import os
import socket
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager import theme
from vizmanager.app import (
    DEFAULT_SIZE,
    FIREWALL_WIN,
    MIN_SIZE,
    STATUS_DEGRADED,
    STATUS_DISCONNECTED,
    STATUS_LIVE,
    VizApp,
    build_parser,
    connect_error_message,
    layout_rects,
    status_for,
)
from vizmanager.udp import ANKICONN


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
