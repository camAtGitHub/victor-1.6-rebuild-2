"""Behavior stack + robot state HUD.

Stack draw: vizControllerImpl.cpp:918–933 (clear, then debugStrings[i] at line i).
Robot state: vizControllerImpl.cpp:756–882 (pose/head/lift/pitch/roll/accel/gyro
plus cliffs/battery/anim in the same handler). CurrentAnimation: 910–915.
SetLabel: 394–398 (NUM_TEXT_LABELS + labelID).
Producer: stackVizMonitor.cpp:64–81 (GetDebugLabel, bottom-to-top as sent).

debugStrings index 0 is the stack bottom and is drawn at the top of the panel.
Do not reverse. Theme tokens only; no raw color hex.
"""

from __future__ import annotations

import math
import os
from collections import namedtuple

from vizmanager import theme

# VizTextLabelType in vizControllerImpl.h:88–107 (line numbers on the state panel).
NUM_TEXT_LABELS = 19

# cozmoConfig.h ConvertLiftAngleToLiftHeightMM
_LIFT_ARM_LENGTH = 66.0
_LIFT_BASE_Z = 30.5 + 29.0 / 2.0  # LIFT_BASE_POSITION[2] = 30.5 + WHEEL_RAD_TO_MM
_LIFT_FORK_HEIGHT = 0.0

# RobotStatusFlag bits (robotStatusAndActions.clad) — not color tokens.
_IS_MOVING = 1 << 0
_IS_CARRYING_BLOCK = 1 << 1
_IS_PICKING_OR_PLACING = 1 << 2
_IS_PICKED_UP = 1 << 3
_IS_BUTTON_PRESSED = 1 << 4
_IS_FALLING = 1 << 5
_IS_PATHING = 1 << 7
_LIFT_IN_POS = 1 << 8
_HEAD_IN_POS = 1 << 9
_CALM_POWER_MODE = 1 << 10
_IS_BATTERY_DISCONNECTED = 1 << 11
_IS_ON_CHARGER = 1 << 12
_IS_CHARGING = 1 << 13
_IS_BEING_HELD = 1 << 16
_IS_BATTERY_OVERHEATED = 1 << 18

# AnimTrackFlag (animationTypes.clad)
_HEAD_TRACK = 1 << 0
_LIFT_TRACK = 1 << 1
_BODY_TRACK = 1 << 2

_OFF_TREADS = {
    0: "OnTreads",
    1: "InAir",
    2: "OnBack",
    3: "OnLeftSide",
    4: "OnRightSide",
    5: "OnFace",
    6: "Falling",
}

_RANGE_STATUS = {
    0: "RANGE_VALID",
    1: "SIGMA_FAIL",
    2: "SIGNAL_FAIL",
    3: "MIN_RANGE_FAIL",
    4: "PHASE_FAIL",
    5: "HARDWARE_FAIL",
    255: "NO_UPDATE",
}

_LINE_H = theme.SPACE[3]  # 16px; Webots used 10px Lucida — too small
_EMPTY_STACK = "No BehaviorStackDebug yet"
_EMPTY_STATE = "No RobotStateMessage yet"

# ImageSendMode (clad/types/imageTypes.clad) — Off/Stream/SingleShot.
IMAGE_SEND_OFF = 0
IMAGE_SEND_STREAM = 1
IMAGE_SEND_SINGLE = 2

_DEFAULT_IMAGES_FOLDER = "saved_images"
_DEFAULT_STATE_FOLDER = "saved_state"
_STATE_FILENAME = "RobotState.txt"

# Docking inset geometry from vizControllerImpl.cpp:401–452 (STATE, not a pane).
DOCK_MM_PER_PIXEL = 2.0
DOCK_RECT_W = 180
DOCK_RECT_H = 180
DOCK_HALF_FACE = 20

_VISION_TEXT_WIDTH = 15
_VISION_MODES_PER_LINE = 4
_VISION_MOD_MAX_LEN = 8

DockingError = namedtuple("DockingError", "x_dist y_dist z_dist angle")


def _vision_mode_names():
    """Map VisionMode int → enum name. Empty if generated CLAD is missing."""
    try:
        from clad.types.visionModes import Anki
    except ImportError:
        return {}
    vision_mode = Anki.Vector.VisionMode
    names = {}
    for attr in dir(vision_mode):
        if attr.startswith("_") or attr == "Count":
            continue
        value = getattr(vision_mode, attr)
        if isinstance(value, int):
            names[value] = attr
    return names


def _vision_mode_count(names):
    try:
        from clad.types.visionModes import Anki
        return int(Anki.Vector.VisionMode.Count)
    except (ImportError, AttributeError):
        if not names:
            return 0
        return max(names) + 1


def _mode_color(active):
    return theme.TEXT if active else theme.TEXT_MUTED


def _deg(rad):
    return rad * (180.0 / math.pi)


def lift_height_mm(angle_rad):
    """ConvertLiftAngleToLiftHeightMM: sin(angle)*LIFT_ARM_LENGTH + base Z."""
    return math.sin(angle_rad) * _LIFT_ARM_LENGTH + _LIFT_BASE_Z + _LIFT_FORK_HEIGHT


def _flag(status, bit, yes):
    return yes if status & bit else ""


def _track_ch(bits, mask, ch):
    return ch if bits & mask else " "


def _range_status_to_string(value):
    return _RANGE_STATUS.get(int(value), "Invalid RangeStatus")


def _off_treads_to_string(value):
    return _OFF_TREADS.get(int(value), "Invalid OffTreadsState")


def _hz(period_ms):
    if not period_ms:
        return 0.0
    return 1000.0 / float(period_ms)


def _pygame():
    try:
        import pygame
        return pygame
    except ImportError:
        return None


class HUD:
    """Latest stack / robot state / labels / animation. Draw is optional."""

    def __init__(self):
        self.stack = []
        self.robot_state = None
        self.labels = {}
        self.anim_name = ""
        self.anim_tag = 0
        self._font = None
        self.docking = None
        self.enabled_modes = ()
        self.vision_debug = ()
        self.image_mode = IMAGE_SEND_OFF
        self.images_folder = ""
        self.state_enabled = False
        self.state_folder = ""
        self._mode_names = None

    def handle_behavior_stack(self, msg):
        # Engine order: index 0 = stack bottom (stackVizMonitor push order).
        self.stack = list(msg.data.debugStrings)

    def handle_robot_state(self, msg):
        self.robot_state = msg.data

    def handle_set_label(self, msg):
        payload = msg.data
        self.labels[int(payload.labelID)] = payload.text

    def handle_current_animation(self, msg):
        payload = msg.data
        self.anim_name = payload.animName
        self.anim_tag = int(payload.tag)

    def stack_lines(self):
        """debugStrings as sent: index 0 at top. Do not reverse."""
        return list(self.stack)

    def state_lines(self):
        """Webots robot-state lines, then SetLabel at NUM_TEXT_LABELS + labelID."""
        lines = [""] * NUM_TEXT_LABELS
        if self.robot_state is not None:
            formatted = self._format_robot_state()
            lines[: len(formatted)] = formatted
        if self.labels:
            extra = max(self.labels) + 1
            lines.extend([""] * extra)
            for label_id, text in self.labels.items():
                lines[NUM_TEXT_LABELS + label_id] = text
        return lines

    def _format_robot_state(self):
        payload = self.robot_state
        state = payload.state
        pose = state.pose
        status = state.status
        accel = state.accel
        gyro = state.gyro
        prox = state.proxData
        cliffs = state.cliffDataRaw
        thresh = payload.cliffThresholds
        spad = prox.spadCount
        sig = (prox.signalIntensity / spad) if spad else 0.0
        ambient = (100.0 * prox.ambientIntensity / spad) if spad else 0.0
        curr = payload.offTreadsState
        nxt = payload.awaitingConfirmationTreadState
        locked = payload.lockedAnimTracks
        in_use = payload.animTracksInUse
        hot = "H" if status & _IS_BATTERY_OVERHEATED else " "
        disc = "D" if status & _IS_BATTERY_DISCONNECTED else " "
        return [
            "Pose: %6.1f, %6.1f, ang: %4.1f  [fid: %d, oid: %d]"
            % (pose.x, pose.y, _deg(pose.angle), state.pose_frame_id, state.pose_origin_id),
            "Head: %5.1f deg, Lift: %4.1f mm"
            % (_deg(state.headAngle), lift_height_mm(state.liftAngle)),
            "Pitch: %4.1f deg (IMUHead: %4.1f deg)"
            % (_deg(pose.pitch_angle), _deg(pose.pitch_angle + state.headAngle)),
            "Roll: %4.1f deg" % _deg(pose.roll_angle),
            "Acc:  %6.0f %6.0f %6.0f mm/s2  ImuTemp %+6.2f degC"
            % (accel.x, accel.y, accel.z, payload.imuTemperature_degC),
            "Gyro: %6.1f %6.1f %6.1f deg/s"
            % (_deg(gyro.x), _deg(gyro.y), _deg(gyro.z)),
            "Cliff: {%4d, %4d, %4d, %4d} thresh: {%4d, %4d, %4d, %4d}"
            % (
                cliffs[0],
                cliffs[1],
                cliffs[2],
                cliffs[3],
                thresh[0],
                thresh[1],
                thresh[2],
                thresh[3],
            ),
            "Dist: %4d mm, sigStrength: %5.3f, ambient: %5.3f status %s"
            % (prox.distance_mm, sig, ambient, _range_status_to_string(prox.rangeStatus)),
            "Speed L: %4d  R: %4d mm/s"
            % (int(state.lwheel_speed_mmps), int(state.rwheel_speed_mmps)),
            "OffTreadsState: %s  %s"
            % (
                _off_treads_to_string(curr),
                _off_treads_to_string(nxt) if curr != nxt else "",
            ),
            "Touch: %d" % state.backpackTouchSensorRaw,
            "Batt: %2.2fV, %2dC [%s%s]"
            % (payload.batteryVolts, state.battTemp_C, hot, disc),
            "Anim: %32s [%d], ProcFaceFrames: %d"
            % (self.anim_name, self.anim_tag, payload.numProcAnimFaceKeyframes),
            "Locked: %s%s%s, InUse: %s%s%s"
            % (
                _track_ch(locked, _LIFT_TRACK, "L"),
                _track_ch(locked, _HEAD_TRACK, "H"),
                _track_ch(locked, _BODY_TRACK, "B"),
                _track_ch(in_use, _LIFT_TRACK, "L"),
                _track_ch(in_use, _HEAD_TRACK, "H"),
                _track_ch(in_use, _BODY_TRACK, "B"),
            ),
            "Video: %.1f Hz   Proc: %.1f Hz"
            % (_hz(payload.videoFramePeriodMs), _hz(payload.imageProcPeriodMs)),
            "Status: %5s %5s %6s %4s %4s"
            % (
                _flag(status, _IS_CARRYING_BLOCK, "CARRY"),
                _flag(status, _IS_PICKING_OR_PLACING, "PAP"),
                _flag(status, _IS_PICKED_UP, "PICKUP"),
                _flag(status, _IS_BEING_HELD, "HELD"),
                _flag(status, _IS_FALLING, "FALL"),
            ),
            "   %8s %10s %7s %4s"
            % (
                _flag(status, _IS_CHARGING, "CHARGING"),
                _flag(status, _IS_ON_CHARGER, "ON_CHARGER"),
                _flag(status, _IS_BUTTON_PRESSED, "PWR_BTN"),
                _flag(status, _CALM_POWER_MODE, "CALM"),
            ),
            "   %4s %7s %7s %6s"
            % (
                _flag(status, _IS_PATHING, "PATH"),
                "" if status & _LIFT_IN_POS else "LIFTING",
                "" if status & _HEAD_IN_POS else "HEADING",
                _flag(status, _IS_MOVING, "MOVING"),
            ),
        ]

    def _ensure_font(self):
        pg = _pygame()
        if pg is None:
            return None
        if self._font is None:
            if not pg.font.get_init():
                pg.font.init()
            path = None
            for name in (theme.FONT_MONO, "DejaVu Sans Mono", "Consolas"):
                path = pg.font.match_font(name)
                if path:
                    break
            if path:
                self._font = pg.font.Font(path, theme.FONT_HUD_PX)
            else:
                self._font = pg.font.Font(None, theme.FONT_HUD_PX)
        return self._font

    def _blit_lines(self, surface, lines, color):
        surface.fill(theme.BG_PANEL)
        font = self._ensure_font()
        if font is None:
            return surface
        pad = theme.PANEL_PAD
        for i, text in enumerate(lines):
            if not text:
                continue
            img = font.render(str(text), True, color)
            surface.blit(img, (pad, pad + i * _LINE_H))
        return surface

    def draw_stack(self, surface):
        """Paint stack onto a pygame surface (dummy display / offscreen ok)."""
        if self.stack:
            return self._blit_lines(surface, self.stack, theme.TEXT)
        return self._blit_lines(surface, [_EMPTY_STACK], theme.TEXT_MUTED)

    def draw_state(self, surface):
        """Paint robot-state + labels onto a pygame surface (offscreen ok)."""
        lines = self.state_lines()
        if self.robot_state is None and not self.labels:
            return self._blit_lines(surface, [_EMPTY_STATE], theme.TEXT_MUTED)
        return self._blit_lines(surface, lines, theme.TEXT)

    def set_docking(self, x_dist, y_dist, z_dist, angle):
        self.docking = DockingError(x_dist, y_dist, z_dist, angle)

    def docking_state_line(self):
        """One STATE line. None until a DockingErrorSignal arrives."""
        dock = self.docking
        if dock is None:
            return None
        return "ErrSig x:{:.1f} y:{:.1f} z:{:.1f} a:{:.2f}".format(
            dock.x_dist, dock.y_dist, dock.z_dist, dock.angle
        )

    def docking_plot(self):
        """Optional STATE inset geometry. None if missing or off the 180 px box."""
        dock = self.docking
        if dock is None:
            return None
        face_x = 0.5 * DOCK_RECT_W - dock.y_dist / DOCK_MM_PER_PIXEL
        face_y = DOCK_RECT_H - dock.x_dist / DOCK_MM_PER_PIXEL
        if (
            face_x < DOCK_HALF_FACE
            or face_x > DOCK_RECT_W - DOCK_HALF_FACE
            or face_y < DOCK_HALF_FACE
            or face_y > DOCK_RECT_H - DOCK_HALF_FACE
        ):
            return None
        dx = DOCK_HALF_FACE * math.cos(dock.angle)
        dy = -DOCK_HALF_FACE * math.sin(dock.angle)
        return {
            "size": (DOCK_RECT_W, DOCK_RECT_H),
            "robot": (0.5 * DOCK_RECT_W, float(DOCK_RECT_H)),
            "face": (face_x, face_y),
            "face_line": (
                (face_x + dx, face_y + dy),
                (face_x - dx, face_y - dy),
            ),
        }

    def set_enabled_vision_modes(self, modes):
        self.enabled_modes = tuple(int(m) for m in modes)

    def set_vision_mode_debug(self, debug_strings):
        self.vision_debug = tuple(debug_strings)

    def vision_schedule_lines(self):
        """VisionModeDebug rows: skip modifier names that contain '_'."""
        return [s for s in self.vision_debug if "_" not in s]

    def _names(self):
        if self._mode_names is None:
            self._mode_names = _vision_mode_names()
        return self._mode_names

    def _mode_groups(self):
        """Base modes → modifier list, enum order. Matches kModesMap build."""
        names = self._names()
        if not names:
            return []
        inverse = {name: value for value, name in names.items()}
        count = _vision_mode_count(names)
        groups = []
        index = {}
        for mode in range(count):
            name = names.get(mode)
            if not name:
                continue
            underscore = name.find("_")
            if underscore == -1:
                index[mode] = len(groups)
                groups.append((mode, name, []))
                continue
            base_name = name[:underscore]
            base = inverse.get(base_name)
            if base is None:
                continue
            if base not in index:
                index[base] = len(groups)
                groups.append((base, base_name, []))
            mod = name[underscore + 1 : underscore + 1 + _VISION_MOD_MAX_LEN]
            groups[index[base]][2].append((mode, mod))
        return groups

    def vision_mode_plain(self):
        """Modes without modifiers: (name, active, color_token) in enum order."""
        enabled = set(self.enabled_modes)
        rows = []
        for mode, name, modifiers in self._mode_groups():
            if modifiers:
                continue
            active = mode in enabled
            rows.append((name[:_VISION_TEXT_WIDTH], active, _mode_color(active)))
        return rows

    def vision_mode_with_modifiers(self):
        """Modes that have modifiers: (name, active, color, [(mod, active, color)])."""
        enabled = set(self.enabled_modes)
        rows = []
        for mode, name, modifiers in self._mode_groups():
            if not modifiers:
                continue
            active = mode in enabled
            mods = []
            for mod_id, mod_name in modifiers:
                mod_active = mod_id in enabled
                mods.append((mod_name, mod_active, _mode_color(mod_active)))
            rows.append((name, active, _mode_color(active), tuple(mods)))
        return rows

    def vision_modes_per_line(self):
        return _VISION_MODES_PER_LINE

    def apply_save_images(self, mode, path):
        self.image_mode = int(mode)
        if self.image_mode == IMAGE_SEND_OFF:
            return
        folder = path if path else _DEFAULT_IMAGES_FOLDER
        self.images_folder = folder
        if folder:
            os.makedirs(folder, exist_ok=True)

    def apply_save_state(self, enabled, path):
        self.state_enabled = bool(enabled)
        if not self.state_enabled:
            return
        folder = path if path else _DEFAULT_STATE_FOLDER
        self.state_folder = folder
        if folder:
            os.makedirs(folder, exist_ok=True)

    def save_image(self, filename, data):
        """Write image bytes if SaveImages is on. SingleShot then turns Off."""
        if self.image_mode == IMAGE_SEND_OFF:
            return None
        folder = self.images_folder or _DEFAULT_IMAGES_FOLDER
        os.makedirs(folder, exist_ok=True)
        dest = os.path.join(folder, filename)
        with open(dest, "wb") as handle:
            handle.write(data)
        if self.image_mode == IMAGE_SEND_SINGLE:
            self.image_mode = IMAGE_SEND_OFF
        return dest

    def save_state_payload(self, packed_bytes):
        """Append a hex line to RobotState.txt in the save-state folder."""
        if not self.state_enabled:
            return None
        folder = self.state_folder or _DEFAULT_STATE_FOLDER
        os.makedirs(folder, exist_ok=True)
        dest = os.path.join(folder, _STATE_FILENAME)
        with open(dest, "a") as handle:
            handle.write(packed_bytes.hex())
            handle.write("\n")
        return dest


Hud = HUD
