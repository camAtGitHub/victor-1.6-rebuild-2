# clad

**Path:** `clad`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:** `docs/development/clad.md` (thin pointer), `docs/architecture/arch_overview.md` (IPC table), language spec at `victor-clad/tools/message-buffers/README.md`

## What this is

Engine-facing **CLAD message definitions** and the CMake orchestration that generates C++/Go/Python/C# bindings from them. `.clad` files under `src/` and `vizSrc/` declare the binary IPC schemas used by the engine, external UI/SDK (“game”), cloud, gateway, and viz — not the CLAD language tools themselves (those live in `victor-clad/`).

## Why it exists

Without this folder, the engine cannot compile the shared message types and unions that connect Engine ↔ App/SDK, Engine ↔ Viz, and (via Go emitters) cloud/gateway services. Message layout is defined once in `.clad` and emitted per language so pack/unpack stays consistent across processes.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `src/clad/externalInterface/` | dir | E2G / G2E / shared UI messages; cube↔engine; action messages |
| `src/clad/types/` | dir | Shared enums/structs (actions, emotions, vision modes, objects, onboarding, …) |
| `src/clad/types/behaviorComponent/` | dir | Behavior IDs/classes, BEI types, user intents, active features, etc. |
| `src/clad/cloud/` | dir | Cloud-oriented messages (token, mic, logcollector, docs, common) |
| `src/clad/gateway/` | dir | Gateway/external robot APIs + switchboard-related CLAD |
| `vizSrc/clad/` | dir | Viz/physics viz messages (`messageViz`, `messageSimPhysics`, `vizTypes`) |
| `robot` | dir | Same tree as `robot/clad/` (engine↔robot/anim interfaces, audio, robot types) — treated as the robot CLAD tree for includes/generation [CONFIRMED same layout as `robot/clad/`; symlink vs copy [UNKNOWN]] |
| `CMakeLists.txt` | file | Primary build: `generate_clad_*` → static libs `engine_clad`, `robot_clad`, `cloud_clad_cpp` + Go targets |
| `BUILD.in` | file | Legacy-style project lists for `engine_clad`, `viz_clad`, `robot_clad`, `cloud_clad`, `gateway_clad` |
| `Makefile` | file | Standalone make path for C++/C#/Python emitters (older parallel to CMake) |
| `robotViz.Makefile` | file | CPPLite path for robot/viz generation (`--max-message-size 1400`) |
| `cozmo_CPP_switch_emitter.py` | file | Local switch-statement emitter for union message dispatch (`.def` output) |

Rough size: ~75+ `.clad` under `src/` + `vizSrc/` (excluding `robot/`); ~80 tracked files in this tree proper. ToC “81” is in the right ballpark.

## Key entry points

| Path | Why |
|---|---|
| `src/clad/externalInterface/messageGameToEngine.clad` | G2E — UI/SDK/app → engine (drive, connect, console, …) |
| `src/clad/externalInterface/messageEngineToGame.clad` | E2G — engine → UI/SDK/app |
| `src/clad/gateway/messageRobotToExternal.clad` / `messageExternalToRobot.clad` | Gateway external API surface |
| `src/clad/gateway/switchboard.clad` | Switchboard request/response unions (BLE/SDK proxy) |
| `vizSrc/clad/vizInterface/messageViz.clad` | Engine → Viz debug visualization stream |
| `src/clad/types/behaviorComponent/behaviorIDs.clad` | BehaviorID enum (note: regenerated via `./tools/ai/generateBehaviorCode.py`) |
| `robot/src/clad/robotInterface/messageEngineToRobot.clad` | E2R (and related) — see `robot/clad/`; documented in arch_overview IPC table |
| `CMakeLists.txt` | How definitions become libraries and multi-language output |

## Talks to

- Depends on: `victor-clad/tools/message-buffers/` — parser + emitters (`CPP_emitter.py`, `Go_emitter.py`, `Python_emitter.py`, `CSharp_emitter.py`, `ASTHash_emitter.py`) [CONFIRMED via `CLAD_BASE_DIR` / `include(generate_clad)`]
- Depends on: `victor-clad/cmake/generate_clad.cmake` — CMake helpers [CONFIRMED]
- Depends on: `robot/clad/` — included in `CLAD_INCLUDES` and compiled as `robot_clad` from this CMakeLists [CONFIRMED]
- Depends on: `coretech/vision/clad_src/`, `coretech/common/clad_src/`, `lib/util/source/anki/clad/` — include paths for shared types [CONFIRMED]
- Depended on by: `engine/`, `animProcess/`, tests — link `engine_clad` / `robot_clad` / `cloud_clad_cpp` [CONFIRMED for tests and anim; engine [INFERRED] via library name]
- Depended on by: `cloud/` (Go) — `cloud_clad_go` / `gateway_clad_go` outputs under `generated/cladgo/src` [CONFIRMED generation targets]
- Depended on by: SDK/tooling consumers of Python/C# hashes [INFERRED]

## Build

- Root: `add_subdirectory("clad")` after `victor-clad` (`CMakeLists.txt` ~148–180).
- Source lists: `generated/cmake/{engine,robot,viz,cloud,gateway}_clad.srcs.lst` (+ `.headers.lst` for AST hash) via `ANKI_SRCLIST_DIR` — **generated at configure/build**, not checked in when `generated/` is absent.
- Emitters: C++ (`generate_clad_cpp`), Python, C#, Go; hash emitter produces `_hash.h` / `_hash.py` / `_hash.cs` for key unions.
- C++ flags: `--output-union-helper-constructors --output-json`.
- Outputs (CMake):
  - C++: `generated/clad/engine`
  - C#: `generated/cladCSharp`
  - Go: `generated/cladgo/src`
  - Python: `generated/cladPython`
- Libraries: `robot_clad` (STATIC), `engine_clad` (STATIC; links robot/sdk/cti/util clad), `cloud_clad_cpp` (STATIC).
- Makefiles remain as alternate/legacy generation paths; `robotViz.Makefile` uses **CPPLite** for constrained robot-side code.

## Notable observations

- Split of responsibility: **`clad/`** = definitions + engine-side generation orchestration; **`victor-clad/`** = language toolchain + SDK clad + emitters; **`robot/clad/`** = process-boundary messages (E2R/R2E/A2E) and robot/audio types.
- arch_overview IPC table points at robot-interface and externalInterface unions; E2G/G2E live here under `externalInterface/`.
- `behaviorIDs.clad` header says it is **manually regenerated** by AI tooling — editing by hand will be overwritten.
- `CMakeLists.txt:8` sets `CLAD_CS` from `CLAD_EMMITER_DIR` (typo; missing second `T`) while `CLAD_EMITTER_DIR` is the variable actually set — C# path may rely on another code path or be fragile [CONFIRMED typo string].
- Local `cozmo_CPP_switch_emitter.py` duplicates concepts also under `victor-clad/victorEmitters/`; Makefile still references the local copy.
- Gateway CLAD reuses simplified `ActionResult` / object family enums for SDK compatibility comments (e.g. ObjectFamily deprecation note in `messageRobotToExternal.clad`).

## Open questions

- [UNKNOWN] Is `clad/robot` a git symlink to `../robot/clad`, a hard copy, or generated junction? Contents match `robot/clad/` one level down.
- [UNKNOWN] When/where are `generated/cmake/*_clad.srcs.lst` produced (metabuild / configure step)?
- [UNKNOWN] Whether `Makefile` / `robotViz.Makefile` are still invoked in the modern `vbuild` path or are legacy-only.
- [UNKNOWN] Full consumer list of `engine_clad` vs `sdk_clad_cpp` across engine components (not exhaustively grepped).
