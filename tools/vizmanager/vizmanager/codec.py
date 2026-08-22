"""Thin wrapper around generated CLAD MessageViz.

Generated CLAD is the source of truth for union tags. Tag numbers mentioned
in comments are from dump_viz_tags.py (audit only) — not a hand-rolled table.

Audit names (dump_viz_tags.py): 19 ImageChunk, 22 RobotStateMessage,
24 Object, 39 SetRobot, 51 BehaviorStackDebug.
"""

from __future__ import annotations

import os
import sys


def _repo_root():
    """Repo root, or PyInstaller _MEIPASS when frozen (no checkout required).

    Frozen onedir ships generated/cladPython and msgbuffers under _MEIPASS
    so a zip of dist/VizManager/ runs on a PC that never saw this tree.
    """
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return os.path.abspath(meipass)
        return os.path.abspath(os.path.dirname(sys.executable))
    # tools/vizmanager/vizmanager/codec.py → repo root
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def _ensure_import_path():
    """Put generated CLAD and msgbuffers on sys.path (repo-relative)."""
    root = _repo_root()
    paths = (
        os.path.join(root, "generated", "cladPython"),
        os.path.join(root, "victor-clad", "tools", "message-buffers", "support", "python"),
    )
    for path in paths:
        if path not in sys.path:
            sys.path.insert(0, path)


_ensure_import_path()

# Python_emitter assigns the union to Anki.Vector.VizInterface.MessageViz then
# `del MessageViz`, so the class is not a module-level name.
try:
    from clad.vizInterface import messageViz as _message_viz_mod
    MessageViz = _message_viz_mod.Anki.Vector.VizInterface.MessageViz
except ImportError:  # generated tree missing; tests skip
    _message_viz_mod = None
    MessageViz = None


def generated_available():
    """True if generated MessageViz imported successfully."""
    return MessageViz is not None


def unpack(data):
    """Unpack packed MessageViz bytes.

    Returns (message, tag). Handshake bytes (ANKICONN) are not MessageViz —
    callers must not pass them here.
    """
    if MessageViz is None:
        raise ImportError(
            "generated MessageViz not found; run python tools/vizmanager/scripts/generate_clad.py "
            "(Windows: tools/vizmanager/scripts/setup_windows.ps1)"
        )
    msg = MessageViz.unpack(data)
    return msg, int(msg.tag)
