# cubes

**Path:** `engine/components/cubes`  
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high  
**Upstream docs:** [`docs/architecture/cubeConnections.md`](../../../docs/architecture/cubeConnections.md), [`docs/architecture/blockWorld.md`](../../../docs/architecture/blockWorld.md)

## What this is

Engine-side **light-cube stack**: BLE connect/disconnect, subscription-based connection policy, LED animation layers, accel streaming + listeners, cube battery reporting, user-interaction tracking, and an app/SDK subscription bridge. All live as `RobotComponentID`s on the Robot entity.

## Why it exists

Vector interacts with one (preferred) light cube for play, localization lights, and battery/tap sensing. Direct BLE open/close from behaviors would race and drain the cube; this folder separates **transport** (`CubeComms`) from **who wants a connection** (`CubeConnectionCoordinator`) and from **presentation/sensing** (lights, accel, battery, interaction).

## Contents

| Entry | Type | RobotComponentID | What it is |
|---|---|---|---|
| `cubeCommsComponent.*` | file | `CubeComms` | Low-level BLE via `CubeBleClient`; connect/disconnect, lights send, preferred cube, scan |
| `cubeConnectionCoordinator.*` | file | `CubeConnectionCoordinator` | Subscription hub: Background vs Interactable; timeouts; status lights policy |
| `iCubeConnectionSubscriber.h` | file | (interface) | Observer API: debug name, connected/failed/lost callbacks |
| `cubeLights/` | dir | `CubeLights` → `CubeLightComponent` | Layered LED animations + trigger map |
| `cubeAccelComponent.*` | file | `CubeAccel` | Accel stream fan-out to listeners |
| `cubeAccelListeners/` | dir | (helpers) | Filters: high/low pass, movement, shake, rotation, up-axis, start/stop |
| `cubeBatteryComponent.*` | file | `CubeBattery` | Voltage messages → gateway `CubeBattery` msg |
| `cubeInteractionTracker.*` | file | `CubeInteractionTracker` | Held / moved / tapped / visible target status |
| `appCubeConnectionSubscriber.*` | file | `AppCubeConnectionSubscriber` | App/SDK gateway requests → coordinator subscribe |
| `ledAnimation.*` | file | (helper) | Keyframe sequences from `CubeLightState` for BLE |
| `cubeLights/cubeLightAnimation*.h/.cpp` | file | (helper) | Animation types, JSON container, helpers |

~38 source files under this tree (20 `.h` / 18 `.cpp`).

## Key entry points

### Connection path (read first)

1. **`CubeConnectionCoordinator`** (`cubeConnectionCoordinator.h`) — `SubscribeToCubeConnection` / `UnsubscribeFromCubeConnection`; query `IsConnectedToCube`, `IsConnectedInteractable`, `IsConnectedBackground`, `GetConnectedBlock`.  
   States: `UnConnected` → `Connecting` → `ConnectedInteractable` | `ConnectedBackground` | `ConnectedSwitchingToBackground` → `Disconnecting`.
2. **`CubeCommsComponent`** (`cubeCommsComponent.h`) — `RequestConnectToCube` / `RequestDisconnectFromCube` (grace period), `SendCubeLights`, preferred cube file, owns `std::unique_ptr<CubeBleClient>`.  
   Upstream rule: **do not** open/close connections from here inside normal engine play — use the coordinator.
3. **`ICubeConnectionSubscriber`** — implementors (behaviors via `ICozmoBehavior`, `AppCubeConnectionSubscriber`, `CubeInteractionTracker`) must handle `ConnectionLostCallback` (coordinator drops all subs on unexpected loss).

Connection types (Background vs Interactable, standby/disconnect timeouts, light show policy): **prefer** [`cubeConnections.md`](../../../docs/architecture/cubeConnections.md) over restating.

### Lights

- **`CubeLightComponent`** (`cubeLights/cubeLightComponent.*`) — play by `CubeAnimationTrigger` or raw anim; stop/resume stack; connection/tap/status helpers (`PlayConnectionLights`, `SetCubeBackgroundState`, …).
- Layers (priority high→low): **User** (game/SDK) → **Engine** → **State** (connected/visible/carrying defaults) — private `AnimLayerEnum` ~L164–178.
- Assets: `CubeLightAnimationContainer` loads named JSON anims; `LedAnimation` expands patterns to BLE keyframe chunks; send path ultimately `CubeCommsComponent::SendCubeLights`.

### Sensing

- **`CubeAccelComponent`** — `AddListener(ObjectID, shared_ptr<ICubeAccelListener>)`; auto-drop when last external ref gone; depends on `CubeComms` for data.
- **`cubeAccelListeners/`** — `ICubeAccelListener` + concrete: `HighPassFilterListener`, `LowPassFilterListener`, `MovementListener`, `MovementStartStopListener`, `RotationListener`, `ShakeListener`, `UpAxisChangedListener`.
- **`CubeBatteryComponent`** — `HandleCubeVoltageData`, `GetCubeBatteryVoltage`, `GetCubeBatteryMsg` for gateway.
- **`CubeInteractionTracker`** — `IsUserHoldingCube`, `GetTargetStatus` (`TargetStatus`: held probability, motion, visibility, taps); also `IVisionModeSubscriber` + connection subscriber; uses `BlockWorld` filter for target selection.

### App bridge

- **`AppCubeConnectionSubscriber`** — gateway `AppToEngine` tags → subscribe/unsubscribe on coordinator; implements `ICubeConnectionSubscriber` for SDK connect lifecycle.

## Talks to

| Direction | Target | How |
|---|---|---|
| Depends on | `cubeBleClient/` | `CubeCommsComponent` owns `CubeBleClient` (VICOS BLE daemon / MAC sim) — [CONFIRMED] |
| Depends on | CLAD cube msgs / `cubeConnectionTypes` / `CubeAnimationTrigger` / `CubeLights` | Message + enum types — [CONFIRMED] headers |
| Depends on | `BlockWorld` | Lights update deps; interaction tracker targets — [CONFIRMED] |
| Depends on | `AIComponent` | Cube lights update after AI — [CONFIRMED] `GetUpdateDependencies` |
| Depended on by | Behavior system | `ICozmoBehavior` + `BehaviorOperationModifiers` connection requirements (`RequiredManaged`, `OptionalActive`, …) — [CONFIRMED] upstream `cubeConnections.md` |
| Depended on by | Gateway / SDK | `AppCubeConnectionSubscriber`, battery msg, light control messages — [CONFIRMED] headers |
| Sibling | `blockTapFilterComponent` (parent `components/`) | Tap intensity filter — [CONFIRMED] parent README |
| Sibling | `dockingComponent` / `carryingComponent` | Dock/lift of cubes, not BLE — [CONFIRMED] parent README |

Enum linkage: `engine/robotComponents_impl.cpp` (`LINK_COMPONENT_TYPE_TO_ENUM` for all six IDs + `AppCubeConnectionSubscriber`).

## Build

Sources compile into the engine library (parent `engine/CMakeLists.txt` / `import(cozmo_engine "engine")`). No separate cubes target. BLE backend is the `cubeBleClient` shared lib.

## Notable observations

- **Preferred cube** persisted via `CubeCommsComponent::SetPreferredCube` / `ForgetPreferredCube` / `ReadPreferredCubeFromFile` — connect policy prefers that factory ID when available.
- WebViz: both Comms and Coordinator expose Cube tab data (`SubscribeToWebViz` / `SendDataToWebViz` in headers; dev-cheats gated on coordinator).
- Comments still mention multi-cube ObjectIDs (“Cozmo”); Vector is effectively one connected cube at a time, but APIs still key by `ObjectID` / `ActiveID` / `BleFactoryId`.
- `ledAnimation` and light keyframe generation sit in engine, not in `cubeBleClient` — BLE layer just ships binary light messages.

## Open questions

- [UNKNOWN] Exact standby / disconnect timeout defaults (member times set in `.cpp`; not re-read for this pass).
- [UNKNOWN] Full list of JSON cube light asset paths under `resources/` (container loads from data loader map).
- [INFERRED] Interaction tracker is primary consumer of “user holding cube” for keepaway-style behaviors (`BehaviorKeepaway` fwd-decl in header).
