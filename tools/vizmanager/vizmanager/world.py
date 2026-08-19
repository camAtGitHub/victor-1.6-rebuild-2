"""World maps for Viz objects, segments, quads, paths, SetRobot, origin.

Storage/erase from vizControllerImpl.cpp:1185–1362 plus PhysViz ALL_*
(physVizController.cpp). Protocol values are metres except SetVizOrigin
translation (mm → m, vizManager.cpp:159–170 / MM_TO_M).
"""

from __future__ import annotations

import math
from collections import namedtuple
from dataclasses import dataclass, field

from vizmanager import theme

NavTile = namedtuple("NavTile", "color_rgba center_x_mm center_y_mm edge_len_mm")

# vizTypes.clad VizConstants
ALL_PATH_IDs = 0xFFFFFFFF
ALL_QUAD_IDs = 0xFFFFFFFF
ALL_QUAD_TYPEs = 0xFFFFFFFF
ALL_OBJECT_IDs = 0xFFFFFFFF
OBJECT_ID_RANGE = 0xFFFFFFFE

# vizTypes.clad VizObjectType
VIZ_OBJECT_ROBOT = 0
VIZ_OBJECT_CUBOID = 1
VIZ_OBJECT_CHARGER = 2
VIZ_OBJECT_PREDOCKPOSE = 3
VIZ_OBJECT_HUMAN_HEAD = 4
VIZ_OBJECT_TEXT = 5

# PhysViz physVizController.h
ARC_RES_RAD = 0.2

MM_TO_M = 0.001


def protocol_rgba(color_rgba):
    """Split CLAD 0xRRGGBBAA into (r, g, b, a) in 0–255."""
    return anki_rgba(color_rgba)


def protocol_rgb(color_rgba):
    """RGB of a protocol color; fall back to PATH if fully transparent."""
    r, g, b, a = anki_rgba(color_rgba)
    if a == 0 and r == 0 and g == 0 and b == 0:
        return theme.PATH
    return (r, g, b)


def anki_rgba(packed):
    """Anki ColorRGBA packed as 0xRRGGBBAA → (r, g, b, a)."""
    packed = int(packed) & 0xFFFFFFFF
    return (
        (packed >> 24) & 0xFF,
        (packed >> 16) & 0xFF,
        (packed >> 8) & 0xFF,
        packed & 0xFF,
    )


def anki_rgb(packed):
    r, g, b, _a = anki_rgba(packed)
    return (r, g, b)


def path_rgb(packed):
    """Protocol path color, or theme.PATH if missing / unset."""
    if packed is None or int(packed) == 0:
        return theme.PATH
    return anki_rgb(packed)


def _fseq(value, n):
    if value is None:
        return (0.0,) * n
    return tuple(float(value[i]) for i in range(n))


def rotate_axis_angle(x, y, z, angle, ax, ay, az):
    """Rodrigues rotation of (x,y,z) about unit axis by angle radians."""
    n = math.hypot(ax, ay, az)
    if n < 1e-12 or abs(angle) < 1e-12:
        return (x, y, z)
    ax, ay, az = ax / n, ay / n, az / n
    c = math.cos(angle)
    s = math.sin(angle)
    oc = 1.0 - c
    dot = ax * x + ay * y + az * z
    cx = ay * z - az * y
    cy = az * x - ax * z
    cz = ax * y - ay * x
    return (
        x * c + cx * s + ax * dot * oc,
        y * c + cy * s + ay * dot * oc,
        z * c + cz * s + az * dot * oc,
    )


@dataclass
class Pose3:
    """Axis-angle pose. Translation in metres, angle in radians."""

    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    angle: float = 0.0
    ax: float = 0.0
    ay: float = 0.0
    az: float = 1.0

    def transform(self, x, y, z):
        rx, ry, rz = rotate_axis_angle(x, y, z, self.angle, self.ax, self.ay, self.az)
        return (rx + self.x, ry + self.y, rz + self.z)


def tessellate_arc(x_center_m, y_center_m, radius_m, start_rad, sweep_rad, res=ARC_RES_RAD):
    """Arc points at `res` rad, matching PhysViz ProcessVizAppendPathSegmentArc."""
    direction = 1.0 if sweep_rad > 0 else -1.0
    start = float(start_rad)
    end = start + float(sweep_rad)
    pi = math.pi
    while end > pi:
        end -= 2.0 * pi
    while end < -pi:
        end += 2.0 * pi
    if direction > 0:
        while start > end:
            start -= 2.0 * pi
    else:
        while start < end:
            start += 2.0 * pi
    pts = []
    curr = start
    radius_m = float(radius_m)
    x_center_m = float(x_center_m)
    y_center_m = float(y_center_m)
    while curr * direction < end * direction:
        dx = math.cos(curr) * radius_m
        dy = math.sin(curr) * radius_m
        pts.append((x_center_m + dx, y_center_m + dy, 0.0))
        curr += direction * res
    return pts


@dataclass
class VizObject:
    object_id: int
    object_type_id: int
    color: int
    x_size_m: float
    y_size_m: float
    z_size_m: float
    x_trans_m: float
    y_trans_m: float
    z_trans_m: float
    rot_deg: float
    rot_axis_x: float
    rot_axis_y: float
    rot_axis_z: float
    obj_parameters: tuple
    text: str = ""

    @property
    def pose(self):
        return Pose3(
            self.x_trans_m,
            self.y_trans_m,
            self.z_trans_m,
            math.radians(self.rot_deg),
            self.rot_axis_x,
            self.rot_axis_y,
            self.rot_axis_z,
        )


@dataclass
class VizSegment:
    identifier: str
    color: int
    origin: tuple
    dest: tuple


@dataclass
class VizQuad:
    quad_type: int
    quad_id: int
    color: int
    x_upper_left: float
    y_upper_left: float
    z_upper_left: float
    x_lower_left: float
    y_lower_left: float
    z_lower_left: float
    x_upper_right: float
    y_upper_right: float
    z_upper_right: float
    x_lower_right: float
    y_lower_right: float
    z_lower_right: float

    def corners_m(self):
        return (
            (self.x_upper_left, self.y_upper_left, self.z_upper_left),
            (self.x_upper_right, self.y_upper_right, self.z_upper_right),
            (self.x_lower_right, self.y_lower_right, self.z_lower_right),
            (self.x_lower_left, self.y_lower_left, self.z_lower_left),
        )


@dataclass
class PathLine:
    x_start_m: float
    y_start_m: float
    z_start_m: float
    x_end_m: float
    y_end_m: float
    z_end_m: float


@dataclass
class PathArc:
    x_center_m: float
    y_center_m: float
    radius_m: float
    start_rad: float
    sweep_rad: float

    def points_m(self):
        return tessellate_arc(
            self.x_center_m,
            self.y_center_m,
            self.radius_m,
            self.start_rad,
            self.sweep_rad,
        )


@dataclass
class VizPath:
    path_id: int
    color: int | None = None
    lines: list = field(default_factory=list)
    arcs: list = field(default_factory=list)

    def polylines_m(self):
        """Line segments then tessellated arcs (VizControllerImpl DrawPaths order)."""
        strips = []
        for line in self.lines:
            strips.append(
                (
                    (line.x_start_m, line.y_start_m, line.z_start_m),
                    (line.x_end_m, line.y_end_m, line.z_end_m),
                )
            )
        for arc in self.arcs:
            pts = arc.points_m()
            if pts:
                strips.append(tuple(pts))
        return strips


@dataclass
class RobotPose:
    x_trans_m: float
    y_trans_m: float
    z_trans_m: float
    rot_rad: float
    rot_axis_x: float
    rot_axis_y: float
    rot_axis_z: float
    head_angle: float
    lift_angle: float

    @property
    def pose(self):
        return Pose3(
            self.x_trans_m,
            self.y_trans_m,
            self.z_trans_m,
            self.rot_rad,
            self.rot_axis_x,
            self.rot_axis_y,
            self.rot_axis_z,
        )


class World:
    """Keyed maps matching VizControllerImpl / PhysViz."""

    def __init__(self):
        self.objects = {}  # objectID
        self.segments = {}  # identifier → list
        self.quads = {}  # (quadType, quadID)
        self.paths = {}  # pathID
        self.robot = None
        self.origin = Pose3()
        self.show_objects = True
        self.nav_nodes = []
        self.nav_tiles = ()
        self.nav_origin_id = 0
        self.nav_generation = 0
        self.nav_info = None

    def apply_origin(self, x, y, z):
        """PreComposeWith origin (already metres)."""
        return self.origin.transform(x, y, z)

    def apply_pose_origin(self, local_xyz, pose):
        wx, wy, wz = pose.transform(*local_xyz)
        return self.origin.transform(wx, wy, wz)

    def set_object(self, payload):
        oid = int(payload.objectID)
        params = _fseq(getattr(payload, "objParameters", None), 4)
        self.objects[oid] = VizObject(
            object_id=oid,
            object_type_id=int(payload.objectTypeID),
            color=int(payload.color),
            x_size_m=float(payload.x_size_m),
            y_size_m=float(payload.y_size_m),
            z_size_m=float(payload.z_size_m),
            x_trans_m=float(payload.x_trans_m),
            y_trans_m=float(payload.y_trans_m),
            z_trans_m=float(payload.z_trans_m),
            rot_deg=float(payload.rot_deg),
            rot_axis_x=float(payload.rot_axis_x),
            rot_axis_y=float(payload.rot_axis_y),
            rot_axis_z=float(payload.rot_axis_z),
            obj_parameters=params,
            text=str(getattr(payload, "text", "") or ""),
        )

    def erase_object(self, object_id, lower_bound_id=0, upper_bound_id=0):
        object_id = int(object_id)
        if object_id == ALL_OBJECT_IDs:
            self.objects.clear()
            return
        if object_id == OBJECT_ID_RANGE:
            lo = int(lower_bound_id)
            hi = int(upper_bound_id)
            for key in [k for k in self.objects if lo <= k <= hi]:
                del self.objects[key]
            return
        self.objects.pop(object_id, None)

    def set_show_objects(self, show):
        """Hide (do not erase). PhysViz _drawEnabled; test: ShowObjects(false) hides."""
        self.show_objects = int(show) != 0

    def add_line_segment(self, payload):
        ident = str(payload.identifier)
        if payload.clearPrevious:
            self.erase_line_segments(ident)
        seg = VizSegment(
            identifier=ident,
            color=int(payload.color),
            origin=_fseq(payload.origin, 3),
            dest=_fseq(payload.dest, 3),
        )
        self.segments.setdefault(ident, []).append(seg)

    def erase_line_segments(self, identifier):
        self.segments.pop(str(identifier), None)

    def set_quad(self, payload):
        qtype = int(payload.quadType)
        qid = int(payload.quadID)
        self.quads[(qtype, qid)] = VizQuad(
            quad_type=qtype,
            quad_id=qid,
            color=int(payload.color),
            x_upper_left=float(payload.xUpperLeft),
            y_upper_left=float(payload.yUpperLeft),
            z_upper_left=float(payload.zUpperLeft),
            x_lower_left=float(payload.xLowerLeft),
            y_lower_left=float(payload.yLowerLeft),
            z_lower_left=float(payload.zLowerLeft),
            x_upper_right=float(payload.xUpperRight),
            y_upper_right=float(payload.yUpperRight),
            z_upper_right=float(payload.zUpperRight),
            x_lower_right=float(payload.xLowerRight),
            y_lower_right=float(payload.yLowerRight),
            z_lower_right=float(payload.zLowerRight),
        )

    def erase_quad(self, quad_type, quad_id):
        quad_type = int(quad_type)
        quad_id = int(quad_id)
        if quad_type == ALL_QUAD_TYPEs:
            self.quads.clear()
            return
        if quad_id == ALL_QUAD_IDs:
            for key in [k for k in self.quads if k[0] == quad_type]:
                del self.quads[key]
            return
        self.quads.pop((quad_type, quad_id), None)

    def _path(self, path_id):
        path_id = int(path_id)
        path = self.paths.get(path_id)
        if path is None:
            path = VizPath(path_id=path_id)
            self.paths[path_id] = path
        return path

    def append_path_line(self, payload):
        self._path(payload.pathID).lines.append(
            PathLine(
                x_start_m=float(payload.x_start_m),
                y_start_m=float(payload.y_start_m),
                z_start_m=float(payload.z_start_m),
                x_end_m=float(payload.x_end_m),
                y_end_m=float(payload.y_end_m),
                z_end_m=float(payload.z_end_m),
            )
        )

    def append_path_arc(self, payload):
        self._path(payload.pathID).arcs.append(
            PathArc(
                x_center_m=float(payload.x_center_m),
                y_center_m=float(payload.y_center_m),
                radius_m=float(payload.radius_m),
                start_rad=float(payload.start_rad),
                sweep_rad=float(payload.sweep_rad),
            )
        )

    def set_path_color(self, payload):
        path = self.paths.get(int(payload.pathID))
        if path is not None:
            path.color = int(payload.colorID)

    def erase_path(self, path_id):
        path_id = int(path_id)
        if path_id == ALL_PATH_IDs:
            self.paths.clear()
            return
        self.paths.pop(path_id, None)

    def set_robot(self, payload):
        self.robot = RobotPose(
            x_trans_m=float(payload.x_trans_m),
            y_trans_m=float(payload.y_trans_m),
            z_trans_m=float(payload.z_trans_m),
            rot_rad=float(payload.rot_rad),
            rot_axis_x=float(payload.rot_axis_x),
            rot_axis_y=float(payload.rot_axis_y),
            rot_axis_z=float(payload.rot_axis_z),
            head_angle=float(payload.head_angle),
            lift_angle=float(payload.lift_angle),
        )

    def set_viz_origin(self, payload):
        self.origin = Pose3(
            x=float(payload.trans_x_mm) * MM_TO_M,
            y=float(payload.trans_y_mm) * MM_TO_M,
            z=float(payload.trans_z_mm) * MM_TO_M,
            angle=float(payload.rot_rad),
            ax=float(payload.rot_axis_x),
            ay=float(payload.rot_axis_y),
            az=float(payload.rot_axis_z),
        )

    def memory_map_begin(self, origin_id, info=None):
        # Begin clears the accumulator; info is unused in stock.
        self.nav_origin_id = origin_id
        self.nav_info = info
        self.nav_nodes = []

    def memory_map_chunk(self, origin_id, quad_infos):
        self.nav_origin_id = origin_id
        nodes = self.nav_nodes
        for quad in quad_infos:
            nodes.append(
                NavTile(
                    quad.colorRGBA,
                    quad.centerX_mm,
                    quad.centerY_mm,
                    quad.edgeLen_mm,
                )
            )

    def memory_map_end(self, origin_id):
        self.nav_origin_id = origin_id
        self.nav_tiles = tuple(self.nav_nodes)
        self.nav_generation += 1

    def fill_rects(self, display_width, display_height, origin_x=0.0, origin_y=0.0):
        """Pixel fill rects: origin at display center, Y flipped, 1 px gap.

        `origin_x` / `origin_y` are pan offsets in the same 1 mm = 1 px space.
        Clip is applied in screen space after the offset (visible pane), so a
        left/top tile dropped at pan 0 can re-enter when panned into view.
        Off-display quads are clipped on the top/left only, matching stock.
        """
        center_x = 0.5 * display_width
        center_y = 0.5 * display_height
        rects = []
        for node in self.nav_tiles:
            top_left_x = node.center_x_mm - node.edge_len_mm / 2.0
            top_left_y = node.center_y_mm + node.edge_len_mm / 2.0
            image_x = top_left_x + center_x + origin_x
            image_y = -top_left_y + center_y + origin_y
            width = node.edge_len_mm - 1.0
            height = node.edge_len_mm - 1.0
            if image_x < 0:
                width -= abs(image_x)
                image_x = 0.0
            if image_y < 0:
                height -= abs(image_y)
                image_y = 0.0
            if height > 0 and width > 0:
                rects.append(
                    (
                        int(image_x),
                        int(image_y),
                        int(width),
                        int(height),
                        node.color_rgba,
                    )
                )
        return rects
