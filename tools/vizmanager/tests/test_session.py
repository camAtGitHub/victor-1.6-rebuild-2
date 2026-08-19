"""Session dispatch: handshake is not MessageViz; tags 24/26/39 increment handlers."""

from __future__ import annotations

import os
import sys
from unittest import mock

import pytest

_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_GENERATED = os.path.join(
    _REPO, "generated", "cladPython", "clad", "vizInterface", "messageViz.py"
)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager import codec  # noqa: E402
from vizmanager.session import Session  # noqa: E402
from vizmanager.udp import ANKICONN  # noqa: E402

_generated_ok = os.path.isfile(_GENERATED) and codec.generated_available()
needs_generated = pytest.mark.skipif(
    not _generated_ok,
    reason="generated CLAD Python missing; run tools/vizmanager/scripts/generate_clad.sh",
)


def test_handshake_does_not_unpack_or_count_tags():
    sess = Session()
    with mock.patch("vizmanager.session.codec.unpack") as unpack:
        sess.process_datagram(ANKICONN, addr=("127.0.0.1", 9))
        unpack.assert_not_called()
    assert sess.handshakes == 1
    assert sess.tag_counts == {}
    assert sess.drops == 0
    assert sess.errors == 0
    assert sess.last_handshake_addr == ("127.0.0.1", 9)


def test_garbage_that_is_not_handshake_does_not_crash():
    sess = Session()
    sess.process_datagram(b"\x00FAKE-VIZ-PACKET")
    sess.process_datagram(b"\xff" * 16)
    sess.process_datagram(b"")
    assert sess.handshakes == 0
    assert sess.tag_counts == {}
    assert sess.errors >= 1
    assert sess.drops == 0


def _pack(tag_name, **fields):
    MessageViz = codec.MessageViz
    payload_cls = MessageViz.typeByTag(getattr(MessageViz.Tag, tag_name))
    payload = payload_cls(**fields)
    return MessageViz(**{tag_name: payload}).pack()


@needs_generated
def test_unknown_tag_drops_silently():
    sess = Session()
    packed = _pack("FaceDetection")  # unused tag; Object/Quad/SetRobot now have world handlers
    sess.process_datagram(packed)
    tag = codec.MessageViz.Tag.FaceDetection
    assert sess.tag_counts[tag] == 1
    assert sess.drops == 1
    assert sess.errors == 0
    assert sess.handshakes == 0


@needs_generated
def test_object_quad_setrobot_handler_counters():
    sess = Session()
    seen = []

    def count(name):
        def handler(msg):
            seen.append(name)

        return handler

    # HANDLERS — later PRs only ADD handlers[tag] = ... in this block. Do not refactor.
    sess.handlers[codec.MessageViz.Tag.Object] = count("Object")
    sess.handlers[codec.MessageViz.Tag.Quad] = count("Quad")
    sess.handlers[codec.MessageViz.Tag.SetRobot] = count("SetRobot")

    sess.process_datagram(_pack("Object"))
    sess.process_datagram(_pack("Quad"))
    sess.process_datagram(_pack("SetRobot"))

    assert seen == ["Object", "Quad", "SetRobot"]
    assert sess.tag_counts[codec.MessageViz.Tag.Object] == 1
    assert sess.tag_counts[codec.MessageViz.Tag.Quad] == 1
    assert sess.tag_counts[codec.MessageViz.Tag.SetRobot] == 1
    assert sess.drops == 0
    assert sess.errors == 0
    assert sess.handshakes == 0
