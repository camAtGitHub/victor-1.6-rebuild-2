"""PR8: MemoryMap tiles, docking STATE, vision-mode HUD, save-to-folder hooks."""

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

from vizmanager import codec, theme  # noqa: E402
from vizmanager.hud import (  # noqa: E402
    DOCK_HALF_FACE,
    DOCK_MM_PER_PIXEL,
    DOCK_RECT_H,
    DOCK_RECT_W,
    IMAGE_SEND_OFF,
    IMAGE_SEND_SINGLE,
    IMAGE_SEND_STREAM,
    Hud,
)
from vizmanager.session import Session  # noqa: E402
from vizmanager.world import NavTile, World, protocol_rgba  # noqa: E402

_generated_ok = os.path.isfile(_GENERATED) and codec.generated_available()
needs_generated = pytest.mark.skipif(
    not _generated_ok,
    reason="generated CLAD Python missing; run tools/vizmanager/scripts/generate_clad.sh",
)


def _pack(tag_name, **fields):
    MessageViz = codec.MessageViz
    payload_cls = MessageViz.typeByTag(getattr(MessageViz.Tag, tag_name))
    payload = payload_cls(**fields)
    return MessageViz(**{tag_name: payload}).pack()


def test_fill_rects_one_mm_per_px_y_flip():
    world = World()
    world.nav_tiles = (NavTile(0x11223344, 0.0, 20.0, 10.0),)
    rects = world.fill_rects(100, 100)
    assert len(rects) == 1
    x, y, w, h, color = rects[0]
    # top-left world (-5, 25) → image (45, 25); edge 10 → 9 px gap.
    assert (x, y, w, h) == (45, 25, 9, 9)
    assert color == 0x11223344
    assert protocol_rgba(color) == (0x11, 0x22, 0x33, 0x44)


def test_fill_rects_clips_negative_origin_and_skips_empty():
    world = World()
    world.nav_tiles = (
        NavTile(1, -52.0, 0.0, 10.0),
        NavTile(2, 0.0, 0.0, 1.0),
    )
    rects = world.fill_rects(100, 100)
    assert len(rects) == 1
    x, y, w, h, color = rects[0]
    assert x == 0
    assert w == 2
    assert color == 1
    assert h > 0


def test_memory_map_begin_clears_info_unused():
    world = World()
    world.nav_nodes = [NavTile(1, 0.0, 0.0, 8.0)]
    world.memory_map_begin(9, info="unused")
    assert world.nav_nodes == []
    assert world.nav_origin_id == 9
    assert world.nav_generation == 0
    world.memory_map_end(9)
    assert world.nav_tiles == ()
    assert world.nav_generation == 1


def test_docking_state_line_and_in_bounds_plot():
    hud = Hud()
    assert hud.docking_state_line() is None
    hud.set_docking(80.0, 10.0, 0.0, 0.0)
    assert hud.docking_state_line() == "ErrSig x:80.0 y:10.0 z:0.0 a:0.00"
    plot = hud.docking_plot()
    assert plot is not None
    assert plot["size"] == (DOCK_RECT_W, DOCK_RECT_H)
    assert plot["robot"] == (0.5 * DOCK_RECT_W, float(DOCK_RECT_H))
    expected_x = 0.5 * DOCK_RECT_W - 10.0 / DOCK_MM_PER_PIXEL
    expected_y = DOCK_RECT_H - 80.0 / DOCK_MM_PER_PIXEL
    assert plot["face"] == (expected_x, expected_y)
    dx = DOCK_HALF_FACE * math.cos(0.0)
    dy = -DOCK_HALF_FACE * math.sin(0.0)
    assert plot["face_line"][0] == (expected_x + dx, expected_y + dy)


def test_docking_plot_none_when_off_display():
    hud = Hud()
    hud.set_docking(1000.0, 0.0, 0.0, 0.0)
    assert hud.docking_plot() is None
    assert hud.docking_state_line() is not None


def test_vision_debug_skips_underscore_modifiers():
    hud = Hud()
    hud.set_vision_mode_debug(("Markers  : 1", "Markers_FullFrame", "Viz      : 1"))
    assert hud.vision_schedule_lines() == ["Markers  : 1", "Viz      : 1"]


def test_vision_mode_colors_use_theme_tokens():
    hud = Hud()
    hud.set_enabled_vision_modes((18,))  # VisionMode::Viz
    names = {name: active for name, active, _color in hud.vision_mode_plain()}
    if not names:
        pytest.skip("generated VisionMode catalog missing")
    assert names.get("Viz") is True
    assert "Faces" not in names
    by_name = {name: color for name, _active, color in hud.vision_mode_plain()}
    assert by_name["Viz"] is theme.TEXT
    motion_color = by_name.get("Motion")
    if motion_color is not None:
        assert motion_color is theme.TEXT_MUTED
    with_mod = hud.vision_mode_with_modifiers()
    bases = [row[0] for row in with_mod]
    assert "Markers" in bases
    assert "Faces" in bases


def test_save_hooks_write_temp_dir(tmp_path):
    hud = Hud()
    images = str(tmp_path / "imgs")
    state = str(tmp_path / "st")
    hud.apply_save_images(IMAGE_SEND_STREAM, images)
    assert os.path.isdir(images)
    dest = hud.save_image("images_1_0.jpg", b"\xff\xd8fake")
    assert dest == os.path.join(images, "images_1_0.jpg")
    with open(dest, "rb") as handle:
        assert handle.read() == b"\xff\xd8fake"
    hud.apply_save_images(IMAGE_SEND_OFF, images)
    assert hud.save_image("nope.jpg", b"x") is None
    assert not os.path.isfile(os.path.join(images, "nope.jpg"))

    hud.apply_save_images(IMAGE_SEND_SINGLE, images)
    hud.save_image("once.jpg", b"once")
    assert hud.image_mode == IMAGE_SEND_OFF
    assert hud.save_image("twice.jpg", b"no") is None

    hud.apply_save_state(True, state)
    assert os.path.isdir(state)
    path = hud.save_state_payload(b"\x01\xab")
    assert path == os.path.join(state, "RobotState.txt")
    with open(path, "r") as handle:
        assert handle.read() == "01ab\n"
    hud.apply_save_state(False, state)
    assert hud.save_state_payload(b"\xff") is None


@needs_generated
def test_session_memory_map_pack_unpack():
    from clad.types.memoryMap import Anki as memory_anki

    Quad = memory_anki.Vector.ExternalInterface.MemoryMapQuadInfoFull
    Info = memory_anki.Vector.ExternalInterface.MemoryMapInfo
    sess = Session()
    begin = _pack("MemoryMapMessageVizBegin", originId=3, info=Info())
    chunk = _pack(
        "MemoryMapMessageViz",
        originId=3,
        quadInfos=(Quad(colorRGBA=0xAABBCCDD, centerX_mm=0.0, centerY_mm=0.0, edgeLen_mm=16.0),),
    )
    end = _pack("MemoryMapMessageVizEnd", originId=3)
    sess.process_datagram(begin)
    sess.process_datagram(chunk)
    sess.process_datagram(end)
    Tag = codec.MessageViz.Tag
    assert sess.tag_counts[Tag.MemoryMapMessageVizBegin] == 1
    assert sess.tag_counts[Tag.MemoryMapMessageViz] == 1
    assert sess.tag_counts[Tag.MemoryMapMessageVizEnd] == 1
    assert sess.drops == 0
    assert sess.world.nav_origin_id == 3
    assert sess.world.nav_generation == 1
    assert len(sess.world.nav_tiles) == 1
    tile = sess.world.nav_tiles[0]
    assert tile.color_rgba == 0xAABBCCDD
    assert tile.edge_len_mm == 16.0
    rects = sess.world.fill_rects(200, 200)
    assert rects[0][4] == 0xAABBCCDD


@needs_generated
def test_session_docking_and_vision_modes():
    from clad.types.visionModes import Anki as vision_anki

    VisionMode = vision_anki.Vector.VisionMode
    sess = Session()
    sess.process_datagram(
        _pack("DockingErrorSignal", x_dist=40.0, y_dist=-8.0, z_dist=1.5, angle=0.25)
    )
    sess.process_datagram(
        _pack("EnabledVisionModes", modes=(VisionMode.Viz, VisionMode.Markers))
    )
    sess.process_datagram(
        _pack(
            "VisionModeDebug",
            debugStrings=("Markers  : 1", "Faces_Smile", "Viz      : 1"),
        )
    )
    assert sess.drops == 0
    assert sess.hud.docking_state_line() == "ErrSig x:40.0 y:-8.0 z:1.5 a:0.25"
    assert VisionMode.Viz in sess.hud.enabled_modes
    assert sess.hud.vision_schedule_lines() == ["Markers  : 1", "Viz      : 1"]
    plain = {name: active for name, active, _c in sess.hud.vision_mode_plain()}
    assert plain["Viz"] is True
    assert "Markers" not in plain
    with_mod = {row[0]: row[1] for row in sess.hud.vision_mode_with_modifiers()}
    assert with_mod["Markers"] is True
    assert with_mod["Faces"] is False


@needs_generated
def test_session_save_hooks_and_ignored_tags(tmp_path):
    sess = Session()
    images = str(tmp_path / "saved_images")
    state = str(tmp_path / "saved_state")
    sess.process_datagram(_pack("SaveImages", mode=IMAGE_SEND_STREAM, path=images))
    sess.process_datagram(_pack("SaveState", enabled=True, path=state))
    assert os.path.isdir(images)
    assert os.path.isdir(state)
    written = sess.hud.save_image("cam.jpg", b"jpg")
    assert os.path.isfile(written)
    hex_path = sess.hud.save_state_payload(b"\xde\xad")
    with open(hex_path, "r") as handle:
        assert handle.read() == "dead\n"

    sess.process_datagram(_pack("FaceDetection"))
    sess.process_datagram(_pack("VisionMarker"))
    sess.process_datagram(_pack("TrackerQuad"))
    Tag = codec.MessageViz.Tag
    assert sess.tag_counts[Tag.FaceDetection] == 1
    assert sess.tag_counts[Tag.VisionMarker] == 1
    assert sess.tag_counts[Tag.TrackerQuad] == 1
    assert sess.drops == 0
    assert sess.errors == 0
