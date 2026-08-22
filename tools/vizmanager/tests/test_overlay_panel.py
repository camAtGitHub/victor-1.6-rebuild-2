"""OverlaySettings + WORLD-satellite overlay panel (not a layout pane)."""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager import overlay_panel, theme
from vizmanager.app import DEFAULT_SIZE, layout_rects
from vizmanager.sensors import OverlaySettings

_VIZ = os.path.join(os.path.dirname(__file__), "..", "vizmanager")
_HEX = re.compile(r"#[0-9A-Fa-f]{3,8}\b")

_SENSOR_FIELDS = (
    "cliff_hud",
    "white_hud",
    "tof_hud",
    "path_seg_hud",
    "cliff_dots",
    "tof_ray",
    "path_highlight",
    "camera_overlays",
)


def test_overlay_settings_defaults():
    settings = OverlaySettings()
    for name in _SENSOR_FIELDS:
        assert getattr(settings, name) is True
    assert settings.panel_open is False


def test_checkbox_fields_match_labels():
    assert overlay_panel.CHECKBOX_FIELDS == _SENSOR_FIELDS
    labels = [label for _f, label, _r, _i in overlay_panel.iter_rows((0, 0, 800, 800))]
    assert labels == [
        "Cliffs",
        "White",
        "ToF",
        "Path segment",
        "Cliff sensors",
        "ToF ray",
        "Active path",
        "Protocol overlays",
    ]


def test_checkbox_hit_flips_cliff_dots():
    settings = OverlaySettings()
    assert settings.cliff_dots is True
    world_view = layout_rects(*DEFAULT_SIZE)["world_view"]
    target = None
    for field, _label, rect, _index in overlay_panel.iter_rows(world_view):
        if field == "cliff_dots":
            target = rect
            break
    assert target is not None
    assert target[3] >= 32
    cx = target[0] + target[2] // 2
    cy = target[1] + target[3] // 2
    assert overlay_panel.hit_checkbox((cx, cy), world_view) == "cliff_dots"
    overlay_panel.toggle_field(settings, "cliff_dots")
    assert settings.cliff_dots is False


def test_row_hit_at_least_32px_and_panel_clipped():
    world_view = layout_rects(*DEFAULT_SIZE)["world_view"]
    panel = overlay_panel.panel_rect(world_view)
    assert panel[2] <= overlay_panel.PANEL_W
    assert panel[0] >= world_view[0]
    assert panel[1] >= world_view[1]
    assert panel[0] + panel[2] <= world_view[0] + world_view[2]
    assert panel[1] + panel[3] <= world_view[1] + world_view[3]
    for _field, _label, rect, _index in overlay_panel.iter_rows(world_view):
        assert rect[3] >= 32


def test_keyboard_focus_wrap_and_toggle_index():
    settings = OverlaySettings()
    assert overlay_panel.move_focus(0, -1) == len(overlay_panel.CHECKBOX_FIELDS) - 1
    assert overlay_panel.move_focus(7, 1) == 0
    field = overlay_panel.toggle_index(settings, overlay_panel.CHECKBOX_FIELDS.index("cliff_dots"))
    assert field == "cliff_dots"
    assert settings.cliff_dots is False
    overlay_panel.toggle_open(settings)
    assert settings.panel_open is True
    assert overlay_panel.close_if_open(settings) is True
    assert settings.panel_open is False
    assert overlay_panel.close_if_open(settings) is False


def test_focus_ring_is_2px_accent():
    assert overlay_panel.FOCUS_W == 2
    src = open(os.path.join(_VIZ, "overlay_panel.py"), encoding="utf-8").read()
    assert "theme.ACCENT" in src
    assert "FOCUS_W" in src


def test_no_raw_hex_in_overlay_sources():
    for name in ("overlay_panel.py", "sensors.py"):
        text = open(os.path.join(_VIZ, name), encoding="utf-8").read()
        assert _HEX.search(text) is None, name


def test_overlay_panel_not_accent_dim_fill():
    text = open(os.path.join(_VIZ, "overlay_panel.py"), encoding="utf-8").read()
    assert "ACCENT_DIM" not in text
    assert "theme.LIVE" in text
    assert "theme.TEXT" in text


def test_layout_rects_has_no_overlay_pane():
    keys = set(layout_rects(*DEFAULT_SIZE))
    assert "settings" not in keys
    assert "overlays" not in keys
    assert "overlay" not in keys
    assert "world_view" in keys
