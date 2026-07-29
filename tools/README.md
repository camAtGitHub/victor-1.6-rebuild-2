# tools

**Path:** `tools/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:**
- `docs/development/build-instructions.md`, `docs/build-system-walkthrough.md` — build flow (scripts live partly under `project/` and here under `build/`)
- `docs/development/perf-metric-tool.md` — perfmetric
- `docs/development/crash-reports.md` — crash dump / stackwalk tooling
- `docs/development/clad.md` — CLAD (generators primarily under `victor-clad/`; this tree has a thin `message-buffers/` stub)

## What this is

Developer and CI tooling: build helpers, Vector Python SDK (private tree), protobuf gateway
definitions and protoc plugin, behavior code generators, animation/audio asset scripts,
crash symbol tools, localization (Smartling), and a large **vendored GYP** tree.

Rough tracked size: **~2,550 files**. A large fraction is **`gyp/test/`** (vendored).
**Deliberately not expanded** into vendored GYP tests, SDK package internals, or protobuf
`google/` API dumps.

## Why it exists

Host-side workflow for building, generating code, packaging assets, talking to robots
(SDK / gateway tests), processing crashes, and localization. Not shipped as robot runtime
processes (except where build products feed on-robot images).

## Contents

### Major first-level areas

| Entry | ~Files | What it is |
|---|---:|---|
| `build/` | ~220 | **Build kitchen sink:** CMake helper modules (`anki_build_*.cmake`), Ruby lib, `ankibuild/` Python (cmake/go/vicos/deptool…), dep build scripts (opencv, protobuf, flatbuffers, libsodium, opus…), Breakpad/Android-SDK packaging scripts. Upstream README present. |
| `sdk/` | ~200 | **Vector Python SDK** (`vector-python-sdk-private/`), gateway pytest suite, cert/setup scripts, `vector-sdk-tests/`. See `sdk/README.md`. |
| `protobuf/` | ~380 | **Gateway public protos** (`gateway/public/*.proto` + large vendored `google/` API tree), Anki `protoc` C++ plugin (`plugin/`), private `vision/vision.proto`, `push_subtree.sh`. |
| `gyp/` | ~1,500+ | **Vendored Google GYP** generator (legacy build system). Bulk is `test/`. **Deliberately not expanded.** |
| `ai/` | ~25 | Behavior authoring helpers: `createNewBehavior.py`, `generateBehaviorCode.py`, list/plot behaviors, templates under `behavior/`. |
| `smartling/` | ~20 | Localization push/pull (Smartling), JSON key checks, SDF generation from translations. |
| `crash-tools/` | ~20 | Minidump stackwalk / `dump_syms` helpers for linux + osx; copy dumps from robot. |
| `animationScripts/` | ~4 | Sprite sequence generate/renumber, anim trigger map check, test anim copy. |
| `audio/` | ~40+ | Audio asset update scripts (`UpdateAudioAssets.py`, `UseLocalAudioAssets.py`), event metadata CSV; includes a Mac “Search Event in Project” app bundle. |
| `sdk_devonly/` | ~5 | Dev-only motor/head/tread Python tests against a robot. |

### Other first-level dirs (one line each)

| Entry | What it is |
|---|---|
| `android/` | Small Android APK/AAR helper shell scripts |
| `arduino_led/` | Arduino sketches for LED duty-cycle / pattern hardware experiments |
| `automated-testing/` | Node-based auto test + WiFi/pairing pin helpers |
| `battery_logging/` | MATLAB battery log viewer |
| `birther/` | Python birther / block tooling |
| `brokenLinkCheck/` | Markdown link checker |
| `camera-test/` | C# WinForms serial image viewer (camera test) |
| `captureImages/` | C++ image capture helper |
| `config/` | `addSong.py` config helper |
| `controller_tuning/` | Wheel power/speed worksheet (xlsx) |
| `debug/` | LLDB auto-debug scripts for engine/anim, log tail helpers |
| `emacs/` | Ninja throttle helper for Emacs |
| `imuDataTools/` | IMU log parse (Python) + plot (MATLAB) |
| `json/` | Resource JSON stats / validation scripts |
| `message-buffers/` | Minimal leftover (`clad/yacctab.py`) — real CLAD toolchain is `victor-clad/` |
| `modulate_led/` | STM32 / CMSIS LED project (vendored ST libs) — **deliberately not expanded** |
| `perfmetric/` | `autoPerfMetric.sh` wrapper for perf metric collection |
| `purgeDuplicateFaceFrames/` | Face-frame purge utility |
| `puzzles/` | Maze generator / puzzle timing scripts |
| `raspberry_pi_3/` | Ansible playbooks for Vector SDK setup on Pi |
| `recognizeFaces/` | Offline/online face recognition C++ tools (+ deprecated/) |
| `rsync/` | `rsyncd` conf/service for asset or log sync |
| `showVoxels/` | Voxel visualization C++/mex helpers |
| `turnInPlaceTests/` | Turn-in-place result analysis |
| `versionGenerator/` | Version string generation script + data |

### Root-level scripts (files, not dirs)

| Entry | What it is |
|---|---|
| `updateDEPS.py` | Update dependency manifest helpers |
| `playanimation.py` | Play animation helper |
| `ear_puller.py` | [UNKNOWN exact role from name only — not opened beyond listing] |
| `img565.py` | Image → RGB565 conversion |
| `setgammalut.py` | Gamma LUT utility |
| `iosLogcat.py` | iOS-oriented logcat helper |
| `installLibimobiledevice.command` | macOS install helper for libimobiledevice |
| `victor_chrome_tracing.py` | Chrome tracing conversion/viewer helper |

## Key entry points

| Path | Why |
|---|---|
| `tools/build/cmake/` | Shared CMake macros used across the monorepo |
| `tools/build/tools/ankibuild/` | Python build orchestration (cmake, go, vicos, protobuf, deptool) |
| `tools/build/deps/victor/` | Scripts that build third-party deps (opencv, protobuf, …) |
| `tools/sdk/README.md` | How the private Python SDK + gateway tests are laid out |
| `tools/sdk/vector-python-sdk-private/` | SDK package root |
| `tools/protobuf/gateway/public/` | App/gateway proto surface (`external_interface.proto`, etc.) |
| `tools/protobuf/plugin/` | Anki protoc plugin (CLAD-like tags/constructors) |
| `tools/ai/createNewBehavior.py` | Scaffold new engine behaviors from templates |
| `tools/crash-tools/linux/` | Robot minidump → stackwalk workflow |

## Talks to

- Depends on: robot reachable for SDK/gateway tests; DEPS/Artifactory for some prebuilts [INFERRED]
- Depends on: `resources/` JSON when validating assets; `engine/` behavior paths for AI generators [CONFIRMED for `ai/` templates pointing at engine behavior paths]
- Depended on by: root/`project/` build scripts that invoke ankibuild / cmake modules [INFERRED]
- Related: CLAD emitters live under `victor-clad/`, not primarily here [CONFIRMED]

## Build

- `tools/` is not a single CMake project. Subtrees are invoked by `project/victor` scripts, CMake `include()` of `tools/build/cmake/*`, or standalone scripts.
- Protobuf plugin has its own `make.sh` / `make-arm-mac.sh` and notes Artifactory binary distribution.
- SDK is Python packaging + pytest; not part of `vic-*` robot binaries.

## Notable observations

- **`gyp/` dominates file count** and is legacy/vendored; do not treat as Vector product logic.
- **`protobuf/gateway/public/google/`** is a large vendored Google API protos dump — **deliberately not expanded**.
- `message-buffers/` here is a stub; do not confuse with `victor-clad/tools/message-buffers/`.
- SDK path name `vector-python-sdk-private` indicates non-public tree in this fork.

## Open questions

- [UNKNOWN] Which of these tools are still used in the rebuild’s day-to-day `vbuild` path vs Cozmo/OverDrive leftovers (Android SDK zip, Unity patches under `build/`).
- [UNKNOWN] Whether `ear_puller.py` is still active (not read beyond listing).
