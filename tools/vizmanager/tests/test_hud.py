"""HUD: BehaviorStackDebug order, robot-state fields, labels, animation."""

from __future__ import annotations

import math
import os
import sys

import pytest

_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_GENERATED = os.path.join(
    _REPO, "generated", "cladPython", "clad", "vizInterface", "messageViz.py"
)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _inject_msgbuffers():
    """msgbuffers lives in victor-clad; sparse worktrees may only have generated/."""
    candidates = (
        os.path.join(_REPO, "victor-clad", "tools", "message-buffers", "support", "python"),
        "/home/cam-test/repos/victor-1.6-rebuild-2/victor-clad/tools/message-buffers/support/python",
    )
    for path in candidates:
        if os.path.isdir(os.path.join(path, "msgbuffers")):
            if path not in sys.path:
                sys.path.insert(0, path)
            return


_inject_msgbuffers()

from vizmanager import codec, theme  # noqa: E402

if os.path.isfile(_GENERATED) and not codec.generated_available():
    import importlib

    importlib.reload(codec)

from vizmanager.hud import HUD, lift_height_mm  # noqa: E402
from vizmanager.session import Session  # noqa: E402

_generated_ok = os.path.isfile(_GENERATED) and codec.generated_available()
needs_generated = pytest.mark.skipif(
    not _generated_ok,
    reason="generated CLAD Python missing; run tools/vizmanager/scripts/generate_clad.sh",
)

try:
    import pygame
except ImportError:
    pygame = None

needs_pygame = pytest.mark.skipif(pygame is None, reason="pygame not installed")


def _pack(tag_name, **fields):
    MessageViz = codec.MessageViz
    payload_cls = MessageViz.typeByTag(getattr(MessageViz.Tag, tag_name))
    payload = payload_cls(**fields)
    return MessageViz(**{tag_name: payload}).pack()


def test_stack_order_not_reversed():
    hud = HUD()
    hud.stack = ["HighLevelAI", "Observing"]
    assert hud.stack_lines() == ["HighLevelAI", "Observing"]
    assert hud.stack_lines()[0] == "HighLevelAI"


@needs_generated
def test_unpack_behavior_stack_order_preserved():
    sess = Session()
    packed = _pack("BehaviorStackDebug", debugStrings=("HighLevelAI", "Observing"))
    sess.process_datagram(packed)
    tag = codec.MessageViz.Tag.BehaviorStackDebug
    assert sess.tag_counts[tag] == 1
    assert sess.drops == 0
    assert sess.hud.stack == ["HighLevelAI", "Observing"]
    assert sess.hud.stack[0] == "HighLevelAI"
    assert sess.hud.stack_lines() == ["HighLevelAI", "Observing"]


@needs_generated
def test_stack_message_replaces_not_appends():
    sess = Session()
    sess.process_datagram(_pack("BehaviorStackDebug", debugStrings=("A", "B")))
    sess.process_datagram(_pack("BehaviorStackDebug", debugStrings=("C",)))
    assert sess.hud.stack == ["C"]


@needs_generated
def test_current_animation_and_set_label():
    sess = Session()
    sess.process_datagram(_pack("CurrentAnimation", tag=7, animName="anim_idle"))
    sess.process_datagram(_pack("SetLabel", labelID=0, colorID=0, text="hello"))
    assert sess.hud.anim_name == "anim_idle"
    assert sess.hud.anim_tag == 7
    assert sess.hud.labels[0] == "hello"
    lines = sess.hud.state_lines()
    assert lines[19] == "hello"


@needs_generated
def test_robot_state_pose_head_lift_and_anim():
    MessageViz = codec.MessageViz
    payload_cls = MessageViz.typeByTag(MessageViz.Tag.RobotStateMessage)
    payload = payload_cls()
    payload.state.pose.x = 10.5
    payload.state.pose.y = -3.0
    payload.state.pose.angle = math.radians(90.0)
    payload.state.pose_frame_id = 3
    payload.state.pose_origin_id = 1
    payload.state.headAngle = math.radians(12.5)
    payload.state.liftAngle = 0.0
    payload.state.pose.pitch_angle = math.radians(-2.0)
    payload.state.pose.roll_angle = math.radians(1.0)
    payload.batteryVolts = 3.70
    payload.state.battTemp_C = 25
    packed = MessageViz(RobotStateMessage=payload).pack()

    sess = Session()
    sess.process_datagram(_pack("CurrentAnimation", tag=4, animName="anim_bored"))
    sess.process_datagram(packed)
    lines = sess.hud.state_lines()
    assert "Pose:" in lines[0]
    assert "10.5" in lines[0]
    assert "-3.0" in lines[0]
    assert "90.0" in lines[0]
    assert "fid: 3" in lines[0]
    assert "Head:" in lines[1]
    assert "12.5" in lines[1]
    assert "Lift:" in lines[1]
    assert "%.1f" % lift_height_mm(0.0) in lines[1]
    assert "Pitch:" in lines[2]
    assert "Roll:" in lines[3]
    assert "Acc:" in lines[4]
    assert "Gyro:" in lines[5]
    assert "Cliff:" in lines[6]
    assert "Batt:" in lines[11]
    assert "3.70V" in lines[11]
    assert "anim_bored" in lines[12]
    assert "[4]" in lines[12]


def test_session_registers_hud_handlers():
    sess = Session()
    assert isinstance(sess.hud, HUD)
    if codec.generated_available():
        Tag = codec.MessageViz.Tag
        assert sess.handlers[Tag.BehaviorStackDebug] == sess.hud.handle_behavior_stack
        assert sess.handlers[Tag.RobotStateMessage] == sess.hud.handle_robot_state
        assert sess.handlers[Tag.SetLabel] == sess.hud.handle_set_label
        assert sess.handlers[Tag.CurrentAnimation] == sess.hud.handle_current_animation
    else:
        assert sess.handlers[51] == sess.hud.handle_behavior_stack
        assert sess.handlers[22] == sess.hud.handle_robot_state
        assert sess.handlers[44] == sess.hud.handle_set_label
        assert sess.handlers[23] == sess.hud.handle_current_animation


def test_hud_uses_theme_tokens_not_hex():
    import inspect
    from vizmanager import hud as hud_mod

    src = inspect.getsource(hud_mod)
    assert "theme.BG_PANEL" in src
    assert "theme.TEXT" in src
    assert "theme.TEXT_MUTED" in src
    assert "theme.FONT_MONO" in src
    assert "theme.FONT_HUD_PX" in src
    for banned in ("#00FF00", "#00FFFF", "#0B0D10", "#161B22", "#E8EDF2"):
        assert banned not in src


@needs_pygame
def test_draw_stack_engine_order_on_surface():
    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
    pygame.font.init()
    hud = HUD()
    hud.stack = ["HighLevelAI", "Observing"]
    surface = pygame.Surface((320, 120))
    hud.draw_stack(surface)
    assert hud.stack_lines() == ["HighLevelAI", "Observing"]
    assert tuple(surface.get_at((0, 0))[:3]) == theme.BG_PANEL


@needs_pygame
def test_draw_empty_stack_placeholder():
    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
    pygame.font.init()
    hud = HUD()
    surface = pygame.Surface((320, 64))
    hud.draw_stack(surface)
    assert tuple(surface.get_at((0, 0))[:3]) == theme.BG_PANEL
    assert hud.stack_lines() == []
