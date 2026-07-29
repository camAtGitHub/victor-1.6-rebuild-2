# dasmgr

**Path:** `dasmgr/`  
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high  
**Upstream docs:** `docs/development/das-events.md`, `docs/development/logging.md`

## What this is

On-robot **DAS (analytics) manager process** `vic-dasmgr`. Reads Android-style log entries (including `@`-prefixed DAS events from `logd`), batches them to local storage, and uploads to a configured endpoint. VICOS-only executable.

## Why it exists

App code emits DAS via macros/`VictorLogger`; those go to logd. A separate process owns persistence, quotas, flush intervals, and upload so engine/anim crashes do not lose the collection pipeline design (and so upload policy is centralized).

## Contents

| Entry | Type | What it is |
|---|---|---|
| `vic-dasmgr.cpp` | file | Process main: crash reporter, logger, SIGTERM, config load, run manager |
| `dasManager.h` / `.cpp` | file | `DASManager::Run` — event loop until shutdown/`@@` terminate event |
| `dasConfig.h` / `.cpp` | file | URL, file size threshold, flush interval, storage/backup quotas, globals paths |
| `CMakeLists.txt` | file | `vic-dasmgr` only if `VICOS` |

## Key entry points

- `main` in `vic-dasmgr.cpp` — `LOG_PROCNAME "vic-dasmgr"`
- Config: default platform `/anki/etc/config/platform_config.json` (override `VIC_DASMGR_PLATFORM_CONFIG`); DAS settings from `config/DASConfig.json` via DataPlatform resource path
- `DASManager` tracks robot_id, versions, boot_id, profile, BLE/wifi conn ids; worker thread for upload
- Shutdown: SIGTERM logs `@@Shutdown…` so manager parses `@@` as termination event

## Talks to

- Depends on: `victorCrashReports`, `osState`, `DAS` (das-client lib), `cti_common`, `util` — [CONFIRMED] CMake
- Depended on by: systemd/deploy [UNKNOWN] unit name not verified in this pass; listed in profiling docs as a process
- Producers: any process logging DAS to logd (`logging.md`) — [CONFIRMED] doc pattern
- Event authoring macros: `DASMSG` / `DASMSG_SET` / `DASMSG_SEND` in app code — see `das-events.md`

## Build

Root `add_subdirectory("dasmgr")`. Entire target gated on `VICOS`.

## Notable observations

- Storage path designed for tmpfs (RAM) to spare eMMC wear (`dasConfig.h` comment).
- Uses `osState` for identity fields; friend access on OSState for ESN/EMR edge cases.
- Distinct from in-process `DAS` client library under `lib/das-client/` — this is the **collector/uploader process**.

## Open questions

- [UNKNOWN] Systemd unit / start order relative to engine
- [UNKNOWN] Shipping vs internal endpoint URL defaults (in resource JSON, not here)
