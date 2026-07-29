# platform

**Path:** `platform/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:**
- `docs/development/switchboard-pairing.md` — RTS BLE pairing protocol (v5 framing + handshake)
- `docs/development/switchboard-ble-api-v2.md`, `v4.md`, `v5.md` — versioned BLE/RTS APIs
- `docs/development/crash-reports.md` — Breakpad integration, dump paths, `vic-crashuploader`
- `docs/development/logging.md` — log levels/channels (util macros; platform tools feed DAS/logs)
- `docs/architecture/whats_in_victor.md` — hardware inventory (camera, sensors); not a platform-code map
- `docs/development/web-server.md` — on-robot web server (lives in `webServerProcess/`; platform only ships related env under `config/`)

## What this is

OS-adjacent on-robot services and libraries that sit between the three main processes
(engine / anim / robot) and the VicOS stack. Owns BLE/WiFi pairing and external client
routing (`switchboard`), OTA updates (`update-engine`), camera and ToF hardware access,
GPIO, crash reporting hooks, log collect/upload helpers, and the deployable
`/anki/{bin,etc}` config and scripts.

## Why it exists

Without this tree: no secure phone pairing or WiFi setup, no OTA, no camera/ToF frames
for engine, no Breakpad crash dumps from robot processes, and no platform env/scripts
installed under `/anki`. Engine links camera and ToF as libraries
(`engine/robot.cpp` constructs `CameraService` / `ToFSensor`); several processes link
`victorCrashReports`.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `CMakeLists.txt` | file | Root of platform build; `add_subdirectory` list + VICOS strip rules for imported libs |
| `switchboard/` | dir | `vic-switchboard` daemon: BLE pairing (RTS v2–v5), WiFi (connman/wpa), engine/gateway messaging, OTA status; also builds `vic-rescue` |
| `update-engine/` | dir | OTA apply tool (`update-engine` C++ binary + `update-engine.py`); status under `/run/update-engine`; error codes in `error-codes.md` |
| `camera/` | dir | `cameraService` library + VICOS `camera_client` (ION); Mac/Webots sim path; used by engine vision |
| `whiskeyToF/` | dir | `whiskeyToF` / `ToFSensor` library for VL53L1 range sensors; vendored ST API under `vicos/vl53l1/` |
| `gpio/` | dir | Small C GPIO library (`gpio_create` / set / close); linked by camera_client and whiskeyToF on VICOS |
| `victorCrashReports/` | dir | Static lib: Google Breakpad + Android tombstone hooks; `InstallCrashReporter` / minidumps |
| `faultCodeDisplay/` | dir | `vic-faultCodeDisplay` — draws fault codes (or special battery images) on the face LCD |
| `config/` | dir | Deployable `/anki/bin` scripts and `/anki/etc` env files; shipping / development / userdev / beta / ASAN variants; OTA URL templates |
| `robotLogUploader/` | dir | Library: dump + upload debug logs via log-collector CLAD / local UDP (`RobotLogUploader`, `RobotLogDumper`) |
| `vic-log-event/` | dir | CLI to emit a DAS event (`vic-log-event source event …`) |
| `vic-log-forward/` | dir | CLI to forward pre-boot / rampost log files into DAS |
| `vic-log-kernel-panic/` | dir | CLI to process kernel panic files under `/data/panics` (invoked from `config/bin/vic-init.sh`) |
| `vic-log-upload/` | dir | CLI to upload a log file via `robotLogUploader` (JSON status on stdout) |
| `diagnostics-logger/` | dir | Shell script installed as `diagnostics-logger` — packs syslogs/network state into `/data/diagnostics` |
| `anki-trace/` | dir | Optional LTTng UST tracepoints (`ankitrace` when `USE_ANKITRACE`) for tick/fault timing |
| `ion-sample/` | dir | Optional OpenCL/ION memory-map sample (`ANKI_BUILD_OPENCL_ION_MEM_EXAMPLE`); Qualcomm headers |
| `common/` | dir | `diagnosticDefines.h` only — tick-time warning compile flag when profiling |

### Switchboard subdirs (L1 one-liners; not deep-mapped)

| Entry | What it is |
|---|---|
| `switchboardd/` | Daemon core: `switchboardMain` → `Daemon`; RTS handlers v2–v5, key exchange, OTA watch, engine/gateway clients |
| `bleClient/` | BLE stream client over Anki BLE / IPC |
| `anki-wifi/` | WiFi control via connman D-Bus / wpa_supplicant helpers |
| `rescue/` | `vic-rescue` mini pairing / face display path for recovery |
| `auto-test/` | Automated test hooks for switchboard |
| `signals/` | Lightweight signal/slot helpers (simple-signal) |
| `cutils/` | Local `properties.h` shim |

## Key entry points

| Path | Why |
|---|---|
| `platform/CMakeLists.txt` | Which subdirs are wired into the build |
| `switchboard/switchboardd/switchboardMain.cpp` | Process entry → `SwitchboardMain()` |
| `switchboard/switchboardd/daemon.h` / `daemon.cpp` | Pairing, OTA, engine/gateway, token client lifecycle |
| `update-engine/update-engine.cpp` | OTA status files under `/run/update-engine`, decrypt path `/anki/etc/ota.pas` |
| `camera/cameraService.h` | Singleton camera API used by engine |
| `whiskeyToF/tof.h` | Singleton `ToFSensor` API used by engine |
| `victorCrashReports/victorCrashReporter.h` | Crash-handler install API linked into robot processes |
| `config/CMakeLists.txt` | Shipping vs development vs userdev vs beta asset selection and OTA base URLs |
| `config/bin/vic-init.sh` | Runs before `vic-*` services: log forward, panic handling, fault-code clear |

## Talks to

- Depends on: `lib/anki-ble` — BLE stack for switchboard [CONFIRMED, CMake link]
- Depends on: `lib/util`, `lib/crash-reporting-vicos` (Breakpad) — logging and crash client [CONFIRMED]
- Depends on: `engine_clad` / `robot_clad` / `sdk_clad_cpp` / `cloud_clad_cpp` — CLAD message types [CONFIRMED]
- Depends on: `coretech/` (`cti_common`, `cti_vision`, `cti_messaging`) — images, messaging [CONFIRMED]
- Depends on: VicOS/system — connman, D-Bus, glib, sodium, archive/crypto for OTA, systemd unit paths for update-engine [CONFIRMED in sources]
- Depended on by: `engine/` — links/uses `cameraService` and `whiskeyToF` (`engine/robot.cpp`) [CONFIRMED]
- Depended on by: `animProcess/`, `robot/`, `dasmgr/`, switchboard itself — `victorCrashReports` [CONFIRMED / partial]
- Depended on by: root build — `add_subdirectory("platform")` in top-level `CMakeLists.txt` [CONFIRMED]
- Talks to: cloud / phone clients — BLE RTS pairing and WiFi setup via switchboard [CONFIRMED; see upstream switchboard docs]
- Talks to: `cloud/` / log collector — `robotLogUploader` local-socket upload path [INFERRED from CLAD types + UDP client]

## Build

- Root: `platform/CMakeLists.txt` → subdirs listed there; most targets are **VICOS-only** (`if (VICOS)`).
- Camera and whiskeyToF also build Mac/simulator variants (`MACOSX` / `SIMULATOR` + Webots).
- Config uses `anki_build_copy_assets` to stage bin/etc into the build tree; flags:
  `ANKI_RESOURCE_SHIPPING`, `ANKI_USER_DEV`, `ANKI_BETA`, `ANKI_AMAZON_ENDPOINTS_ENABLED`.
- Switchboard builds static lib `switchboard` + executables `vic-switchboard` and `vic-rescue`.
- Parent CMake also strips/debuglinks several imported OpenCV and libc++ shared libs on VICOS.
- **Not** in `platform/CMakeLists.txt` `add_subdirectory` list (but present with own CMakeLists/BUILD.in):
  `robotLogUploader/`, `vic-log-upload/`, `vic-log-kernel-panic/`. How (or whether) they enter the
  default build is [UNKNOWN] from L1 inspection — scripts under `config/bin/` still expect the
  binaries on-robot.

## Notable observations

- Switchboard is the external-comms hub: RTS protocol versions 2–5 coexist (`rtsHandlerV*`,
  `externalCommsCladHandlerV*`); pairing docs live under `docs/development/switchboard-*`.
- Switchboard watches and can drive `update-engine` (`daemon.h` hard-codes
  `/anki/bin/update-engine` and `/run/update-engine/*` paths).
- Development OTA base URL (when Amazon endpoints disabled) is set to
  `https://modder.my.to:6060/vic/` in `config/CMakeLists.txt` — rebuild-oriented vs stock Anki
  production URLs in the shipping branch of the same file.
- `diagnostics-logger` script pulls an SSH key from a third-party GitHub URL
  (`kercre123/unlocking-vector`) — rebuild-specific and security-sensitive.
- `common/` is not an `add_subdirectory` target; it is a header-only include location.
- `ion-sample/` and ToF test executables are gated off by default.

## Open questions

- [UNKNOWN] Are `robotLogUploader`, `vic-log-upload`, and `vic-log-kernel-panic` added via a
  BUILD.in / srclist mechanism outside parent CMake, or orphaned in this tree?
- [UNKNOWN] Exact IPC sockets between switchboard ↔ engine ↔ gateway (paths and CLAD sets)
  — defer to L2 switchboard map.
- [UNKNOWN] Whether `update-engine.cpp` fully supersedes `update-engine.py` on-device or both ship.
- [UNKNOWN] Full list of processes that call `InstallCrashReporter` (upstream crash-reports.md
  names engine, anim, robot, switchboard, webserver).
