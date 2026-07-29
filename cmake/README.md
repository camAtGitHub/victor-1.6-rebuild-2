# cmake/

**Path:** `cmake/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:** `docs/development/build-instructions.md`, `docs/build-system-walkthrough.md`, `docs/ccache.md`, `docs/development/compiler-options.md`

## What this is

Root-level CMake modules and toolchains for the `victor` project. Root `CMakeLists.txt` prepends this directory to `CMAKE_MODULE_PATH` (alongside `victor-clad/cmake`, `lib/audio/cmake`, `lib/util/cmake`, `tools/build/cmake`) and `include()`s many of these files for third-party imported targets, platform flags, asset copy helpers, and license enforcement.

## Why it exists

Central place for cross-compile toolchains (VICOS arm, macOS host), imported binary deps (OpenCV, OKAO, Signal Essence, …), and shared CMake functions used by every process target. Without it, `build-victor.sh` cannot configure platform builds.

## Contents (one line each)

| File | What it is |
|---|---|
| `import.cmake` | `import(target subdir)` — `add_subdirectory` only if target missing |
| `ccache.cmake` | Wire `ccache` via launch-c/cxx scripts from `project/build-scripts/` |
| `license.cmake` | License CSV / `ENFORCE_LICENSES` / per-target license helpers |
| `ankitrace.cmake` | Optional LTTNG userspace tracing when `USE_ANKITRACE` + VICOS |
| `FindLTTngUST.cmake` | Find module for LTTng-UST (used by ankitrace) |
| `gen-version.cmake` | Emit build `etc/version` / revision from `VERSION` + env counter |
| `anki_build_copy_assets.cmake` | Asset deploy: src/dst lists → copy (cmake or python path) |
| `symlink_target.cmake` | Attach symlink step to a target (tests → resources, webots libs) |
| `enable_unity_build.cmake` | Unity/jumbo build helper (merge TUs into one cpp) |
| `archive.cmake` | Imported `libarchive` (VICOS) |
| `audio.cmake` | Wwise/audio plugin link sets; `AUDIO_RELEASE` licensed subset |
| `avs-device-sdk.cmake` | Amazon AVS Device SDK imported libs (Alexa) |
| `breakpad.cmake` | Breakpad client for VICOS crash reporting |
| `flatbuffers.cmake` | Imported flatbuffers static lib |
| `opencv.cmake` | OpenCV include/lib paths for VICOS vs mac |
| `okao.cmake` | Omron OKAO face SDK link list (`okaoVision/`) |
| `protobuf.cmake` | Imported protobuf lib paths |
| `sodium.cmake` | Imported libsodium |
| `aubio.cmake` | Imported aubio (beat/audio analysis) |
| `mpg123.cmake` | Imported mpg123 |
| `pffft.cmake` | Imported PFFFT (FFT) |
| `speexdsp.cmake` | Imported speexdsp |
| `sensory.cmake` | Sensory TrulyHandsfree wake-word SDK |
| `signalessence.cmake` | Signal Essence mic/beamforming libs (versioned paths) |
| `pryon_lite.cmake` | Amazon Pryon lite wake word (VICOS arm) |
| `picovoice.cmake` | Picovoice Porcupine (optional; EXTERNALS path) |
| `text2speech.cmake` | Acapela TTS paths/libs |
| `webots.cmake` | MACOSX-only Webots paths + firewall/test helpers |
| `robot_core.cmake` | Build `robot_core` static lib from `robot/core/` when VICOS |
| `util.cmake` | Small helpers (e.g. `prepend_each`) |
| `macosx.toolchain.cmake` | Host macOS compiler/linker fortify flags |
| `vicos.toolchain.cmake` | Thin VICOS clang toolchain via `VICOS_TOOLCHAIN_HOME` |
| `vicos.oelinux.toolchain.cmake` | Full OE-Linux VICOS SDK toolchain (primary robot cross build) |
| `vicos-sdk-stl-config.cmake` | Copy/rename shared STL into VICOS output |
| `vicos_strip.cmake` | Post-link strip helper for VICOS non-static targets |
| `android.toolchain.patched.cmake` | Patched Android NDK toolchain (legacy/Android era) |
| `android-ndk-stl-config.cmake` | Android shared STL packaging helper |
| `android_strip.cmake` | Android strip/objcopy helper |

## Key entry points

- Root `CMakeLists.txt` lines that `include(ccache)`, `include(import)`, `include(license)`, then platform blocks including `vicos-sdk-stl-config`, `gen-version`, and dep modules (`audio`, `opencv`, `okao`, …).
- `project/victor/build-victor.sh` sets `-DCMAKE_TOOLCHAIN_FILE=…/cmake/macosx.toolchain.cmake` or the VICOS toolchain file and `CMAKE_MODULE_DIR` to this directory.

## Talks to

- Depends on: `EXTERNALS` / `ANKI_EXTERNAL_DIR` dep trees [CONFIRMED]; `okaoVision/` [CONFIRMED]; `lib/crash-reporting-vicos` for Breakpad [CONFIRMED]; `project/build-scripts` for ccache launchers [CONFIRMED].
- Depended on by: entire CMake graph via root `CMakeLists.txt` [CONFIRMED]; `test/` and process dirs that `include(webots)`, `include(symlink_target)`, etc. [CONFIRMED].

## Build

Modules only — no standalone build. Additional CMake lives outside this folder (`tools/build/cmake`, `lib/*/cmake`, `victor-clad/cmake`); this is the primary repo-root module set.

## Notable observations

- Two VICOS toolchain files: simple `vicos.toolchain.cmake` vs fuller `vicos.oelinux.toolchain.cmake` — which one `build-victor.sh` selects depends on the platform branch (see that script’s `PLATFORM_ARGS`).
- Android modules remain from Cozmo/early Vector Android work; robot production path is VICOS + optional MACOSX sim.
- `picovoice.cmake` points at `EXTERNALS/deps/picovoice`; root CMake has `#include(picovoice)` commented [CONFIRMED in root `CMakeLists.txt`].

## Open questions

- [UNKNOWN] Whether `android*.cmake` is still reachable from any current target.
- [UNKNOWN] Exact default VICOS toolchain file path chosen after `build-victor.sh` PLATFORM_ARGS (read rest of script if needed for L2).
