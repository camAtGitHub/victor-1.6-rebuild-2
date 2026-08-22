"""Cliff / ToF geometry from cozmoConfig.h. No invented millimetres."""

from __future__ import annotations

import math
import os
import re
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager import theme  # noqa: E402
from vizmanager.sensors import (  # noqa: E402
    CLIFF_DOT_HALF_M,
    CLIFF_XY_MM,
    MM_TO_M,
    PROX_POS_M,
    PROX_TILT_RAD,
    cliff_dots_world,
    tof_ray_world,
)
from vizmanager.world import World  # noqa: E402
from vizmanager.world import MM_TO_M as WORLD_MM_TO_M  # noqa: E402

_HEX = re.compile(r"#[0-9A-Fa-f]{3,8}\b")
_VIZ = os.path.join(os.path.dirname(__file__), "..", "vizmanager")


def _robot(**kw):
    fields = dict(
        x_trans_m=0.0,
        y_trans_m=0.0,
        z_trans_m=0.0,
        rot_rad=0.0,
        rot_axis_x=0.0,
        rot_axis_y=0.0,
        rot_axis_z=1.0,
        head_angle=0.0,
        lift_angle=0.0,
    )
    fields.update(kw)
    return SimpleNamespace(**fields)


def _state(cliff_flags=0, range_status=0, distance_mm=100):
    return SimpleNamespace(
        state=SimpleNamespace(
            cliffDetectedFlags=cliff_flags,
            proxData=SimpleNamespace(
                rangeStatus=range_status,
                distance_mm=distance_mm,
            ),
        )
    )


def _centroid(pts):
    n = float(len(pts))
    return (
        sum(p[0] for p in pts) / n,
        sum(p[1] for p in pts) / n,
        sum(p[2] for p in pts) / n,
    )


def test_config_millimetres_match_cozmo_config():
    assert MM_TO_M == WORLD_MM_TO_M == 0.001
    assert CLIFF_XY_MM[0] == (2.0, 14.0)
    assert CLIFF_XY_MM[1] == (2.0, -14.0)
    assert CLIFF_XY_MM[2] == (-50.0, 14.0)
    assert CLIFF_XY_MM[3] == (-50.0, -14.0)
    assert CLIFF_DOT_HALF_M == 0.004
    assert PROX_POS_M == (0.010, 0.0, 0.016)
    assert PROX_TILT_RAD == pytest.approx(math.radians(6.5))


def test_missing_robot_or_state_is_empty():
    state = _state()
    assert cliff_dots_world(World(), state) == []
    assert tof_ray_world(World(), state) is None
    world = World()
    world.set_robot(_robot())
    assert cliff_dots_world(world, None) == []
    assert tof_ray_world(world, None) is None


def test_fl_local_before_origin():
    world = World()
    world.set_robot(_robot())
    dots = cliff_dots_world(world, _state())
    assert len(dots) == 4
    fl_pts, color = dots[0]
    assert len(fl_pts) == 4
    assert _centroid(fl_pts) == pytest.approx((0.002, 0.014, 0.0))
    assert fl_pts[0] == pytest.approx((-0.002, 0.010, 0.0))
    assert color == theme.LIVE
    world.set_viz_origin(
        SimpleNamespace(
            rot_rad=0.0,
            rot_axis_x=0.0,
            rot_axis_y=0.0,
            rot_axis_z=1.0,
            trans_x_mm=1000.0,
            trans_y_mm=0.0,
            trans_z_mm=0.0,
        )
    )
    shifted = cliff_dots_world(world, _state())[0][0]
    assert _centroid(shifted) == pytest.approx((1.002, 0.014, 0.0))


def test_cliff_flag_bit_is_danger():
    world = World()
    world.set_robot(_robot())
    dots = cliff_dots_world(world, _state(cliff_flags=0x01))
    assert dots[0][1] == theme.DANGER
    assert dots[1][1] == theme.LIVE
    assert dots[2][1] == theme.LIVE
    assert dots[3][1] == theme.LIVE
    br = cliff_dots_world(world, _state(cliff_flags=1 << 3))
    assert br[3][1] == theme.DANGER
    assert br[0][1] == theme.LIVE


def test_tof_origin_and_pitched_tip():
    world = World()
    world.set_robot(_robot(head_angle=1.2))
    pts, color = tof_ray_world(world, _state(range_status=0, distance_mm=100))
    origin, tip = pts
    assert origin == pytest.approx(PROX_POS_M)
    distance_m = 0.100
    dx = distance_m * math.cos(PROX_TILT_RAD)
    dz = distance_m * math.sin(PROX_TILT_RAD)
    assert tip[0] == pytest.approx(PROX_POS_M[0] + dx)
    assert tip[1] == pytest.approx(0.0)
    assert tip[2] == pytest.approx(PROX_POS_M[2] + dz)
    assert tip[0] > origin[0]
    assert tip[2] > origin[2]
    assert color == theme.LIVE


def test_tof_skips_no_update_and_warns_otherwise():
    world = World()
    world.set_robot(_robot())
    assert tof_ray_world(world, _state(range_status=255)) is None
    _pts, color = tof_ray_world(world, _state(range_status=1, distance_mm=50))
    assert color == theme.WARN


def test_no_hex_in_sensors_or_views():
    for name in ("sensors.py", "view2d.py", "view3d.py"):
        text = open(os.path.join(_VIZ, name), encoding="utf-8").read()
        assert _HEX.search(text) is None, name
