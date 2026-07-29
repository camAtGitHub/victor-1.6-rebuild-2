# osState

**Path:** `osState/`  
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high  
**Upstream docs:** `docs/development/time.md` (WallTime); profiling/logging mention consumers

## What this is

Shared C++ library for **OS-level robot state** used by many processes: CPU freq/temp, memory/disk/wifi pressure, serial/ESN, robot name/version, boot ID, recovery/maintenance flags, and wall-clock helpers. Implemented as `OSState` and `WallTime` singletons with platform-specific `.cpp` files.

## Why it exists

Multiple on-robot services need the same identity and health signals without each re-parsing `/proc` or EMR. Centralizing also gives WebViz and DAS a single source for robot_id, boot_id, versions.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `osState.h` | file | `OSState` DynamicSingleton API (memory, wifi, disk, CPU, identity, flags) |
| `osState_vicos.cpp` | file | VICOS implementation (real hardware/OS) |
| `osState_mac.cpp` | file | MACOSX/sim implementation (`SIMULATOR`) |
| `wallTime.h` / `.cpp` | file | `WallTime` singleton — local/UTC/system time helpers (non-monotonic) |
| `CMakeLists.txt` | file | Shared lib `osState`; VICOS log + libcutils |

## Key entry points

- `OSState::Update` — periodic refresh (period via `SetUpdatePeriod`)
- Identity: `GetSerialNumberAsString`, `GetRobotName`, `GetBootID`, `GetRobotVersion`, `GetOSBuildVersion`
- Health: `GetMemoryInfo`, `GetDiskInfo`, `GetWifiInfo`, `IsCPUThrottling`, `GetTemperature_C`
- Flags: `IsInRecoveryMode`, `RebootedForMaintenance`, `IsWallTimeSynced`, `IsUserSpaceSecure`, `IsAnkiDevRobot`
- `WallTime::GetLocalTime` / UTC helpers — preferred for “time of day” (see `time.md`)
- `SendToWebVizCallback` — hook for publishing OS stats JSON

## Talks to

- Depends on: `util`, `cti_common`; VICOS `log`, `libcutils`; MACOSX Webots — [CONFIRMED]
- Depended on by: `engine`, `animProcess`, `platform/switchboard`, `webServerProcess` (`victor_web_library`), `dasmgr` (`vic-dasmgr`), tests, simulator — [CONFIRMED] CMake/link
- Friend: `DASManager` may use restricted EMR-related path for ESN without crash — [CONFIRMED] header friend

## Build

Root `add_subdirectory("osState")`. Shared library; public include = this dir and parent.

## Notable observations

- Header states purpose is “mostly for development/debugging” but production link graph is wide (engine, switchboard, dasmgr).
- Wall time explicitly non-steady (NTP / user can change clock).
- CPU frequency control API (`SetDesiredCPUFrequency`) exposes Manual 200/400/533 MHz and Automatic.

## Open questions

- [UNKNOWN] Which process is authoritative for calling `SetDesiredCPUFrequency` in shipping images
- [UNKNOWN] Full set of EMR/sysfs paths read on VICOS (in `osState_vicos.cpp` — not fully audited this pass)
