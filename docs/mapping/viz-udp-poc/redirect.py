#!/usr/bin/env python3
"""Point a stock (no-rebuild) Vector at this host's Viz UDP listener.

Uses the existing Game-to-Engine path:
  1. UDP register as UI device 1 on robot:5103
  2. Engine connects to us on UDP 5200
  3. Send RedirectViz (G2E 0x6f) with this host's LAN IP
  4. Answer UI pings so the 5 s timeout does not drop Viz

Tags dumped from this tree by dump_g2e_tags.py — they match stock 1.6 G2E.
"""

from __future__ import annotations

import argparse
import socket
import struct
import sys
import time

from listen import ANKICONN, MAX_MSG, VIZ_PORT, bind_viz, hexdump, local_ipv4s

# MessageGameToEngine tags (clad/src/.../messageGameToEngine.clad, this tree)
G2E_AD_REG = 0x4C
G2E_PING = 0x4E
G2E_REDIRECT_VIZ = 0x6F

# MessageEngineToGame
E2G_PING = 0x1F

UI_REG_PORT = 5103
UI_MSG_PORT = 5200
HOST_DEVICE_ID = 1  # CozmoEngine constructs UiMessageHandler(1) → auto-connect


def pack_string(s: str) -> bytes:
    raw = s.encode("utf-8")
    if len(raw) > 255:
        raise ValueError("CLAD default string is uint8-prefixed")
    return bytes([len(raw)]) + raw


def pack_ad_reg(ip: str, port: int, device_id: int = HOST_DEVICE_ID) -> bytes:
    body = struct.pack("<HHBBB", port, port, device_id, 1, 1) + pack_string(ip)
    return bytes([G2E_AD_REG]) + body


def pack_redirect_viz(ip: str) -> bytes:
    octets = [int(p) for p in ip.split(".")]
    if len(octets) != 4 or any(o < 0 or o > 255 for o in octets):
        raise ValueError(f"bad IPv4: {ip}")
    # uint32 memory layout: first octet is first byte (see CozmoEngine::RedirectViz)
    return bytes([G2E_REDIRECT_VIZ]) + bytes(octets)


def pack_ping(counter: int, time_sent_ms: float, is_response: bool) -> bytes:
    return bytes([G2E_PING]) + struct.pack("<IdB", counter & 0xFFFFFFFF, time_sent_ms, 1 if is_response else 0)


def send_ankiconn_and(sock: socket.socket, dest: tuple[str, int], payload: bytes) -> None:
    sock.sendto(ANKICONN, dest)
    sock.sendto(payload, dest)


def run(robot: str, host_ip: str, viz_port: int, ui_port: int, bind: str) -> int:
    viz = bind_viz(bind, viz_port)
    ui = bind_viz(bind, ui_port)

    reg = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    reg.settimeout(0.2)

    print(f"viz listen   UDP {bind}:{viz_port}")
    print(f"ui  listen   UDP {bind}:{ui_port}")
    print(f"registering  {robot}:{UI_REG_PORT} as UI device {HOST_DEVICE_ID} ip={host_ip}")
    print("need inbound on THIS host: UDP {0} (viz) and UDP {1} (engine→us)".format(viz_port, ui_port))
    print("need inbound on ROBOT:     UDP {0} (we→advertisement)".format(UI_REG_PORT))
    print("ctrl-c to stop")
    print()

    dest_reg = (robot, UI_REG_PORT)
    engine_ui: tuple[str, int] | None = None
    redirected = False
    ping_n = 0
    last_reg = 0.0
    last_ping = 0.0
    viz_count = 0
    viz_handshakes = 0
    t0 = time.time()

    try:
        while True:
            now = time.time()

            # one-shot ads expire in 0.25 s — keep shouting until engine connects
            if engine_ui is None and now - last_reg > 0.15:
                try:
                    send_ankiconn_and(reg, dest_reg, pack_ad_reg(host_ip, ui_port))
                except OSError as exc:
                    print(f"reg send failed: {exc}", file=sys.stderr)
                last_reg = now
                if now - t0 > 8.0 and int(now - t0) % 8 == 0:
                    print(
                        f"still no UI connect after {now - t0:.0f}s — "
                        f"robot INPUT may be blocking UDP {UI_REG_PORT} "
                        f"(try: iptables -I INPUT -p udp --dport {UI_REG_PORT} -s {host_ip} -j ACCEPT)"
                    )

            # UI socket: handshake / E2G / pings
            try:
                data, addr = ui.recvfrom(MAX_MSG)
            except socket.timeout:
                data = None
            if data is not None:
                if data == ANKICONN:
                    engine_ui = addr
                    print(f"{now:.3f}  UI HANDSHAKE from {addr[0]}:{addr[1]}")
                    if not redirected:
                        pkt = pack_redirect_viz(host_ip)
                        ui.sendto(pkt, addr)
                        redirected = True
                        print(f"{now:.3f}  sent RedirectViz → {host_ip}  ({pkt.hex()})")
                elif data and data[0] == E2G_PING and len(data) >= 14:
                    counter, tsent, _is_resp = struct.unpack_from("<IdB", data, 1)
                    if engine_ui is None:
                        engine_ui = addr
                    ui.sendto(pack_ping(counter, tsent, True), addr)
                else:
                    tag = data[0] if data else None
                    print(f"{now:.3f}  UI {addr[0]}:{addr[1]}  {len(data)}B  e2g_tag={tag}  {hexdump(data)}")

            # keep-alive even if we missed a ping parse
            if engine_ui is not None and now - last_ping > 1.0:
                ping_n += 1
                ui.sendto(pack_ping(ping_n, now * 1000.0, True), engine_ui)
                last_ping = now

            # Viz socket
            try:
                vdata, vaddr = viz.recvfrom(MAX_MSG)
            except socket.timeout:
                vdata = None
            if vdata is not None:
                viz_count += 1
                if vdata == ANKICONN:
                    viz_handshakes += 1
                    print(f"{now:.3f}  VIZ HANDSHAKE  ANKICONN from {vaddr[0]}:{vaddr[1]}  (#{viz_handshakes})")
                else:
                    print(
                        f"{now:.3f}  VIZ {vaddr[0]}:{vaddr[1]}  {len(vdata):4d}B  "
                        f"tag={vdata[0] if vdata else None}  {hexdump(vdata)}"
                    )
    except KeyboardInterrupt:
        print()
        print(
            f"stopped  viz_pkts={viz_count} viz_handshakes={viz_handshakes}  "
            f"ui_connected={engine_ui is not None} redirected={redirected}  {time.time() - t0:.1f}s"
        )
    finally:
        for s in (viz, ui, reg):
            s.close()
    return 0 if viz_handshakes else 1


def main() -> int:
    p = argparse.ArgumentParser(description="Stock-firmware RedirectViz + Viz listener")
    p.add_argument("robot", help="robot LAN IP")
    p.add_argument("--host-ip", help="this host's LAN IP (the address the robot must send to)")
    p.add_argument("--bind", default="0.0.0.0")
    p.add_argument("--viz-port", type=int, default=VIZ_PORT)
    p.add_argument("--ui-port", type=int, default=UI_MSG_PORT)
    p.add_argument("--dump-packets", action="store_true", help="print packed RedirectViz hex and exit")
    args = p.parse_args()

    host_ip = args.host_ip or (local_ipv4s()[0] if local_ipv4s() else None)
    if not host_ip:
        print("need --host-ip", file=sys.stderr)
        return 1

    if args.dump_packets:
        print("ad_reg     ", pack_ad_reg(host_ip, args.ui_port).hex())
        print("redirect   ", pack_redirect_viz(host_ip).hex())
        return 0

    return run(args.robot, host_ip, args.viz_port, args.ui_port, args.bind)


if __name__ == "__main__":
    sys.exit(main())
