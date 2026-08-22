#!/usr/bin/env python3
"""Crude Viz UDP listener (engine is the client; we are the server on 5252).

Does not unpack CLAD. Prints ANKICONN handshakes and a hex dump of later packets
so we can see whether the robot can reach this host at all.

Usage:
  python3 listen.py
  python3 listen.py --selftest
  python3 listen.py --robot 192.168.1.50
"""

from __future__ import annotations

import argparse
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

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


def poke_redirect(robot: str, host_ip: str) -> None:
    url = (
        f"http://{robot}:8888/consolefunccall?"
        + urllib.parse.urlencode({"func": "RedirectVizTo", "args": host_ip})
    )
    print(f"poke  {url}")
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            body = resp.read().decode("utf-8", "replace").strip()
            print(f"poke  HTTP {resp.status}  {body or '(empty)'}")
    except urllib.error.HTTPError as exc:
        print(f"poke  HTTP {exc.code}  {exc.reason}", file=sys.stderr)
        print("      RedirectVizTo is a new console func — needs a firmware with that hook.", file=sys.stderr)
        raise SystemExit(1)
    except urllib.error.URLError as exc:
        print(f"poke  failed: {exc.reason}", file=sys.stderr)
        raise SystemExit(1)


def selftest(port: int) -> int:
    sock = bind_viz("127.0.0.1", port)
    sender = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sender.sendto(ANKICONN, ("127.0.0.1", port))
        sender.sendto(b"\x00FAKE-VIZ-PACKET", ("127.0.0.1", port))
        got = []
        deadline = time.time() + 2.0
        while time.time() < deadline and len(got) < 2:
            try:
                data, addr = sock.recvfrom(MAX_MSG)
            except socket.timeout:
                continue
            got.append((data, addr))
    finally:
        sender.close()
        sock.close()

    if len(got) < 2:
        print(f"selftest FAIL: got {len(got)} datagram(s), wanted 2", file=sys.stderr)
        return 1
    if got[0][0] != ANKICONN:
        print(f"selftest FAIL: first packet was {got[0][0]!r}, not ANKICONN", file=sys.stderr)
        return 1
    print(f"selftest OK  handshake {got[0][1]}  payload {len(got[1][0])}B from {got[1][1]}")
    return 0


def listen(bind: str, port: int, robot: str | None = None, host_ip: str | None = None) -> None:
    sock = bind_viz(bind, port)
    ips = local_ipv4s()
    print(f"listening UDP {bind}:{port}  max {MAX_MSG}B")
    if ips:
        print("this host looks like: " + ", ".join(ips))
        print("after the robot has RedirectVizTo, expect ANKICONN then a stream of MessageViz packets.")
        print("example (needs firmware with RedirectVizTo):")
        print(f"  curl \"http://ROBOT:8888/consolefunccall?func=RedirectVizTo&args={ips[0]}\"")
    else:
        print("could not guess a LAN IP — pass one you know the robot can route to.")
    if robot:
        poke_ip = host_ip or (ips[0] if ips else None)
        if not poke_ip:
            print("need --host-ip (could not guess a LAN address)", file=sys.stderr)
            sock.close()
            raise SystemExit(1)
        poke_redirect(robot, poke_ip)
    print("ctrl-c to stop")
    print()

    count = 0
    handshakes = 0
    t0 = time.time()
    last_report = t0
    try:
        while True:
            try:
                data, addr = sock.recvfrom(MAX_MSG)
            except socket.timeout:
                now = time.time()
                if count and now - last_report >= 2.0:
                    dt = now - last_report
                    print(f"… {count} pkts so far  (~{(count / max(now - t0, 0.001)):.1f}/s)  last window {dt:.1f}s")
                    last_report = now
                continue

            count += 1
            now = time.time()
            src = f"{addr[0]}:{addr[1]}"
            if data == ANKICONN:
                handshakes += 1
                print(f"{now:.3f}  HANDSHAKE  ANKICONN from {src}  (#{handshakes})")
                continue

            tag = data[0] if data else None
            print(
                f"{now:.3f}  {src}  {len(data):4d}B  tag={tag}  {hexdump(data)}"
            )
            if now - last_report >= 2.0:
                print(f"… {count} pkts  {handshakes} handshakes  ~{(count / max(now - t0, 0.001)):.1f}/s")
                last_report = now
    except KeyboardInterrupt:
        print()
        print(f"stopped  {count} pkts  {handshakes} handshakes  {time.time() - t0:.1f}s")
    finally:
        sock.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Crude Vector Viz UDP listener")
    parser.add_argument("--bind", default="0.0.0.0", help="local bind address (default 0.0.0.0)")
    parser.add_argument("--port", type=int, default=VIZ_PORT, help=f"UDP port (default {VIZ_PORT})")
    parser.add_argument("--selftest", action="store_true", help="send ANKICONN to ourselves and exit")
    parser.add_argument(
        "--robot",
        metavar="IP",
        help="curl RedirectVizTo on this robot after the listener is up (needs new firmware hook)",
    )
    parser.add_argument(
        "--host-ip",
        metavar="IP",
        help="IP the robot should send Viz to (default: first guessed LAN address)",
    )
    args = parser.parse_args()

    if args.selftest:
        return selftest(args.port)

    listen(args.bind, args.port, robot=args.robot, host_ip=args.host_ip)
    return 0


if __name__ == "__main__":
    sys.exit(main())
