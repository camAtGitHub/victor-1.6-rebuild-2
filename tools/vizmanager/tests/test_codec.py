"""MessageViz codec tests. Skip if generated CLAD Python is missing."""

from __future__ import annotations

import os
import sys

import pytest

# tools/vizmanager/tests → repo root
_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_GENERATED = os.path.join(
    _REPO, "generated", "cladPython", "clad", "vizInterface", "messageViz.py"
)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager import codec  # noqa: E402

pytestmark = pytest.mark.skipif(
    not os.path.isfile(_GENERATED) or not codec.generated_available(),
    reason="generated CLAD Python missing; run tools/vizmanager/scripts/generate_clad.sh",
)


def test_import_message_viz():
    assert codec.MessageViz is not None
    assert codec.MessageViz.__name__ == "MessageViz"


def test_union_tag_names_from_generated():
    """Tag names come from generated union members, not a hand-rolled table."""
    MessageViz = codec.MessageViz
    by_value = MessageViz._tags_by_value
    assert by_value[19] == "ImageChunk"
    assert by_value[22] == "RobotStateMessage"
    assert by_value[24] == "Object"
    assert by_value[39] == "SetRobot"
    assert by_value[51] == "BehaviorStackDebug"
    assert MessageViz.Tag.ImageChunk == 19
    assert MessageViz.Tag.RobotStateMessage == 22
    assert MessageViz.Tag.Object == 24
    assert MessageViz.Tag.SetRobot == 39
    assert MessageViz.Tag.BehaviorStackDebug == 51


def test_unpack_packed_behavior_stack():
    MessageViz = codec.MessageViz
    payload_cls = MessageViz.typeByTag(MessageViz.Tag.BehaviorStackDebug)
    payload = payload_cls(debugStrings=("HighLevelAI", "Observing"))
    packed = MessageViz(BehaviorStackDebug=payload).pack()
    msg, tag = codec.unpack(packed)
    assert tag == MessageViz.Tag.BehaviorStackDebug
    assert msg.tag_name == "BehaviorStackDebug"
    assert list(msg.data.debugStrings) == ["HighLevelAI", "Observing"]
