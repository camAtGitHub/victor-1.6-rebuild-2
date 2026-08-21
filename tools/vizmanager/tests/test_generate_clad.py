"""generate_clad.py path contract: output must match vizmanager.codec import roots."""

from __future__ import annotations

import os
import sys

_PKG = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_SCRIPTS = os.path.join(_PKG, "scripts")
sys.path.insert(0, _PKG)
sys.path.insert(0, _SCRIPTS)

from generate_clad import (  # noqa: E402
    EMITTER_REL,
    INCLUDE_RELS,
    MESSAGE_VIZ_REL,
    TREE_RELS,
    include_dirs,
    message_viz_py,
    output_dir,
    repo_root,
)
from vizmanager import codec  # noqa: E402


def test_repo_root_matches_codec():
    assert repo_root() == codec._repo_root()


def test_output_dir_is_generated_clad_python():
    assert output_dir() == os.path.join(repo_root(), "generated", "cladPython")


def test_message_viz_path_is_codec_import_target():
    expected = os.path.join(
        repo_root(), "generated", "cladPython", "clad", "vizInterface", "messageViz.py"
    )
    assert message_viz_py() == expected
    assert os.path.normpath(MESSAGE_VIZ_REL) == os.path.normpath(
        os.path.join("generated", "cladPython", "clad", "vizInterface", "messageViz.py")
    )


def test_emitter_and_trees_exist_in_this_checkout():
    root = repo_root()
    assert os.path.isfile(os.path.join(root, *EMITTER_REL.split("/")))
    for rel in TREE_RELS:
        assert os.path.isdir(os.path.join(root, *rel.split("/"))), rel
    for rel in INCLUDE_RELS:
        assert os.path.isdir(os.path.join(root, *rel.split("/"))), rel
    dirs = include_dirs()
    assert len(dirs) == len(INCLUDE_RELS)
    assert all(os.path.isabs(p) for p in dirs)
