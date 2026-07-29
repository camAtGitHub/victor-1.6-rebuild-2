# externalInterface

**Path:** `engine/externalInterface`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:** none dedicated; CLAD defs under `clad/src/clad/externalInterface/`; gateway protos under generated `proto/external_interface/`

## What this is

Abstract message buses and packaging helpers for traffic **between engine and external clients** (game/UI/SDK and app gateway). Does **not** own sockets — concrete handlers live in `engine/cozmoAPI/comms/`. This folder defines:

- **`IExternalInterface`** — CLAD Game↔Engine (G2E / E2G)
- **`IGatewayInterface`** — protobuf `GatewayWrapper` (gateway ↔ engine)
- **`ExternalMessageRouter`** — template helpers to wrap outbound payloads into the correct union/oneof hierarchy

## Why it exists

Decouples engine internals from transport. Components subscribe and broadcast on interfaces without knowing whether the peer is a Webots UI, SDK host, or `vic-cloud` gateway. Router templates keep CLAD and proto nesting rules in one place.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `externalInterface.h` | file | `IExternalInterface`: Broadcast/Subscribe G2E & E2G; `DeliverToGame`; SDK status; message counts. `SimpleExternalInterface` stub |
| `externalInterface_fwd.h` | file | Forward decls |
| `externalInterface.cpp` | file | Implementation bits for simple/default paths |
| `gatewayInterface.h` | file | `IGatewayInterface`: Broadcast/Subscribe `GatewayWrapper`; `DeliverToExternal`; message counts |
| `externalMessageRouter.h` | file | `ExternalMessageRouter::Wrap` / `WrapResponse` for proto Events/Status/Onboarding/… and CLAD `MessageEngineToGame` / `Event` |
| `cladProtoTypeTranslator.h` | file | Type translation helpers between CLAD and proto representations |

## Key entry points

### IExternalInterface (`externalInterface.h`)

- **Inbound (game → engine):** `Broadcast(MessageGameToEngine)` / `BroadcastDeferred` — inject or re-broadcast G2E into the engine event manager.
- **Outbound (engine → game):** `Broadcast(MessageEngineToGame)` ends in protected `DeliverToGame(message, destinationId)`.
- **Subscribe** by `MessageEngineToGameTag` or `MessageGameToEngineTag`.
- Helpers: `BroadcastToGame<T>(args…)`, `BroadcastToEngine<T>(args…)`.
- **Implemented by:** `UiMessageHandler` (`engine/cozmoAPI/comms/uiMessageHandler.h`).

### IGatewayInterface (`gatewayInterface.h`)

- **Bidirectional bus** on `external_interface::GatewayWrapper` (protobuf oneof).
- `Broadcast` + `Subscribe(GatewayWrapperTag, …)`; protected `DeliverToExternal`.
- **Implemented by:** `ProtoMessageHandler` (`engine/cozmoAPI/comms/protoMessageHandler.h`).

### ExternalMessageRouter (`externalMessageRouter.h`)

- **Proto:** `WrapResponse(T*)` for request/response pairs (optional `connection_id`); `Wrap(T*)` nests into `Event` / `Status`+timestamp / `Onboarding` / `WakeWord` / `AttentionTransfer` as constructibility allows.
- **CLAD:** `Wrap(T&&)` nests into `ExternalInterface::Event` when needed, then `MessageEngineToGame`.
- Comment notes eventual removal of CLAD portions once messages are fully converted to proto.

## E2G / G2E / gateway routing (conceptual)

| Direction | Name | Type system | Bus |
|---|---|---|---|
| External → Engine | G2E | CLAD `MessageGameToEngine` | `IExternalInterface` |
| Engine → External | E2G | CLAD `MessageEngineToGame` | `IExternalInterface` |
| Gateway ↔ Engine | Gateway | protobuf `GatewayWrapper` | `IGatewayInterface` |

**Ownership chain (confirmed in `cozmoEngine.cpp` ctor):**  
`UiMessageHandler` + `ProtoMessageHandler` constructed → passed into `CozmoContext` as `IExternalInterface*` / `IGatewayInterface*` → `Robot::GetExternalInterface()` / `GetGatewayInterface()` for component use.

**Cross-protocol bridge:** `ProtoCladInterpreter` (in cozmoAPI) can redirect selected gateway protos into CLAD G2E (and some reverse), so legacy subscribers keep working.

## Talks to

- Depends on: `engine/events/ankiEvent.h`, CLAD externalInterface messages, gateway protos [CONFIRMED]
- Depended on by: `engine/cozmoAPI/comms/uiMessageHandler.*`, `protoMessageHandler.*` (implementations) [CONFIRMED]
- Depended on by: `engine/cozmoContext.*`, `engine/robot.*`, and any component that `Subscribe`s / `Broadcast`s [CONFIRMED]
- Related: `engine/robotInterface/` — **different** bus (Engine↔Robot process CLAD), not this folder

## Build

Compiled into `cozmo_engine`. Message schemas generated from `clad/` and protobuf defs elsewhere.

## Notable observations

- “Game” in G2E/E2G is historical Cozmo wording; on Vector it covers UI, SDK, and other CLAD clients.
- Gateway path is the modern app surface (via cloud process); CLAD path remains widely used inside engine.
- `ExternalMessageRouter` is header-only templates + one private timestamp helper — no runtime service object.

## Open questions

- [UNKNOWN] Complete inventory of which app RPCs are native gateway vs ProtoCladInterpreter-bridged.
- [UNKNOWN] Whether `SimpleExternalInterface` is used in production or only tests/tools.
