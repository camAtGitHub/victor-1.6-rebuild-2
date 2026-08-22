"""Hardcoded G2E pack tests for stock RedirectViz (no generated CLAD required)."""

from __future__ import annotations

import os
import struct
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager.connect import (  # noqa: E402
    ANKICONN,
    E2G_PING,
    G2E_AD_REG,
    G2E_PING,
    G2E_REDIRECT_VIZ,
    HOST_DEVICE_ID,
    UI_MSG_PORT,
    UI_REG_PORT,
    pack_ad_reg,
    pack_ping,
    pack_redirect_viz,
    send_ankiconn_and,
)


def test_pack_redirect_viz_192_168_50_10():
    # uint32 memory layout: first octet is first byte (CozmoEngine::RedirectViz)
    assert pack_redirect_viz("192.168.50.10").hex() == "6fc0a8320a"


def test_pack_redirect_viz_structure():
    pkt = pack_redirect_viz("10.0.0.1")
    assert pkt[0] == G2E_REDIRECT_VIZ == 0x6F
    assert list(pkt[1:]) == [10, 0, 0, 1]
    assert len(pkt) == 5


def test_pack_redirect_viz_rejects_bad_ip():
    for bad in ("192.168.50", "192.168.50.10.1", "192.168.50.256", "not-an-ip", ""):
        try:
            pack_redirect_viz(bad)
        except ValueError:
            continue
        raise AssertionError(f"expected ValueError for {bad!r}")


def test_pack_ad_reg_structure():
    ip = "192.168.50.10"
    pkt = pack_ad_reg(ip, UI_MSG_PORT)
    assert pkt[0] == G2E_AD_REG == 0x4C
    to_engine, from_engine, device_id, enable, oneshot = struct.unpack_from("<HHBBB", pkt, 1)
    assert to_engine == from_engine == UI_MSG_PORT == 5200
    assert device_id == HOST_DEVICE_ID == 1
    assert enable == 1
    assert oneshot == 1
    str_off = 1 + struct.calcsize("<HHBBB")
    slen = pkt[str_off]
    assert slen == len(ip)
    assert pkt[str_off + 1 : str_off + 1 + slen] == ip.encode("utf-8")
    assert len(pkt) == str_off + 1 + slen


def test_pack_ping_structure():
    pkt = pack_ping(42, 1234.5, True)
    assert pkt[0] == G2E_PING == 0x4E
    counter, tsent, is_resp = struct.unpack_from("<IdB", pkt, 1)
    assert counter == 42
    assert tsent == 1234.5
    assert is_resp == 1
    pkt0 = pack_ping(0x1FFFFFFFF, 0.0, False)  # masked to uint32
    counter0, tsent0, is_resp0 = struct.unpack_from("<IdB", pkt0, 1)
    assert counter0 == 0xFFFFFFFF
    assert tsent0 == 0.0
    assert is_resp0 == 0


def test_send_ankiconn_and_order():
    sent: list[tuple[bytes, tuple[str, int]]] = []

    class FakeSock:
        def sendto(self, data, dest):
            sent.append((data, dest))

    dest = ("192.168.50.155", UI_REG_PORT)
    payload = pack_ad_reg("192.168.50.10", UI_MSG_PORT)
    send_ankiconn_and(FakeSock(), dest, payload)
    assert sent == [(ANKICONN, dest), (payload, dest)]


def test_constants():
    assert UI_REG_PORT == 5103
    assert UI_MSG_PORT == 5200
    assert HOST_DEVICE_ID == 1
    assert E2G_PING == 0x1F
    assert ANKICONN == b"ANKICONN"
