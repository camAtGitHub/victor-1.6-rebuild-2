#!/usr/bin/env python3
"""Dump MessageGameToEngine / MessageEngineToGame CLAD tags from this tree."""

from __future__ import annotations

import argparse
import os
import sys
from types import SimpleNamespace

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
CLAD_LIB = os.path.join(REPO, "victor-clad/tools/message-buffers")
sys.path.insert(0, CLAD_LIB)

from clad import clad as clad_mod  # noqa: E402
from clad import ast  # noqa: E402


INCLUDES = [
    os.path.join(REPO, "clad/src"),
    os.path.join(REPO, "lib/util/source/anki/clad"),
    os.path.join(REPO, "robot/clad/src"),
    os.path.join(REPO, "coretech/vision/clad_src"),
    os.path.join(REPO, "coretech/common/clad_src"),
]

WANTED = (
    "RedirectViz",
    "AdvertisementRegistrationMsg",
    "AdvertisementMsg",
    "Ping",
    "ConnectToUiDevice",
    "UiDeviceConnected",
    "UiDeviceAvailable",
)


def parse_file(rel_from_src: str):
    path = os.path.join(REPO, "clad/src", rel_from_src)
    with open(path, "r") as fh:
        text = fh.read()
    parser = clad_mod.CLADParser(input_directories=INCLUDES)
    return parser.parse(text, filename=rel_from_src, directory=os.path.join(REPO, "clad/src"))


def find_unions(tree, name: str):
    found = []

    class V(ast.NodeVisitor):
        def visit_UnionDecl(self, node, *a, **k):
            if node.name == name:
                found.append(node)
            self.generic_visit(node, *a, **k)

        def visit_IncludeDecl(self, node, *a, **k):
            self.generic_visit(node, *a, **k)

    V().visit(tree)
    return found


def dump(union):
    print(f"# {union.name}  ({len(list(union.members()))} members)")
    for member in union.members():
        if member.name in WANTED:
            print(f"  {member.tag:3d}  0x{member.tag:02x}  {member.name}")


def main() -> int:
    g2e = parse_file("clad/externalInterface/messageGameToEngine.clad")
    e2g = parse_file("clad/externalInterface/messageEngineToGame.clad")
    for tree, uname in ((g2e, "MessageGameToEngine"), (e2g, "MessageEngineToGame")):
        unions = find_unions(tree, uname)
        if not unions:
            print(f"ERROR: no {uname}", file=sys.stderr)
            return 1
        dump(unions[0])
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
