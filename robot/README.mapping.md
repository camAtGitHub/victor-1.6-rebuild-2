# robot

**Path:** `robot/`
**Mapped:** 2026-07-28   **Depth:** L2 (live process path)   **Confidence:** high
**Upstream docs:** `docs/architecture/arch_overview.md` (Robot / Supervisor / HAL), `docs/architecture/whats_in_victor.md`, `docs/architecture/physical_vs_sim.md`
**Upstream owner notes:** `robot/README.md` (hardware-damage warning; component owners)
**Child maps:** `supervisor/README.md`, `hal/README.md`, `syscon/README.md`, `clad/README.md`, `core/README.md`

## What this is

The **robot process** (`vic-robot`) and related low-level firmware: realtime motor/path/docking control (**supervisor**), hardware abstraction (**HAL**) over the body MCU link (**spine** → **syscon**), plus cube firmware and factory fixture trees. Historically called “supervisor”; it is the high-rate control path that used to live on Cozmo’s robot MCU, now on Vector’s application processor.

**L2 focus:** the live app-processor process path (`hal` main → HAL Step → `Robot::step_MainExecution` → controllers → CLAD ↔ anim). Cube firmware and factory fixture are named only, not expanded.

## Why it exists

Without this tree there is no closed-loop wheel/head/lift control, no reliable 200 Hz hardware interface, no spine protocol to the body MCU, and no in-tree cube/fixture firmware. Engine and anim talk to the body only through this process (via anim relay for ordering — see arch overview).

## Live process path (L2)

```
main (hal/src/main.cpp)  LOG_PROCNAME "vic-robot"
  SCHED_FIFO max + mlockall(MCL_FUTURE)
  → Robot::Init  (supervisor/src/cozmoBot.cpp)
       HAL::Init → spine open /dev/ttyHS0 @ 3 Mbaud, wait first BodyToHead
       controllers Init (lights, messages, localization, path, IMU, dock, PnP, lift…)
       head/lift calibration start
  → loop forever:
       HAL::Step()                 # write HeadToBody, read BodyToHead (spine)
       Robot::step_MainExecution() # 200 Hz control + RobotState emit
```

| Fact | Evidence |
|---|---|
| Process entry | `hal/src/main.cpp` — `main` → `run()` → `Robot::Init` then `HAL::Step` + `Robot::step_MainExecution` |
| Tick rate | `ROBOT_TIME_STEP_MS = 5` → **200 Hz** (`include/anki/cozmo/shared/cozmoConfig.h` ~L325–326). Comment: “Cozmo control loop is 200Hz.” Upstream arch overview agrees. |
| HAL pacing | Physical path: spine frame I/O is the clock. Dummy-body builds sleep 5 ms (`HAL_NOT_PROVIDING_CLOCK` in `main.cpp`). Packet throttle `MIN_CCC_XMIT_SPACING_US = 5000` in `hal.cpp`. |
| RobotState period | `STATE_MESSAGE_FREQUENCY = 6` ticks → **~30 ms** normal; calm mode `STATE_MESSAGE_FREQUENCY_CALM = 50` → ~250 ms (`cozmoConfig.h` ~L421–426; emit in `cozmoBot.cpp` ~L612–619). |
| Spine device | VICOS: `/dev/ttyHS0`, baud `B3000000` (`hal/spine/platform/platform.h`). Legacy `/dev/ttyHSL1`. |
| Body frames | `BodyToHead` / `HeadToBody` in `syscon/schema/messages.h`; framing `hal/spine/spine.h` |
| IPC to anim | HAL “radio” = local UDP to anim (`hal/src/radio.cpp`, `ANIM_ROBOT_SERVER_PATH`) — not RF. Engine↔robot CLAD is relayed through anim. |
| Binary | CMake target **`vic-robot`** (VICOS only): links `robot_hal` + `supervisor` + `spine` + `robot_clad_cpplite` (`robot/CMakeLists.txt`) |

## Contents

| Entry | Type | Map | What it is |
|---|---|---|---|
| `supervisor/` | dir | **L2** `supervisor/README.md` | Realtime controllers: wheels, head, lift, path, docking, IMU filter, backpack lights, localization, messaging |
| `hal/` | dir | **L2** `hal/README.md` | HAL impl: physical (`hal/src/`), sim (`hal/sim/`), **spine** link to syscon, DFU helper; process main |
| `syscon/` | dir | **L1 shallow** `syscon/README.md` | Body MCU firmware (STM32F0): motors, encoders, mics, lights, touch, power, bootloader (`boot/`) — Keil, not `vbuild` |
| `clad/` | dir | **L2** `clad/README.md` | Robot-side CLAD: E2R/R2E/A2* unions + robot/audio types → `robot_clad_cpplite` → `generated/clad/robot` |
| `core/` | dir | **L1** `core/README.md` | Small C helpers (clock, serial, LCD, SPI) for low-level tooling/tests — not linked into `vic-robot` CMake |
| `include/` | dir | — | Shared headers: `cozmoBot.h`, `cozmoConfig.h` (tick/geometry), factory EMR/fault codes |
| `cube_firmware/` | dir | **not expanded** | Light-cube BLE app/SDK (DA1458x), Keil projects — see its own README |
| `fixture/` | dir | **not expanded** | Factory programming (STM fixture, cube OTP/test, emmcdl, helpware) |
| `test/` | dir | — | Standalone HW tests (LCD, IMU, spine loop, audio) |
| `tools/` | dir | — | Keil conversion, DFU notes, font generator, checkout notes |
| `python/` | dir | — | Spine Python module / test (`spinemodule.c`) |
| `CMakeLists.txt` | file | — | Targets: `vic-robot`, `supervisor`, `robot_hal`, `spine`, `displayFaultCode`, `cube_led_animator` (MAC) |
| `BUILD.in` | file | — | Buck-style source lists for supervisor / vic-robot / spine |
| `vmake.sh`, `dfu.sh`, `run_robot.sh` | scripts | — | Firmware build/DFU/deploy helpers |
| `README.md` | file | — | Upstream safety note + component owners |

## supervisor vs HAL (what lives where)

| Layer | Path | Role |
|---|---|---|
| **Process shell** | `hal/src/main.cpp` | Realtime scheduling, crash reporter, init/destroy, main loop |
| **HAL** | `hal/src/*`, `hal/spine/*` | Spine I/O, motors API, IMU read path, battery/button/prox accessors, “radio” UDP to anim, EMR |
| **Supervisor** | `supervisor/src/*` | Closed-loop control, localization dead-reckoning, path follow, docking, message dispatch, RobotState assembly |
| **Syscon** | `syscon/` (separate MCU) | Bare-metal motor PWM, encoders, cliffs, ToF, mics, lights, power — speaks spine frames only |
| **CLAD** | `clad/` | Message schemas for app-processor IPC (not the spine binary frames) |

Supervisor never talks to syscon directly; it only calls `HAL::*`. HAL never runs path/docking logic.

## Key entry points

| What | Where |
|---|---|
| Process main | `hal/src/main.cpp` |
| Supervisor API | `include/anki/cozmo/robot/cozmoBot.h` — `Init` / `Destroy` / `step_MainExecution` |
| Supervisor tick | `supervisor/src/cozmoBot.cpp` `step_MainExecution` |
| Tick / state rates | `include/anki/cozmo/shared/cozmoConfig.h` |
| HAL interface | `hal/include/anki/cozmo/robot/hal.h` |
| Physical HAL | `hal/src/hal.cpp`, `hal_motors.cpp`, `hal_imu.cpp`, `radio.cpp` |
| Sim HAL | `hal/sim/src/sim_hal.cpp` (`SIMULATOR` / MACOSX) |
| Spine protocol | `hal/spine/spine.h`, `syscon/schema/messages.h` |
| Syscon main | `syscon/src/main.cpp` |
| CLAD unions | `clad/src/clad/robotInterface/*.clad` |

## Talks to

- Depends on: `robot/clad/` + `victor-clad` emitters — CLAD cpp-lite generation [CONFIRMED]
- Depends on: `coretech` robot slices (`cti_common_robot`, `cti_planning_robot`, `cti_messaging_robot`) [CONFIRMED via CMake]
- Depends on: `platform/victorCrashReports` — crash reporter install in main [CONFIRMED]
- Depends on: syscon over **spine** serial frames (HAL ↔ body MCU) [CONFIRMED]
- Depended on by: **anim process** relays Engine↔Robot messages; engine consumes `RobotState` / IMU / mic path [CONFIRMED docs; IPC via CLAD]
- Depended on by: `clad/` build includes `robot/clad/src` for engine-side generation [CONFIRMED]
- Depended on by: `simulator/` uses sim HAL sources when MACOSX [CONFIRMED]
- Cube BLE on the robot body is separate from this process’s motor control; cube FW lives here, host BLE client is elsewhere (`cubeBleClient/`) [INFERRED]

## Build

- Top: `robot/CMakeLists.txt` (`project(robot)`), pulled from root.
- **VICOS (on-robot):** static libs `robot_hal`, `supervisor`, `spine` → executable **`vic-robot`**. Also `displayFaultCode`.
- **MACOSX (sim):** `supervisor` + `sim_hal` / Webots libs; `SIMULATOR` define; `cube_led_animator` from cube animation C for Webots light cubes. No `vic-robot` executable in the VICOS-only block.
- **CLAD:** `robot/clad/CMakeLists.txt` → `robot_clad_cpplite` into `generated/clad/robot` (cpp-lite, max message 1400).
- **Syscon / cube / fixture:** largely **Keil** projects (`.uvprojx`) and `vmake.sh` / fixture scripts — outside the main `vbuild` CMake graph for app-processor targets [CONFIRMED for cube/syscon project files; exact vbuild packaging of DFU images [UNKNOWN]].

## Notable observations

- Tick is **hard realtime intent**: `main` sets `SCHED_FIFO` max priority and `mlockall(MCL_FUTURE)` after init (`hal/src/main.cpp`).
- Cycle health: supervisor warns if tick late (> `ROBOT_TIME_STEP_MS * 1500` µs) or long (> 4000 µs) with DAS messages (`cozmoBot.cpp`).
- Motors auto-disabled by syscon after ~25 ms of spine sync loss (`cozmoBot.cpp` Destroy comment).
- Dummy-body / head-only: `#HAL_DUMMY_BODY` and optional software 5 ms sleep when HAL does not provide clock.
- Syscon and cube firmware are **separate MCUs** (STM32F0 body; DA1458x cube) with their own toolchains; mistreating them can brick hardware (upstream README).
- `ANIM_TIME_STEP_MS = 16` lives in shared `cozmoConfig.h` (anim rate; rebuild note under `animProcess/`).
- Large bulk of file count is **fixture** (vendored DA1458x SDK) and **cube_firmware/sdk** — not app-processor logic.

## Open questions

- [UNKNOWN] Systemd unit / boot order for `vic-robot` relative to rampost, anim, engine (no `*.service` found under `platform/` in this pass).
- [UNKNOWN] How syscon/cube `.dfu` images are produced and staged into shipping `resources/` / OTA in this rebuild.
- [UNKNOWN] Whether `clad/robot` is a symlink to `robot/clad` or a duplicate tree (content match observed from clad mapping).
- [UNKNOWN] Full list of E2R tag ranges reserved for anim-only vs supervisor (partition comments exist; not exhaustively tabulated at L2).
