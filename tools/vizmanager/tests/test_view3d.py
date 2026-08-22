"""View3D headless meshes: cuboids, origin compose, 4 Hz throttle. No display."""

from __future__ import annotations

import math
import os
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager import theme  # noqa: E402
from vizmanager.sensors import OverlaySettings  # noqa: E402
from vizmanager.view2d import View2D  # noqa: E402
from vizmanager.view3d import (  # noqa: E402
    AXIS_LEN_M,
    CANVAS_KEYS,
    DRAW_OBJECTS_RATE_SEC,
    View3D,
    _MAX_ORBIT_VEL,
    _MIN_ORBIT_DT,
    _clamp_orbit_vel,
    _orbit_dt,
    _pan_axes,
    vispy_available,
)
from vizmanager.world import (  # noqa: E402
    VIZ_OBJECT_CHARGER,
    VIZ_OBJECT_CUBOID,
    VIZ_OBJECT_HUMAN_HEAD,
    VIZ_OBJECT_PREDOCKPOSE,
    VIZ_OBJECT_ROBOT,
    VIZ_OBJECT_TEXT,
    MM_TO_M,
    World,
)


def _obj(**kw):
    fields = dict(
        objectID=1,
        objectTypeID=VIZ_OBJECT_CUBOID,
        color=0x11223344,
        x_size_m=0.044,
        y_size_m=0.044,
        z_size_m=0.044,
        x_trans_m=0.1,
        y_trans_m=0.2,
        z_trans_m=0.0,
        rot_deg=0.0,
        rot_axis_x=0.0,
        rot_axis_y=0.0,
        rot_axis_z=1.0,
        objParameters=(0.0, 0.0, 0.0, 0.0),
        text="",
    )
    fields.update(kw)
    return SimpleNamespace(**fields)


def _line(**kw):
    fields = dict(
        identifier="seg",
        color=0xAABBCCDD,
        origin=(0.0, 0.0, 0.0),
        dest=(1.0, 0.0, 0.0),
        clearPrevious=False,
    )
    fields.update(kw)
    return SimpleNamespace(**fields)


def _quad(**kw):
    fields = dict(
        quadType=1,
        quadID=7,
        color=0x01020304,
        xUpperLeft=0.0,
        yUpperLeft=0.1,
        zUpperLeft=0.0,
        xLowerLeft=0.0,
        yLowerLeft=0.0,
        zLowerLeft=0.0,
        xUpperRight=0.1,
        yUpperRight=0.1,
        zUpperRight=0.0,
        xLowerRight=0.1,
        yLowerRight=0.0,
        zLowerRight=0.0,
    )
    fields.update(kw)
    return SimpleNamespace(**fields)


def _path_line(path_id=3, **kw):
    fields = dict(
        pathID=path_id,
        x_start_m=0.0,
        y_start_m=0.0,
        z_start_m=0.0,
        x_end_m=0.5,
        y_end_m=0.0,
        z_end_m=0.0,
    )
    fields.update(kw)
    return SimpleNamespace(**fields)


def _path_arc(path_id=3, **kw):
    fields = dict(
        pathID=path_id,
        x_center_m=0.0,
        y_center_m=0.0,
        radius_m=1.0,
        start_rad=0.0,
        sweep_rad=0.4,
    )
    fields.update(kw)
    return SimpleNamespace(**fields)


def _robot_state(curr=0):
    return SimpleNamespace(state=SimpleNamespace(currPathSegment=curr))


def _robot(**kw):
    fields = dict(
        x_trans_m=0.25,
        y_trans_m=-0.1,
        z_trans_m=0.0,
        rot_rad=0.0,
        rot_axis_x=0.0,
        rot_axis_y=0.0,
        rot_axis_z=1.0,
        head_angle=0.3,
        lift_angle=-0.1,
    )
    fields.update(kw)
    return SimpleNamespace(**fields)


def _xs(mesh):
    return [p[0] for p in mesh.points]


def test_cuboid_size_matches_xyz_size_m():
    w = World()
    w.set_object(
        _obj(x_trans_m=0.0, y_trans_m=0.0, z_trans_m=0.0, x_size_m=0.2, y_size_m=0.1, z_size_m=0.08)
    )
    view = View3D(w)
    cuboids = [m for m in view.meshes() if m.kind == "cuboid"]
    assert len(cuboids) == 1
    pts = cuboids[0].points
    assert len(pts) == 24  # 12 edges × 2
    xs, ys, zs = zip(*pts)
    assert min(xs) == pytest.approx(-0.1)
    assert max(xs) == pytest.approx(0.1)
    assert min(ys) == pytest.approx(-0.05)
    assert max(ys) == pytest.approx(0.05)
    assert min(zs) == pytest.approx(-0.04)
    assert max(zs) == pytest.approx(0.04)
    assert cuboids[0].color == (0x11, 0x22, 0x33)


def test_origin_change_moves_world_not_just_robot():
    w = World()
    w.set_object(_obj(x_trans_m=0.0, y_trans_m=0.0, z_trans_m=0.0))
    w.set_robot(_robot(x_trans_m=0.0, y_trans_m=0.0))
    view = View3D(w)
    before_obj = [m for m in view.meshes() if m.kind == "cuboid"][0]
    before_robot = [m for m in view.meshes() if m.kind == "robot"][0]
    w.set_viz_origin(
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
    assert w.origin.x == pytest.approx(1000.0 * MM_TO_M)
    after_obj = [m for m in view.meshes() if m.kind == "cuboid"][0]
    after_robot = [m for m in view.meshes() if m.kind == "robot"][0]
    assert min(_xs(after_obj)) == pytest.approx(min(_xs(before_obj)) + 1.0)
    assert min(_xs(after_robot)) == pytest.approx(min(_xs(before_robot)) + 1.0)


def test_show_objects_false_hides_without_erase():
    w = World()
    w.set_object(_obj())
    w.set_quad(_quad())
    w.append_path_line(_path_line(path_id=1))
    w.set_robot(_robot())
    view = View3D(w)
    kinds_before = {m.kind for m in view.meshes()}
    assert "cuboid" in kinds_before
    assert "polyline" in kinds_before
    w.set_show_objects(0)
    assert 1 in w.objects
    hidden = view.meshes()
    assert all(m.kind == "robot" for m in hidden)
    assert hidden


def test_path_color_falls_back_to_theme_path():
    w = World()
    w.append_path_line(_path_line(path_id=9))
    view = View3D(w)
    paths = [m for m in view.meshes() if m.kind == "polyline"]
    assert paths
    assert paths[0].color == theme.PATH


def _line_then_arc_world():
    w = World()
    w.append_path_line(_path_line(path_id=1))
    w.append_path_arc(_path_arc(path_id=1))
    return w


def _accent_paths(meshes):
    return [m for m in meshes if m.kind == "polyline" and m.color == theme.ACCENT]


def _protocol_paths(meshes):
    return [m for m in meshes if m.kind == "polyline" and m.color != theme.ACCENT]


def test_path_highlight_line_then_arc_segment_0():
    w = _line_then_arc_world()
    path = w.paths[1]
    color_before = path.color
    view = View3D(w)
    meshes = view.meshes(settings=OverlaySettings(), robot_state=_robot_state(0))
    protocol = _protocol_paths(meshes)
    accent = _accent_paths(meshes)
    assert len(protocol) == 2
    assert all(m.color == theme.PATH for m in protocol)
    assert len(accent) == 1
    expected = tuple(w.apply_origin(*p) for p in path.segment_polyline_m(0))
    assert accent[0].points == expected
    assert expected == ((0.0, 0.0, 0.0), (0.5, 0.0, 0.0))
    assert accent[0].connect == "strip"
    assert path.color is color_before
    assert not _accent_paths(view.meshes())


def test_path_highlight_line_then_arc_segment_1():
    w = _line_then_arc_world()
    path = w.paths[1]
    view = View3D(w)
    meshes = view.meshes(settings=OverlaySettings(), robot_state=_robot_state(1))
    accent = _accent_paths(meshes)
    protocol = _protocol_paths(meshes)
    assert len(protocol) == 2
    assert all(m.color == theme.PATH for m in protocol)
    assert len(accent) == 1
    expected = tuple(w.apply_origin(*p) for p in path.segment_polyline_m(1))
    assert accent[0].points == expected
    assert expected == tuple(path.arcs[0].points_m())


def test_path_highlight_out_of_range_and_disabled():
    w = _line_then_arc_world()
    view = View3D(w)
    off = OverlaySettings()
    off.path_highlight = False
    assert not _accent_paths(view.meshes(settings=off, robot_state=_robot_state(0)))
    assert not _accent_paths(
        view.meshes(settings=OverlaySettings(), robot_state=_robot_state(5))
    )
    assert not _accent_paths(
        view.meshes(settings=OverlaySettings(), robot_state=_robot_state(-1))
    )
    protocol = _protocol_paths(
        view.meshes(settings=OverlaySettings(), robot_state=_robot_state(5))
    )
    assert len(protocol) == 2
    assert all(m.color == theme.PATH for m in protocol)


def test_path_highlight_hidden_when_show_objects_false():
    w = _line_then_arc_world()
    view = View3D(w)
    w.set_show_objects(0)
    meshes = view.meshes(settings=OverlaySettings(), robot_state=_robot_state(0))
    assert not any(m.kind == "polyline" for m in meshes)


def test_text_is_skipped():
    w = World()
    w.set_object(_obj(objectTypeID=VIZ_OBJECT_TEXT, objectID=2))
    view = View3D(w)
    assert view.meshes() == ()


def test_charger_wedge_from_proto_sizes():
    w = World()
    w.set_object(
        _obj(
            objectTypeID=VIZ_OBJECT_CHARGER,
            x_size_m=0.2,
            y_size_m=0.1,
            z_size_m=0.05,
            x_trans_m=0.0,
            y_trans_m=0.0,
            z_trans_m=0.0,
            objParameters=(0.5, 0.0, 0.0, 0.0),
        )
    )
    view = View3D(w)
    chargers = [m for m in view.meshes() if m.kind == "charger"]
    assert len(chargers) == 1
    xs, ys, zs = zip(*chargers[0].points)
    # slope = 0.5 * 0.2 = 0.1; back = 0.2 + 0.1 = 0.3
    assert min(xs) == pytest.approx(0.0)
    assert max(xs) == pytest.approx(0.3)
    assert min(zs) == pytest.approx(0.0)
    assert max(zs) == pytest.approx(0.05)
    assert min(ys) == pytest.approx(-0.05)
    assert max(ys) == pytest.approx(0.05)


def test_pose_marker_has_z_offset():
    w = World()
    w.set_object(
        _obj(
            objectTypeID=VIZ_OBJECT_ROBOT,
            x_trans_m=0.0,
            y_trans_m=0.0,
            z_trans_m=0.0,
        )
    )
    view = View3D(w)
    markers = [m for m in view.meshes() if m.kind == "pose_marker"]
    assert len(markers) == 1
    zs = [p[2] for p in markers[0].points]
    assert min(zs) == pytest.approx(0.080)
    w.set_object(
        _obj(
            objectID=2,
            objectTypeID=VIZ_OBJECT_PREDOCKPOSE,
            x_trans_m=1.0,
            y_trans_m=0.0,
            z_trans_m=0.0,
        )
    )
    kinds = {m.kind for m in view.meshes()}
    assert "pose_marker" in kinds


def test_human_head_is_box():
    w = World()
    w.set_object(
        _obj(
            objectTypeID=VIZ_OBJECT_HUMAN_HEAD,
            x_size_m=0.0,
            y_size_m=0.0,
            z_size_m=0.0,
            x_trans_m=0.0,
            y_trans_m=0.0,
            z_trans_m=0.0,
        )
    )
    view = View3D(w)
    heads = [m for m in view.meshes() if m.kind == "head"]
    assert len(heads) == 1
    assert len(heads[0].points) == 24


def test_axes_100mm_rgb():
    view = View3D(World())
    axes = view.axes_lines()
    assert len(axes) == 3
    assert axes[0].color == (255, 0, 0)
    assert axes[1].color == (0, 255, 0)
    assert axes[2].color == (0, 0, 255)
    assert axes[0].points[1][0] == pytest.approx(AXIS_LEN_M)
    assert AXIS_LEN_M == pytest.approx(0.100)


def test_grid_uses_theme_grid_token():
    view = View3D(World())
    lines = view.grid_lines()
    assert lines
    assert all(m.kind == "grid" for m in lines)
    assert all(m.color == theme.GRID for m in lines)


def test_canvas_keys_do_not_bind_escape():
    assert CANVAS_KEYS is None


def test_orbit_dt_and_vel_clamped():
    assert _orbit_dt(1e-4) == pytest.approx(_MIN_ORBIT_DT)
    assert _orbit_dt(0.0) == pytest.approx(_MIN_ORBIT_DT)
    assert _orbit_dt(0.05) == pytest.approx(0.05)
    flung = (10.0 * 0.4) / 1e-4
    assert flung > _MAX_ORBIT_VEL
    assert _clamp_orbit_vel(flung) == pytest.approx(_MAX_ORBIT_VEL)
    assert _clamp_orbit_vel(-flung) == pytest.approx(-_MAX_ORBIT_VEL)


class _FakeTimer:
    def __init__(self):
        self.started = 0
        self.stopped = 0

    def start(self):
        self.started += 1

    def stop(self):
        self.stopped += 1


def test_coast_timer_restarts_after_stop():
    view = View3D(World())
    view.canvas = object()
    view._az_vel = 80.0
    fake = _FakeTimer()
    view._timer = fake
    view._arm_coast_timer()
    assert fake.started == 1
    fake.stop()
    view._arm_coast_timer()
    assert fake.started == 2


def test_close_stops_timers():
    view = View3D(World())
    t1, t2 = _FakeTimer(), _FakeTimer()
    view._timer = t1
    view._draw_timer = t2
    view.close()
    assert t1.stopped == 1
    assert t2.stopped == 1
    assert view._timer is None
    assert view._draw_timer is None


def test_pan_uses_camera_right_and_up():
    view = View3D(World())
    view.azimuth = 0.0
    view.elevation = 0.0
    right, cam_up = _pan_axes(0.0, 0.0)
    assert right[0] == pytest.approx(1.0)
    assert right[1] == pytest.approx(0.0)
    assert cam_up[2] == pytest.approx(1.0)
    before = view.center
    view._pan(10.0, 0.0)
    assert view.center[0] < before[0]
    view.center = before
    view.elevation = 25.0
    _r, up25 = _pan_axes(0.0, 25.0)
    assert up25[1] == pytest.approx(math.sin(math.radians(25.0)))
    assert abs(up25[2]) < 1.0
    view._pan(0.0, 10.0)
    assert view.center[1] != pytest.approx(before[1])
    assert view.center[2] != pytest.approx(before[2])


def test_tick_force_skips_interval_gate():
    view = View3D(World())
    assert view.tick(now=0.0) is True
    assert view.tick(now=0.1) is False
    assert view.tick(now=0.1, force=True) is True


def test_rebuild_throttled_to_4hz():
    assert DRAW_OBJECTS_RATE_SEC == pytest.approx(0.25)
    view = View3D(World())
    assert view.tick(now=0.0) is True
    assert view.tick(now=0.1) is False
    assert view.tick(now=0.24) is False
    assert view.tick(now=0.25) is True
    view.set_paused(True)
    assert view.tick(now=1.0) is False


def test_frame_robot_sets_center():
    w = World()
    w.set_robot(_robot(x_trans_m=1.5, y_trans_m=0.25, z_trans_m=0.1))
    view = View3D(w)
    view.frame_robot()
    assert view.center[0] == pytest.approx(1.5)
    assert view.center[1] == pytest.approx(0.25)
    assert view.center[2] == pytest.approx(0.1)


def test_setrobot_uses_theme_accent():
    w = World()
    w.set_robot(_robot())
    view = View3D(w)
    robots = [m for m in view.meshes() if m.kind == "robot"]
    assert len(robots) == 3  # body, head, lift
    assert all(m.color == theme.ACCENT for m in robots)


def test_segments_and_quads():
    w = World()
    w.add_line_segment(_line())
    w.set_quad(_quad())
    view = View3D(w)
    polys = [m for m in view.meshes() if m.kind == "polyline"]
    assert len(polys) == 2
    loops = [m for m in polys if m.connect == "loop"]
    strips = [m for m in polys if m.connect == "strip"]
    assert len(loops) == 1
    assert len(strips) == 1
    assert loops[0].color == (0x01, 0x02, 0x03)


def test_create_canvas_headless_does_not_require_gpu():
    view = View3D(World())
    canvas = view.create_canvas(show=False)
    assert canvas is None or hasattr(canvas, "central_widget")
    assert vispy_available() is True or canvas is None


def _sensor_state(cliff_flags=0, range_status=0, distance_mm=100):
    return SimpleNamespace(
        state=SimpleNamespace(
            cliffDetectedFlags=cliff_flags,
            proxData=SimpleNamespace(
                rangeStatus=range_status,
                distance_mm=distance_mm,
            ),
        )
    )


def _closed_2d(meshes):
    return [m for m in meshes if m.kind == "polyline" and m.closed]


def _open_2d(meshes):
    return [m for m in meshes if m.kind == "polyline" and not m.closed]


def _closed_3d(meshes):
    return [m for m in meshes if m.kind == "polyline" and m.connect == "loop"]


def _strip_3d(meshes):
    return [m for m in meshes if m.kind == "polyline" and m.connect == "strip"]


def test_sensor_meshes_grow_by_four_dots_and_ray():
    w = World()
    w.set_robot(_robot())
    state = _sensor_state()
    settings = OverlaySettings()
    view2 = View2D(w)
    base2 = view2.meshes()
    full2 = view2.meshes(settings=settings, robot_state=state)
    assert len(full2) == len(base2) + 5
    squares = _closed_2d(full2)
    assert len(squares) == 4
    assert all(len(m.points) == 4 for m in squares)
    rays2 = _open_2d(full2)
    assert len(rays2) == 1
    assert len(rays2[0].points) == 2

    view3 = View3D(w)
    base3 = view3.meshes()
    full3 = view3.meshes(settings=settings, robot_state=state)
    assert len(full3) == len(base3) + 5
    loops = _closed_3d(full3)
    assert len(loops) == 4
    assert all(len(m.points) == 4 for m in loops)
    strips = _strip_3d(full3)
    assert len(strips) == 1
    assert len(strips[0].points) == 2


def test_cliff_dots_off_omits_closed_squares():
    w = World()
    w.set_robot(_robot())
    state = _sensor_state()
    off = OverlaySettings(cliff_dots=False)
    view2 = View2D(w)
    meshes2 = view2.meshes(settings=off, robot_state=state)
    assert _closed_2d(meshes2) == []
    assert len(view2.meshes(settings=off, robot_state=state)) == len(view2.meshes()) + 1
    view3 = View3D(w)
    meshes3 = view3.meshes(settings=off, robot_state=state)
    assert _closed_3d(meshes3) == []
    assert len(meshes3) == len(view3.meshes()) + 1


def test_show_objects_false_keeps_robot_cliff_tof():
    w = World()
    w.set_object(_obj())
    w.set_quad(_quad())
    w.append_path_line(_path_line(path_id=1))
    w.set_robot(_robot())
    w.set_show_objects(0)
    state = _sensor_state()
    settings = OverlaySettings()

    meshes2 = View2D(w).meshes(settings=settings, robot_state=state)
    assert any(m.kind == "triangle" for m in meshes2)
    assert len(_closed_2d(meshes2)) == 4
    assert len(_open_2d(meshes2)) == 1
    assert all(m.kind in ("triangle", "polyline") for m in meshes2)

    meshes3 = View3D(w).meshes(settings=settings, robot_state=state)
    assert all(m.kind in ("robot", "polyline") for m in meshes3)
    assert len([m for m in meshes3 if m.kind == "robot"]) == 3
    assert len(_closed_3d(meshes3)) == 4
    assert len(_strip_3d(meshes3)) == 1
