# cannedAnimLib

**Path:** `cannedAnimLib/`  
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high  
**Upstream docs:** `docs/architecture/animations.md`, `docs/architecture/proceduralFace.md`

## What this is

Shared C++ library for **canned (pre-authored) animations**: loaders, track/keyframe types, animation containers, procedural-face state, and sprite-sequence loading. Built twice from the same sources as two static libs with different link sets and a stream flag.

## Why it exists

Engine needs animation metadata (triggers, durations, groups) without streaming; anim process needs full playback streaming. One library, two CMake targets, avoids duplicating Maya/flatbuffer/JSON parse logic.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `baseTypes/` | dir | Keyframes, tracks, audio keyframe types; generated flatbuffer header `cozmo_anim_generated.h` |
| `cannedAnims/` | dir | `Animation`, `CannedAnimationContainer`, `CannedAnimationLoader`, interpolator, message wrapper |
| `proceduralFace/` | dir | `ProceduralFace`, drawer, scanline distorter, modifier types |
| `spriteSequences/` | dir | `SpriteSequenceLoader` for face-animation image sequences |
| `CMakeLists.txt` | file | Dual targets: `canned_anim_lib_anim`, `canned_anim_lib_engine` |
| `BUILD.in` | file | Parallel BUILD names for same targets |

## Key entry points

- `cannedAnims/cannedAnimationLoader.h` — multi-threaded load of JSON/flatbuffer anims into a container
- `cannedAnims/animation.h` — single animation: tracks of keyframes; `DefineFromFlatBuf` / `DefineFromJson`
- `cannedAnims/cannedAnimationContainer.h` — in-memory store of loaded canned anims
- `proceduralFace/proceduralFace.h` — parameterized eyes (rig params + draw flags)
- `baseTypes/keyframe.h` / `track.h` — timeline primitives used by all tracks

## Talks to

- Depends on: `coretech/` (cti_common / cti_vision / messaging), flatbuffers, `robot_interface` (cozmoConfig) — [CONFIRMED] CMake
- Depends on (anim target): `robot_clad_cpplite`, `cti_*_robot` — [CONFIRMED]
- Depends on (engine target): `engine_clad`, full cti messaging; `CAN_STREAM=false` — [CONFIRMED]
- Depended on by: `animProcess` → `canned_anim_lib_anim`; `engine` → `canned_anim_lib_engine` — [CONFIRMED]
- Assets at runtime: animation files under `resources/` (not in this tree) — [INFERRED] loader takes paths

## Build

Root `CMakeLists.txt` `add_subdirectory("cannedAnimLib")`. Two static libraries, same SRCLIST. Engine variant disables streaming via compile def.

## Notable observations

- Cozmo-era naming (`CozmoAnim`, `cozmo_anim_generated.h`) retained for asset compatibility.
- Procedural face compile-time feature flags in `proceduralFace.h` (noise, scanlines, glow, saturation).
- Not the process that **plays** anims — that is `animProcess` / `AnimationStreamer`; this is the shared data model + load path.

## Open questions

- [UNKNOWN] Where flatbuffers schema for `cozmo_anim_generated.h` lives / regenerates
- [UNKNOWN] Exact on-robot asset path layout for canned anim JSON vs binary
