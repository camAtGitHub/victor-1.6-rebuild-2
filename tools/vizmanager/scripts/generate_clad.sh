#!/usr/bin/env bash
# Thin wrapper around generate_clad.py (Windows: use setup_windows.ps1 or
# `python tools/vizmanager/scripts/generate_clad.py`).
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "error: need python3 or python on PATH" >&2
  exit 1
fi
exec "${PY}" "${SCRIPT_DIR}/generate_clad.py" "$@"
