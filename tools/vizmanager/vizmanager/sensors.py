"""Session-only overlay flags. Not persisted.

Cliff / ToF millimetres copied from robot/include/anki/cozmo/shared/cozmoConfig.h.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from vizmanager import theme


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


MM_TO_M = 0.001  # same as world.py
CLIFF_XY_MM = (
    (2.0,  14.0),   # FL
    (2.0, -14.0),   # FR
    (-50.0, 14.0),  # BL
    (-50.0,-14.0),  # BR
)
CLIFF_DOT_HALF_M = 0.004  # 8 mm square; 4 points, closed
PROX_POS_M = (0.010, 0.0, 0.016)
PROX_TILT_RAD = math.radians(6.5)


def _pitch_y(x, y, z, angle):
    """Pitch about +Y (positive looks up)."""
    c = math.cos(angle)
    s = math.sin(angle)
    return (x * c - z * s, y, x * s + z * c)


def _cliff_square_local(cx_m, cy_m):
    h = CLIFF_DOT_HALF_M
    return (
        (cx_m - h, cy_m - h, 0.0),
        (cx_m + h, cy_m - h, 0.0),
        (cx_m + h, cy_m + h, 0.0),
        (cx_m - h, cy_m + h, 0.0),
    )


def cliff_dots_world(world, robot_state):
    """Closed 8 mm squares at each cliff, posed into world metres."""
    if world.robot is None or robot_state is None:
        return []
    pose = world.robot.pose
    flags = int(robot_state.state.cliffDetectedFlags)
    out = []
    for i, (x_mm, y_mm) in enumerate(CLIFF_XY_MM):
        cx = x_mm * MM_TO_M
        cy = y_mm * MM_TO_M
        pts = tuple(world.apply_pose_origin(p, pose) for p in _cliff_square_local(cx, cy))
        color = theme.DANGER if flags & (1 << i) else theme.LIVE
        out.append((pts, color))
    return out


def tof_ray_world(world, robot_state):
    """Body-frame 6.5° pitched ray, or None if missing / NO_UPDATE."""
    if world.robot is None or robot_state is None:
        return None
    prox = robot_state.state.proxData
    status = int(prox.rangeStatus)
    if status == 255:
        return None
    distance_m = float(prox.distance_mm) * MM_TO_M
    ox, oy, oz = PROX_POS_M
    dx, dy, dz = _pitch_y(distance_m, 0.0, 0.0, PROX_TILT_RAD)
    pose = world.robot.pose
    origin = world.apply_pose_origin((ox, oy, oz), pose)
    tip = world.apply_pose_origin((ox + dx, oy + dy, oz + dz), pose)
    color = theme.LIVE if status == 0 else theme.WARN
    return ((origin, tip), color)
