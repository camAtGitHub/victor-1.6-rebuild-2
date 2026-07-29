# hal

**Path:** `robot/hal/`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:** `docs/architecture/arch_overview.md` §HAL, `docs/architecture/physical_vs_sim.md`

## What this is

The **Hardware Abstraction Layer** for the robot process: one interface (`hal.h`) with two implementations — **physical** (VICOS, spine serial to syscon) and **simulated** (MACOSX / Webots). Also owns **`vic-robot` process main** (`src/main.cpp`) and the **spine** framing stack that speaks `BodyToHead` / `HeadToBody` with the body MCU.

## Why it exists

Supervisor controllers must not know UART framing, syscon DFU, or Webots device nodes. HAL is the only boundary between control logic and (a) the STM32 body MCU over spine, or (b) Webots sensors/motors in sim.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `include/anki/cozmo/robot/hal.h` | file | Public HAL API: Init/Step/Stop, time, IMU, motors, cliffs, prox, battery, power modes, radio, lights, shutdown |
| `src/main.cpp` | file | **`vic-robot` main** — SCHED_FIFO, crash reporter, `Robot::Init`, loop `HAL::Step` + `Robot::step_MainExecution` |
| `src/hal.cpp` | file | Physical HAL: spine open/read/write, body buffer, power modes, battery/button/prox accessors, Step loop |
| `src/hal_motors.cpp` | file | Motor power / position / calibration helpers over body data |
| `src/hal_imu.cpp` | file | IMU read path (optional thread: `PROCESS_IMU_ON_THREAD`) |
| `src/radio.cpp` | file | “Radio” = **local UDP server to anim process** (`LocalUdpServer`, `ANIM_ROBOT_SERVER_PATH`) |
| `src/DAS.cpp` | file | DAS event helpers for robot process |
| `src/emr.cpp` | file | Factory EMR field access |
| `src/engine_test.cpp` | file | Test/helper code [not fully traced] |
| `spine/` | dir | Spine protocol: framing, CRC, serial open, CC commander (charge-contact), unit test data |
| `spine/spine.h` | file | `spine_frame_b2h` / `spine_frame_h2b`, open/read/write API |
| `spine/spine.c`, `spine_hal.c`, `spine_crc.c` | files | Frame parse/build, serial HAL, checksum |
| `spine/platform/platform.h` | file | Device path + baud (VICOS vs OSX) |
| `spine/cc_commander.*` | files | Charge-contact commander (debug/override path; partially disabled in Step) |
| `sim/include/sim_hal.h` | file | Sim-only HAL extras |
| `sim/src/sim_hal.cpp` | file | Webots-backed HAL; `webotRobot_.step(ROBOT_TIME_STEP_MS)` |
| `sim/src/sim_DAS.cpp` | file | Sim DAS stub |
| `dfu/` | dir | Small DFU helper using spine (`dfu.c`) for syscon image update from AP |

## Key entry points

### Process main (`src/main.cpp`)

```
main:
  setlinebuf; SCHED_FIFO max priority; SIGTERM → Shutdown
  InstallCrashReporter("vic-robot")
  optional ccc_parse_command_line (CC commander)
  run():
    Robot::Init(&shutdownSignal)   // HAL::Init inside
    mlockall(MCL_FUTURE)
    loop:
      HAL::Step()
      Robot::step_MainExecution()
      [if HAL_NOT_PROVIDING_CLOCK: sleep to 5 ms]
      [shutdown countdown → Robot::Destroy]
```

### Physical `HAL::Init` (`hal.cpp`)

- Init IMU, radio (UDP to anim).
- Unless `HAL_DUMMY_BODY`: `spine_init` / `spine_open` with `SPINE_TTY` + `SPINE_BAUD`, set run mode, **block until first BodyToHead frame**, request syscon version.
- Reset motor positions.

### Physical `HAL::Step` (`hal.cpp` ~L565+)

1. Increment `HeadToBody.framecounter`.
2. Throttle TX to ≥ 5 ms (`MIN_CCC_XMIT_SPACING_US = 5000`).
3. If valid syscon app: optionally re-request version; in **calm** mode may send lights-only frames; else `spine_write_h2b_frame` with motor powers + LED state.
4. Read spine until a full frame (`spine_get_frame`) — this is the primary pacing for the 200 Hz loop.
5. Timeout / shutdown early-exit handling.

### Sim vs VICOS

| | Physical (VICOS) | Sim (MACOSX) |
|---|---|---|
| Sources | `hal/src/*` + `spine/*` → lib `robot_hal`, `spine` | `hal/sim/src/sim_hal.cpp` (+ radio.cpp, sim_DAS) compiled into `supervisor` |
| Define | (none special beyond `COZMO_ROBOT`) | `SIMULATOR` |
| Body link | UART spine `/dev/ttyHS0` @ 3 Mbaud | Webots devices; `step(5 ms)` |
| Binary | `vic-robot` executable | Webots robot controller(s) call supervisor + sim HAL |
| Dummy body | `HAL_DUMMY_BODY` head-only bringup | N/A |

Upstream: `docs/architecture/physical_vs_sim.md`.

### Spine protocol (HAL side)

Wire format documented in `syscon/schema/messages.h` header comment:

```
<SYNC 4B><TYPE u16><BYTECOUNT u16><PAYLOAD><CHECKSUM u32>
SYNC_BODY_TO_HEAD = 0x483242aa  ("\xAA" "B2H" little-endian packing)
SYNC_HEAD_TO_BODY = 0x423248aa  ("\xAA" "H2B")
Primary payload type PAYLOAD_DATA_FRAME = 0x6466 ("df")
```

| Direction | Struct | Carries (summary) |
|---|---|---|
| Body → Head (syscon → AP) | `BodyToHead` | framecounter, motor positions/deltas, 4× cliff, battery, ToF range, touch, mic samples (80×4), flags |
| Head → Body (AP → syscon) | `HeadToBody` | framecounter, power flags, `motorPower[4]`, backpack `LightState` |

Frame wrappers: `spine_frame_b2h` / `spine_frame_h2b` in `spine/spine.h`. Schema shared with syscon via include of `robot/syscon` (`CMakeLists` include path).

Other payload IDs: lights-only, mode change, version, ACK, DFU erase/validate/packet, shutdown, boot frame (`PayloadId` enum in schema).

## Talks to

- Depends on: `syscon/schema/messages.h` for fixed-size body frames [CONFIRMED]
- Depends on: `robot_clad_cpplite` for radio message types [CONFIRMED]
- Depends on: `coretech/messaging` `LocalUdpServer` for anim IPC [CONFIRMED]
- Depends on: `platform/victorCrashReports` from main [CONFIRMED]
- Depended on by: `supervisor` (all hardware access) [CONFIRMED]
- Depended on by: anim process as UDP client of robot “radio” [CONFIRMED path constant; peer code in animProcess]
- Depended on by: `dfu/` and `robot/test/spine_loop.c` for direct spine tests [CONFIRMED]

## Build

- VICOS: static **`robot_hal`** (`hal.cpp`, `hal_motors.cpp` listed; other `hal/src` files via srclist / link of `vic-robot`) and static **`spine`**.
- `vic-robot` links `robot_hal` + `supervisor` + `spine` + clad + crash reports.
- MACOSX: no `robot_hal` / `spine` / `vic-robot`; sim sources folded into `supervisor`.
- Spine includes `robot/syscon` for schema headers (does not compile syscon firmware).

## Notable observations

- Historical name “radio” is Cozmo-era; on Vector it is **Unix domain / local UDP to anim**, not BLE/WiFi to cubes.
- Calm power mode reduces H2B data-frame rate (lights-only skips) — pairs with supervisor `STATE_MESSAGE_FREQUENCY_CALM`.
- Syscon cuts motor power after ~25 ms without spine sync (supervisor Destroy comment) — safety interlock.
- `HAL_DUMMY_BODY` enables head-only development without body MCU; main supplies software 5 ms sleep.
- Charge-contact commander path exists but normal Step uses `&headData_` directly (CCC override commented).

## Open questions

- [UNKNOWN] Full set of source files in `robot_hal` vs only those named in CMake (srclist may pull `hal_imu.cpp`, `radio.cpp`, `DAS.cpp`, `emr.cpp` into `vic-robot` or `robot_hal`).
- [UNKNOWN] Exact UART hardware path differences between `/dev/ttyHS0` and legacy `/dev/ttyHSL1` on shipping images.
- [UNKNOWN] DFU production workflow from `hal/dfu` vs `robot/dfu.sh` / OTA packaging.
