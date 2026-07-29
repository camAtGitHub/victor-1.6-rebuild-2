# engine

**Path:** `engine`
**Mapped:** 2026-07-28   **Depth:** L2 (core subsystems)   **Confidence:** high
**Cross-cutting:** [`docs/mapping/HIGH-LEVEL.md`](../docs/mapping/HIGH-LEVEL.md), [`docs/mapping/ENGINE-ROBOT-TICK.md`](../docs/mapping/ENGINE-ROBOT-TICK.md)
**Upstream docs:**
- [`docs/architecture/arch_overview.md`](../docs/architecture/arch_overview.md) (Engine process section)
- [`docs/architecture/actions.md`](../docs/architecture/actions.md)
- [`docs/architecture/behaviors.md`](../docs/architecture/behaviors.md)
- [`docs/architecture/behaviors_intents.md`](../docs/architecture/behaviors_intents.md)
- [`docs/architecture/beiConditions.md`](../docs/architecture/beiConditions.md)
- [`docs/architecture/blockWorld.md`](../docs/architecture/blockWorld.md)
- [`docs/architecture/cubeConnections.md`](../docs/architecture/cubeConnections.md)
- [`docs/architecture/dependencyManagedComponents.md`](../docs/architecture/dependencyManagedComponents.md)
- [`docs/architecture/emotions.md`](../docs/architecture/emotions.md)
- [`docs/architecture/faceWorld.md`](../docs/architecture/faceWorld.md)
- [`docs/architecture/map.md`](../docs/architecture/map.md)
- [`docs/architecture/neuralNets.md`](../docs/architecture/neuralNets.md)
- [`docs/architecture/observableObjects.md`](../docs/architecture/observableObjects.md)
- [`docs/architecture/planner.md`](../docs/architecture/planner.md)
- [`docs/architecture/poses.md`](../docs/architecture/poses.md)
- [`docs/architecture/variableSnapshotComponent.md`](../docs/architecture/variableSnapshotComponent.md)
- [`docs/architecture/visionSystem.md`](../docs/architecture/visionSystem.md)
- Index: [`docs/mapping/UPSTREAM-DOCS-INDEX.md`](../docs/mapping/UPSTREAM-DOCS-INDEX.md)

## What this is

The **Engine** is Vector’s “main” application process (`vic-engine`). It owns high-level robotics: actions, behaviors/AI, vision orchestration, world models (blocks/faces/pets/nav map), path planning, mood, cube BLE coordination, and external interfaces (UI/App/SDK). Upstream documents a **60 ms** tick (`BS_TIME_STEP_MS = 60` in `robot/include/anki/cozmo/shared/cozmoEngineConfig.h`); the on-robot main loop uses that step in `engine/tools/engined/cozmoEngineMain.cpp`.

Library target name is **`cozmo_engine`** (historical Cozmo naming throughout this tree).

## Why it exists

Without engine, the robot has no high-level decision loop: no behaviors, no action queue, no vision-driven world model, no path planning orchestration, and no game/SDK/UI message surface. Anim and robot processes still run motors/audio/HAL, but nothing coordinates “what to do next.”

## Contents

~1100 tracked files. **L2 mapped** children have their own README (link in table). Largest: `aiComponent/` (~635 files).

| Entry | Type | Mapping | What it is |
|---|---|---|---|
| `actions/` | dir | [L2 README](actions/README.md) | Action runners/queues; ticked **after** AI (depends on `AIComponent`) |
| `aiComponent/` | dir | [L2 README](aiComponent/README.md) | AI root; nested entity hosts `BehaviorComponent`, Alexa, whiteboard, … |
| `aiComponent/behaviorComponent/` | dir | [L2 README](aiComponent/behaviorComponent/README.md) | Behavior stack, factory, intents, BEI — decision core |
| `aiComponent/beiConditions/` | dir | [L2 README](aiComponent/beiConditions/README.md) | ~60 BEI condition predicates for activation |
| `animations/` | dir | L1 only | Animation groups + transfer (playback in anim process) |
| `audio/` | dir | L1 only | Engine-side audio client |
| `blockWorld/` | dir | [L2 README](blockWorld/README.md) | Cube / marked-object pose world |
| `components/` | dir | [L2 README](components/README.md) | Most `RobotComponentID` implementations (vision, path, cubes, …) |
| `comms/` | dir | [L2 README](comms/README.md) | Engine↔robot UDP/domain connection |
| `cozmoAPI/` | dir | [L2 README](cozmoAPI/README.md) | `CozmoAPI` + UI/proto handlers |
| `debug/` | dir | L1 only | Debug console, DAS-to-SDK |
| `events/` | dir | L1 only | BaseStation events |
| `externalInterface/` | dir | [L2 README](externalInterface/README.md) | E2G/G2E + gateway-facing surface |
| `factory/` | dir | L1 only | Factory test logger |
| `messaging/` | dir | L1 only | Advertisement service |
| `moodSystem/` | dir | [L2 README](moodSystem/README.md) | Emotions / mood manager |
| `namedColors/` | dir | L1 only | Named colors |
| `navMap/` | dir | [L2 README](navMap/README.md) | Memory map / quad tree |
| `robotInterface/` | dir | L1 only | Engine-side robot message handler |
| `signals/` | dir | L1 only | Signal macros |
| `tools/` | dir | L1 only | `vic-engine` main (`tools/engined/cozmoEngineMain.cpp`) |
| `util/`, `utils/` | dir | L1 only | HTTP/archive helpers; feature gate / experiments |
| `vision/` | dir | [L2 README](vision/README.md) | `VisionSystem` detectors (async worker); API is `VisionComponent` |
| `viz/` | dir | L1 only | VizManager stream |
| `CMakeLists.txt` | file | Builds `cozmo_engine` library; protobuf codegen; VICOS tools/install |
| `BUILD.in` | file | Alternate `cxx_project` src listing for `cozmo_engine` |
| `cozmoEngine.h/.cpp` | file | Core engine lifecycle: Init, Update, ConnectToRobotProcess |
| `cozmoContext.h/.cpp` | file | Shared context: data platform, robot manager, viz, web service, feature gate, etc. |
| `robot.h/.cpp` | file | Per-robot entity: dependency-managed components, pose, Update |
| `robotManager.h/.cpp` | file | Owns robot instances / connection update path |
| `robotDataLoader.h/.cpp` | file | Loads robot configs / non-config data during `LoadingData` state |
| `faceWorld.h/.cpp`, `petWorld.h/.cpp` | file | Face / pet face pose tracking |
| `pathPlanner.*`, `xyPlanner.*`, `dubbinsPathPlanner.*`, `faceAndApproachPlanner.*`, `minimalAnglePlanner.*` | file | Path-planner front ends (core algorithms also in `coretech/planning/`) |
| `block.h/.cpp`, `charger.h/.cpp`, `customObject.*`, `actionableObject.*`, `cozmoObservableObject.*` | file | Observable/actionable object hierarchy |
| `robotToEngineImplMessaging.*`, `robotEventHandler.*`, `robotStateHistory.*` | file | Cross-process message routing and pose history |
| `perfMetricEngine.*`, `cpuStats.*`, `drivingAnimationHandler.*`, `pathDolerOuter.*`, … | file | Supporting engine utilities at tree root |

## Key entry points

Read in this order for orientation:

1. **`engine/tools/engined/cozmoEngineMain.cpp`** — process main for `vic-engine`. Creates `CozmoAPI`, ticks with `BS_TIME_STEP_MICROSECONDS` (60 ms).
2. **`engine/cozmoAPI/cozmoAPI.h`** — public façade (`Start`, `Update`); owns `CozmoEngine` inside `EngineInstanceRunner`.
3. **`engine/cozmoEngine.h` / `cozmoEngine.cpp`** — `Anki::Vector::CozmoEngine`:
   - `Init(const Json::Value& config)` at `cozmoEngine.cpp:248` — UI/proto handlers, data loader configs, robot manager, web service, state → `LoadingData`.
   - `Update(BaseStationTime_t)` at `cozmoEngine.cpp:352` — state machine: `LoadingData` → `ConnectingToRobot` → `Running`; in Running, updates robot manager.
   - `ConnectToRobotProcess()` at `cozmoEngine.cpp:582`.
   - Owns `UiMessageHandler`, `ProtoMessageHandler`, `CozmoContext` (unique_ptrs in header).
4. **`engine/cozmoContext.h`** — non-owning external/gateway interfaces; owns robot manager, data loader, viz, perf metric, web service, experiments/feature gate.
5. **`engine/robot.h`** — large component entity (`RobotComponentID` in `robotComponents_fwd.h`); `Robot::Update()` is the per-tick heart once connected.
6. **`docs/mapping/ENGINE-ROBOT-TICK.md`** — full 60 ms call chain; AI before actions; vision async.
7. **`engine/aiComponent/behaviorComponent/`** — stack / factory / intents (see its README).
8. **`engine/actions/`** — `ActionList` / `IAction` (see README).
9. **`engine/components/visionComponent.*`** + **`engine/vision/visionSystem.*`** — vision boundary.

Engine states: `Stopped` → `LoadingData` → `ConnectingToRobot` → `Running`.

### One-tick control order (Running)

Confirmed L2 (`ENGINE-ROBOT-TICK.md`, component deps):

1. Drain **R2E** (`UpdateRobotConnection`) — fill pose/sensor history  
2. **`Robot::Update`** → dependency-managed components  
3. **`AIComponent` / BehaviorComponent** decide (stack + intents + BEI)  
4. **`ActionList`** (and **Animation**) run — both declare dep on `AIComponent`  
5. **Vision** main thread drains async mailbox; heavy work on `VisionSystem` worker thread  

External path: **App → `vic-cloud` (proto) / UI CLAD → `ProtoMessageHandler` / `UiMessageHandler` → components → E2R via `comms/` → `vic-robot`**.

## Talks to

- **Depends on**
  - `clad` / `engine_clad` / `robot_interface` — CLAD message types and robot IPC [CONFIRMED via `engine/CMakeLists.txt` link line]
  - `coretech` (`cti_common`, `cti_messaging`, `cti_vision`, `cti_planning`, `cti_neuralnets`) — shared robotics libs [CONFIRMED]
  - `canned_anim_lib_engine`, `audio_engine`, `micdata`, `cubeBleClient`, `osState`, `cameraService`, `whiskeyToF`, `victor_web_library` [CONFIRMED link deps]
  - `animProcess/` / `robot/` — runtime peers over CLAD (R2E/E2R/A2E); anim also relays engine↔robot [CONFIRMED in arch_overview]
  - `resources/` — JSON configs (behaviors, webserver engine config, etc.) loaded via `RobotDataLoader` [CONFIRMED usage in Init]
  - `okaoVision/`, OpenCV, protobuf gateway codegen [CONFIRMED CMake includes]
- **Depended on by**
  - Root build: `import(cozmo_engine "engine")` in root `CMakeLists.txt:200` [CONFIRMED]
  - `test/engine/`, `simulator/` (link `cozmo_engine`) [CONFIRMED]
  - UI/App/SDK via G2E/E2G and proto gateway handlers [CONFIRMED headers + arch_overview]
  - On-robot process started as `vic-engine` [CONFIRMED `LOG_PROCNAME` in cozmoEngineMain]

## Build

- **CMake:** `engine/CMakeLists.txt` → `anki_build_cxx_library(cozmo_engine …)` plus generated gateway protobuf C++ sources.
- **Root:** `import(cozmo_engine "engine")` (`CMakeLists.txt:200`); private includes added for engine target.
- **Options:** `USE_DAS`, `ALEXA_ACOUSTIC_TEST`.
- **Platform:** VICOS links `log`, installs library under dist; MACOSX sets `SIMULATOR` and Webots/OpenCV libs. `tools/` subdirectory only when `VICOS`.
- **Legacy listing:** `BUILD.in` defines `cozmo_engine` src globs (excludes `tools/**`).
- **Generated:** gateway protobuf under build `generated/`; CLAD types come from clad targets, not generated inside this folder.
- **Defines:** `CORETECH_ENGINE` (private).

## Notable observations

- Naming is still heavily **Cozmo** (`cozmoEngine`, `cozmoAPI`, basestation comments) while namespaces/process names are Vector / `vic-engine`.
- `CozmoEngine` is a thin lifecycle shell; most capability hangs off **`Robot`** components and **`AIComponent`/`BehaviorComponent`**.
- Vision is designed to run in a **separate thread** so processing can exceed the 60 ms tick (arch_overview + VisionComponent role).
- `aiComponent/behaviorComponent/` is by far the largest L1 child (~half of engine by file count under behaviors alone) — do not map in one pass.
- `CHANGES.md` notes rebuild deltas that touch engine broadly (OpenCV 4.14, C++ upgrade, behavior-related changes, Rainbow Eyes) but does not map 1:1 to specific `engine/` paths here.
- Some root `.cpp` files (planners, worlds, objects) sit beside directories rather than under them — historical layout, not a second parallel system.

## Open questions

- [UNKNOWN] Exact on-robot systemd/unit or launcher that starts `vic-engine` (outside this folder).
- [UNKNOWN] Full inventory of which behavior/config JSON under `resources/` this tree still uses vs. stock Anki 1.6 (upstream points at `resources/config/engine/behaviorComponent/`; not re-verified here).
- [UNKNOWN] Boundary details of `UiMessageHandler` vs `ProtoMessageHandler` vs `IGatewayInterface` for modern app/SDK traffic (headers present; protocol split not fully traced at L1).
- [UNKNOWN] Which planner implementation is selected at runtime for normal drive-to poses (several planner `.cpp` files at engine root + `coretech/planning/`).
- [UNKNOWN] Rebuild-specific behavior/component deltas inside `engine/` beyond what `CHANGES.md` names at high level.
