# matlab

**Path:** `matlab/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** medium
**Upstream docs:** none dedicated at this path; related: `docs/architecture/planner.md` points at **coretech** matlab tools, not this tree; vision docs do not require MATLAB for runtime.

## What this is

A large collection of **MATLAB research / prototyping scripts and class folders** (~180+ tracked files) for vision and robotics algorithms that predate or parallel the C++ stack: fiducial/block marker detection, mat localization, face-detection training pipelines, stereo/obstacle experiments, block-world models, and mex bridges. Not part of the on-robot process graph.

## Why it exists

Historically used to design and validate vision algorithms (especially marker detection and mat localization) before/while porting to C++/mex, generate marker assets, and run offline experiments. Path bootstrap (`initCozmoPath.m`) also pulls in `coretech/*/matlab` and an external `coretech-external` tree — this is a **lab toolkit**, not a shipping runtime.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `initCozmoPath.m` | file | Adds this tree + `coretech/*/matlab` (+ external CTE) to MATLAB path |
| `@Block/`, `@BlockWorld/`, `@BlockMarker2D/`, `@BlockMarker3D/` | dirs | OO models for blocks/markers/world |
| `@Robot/`, `@CozmoDocker/`, `@Observation/` | dirs | Robot kinematics/docking and observations |
| `@CozmoVisionProcessor/` | dir | Packet-driven vision processor (detect/track/localize) |
| `@CozmoTestWorldCreator/` | dir | Helpers to emit Webots world content from MATLAB |
| `@MatMarker2D/`, `@EmbeddedConversionsManager/` | dirs | Mat markers; dual matlab/C conversion modes for detectors |
| `simpleDetector*.m`, `detectFiducials.m`, `decodeBlockMarker.m` | files | Fiducial detector pipeline (stepped scripts) |
| `matLocalization*.m` | files | Multi-step mat localization prototype |
| `faceDetect*.m`, `faceDetection_*` | files | Face detection demos + training-set builders (FERET/FDDB/webfaces) |
| `mex/` | dir | C++ mex sources (`mexVisionSystem`, `mexFaceDetect`, `mexCLAHE`, …) + `makeCozmoMex.m` |
| `obstacleDetection/`, `planePositioning/`, `recognition/`, `trackingTests/` | dirs | Experiment subfolders (stereo, ground plane, LED codes, tracking) |
| `createWebotsMat.m`, `webotsCameraCapture.m` | files | Webots asset / capture helpers |
| Many root `test_*.m`, `Train*.m`, `scratch_*.m` | files | One-off tests, boosting experiments, training scripts |

## Key entry points

| Path | Why |
|---|---|
| `initCozmoPath.m` | Required path setup for the rest of the toolbox |
| `simpleDetector.m` | Main fiducial detector entry; supports “embeddedConversions” vs pure matlab |
| `@CozmoVisionProcessor/CozmoVisionProcessor.m` | Higher-level vision processing facade |
| `mex/makeCozmoMex.m` | Builds vision-related mex (delegates to `makeVisionMex`) |
| `createWebotsMat.m` / `@CozmoTestWorldCreator/` | Bridge toward `simulator/` worlds |

## Talks to

- Depends on: MATLAB runtime (host) — [CONFIRMED] all `.m`
- Depends on: `coretech/*/matlab` (via path) — [CONFIRMED] `initCozmoPath.m`
- Depends on: optional `../coretech-external[-local]/matlab` — [CONFIRMED] same file; may be missing in this checkout
- Relates to: `coretech/vision` C++ detectors (algorithm ancestry) — [INFERRED] naming/steps mirror vision pipeline; not a build edge from this folder
- Relates to: `simulator/` (world/mat generation, camera capture) — [CONFIRMED] scripts named for Webots
- Depended on by: **no CMake `add_subdirectory` for this tree** — [CONFIRMED] grepped root/cmake; not in robot image
- Note: `coretech/vision/CMakeLists.txt` has `if (MATLAB) add_subdirectory(robot/mex)` — that is **coretech** mex, not this top-level `matlab/` folder

## Build

- Not part of `vbuild` / root CMake as a target.
- Mex pieces built from MATLAB (`makeCozmoMex.m`); requires MATLAB mex toolchain and product sources as those scripts expect.

## Notable observations

- Strong **Cozmo-era** naming throughout; looks legacy relative to Vector production C++ vision (`cti_vision` + OKAO).
- Face-detection training scripts reference external datasets (FDDB, FERET, webfaces) — research, not robot packaging.
- Duplicate-ish problem space with `python/` (stereo capture, LK tests) suggests multi-language research era.
- No evidence this rebuild actively maintains these scripts [INFERRED from lack of build wiring and Cozmo naming].

## Open questions

- [UNKNOWN] Whether any current engineer workflow still relies on this tree vs pure C++/tools.
- [UNKNOWN] Whether `systemTests` path referenced in `initCozmoPath.m` exists in this checkout.
- [UNKNOWN] Relationship of root `matlab/mex` to `coretech/vision/.../mex` (overlap vs replacement).
