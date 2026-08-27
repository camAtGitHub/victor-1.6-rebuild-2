# Upstream docs index

**Path:** `docs/`
**Mapped:** 2026-07-28
**Purpose:** One-line orientation for every file under `docs/`. Do not edit upstream docs; link here instead of restating.

> Stock Anki 1.6 documentation. This tree is a rebuild fork — verify claims against code when behaviour may have changed (`CHANGES.md`).

---

## `docs/architecture/`

| File | Covers | Code directories |
|---|---|---|
| `README.md` | Index of architecture topics | — (toc only) |
| `arch_overview.md` | Three processes (Engine/Anim/Robot), CLAD IPC, components, coretech | `engine/`, `animProcess/`, `robot/`, `coretech/`, `clad/` |
| `whats_in_victor.md` | Hardware: SoC, motors, displays, sensors, comms, peripherals. Camera listed as 1280×720 / 90°×50° — **stock 1.0 only**; Vector 2.0 (Xray) is 1600×1200 → 800×600. See `docs/mapping/CAMERA-HW-V1-V2.md`. | `robot/hal/`, `robot/syscon/`, `platform/` [INFERRED] |
| `actions.md` | Action system: IActionRunner, queues, compound actions, tags | `engine/actions/` |
| `animations.md` | Animation tracks/layers/playback, content pipeline, Webots, console | `animProcess/`, `cannedAnimLib/`, `resources/assets/` |
| `behaviors.md` | Behavior stack, active features, config JSON pointer | `engine/aiComponent/behaviorComponent/`, `resources/config/engine/behaviorComponent/` |
| `behaviors_intents.md` | User/cloud/app intents in behavior system | `engine/aiComponent/`, `clad/.../userIntent.clad` |
| `beiConditions.md` | BEI (Behavior External Interface) conditions | `engine/aiComponent/beiConditions/` |
| `blockWorld.md` | Cube/object pose world, origins, rejiggering | `engine/blockWorld/` |
| `cubeConnections.md` | Cube BLE connection coordinator and subscribers | `engine/components/` (cube*), `cubeBleClient/` |
| `dependencyManagedComponents.md` | Dependency-managed component pattern | `engine/components/`, `engine/` |
| `emotions.md` | Mood manager / emotion system | `engine/moodSystem/` |
| `faceWorld.md` | FaceWorld and PetWorld pose tracking | `engine/faceWorld.cpp`, related vision |
| `map.md` | Nav map / memory map, storage, navigation | `engine/navMap/` |
| `neuralNets.md` | Neural net runner, model params/storage | `coretech/neuralnets/`, `engine/vision/` |
| `observableObjects.md` | Observable/actionable object hierarchy | `engine/` (`actionableObject`, `block`, `customObject`) |
| `physical_vs_sim.md` | Physical robot vs Webots simulation differences | `simulator/`, `robot/` |
| `planner.md` | Path planning (grid A*, lattice A*, soft obstacles) | `coretech/planning/`, `engine/` path components |
| `poses.md` | Pose chains/trees, uncertainty, confirmation | `coretech/`, `engine/` |
| `proceduralFace.md` | Procedural face generation on display | `animProcess/`, face-related code |
| `variableSnapshotComponent.md` | Variable snapshot component usage/limits | `engine/components/variableSnapshot/` |
| `visionSystem.md` | Vision component, modes, schedules, image cache | `engine/vision/`, `coretech/vision/`, `okaoVision/` |
| `images/*` | Diagrams (processes, action flowchart, animation export/rig, robot origin) | — (assets) |

---

## `docs/development/`

| File | Covers | Code directories |
|---|---|---|
| `build-instructions.md` | How to build (targets, clean, artifacts) | root `CMakeLists.txt`, `project/victor/`, `setenv.sh` |
| `prerequisites-osx.md` | macOS build prerequisites / Homebrew | — (host setup) |
| `clad.md` | Pointer to CLAD message-buffer docs | `victor-clad/tools/message-buffers/`, `clad/` |
| `compiler-options.md` | RELEASE/DEBUG macros, defines, warning flags | `cmake/`, root build |
| `debugging.md` | gdb/lldb, ASAN, standalone process runs | `project/victor/scripts/` |
| `profiling.md` | simpleperf recording/reporting on robot | `project/victor/simpleperf/` |
| `logging.md` | Log levels/channels, liblog/syslog | platform logging, `lib/` |
| `das-events.md` | DASMSG macros and analytics events | `dasmgr/`, `lib/das-client/` |
| `crash-reports.md` | Crash report locations, symbolication | `lib/crash-reporting-vicos/`, `testCrash/` |
| `alexa.md` | Alexa enable/disable, SDK, troubleshooting | anim/engine Alexa integration [INFERRED] |
| `mic-systems-overview.md` | AudioUtil, Sensory/THF, Signal Essence, MicData | `lib/micData/`, `lib/signalEssence/`, `animProcess/` |
| `perf-metric-tool.md` | PerfMetric tool (engine/web/webots) | engine perf metric code, web server |
| `performance_results.md` | Historical CPU/mic/memory profiles (2018) | — (snapshot data) |
| `self-test-errors.md` | Self-test error code list | self-test types in clad/engine |
| `switchboard-pairing.md` | RTS v5 pairing protocol (BLE framing, crypto) | `platform/switchboard/` [INFERRED] |
| `switchboard-ble-api-v2.md` | Switchboard BLE API RTS v2 (WiFi, OTA, events) | `platform/switchboard/` |
| `switchboard-ble-api-v4.md` | Switchboard BLE API RTS v4 | `platform/switchboard/` |
| `switchboard-ble-api-v5.md` | Switchboard BLE API RTS v5 | `platform/switchboard/` |
| `time.md` | Clocks/timers (which time API to use) | coretech/util time helpers |
| `vscode.md` | VS Code setup, build/deploy/debug tasks | `.vscode/` if present, scripts |
| `web-server.md` | Embedded web server, WebViz, console vars | `webServerProcess/`, engine web service |
| `licenses.md` | CMake license tagging for OSS compliance | `licenses/`, `cmake/` license helpers |
| `images/*` | Profiling HOW-to screenshots | — (assets) |

---

## `docs/` root

| File | Covers | Code directories |
|---|---|---|
| `DEPS.md` | How DEPS / deptool / Artifactory / SVN deps work | root `DEPS`, fetch scripts |
| `FAQ.md` | Dev FAQ: connect, deploy, symbols, tests, timers | cross-cutting |
| `build-system-walkthrough.md` | Build script procedure, CMake anatomy, helpers | `project/`, `cmake/`, `setenv.sh` |
| `ccache.md` | Faster builds with ccache | `cmake/ccache` include |
| `mac-client-setup.md` | mac-client OTA, CLI, WiFi, SSH | tools/mac-client [INFERRED] |
| `mic_capture.md` | Capturing/pulling mic recordings from robot | `project/victor/scripts/` mic scripts |

---

## Related root docs (not under `docs/`)

| File | Covers |
|---|---|
| `README.md` | Rebuild build (bare metal + Docker) and deploy |
| `CHANGES.md` | Deltas from stock Anki 1.6 (animations, behaviors, cloud, CCIS) |
| `ABOUT.md` | End-user install via websetup, server onboarding |
| `CONFIG_MENU.md` | On-robot CCIS configuration menu options |

---

## Coverage checklist

- [x] All markdown under `docs/architecture/` (22 + README + 5 images)
- [x] All markdown under `docs/development/` (22 + 8 images)
- [x] All markdown under `docs/` root (6)
- [x] Total tracked under `docs/`: 63 files (matches ToC seed)
