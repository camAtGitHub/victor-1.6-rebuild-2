"""Portable Viz UDP server. Engine is the UdpClient; host is the UdpServer on 5252.

Yields raw datagrams (including the 8-byte ANKICONN handshake). Does not unpack
CLAD — callers must not treat ANKICONN as MessageViz.

Copied from docs/mapping/viz-udp-poc/listen.py bind/handshake. C++ UdpServer::Recv
swallows ANKICONN (returns 0); we yield it so Session can count handshakes.
"""

from __future__ import annotations

import socket

VIZ_PORT = 5252
ANKICONN = b"ANKICONN"
MAX_MSG = 2848


def local_ipv4s() -> list[str]:
    ips: list[str] = []
    try:
        hostname_ip = socket.gethostbyname(socket.gethostname())
        if hostname_ip and not hostname_ip.startswith("127."):
            ips.append(hostname_ip)
    except OSError:
        pass
    # Route-trick: pick the address the kernel would use to leave the LAN.
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        route_ip = probe.getsockname()[0]
        if route_ip not in ips:
            ips.append(route_ip)
    except OSError:
        pass
    finally:
        probe.close()
    return ips


def hexdump(data: bytes, limit: int = 24) -> str:
    chunk = data[:limit]
    return " ".join(f"{b:02x}" for b in chunk) + (" …" if len(data) > limit else "")


def bind_viz(bind: str, port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((bind, port))
    sock.settimeout(0.5)
    return sock


class UdpServer:
    """Host-side Viz listener. Recv yields (data, addr) without unpacking CLAD."""

    def __init__(self, sock: socket.socket):
        self.sock = sock

    @classmethod
    def bind(cls, bind: str = "0.0.0.0", port: int = VIZ_PORT) -> UdpServer:
        return cls(bind_viz(bind, port))

    def recv_datagram(self):
        """Return (data, addr) or None on timeout. Does not unpack CLAD."""
        try:
            return self.sock.recvfrom(MAX_MSG)
        except socket.timeout:
            return None

    def iter_datagrams(self):
        """Yield (data, addr), skipping timeouts. Does not unpack CLAD."""
        while True:
            got = self.recv_datagram()
            if got is None:
                continue
            yield got

    def close(self) -> None:
        if self.sock is not None:
            self.sock.close()
            self.sock = None

    def __enter__(self) -> UdpServer:
        return self

    def __exit__(self, *exc) -> None:
        self.close()
