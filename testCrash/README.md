# testCrash

**Path:** `testCrash/`  
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high  
**Upstream docs:** `docs/development/crash-reports.md`

## What this is

Small **dev-only crash harness** binary `vic-testcrash`. Intentionally crashes after a delay via chosen method so Breakpad / crash-reporting integration can be validated on device.

## Why it exists

Crash reporting (Google Breakpad client) is integrated into real services (`vic-engine`, `vic-anim`, etc.). A dedicated tool exercises dump generation and upload/symbolication paths without forcing production processes to fault.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `src/victorTestCrashMain.cpp` | file | CLI main: pick crash type, wait, crash; installs Google Breakpad |
| `CMakeLists.txt` | file | Builds `vic-testcrash` only if `VICOS AND ANKI_DEV_CHEATS` |
| `BUILD.in` | file | Parallel build listing |

## Key entry points

- Usage: `vic-testcrash <crashType> [<secsBeforeCrash>] [<secsTimeout>]`
- Crash types: `null`, `abort`, `stackoverflow`, `SIGABRT`, `SIGFPE`, `SIGILL`, `SIGSEGV`
- Defaults: crash after 1.0 s; overall timeout 5.0 s
- `GoogleBreakpad::InstallGoogleBreakpad("testCrash")` before intentional fault

## Talks to

- Depends on: `cti_common`, `victorCrashReports`, Breakpad libs, `robot_interface` — [CONFIRMED] CMake
- Depended on by: nothing in production; manual/dev use — [CONFIRMED]
- Related stack: `lib/crash-reporting-vicos/`, docs in `crash-reports.md` — [CONFIRMED] index

## Build

Root `add_subdirectory("testCrash")`. Executable gated on VICOS **and** `ANKI_DEV_CHEATS` — not a shipping binary.

## Notable observations

- Stack-overflow path allocates huge volatile arrays and mutual recursion — intentional anti-optimizer noise.
- Logger name `vic-testcrash`; filename prefix for dumps `testCrash`.
- Complements production processes that install crash reporters at startup (engine, anim, switchboard, webserver per docs).

## Open questions

- [UNKNOWN] Whether rebuild CI or on-device scripts invoke this automatically
- [UNKNOWN] Dump destination path on VICOS (documented in crash-reports.md, not re-verified here)
