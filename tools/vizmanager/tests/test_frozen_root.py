"""Frozen codec root is PyInstaller _MEIPASS so the exe does not need the repo."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from bundle_paths import freeze_datas, repo_root  # noqa: E402
from vizmanager import codec  # noqa: E402


def test_frozen_repo_root_is_meipass(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    assert codec._repo_root() == os.path.abspath(str(tmp_path))


def test_unfrozen_repo_root_is_checkout():
    if getattr(sys, "frozen", False):
        return
    root = codec._repo_root()
    assert os.path.isdir(os.path.join(root, "tools", "vizmanager"))


def test_freeze_datas_match_codec_search_paths():
    root = repo_root()
    datas = freeze_datas(root)
    dests = {dest.replace("\\", "/") for _src, dest in datas}
    assert "generated/cladPython" in dests
    assert "victor-clad/tools/message-buffers/support/python" in dests
    for src, dest in datas:
        assert os.path.isdir(src), src
        assert dest in (
            "generated/cladPython",
            "victor-clad/tools/message-buffers/support/python",
        )
