"""Session-only overlay flags. Not persisted."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class OverlaySettings:
    """Session-only. Defaults ON. panel_open is UI chrome, not a sensor."""
    cliff_hud: bool = True
    white_hud: bool = True
    tof_hud: bool = True
    path_seg_hud: bool = True
    cliff_dots: bool = True
    tof_ray: bool = True
    path_highlight: bool = True
    camera_overlays: bool = True
    panel_open: bool = False
