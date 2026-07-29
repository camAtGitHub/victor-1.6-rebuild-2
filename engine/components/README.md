# components

**Path:** `engine/components`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:**
- [`docs/architecture/dependencyManagedComponents.md`](../../docs/architecture/dependencyManagedComponents.md)
- [`docs/architecture/arch_overview.md`](../../docs/architecture/arch_overview.md) (Engine components table)
- [`docs/architecture/cubeConnections.md`](../../docs/architecture/cubeConnections.md)
- [`docs/architecture/variableSnapshotComponent.md`](../../docs/architecture/variableSnapshotComponent.md)
- [`docs/architecture/visionSystem.md`](../../docs/architecture/visionSystem.md)

## What this is

Home for most **Robot-entity** dependency-managed components: concrete classes that live under `RobotComponentID` and are constructed into `Robot`’s `DependencyManagedEntity` in `engine/robot.cpp` (~L310–369). The folder is *not* the full component set — several Robot components live in sibling engine trees (`aiComponent/`, `blockWorld/`, `moodSystem/`, `navMap/`, `audio/`, engine root).

## Why it exists

Groups the mid-level “services” Robot exposes to actions/behaviors: motors, pathing, vision orchestration, cube BLE/lights, sensors, battery/power, settings/jdocs, TTS, SDK surface, etc. Without these, Robot would still exist as a pose/comms shell but could not act on the world or external clients in a structured way.

## Folder vs. components outside it

Enum + type map: `engine/robotComponents_fwd.h`, `engine/robotComponents_impl.cpp` (~60 IDs, `Count` sentinel). Access pattern: `robot.GetComponent<T>()` (templated cast via `LINK_COMPONENT_TYPE_TO_ENUM`).

| Lives under `engine/components/` | Lives elsewhere (still `RobotComponentID`) |
|---|---|
| Animation, Path, Movement, Vision, VSM, sensors/*, cubes/*, battery, backpack, mics, TTS, settings*, jdocs, power, SDK, NVStorage, docking/carrying, … | `AIComponent` (`aiComponent/`), `ActionList` (`actions/`), `BlockWorld`, `FaceWorld`, `PetWorld`, `MoodManager` + `StimulationFaceDisplay` (`moodSystem/`), `MapComponent` (`navMap/`), `EngineRobotAudioClient` (`audio/`), `FullRobotPose`, `DrivingAnimationHandler`, `RobotStateHistory`, `RobotToEngineImplMessaging`, `RobotGyroDriftDetector`, `ContextWrapper` |

Helper types here that are **not** Robot components: `AnimTrackHelpers`, `DesiredFaceDistortionComponent`, `lightsConfig.h`.

## Contents (top-level)

| Entry | Type | What it is |
|---|---|---|
| `backpackLights/` | dir | Body LED animations / backpack light component |
| `battery/` | dir | Battery SOC / charger state + long-run stats |
| `cubes/` | dir | Cube BLE, connection coordinator, lights, accel, battery, app subscriber |
| `mics/` | dir | Mic direction history, voice messages, beat detector (engine side) |
| `sensors/` | dir | Cliff, prox, IMU, touch, range (ToF); `ISensorComponent` base |
| `textToSpeech/` | dir | TTS utterance request/track coordinator + wrappers |
| `variableSnapshot/` | dir | Cross-boot persistent member variables (JSON on disk) |
| `visionScheduleMediator/` | dir | Aggregates vision-mode subscriptions into one schedule |
| `animationComponent.*` | file | Engine→anim-process control (play canned/idle, face images) |
| `pathComponent.*` | file | Path plan + follow; status machine for drive-to-pose |
| `movementComponent.*` | file | Motor interface, odometers, unexpected-movement detect |
| `visionComponent.*` | file | Main-thread face to async `VisionSystem` thread |
| `dataAccessorComponent.*` | file | Access to `RobotDataLoader` assets without passing context |
| `dockingComponent.*` / `carryingComponent.*` | file | Dock / lift-carry state for cubes |
| `nvStorageComponent.*` | file | Robot non-volatile storage R/W |
| `sdkComponent.*` | file | SDK gateway action handlers (drive, dock, vision modes, …) |
| `photographyManager.*` | file | Photo capture/store + app communication |
| `powerStateManager.*` | file | Power-save knobs (camera, LCD, CPU throttle, …) |
| `settingsManager.*` / `settingsCommManager.*` | file | On-robot settings store; app/cloud settings I/O |
| `accountSettingsManager.*` / `userEntitlementsManager.*` | file | Account settings / entitlements on robot |
| `jdocsManager.*` | file | Jdocs serialize, cloud sync, subsystem update requests |
| `localeComponent.*` | file | Locale & localization |
| `robotStatsTracker.*` | file | Lifetime behavior/feature stats (via jdocs) |
| `robotHealthReporter.*` | file | Robot/OS health → DAS |
| `robotExternalRequestComponent.*` | file | External protobuf request handlers (version/battery, …) |
| `publicStateBroadcaster.*` | file | Broadcasts robot/behavior/game public state |
| `habitatDetectorComponent.*` | file | Passive habitat presence logic |
| `blockTapFilterComponent.*` | file | Debounce/filter cube tap intensity over time |
| `animTrackHelpers.*` | file | Helpers for animation track flags (not a component) |
| `desiredFaceDistortionComponent.*` | file | Needs-driven procedural eye distortion (not a RobotComponentID) |
| `lightsConfig.h` | file | Rebuild: wirelights flag via `/data/data/wirelights` (2025) |

## Subdirectories

### `backpackLights/`
`BackpackLightComponent` + engine-side backpack light animations/types. Drives body LEDs (and historically headlight) from engine triggers (`backpackAnimationTriggers` CLAD).

### `battery/`
`BatteryComponent` monitors SOC, charger time, related `RobotState`; `BatteryStats` records long-running stats. Serves gateway battery queries.

### `cubes/`
Full cube stack. Prefer **`CubeConnectionCoordinator`** for subscriptions; **`CubeCommsComponent`** is low-level BLE (do not open/close connections ad hoc from engine). Also: `CubeLightComponent` + `cubeLights/`, `CubeAccelComponent` + `cubeAccelListeners/` (shake, rotate, movement filters), `CubeBatteryComponent`, `CubeInteractionTracker`, `AppCubeConnectionSubscriber`, `ICubeConnectionSubscriber`, `ledAnimation`. Upstream: `cubeConnections.md`.

### `mics/`
`MicComponent` owns `MicDirectionHistory` + `VoiceMessageSystem` (record/playback of user voice notes). `BeatDetectorComponent` is engine-side state for beat/tempo (detection in anim process).

### `sensors/`
`ISensorComponent` base (RobotState notify, optional rolling file logs under cache). Concrete: `CliffSensorComponent` (carpet thresholds, suspicious cliffs), `ProxSensorComponent` (forward distance), `ImuComponent`, `TouchSensorComponent` (capacitive), `RangeSensorComponent` (Whiskey head ToF — does **not** inherit `ISensorComponent` [CONFIRMED in header]).

### `textToSpeech/`
`TextToSpeechCoordinator` requests/tracks TTS generation and playback; types + wrapper helpers. Used by behaviors and SDK.

### `variableSnapshot/`
`VariableSnapshotComponent` + encoders: shared_ptr members keyed by `variableSnapshotIds.clad`, load on boot / save on shutdown. Not for critical data (force-restart gap). See `variableSnapshotComponent.md`.

### `visionScheduleMediator/`
Subscribers implement `IVisionModeSubscriber`; mediator merges requests into a unified mode schedule applied before `VisionComponent` update. VSM is an update dependency of Vision.

## Key giants — entry points

| Component | Start here | Role |
|---|---|---|
| **VisionComponent** | `visionComponent.h` `InitDependent`/`UpdateDependent`; owns async `VisionSystem` | Image ingest, mode results → BlockWorld/FaceWorld/etc. Schedules via VSM. See `visionSystem.md`, `engine/vision/`. |
| **PathComponent** | `StartDrivingToPose`, `PrecomputePath`, `Abort`, `GetDriveToPoseStatus` | Plan + doler outer to robot process; replanning/status enum. |
| **AnimationComponent** | `animationComponent.h` (tags, `AnimResult`); `InitDependent` | Commands anim process for canned/idle/face composite images. |
| **MovementComponent** | `NotifyOfRobotState`, `IsMoving`, unexpected-movement APIs | Wheel/head/lift messages; odometry; G2E drive handlers. Prefer **actions** over raw motor cmds (arch_overview). |
| **cubes/*** | `CubeConnectionCoordinator::SubscribeToCubeConnection`; `CubeCommsComponent` | BLE connect lifecycle + lights/accel/battery. |

## Dependency management

Entity/component base: `lib/util/source/anki/util/entityComponent/iDependencyManagedComponent.h` (+ `DependencyManagedEntity`). On Init/Update, Robot topo-sorts components by declared `GetInitDependencies` / `GetUpdateDependencies`, then calls each with the requested peer set. Unreliable components (e.g. BlockWorld also on BC entity) can be accessed across entities without owning Init order — see `dependencyManagedComponents.md`.

Three main entities: **Robot**, **AI**, **Behavior** (each with `*_fwd` / `*_impl`).

## Talks to

- Depends on: `engine/robot.h` ownership [CONFIRMED]; CLAD robot/game/gateway messages; `cubeBleClient/`; `coretech/vision` + `engine/vision/`; anim process via AnimationComponent [CONFIRMED]; jdocs/cloud for settings/stats [INFERRED for some paths].
- Depended on by: actions, `aiComponent`/behaviors (via BEI / `GetComponent`), SDK/gateway, WebViz (cubes) [CONFIRMED in cube docs].

## Build

Compiled into engine library `cozmo_engine` (parent `engine/CMakeLists.txt` / `BUILD.in`). No separate target for this folder. No codegen local to this dir (CLAD enums live under `clad/`).

## Notable observations

- `lightsConfig.h` is rebuild-dated (2025, author Emily) — wirelights path gate; not stock Anki docs.
- `RobotExternalRequestComponent` is in `RobotComponentID` and `robotComponents_impl.cpp` but **not** `AddDependentComponent`’d in `robot.cpp` [CONFIRMED grep] — may be wired elsewhere or dead registration.
- `DesiredFaceDistortionComponent` sits in this folder but is not a managed Robot component.
- `RangeSensorComponent` (ToF/Whiskey) coexists with Vector prox/cliff sensors; product-line split.

## Open questions

- [UNKNOWN] Where (if anywhere) is `RobotExternalRequestComponent` constructed / subscribed to gateway?
- [UNKNOWN] Full list of rebuild-only deltas inside these components beyond `lightsConfig.h` / wirelights.
- [UNKNOWN] Whether `RangeSensorComponent` is active on stock Vector hardware builds or only Whiskey-flavored configs.
