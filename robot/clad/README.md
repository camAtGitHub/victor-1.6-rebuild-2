# robot/clad

**Path:** `robot/clad/`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:** `docs/architecture/arch_overview.md` §Interprocess comms / Messages, `docs/development/clad.md`

## What this is

**Robot-interface CLAD definitions** used by `vic-robot` (and shared with anim/engine generation). Defines the **Engine↔Robot** and **Anim-related** message unions that travel on the app processor (via anim relay), plus shared robot/audio types. Emitters produce **C++-lite** headers into `generated/clad/robot` for the robot and animation processes.

This is **not** the spine binary protocol (`syscon/schema/messages.h`). Spine is fixed C structs over UART; CLAD is the higher-level process IPC IDL.

## Why it exists

Engine, anim, and robot must share a stable, versioned message set without hand-written packing. Cozmo-era **cpp-lite** generation keeps robot/anim lean; explicit union **tags** partition destinations (robot supervisor vs anim vs engine) and make packet dumps readable.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `src/clad/robotInterface/messageEngineToRobot.clad` | file | **E2R** union — engine→anim→robot (and anim→robot). Tags `0x01`–… motors, path, dock, lights, cal, sensors |
| `src/clad/robotInterface/messageRobotToEngine.clad` | file | **R2E** union — robot→anim→engine (and anim→engine). Includes `RobotState` `0xF0`, mic, docking status, anim events |
| `src/clad/robotInterface/messageFromAnimProcess.clad` | file | **A2E** (and anim-origin) message structs included into R2E (anim state, TTS, trigger word, etc.) |
| `src/clad/robotInterface/factoryMessages.clad` | file | Factory / playpen related messages |
| `src/clad/types/*.clad` | dir | Shared types: `robotStatusAndActions` (`RobotState`), motors, IMU, docking, prox, LEDs, path events, switchboard, … |
| `src/clad/audio/*.clad` | dir | Audio bus/event/callback message types (multiplexer callbacks in R2E) |
| `CMakeLists.txt` | file | `generate_clad_cpplite` + hash/declarations emitters → `generated/clad/robot` |
| `BUILD.in`, `Makefile` | files | Alternate / legacy build listings |

## Message pipes (must-know)

From `arch_overview.md` and the clad files:

| Shorthand | File | Direction (logical) | Notes |
|---|---|---|---|
| **E2R** | `messageEngineToRobot.clad` | Engine → (Anim) → Robot | Also carries anim-targeted commands in higher tag ranges |
| **R2E** | `messageRobotToEngine.clad` | Robot → (Anim) → Engine | Tag space shared with E2R; unreliable vs reliable bands noted in comments |
| **A2\*** | `messageFromAnimProcess.clad` (+ members embedded in R2E) | Anim → Engine (primarily) | AnimationStarted/Ended/State, TTS, trigger word, mic direction often **originate in anim** but ride R2E tags |

**Relay rule:** Engine↔Robot traffic is ordered through **anim** so both processes share one timeline (`arch_overview.md`). Robot HAL “radio” is the UDP/local socket endpoint to anim (`hal/src/radio.cpp`).

### E2R highlights (supervisor-facing tags)

From `union EngineToRobot` (tags approximate; see file for full list):

| Tag range | Examples |
|---|---|
| Init / power | `SyncRobot` `0x02`, `Shutdown`, `CalmPowerMode` |
| Motors | `DriveWheels` `0x10`, curvature, head/lift setpoints, `StopAllMotors` |
| Lights | backpack layers / system light |
| Path | `ClearPath` `0x20` … `ExecutePath` `0x25` |
| Dock | `DockWithObject` `0x26`, abort, place, error signal, carry state |
| Localization | `AbsoluteLocalizationUpdate` `0x2D` |
| Sensors / cal | IMU request, cliff thresholds, `StartMotorCalibration` |
| Higher tags | Anim face/audio/TTS streams (handled in anim process, not supervisor) |

### R2E highlights

| Tag | Message | Origin (typical) |
|---|---|---|
| `0xB0` | `SyncRobotAck` (includes syscon version bytes) | robot |
| `0xB1` | `PrepForShutdown` | robot |
| `0xB3`–`0xBD` | motor cal, path events, docking results | robot |
| `0xC1`–`0xC8` | fall/IMU/cliff/poke events | robot |
| `0xD0`–`0xED` | anim/audio/trigger-word/Alexa/switchboard | mostly anim |
| `0xF0` | **`RobotState`** (unreliable, high rate) | robot |
| `0xF2` | `MicData` | robot (assembly; processing may involve anim) |
| `0xF3` | `AnimationState` | anim |

### `RobotState` (every ~30 ms)

Defined in `types/robotStatusAndActions.clad`: timestamp, pose frame/origin IDs, `RobotPose`, wheel speeds, head/lift angles, accel/gyro, **6× IMU frames** (5 ms each for rolling shutter), battery/charger, status flags, cliffs, prox, touch, path segment index.

## Key entry points

- Unions: end of `messageEngineToRobot.clad` / `messageRobotToEngine.clad`.
- Dispatch on robot: `supervisor/src/messages.cpp` includes `messageEngineToRobot_declarations.def` (generated).
- Send helpers: generated `*_send_helper` headers used by `cozmoBot.cpp` / messages.
- Generation: `robot/clad/CMakeLists.txt` — cpp-lite max size **1400**, output `generated/clad/robot`.

## Talks to

- Depends on: `victor-clad/tools/message-buffers/emitters` + `victorEmitters` (declarations, hash) [CONFIRMED]
- Depends on: `coretech/vision/clad_src` include for some types [CONFIRMED CMake `CLAD_INCLUDES`]
- Depended on by: `robot` (`robot_clad_cpplite`), anim process (cpp-lite), engine (full C++ gen may pull same sources via top-level `clad/`) [CONFIRMED architecture]
- Depended on by: supervisor `Messages::*` only — HAL radio is dumb bytes [CONFIRMED]

## Build

- Target **`robot_clad_cpplite`** via `generate_clad_cpplite` + extra emitters for union `_hash.h` and `_declarations.def`.
- Source lists: `robot_clad_embedded.srcs.lst` / `.headers.lst` under the Anki srclist dir.
- Parallel generation from top-level `clad/` for engine-facing C++ may reference the same or mirrored trees [symlink vs copy still [UNKNOWN] — see parent open questions].

## Notable observations

- Comment in E2R: tag space partitioning dates to Cozmo RTIP/WiFi chips; still used so processes need not flash lockstep.
- Comment in R2E: reliability is between **anim and engine**; anim↔robot is **unreliable**.
- `SyncRobotAck.sysconVersion[16]` must match `VersionInfo::app_version` in `syscon/schema/messages.h`.
- Audio multiplexer callback tags `0xE0`–`0xE3` show anim audio engine results flowing “up” the same R2E pipe.

## Open questions

- [UNKNOWN] Complete anim-only tag table (face image chunks, TTS play, etc.) — file is long; only supervisor-critical tags enumerated here.
- [UNKNOWN] Whether top-level `clad/` duplicates or symlinks `robot/clad`.
- [UNKNOWN] Hash mismatch failure mode at runtime if engine/robot builds skew.
