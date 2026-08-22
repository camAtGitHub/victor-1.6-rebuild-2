# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller onedir spec. Run from tools/vizmanager via scripts/build_windows.ps1.

Ships generated/cladPython and msgbuffers under _MEIPASS so dist/VizManager/
runs on a PC that does not have this repo. Do not onefile (pygame/cv2 DLLs).
"""

from __future__ import annotations

import os
import sys

SPEC_DIR = os.path.dirname(os.path.abspath(SPEC))
sys.path.insert(0, os.path.join(SPEC_DIR, "scripts"))
from bundle_paths import freeze_datas, message_viz_py, repo_root  # noqa: E402

REPO = repo_root()
_MSGVIZ = message_viz_py(REPO)
if not os.path.isfile(_MSGVIZ):
    raise SystemExit(
        "missing {0}; run tools/vizmanager/scripts/setup_windows.ps1 "
        "or python tools/vizmanager/scripts/generate_clad.py first".format(_MSGVIZ)
    )

datas = list(freeze_datas(REPO))
binaries = []
hiddenimports = [
    "msgbuffers",
    "clad",
    "clad.vizInterface.messageViz",
    "clad.types.visionModes",
    "pygame",
    "cv2",
    "numpy",
    # `from vizmanager import overlay_panel` is not traced as a submodule.
    "vizmanager.overlay_panel",
    "vizmanager.sensors",
    "vizmanager.theme",
    "vizmanager.app",
    "vizmanager.session",
    "vizmanager.hud",
    "vizmanager.world",
    "vizmanager.view2d",
    "vizmanager.view3d",
    "vizmanager.overlay2d",
    "vizmanager.image",
    "vizmanager.codec",
    "vizmanager.connect",
    "vizmanager.udp",
    "vizmanager.vision_http",
]


def _collect(name):
    try:
        from PyInstaller.utils.hooks import collect_all

        return collect_all(name)
    except Exception:
        return [], [], []


for _pkg in ("pygame", "cv2", "numpy", "vispy"):
    _d, _b, _h = _collect(_pkg)
    datas += _d
    binaries += _b
    hiddenimports += _h

try:
    from PyInstaller.utils.hooks import collect_submodules

    hiddenimports += collect_submodules("vizmanager")
except Exception:
    pass

a = Analysis(
    [os.path.join(SPEC_DIR, "vizmanager", "__main__.py")],
    pathex=[
        SPEC_DIR,
        os.path.join(REPO, "generated", "cladPython"),
        os.path.join(
            REPO, "victor-clad", "tools", "message-buffers", "support", "python"
        ),
    ],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "PyQt5", "PyQt6", "PySide2", "PySide6"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="VizManager",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="VizManager",
)
