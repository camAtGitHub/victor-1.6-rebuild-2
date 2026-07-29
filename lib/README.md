# lib

**Path:** `lib/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:**
- `docs/development/das-events.md` — DAS event macros (client lives here as `das-client`)
- `docs/development/mic-systems-overview.md` — mic pipeline (Signal Essence, Sensory)
- `docs/development/crash-reports.md` — Breakpad (prebuilt under `crash-reporting-vicos/`)
- `docs/architecture/arch_overview.md` — Wwise audio middleware reference

## What this is

Shared libraries used by on-robot processes (`vic-engine`, `vic-anim`, switchboard, etc.)
and host tooling. Mix of **Anki-written** code (`util`, `anki-ble`, `micData`, `audio` engine
wrappers) and **vendored / commercial** third-party stacks (Wwise SDK fetch, Signal Essence
project sources, Breakpad prebuilts, gtest and other 3rd-party under `util/source/3rd/`).

Rough tracked size: **~2,800 files**. **Deliberately not expanded** below first-level children
(and not into `util/source/3rd/*` or Wwise plugin trees).

## Why it exists

Without this tree: no shared utilities (logging, transport, JSON, HTTP), no Wwise audio
engine wrapper, no DAS client, no mic channel constants, no Signal Essence build target,
no BLE common/IPC helpers for switchboard, no Breakpad client for VICOS crash reporting.

## Contents

| Entry | ~Files | Vendored? | What it is |
|---|---:|---|---|
| `anki-ble/` | ~21 | **Copied** from vicos-oelinux (see its README) | BLE common + IPC client/server helpers, GATT constants, task executor; used by switchboard BLE path |
| `audio/` | ~350+ | **Mixed** — Anki wrappers + commercial Wwise + plugin sources | Wwise-based audio engine (`audioEngineController`, soundbank loader, multiplexer); plugins (akAlsaSink, hijackAudio, krotosVocoder, wavePortal…); Wwise SDK fetch scripts under `wwise/` |
| `crash-reporting-vicos/` | ~140 | **Vendored prebuilt** Breakpad | Prebuilt Breakpad client (`include/breakpad/`, `libs/armeabi-v7a/libbreakpad_client.a`) + CMake that copies Breakpad host tools |
| `das-client/` | ~300+ | **Mixed** — Anki DAS client + vendored gtest under `testing/gtest/` | Data Analytics System client library (C++ core + Android/iOS/unix/vicos platform backends); unit tests |
| `micData/` | 2 | Anki (headers only) | Interface library: mic channel/chunk constants and `MicDataType` (`micDataTypes.h`) |
| `signalEssence/` | 1 (+ external) | **Commercial** sources resolved via CMake `include(signalessence)` (EXTERNALS/DEPS) | Thin CMake project that compiles Signal Essence projection/VAD sources into static `signal_essence`; options `SE_V009`, `SE_HIGHRES` |
| `util/` | ~2,000+ | **Mixed** — Anki `source/anki/` + large **vendored** `source/3rd/` | Core `anki_util` library: logging, transport, console, HTTP, file utils, feature gate, quest engine, etc.; third-party: civetweb, jsoncpp, kazmath, libev, libwebp, hdrhistogram, gif helpers, folly queue header, cpufeatures |

### Note on size / expansion policy

| Area | Policy |
|---|---|
| `util/source/3rd/` | **Deliberately not expanded** — full third-party trees (civetweb alone embeds further third_party). |
| `util/source/anki/` | Not expanded at L1; main consumer-facing Anki util APIs live under `source/anki/util/`. |
| `audio/plugins/`, `audio/wwise/` | **Deliberately not expanded** — plugin projects and commercial SDK packaging. |
| `das-client/testing/gtest/` | Vendored Google Test; not expanded. |
| `crash-reporting-vicos/Breakpad/` | Prebuilt headers/libs; not expanded. |

## Key entry points

| Path | Why |
|---|---|
| `lib/util/CMakeLists.txt` | Imports 3rd-party subdirs and builds Anki util targets |
| `lib/util/source/anki/util/` | Primary Anki utility headers/sources |
| `lib/audio/CMakeLists.txt` | Wwise include + `zipreader` + audio engine targets |
| `lib/audio/include/audioEngine/` | Public audio engine API surface |
| `lib/das-client/include/DAS/DAS.h` | DAS public C API |
| `lib/anki-ble/common/ipc-client.h` | BLE IPC client used by platform switchboard |
| `lib/micData/micDataTypes.h` | Mic geometry / chunk timing constants (4 ch, 16 kHz, 10 ms) |
| `lib/signalEssence/CMakeLists.txt` | How Signal Essence is linked (license: ANKI + Commercial) |
| `lib/crash-reporting-vicos/CMakeLists.txt` | Breakpad import for VICOS |

## Talks to

- Depends on: `EXTERNALS` / DEPS for Wwise SDK, Signal Essence libs, possibly audio assets [INFERRED for paths not present in this checkout]
- Depends on: `victor-clad` / CLAD when building util/audio with message buffers [CONFIRMED, CMake]
- Depended on by: `engine/`, `animProcess/`, `platform/switchboard/`, `dasmgr/`, `webServerProcess/` (civetweb), crash reporter consumers [CONFIRMED for typical link graph; not every edge re-verified this session]
- Depended on by: `platform/` BLE path → `anki-ble` [CONFIRMED via platform mapping]

## Build

- Each first-level directory has its own `CMakeLists.txt` (no single `lib/CMakeLists.txt` observed).
- `util/` and `audio/` also carry legacy GYP / `configure.py` paths.
- `signalEssence` and Wwise pull artifacts via CMake modules (`include(signalessence)`, `include(wwise)`), not full source in-tree for the commercial core.
- `crash-reporting-vicos` uses `include(breakpad)` and `copy_breakpad_exes()`.

## Notable observations

- `anki-ble/README.md`: code is **copied** from `vicos-oelinux` and must be manually resynced — not a live submodule.
- `util/source/3rd/` is the dominant file count in all of `lib/`; treating `lib/` as “Anki code” without excluding 3rd is misleading.
- `micData/` is intentionally tiny: types only; processing lives in anim/mic pipeline consumers.
- Signal Essence in-tree is almost only CMake; real `.c` paths come from the `signalessence` CMake module (EXTERNALS).

## Open questions

- [UNKNOWN] Exact DEPS/EXTERNALS paths for Signal Essence and Wwise on this rebuild checkout (EXTERNALS out of scope).
- [UNKNOWN] Whether any rebuild-specific patches live under `lib/audio` vs stock Anki 1.6 (see `CHANGES.md` for product-level notes only).
