"""Paths a frozen VizManager onedir must ship (no repo tree on the target PC).

Used by VizManager.spec and tests. Destinations are relative to PyInstaller
_MEIPASS and must match vizmanager.codec._ensure_import_path.
"""

from __future__ import annotations

import os

_SCRIPTS_DIR = os.path.abspath(os.path.dirname(__file__))


def repo_root():
    return os.path.abspath(os.path.join(_SCRIPTS_DIR, "..", "..", ".."))


def freeze_datas(root=None):
    """List of (src_dir, dest_under_meipass) for PyInstaller datas=."""
    root = repo_root() if root is None else root
    return [
        (
            os.path.join(root, "generated", "cladPython"),
            "generated/cladPython",
        ),
        (
            os.path.join(
                root,
                "victor-clad",
                "tools",
                "message-buffers",
                "support",
                "python",
            ),
            "victor-clad/tools/message-buffers/support/python",
        ),
    ]


def message_viz_py(root=None):
    root = repo_root() if root is None else root
    return os.path.join(
        root, "generated", "cladPython", "clad", "vizInterface", "messageViz.py"
    )
