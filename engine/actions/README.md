# actions

**Path:** `engine/actions`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:** [`docs/architecture/actions.md`](../../docs/architecture/actions.md)

## What this is

Closed-loop **action runners** that make the robot “do something discrete”: move head/lift, drive to a pose, dock/pick/place cubes, play animations, track faces, wait for vision, etc. Actions are the building blocks behaviors compose; they share a common lifecycle (`Init` → `CheckIfDone` → completion signal) and live in the robot’s `ActionList` component.

## Why it exists

Without this folder, behaviors and the external interface (SDK/App) have no shared queueable procedure API. Animations alone cannot express docking, path-following, visual verification, or compound sequential/parallel plans with retries and track locking.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `actionInterface.h/.cpp` | file | `IActionRunner` + `IAction` base: Update/Cancel, tags, track lock, retries, vision-mode subscribe |
| `actionContainers.h/.cpp` | file | `ActionQueue` (sequential slot) + `ActionList` (concurrent queues; robot component) |
| `actionDefinitions.h` | file | Shared typedefs: `ActionEndedCallback`, `ActionEndedCallbackID` |
| `actionWatcher.h/.cpp` | file | Passive tree of parent/sub-actions; end callbacks for any action |
| `compoundActions.h/.cpp` | file | `ICompoundAction`, `CompoundActionSequential`, `CompoundActionParallel` |
| `basicActions.h/.cpp` | file | Core primitives: turn, drive straight, head/lift, wait, pan/tilt, turn-towards-*, cliff align |
| `animActions.h/.cpp` | file | Animation playback wrappers (`PlayAnimationAction`, trigger/loop variants) |
| `driveToActions.h/.cpp` | file | Drive-to-pose/object + `IDriveToInteractWithObject` composites (pickup, place, roll, …) |
| `drivePathAction.h/.cpp` | file | Follow a planned path |
| `dockActions.h/.cpp` | file | Docking family: pickup, place, roll, wheelie, face-plant, align |
| `chargerActions.h/.cpp` | file | Mount / backup / turn-align / drive-to-and-mount charger |
| `flipBlockAction.h/.cpp` | file | Flip-block drive + flip sequence |
| `trackActionInterface.h/.cpp` | file | `ITrackAction` base for continuous tracking |
| `trackFaceAction.*`, `trackObjectAction.*`, `trackPetFaceAction.*`, `trackMotionAction.*`, `trackGroundPointAction.*` | files | Concrete trackers |
| `visuallyVerifyActions.h/.cpp` | file | Succeed if object/face is seen from current pose |
| `sayTextAction.h/.cpp` | file | TTS via engine text-to-speech path |
| `retryWrapperAction.h/.cpp` | file | Wraps action/compound with retry count + optional retry anim |

### Concrete action inventory (by source group)

**Interface / containers**

| Class | Role |
|---|---|
| `IActionRunner` | Common runner: `Update()`, `Cancel()`, tags, track locking, retries, completion prep |
| `IAction` | Simple action: `Init()` then `CheckIfDone()`; optional `GetRequiredVisionModes()` |
| `ActionQueue` | Ordered sequential list + current running action |
| `ActionList` | Map of concurrent queues; `IDependencyManagedComponent` (`RobotComponentID::ActionList`) |
| `ActionWatcher` | Parent/child action tree + global end callbacks |

**Compound / wrappers**

| Class | Role |
|---|---|
| `ICompoundAction` | Owns shared_ptr list of sub-runners; optional proxy tag for completion type |
| `CompoundActionSequential` | Run sub-actions in order; optional inter-action delay |
| `CompoundActionParallel` | Run sub-actions together |
| `RetryWrapperAction` | Retry on `FAILURE_*` with callback or fixed `AnimationTrigger` |

**Basic / wait / look** (`basicActions`)

| Class | Role |
|---|---|
| `TurnInPlaceAction` | Body turn in place |
| `DriveStraightAction` | Straight-line drive |
| `PanAndTiltAction` | Combined body pan + head tilt |
| `MoveHeadToAngleAction` / `MoveLiftToAngleAction` / `MoveLiftToHeightAction` | Closed-loop head/lift |
| `CalibrateMotorAction` | Motor calibration |
| `TurnTowardsPoseAction` / `TurnTowardsImagePointAction` / `TurnTowardsObjectAction` / `TurnTowardsFaceAction` / `TurnTowardsLastFacePoseAction` | Orient toward targets |
| `TurnTowardsFaceWrapperAction` | Sequential compound wrapper around face turn |
| `SearchForNearbyObjectAction` | Search pattern for nearby object |
| `WaitAction` / `HangAction` / `WaitForLambdaAction` | Time / forever / predicate wait |
| `WaitForImagesAction` | Wait N processed frames of a `VisionMode` (subscribes via VSM) |
| `CliffAlignToWhiteAction` | Align using cliff white line |

**Animation / speech**

| Class | Role |
|---|---|
| `PlayAnimationAction` | Play named animation to completion |
| `TriggerAnimationAction` / `TriggerLiftSafeAnimationAction` | Play by `AnimationTrigger` |
| `ReselectingLoopAnimationAction` | Loop with reselection |
| `LoopAnimWhileAction` | Parallel: loop anim while another action runs |
| `SayTextAction` | Speak text |

**Drive / dock / charger / flip**

| Class | Role |
|---|---|
| `DrivePathAction` | Execute path |
| `DriveToPoseAction` / `DriveToObjectAction` / `DriveToPlaceCarriedObjectAction` | Navigate to goal |
| `IDriveToInteractWithObject` | Drive then interact (pickup/place/roll/wheelie/face-plant/realign) |
| `IDockAction` + `PickupObjectAction`, `PlaceRelObjectAction`, `RollObjectAction`, `AlignWithObjectAction`, `PopAWheelieAction`, `FacePlantAction`, … | Docking procedures |
| `PlaceObjectOnGroundAction` / `PlaceObjectOnGroundAtPoseAction` | Put-down |
| `MountChargerAction`, `TurnToAlignWithChargerAction`, `BackupOntoChargerAction`, `DriveToAndMountChargerAction` | Charger docking |
| `FlipBlockAction`, `DriveAndFlipBlockAction`, `DriveToFlipBlockPoseAction` | Flip cube |

**Tracking / verify**

| Class | Role |
|---|---|
| `ITrackAction` | Continuous track base (locks tracks; can queue sound anims) |
| `TrackFaceAction` / `TrackObjectAction` / `TrackPetFaceAction` / `TrackMotionAction` / `TrackGroundPointAction` | Specific trackers |
| `IVisuallyVerifyAction` / `VisuallyVerifyObjectAction` (+ face / no-object variants in same files) | Confirm visibility |

## Key entry points

1. **`docs/architecture/actions.md`** — lifecycle flowchart, containers, tags.
2. **`actionInterface.h`** — `IActionRunner::Update()` / `Cancel()`; `IAction::Init` / `CheckIfDone`.
3. **`actionContainers.h`** — `ActionList` as robot component; queue positions.
4. **`Robot::GetActionList()`** — `engine/robot.h` (~L264).
5. **`ActionList::UpdateDependent`** — `actionContainers.cpp` ~L247: ticks every queue, then `ActionWatcher::Update()`.
6. **External queue path** — `engine/robotEventHandler.cpp` handles `QueueSingleAction` / `QueueCompoundAction` / `CancelAction` / `CancelActionByIdTag` (~L1340–1780).
7. **CLAD** — `clad/src/clad/externalInterface/messageActions.clad`, `clad/src/clad/types/actionTypes.clad`, `actionResults.clad`, `robotCompletedAction.clad`.

## How actions are ticked

- `ActionList` is a **dependency-managed robot component** (`RobotComponentID::ActionList`). Update depends on `AIComponent` (`actionContainers.h` ~L137–139).
- Each engine tick, `ActionList::UpdateDependent` iterates all slots; each `ActionQueue::Update` runs the current `IActionRunner::Update()`.
- For `IAction`, `UpdateInternal()` (final) handles start delay → `Init()` until success → check delay → `CheckIfDone()` until success/fail; supports retries, timeout (default 30 s), track unlock, and optional vision-mode subscription via `IVisionModeSubscriber`.
- Completion: `PrepForCompletion()` + broadcast `ExternalInterface::RobotCompletedAction` (seen via ActionQueue completion path / `GetRobotCompletedActionMessage`). Tag + `RobotActionType` identify the instance.

### Queue positions (`QueueActionPosition` in `actionTypes.clad`)

| Position | Behavior (from `ActionList::QueueAction`) |
|---|---|
| `NOW` | Cancel current, run new; rest of queue kept |
| `NOW_AND_CLEAR_REMAINING` | Cancel current + clear queue, then run |
| `NOW_AND_RESUME` | Insert at front; interrupt/resume current if `Interrupt()` allows |
| `NEXT` | After current, before rest of queue |
| `AT_END` | Append |
| `IN_PARALLEL` | New concurrent slot via `AddConcurrentAction` |

Default concurrent queues start at slot 1; most queuing targets slot 0.

## Tags, cancel, external interface

- **Tags:** Auto-assigned unique `u32` at construction; `SetTag()` for custom (must not collide). Ranges reserved in `ActionConstants` (game / game-internal / SDK / engine). Used for cancel matching and completion messages.
- **Cancel:** `ActionList::Cancel(RobotActionType)` or `Cancel(u32 idTag)` searches all slots. External: `CancelAction` (by type), `CancelActionByIdTag` (by tag) in `robotEventHandler.cpp`.
- **External exposure:** Game/SDK sends `QueueSingleAction` / `QueueCompoundAction` (position, `idTag`, optional `numRetries` → `RetryWrapperAction`). Handlers use `_actionUnionHandlerLUT` keyed by `RobotActionUnion` tag to construct C++ actions. Behaviors typically construct actions in C++ and `QueueAction` / delegate via BEI.
- **Track locking:** Actions lock head/lift/body tracks via `MovementComponent` so user/anim commands do not fight the action (`SetTracksToLock`).
- **External action policy:** `IsExternalAction` distinguishes game/SDK tags; queue path can refuse external actions when disabled (`ActionList.QueueAction.ExternalActionsDisabled`).

## Talks to

- Depends on: `engine/robot.h` components (`Movement`, `Path`, `Docking`, `Vision` / VSM, animation, TTS) [CONFIRMED]
- Depends on: `clad/types/actionTypes.clad`, `actionResults.clad`, `messageActions.clad` [CONFIRMED]
- Depends on: `engine/components/visionScheduleMediator/` via `IAction` / `IVisionModeSubscriber` [CONFIRMED]
- Depended on by: `engine/aiComponent/` behaviors (queue/delegate actions) [CONFIRMED]
- Depended on by: `engine/robotEventHandler.cpp`, SDK/gateway via external messages [CONFIRMED]
- Depended on by: `ContinuityComponent` (queues anim get-outs) [CONFIRMED]

## Build

Compiled into `cozmo_engine` (parent `engine/CMakeLists.txt` / `BUILD.in`). No standalone target. Generated CLAD headers required.

## Notable observations

- Historical Cozmo naming (`ANKI_COZMO_*` include guards) throughout.
- `USE_ACTION_CALLBACKS` and `PROCEDURAL_EYE_LEADING` are compile-time switches defaulting **off** in `actionInterface.h`.
- Compound completion signals are for the **whole** compound by default; sub-actions can optionally emit with `emitCompletionSignal`.
- `ActionWatcher` is passive (does not control robot); end callbacks fire after delete — preferred API is on `ActionList`.
- Parallel compounds must not lock the same tracks (`actions.md`).

## Open questions

- [UNKNOWN] Full set of `RobotActionUnion` handlers vs. action classes that exist only for internal/behavior use (not all actions may be SDK-queueable).
- [UNKNOWN] Whether rebuild `CHANGES.md` alters any action defaults vs stock 1.6 (none observed in this folder alone).
- [INFERRED] Behaviors often bypass external messages and own action memory via BEI delegation; exact ownership rules live under `aiComponent/behaviorComponent/` (not expanded here).
