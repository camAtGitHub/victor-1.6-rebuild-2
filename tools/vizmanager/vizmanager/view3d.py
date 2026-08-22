"""vispy 3D clone of webotsCtrlViz DrawObjects.

meshes() / grid_lines() / axes_lines() are pure data (no GL). create_canvas()
is optional vispy; missing vispy or GL leaves the class usable headless.

Rebuild throttled to DRAW_OBJECTS_RATE_SEC (Webots drawObjectsRate_sec 0.25).
Pose updates are data (no tween). Orbit is user-driven TurntableCamera; no auto-spin.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass

from vizmanager import theme
from vizmanager.sensors import OverlaySettings, cliff_dots_world, tof_ray_world
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

# CozmoVizDisplay.proto drawObjectsRate_sec
DRAW_OBJECTS_RATE_SEC = 0.25

# MASTER.md: +X red, +Y green, +Z blue, 100 mm
AXIS_LEN_M = 0.100
_AXIS_RGB = ((255, 0, 0), (0, 255, 0), (0, 0, 255))

# PoseMarker.proto cone height; vizControllerImpl zOffset for robot / predock
_MARKER_AXIS_M = 0.030
_POSE_Z_OFFSET_M = 0.080

# SetRobot ghost boxes (metres); head/lift pitch about +Y
_ROBOT_BODY = (0.10, 0.06, 0.04)
_ROBOT_HEAD = (0.04, 0.05, 0.03)
_ROBOT_LIFT = (0.03, 0.05, 0.01)

_HEAD_DEFAULT = 0.08
GRID_STEP_M = 0.1
GRID_HALF_M = 2.0
# Orbit coast: ignore sub-frame dt spikes; cap deg/s so release cannot fling.
_MIN_ORBIT_DT = 0.016
_MAX_ORBIT_VEL = 720.0
# Esc must not destroy the WORLD canvas (MASTER: Esc dismisses connect error).
CANVAS_KEYS = None

_BOX_EDGES = (
    (0, 1),
    (1, 2),
    (2, 3),
    (3, 0),
    (4, 5),
    (5, 6),
    (6, 7),
    (7, 4),
    (0, 4),
    (1, 5),
    (2, 6),
    (3, 7),
)


@dataclass(frozen=True)
class Mesh3:
    """World-metre 3D primitive. color is (r,g,b) from protocol or theme."""

    kind: str
    points: tuple
    color: tuple
    connect: str = "segments"


def _scene_mod():
    try:
        from vispy import scene
    except Exception:
        return None
    return scene


def vispy_available():
    return _scene_mod() is not None


def _rgb01(rgb):
    return (rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0)


def _rgba01(rgb):
    return (_rgb01(rgb)[0], _rgb01(rgb)[1], _rgb01(rgb)[2], 1.0)


def _box_corners(sx, sy, sz, cx=0.0, cy=0.0, cz=0.0):
    hx, hy, hz = 0.5 * sx, 0.5 * sy, 0.5 * sz
    return (
        (cx - hx, cy - hy, cz - hz),
        (cx + hx, cy - hy, cz - hz),
        (cx + hx, cy + hy, cz - hz),
        (cx - hx, cy + hy, cz - hz),
        (cx - hx, cy - hy, cz + hz),
        (cx + hx, cy - hy, cz + hz),
        (cx + hx, cy + hy, cz + hz),
        (cx - hx, cy + hy, cz + hz),
    )


def _wire_box(transform, sx, sy, sz, cx=0.0, cy=0.0, cz=0.0):
    corners = [transform(p) for p in _box_corners(sx, sy, sz, cx, cy, cz)]
    pts = []
    for i, j in _BOX_EDGES:
        pts.append(corners[i])
        pts.append(corners[j])
    return tuple(pts)


def _pitch_y(x, y, z, angle):
    """Pitch about +Y (positive looks up)."""
    c = math.cos(angle)
    s = math.sin(angle)
    return (x * c - z * s, y, x * s + z * c)


def _orbit_dt(dt):
    if dt is None or dt <= 0:
        return _MIN_ORBIT_DT
    return max(float(dt), _MIN_ORBIT_DT)


def _clamp_orbit_vel(vel):
    return max(-_MAX_ORBIT_VEL, min(_MAX_ORBIT_VEL, float(vel)))


def _pan_axes(azimuth, elevation):
    """Camera right and screen-up for a Z-up turntable (az=0 looks +Y)."""
    az = math.radians(azimuth)
    el = math.radians(elevation)
    saz, caz = math.sin(az), math.cos(az)
    sel, cel = math.sin(el), math.cos(el)
    forward = (-cel * saz, cel * caz, -sel)
    right = (caz, saz, 0.0)
    cam_up = (
        right[1] * forward[2] - right[2] * forward[1],
        right[2] * forward[0] - right[0] * forward[2],
        right[0] * forward[1] - right[1] * forward[0],
    )
    return right, cam_up


def _expand_segments(points, connect):
    if not points:
        return ()
    if connect == "segments":
        return points
    pts = []
    n = len(points)
    if connect == "loop":
        if n < 2:
            return ()
        for i in range(n):
            pts.append(points[i])
            pts.append(points[(i + 1) % n])
        return tuple(pts)
    for i in range(n - 1):
        pts.append(points[i])
        pts.append(points[i + 1])
    return tuple(pts)


class View3D:
    def __init__(self, world, size=(640, 480)):
        self.world = world
        self.size = (int(size[0]), int(size[1]))
        self.center = (0.0, 0.0, 0.0)
        self.azimuth = 45.0
        self.elevation = 25.0
        self.distance = 1.5
        self.paused = False
        self.damp_orbit = True
        self._last_rebuild = None
        self.canvas = None
        self._view = None
        self._camera = None
        self._world_line = None
        self._grid_line = None
        self._axes_line = None
        self._timer = None
        self._draw_timer = None
        self._az_vel = 0.0
        self._el_vel = 0.0
        self._dragging = False
        self._pan_button = False
        self._last_mouse = None
        self._last_cam_t = None

    def frame_robot(self):
        robot = self.world.robot
        if robot is None:
            return
        x, y, z = self.world.apply_origin(
            robot.x_trans_m, robot.y_trans_m, robot.z_trans_m
        )
        self.center = (x, y, z)
        self._push_camera()

    def set_size(self, width, height):
        self.size = (int(width), int(height))
        if self.canvas is not None:
            try:
                self.canvas.size = self.size
            except Exception:
                pass
        self._update_aspect()

    def set_paused(self, paused):
        self.paused = bool(paused)

    def close(self):
        """Stop timers and close the canvas so discarded views do not leak."""
        self._stop_timer("_timer")
        self._stop_timer("_draw_timer")
        if self.canvas is not None:
            try:
                self.canvas.close()
            except Exception:
                pass
        self.canvas = None
        self._view = None
        self._camera = None
        self._world_line = None
        self._grid_line = None
        self._axes_line = None

    def _stop_timer(self, name):
        timer = getattr(self, name, None)
        if timer is None:
            return
        try:
            timer.stop()
        except Exception:
            pass
        setattr(self, name, None)

    def axes_lines(self):
        """100 mm RGB triad at the scene origin (composed viz frame)."""
        L = AXIS_LEN_M
        o = (0.0, 0.0, 0.0)
        tips = ((L, 0.0, 0.0), (0.0, L, 0.0), (0.0, 0.0, L))
        return tuple(
            Mesh3("axis", (o, tip), color, "segments")
            for tip, color in zip(tips, _AXIS_RGB)
        )

    def grid_lines(self):
        """XY ground grid in metres, color theme.GRID, centered on look-at."""
        cx, cy, _cz = self.center
        x0 = cx - GRID_HALF_M
        x1 = cx + GRID_HALF_M
        y0 = cy - GRID_HALF_M
        y1 = cy + GRID_HALF_M

        def snap(v):
            return math.floor(v / GRID_STEP_M) * GRID_STEP_M

        color = theme.GRID
        lines = []
        x = snap(x0)
        while x <= x1 + 1e-9:
            lines.append(Mesh3("grid", ((x, y0, 0.0), (x, y1, 0.0)), color, "segments"))
            x += GRID_STEP_M
        y = snap(y0)
        while y <= y1 + 1e-9:
            lines.append(Mesh3("grid", ((x0, y, 0.0), (x1, y, 0.0)), color, "segments"))
            y += GRID_STEP_M
        return tuple(lines)

    def meshes(self, settings=None, robot_state=None):
        """Protocol + robot meshes in world metres (origin already applied)."""
        if settings is None:
            settings = OverlaySettings()
        out = []
        world = self.world
        if world.robot is not None:
            out.extend(self._robot_meshes())
            if settings.cliff_dots:
                for pts, color in cliff_dots_world(world, robot_state):
                    out.append(Mesh3("polyline", pts, color, "loop"))
            if settings.tof_ray:
                ray = tof_ray_world(world, robot_state)
                if ray is not None:
                    pts, color = ray
                    out.append(Mesh3("polyline", pts, color, "strip"))
        if not world.show_objects:
            return tuple(out)
        for obj in world.objects.values():
            out.extend(self._object_meshes(obj))
        for segs in world.segments.values():
            for seg in segs:
                o = world.apply_origin(*seg.origin)
                d = world.apply_origin(*seg.dest)
                out.append(
                    Mesh3("polyline", (o, d), anki_rgb(seg.color), "strip")
                )
        for quad in world.quads.values():
            pts = tuple(world.apply_origin(*c) for c in quad.corners_m())
            out.append(Mesh3("polyline", pts, anki_rgb(quad.color), "loop"))
        for path in world.paths.values():
            color = path_rgb(path.color)
            for strip in path.polylines_m():
                pts = tuple(world.apply_origin(*p) for p in strip)
                if len(pts) >= 2:
                    out.append(Mesh3("polyline", pts, color, "strip"))
        curr = getattr(getattr(robot_state, "state", None), "currPathSegment", -1)
        if settings.path_highlight and curr is not None and curr >= 0:
            for path in world.paths.values():
                strip = path.segment_polyline_m(curr)
                if strip:
                    pts = tuple(world.apply_origin(*p) for p in strip)
                    if len(pts) >= 2:
                        out.append(Mesh3("polyline", pts, theme.ACCENT, "strip"))
        return tuple(out)

    def _object_meshes(self, obj):
        fn = lambda p, pose=obj.pose: self.world.apply_pose_origin(p, pose)
        color = anki_rgb(obj.color)
        kind = obj.object_type_id
        if kind == VIZ_OBJECT_TEXT:
            return ()
        if kind in (VIZ_OBJECT_ROBOT, VIZ_OBJECT_PREDOCKPOSE):
            return (self._pose_marker(fn, color),)
        if kind == VIZ_OBJECT_CUBOID:
            pts = _wire_box(fn, obj.x_size_m, obj.y_size_m, obj.z_size_m)
            return (Mesh3("cuboid", pts, color, "segments"),)
        if kind == VIZ_OBJECT_CHARGER:
            return (self._charger(fn, obj, color),)
        if kind == VIZ_OBJECT_HUMAN_HEAD:
            sx = obj.x_size_m if obj.x_size_m > 1e-6 else _HEAD_DEFAULT
            sy = obj.y_size_m if obj.y_size_m > 1e-6 else _HEAD_DEFAULT
            sz = obj.z_size_m if obj.z_size_m > 1e-6 else _HEAD_DEFAULT
            pts = _wire_box(fn, sx, sy, sz)
            return (Mesh3("head", pts, color, "segments"),)
        sx = max(obj.x_size_m, 0.01)
        sy = max(obj.y_size_m, 0.01)
        sz = max(obj.z_size_m, 0.01)
        return (Mesh3("cuboid", _wire_box(fn, sx, sy, sz), color, "segments"),)

    def _pose_marker(self, transform, color):
        z = _POSE_Z_OFFSET_M
        a = _MARKER_AXIS_M
        o = transform((0.0, 0.0, z))
        pts = (
            o,
            transform((a, 0.0, z)),
            o,
            transform((0.0, a, z)),
            o,
            transform((0.0, 0.0, z + a)),
        )
        return Mesh3("pose_marker", pts, color, "segments")

    def _charger(self, transform, obj, color):
        # WireframeCharger.proto: platformLength=x_size, slope=param0*x_size
        platform = obj.x_size_m
        slope = obj.obj_parameters[0] * obj.x_size_m
        hy = 0.5 * obj.y_size_m
        h = obj.z_size_m
        back = platform + slope
        verts = (
            (back, hy, h),
            (back, -hy, h),
            (slope, -hy, h),
            (slope, hy, h),
            (back, hy, 0.0),
            (back, -hy, 0.0),
            (0.0, -hy, 0.0),
            (0.0, hy, 0.0),
        )
        w = [transform(v) for v in verts]
        # coordIndex [0 1 2 3 0 -1 4 5 6 7 4 -1 0 4 -1 1 5 -1 3 7 -1 2 6]
        pairs = (
            (0, 1),
            (1, 2),
            (2, 3),
            (3, 0),
            (4, 5),
            (5, 6),
            (6, 7),
            (7, 4),
            (0, 4),
            (1, 5),
            (3, 7),
            (2, 6),
        )
        pts = []
        for i, j in pairs:
            pts.append(w[i])
            pts.append(w[j])
        return Mesh3("charger", tuple(pts), color, "segments")

    def _robot_meshes(self):
        robot = self.world.robot
        fn = lambda p, pose=robot.pose: self.world.apply_pose_origin(p, pose)
        color = theme.ACCENT
        bx, by, bz = _ROBOT_BODY
        body = Mesh3(
            "robot",
            _wire_box(fn, bx, by, bz, cz=0.5 * bz),
            color,
            "segments",
        )
        hx, hy, hz = _ROBOT_HEAD
        ha = robot.head_angle

        def head_fn(p, ha=ha, fn=fn):
            x, y, z = _pitch_y(p[0], p[1], p[2], ha)
            return fn((x + 0.02, y, z + 0.055))

        head = Mesh3(
            "robot", _wire_box(head_fn, hx, hy, hz), color, "segments"
        )
        lx, ly, lz = _ROBOT_LIFT
        la = robot.lift_angle

        def lift_fn(p, la=la, fn=fn):
            x, y, z = _pitch_y(p[0], p[1], p[2], la)
            return fn((x + 0.04, y, z + 0.03))

        lift = Mesh3(
            "robot", _wire_box(lift_fn, lx, ly, lz), color, "segments"
        )
        return (body, head, lift)

    def tick(self, now=None, force=False):
        """Rebuild protocol meshes at ≤4 Hz. Grid/axes update with the camera.

        The vispy draw timer already fires at DRAW_OBJECTS_RATE_SEC; pass
        force=True from that timer so jitter does not skip a cycle.
        """
        if self.paused:
            return False
        if now is None:
            now = time.monotonic()
        if (
            not force
            and self._last_rebuild is not None
            and (now - self._last_rebuild) < DRAW_OBJECTS_RATE_SEC
        ):
            return False
        self._last_rebuild = now
        self._push_world()
        return True

    def rebuild(self):
        """Snapshot World into mesh lists and vispy Line visuals (if any)."""
        self._push_grid_axes()
        self._push_world()

    def create_canvas(self, parent=None, show=False):
        """Build a vispy SceneCanvas. Returns None if vispy/GL is unavailable."""
        if self.canvas is not None:
            self.close()
        scene = _scene_mod()
        if scene is None:
            return None
        try:
            canvas = scene.SceneCanvas(
                keys=CANVAS_KEYS,
                size=self.size,
                bgcolor=_rgb01(theme.BG_VOID),
                show=show,
                parent=parent,
            )
            view = canvas.central_widget.add_view()
            cam = scene.TurntableCamera(
                fov=45.0,
                elevation=self.elevation,
                azimuth=self.azimuth,
                distance=self.distance,
                up="+z",
            )
            cam.center = self.center
            view.camera = cam
            # Drive azimuth/elevation ourselves so release can coast (damped).
            cam.interactive = False
        except Exception:
            self.canvas = None
            self._view = None
            self._camera = None
            return None

        try:
            from vispy.scene import visuals
            import numpy as np
        except Exception:
            try:
                canvas.close()
            except Exception:
                pass
            self.canvas = None
            return None

        def _line(parent_node):
            dummy = np.zeros((2, 3), dtype="float32")
            vis = visuals.Line(
                pos=dummy,
                color=_rgba01(theme.TEXT),
                width=1.0,
                connect="segments",
                method="gl",
                parent=parent_node,
            )
            vis.visible = False
            return vis

        try:
            self._grid_line = _line(view.scene)
            self._axes_line = _line(view.scene)
            self._world_line = _line(view.scene)
        except Exception:
            try:
                canvas.close()
            except Exception:
                pass
            self.canvas = None
            self._view = None
            self._camera = None
            return None

        self.canvas = canvas
        self._view = view
        self._camera = cam
        self._push_camera()
        canvas.events.mouse_press.connect(self._on_mouse_press)
        canvas.events.mouse_move.connect(self._on_mouse_move)
        canvas.events.mouse_release.connect(self._on_mouse_release)
        canvas.events.mouse_wheel.connect(self._on_mouse_wheel)
        canvas.events.key_press.connect(self._on_key)
        canvas.events.resize.connect(self._on_resize)
        try:
            from vispy import app

            self._draw_timer = app.Timer(
                interval=DRAW_OBJECTS_RATE_SEC,
                connect=lambda _e: self.tick(force=True),
                start=True,
                iterations=-1,
            )
        except Exception:
            self._draw_timer = None
        self._update_aspect()
        self.rebuild()
        return canvas

    def _update_aspect(self):
        cam = self._camera
        if cam is None:
            return
        w, h = self.size
        aspect = float(w) / max(float(h), 1.0)
        try:
            cam.aspect = aspect
        except Exception:
            pass
        try:
            cam.view_changed()
        except Exception:
            pass

    def _on_resize(self, event):
        try:
            size = event.size
            self.size = (int(size[0]), int(size[1]))
        except Exception:
            pass
        self._update_aspect()

    def _on_key(self, event):
        name = getattr(event.key, "name", None) or str(event.key)
        if name in ("F", "f"):
            self.frame_robot()

    def _on_mouse_press(self, event):
        # 1=LMB orbit (or pan with Shift); 3=MMB pan.
        if event.button in (1, 3):
            self._dragging = True
            self._pan_button = event.button == 3
            self._last_mouse = event.pos
            self._az_vel = 0.0
            self._el_vel = 0.0
            self._last_cam_t = time.monotonic()

    def _on_mouse_release(self, event):
        self._dragging = False
        self._last_mouse = None
        if not self.damp_orbit:
            self._az_vel = 0.0
            self._el_vel = 0.0
        self._arm_coast_timer()

    def _on_mouse_move(self, event):
        if not self._dragging or self._camera is None:
            return
        if event.pos is None or self._last_mouse is None:
            return
        dx = float(event.pos[0] - self._last_mouse[0])
        dy = float(event.pos[1] - self._last_mouse[1])
        self._last_mouse = event.pos
        now = time.monotonic()
        raw_dt = now - self._last_cam_t if self._last_cam_t is not None else _MIN_ORBIT_DT
        self._last_cam_t = now
        dt = _orbit_dt(raw_dt)
        # LMB: orbit. MMB or Shift+LMB: pan (MASTER.md).
        modifiers = getattr(event, "modifiers", ()) or ()
        names = {getattr(m, "name", str(m)) for m in modifiers}
        shift = "Shift" in names or "shift" in names
        if self._pan_button or shift:
            self._pan(dx, dy)
            self._az_vel = 0.0
            self._el_vel = 0.0
        else:
            daz = -dx * 0.4
            delv = dy * 0.4
            self.azimuth = (self.azimuth + daz) % 360.0
            self.elevation = max(-89.0, min(89.0, self.elevation + delv))
            self._az_vel = _clamp_orbit_vel(daz / dt)
            self._el_vel = _clamp_orbit_vel(delv / dt)
        self._push_camera()

    def _pan(self, dx, dy):
        """Grab-the-world pan in the camera right / camera-up plane."""
        s = 0.002 * self.distance
        right, cam_up = _pan_axes(self.azimuth, self.elevation)
        cx, cy, cz = self.center
        self.center = (
            cx - s * dx * right[0] + s * dy * cam_up[0],
            cy - s * dx * right[1] + s * dy * cam_up[1],
            cz - s * dx * right[2] + s * dy * cam_up[2],
        )

    def _on_mouse_wheel(self, event):
        delta = getattr(event, "delta", (0.0, 0.0))
        try:
            dy = float(delta[1])
        except Exception:
            dy = 0.0
        if dy == 0:
            try:
                dy = float(delta[0])
            except Exception:
                dy = 0.0
        factor = math.pow(0.9, dy)
        self.distance = max(0.05, min(50.0, self.distance * factor))
        self._push_camera()

    def _arm_coast_timer(self):
        if not self.damp_orbit:
            return
        if abs(self._az_vel) < 1e-3 and abs(self._el_vel) < 1e-3:
            return
        if self.canvas is None:
            return
        if self._timer is not None:
            try:
                self._timer.start()
            except Exception:
                self._timer = None
            else:
                return
        try:
            from vispy import app
        except Exception:
            return
        try:
            self._timer = app.Timer(
                interval=0.016,
                connect=self._on_coast,
                start=True,
                iterations=-1,
            )
        except Exception:
            self._timer = None

    def _on_coast(self, event):
        if self._dragging or not self.damp_orbit:
            return
        now = time.monotonic()
        ev_dt = getattr(event, "dt", None)
        if ev_dt is None or ev_dt <= 0:
            if self._last_cam_t is not None:
                ev_dt = now - self._last_cam_t
            else:
                ev_dt = _MIN_ORBIT_DT
        self._last_cam_t = now
        dt = max(float(ev_dt), 1e-3)
        # ~150 ms time constant (theme.MOTION_MS); no auto-spin — vel → 0.
        decay = math.exp(-dt * 1000.0 / max(theme.MOTION_MS, 1))
        self._az_vel *= decay
        self._el_vel *= decay
        if abs(self._az_vel) < 0.5 and abs(self._el_vel) < 0.5:
            self._az_vel = 0.0
            self._el_vel = 0.0
            if self._timer is not None:
                try:
                    self._timer.stop()
                except Exception:
                    pass
            return
        self.azimuth = (self.azimuth + self._az_vel * dt) % 360.0
        self.elevation = max(-89.0, min(89.0, self.elevation + self._el_vel * dt))
        self._push_camera()

    def _push_camera(self):
        cam = self._camera
        if cam is not None:
            try:
                cam.azimuth = self.azimuth
                cam.elevation = self.elevation
                cam.distance = self.distance
                cam.center = self.center
            except Exception:
                pass
        self._push_grid_axes()

    def _push_grid_axes(self):
        if self._grid_line is None:
            return
        gpos = []
        for mesh in self.grid_lines():
            for p in _expand_segments(mesh.points, mesh.connect):
                gpos.append(p)
        self._set_line(self._grid_line, gpos, _rgba01(theme.GRID))
        axes_pos, axes_col = self._axes_arrays()
        self._set_line(self._axes_line, axes_pos, axes_col)

    def _push_world(self):
        if self._world_line is None:
            return
        wpos, wcol = self._world_arrays()
        self._set_line(self._world_line, wpos, wcol)

    def _axes_arrays(self):
        pos = []
        col = []
        for mesh in self.axes_lines():
            rgba = _rgba01(mesh.color)
            for p in _expand_segments(mesh.points, mesh.connect):
                pos.append(p)
                col.append(rgba)
        return pos, col

    def _world_arrays(self):
        pos = []
        col = []
        for mesh in self.meshes():
            rgba = _rgba01(mesh.color)
            for p in _expand_segments(mesh.points, mesh.connect):
                pos.append(p)
                col.append(rgba)
        return pos, col

    def _set_line(self, visual, points, color):
        if visual is None:
            return
        try:
            import numpy as np
        except Exception:
            return
        if len(points) < 2:
            visual.visible = False
            return
        pos = np.asarray(points, dtype="float32")
        if pos.ndim != 2 or pos.shape[1] != 3:
            visual.visible = False
            return
        visual.visible = True
        if isinstance(color, tuple) and len(color) == 4:
            visual.set_data(pos=pos, color=color, connect="segments")
        else:
            col = np.asarray(color, dtype="float32")
            visual.set_data(pos=pos, color=col, connect="segments")
