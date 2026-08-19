"""Camera paste + Camera* overlays. Overlays are not queued.

JPEG chunks reassemble first. A complete displayIndex==0 frame is pasted
(wiping overlays). CameraQuad/Rect/Line/Oval/Text then paint on that
surface until the next complete camera frame. CameraParams is stored and
drawn at paste (DisplayCameraInfo). Copy vizControllerImpl.cpp:529–717.
Overlay coords are image pixels. Letterbox (BG_VOID) is PR9.
"""

from __future__ import annotations

from vizmanager.image import EncodedImage, opencv_available

try:
    import cv2
except ImportError:  # tests skip
    cv2 = None

# Anki NamedColors as RGB (ColorRGBA 1,0,0 / 0,0,0). Protocol overlay HUD.
_NAMED_RED = (255, 0, 0)
_NAMED_BLACK = (0, 0, 0)


def _rgb_from_anki(color):
    """Unpack CLAD ColorRGBA 0xRRGGBBAA to an (r, g, b) tuple."""
    return ((color >> 24) & 0xFF, (color >> 16) & 0xFF, (color >> 8) & 0xFF)


class Overlay2D:
    """displayIndex==0 camera surface; ≥1 debug frames if they complete."""

    def __init__(self):
        self._camera = EncodedImage()
        self._debug = {}
        self.frame = None
        self.timestamp = 0
        self.camera_params = None
        self.debug_frames = {}
        self.frames_decoded = 0

    def handle_image_chunk(self, payload):
        display_index = payload.displayIndex
        if display_index == 0:
            if not self._camera.add_chunk(payload):
                return
            rgb = self._camera.decode()
            if rgb is None:
                return
            self.frame = rgb.copy()
            self.timestamp = self._camera.timestamp
            self.frames_decoded += 1
            self._draw_camera_info()
            return

        enc = self._debug.setdefault(display_index, EncodedImage())
        if not enc.add_chunk(payload):
            return
        rgb = enc.decode()
        if rgb is not None:
            self.debug_frames[display_index] = rgb

    def handle_camera_quad(self, payload):
        if self.frame is None or not opencv_available():
            return
        color = _rgb_from_anki(payload.color)
        pts = (
            (int(payload.xUpperLeft), int(payload.yUpperLeft)),
            (int(payload.xLowerLeft), int(payload.yLowerLeft)),
            (int(payload.xLowerRight), int(payload.yLowerRight)),
            (int(payload.xUpperRight), int(payload.yUpperRight)),
        )
        cv2.line(self.frame, pts[0], pts[1], color, 1)
        cv2.line(self.frame, pts[1], pts[2], color, 1)
        cv2.line(self.frame, pts[2], pts[3], color, 1)
        top = color
        if payload.topColor != payload.color:
            top = _rgb_from_anki(payload.topColor)
        cv2.line(self.frame, pts[3], pts[0], top, 1)

    def handle_camera_rect(self, payload):
        if self.frame is None or not opencv_available():
            return
        color = _rgb_from_anki(payload.color)
        pt1 = (int(payload.x), int(payload.y))
        pt2 = (int(payload.x + payload.width), int(payload.y + payload.height))
        thickness = -1 if payload.filled else 1
        cv2.rectangle(self.frame, pt1, pt2, color, thickness)

    def handle_camera_line(self, payload):
        if self.frame is None or not opencv_available():
            return
        color = _rgb_from_anki(payload.color)
        cv2.line(
            self.frame,
            (int(payload.xStart), int(payload.yStart)),
            (int(payload.xEnd), int(payload.yEnd)),
            color,
            1,
        )

    def handle_camera_oval(self, payload):
        if self.frame is None or not opencv_available():
            return
        color = _rgb_from_anki(payload.color)
        center = (int(round(payload.xCen)), int(round(payload.yCen)))
        axes = (int(round(payload.xRad)), int(round(payload.yRad)))
        if axes[0] <= 0 or axes[1] <= 0:
            return
        cv2.ellipse(self.frame, center, axes, 0, 0, 360, color, 1)

    def handle_camera_text(self, payload):
        if self.frame is None or not opencv_available():
            return
        text = payload.text
        if not text:
            return
        x = int(payload.x)
        y = int(payload.y)
        cv2.putText(
            self.frame, text, (x + 1, y + 1),
            cv2.FONT_HERSHEY_SIMPLEX, 0.4, _NAMED_BLACK, 1, cv2.LINE_AA,
        )
        cv2.putText(
            self.frame, text, (x, y),
            cv2.FONT_HERSHEY_SIMPLEX, 0.4, _rgb_from_anki(payload.color),
            1, cv2.LINE_AA,
        )

    def handle_camera_params(self, payload):
        self.camera_params = payload.cameraParams

    def _draw_camera_info(self):
        if self.frame is None or not opencv_available():
            return
        h, w = self.frame.shape[0], self.frame.shape[1]
        params = self.camera_params
        exp_ms = 0
        gain = 0.0
        awb_r = awb_g = awb_b = 0.0
        if params is not None:
            exp_ms = params.exposureTime_ms
            gain = params.gain
            awb_r = params.whiteBalanceGainR
            awb_g = params.whiteBalanceGainG
            awb_b = params.whiteBalanceGainB
        exp_text = "Exp:%u Gain:%.3f" % (exp_ms, gain)
        awb_text = "AWB:%.3f %.3f %.3f" % (awb_r, awb_g, awb_b)
        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(
            self.frame, str(int(self.timestamp)), (1, h - 9),
            font, 0.35, _NAMED_RED, 1, cv2.LINE_AA,
        )
        cv2.putText(
            self.frame, exp_text, (max(0, w - 144), h - 9),
            font, 0.35, _NAMED_RED, 1, cv2.LINE_AA,
        )
        cv2.putText(
            self.frame, awb_text, (max(0, w - 180), h - 18),
            font, 0.35, _NAMED_RED, 1, cv2.LINE_AA,
        )
