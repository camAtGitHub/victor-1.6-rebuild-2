# Engine robot tick (60 ms)

**Path:** `docs/mapping/ENGINE-ROBOT-TICK.md`  
**Mapped:** 2026-07-28  
**Confidence:** high (entry + `Robot::Update`); medium (full topo order — derived from declared deps, not a runtime dump)  
**Upstream docs:** `docs/architecture/dependencyManagedComponents.md`, `docs/architecture/visionSystem.md`, `docs/architecture/actions.md`, `docs/architecture/behaviors.md`

Cross-cutting note for how one **Running** engine tick drives `Robot` and its dependency-managed components. Evidence is from this tree only.

---

## 1. Outer loop (process → engine)

| Step | Where | What |
|---|---|---|
| 1 | `engine/tools/engined/cozmoEngineMain.cpp` `main` ~L358–428 | Fixed-period loop; period = `BS_TIME_STEP_MS` **60** / `BS_TIME_STEP_MICROSECONDS` (`robot/include/anki/cozmo/shared/cozmoEngineConfig.h` L77–78). |
| 2 | same | `gEngineAPI->Update(curTimeNanoseconds)` then sleep remainder (always sleep ≥0 so other threads run). Overtime catch-up if ≥2 frames behind. |
| 3 | `engine/cozmoAPI/cozmoAPI.cpp` `CozmoAPI::Update` L54–66 | CPU tick budget **60 ms** (`kMaxDesiredEngineDuration`); delegates to `EngineInstanceRunner`. |
| 4 | same file L146–156 | Mutex + `_engineInstance->Update(...)`. |

`LOG_PROCNAME = "vic-engine"` (`cozmoEngineMain.cpp` L61).

---

## 2. `CozmoEngine::Update` when `EngineState::Running`

`engine/cozmoEngine.cpp` L352–489. Before the state switch: reset message counts, web service, UI/proto handlers.

**Running branch** (L458–482), ordered:

1. `BaseStationTimer::getInstance()->UpdateTime(currTime_nanosec)`
2. `OSState::getInstance()->Update(currTime_nanosec)`
3. **`RobotManager::UpdateRobotConnection()`** — drains robot IPC / R2E handlers  
   (`robotManager.cpp` L214–217 → `MessageHandler::ProcessMessages`)
4. **`RobotManager::UpdateRobot()`** — one `Robot::Update()` + broadcast robot state  
   (`robotManager.cpp` L184–211)
5. `UpdateLatencyInfo()` (console/net stats; not pose history)

**Important:** R2E processing (including `Robot::UpdateFullRobotState` via `robotToEngineImplMessaging.cpp` ~L134) runs **before** `Robot::Update` and component `UpdateDependent`s. Pose / sensor history for this tick is largely filled on the connection pass.

---

## 3. `RobotManager::UpdateRobot`

`engine/robotManager.cpp` L184–211:

1. `_robot->Update()`
2. If `HasReceivedRobotState()`, broadcast E2G CLAD + gateway proto robot state
3. If `ToldToShutdown(...)`, `Shutdown` and return `RESULT_SHUTDOWN`

Single robot instance (`AddRobot` constructs `Robot` + `RobotInitialConnection`).

---

## 4. `Robot::Update` phases

`engine/robot.cpp` L1276–1328 (+ viz after):

| # | Phase | Lines / notes |
|---|---|---|
| A | CPU stats | `_cpuStats.Update()` |
| B | Camera / ToF services | `CameraService::getInstance()->Update()`; optional `ToFSensor::Update()` |
| C | Startup / factory checks | `UpdateStartupChecks` — may return early |
| D | Wait for first full state after sync | If `!_gotStateMsgAfterRobotSync`, return early (`UpdateFullRobotState` sets the flag L954) |
| E | Power-button press tracking | timestamps only |
| F | **`_components->UpdateComponents()`** | Dependency-managed component tick (main body) |
| G | Deferred localization send | If `_needToSendLocalizationUpdate`, `SendAbsLocalizationUpdate()` |
| H | Viz (if `ENABLE_DRAWING`) | BlockWorld draw, robot pose/bounds |

There is **no** hand-written ordered list of subsystems inside `Robot::Update` beyond the above; AI, actions, vision intake, cubes, etc. all live under **F**.

### Construction / init (once)

Ctor builds `_components` and `AddDependentComponent(...)` for each `RobotComponentID`, then `InitComponents(this)` (`robot.cpp` L310–369). Accessors: templated `GetComponent<T>()` + `INLINE_GETTERS` / specials in `robot.h` L180–270 (`GetActionList`, `GetStateHistory`, …).

---

## 5. How dependency-managed updates work

**Upstream:** `docs/architecture/dependencyManagedComponents.md`.  
**Impl:** `lib/util/source/anki/util/entityComponent/dependencyManagedEntity.h`.

On first `UpdateComponents()` (L290–321):

1. For each component, collect `GetUpdateDependencies(...)`.
2. DFS topo-sort (`GetUpdateDependentOrder` / `DFS`) — dependencies first; cycle → verify fail.
3. Cache ordered list of `(component, dependency map)`.
4. Each tick: for each entry, `UpdateDependent(dependentComps)`.

`GetInitDependencies` is the same idea for `InitComponents` (called once at robot create).

Three nested entities (upstream): **Robot** → **AI** → **Behavior**. Child entities sort only within their own set; BC components must not declare deps on `AIComponent` for update order (comment in `aiComponent.h` L33–36).

---

## 6. Where AI and ActionList sit

### Update edges (hard ordering constraints)

| Component | `GetUpdateDependencies` includes | Source |
|---|---|---|
| **AIComponent** | BlockTapFilter, BlockWorld, CliffSensor, FaceWorld, Map, Movement, MoodManager, PetWorld, ProxSensor, TouchSensor, Vision, VisionScheduleMediator | `aiComponent.h` L63–76 |
| **ActionList** | **AIComponent** | `actionContainers.h` L137–139 |
| **Animation** | **AIComponent** | `animationComponent.h` L84–86 |
| **PowerStateManager** | **AIComponent** | `powerStateManager.h` L54–56 |
| **CubeLights** | AIComponent, BlockWorld, CubeComms | `cubeLightComponent.h` L71–75 |
| **BackpackLights** | AIComponent, Battery | `engineBackpackLightComponent.h` L53–56 |
| **PublicStateBroadcaster** | many, **including ActionList** | `publicStateBroadcaster.h` L46–56+ |

So on the main tick:

- **World / sensors / vision results** that AI depends on update **before** AI (topo).
- **`AIComponent::UpdateDependent`** (`aiComponent.cpp` L102–106): `_aiComponents->UpdateComponents()` then `CheckForSuddenObstacle` (uses `RobotStateHistory` + prox).
- Nested AI entity includes **BehaviorComponent** (and Alexa, Continuity, FaceSelection, ObjectInteractionInfoCache, Puzzle, SalientPoints, TimerUtility, Whiteboard — `aiComponent.cpp` L85–93; IDs in `aiComponents_fwd.h`).
- **BehaviorComponent** depends on Continuity + Whiteboard (`behaviorComponent.h` L73–76); its update is `_comps->UpdateComponents()` (L259–261) — behaviors decide / queue work.
- **ActionList** updates **after** AI: walks concurrent queues, `ActionQueue::Update()`, action watcher (`actionContainers.cpp` L247–276).

Intended control hierarchy: **behaviors decide → actions execute** (also `docs/mapping/HIGH-LEVEL.md` §3).

---

## 7. Vision: async vs main tick

Upstream: `docs/architecture/visionSystem.md`. Code:

- `VisionComponent` header: “Container for the **thread** containing the basestation vision system” (`visionComponent.h` L7–9).
- `UpdateDependent` (main tick, L447+): `UpdateAllResults()` (mailbox from async work → FaceWorld/BlockWorld/etc.), capture image if input not locked, pair with **state history**, lock input, notify processor; if synchronous mode, process inline.
- `Processor()` thread (L766–822): waits on `_imageReadyCondition`, `UpdateVisionSystem` → `_visionSystem->Update`, unlocks input.
- Default is async; `SetIsSynchronous` for tests.

**Latency / history link:** image dropped if older than oldest state history entry, or held until history is at least as new as the image timestamp (`visionComponent.cpp` L521–545). Camera pose for processing uses historical robot state (`Robot::GetHistoricalCamera` / state history APIs).

Vision **depends on** Movement + VisionScheduleMediator (`visionComponent.h` L93–97) so schedule from last frame’s subscriptions is applied before this tick’s vision component work.

---

## 8. `RobotStateHistory` and latency compensation

- Component ID `StateHistory` → class `RobotStateHistory` (`robotComponents_impl.cpp` L117).
- **No update deps** — empty `GetUpdateDependencies` (`robotStateHistory.h` L123); not “ticked” meaningfully for logic; filled from messages / vision localization.
- On each R2E robot state: `UpdateFullRobotState` adds raw odom via `AddRawOdomState` (`robot.cpp` L1105–1109), updates prox in history (L1165), refreshes current pose from history (`UpdateCurrPoseFromHistory`).
- History also holds vision-only poses (`AddVisionOnlyState` / `ComputeStateAt`) for better pose estimates at a past timestamp (class comment L103–109).
- Consumers: vision image–state alignment, `AIComponent::CheckForSuddenObstacle` (samples raw states over ~300 ms), localization / docking paths.

This is **pose/time alignment**, not the networking `UpdateLatencyInfo` path in `CozmoEngine`.

---

## 9. Component ID table (by concern)

Enum: `engine/robotComponents_fwd.h`. Mapping: `robotComponents_impl.cpp`. Constructed in `robot.cpp` L313–368 (except noted).

### Core / context
| ID | Class |
|---|---|
| CozmoContextWrapper | `ContextWrapper` |
| DataAccessor | `DataAccessorComponent` |
| FullRobotPose | `FullRobotPose` |
| StateHistory | `RobotStateHistory` |
| RobotToEngineImplMessaging | `RobotToEngineImplMessaging` |
| NVStorage | `NVStorageComponent` |
| LocaleComponent | `LocaleComponent` |

### AI / actions / mood
| ID | Class | Notable update deps |
|---|---|---|
| AIComponent | `AIComponent` | Vision, Map, worlds, sensors, Mood, Movement, VSM, … |
| ActionList | `ActionList` | **AIComponent** |
| MoodManager | `MoodManager` | Context, EngineAudioClient |
| StimulationFaceDisplay | `StimulationFaceDisplay` | MoodManager |
| PublicStateBroadcaster | `PublicStateBroadcaster` | ActionList + many others |

### Motion / path / docking
| ID | Class | Notable update deps |
|---|---|---|
| Movement | `MovementComponent` | (none declared) |
| PathPlanning | `PathComponent` | PathPlanning deps in header (Path, Docking-related) |
| DrivingAnimationHandler | `DrivingAnimationHandler` | none |
| Docking | `DockingComponent` | none |
| Carrying | `CarryingComponent` | — |
| HabitatDetector | `HabitatDetectorComponent` | — |
| GyroDriftDetector | `RobotGyroDriftDetector` | none |

### Vision / world models
| ID | Class | Notable update deps |
|---|---|---|
| Vision | `VisionComponent` | Movement, VisionScheduleMediator |
| VisionScheduleMediator | `VisionScheduleMediator` | — |
| BlockWorld | `BlockWorld` | CubeComms, Vision |
| FaceWorld | `FaceWorld` | none (often filled from Vision results) |
| PetWorld | `PetWorld` | none |
| Map | `MapComponent` | Vision, BlockWorld |

### Sensors
| ID | Class |
|---|---|
| CliffSensor | `CliffSensorComponent` |
| ProxSensor | `ProxSensorComponent` |
| ImuSensor | `ImuComponent` |
| RangeSensor | `RangeSensorComponent` |
| TouchSensor | `TouchSensorComponent` |
| Battery | `BatteryComponent` (deps: BlockWorld, Movement, FullRobotPose) |
| MicComponent | `MicComponent` |
| BeatDetector | `BeatDetectorComponent` |

### Cubes / BLE
| ID | Class | Notable update deps |
|---|---|---|
| CubeComms | `CubeCommsComponent` | none |
| CubeAccel | `CubeAccelComponent` | CubeComms |
| CubeBattery | `CubeBatteryComponent` | CubeComms |
| CubeLights | `CubeLightComponent` | AI, BlockWorld, CubeComms |
| CubeConnectionCoordinator | `CubeConnectionCoordinator` | BlockWorld, CubeComms, CubeLights |
| CubeInteractionTracker | `CubeInteractionTracker` | BlockWorld (+ others in .cpp) |
| AppCubeConnectionSubscriber | `AppCubeConnectionSubscriber` | empty update |
| BlockTapFilter | `BlockTapFilterComponent` | — |

### Output / UX / power
| ID | Class | Notable update deps |
|---|---|---|
| Animation | `AnimationComponent` | **AIComponent** |
| BackpackLights | `BackpackLightComponent` | AI, Battery |
| EngineAudioClient | `EngineRobotAudioClient` | none |
| TextToSpeechCoordinator | `TextToSpeechCoordinator` | none |
| PhotographyManager | `PhotographyManager` | — |
| PowerStateManager | `PowerStateManager` | **AIComponent** |
| SDK | `SDKComponent` | — |

### Settings / cloud-facing robot config
| ID | Class |
|---|---|
| SettingsManager | `SettingsManager` |
| SettingsCommManager | `SettingsCommManager` |
| AccountSettingsManager | `AccountSettingsManager` |
| UserEntitlementsManager | `UserEntitlementsManager` |
| JdocsManager | `JdocsManager` |
| VariableSnapshotComponent | `VariableSnapshotComponent` |
| RobotStatsTracker | `RobotStatsTracker` |
| RobotHealthReporter | `RobotHealthReporter` |

### Nested under AI (not RobotComponentID)
| AIComponentID | Class role |
|---|---|
| BehaviorComponent | behavior stack / BEI children entity |
| ContinuityComponent | smooth transitions to ActionList / anim |
| Whiteboard | shared AI scratch |
| AlexaComponent, FaceSelection, ObjectInteractionInfoCache, Puzzle, SalientPointsDetectorComponent, TimerUtility | supporting AI |

---

## 10. Ordered mental model (one Running tick)

```
main sleep-loop 60ms
  CozmoAPI::Update
    CozmoEngine::Update [Running]
      timer + OSState
      RobotManager::UpdateRobotConnection   // ProcessMessages → often UpdateFullRobotState
      RobotManager::UpdateRobot
        Robot::Update
          CameraService / ToF
          [early outs: factory / no state yet]
          DependencyManagedEntity::UpdateComponents  // topo order, e.g.:
            … sensors, Movement, VSM, CubeComms, Mood …
            Vision          // drain async results; maybe enqueue next image
            BlockWorld / Map / FaceWorld / …
            AIComponent     // nested AI + BehaviorComponent updates; obstacle check
            ActionList      // after AI
            Animation / CubeLights / PowerState / …
            PublicStateBroadcaster  // after ActionList (and peers)
          optional SendAbsLocalizationUpdate
          optional Viz
        broadcast RobotState to game/gateway
      UpdateLatencyInfo (net)
  sleep remainder of 60ms
// parallel: VisionComponent::Processor thread on last locked image
```

Exact total order among components with **empty** deps is DFS visit order over the dependency map (implementation-defined relative to insert order) — do not assume alphabetical or construction order for peers with no edges.

---

## Open questions

- [UNKNOWN] Runtime-printed full update order with `ANKI_PROFILE_DEPENDENCY_MANAGED_ENTITY` was not captured here; table is from declared edges only.
- [UNKNOWN] Whether every component with empty deps no-ops `UpdateDependent` or still does work each tick — sample per class when needed.
- [UNKNOWN] `RobotComponentID::RobotExternalRequestComponent` appears in the enum / impl map but is **not** in the ctor `AddDependentComponent` list (`robot.cpp` L313–368) — ownership path unclear from this pass.
- [INFERRED] Primary E2R/R2E traffic for robot state is handled on the connection pass; components still send motor/path/anim messages during their own updates.
- [UNKNOWN] Exact interaction order between vision result application inside `VisionComponent::UpdateAllResults` and BlockWorld’s own `UpdateDependent` when both run the same tick — BlockWorld depends on Vision so Vision runs first; confirm whether BlockWorld re-processes markers only from that path.
