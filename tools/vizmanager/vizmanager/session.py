"""MessageViz session: ANKICONN handshake, then tag dispatch.

Loop idea from webotsCtrlViz.cpp:47–73 (recv) and vizControllerImpl.cpp:261–266
(ProcessMessage → handlers.get(tag, drop)). Handshake is not MessageViz.
"""

from __future__ import annotations

from vizmanager import codec
from vizmanager.hud import HUD
from vizmanager.overlay2d import Overlay2D
from vizmanager.udp import ANKICONN
from vizmanager.world import World


class Session:
    """Dispatch one datagram at a time. Tests call process_datagram without a socket."""

    def __init__(self):
        self.packets = 0
        self.handshakes = 0
        self.tag_counts = {}
        self.drops = 0
        self.errors = 0
        self.last_addr = None
        self.last_handshake_addr = None
        self.world = World()
        self.overlay = Overlay2D()
        # HANDLERS — later PRs only ADD handlers[tag] = ... in this block. Do not refactor.
        self.handlers = {}
        # PR4:
        self.hud = HUD()
        _Tag = codec.MessageViz.Tag if codec.generated_available() else None
        self.handlers[_Tag.BehaviorStackDebug if _Tag else 51] = self.hud.handle_behavior_stack
        self.handlers[_Tag.RobotStateMessage if _Tag else 22] = self.hud.handle_robot_state
        self.handlers[_Tag.SetLabel if _Tag else 44] = self.hud.handle_set_label
        self.handlers[_Tag.CurrentAnimation if _Tag else 23] = self.hud.handle_current_animation
        _mv = codec.MessageViz
        if _mv is not None:
            # PR5:
            self.handlers[_mv.Tag.ImageChunk] = self._on_image_chunk
            self.handlers[_mv.Tag.CameraQuad] = self._on_camera_quad
            self.handlers[_mv.Tag.CameraRect] = self._on_camera_rect
            self.handlers[_mv.Tag.CameraLine] = self._on_camera_line
            self.handlers[_mv.Tag.CameraOval] = self._on_camera_oval
            self.handlers[_mv.Tag.CameraText] = self._on_camera_text
            self.handlers[_mv.Tag.CameraParams] = self._on_camera_params
            # PR6:
            self.handlers[_mv.Tag.SetVizOrigin] = self._on_set_viz_origin
            self.handlers[_mv.Tag.Object] = self._on_object
            self.handlers[_mv.Tag.LineSegment] = self._on_line_segment
            self.handlers[_mv.Tag.Quad] = self._on_quad
            self.handlers[_mv.Tag.EraseObject] = self._on_erase_object
            self.handlers[_mv.Tag.EraseLineSegments] = self._on_erase_line_segments
            self.handlers[_mv.Tag.EraseQuad] = self._on_erase_quad
            self.handlers[_mv.Tag.SetRobot] = self._on_set_robot
            self.handlers[_mv.Tag.AppendPathSegmentLine] = self._on_append_path_line
            self.handlers[_mv.Tag.AppendPathSegmentArc] = self._on_append_path_arc
            self.handlers[_mv.Tag.SetPathColor] = self._on_set_path_color
            self.handlers[_mv.Tag.ErasePath] = self._on_erase_path
            self.handlers[_mv.Tag.ShowObjects] = self._on_show_objects
            # PR8:
            self.handlers[_mv.Tag.MemoryMapMessageVizBegin] = self._on_memory_map_begin
            self.handlers[_mv.Tag.MemoryMapMessageViz] = self._on_memory_map
            self.handlers[_mv.Tag.MemoryMapMessageVizEnd] = self._on_memory_map_end
            self.handlers[_mv.Tag.EnabledVisionModes] = self._on_enabled_vision_modes
            self.handlers[_mv.Tag.DockingErrorSignal] = self._on_docking
            self.handlers[_mv.Tag.VisionMarker] = self._noop
            self.handlers[_mv.Tag.TrackerQuad] = self._noop
            self.handlers[_mv.Tag.FaceDetection] = self._noop
            self.handlers[_mv.Tag.VisionModeDebug] = self._on_vision_mode_debug
            self.handlers[_mv.Tag.SaveImages] = self._on_save_images
            self.handlers[_mv.Tag.SaveState] = self._on_save_state

    def _drop(self, msg):
        self.drops += 1

    def _noop(self, msg):
        """FaceDetection unused; VisionMarker/TrackerQuad have no live sender."""

    def process_datagram(self, data, addr=None):
        """Recv-side dispatch. Do not pass ANKICONN to codec.unpack."""
        self.packets += 1
        self.last_addr = addr
        if data == ANKICONN:
            self.handshakes += 1
            self.last_handshake_addr = addr
            return
        try:
            msg, tag = codec.unpack(data)
        except Exception:
            self.errors += 1
            return
        self.tag_counts[tag] = self.tag_counts.get(tag, 0) + 1
        self.handlers.get(tag, self._drop)(msg)

    def _on_image_chunk(self, msg):
        self.overlay.handle_image_chunk(msg.data)

    def _on_camera_quad(self, msg):
        self.overlay.handle_camera_quad(msg.data)

    def _on_camera_rect(self, msg):
        self.overlay.handle_camera_rect(msg.data)

    def _on_camera_line(self, msg):
        self.overlay.handle_camera_line(msg.data)

    def _on_camera_oval(self, msg):
        self.overlay.handle_camera_oval(msg.data)

    def _on_camera_text(self, msg):
        self.overlay.handle_camera_text(msg.data)

    def _on_camera_params(self, msg):
        self.overlay.handle_camera_params(msg.data)

    def _on_set_viz_origin(self, msg):
        self.world.set_viz_origin(msg.data)

    def _on_object(self, msg):
        self.world.set_object(msg.data)

    def _on_line_segment(self, msg):
        self.world.add_line_segment(msg.data)

    def _on_quad(self, msg):
        self.world.set_quad(msg.data)

    def _on_erase_object(self, msg):
        p = msg.data
        self.world.erase_object(p.objectID, p.lower_bound_id, p.upper_bound_id)

    def _on_erase_line_segments(self, msg):
        self.world.erase_line_segments(msg.data.identifier)

    def _on_erase_quad(self, msg):
        p = msg.data
        self.world.erase_quad(p.quadType, p.quadID)

    def _on_set_robot(self, msg):
        self.world.set_robot(msg.data)

    def _on_append_path_line(self, msg):
        self.world.append_path_line(msg.data)

    def _on_append_path_arc(self, msg):
        self.world.append_path_arc(msg.data)

    def _on_set_path_color(self, msg):
        self.world.set_path_color(msg.data)

    def _on_erase_path(self, msg):
        self.world.erase_path(msg.data.pathID)

    def _on_show_objects(self, msg):
        self.world.set_show_objects(msg.data.show)

    def _on_memory_map_begin(self, msg):
        payload = msg.data
        self.world.memory_map_begin(payload.originId, info=payload.info)

    def _on_memory_map(self, msg):
        payload = msg.data
        self.world.memory_map_chunk(payload.originId, payload.quadInfos)

    def _on_memory_map_end(self, msg):
        payload = msg.data
        self.world.memory_map_end(payload.originId)

    def _on_enabled_vision_modes(self, msg):
        self.hud.set_enabled_vision_modes(msg.data.modes)

    def _on_docking(self, msg):
        payload = msg.data
        self.hud.set_docking(
            payload.x_dist, payload.y_dist, payload.z_dist, payload.angle
        )

    def _on_vision_mode_debug(self, msg):
        self.hud.set_vision_mode_debug(msg.data.debugStrings)

    def _on_save_images(self, msg):
        payload = msg.data
        self.hud.apply_save_images(payload.mode, payload.path)

    def _on_save_state(self, msg):
        payload = msg.data
        self.hud.apply_save_state(payload.enabled, payload.path)
