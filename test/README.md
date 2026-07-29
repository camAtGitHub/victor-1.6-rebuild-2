# test/

**Path:** `test/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:** none dedicated; CI steps in `project/buildServer/steps/unittests*.sh`

## What this is

Host/unit-test tree for three on-robot components: **engine** (`test_engine`), **anim process** (`test_animprocess`), and **switchboard** (`test-vic-switchboard`). Top `test/CMakeLists.txt` always adds `animProcess` + `engine`; adds `switchboard` only when `VICOS`; enables CTest only when `MACOSX`.

## Why it exists

Regression coverage for AI/behavior stack, vision/mood/maps, procedural face/audio, and switchboard BLE/pairing protocol versions — without flashing a robot. Engine/anim tests link production libs under `SIMULATOR` / Webots-related setup on macOS.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `CMakeLists.txt` | file | `project(test)`; subdirs + `enable_testing()` on MACOSX |
| `engine/` | dir | Large gtest suite → executable `test_engine` |
| `engine/run_CozmoTests.cpp` | file | Main + heavy engine includes for gtest runner |
| `engine/behaviorComponent/` | dir | Behavior factory, BSM, BEI conditions, intents, HLAI, weather, timers, … |
| `engine/cubes/` | dir | Cube message + LED animation tests |
| `engine/helpers/` | dir | Test helpers (cube placement, stub robot messaging, audio config) |
| `animProcess/` | dir | gtest suite → `test_animprocess` (procedural face, audio FFT) |
| `switchboard/` | dir | Custom test harness (not gtest main) for BLE protocol V2–V5 + key exchange |

### What is tested (by area)

**Engine (`test/engine/`)** — links `cozmo_engine`, CTI vision/planning/messaging, `engine_clad`, `audio_engine`, `gtest`, etc. Representative suites:

- Behavior system: factory, directory structure, BSM, delegation, interface, HighLevelAI, user-defined tree, intents map/parse/transitions, weather, puzzle maze, timers, BEI conditions
- Actions / animation groups / action list
- BlockWorld, NavMap, mood, face recognition, smart face ID
- Vision system, surface classifier, vision schedule mediator, gaze prediction
- Cubes (messages, LED anim), path component, min-angle planner, robot pose history / position sampler
- Mic direction history, beat detector, touch sensor, variable snapshot, object interaction cache, convex sets

**Anim (`test/animProcess/`)** — links `victor_anim` + gtest:

- `proceduralFaceTests.cpp`, `testAudioFFT.cpp`, smoke `SimpleCozmoTest` in runner

**Switchboard (`test/switchboard/`)** — links `switchboard`, `anki-ble`, clad messaging:

- Network stream protocol tests V2–V5, clad handlers, exec command / crypto / session helpers in `run_SwitchboardTests.cpp`

## Key entry points

- Build inclusion: root `CMakeLists.txt` — `add_subdirectory("test")` under `MACOSX`; always `add_subdirectory("test/switchboard")` under `VICOS` (switchboard also via top `test/` when VICOS).
- CI: `project/buildServer/steps/unittestsEngine.sh` runs ctest in `_build/${PLATFORM}/${CONFIGURATION}/test/engine` (copies anim assets via `tools/animationScripts/copy_anims_for_test.py`). Sibling scripts for anim / cloud / coretech / util.
- Engine binary defines: `SIMULATOR`, `CORETECH_ENGINE`, `ANKICONFIGROOT` / `ANKIWORKROOT` to build dir; resources symlinked via `symlink_target`.

## Talks to

- Depends on: `engine/`, `animProcess/`, `platform/switchboard`, `coretech/`, `cubeBleClient/`, `osState/`, gtest, Webots libs on MACOSX [CONFIRMED via CMake `target_link_libraries`].
- Depended on by: `project/buildServer/steps/unittests*.sh` [CONFIRMED]; local macOS `ctest` [CONFIRMED via `enable_testing`].

## Build

Per-subdir `CMakeLists.txt` + `BUILD.in` (metabuild source lists). Targets: `test_engine`, `test_animprocess`, `test-vic-switchboard`. Primary host platform for engine/anim tests is **MACOSX** (Webots dylibs symlinked next to `cozmo_engine`).

## Notable observations

- Switchboard tests use a hand-rolled `TEST()` macro / `ASSERT` (`test.h`), not Google Test’s main — unlike engine/anim.
- Engine behavior tests are the densest map of freeplay/AI surface area short of production JSON under `resources/`.
- Cloud unit tests live under `project/buildServer/steps/unittestsCloud*.sh`, not under this `test/` tree.

## Open questions

- [UNKNOWN] How many tests still pass on this rebuild without Anki’s full mac + Webots setup.
- [UNKNOWN] Whether switchboard tests are run in current CI or only built for VICOS.
