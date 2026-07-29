# cozmoAPI

**Path:** `engine/cozmoAPI`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:** none dedicated (see parent `engine/README.md`; architecture overview process section)

## What this is

Public process façade and external-comms stack for `vic-engine`. `CozmoAPI` is the binary’s entry object (`Start` / `Update`); it owns a mutex-guarded `CozmoEngine` via `EngineInstanceRunner`. Nested `comms/` implements UI/SDK CLAD messaging (`UiMessageHandler`) and App/gateway protobuf messaging (`ProtoMessageHandler`) over socket transports.

## Why it exists

Without this layer, nothing outside the process can start the engine, drive its tick, or deliver game/SDK/gateway messages into engine event buses. Internal components reach those buses via `CozmoContext` non-owning pointers to `IExternalInterface` / `IGatewayInterface`.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `cozmoAPI.h` / `.cpp` | file | `Anki::Vector::CozmoAPI` — `Start`, `Update`, experiment activate, tick perf registration |
| `comms/uiMessageHandler.h` | file | Implements `IExternalInterface`; GameToEngine / EngineToGame CLAD over sockets |
| `comms/protoMessageHandler.h` | file | Implements `IGatewayInterface`; `GatewayWrapper` protobuf over sockets |
| `comms/iSocketComms.h` | file | Abstract socket transport (`Init`, connect/disconnect, send/recv) |
| `comms/localUdpSocketComms.*` | file | Local-domain UDP server wrapper (on-robot path) |
| `comms/udpSocketComms.*` | file | Multi-client UDP + advertisement (Webots / host) |
| `comms/protoCladInterpreter.h` | file | Proto ↔ CLAD conversion for messages still on the old path |
| `comms/sdkStatus.*` | file | SDK status text surface used by `UiMessageHandler::SetSdkStatus` |
| `comms/gameComms.*`, `gameMessageHandler.*` | file | Legacy/game-side message helpers |
| `csharp-binding/dasLoggerProvider.h` | file | C# binding DAS logger provider (stub/header only in tree) |

## Key entry points

1. **`CozmoAPI::Start` / `Update`** (`cozmoAPI.h`) — process main (`engine/tools/engined/cozmoEngineMain.cpp`) constructs API, calls `Start(dataPlatform, config)`, then ticks `Update(time)`.
2. **`EngineInstanceRunner`** (private in `cozmoAPI.h`) — owns `std::unique_ptr<CozmoEngine>`, serializes updates with `_updateMutex`, exposes `SyncWithEngineUpdate` / `SetEngineThread`.
3. **Wiring in `CozmoEngine` ctor** (`cozmoEngine.cpp` ~L190–193):
   - `_uiMsgHandler = new UiMessageHandler(1)`
   - `_protoMsgHandler = new ProtoMessageHandler`
   - `_context = new CozmoContext(dataPlatform, _uiMsgHandler.get(), _protoMsgHandler.get())`
4. **`UiMessageHandler`** — `Init`/`Update`; `Broadcast`/`Subscribe` for `MessageGameToEngine` and `MessageEngineToGame`; socket array keyed by `UiConnectionType`; `DeliverToGame` ships E2G to connected UI/SDK devices.
5. **`ProtoMessageHandler`** — `Init`/`Update`; `Broadcast`/`Subscribe` on `external_interface::GatewayWrapper`; `DeliverToExternal` ships outbound gateway protos; owns `_socketComms` + `RobotExternalRequestComponent`.
6. **`ProtoCladInterpreter::Redirect`** — when gateway still needs CLAD consumers, converts selected proto requests (drive wheels, play anim, cancel action, …) into `MessageGameToEngine` (and reverse for some outbound).

## How the external world enters engine

```
App / SDK / UI clients
        │  (sockets: LocalUdpSocketComms or UdpSocketComms)
        ▼
UiMessageHandler  ──CLAD──►  IExternalInterface event mgr  ──Subscribe──► Robot / components
ProtoMessageHandler ─proto─► IGatewayInterface event mgr   ──Subscribe──► Robot / components
        │
        └─ ProtoCladInterpreter may bridge proto → CLAD G2E
```

Context accessors: `CozmoContext::GetExternalInterface()` / `GetGatewayInterface()`; `Robot` forwards the same.

## Talks to

- Depends on: `engine/cozmoEngine.*` (owned engine) [CONFIRMED]
- Depends on: `engine/externalInterface/*` (interfaces + router) [CONFIRMED]
- Depends on: `clad/externalInterface/message{GameToEngine,EngineToGame}.h`, `proto/external_interface/shared.pb.h` [CONFIRMED]
- Depends on: `coretech/messaging` socket primitives [INFERRED via LocalUdp / MultiClientComms]
- Depended on by: `engine/tools/engined/cozmoEngineMain.cpp` [CONFIRMED]
- Depended on by: all engine code using context external/gateway interfaces [CONFIRMED]

## Build

Part of library target `cozmo_engine` (`engine/CMakeLists.txt` / `engine/BUILD.in`). No separate binary here; process entry is under `engine/tools/engined/`.

## Related root files (world / planning neighbors)

These live at `engine/` root, not under cozmoAPI, but share the “world model / external clients” surface:

| File | Role |
|---|---|
| `engine/faceWorld.h` | Robot component mirroring vision-tracked faces on the main thread; `Update(TrackedFace list)`, origin rejigger helpers, SmartFaceID API. Upstream: `docs/architecture/faceWorld.md`. |
| `engine/pathPlanner.h` | `IPathPlanner` interface (`ComputePath`, planner status enums); concrete planners (`xyPlanner`, `dubbinsPathPlanner`, …) and `components/pathComponent` use it. Upstream: `docs/architecture/planner.md`. |
| `engine/petWorld.h` | Pet-face analogue of FaceWorld (same tree level). |

## Notable observations

- Historical Cozmo naming throughout (`CozmoAPI`, basestation comments) despite Vector process name `vic-engine`.
- Dual external protocols: **CLAD E2G/G2E** (UI/SDK legacy) and **protobuf GatewayWrapper** (app via cloud gateway). ProtoCladInterpreter exists so not all proto traffic needs native gateway handlers yet.
- Socket choice is environment-dependent: local domain on robot vs multi-client UDP for sim/host (`udpSocketComms.h` comment: “Used by webots for Vector”).

## Open questions

- [UNKNOWN] Exact on-robot socket paths / ports for UI vs gateway (config-driven; not fully traced here).
- [UNKNOWN] Whether `gameComms` / `IGameMessageHandler` are still live on Vector or sim-only.
- [UNKNOWN] Full set of messages handled only via ProtoCladInterpreter vs native gateway subscribers.
