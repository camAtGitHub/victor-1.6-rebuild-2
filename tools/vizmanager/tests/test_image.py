"""ImageChunk reassembly + JPEGColor decode. Skip if CLAD or opencv missing."""

from __future__ import annotations

import os
import sys

import pytest

_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_GENERATED = os.path.join(
    _REPO, "generated", "cladPython", "clad", "vizInterface", "messageViz.py"
)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager import codec  # noqa: E402
from vizmanager.image import (  # noqa: E402
    IMAGE_CHUNK_SIZE,
    JPEGColor,
    EncodedImage,
    opencv_available,
)
from vizmanager.overlay2d import Overlay2D  # noqa: E402
from vizmanager.session import Session  # noqa: E402

_generated_ok = os.path.isfile(_GENERATED) and codec.generated_available()
_cv2_ok = opencv_available()

needs_image_stack = pytest.mark.skipif(
    not _generated_ok or not _cv2_ok,
    reason="generated CLAD Python or opencv missing",
)

if _cv2_ok:
    import cv2  # noqa: E402
    import numpy as np  # noqa: E402


def _jpeg(width=16, height=16, rgb=(0, 0, 200)):
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = rgb
    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    ok, enc = cv2.imencode(".jpg", bgr)
    assert ok
    jpeg = enc.tobytes()
    assert jpeg[:2] == b"\xff\xd8"
    return jpeg


def _image_chunk_cls():
    return codec.MessageViz.typeByTag(codec.MessageViz.Tag.ImageChunk)


def _chunk(
    jpeg,
    image_id=1,
    width=16,
    height=16,
    ts=100,
    display_index=0,
    chunk_id=0,
    chunk_count=1,
    chunk_size=IMAGE_CHUNK_SIZE,
    encoding=JPEGColor,
):
    start = chunk_id * chunk_size
    piece = jpeg[start : start + chunk_size]
    return _image_chunk_cls()(
        frameTimeStamp=ts,
        imageId=image_id,
        width=width,
        height=height,
        imageEncoding=encoding,
        displayIndex=display_index,
        imageChunkCount=chunk_count,
        chunkId=chunk_id,
        data=tuple(piece),
    )


def _split(jpeg, n, **kwargs):
    size = max(1, (len(jpeg) + n - 1) // n)
    return [
        _chunk(jpeg, chunk_id=i, chunk_count=n, chunk_size=size, **kwargs)
        for i in range(n)
    ]


@needs_image_stack
def test_image_chunk_size_from_clad():
    assert IMAGE_CHUNK_SIZE == 1200


@needs_image_stack
def test_incomplete_chunks_do_not_decode():
    jpeg = _jpeg()
    chunks = _split(jpeg, 2, image_id=7, ts=50)
    enc = EncodedImage()
    assert enc.add_chunk(chunks[0]) is False
    assert enc.is_complete is False
    assert enc.decode() is None
    assert enc.buffer[:2] == b"\xff\xd8"


@needs_image_stack
def test_out_of_order_chunks_do_not_decode():
    jpeg = _jpeg()
    chunks = _split(jpeg, 2, image_id=3, ts=80)
    enc = EncodedImage()
    assert enc.add_chunk(chunks[1]) is False
    assert enc.add_chunk(chunks[0]) is False
    assert enc.is_complete is False
    assert enc.decode() is None


@needs_image_stack
def test_new_image_id_must_start_at_chunk_zero():
    jpeg = _jpeg()
    last = _chunk(jpeg, image_id=9, chunk_id=1, chunk_count=2)
    enc = EncodedImage()
    assert enc.add_chunk(last) is False
    assert enc.decode() is None


@needs_image_stack
def test_complete_jpeg_soi_decodes():
    width, height = 16, 16
    jpeg = _jpeg(width, height)
    assert jpeg[:2] == b"\xff\xd8"
    enc = EncodedImage()
    chunk = _chunk(jpeg, width=width, height=height, image_id=1, ts=123)
    assert enc.add_chunk(chunk) is True
    assert enc.is_complete is True
    assert enc.buffer[:2] == b"\xff\xd8"
    decoded = enc.decode()
    assert decoded is not None
    assert decoded.shape == (height, width, 3)


@needs_image_stack
def test_in_order_multi_chunk_jpeg_decodes():
    jpeg = _jpeg()
    chunks = _split(jpeg, 2, image_id=4, ts=200)
    enc = EncodedImage()
    assert enc.add_chunk(chunks[0]) is False
    assert enc.decode() is None
    assert enc.add_chunk(chunks[1]) is True
    decoded = enc.decode()
    assert decoded is not None
    assert decoded.shape == (16, 16, 3)
    assert enc.buffer[:2] == b"\xff\xd8"


@needs_image_stack
def test_chunk_too_big_does_not_decode():
    jpeg = _jpeg()
    enc = EncodedImage()
    cls = _image_chunk_cls()
    huge = cls(
        frameTimeStamp=1,
        imageId=1,
        width=16,
        height=16,
        imageEncoding=JPEGColor,
        displayIndex=0,
        imageChunkCount=1,
        chunkId=0,
        data=tuple([0] * (IMAGE_CHUNK_SIZE + 1)),
    )
    assert enc.add_chunk(huge) is False
    assert enc.decode() is None
    # State unchanged: a following valid new-id chunk 0 still works.
    assert enc.add_chunk(_chunk(jpeg, image_id=1, ts=10)) is True
    assert enc.decode() is not None


def _pack(tag_name, payload):
    return codec.MessageViz(**{tag_name: payload}).pack()


@needs_image_stack
def test_session_complete_jpeg_pastes_then_overlays_wipe():
    MessageViz = codec.MessageViz
    width, height = 32, 32
    jpeg_a = _jpeg(width, height, rgb=(0, 0, 180))
    jpeg_b = _jpeg(width, height, rgb=(180, 0, 0))
    sess = Session()

    chunk_a = _chunk(jpeg_a, image_id=1, width=width, height=height, ts=10)
    sess.process_datagram(_pack("ImageChunk", chunk_a))
    assert sess.tag_counts[MessageViz.Tag.ImageChunk] == 1
    assert sess.overlay.frames_decoded == 1
    assert sess.overlay.frame is not None
    assert sess.overlay.frame.shape == (height, width, 3)

    line_cls = MessageViz.typeByTag(MessageViz.Tag.CameraLine)
    # Green 0xRRGGBBAA
    line = line_cls(color=0x00FF00FF, xStart=0, yStart=4, xEnd=width - 1, yEnd=4)
    sess.process_datagram(_pack("CameraLine", line))
    g = int(sess.overlay.frame[4, width // 2, 1])
    r = int(sess.overlay.frame[4, width // 2, 0])
    assert g > r

    chunk_b = _chunk(jpeg_b, image_id=2, width=width, height=height, ts=20)
    sess.process_datagram(_pack("ImageChunk", chunk_b))
    assert sess.overlay.frames_decoded == 2
    # Next complete frame pastes and wipes the green line.
    g2 = int(sess.overlay.frame[4, width // 2, 1])
    r2 = int(sess.overlay.frame[4, width // 2, 0])
    assert r2 > g2
    assert sess.drops == 0
    assert sess.errors == 0


@needs_image_stack
def test_session_camera_params_and_debug_index():
    MessageViz = codec.MessageViz
    sess = Session()
    params_cls = MessageViz.typeByTag(MessageViz.Tag.CameraParams)
    inner_cls = params_cls().cameraParams.__class__
    inner = inner_cls(
        exposureTime_ms=15,
        gain=1.25,
        whiteBalanceGainR=1.0,
        whiteBalanceGainG=1.1,
        whiteBalanceGainB=0.9,
    )
    sess.process_datagram(_pack("CameraParams", params_cls(cameraParams=inner)))
    assert sess.overlay.camera_params.exposureTime_ms == 15
    assert sess.tag_counts[MessageViz.Tag.CameraParams] == 1

    jpeg = _jpeg()
    debug = _chunk(jpeg, image_id=11, display_index=1, ts=5)
    sess.process_datagram(_pack("ImageChunk", debug))
    assert 1 in sess.overlay.debug_frames
    assert sess.overlay.frame is None
    assert sess.overlay.frames_decoded == 0
