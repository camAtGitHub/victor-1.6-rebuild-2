"""EncodedImage: ImageChunk reassembly + JPEGColor/Gray decode.

Port of engine/encodedImage.cpp EncodedImage::AddChunk (84–178) and
DecodeImageHelper JPEGColor/JPEGGray only (249–261, 319–330). Viz camera
is standard JPEG (ImageEncoding::JPEGColor). MiniGray is not decoded.
"""

from __future__ import annotations

# clad/types/imageTypes.clad ImageConstants::IMAGE_CHUNK_SIZE
IMAGE_CHUNK_SIZE = 1200

# clad/types/imageFormats.clad ImageEncoding
JPEGGray = 6
JPEGColor = 7
JPEGMinimizedGray = 9
JPEGMinimizedColor = 10

_UINT32_MAX = 0xFFFFFFFF

try:
    import cv2
    import numpy as np
except ImportError:  # tests skip
    cv2 = None
    np = None


def opencv_available():
    return cv2 is not None and np is not None


class EncodedImage:
    """Reassemble ImageChunks keyed by imageId; decode JPEGColor/Gray."""

    def __init__(self):
        self._buffer = bytearray()
        self._timestamp = 0
        self._prev_timestamp = 0
        self._img_width = 0
        self._img_height = 0
        self._img_id = _UINT32_MAX
        self._encoding = 0
        self._expected_chunk_id = 0
        self._is_img_valid = False
        self._num_chunks_received = 0
        self._complete = False

    @property
    def image_id(self):
        return self._img_id

    @property
    def width(self):
        return self._img_width

    @property
    def height(self):
        return self._img_height

    @property
    def timestamp(self):
        return self._timestamp

    @property
    def encoding(self):
        return self._encoding

    @property
    def buffer(self):
        return bytes(self._buffer)

    @property
    def is_complete(self):
        return self._complete and self._is_img_valid

    def add_chunk(self, chunk):
        """Append one ImageChunk. True iff this completes a valid image.

        New imageId must start at chunkId==0. chunkId must be in-order.
        Complete when chunkId == imageChunkCount-1 and received count matches.
        Incomplete/out-of-order chunks do not decode.
        """
        data = chunk.data
        if len(data) > IMAGE_CHUNK_SIZE:
            return False

        if chunk.imageId != self._img_id:
            self._img_id = chunk.imageId
            self._img_width = chunk.width
            self._img_height = chunk.height
            self._is_img_valid = chunk.chunkId == 0
            self._expected_chunk_id = 0
            self._encoding = chunk.imageEncoding
            # MiniGray first-byte color flag lives in AddChunk; we still do
            # not decode MiniGray/MiniColor (viz camera is JPEGColor).
            if (
                data
                and data[0] != 0
                and self._encoding == JPEGMinimizedGray
            ):
                self._encoding = JPEGMinimizedColor
            self._buffer.clear()
            self._num_chunks_received = 0
            self._complete = False

        if chunk.chunkId != self._expected_chunk_id:
            self._is_img_valid = False

        self._expected_chunk_id = chunk.chunkId + 1
        self._num_chunks_received += 1

        is_last_chunk = chunk.chunkId == chunk.imageChunkCount - 1
        if is_last_chunk:
            if self._num_chunks_received != chunk.imageChunkCount:
                self._is_img_valid = False
            else:
                self._prev_timestamp = self._timestamp
                self._timestamp = chunk.frameTimeStamp
                if self._prev_timestamp > self._timestamp:
                    self._is_img_valid = False

        if not self._is_img_valid:
            return False

        self._buffer.extend(data)
        self._complete = is_last_chunk
        return is_last_chunk

    def decode(self):
        """JPEGColor/JPEGGray → HxWx3 RGB uint8, or None.

        Requires a complete valid reassembly. Matches DecodeImageHelper
        IMREAD_COLOR + BGR2RGB (gray JPEG becomes RGB).
        """
        if not self.is_complete:
            return None
        if not opencv_available():
            return None
        if self._encoding not in (JPEGColor, JPEGGray):
            return None
        arr = np.frombuffer(self._buffer, dtype=np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            return None
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        rows, cols = rgb.shape[0], rgb.shape[1]
        if rows != self._img_height or cols != self._img_width:
            return None
        return rgb
