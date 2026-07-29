# project/

**Path:** `project/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:** `docs/development/build-instructions.md`, `docs/build-system-walkthrough.md`, `docs/ccache.md`

## What this is

Build orchestration, deploy/ops scripts, CI step shells, asset helpers, and Doxygen for Vector. The live path from a developer shell into CMake is:

`source setenv.sh` → alias `vbuild` = `victor_build_release` → `project/victor/scripts/victor_build_release.sh` → `project/victor/build-victor.sh -c Release` (+ `ANKI_*` defines) → CMake/Ninja under `_build/`.

## Why it exists

Without this tree there is no single entry point for configure/build/stage/deploy/log/restart, no VICOS SDK / Go / protoc downloaders wired into the build, and no Anki build-server step scripts that run unit tests and packaging.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `victor/` | dir | Primary build/deploy surface: `build-victor.sh`, `envsetup.sh`, `scripts/` |
| `victor/build-victor.sh` | file | Master build driver (platforms, generators, deps, CMake invoke) |
| `victor/envsetup.sh` | file | Optional AOSP-style helpers (`croot`, `cgrep`, …); TOP = tree with `build-victor.sh` |
| `victor/scripts/` | dir | Thin wrappers + robot lifecycle (build variants, stage, deploy, start/stop, logs) |
| `victor/simpleperf/` | dir | Android simpleperf HOW-docs + symbol cache helper (nested `README.md`) |
| `victor/tools/` | dir | Small host tools (e.g. `axattr`); own `CMakeLists.txt` |
| `build-scripts/` | dir | Dep downloaders, asset copy/generate, clean, version, Webots test runners |
| `build-scripts/webots/` | dir | `webotsTest.py`, SDK nightly/PR cfgs, firewall cert notes |
| `buildScripts/` | dir | Older Python helpers (DEPS update, anim validation, Jenkins status, GitHub) |
| `buildServer/steps/` | dir | CI step shells: clean, configure, unit tests, valgrind, zip deployables |
| `build-server/` | dir | Automation fixtures (locale smoke scripts) + Webots/Unity nightly reporter |
| `doxygen/` | dir | `Doxyfile` (PROJECT_NAME=Vector), DAS-msg scanners, Slack post helper |
| `__init__.py` | file | Makes `project` importable as a Python package for some scripts |

## Key entry points

- **`project/victor/build-victor.sh`** — real build. Defaults: `PLATFORM=vicos`, `CONFIGURATION=Release`, `GENERATOR=Ninja`. Output dir `_build/${PLATFORM}/${CONFIGURATION}`. Pins tool versions (CMake, VICOS SDK, Go, protoc, UPX). Runs `fetch-build-deps.sh`, metabuild on all `BUILD.in`, then CMake with toolchain from `cmake/`.
- **`project/victor/scripts/victor_build_release.sh`** — what `vbuild` calls: Release + Alexa on, privacy guard, remote console, profiling off, `AUDIO_RELEASE=ON`.
- **Other build flavors** — `victor_build_debug.sh`, `*_shipping.sh`, `*_userdev.sh`, `*_beta.sh`, `*_alexa_*.sh`, `victor_build_xcode.sh`, `victor_build_release_with_profiling.sh`; all thin `-c`/`-D` wrappers around `build-victor.sh`.
- **Stage / deploy / run** — `stage.sh` → staging tree; `victor_deploy.sh` / `deploy.sh` rsync to robot (`robot_ip.txt`, SSH as root); `victor_start.sh` / `victor_stop.sh` / `victor_restart.sh`. Root `setenv.sh` aliases: `vdeploy`, `vbd`, etc.
- **`project/victor/scripts/victor_env.sh`** — shared robot SSH helpers (`robot_set_host`, `robot_sh`, `robot_cp`) used by deploy/start scripts.
- **`project/build-scripts/download-*.sh`** — VICOS SDK, Go, protoc, UPX into `~/.anki/…` when missing.
- **CI** — `project/buildServer/steps/unittests{Engine,AnimProcess,Cloud,Coretech,Util}.sh`, `valgrind*.sh`, `zipDeployables.sh`. Engine tests run ctest under `_build/${PLATFORM}/${CONFIGURATION}/test/engine`.

## Talks to

- Depends on: root `CMakeLists.txt` / `cmake/` [CONFIRMED]; `tools/build/tools` (metabuild, cmake.py) [CONFIRMED]; `EXTERNALS` / `~/.anki` deps [CONFIRMED via downloaders]; robot over SSH using root `robot_ip.txt` + `robot_sshkey` (credential — do not open) [CONFIRMED].
- Depended on by: root `setenv.sh` aliases [CONFIRMED]; `build/build-v.sh` / `deploy-v.sh` (Docker wrappers call these scripts) [CONFIRMED]; CI that sources `buildServer/steps/*` [INFERRED].

## Build

Not a CMake project itself (except `victor/tools/`). It *drives* the root CMake project. Rebuild-relevant pins in `build-victor.sh` (observed): CMake `4.4.0`, VICOS SDK `5.3.0-r07`, Go `1.26.5`, protoc `35.1`, UPX `5.2.0`.

## Notable observations

- Dual legacy trees: `build-scripts/` vs `buildScripts/` vs `buildServer/` vs `build-server/` — naming is historical Anki; live day-to-day path is `victor/` + `setenv.sh`.
- `buildServer/steps/configure.sh` still references `project/gyp/configure.py` (GYP era) [CONFIRMED path string] — likely dead relative to current CMake flow.
- `ota_test.key` under `victor/` looks like a test key material file — treat carefully.
- Nested `victor/simpleperf/README.md` is upstream HOW-to for perf, not a mapping doc.

## Open questions

- [UNKNOWN] Whether any Jenkins/GitHub Actions still invoke `buildServer/steps/` in this rebuild fork.
- [UNKNOWN] Full difference matrix among shipping / userdev / beta / alexa build flag sets beyond the release wrapper.
- [UNKNOWN] Whether `build-server/` automation scripts are still runnable outside Anki’s old lab network.
