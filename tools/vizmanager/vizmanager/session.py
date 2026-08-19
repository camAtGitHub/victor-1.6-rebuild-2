"""MessageViz session: ANKICONN handshake, then tag dispatch.

Loop idea from webotsCtrlViz.cpp:47–73 (recv) and vizControllerImpl.cpp:261–266
(ProcessMessage → handlers.get(tag, drop)). Handshake is not MessageViz.
"""

from __future__ import annotations

from vizmanager import codec
from vizmanager.hud import HUD
from vizmanager.overlay2d import Overlay2D
from vizmanager.udp import ANKICONN


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
            self.handlers[_mv.Tag.ImageChunk] = self._on_image_chunk
            self.handlers[_mv.Tag.CameraQuad] = self._on_camera_quad
            self.handlers[_mv.Tag.CameraRect] = self._on_camera_rect
            self.handlers[_mv.Tag.CameraLine] = self._on_camera_line
            self.handlers[_mv.Tag.CameraOval] = self._on_camera_oval
            self.handlers[_mv.Tag.CameraText] = self._on_camera_text
            self.handlers[_mv.Tag.CameraParams] = self._on_camera_params

    def _drop(self, msg):
        self.drops += 1

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
