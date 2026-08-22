#!/usr/bin/env python3
"""Generate Python CLAD into generated/cladPython/ for VizManager.

Same input trees and -I dirs as the old generate_clad.sh. Output path is the
one vizmanager.codec puts on sys.path:

  <repo>/generated/cladPython/clad/vizInterface/messageViz.py

<repo> is the tree that contains tools/vizmanager/vizmanager/codec.py.

Works on Windows (PowerShell / py) and Unix. Does not require bash, find, or make.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys

# tools/vizmanager/scripts/generate_clad.py → repo root (same as codec._repo_root)
_SCRIPTS_DIR = os.path.abspath(os.path.dirname(__file__))

EMITTER_REL = "victor-clad/tools/message-buffers/emitters/Python_emitter.py"
MESSAGE_VIZ_REL = "generated/cladPython/clad/vizInterface/messageViz.py"

# Order matches clad/Makefile `python` target names / generate_clad.sh.
TREE_RELS = (
    "coretech/common/clad_src",
    "coretech/vision/clad_src",
    "lib/util/source/anki/clad",
    "robot/clad/src",
    "clad/src",
    "clad/vizSrc",
)

# Same includes as clad/CMakeLists.txt plus util (dump_viz_tags.py).
INCLUDE_RELS = (
    "robot/clad/src",
    "clad/src",
    "coretech/vision/clad_src",
    "coretech/common/clad_src",
    "lib/util/source/anki/clad",
)


def repo_root():
    return os.path.abspath(os.path.join(_SCRIPTS_DIR, "..", "..", ".."))


def output_dir():
    return os.path.join(repo_root(), "generated", "cladPython")


def message_viz_py():
    return os.path.join(repo_root(), *MESSAGE_VIZ_REL.split("/"))


def include_dirs():
    root = repo_root()
    return [os.path.join(root, *rel.split("/")) for rel in INCLUDE_RELS]


def _python():
    return sys.executable


def _rel_posix(path, start):
    rel = os.path.relpath(path, start)
    return rel.replace("\\", "/")


def emit_tree(input_dir, emitter, out, includes):
    if not os.path.isdir(input_dir):
        print("skip missing tree: {0}".format(input_dir))
        return 0
    files = []
    for dirpath, _dirnames, filenames in os.walk(input_dir):
        for name in filenames:
            if name.endswith(".clad"):
                files.append(os.path.join(dirpath, name))
    n = 0
    for full in sorted(files):
        rel = _rel_posix(full, input_dir)
        print("  {0}".format(rel))
        cmd = (
            [_python(), emitter, "-C", input_dir, "-I"]
            + includes
            + ["-o", out, rel]
        )
        subprocess.check_call(cmd)
        n += 1
    return n


def generate():
    root = repo_root()
    emitter = os.path.join(root, *EMITTER_REL.split("/"))
    out = output_dir()
    if not os.path.isfile(emitter):
        print("error: Python_emitter.py not found at {0}".format(emitter), file=sys.stderr)
        return 1
    os.makedirs(out, exist_ok=True)
    includes = include_dirs()
    print("emitter {0}".format(emitter))
    print("output  {0}".format(out))
    for rel in TREE_RELS:
        tree = os.path.join(root, *rel.split("/"))
        print(rel)
        emit_tree(tree, emitter, out, includes)
    expected = message_viz_py()
    if not os.path.isfile(expected):
        print("error: expected {0}".format(expected), file=sys.stderr)
        return 1
    print("generated MessageViz at {0}".format(expected))
    return 0


def check():
    path = message_viz_py()
    if os.path.isfile(path):
        print("ok {0}".format(path))
        return 0
    print("missing {0}".format(path), file=sys.stderr)
    print("run: python tools/vizmanager/scripts/generate_clad.py", file=sys.stderr)
    return 1


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Generate Python CLAD for VizManager into generated/cladPython/"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="only verify generated/cladPython/clad/vizInterface/messageViz.py exists",
    )
    args = parser.parse_args(argv)
    if args.check:
        return check()
    return generate()


if __name__ == "__main__":
    sys.exit(main())
