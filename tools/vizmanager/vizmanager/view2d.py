"""Top-down 2D view of World maps. Grid uses theme.GRID; meshes use protocol colors.

Works headless: meshes() is pure data. draw(surface) is optional (pygame).
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass

from vizmanager import theme
from vizmanager.world import (
    VIZ_OBJECT_CHARGER,
    VIZ_OBJECT_CUBOID,
    VIZ_OBJECT_HUMAN_HEAD,
    VIZ_OBJECT_PREDOCKPOSE,
    VIZ_OBJECT_ROBOT,
    VIZ_OBJECT_TEXT,
    anki_rgb,
    path_rgb,
)

GRID_STEP_M = 0.1
# PhysViz small tetrahedron marker (top-down triangle)
_MARKER_L = 0.03
_MARKER_W = 0.02
# SetRobot ghost — slightly larger so the live pose is distinct from Object markers
_ROBOT_L = 0.08
_ROBOT_W = 0.05


@dataclass(frozen=True)
class Mesh:
    """World-metre primitive. color is (r,g,b) from protocol or theme.PATH."""

    kind: str
    points: tuple
    color: tuple
    closed: bool = False


def _pygame():
    try:
        import pygame
    except ImportError:
        return None
    return pygame


def _triangle(pose_origin_fn, length, width):
    """Tip at origin pointing +X, base behind (PhysViz DrawTetrahedronMarker)."""
    locals_xy = (
        (0.0, 0.0, 0.0),
        (-length, 0.5 * width, 0.0),
        (-length, -0.5 * width, 0.0),
    )
    return tuple(pose_origin_fn(p)[:2] for p in locals_xy)


def robot_marker_points_m(world):
    """SetRobot triangle in world metres (origin applied). Empty if no robot."""
    robot = world.robot
    if robot is None:
        return ()
    fn = lambda p, pose=robot.pose: world.apply_pose_origin(p, pose)
    return _triangle(fn, _ROBOT_L, _ROBOT_W)


def _rect_xy(pose_origin_fn, xs, ys):
    locals_xy = (
        (xs[0], ys[0], 0.0),
        (xs[1], ys[0], 0.0),
        (xs[1], ys[1], 0.0),
        (xs[0], ys[1], 0.0),
    )
    return tuple(pose_origin_fn(p)[:2] for p in locals_xy)


class View2D:
    def __init__(self, world, size=(640, 480), pixels_per_metre=200.0):
        self.world = world
        self.width, self.height = size
        self.ppm = float(pixels_per_metre)
        self.center_x = 0.0
        self.center_y = 0.0
        self.follow_robot = True

    def frame_robot(self):
        robot = self.world.robot
        if robot is None:
            return
        x, y, _z = self.world.apply_origin(robot.x_trans_m, robot.y_trans_m, robot.z_trans_m)
        self.center_x = x
        self.center_y = y

    def world_to_screen(self, x_m, y_m):
        px = self.width * 0.5 + (x_m - self.center_x) * self.ppm
        py = self.height * 0.5 - (y_m - self.center_y) * self.ppm
        return (int(round(px)), int(round(py)))

    def grid_lines(self):
        """Axis-aligned grid in world metres, color theme.GRID."""
        half_w = (self.width * 0.5) / self.ppm + GRID_STEP_M
        half_h = (self.height * 0.5) / self.ppm + GRID_STEP_M
        x0 = self.center_x - half_w
        x1 = self.center_x + half_w
        y0 = self.center_y - half_h
        y1 = self.center_y + half_h

        def snap(v):
            return math.floor(v / GRID_STEP_M) * GRID_STEP_M

        lines = []
        x = snap(x0)
        while x <= x1 + 1e-9:
            lines.append(((x, y0), (x, y1)))
            x += GRID_STEP_M
        y = snap(y0)
        while y <= y1 + 1e-9:
            lines.append(((x0, y), (x1, y)))
            y += GRID_STEP_M
        return tuple(lines)

    def meshes(self):
        """Protocol meshes in world metres (origin already applied). Empty if hidden."""
        out = []
        world = self.world
        if world.robot is not None:
            fn = lambda p, pose=world.robot.pose: world.apply_pose_origin(p, pose)
            out.append(
                Mesh("triangle", _triangle(fn, _ROBOT_L, _ROBOT_W), theme.ACCENT, True)
            )
        if not world.show_objects:
            return tuple(out)
        for obj in world.objects.values():
            mesh = self._object_mesh(obj)
            if mesh is not None:
                out.append(mesh)
        for segs in world.segments.values():
            for seg in segs:
                o = world.apply_origin(*seg.origin)
                d = world.apply_origin(*seg.dest)
                out.append(Mesh("polyline", (o[:2], d[:2]), anki_rgb(seg.color), False))
        for quad in world.quads.values():
            pts = tuple(world.apply_origin(*c)[:2] for c in quad.corners_m())
            out.append(Mesh("polyline", pts, anki_rgb(quad.color), True))
        for path in world.paths.values():
            color = path_rgb(path.color)
            for strip in path.polylines_m():
                pts = tuple(world.apply_origin(*p)[:2] for p in strip)
                if len(pts) >= 2:
                    out.append(Mesh("polyline", pts, color, False))
        return tuple(out)

    def _object_mesh(self, obj):
        fn = lambda p, pose=obj.pose: self.world.apply_pose_origin(p, pose)
        color = anki_rgb(obj.color)
        kind = obj.object_type_id
        if kind in (VIZ_OBJECT_ROBOT, VIZ_OBJECT_PREDOCKPOSE):
            return Mesh("triangle", _triangle(fn, _MARKER_L, _MARKER_W), color, True)
        if kind == VIZ_OBJECT_CUBOID:
            hx, hy = 0.5 * obj.x_size_m, 0.5 * obj.y_size_m
            return Mesh("polyline", _rect_xy(fn, (-hx, hx), (-hy, hy)), color, True)
        if kind == VIZ_OBJECT_CHARGER:
            slope = obj.obj_parameters[0] * obj.x_size_m
            length = obj.x_size_m + slope
            hy = 0.5 * obj.y_size_m
            return Mesh("polyline", _rect_xy(fn, (0.0, length), (-hy, hy)), color, True)
        if kind == VIZ_OBJECT_HUMAN_HEAD:
            hx, hy = 0.5 * obj.x_size_m, 0.5 * obj.y_size_m
            return Mesh("polyline", _rect_xy(fn, (-hx, hx), (-hy, hy)), color, True)
        if kind == VIZ_OBJECT_TEXT:
            s = 0.01
            return Mesh("polyline", _rect_xy(fn, (-s, s), (-s, s)), color, True)
        hx, hy = 0.5 * max(obj.x_size_m, 0.01), 0.5 * max(obj.y_size_m, 0.01)
        return Mesh("polyline", _rect_xy(fn, (-hx, hx), (-hy, hy)), color, True)

    def draw(self, surface=None):
        """Blit onto a pygame surface. Creates a software surface if none given.

        Returns the surface, or None if pygame is unavailable and no surface was
        passed (headless data path is meshes() / grid_lines()).
        """
        if self.follow_robot:
            self.frame_robot()
        pg = _pygame()
        if pg is None:
            return surface
        if surface is None:
            surface = _software_surface(pg, (self.width, self.height))
            if surface is None:
                return None
        size = surface.get_size()
        self.width, self.height = size
        surface.fill(theme.BG_VOID)
        grid_color = theme.GRID
        for (x0, y0), (x1, y1) in self.grid_lines():
            pg.draw.line(
                surface,
                grid_color,
                self.world_to_screen(x0, y0),
                self.world_to_screen(x1, y1),
                1,
            )
        for mesh in self.meshes():
            pts = [self.world_to_screen(x, y) for x, y in mesh.points]
            if len(pts) < 2:
                continue
            if mesh.kind == "triangle" or mesh.closed:
                pg.draw.polygon(surface, mesh.color, pts, 1)
            else:
                pg.draw.lines(surface, mesh.color, False, pts, 1)
        return surface


def _software_surface(pg, size):
    if not pg.get_init():
        if not os.environ.get("DISPLAY") and not os.environ.get("SDL_VIDEODRIVER"):
            os.environ["SDL_VIDEODRIVER"] = "dummy"
        try:
            pg.init()
        except Exception:
            return None
    try:
        return pg.Surface(size)
    except Exception:
        return None
