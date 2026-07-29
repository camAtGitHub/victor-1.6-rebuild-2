# cubeBleClient

**Path:** `cubeBleClient/`  
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high  
**Upstream docs:** `docs/architecture/cubeConnections.md`

## What this is

C++ library providing the **low-level BLE (or simulated) interface to light cubes**. Higher engine components (`CubeCommsComponent`, `CubeConnectionCoordinator`) sit on top; this layer owns scan/connect/send and platform backends.

## Why it exists

Engine needs one API for real hardware cubes (via bluetooth daemon) and Webots sim cubes. Platform `.cpp` files keep BLE daemon vs Webots emitter/receiver out of engine code.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `cubeBleClient.h` / `.cpp` | file | Public `CubeBleClient` API: Init/Update, scan, connect, send, callbacks |
| `cubeBleClient_vicos.cpp` | file | VICOS: real BLE via `BleClient` / `anki-ble` |
| `cubeBleClient_mac.cpp` | file | MACOSX/sim: Webots Supervisor emitters/receivers (`SIMULATOR`) |
| `bleClient/` | dir | `BleClient` — `IPCClient` wrapper + libev loop thread for ankibluetoothd |
| `CMakeLists.txt` | file | Shared lib `cubeBleClient`; VICOS→anki-ble, MACOSX→Webots |

## Key entry points

- `CubeBleClient` (`cubeBleClient.h`) — scan, `RequestConnectToCube`, `SendMessageToLightCube`, connection-state callbacks
- `BleClient` (`bleClient/bleClient.h`) — VICOS IPC to bluetooth daemon; firmware path + send
- CLAD types: `MessageEngineToCube` / `MessageCubeToEngine`, `cubeCommsTypes`

## Talks to

- Depends on: `util`, `clad`/`engine_clad`, `cti_common`, `libev`; VICOS `anki-ble`; MACOSX Webots — [CONFIRMED] CMake
- Depended on by: `engine/` (link), engine/anim unit tests (`SetSupervisor(nullptr)`), simulator link lines — [CONFIRMED]
- Used under: engine cube components (see `cubeConnections.md`) — [CONFIRMED] doc; coordinator is higher layer

## Build

Root `add_subdirectory("cubeBleClient")`. Shared library with platform compile defs (`SIMULATOR` on MACOSX).

## Notable observations

- `_vicos` and `_mac` files assert opposite `SIMULATOR` state — mutually exclusive sources selected by platform build.
- Upstream doc stresses: do **not** manage connections directly from random engine code; use `CubeConnectionCoordinator` subscribers. This lib is the transport underneath `CubeCommsComponent`.
- Cube firmware path set on `BleClient` (VICOS); assets may live under `resources/` / cube firmware trees — [INFERRED]

## Open questions

- [UNKNOWN] Exact process ownership of ankibluetoothd vs which robot process hosts this client at runtime
- [UNKNOWN] Firmware update flow details inside `BleClient` (pending firmware flag visible in header)
