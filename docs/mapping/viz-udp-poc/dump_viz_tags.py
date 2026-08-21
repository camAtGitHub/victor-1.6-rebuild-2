#!/usr/bin/env python3
"""Dump MessageViz CLAD tags from this tree."""

from __future__ import annotations

import os
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
sys.path.insert(0, os.path.join(REPO, "victor-clad/tools/message-buffers"))

from clad import clad as clad_mod  # noqa: E402
from clad import ast  # noqa: E402

INCLUDES = [
    os.path.join(REPO, "clad/src"),
    os.path.join(REPO, "clad/vizSrc"),
    os.path.join(REPO, "lib/util/source/anki/clad"),
    os.path.join(REPO, "robot/clad/src"),
    os.path.join(REPO, "coretech/vision/clad_src"),
    os.path.join(REPO, "coretech/common/clad_src"),
]


def parse_file():
    rel = "clad/vizInterface/messageViz.clad"
    path = os.path.join(REPO, "clad/vizSrc", rel)
    with open(path) as fh:
        text = fh.read()
    parser = clad_mod.CLADParser(
        input_directories=[os.path.join(REPO, "clad/vizSrc")] + INCLUDES
    )
    return parser.parse(text, filename=rel, directory=os.path.join(REPO, "clad/vizSrc"))


def find_union(tree, name):
    found = []

    class V(ast.NodeVisitor):
        def visit_UnionDecl(self, node, *a, **k):
            if node.name == name:
                found.append(node)
            self.generic_visit(node, *a, **k)

        def visit_IncludeDecl(self, node, *a, **k):
            self.generic_visit(node, *a, **k)

    V().visit(tree)
    return found[0] if found else None


def main() -> int:
    union = find_union(parse_file(), "MessageViz")
    if not union:
        print("no MessageViz", file=sys.stderr)
        return 1
    want = {int(x) for x in sys.argv[1:]} if len(sys.argv) > 1 else None
    for member in union.members():
        if want is None or member.tag in want:
            print(f"{member.tag:3d}  0x{member.tag:02x}  {member.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
