# simulator

**Path:** `simulator/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:** `simulator/README.md` (setup/runbook), `docs/architecture/physical_vs_sim.md`, `docs/architecture/arch_overview.md` (sim notes)

## What this is

Webots-based desktop simulation of Vector: world files (`.wbt`), protos (robots, cubes, mats, viz), physics plugin, and C++ **controllers** that stand in for the on-robot processes (`vic-engine`, `vic-robot`, `vic-anim`, web server, gateway) plus keyboard UI, viz overlays, and CI sim tests. Controllers are built **only on MACOSX** (`simulator/CMakeLists.txt` early-returns otherwise).

## Why it exists

Lets engine/anim/robot code run without a physical robot for development, debug viz, and high-level integration tests (`webotsCtrlBuildServerTest` + `project/build-scripts/webots/webotsTest.py`). Hardware-facing code is swapped via sim HAL / platform impls and the `SIMULATOR` compile flag — see `docs/architecture/physical_vs_sim.md`.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `README.md` | file | Upstream Webots install, prefs, firewall, shared-memory troubleshooting |
| `CMakeLists.txt` | file | Builds controllers + `cozmo_physics`; MACOSX-only; links `cozmo_engine` etc. |
| `BUILD.in` | file | Source-list project names for controller/plugin targets (includes `webotsCtrlNeuralNets`) |
| `supportedWebotsVersions.txt` | file | R2018a … R2018b (README pins R2018a rev 2) |
| `controllers/` | dir | One Webots controller executable per process role |
| `controllers/shared/` | dir | Shared init/logging helpers (`ctrlCommonInitialization`, `webotsHelpers`) → lib `webotsCtrlCommon` |
| `controllers/webotsCtrlGameEngine2/` | dir | **Engine** process: hosts `CozmoAPI` / `cozmo_engine` |
| `controllers/webotsCtrlRobot2/` | dir | **Robot** process: `Robot::Init` / `step_MainExecution` + sim HAL |
| `controllers/webotsCtrlAnim/` | dir | **Anim** process: `AnimEngine` / `victor_anim` |
| `controllers/webotsCtrlViz/` | dir | Viz overlays/display windows; links `cozmo_engine` |
| `controllers/webotsCtrlKeyboard/` | dir | Keyboard “UI/app” client instead of Unity |
| `controllers/webotsCtrlLightCube/` | dir | Simulated light cubes |
| `controllers/webotsCtrlWebServer/` | dir | WebViz/web library process (`victor_web_library`) |
| `controllers/webotsCtrlGateway/` | dir | Gateway controller; symlinks built `vic-gateway` |
| `controllers/webotsCtrlDevLog/` | dir | Dev-log replay viz (`devLogViz.wbt`) |
| `controllers/webotsCtrlBuildServerTest/` | dir | CI sim tests (`CST_*.cpp`); has own `README.md` |
| `controllers/webotsCtrlNeuralNets/` | dir | Neural-net Webots controller source; in `BUILD.in`, **not** in current `CMakeLists.txt` [INFERRED unused/stale target] |
| `game/` | dir | Sim test base classes: `CozmoSimTestController`, `UiGameController` |
| `plugins/physics/cozmo_physics/` | dir | Webots physics plugin; links `cozmo_engine` |
| `protos/` | dir | Webots PROTO definitions (Cozmo/Whiskey bot/engine, cubes, mats, sensors, viz geometry) + `textures/` |
| `worlds/` | dir | ~70+ `.wbt` scenes (dev, freeplay, docking, vision, CST tests, whiskey) |
| `robot/sim_overlayDisplay.*` | files | Sim overlay display helpers used by robot controller |
| `kill_ipcs.sh` | file | Cleanup helper for orphaned IPC after crashes |

## Key entry points

| Path | Why |
|---|---|
| `simulator/README.md` | Official setup: WEBOTS_HOME, shadows off, firewall, test world `cozmo2World.wbt` |
| `simulator/CMakeLists.txt` | Full link graph of each controller |
| `controllers/webotsCtrlGameEngine2/webotsCtrlGameEngine2.cpp` | Engine main: `CozmoAPI`, `CameraService`/`CubeBleClient`/`ToF` supervisors, `BS_TIME_STEP_MS` |
| `controllers/webotsCtrlRobot2/webotsCtrlRobot2.cpp` | Robot main: `Robot::Init`, `HAL::Step`, `step_MainExecution` |
| `controllers/webotsCtrlAnim/webotsCtrlAnim.cpp` | Anim main: `AnimEngine` |
| `game/cozmoSimTestController.h` | `REGISTER_COZMO_SIM_TEST_CLASS`, `CST_ASSERT` / timeout macros |
| `controllers/webotsCtrlBuildServerTest/README.md` | How to add a CST + wire into `webotsTests.cfg` |
| `docs/architecture/physical_vs_sim.md` | HAL vs physical, `SIMULATOR` macro, CI webots tests |

## How controllers link `cozmo_engine`

From `simulator/CMakeLists.txt` (all under `if (MACOSX)`):

| Target | Links `cozmo_engine`? | Other notable deps |
|---|---|---|
| `webotsCtrlGameEngine2` | **yes** | `cti_*`, `cameraService`, `whiskeyToF`, `cubeBleClient`, `osState`, OpenCV |
| `webotsCtrlViz` | **yes** | `webotsCtrlCommon` |
| `webotsCtrlKeyboard` | **yes** | `robot_interface`; `CORETECH_ENGINE` |
| `webotsCtrlBuildServerTest` | **yes** | `cti_*`, `robot_interface` |
| `webotsCtrlDevLog` | **yes** | same family as CST |
| `cozmo_physics` (plugin) | **yes** | Webots/GL libs |
| `webotsCtrlRobot2` | no | `supervisor`, `robot_interface`, `robot_clad_cpplite`, `cti_vision`, OpenCV |
| `webotsCtrlAnim` | no | `victor_anim`, `robot_interface`, `osState` |
| `webotsCtrlLightCube` | no | `cube_led_animator`, `engine_clad` |
| `webotsCtrlWebServer` | no | `victor_web_library` |
| `webotsCtrlGateway` | no | `webotsCtrlCommon` + symlink to `bin/vic-gateway` |

Shared static lib: `webotsCtrlCommon` (`controllers/shared/`) with `SIMULATOR` + `WEBOTS_VER`. Built binaries are **symlinked** into each controller directory (and resources under `…/resources` from `${CMAKE_BINARY_DIR}/data/assets/cozmo_resources`).

Root CMake: `add_subdirectory("simulator")` only when `MACOSX` (`CMakeLists.txt` ~L217–219).

## Talks to

- Depends on: `engine/` (`cozmo_engine`, `CozmoAPI`) — [CONFIRMED] GameEngine2/Viz/Keyboard/CST/DevLog/physics link
- Depends on: `robot/` (`supervisor`, HAL sim under `robot/hal/sim` per upstream doc) — [CONFIRMED] Robot2 links `supervisor`
- Depends on: `animProcess/` via `victor_anim` — [CONFIRMED] Anim controller
- Depends on: `coretech/`, `cubeBleClient/`, `osState/`, `webServerProcess/` (as `victor_web_library`), OpenCV, Webots SDK — [CONFIRMED] CMake
- Depends on: `project/build-scripts/webots/` (`webotsTest.py`, `webotsTests.cfg`) for CI — [CONFIRMED] via docs + CST README
- Depended on by: Mac host builds / CI Webots jobs — [CONFIRMED] MACOSX-only subdirectory
- Depended on by: none of the on-robot Vicos image — [INFERRED] not built for VICOS

## Build

- CMake project `webots_controllers`; requires `include(webots)`, `WEBOTS_HOME` (per README).
- Optional firewall signing: `WEBOTS_SETUP_FIREWALL` → `webots_setup_target`.
- Controllers expect resources symlinked beside the executable.

## Notable observations

- Naming still says “Cozmo” in many controllers/protos (`webotsCtrlGameEngine2`, `CozmoBot2.proto`) while whiskey variants exist (`WhiskeyBot.proto`, `whiskeyWorld.wbt`).
- `webotsCtrlNeuralNets` source exists and is listed in `BUILD.in` but is **absent** from `CMakeLists.txt` — likely not built by current CMake path.
- Sim does not sleep between engine ticks the same way as hardware (see `docs/development/perf-metric-tool.md`).
- Orphaned controller processes are a known pain; README documents kill patterns; `kill_ipcs.sh` also present.

## Open questions

- [UNKNOWN] Whether `webotsCtrlNeuralNets` is intentionally dropped or only built via another path.
- [UNKNOWN] Exact current Webots license/host setup for this rebuild fork (upstream README assumes Anki Helpdesk licenses and macOS paths).
- [UNKNOWN] How many of the ~70 worlds are still used vs historical demos.
