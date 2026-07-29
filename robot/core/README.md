# core

**Path:** `robot/core/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** medium
**Upstream docs:** none specific (owner note under `robot/README.md` groups “hal/core”)

## What this is

A **small C helper library** (clock, serial, LCD, SPI, common error codes) under `core/inc/core/` + `core/src/`. Used for low-level host/board tooling and tests around robot hardware — **not** linked into the main `vic-robot` CMake target observed in `robot/CMakeLists.txt`.

## Why it exists

Shared primitives for bring-up utilities (LCD fault display helpers, serial experiments, spine-adjacent tools) without pulling C++ HAL.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `inc/core/clock.h`, `serial.h`, `lcd.h`, `spi.h`, `common.h` | headers | Minimal device helpers / `CoreAppErrorCode` |
| `src/clock.c`, `serial.c`, `lcd.c`, `common.c` | sources | Implementations |
| `Makefile` | file | Standalone make (not root CMake) |

## Talks to

- Depended on by: [UNKNOWN] exact consumers — likely `robot/test/*` and historical tools; **not** listed in `vic-robot` link line [CONFIRMED absence from that CMake block]
- Related: `robot/include/.../faultCodeMain.cpp` builds `displayFaultCode` separately

## Build

Standalone `Makefile`. Outside primary `vbuild` robot process graph.

## Notable observations

- Name collision risk: upstream README says “hal/core” as an ownership unit; this folder is **not** under `hal/`.
- Keep shallow unless a tool you need actually includes these headers.

## Open questions

- [UNKNOWN] Full consumer list (`grep` across repo for `core/serial.h` etc. not exhaustively done this pass).
