#!/usr/bin/env bash
# Generate Python CLAD (MessageViz + includes) into generated/cladPython/.
#
# Wraps the existing Python_emitter.py — do not add a new union emitter.
# clad/Makefile `python` uses coretech/*/clad/src which does not exist in this
# tree (CMake uses coretech/*/clad_src). It also emits only ROBOT_CLAD_SHARED
# robot files, omitting messageFromAnimProcess.clad which MessageViz includes.
# When Makefile CTI paths exist we still try `make python`; otherwise (and as
# the reliable path) we emit with the CMake include dirs.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../../.." && pwd)
cd "${REPO_ROOT}"

EMITTER="${REPO_ROOT}/victor-clad/tools/message-buffers/emitters/Python_emitter.py"
OUT="${REPO_ROOT}/generated/cladPython"

# Same includes as clad/CMakeLists.txt:13–19 PLUS util (dump_viz_tags.py).
INCLUDES=(
  "${REPO_ROOT}/robot/clad/src"
  "${REPO_ROOT}/clad/src"
  "${REPO_ROOT}/coretech/vision/clad_src"
  "${REPO_ROOT}/coretech/common/clad_src"
  "${REPO_ROOT}/lib/util/source/anki/clad"
)

if [[ ! -f "${EMITTER}" ]]; then
  echo "error: Python_emitter.py not found at ${EMITTER}" >&2
  exit 1
fi

if [[ -d "${REPO_ROOT}/coretech/vision/clad/src" && -d "${REPO_ROOT}/coretech/common/clad/src" ]]; then
  echo "clad/Makefile CTI paths present; trying make -C clad python"
  if make -C "${REPO_ROOT}/clad" python; then
    echo "make -C clad python succeeded"
  else
    echo "make -C clad python failed; falling back to Python_emitter.py" >&2
  fi
else
  echo "Makefile CTI paths missing (coretech/*/clad/src); using clad_src + Python_emitter.py"
fi

emit_tree() {
  local input_dir="$1"
  if [[ ! -d "${input_dir}" ]]; then
    echo "skip missing tree: ${input_dir}"
    return 0
  fi
  local file rel
  while IFS= read -r file; do
    rel="${file#${input_dir}/}"
    echo "  ${rel}"
    python3 "${EMITTER}" \
      -C "${input_dir}" \
      -I "${INCLUDES[@]}" \
      -o "${OUT}" \
      "${rel}"
  done < <(find "${input_dir}" -type f -name '*.clad' | sort)
}

mkdir -p "${OUT}"

# Order matches clad/Makefile `python` target names.
echo "ctiCommonPython"
emit_tree "${REPO_ROOT}/coretech/common/clad_src"
echo "ctiVisionPython"
emit_tree "${REPO_ROOT}/coretech/vision/clad_src"
echo "utilPython"
emit_tree "${REPO_ROOT}/lib/util/source/anki/clad"
echo "robotPython"
emit_tree "${REPO_ROOT}/robot/clad/src"
echo "enginePython"
emit_tree "${REPO_ROOT}/clad/src"
echo "vizPython"
emit_tree "${REPO_ROOT}/clad/vizSrc"

if [[ ! -f "${OUT}/clad/vizInterface/messageViz.py" ]]; then
  echo "error: expected ${OUT}/clad/vizInterface/messageViz.py" >&2
  exit 1
fi

echo "generated MessageViz at ${OUT}/clad/vizInterface/messageViz.py"
