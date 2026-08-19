"""UDP bind/recv: ANKICONN handshake must not mix into the payload list."""

from __future__ import annotations

import os
import socket
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager.udp import (  # noqa: E402
    ANKICONN,
    MAX_MSG,
    VIZ_PORT,
    UdpServer,
    bind_viz,
    hexdump,
    local_ipv4s,
)


def _bind_test_server():
    """Bind 127.0.0.1:5252 if free, else an ephemeral port."""
    try:
        sock = bind_viz("127.0.0.1", VIZ_PORT)
        return sock, sock.getsockname()[1]
    except OSError:
        sock = bind_viz("127.0.0.1", 0)
        return sock, sock.getsockname()[1]


def test_constants():
    assert VIZ_PORT == 5252
    assert ANKICONN == b"ANKICONN"
    assert MAX_MSG == 2848
    assert len(ANKICONN) == 8


def test_local_ipv4s_and_hexdump():
    ips = local_ipv4s()
    assert isinstance(ips, list)
    assert all(isinstance(ip, str) for ip in ips)
    dumped = hexdump(b"\x00FAKE-VIZ-PACKET")
    assert "00" in dumped


def test_bind_recv_handshake_not_mixed_with_payload():
    sock, port = _bind_test_server()
    server = UdpServer(sock)
    sender = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sender.sendto(ANKICONN, ("127.0.0.1", port))
        sender.sendto(b"\x00FAKE-VIZ-PACKET", ("127.0.0.1", port))
        got = []
        deadline = time.time() + 2.0
        while time.time() < deadline and len(got) < 2:
            item = server.recv_datagram()
            if item is None:
                continue
            got.append(item)
    finally:
        sender.close()
        server.close()

    assert len(got) == 2
    handshakes = [data for data, _addr in got if data == ANKICONN]
    payloads = [data for data, _addr in got if data != ANKICONN]
    assert handshakes == [ANKICONN]
    assert ANKICONN not in payloads
    assert payloads == [b"\x00FAKE-VIZ-PACKET"]
    assert got[0][0] == ANKICONN
