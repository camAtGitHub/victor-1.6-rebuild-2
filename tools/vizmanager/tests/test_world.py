"""World maps: erase keys, ShowObjects hide, origin mm→m, path tessellation."""

from __future__ import annotations

import os
import sys
from types import SimpleNamespace

import pytest

_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_GENERATED = os.path.join(
    _REPO, "generated", "cladPython", "clad", "vizInterface", "messageViz.py"
)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager import codec, theme  # noqa: E402
from vizmanager.session import Session  # noqa: E402
from vizmanager.view2d import View2D  # noqa: E402
from vizmanager.world import (  # noqa: E402
    ALL_OBJECT_IDs,
    ALL_PATH_IDs,
    ALL_QUAD_IDs,
    ALL_QUAD_TYPEs,
    ARC_RES_RAD,
    MM_TO_M,
    OBJECT_ID_RANGE,
    VIZ_OBJECT_CUBOID,
    World,
    path_rgb,
    tessellate_arc,
)

_generated_ok = os.path.isfile(_GENERATED) and codec.generated_available()
needs_generated = pytest.mark.skipif(
    not _generated_ok,
    reason="generated CLAD Python missing; run tools/vizmanager/scripts/generate_clad.sh",
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


def test_erase_object_clears_right_key():
    w = World()
    w.set_object(_obj(objectID=10))
    w.set_object(_obj(objectID=11))
    w.erase_object(10)
    assert 10 not in w.objects
    assert 11 in w.objects


def test_erase_object_all_and_range():
    w = World()
    for oid in (1, 5, 9, 20):
        w.set_object(_obj(objectID=oid))
    w.erase_object(OBJECT_ID_RANGE, 5, 9)
    assert set(w.objects) == {1, 20}
    w.erase_object(ALL_OBJECT_IDs)
    assert w.objects == {}


def test_erase_path_clears_right_key():
    w = World()
    w.append_path_line(_path_line(path_id=4))
    w.append_path_line(_path_line(path_id=8))
    w.erase_path(4)
    assert 4 not in w.paths
    assert 8 in w.paths
    w.erase_path(ALL_PATH_IDs)
    assert w.paths == {}


def test_path_order_and_segment_polyline_m():
    w = World()
    w.append_path_line(_path_line(path_id=1))
    w.append_path_arc(_path_arc(path_id=1))
    path = w.paths[1]
    assert path.order == [("line", 0), ("arc", 0)]
    assert path.segment_polyline_m(0) == ((0.0, 0.0, 0.0), (0.5, 0.0, 0.0))
    assert path.segment_polyline_m(1) == tuple(path.arcs[0].points_m())
    assert path.segment_polyline_m(-1) is None
    assert path.segment_polyline_m(2) is None


def test_polylines_m_stays_lines_then_arcs():
    w = World()
    w.append_path_line(_path_line(path_id=1, x_end_m=0.5))
    w.append_path_arc(_path_arc(path_id=1))
    w.append_path_line(_path_line(path_id=1, x_start_m=1.0, x_end_m=1.5))
    path = w.paths[1]
    assert path.order == [("line", 0), ("arc", 0), ("line", 1)]
    strips = path.polylines_m()
    assert strips[0] == ((0.0, 0.0, 0.0), (0.5, 0.0, 0.0))
    assert strips[1] == ((1.0, 0.0, 0.0), (1.5, 0.0, 0.0))
    assert strips[2] == tuple(path.arcs[0].points_m())
    assert path.segment_polyline_m(0) == strips[0]
    assert path.segment_polyline_m(1) == strips[2]
    assert path.segment_polyline_m(2) == strips[1]


def test_erase_quad_physviz_all():
    w = World()
    w.set_quad(_quad(quadType=1, quadID=1))
    w.set_quad(_quad(quadType=1, quadID=2))
    w.set_quad(_quad(quadType=2, quadID=1))
    w.erase_quad(1, ALL_QUAD_IDs)
    assert (1, 1) not in w.quads
    assert (1, 2) not in w.quads
    assert (2, 1) in w.quads
    w.erase_quad(ALL_QUAD_TYPEs, 0)
    assert w.quads == {}


def test_show_objects_false_hides_without_erase():
    w = World()
    w.set_object(_obj(objectID=1))
    w.set_quad(_quad())
    w.append_path_line(_path_line(path_id=1))
    view = View2D(w)
    kinds_before = {m.kind for m in view.meshes()}
    assert "polyline" in kinds_before
    w.set_show_objects(0)
    assert w.show_objects is False
    assert 1 in w.objects
    assert (1, 7) in w.quads
    assert 1 in w.paths
    hidden = view.meshes()
    assert not any(m.kind == "polyline" for m in hidden)


def test_set_robot_metres_and_head_lift():
    w = World()
    w.set_robot(
        SimpleNamespace(
            x_trans_m=0.25,
            y_trans_m=-0.1,
            z_trans_m=0.0,
            rot_rad=1.2,
            rot_axis_x=0.0,
            rot_axis_y=0.0,
            rot_axis_z=1.0,
            head_angle=0.3,
            lift_angle=-0.1,
        )
    )
    assert w.robot.x_trans_m == 0.25
    assert w.robot.head_angle == 0.3
    assert w.robot.lift_angle == -0.1
    view = View2D(w)
    tris = [m for m in view.meshes() if m.kind == "triangle"]
    assert len(tris) == 1
    assert tris[0].color == theme.ACCENT


def test_set_viz_origin_mm_to_m():
    w = World()
    w.set_viz_origin(
        SimpleNamespace(
            rot_rad=0.0,
            rot_axis_x=0.0,
            rot_axis_y=0.0,
            rot_axis_z=1.0,
            trans_x_mm=1000.0,
            trans_y_mm=500.0,
            trans_z_mm=0.0,
        )
    )
    assert w.origin.x == pytest.approx(1000.0 * MM_TO_M)
    assert w.origin.y == pytest.approx(0.5)
    x, y, z = w.apply_origin(0.1, 0.0, 0.0)
    assert x == pytest.approx(1.1)
    assert y == pytest.approx(0.5)


def test_tessellate_arc_physviz_0_2_rad():
    pts = tessellate_arc(0.0, 0.0, 1.0, 0.0, 0.4, res=ARC_RES_RAD)
    assert len(pts) == 2
    assert pts[0][0] == pytest.approx(1.0)
    assert pts[0][1] == pytest.approx(0.0)
    assert ARC_RES_RAD == 0.2


def test_path_color_falls_back_to_theme_path():
    assert path_rgb(None) == theme.PATH
    assert path_rgb(0) == theme.PATH
    w = World()
    w.append_path_line(_path_line(path_id=9))
    view = View2D(w)
    paths = [m for m in view.meshes() if m.kind == "polyline"]
    assert paths
    assert paths[0].color == theme.PATH


def test_grid_uses_theme_grid_token():
    view = View2D(World())
    lines = view.grid_lines()
    assert lines
    assert theme.GRID == (0x1E, 0x25, 0x30)


def test_line_segment_clear_previous():
    w = World()
    w.add_line_segment(_line(clearPrevious=False))
    w.add_line_segment(_line(dest=(0.0, 1.0, 0.0), clearPrevious=False))
    assert len(w.segments["seg"]) == 2
    w.add_line_segment(_line(clearPrevious=True, dest=(0.2, 0.2, 0.0)))
    assert len(w.segments["seg"]) == 1


def test_view2d_headless_without_surface():
    w = World()
    w.set_object(_obj())
    view = View2D(w)
    meshes = view.meshes()
    assert meshes
    assert all(len(m.color) == 3 for m in meshes)
    drawn = view.draw(surface=None)
    assert drawn is None or hasattr(drawn, "get_size")


def _pack(tag_name, **fields):
    MessageViz = codec.MessageViz
    payload_cls = MessageViz.typeByTag(getattr(MessageViz.Tag, tag_name))
    payload = payload_cls(**fields)
    return MessageViz(**{tag_name: payload}).pack()


@needs_generated
def test_session_erase_object_and_path_via_clad():
    sess = Session()
    sess.process_datagram(_pack("Object", objectID=42, objectTypeID=VIZ_OBJECT_CUBOID))
    sess.process_datagram(_pack("AppendPathSegmentLine", pathID=5, x_end_m=0.2))
    assert 42 in sess.world.objects
    assert 5 in sess.world.paths
    sess.process_datagram(_pack("EraseObject", objectID=42))
    sess.process_datagram(_pack("ErasePath", pathID=5))
    assert 42 not in sess.world.objects
    assert 5 not in sess.world.paths


@needs_generated
def test_session_show_objects_hides():
    sess = Session()
    sess.process_datagram(_pack("Object", objectID=1, objectTypeID=VIZ_OBJECT_CUBOID))
    sess.process_datagram(_pack("ShowObjects", show=0))
    assert sess.world.show_objects is False
    assert 1 in sess.world.objects
    view = View2D(sess.world)
    assert not any(m.kind == "polyline" for m in view.meshes())


@needs_generated
def test_session_setrobot_quad_origin():
    sess = Session()
    sess.process_datagram(
        _pack("SetRobot", x_trans_m=0.3, rot_rad=0.5, rot_axis_z=1.0, head_angle=0.1)
    )
    sess.process_datagram(_pack("Quad", quadType=0, quadID=3, xUpperRight=0.2))
    sess.process_datagram(_pack("SetVizOrigin", trans_x_mm=250.0, rot_axis_z=1.0))
    assert sess.world.robot.x_trans_m == pytest.approx(0.3)
    assert sess.world.robot.head_angle == pytest.approx(0.1)
    assert (0, 3) in sess.world.quads
    assert sess.world.origin.x == pytest.approx(0.25)
