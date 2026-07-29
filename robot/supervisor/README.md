# supervisor

**Path:** `robot/supervisor/`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:** `docs/architecture/arch_overview.md` §Robot / §Supervisor

## What this is

The **realtime control core** of `vic-robot` (historically “the supervisor”). It runs at the robot process tick (5 ms / 200 Hz) and owns closed-loop wheel/head/lift control, encoder+IMU localization, path following, docking / pick-and-place, cliff reactions, backpack lights, and assembly of `RobotState` / mic uplink messages. Implementation lives entirely under `supervisor/src/`; public API is `Anki::Vector::Robot::{Init,Destroy,step_MainExecution}` in `include/anki/cozmo/robot/cozmoBot.h`.

## Why it exists

Engine issues high-level motion/path/dock commands on a ~60 ms tick. Without this layer those commands would not be tracked at motor-rate, dead-reckoning would stop, and cliff/pickup safety would not run. It is the code that used to live on Cozmo’s robot MCU, now on the application processor.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `src/cozmoBot.cpp` | file | `Robot::Init` / `Destroy` / `step_MainExecution` — wires controllers, shutdown checks, RobotState cadence |
| `src/messages.cpp/.h` | file | CLAD E2R dispatch + R2E send helpers; `UpdateRobotStateMsg` / `SendRobotStateMsg` / mic data |
| `src/localization.cpp/.h` | file | Encoder + IMU dead-reckoning pose; pose history; keyframe updates from engine |
| `src/localization_geometry.*` | file | 2D pose helpers used by localization / docking |
| `src/pathFollower.cpp/.h` | file | Execute path segments (line/arc/point-turn); Dubins helper; path error |
| `src/dockingController.*` | file | Approach / dock to cube or charger given relative goal |
| `src/pickAndPlaceController.*` | file | Lift-related pick/place / carry state around docks |
| `src/wheelController.*` | file | Per-wheel PI speed loop → motor power via HAL |
| `src/steeringController.*` | file | Modes: path-follow, direct drive, point turn |
| `src/speedController.*` | file | Longitudinal speed management feeding steering/wheels |
| `src/headController.*` | file | Head angle/speed control + calibration |
| `src/liftController.*` | file | Lift height/angle control + calibration |
| `src/imuFilter.*` | file | Gyro bias / orientation filter; IMU chunks for engine (rolling shutter) |
| `src/proxSensors.*` | file | Cliff / white / stop-on-cliff reactions |
| `src/backpackLightController.*` | file | Backpack LED layers (driven from messages / local state) |
| `src/ledController.cpp` | file | Low-level LED helpers used by backpack controller [INFERRED name] |
| `src/powerModeManager.*` | file | Calm vs active power mode coordination with HAL/syscon |
| `src/testModeController.*` | file | Factory/debug controller test modes |
| `src/velocityProfileGenerator.*` | file | Motion profiling helper |
| `src/trig_fast.*` | file | Fast trig for control math |
| `src/timeProfiler.*` | file | Per-section timing used inside the main step |
| `src/matlabVisualization.*` | file | Optional MATLAB viz hooks (legacy / debug) |

There is no nested subdirectory tree under `supervisor/` beyond `src/`.

## Key entry points

### Init (`cozmoBot.cpp` `Robot::Init`)

Order (observed):

1. `HAL::Init`
2. `BackpackLightController::Init`
3. `Messages::Init`
4. `Localization::Init`
5. `PathFollower::Init`
6. `IMUFilter::Init`
7. `DockingController::Init`
8. `PickAndPlaceController::Init` then `LiftController::Init`
9. Auto-start head + lift calibration (`MotorCalibrationReason::Startup`)
10. Optional rampost battery-fault checks (`/dev/rampost_error` on VICOS)

### Main step (`Robot::step_MainExecution`)

Observed order each tick (`cozmoBot.cpp` ~L476–622):

1. Cycle-period lateness check (vs previous start)
2. Shutdown / critical-battery / gyro-calib / overheat checks (if engine sync received or shutdown already started)
3. `TestModeController::Update`
4. `Localization::Update`
5. Radio connect/disconnect side effects (reset path, stop drive, etc.)
6. `Messages::Update` — pull E2R packets from HAL radio (anim UDP), dispatch
7. `IMUFilter::Update`, `ProxSensors::Update`
8. `HeadController::Update`, `LiftController::Update`
9. `BackpackLightController::Update`
10. `PathFollower::Update`, `PickAndPlaceController::Update`, `DockingController::Update`
11. `SpeedController::Manage`, `SteeringController::Manage`, `WheelController::Manage`
12. `PowerModeManager::Update`
13. `Messages::UpdateRobotStateMsg`; every N ticks `SendRobotStateMsg`; then `SendMicDataMsgs`

### RobotState rate

- Counter increments every main step; emit when `>= messagePeriod`.
- Active: `STATE_MESSAGE_FREQUENCY = 6` → **30 ms** at 5 ms tick.
- Calm: `STATE_MESSAGE_FREQUENCY_CALM = 50` → **250 ms**.
- Payload shape: `RobotState` in `robot/clad/src/clad/types/robotStatusAndActions.clad` (pose, wheels, head/lift, IMU frames, battery, cliffs, prox, path segment index).

### Localization

- Dead-reckoning from wheel encoders + IMU filter (`Localization::Update`).
- Maintains pose history (~2 s worth at control rate / history resolution).
- Engine can correct with `AbsoluteLocalizationUpdate` (E2R tag `0x2D`) → `UpdatePoseWithKeyframe`.
- Drive-center vs robot-origin conversion for path tracking when carrying a cube.

### Path following

- Path built from E2R: `ClearPath`, `AppendPathSegment{Line,Arc,PointTurn}`, `TrimPath`, `ExecutePath` (tags `0x20`–`0x25` in `messageEngineToRobot.clad`).
- Uses `coretech/planning/shared/path` types; steering mode defaults to `SM_PATH_FOLLOW`.
- Events uplink via `PathFollowingEvent` (R2E).

### Docking

- `DockingController` + `PickAndPlaceController` handle cube/charger approach and lift sequencing.
- Driven by E2R `DockWithObject`, `AbortDocking`, `PlaceObjectOnGround`, `DockingErrorSignal`, `CarryStateUpdate`, etc.
- Status uplink: `DockingStatus`, `GoalPose`, `PickAndPlaceResult`, `ChargerMountComplete`, …

### Motors (hierarchy)

```
E2R (DriveWheels / path / SetHeadAngle / SetLiftHeight / …)
  → Messages dispatch
  → SpeedController / SteeringController / HeadController / LiftController
  → WheelController (PI) / head & lift loops
  → HAL::MotorSetPower / position reads
  → HeadToBody.motorPower[4] over spine
```

Wheel modes (`SteeringController`): path-follow, direct drive, point turn.

## Talks to

- Depends on: `HAL::*` (`robot/hal/include/.../hal.h`) — sensors, motors, radio, power, time [CONFIRMED]
- Depends on: `robot_clad_cpplite` generated headers under `generated/clad/robot` [CONFIRMED]
- Depends on: `cti_common_robot`, `cti_planning_robot` (path geometry) [CONFIRMED CMake]
- Depended on by: `vic-robot` executable links `supervisor` [CONFIRMED]
- Depended on by: sim controllers call `Robot::step_MainExecution` (`simulator/controllers/webotsCtrlRobot2/`) [CONFIRMED]
- Talks to engine/anim only via Messages → HAL radio → anim relay [CONFIRMED]

## Build

- Static library target **`supervisor`** (`robot/CMakeLists.txt` `anki_build_cxx_library(supervisor …)`).
- VICOS: private link to `robot_hal`. MACOSX: links sim HAL sources + Webots (`SIMULATOR`).
- Sources listed via `ANKI_SRCLIST_DIR` / `BUILD.in` (not enumerated in CMakeLists inline).

## Notable observations

- Disconnect from anim radio resets path follower, stops wheels, clears carry/test state (`cozmoBot.cpp` ~L548–560).
- Button-hold shutdown: 3 s hold → `PrepForShutdown` to anim/engine → `sync()` → `HAL::Shutdown` (syscon power path).
- Gyro not calibrated within ~57–60 s after sync can force shutdown.
- Time profiler sections: HAL, TEST, LOC, MSG, IMU, EYEHEADLIFT, LIGHTS, PATHDOCK — useful for offline performance reading.
- `matlabVisualization` is vestigial relative to production runtime [INFERRED].

## Open questions

- [UNKNOWN] Exact gain defaults and when engine overrides via `ControllerGains` / `SetMotionModelParams`.
- [UNKNOWN] Full docking state machine diagram (approach → dock → place) not re-derived from code at this pass.
- [UNKNOWN] Whether mic data path is partially filled by anim vs pure robot (`SendMicDataMsgs` ownership split with anim).
