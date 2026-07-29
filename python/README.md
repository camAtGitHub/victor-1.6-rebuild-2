# python

**Path:** `python/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** medium
**Upstream docs:** none dedicated; build hook referenced from `cmake/anki_build_copy_assets.cmake`

## What this is

A mixed bag of **host-side Python helpers** (~30 files): one script actively used by the CMake asset-copy pipeline, plus older Cozmo-era utilities for camera capture, stereo, packet dumps, FPGA programming, geometry/RANSAC experiments, a small `anki/` package, and incomplete cython/C++ extension stubs. **Not** a robot process and **not** the main SDK tooling (that lives under `tools/`).

## Why it exists

Historically supported vision/research workflows and basestation debugging; today the clearest in-tree consumer is **`anki_build_copy_assets.py`**, which CMake invokes to copy asset lists into the build tree. Other scripts look like lab/one-off tools retained with the source drop.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `anki_build_copy_assets.py` | file | **Build helper:** reads `*.srcs.lst` / `*.dsts.lst` (+ platform variants) and copies assets — called from `cmake/anki_build_copy_assets.cmake` via `python3` |
| `anki/` | dir | Small library: `camera.py`, `geometry.py`, `planepattern.py`, `ransac.py` (homography / quads) |
| `captureImages.py`, `captureStereoImages.py`, `fastCapture.py`, `cameraControl.py` | files | OpenCV camera capture utilities |
| `getStereoParameters.py`, `saveStereo.py`, `simpleLkTest*.py`, `testTracking.py` | files | Stereo / Lucas–Kanade / tracking experiments |
| `packetInspector.py` | file | Parse robot↔basestation packet dumps (COZ/RE headers, serial `0xbeef`) |
| `serial_capture.py`, `throughputTester.py`, `udp_echo.py`, `udpsink.py` | files | Serial/UDP lab networking helpers |
| `latticeFT2232Prog.py` | file | Write Lattice FPGA bitfiles over FT2232 SPI (`mpsse`) |
| `ovd2h.py` | file | Omnivision OVD register dump → C header converter |
| `addSourceToGccAssembly.py` | file | Annotate gcc assembly listings with source lines |
| `app-bundle-usage.py`, `argparse_help.py`, `data_marking.py` | files | Misc host utilities |
| `behaviors/lookAroundSafeRegion.py` | file | Matplotlib geometry sketch (cliff/safe region), not engine behavior JSON |
| `testbench/` | dir | `robosim.py`, `serRadio.py`, sample `test_data.txt` |
| `cython/make.sh` | file | Stub: `python setup.py install` (no setup.py listed beside it here) |
| `cozmo_basestation_py.cpp` | file | C++ basestation extension remnant (not a pure-Python package entry) |
| `saveFeaturesToFile.m` | file | Stray MATLAB file inside `python/` |

## Key entry points

| Path | Why |
|---|---|
| `anki_build_copy_assets.py` | Only script clearly wired into the modern build |
| `cmake/anki_build_copy_assets.cmake` | Invokes the above with target/srclist/output args |
| `anki/` package | Shared math/camera helpers if older scripts are run |
| `packetInspector.py` | Useful for offline protocol dumps |

## Talks to

- Depends on: host Python 3 for asset copy; many older scripts are Python 2 style (`print` statements) — [CONFIRMED] mixed shebangs/syntax
- Depends on: OpenCV / numpy / serial / mpsse where those scripts are used — [CONFIRMED] imports
- Depended on by: CMake asset pipeline — [CONFIRMED] `anki_build_copy_assets.cmake` → `python/anki_build_copy_assets.py`
- Relates to: `matlab/` research counterparts (stereo, LK, capture) — [INFERRED] parallel tool names
- Does **not** replace: `tools/` SDK / build / animation tooling — [INFERRED] separate top-level `tools/`

## Build

- No `add_subdirectory(python)` in CMake.
- Asset-copy path: CMake function `anki_build_copy_assets` runs this directory’s script as a custom command.
- Cython/C++ extension pieces appear incomplete or external to normal `vbuild`.

## Notable observations

- **Primary live purpose** in this rebuild is asset copying during CMake builds; treat the rest as legacy unless proven used.
- Cozmo-era naming (`cozmo_basestation_py.cpp`, packet prefixes `COZ\x03`) indicates age relative to Vector cloud/gateway paths.
- Mixing Python 2 and 3, plus a `.m` file, suggests unmaintained accumulation rather than a curated package.
- `behaviors/` here is **not** the engine behavior tree under `resources/config/.../victorBehaviorTree/`.

## Open questions

- [UNKNOWN] Which non-asset scripts are still run by anyone on this fork.
- [UNKNOWN] Whether `cozmo_basestation_py.cpp` / cython ever built in CI for 1.6-rebuild.
- [UNKNOWN] Overlap with scripts under `tools/` (prefer `tools/` for modern workflows unless proven otherwise).
