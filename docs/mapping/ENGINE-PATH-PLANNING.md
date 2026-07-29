# Engine path planning (drive-to-pose)

**Path:** `docs/mapping/ENGINE-PATH-PLANNING.md`  
**Mapped:** 2026-07-28   **Confidence:** high (selection + planner inventory); medium (full replan edge cases)  
**Upstream docs:** [`docs/architecture/planner.md`](../architecture/planner.md), [`docs/architecture/map.md`](../architecture/map.md), [`docs/architecture/actions.md`](../architecture/actions.md), [`docs/architecture/poses.md`](../architecture/poses.md)

How Vector plans a path from A to B and executes it: action → `PathComponent` → selected `IPathPlanner` → motion profile → doling to `vic-robot` path follower.

---

## 1. End-to-end flow

1. Behavior (or helper) starts a **`DriveToPoseAction`** (`engine/actions/driveToActions.*`) — or an action that embeds one — with one or more goal `Pose3d`s.
2. Action calls **`PathComponent::PrecomputePath` / `StartDrivingToPose`** (`engine/components/pathComponent.*`).
3. `PathComponent::SelectPlanner` picks a planner from distance/angle heuristics (§3).
4. Selected planner’s `ComputePath` runs (sync for short planners; **thread** for `XYPlanner`).
5. On complete: `TryCompletingPath` applies **`IPathPlanner::ApplyMotionProfile`**, safety-checks with the long planner if needed, then **`ExecutePath`**.
6. **`PathDolerOuter`** (`engine/pathDolerOuter.*`) sends path segments to the robot process in chunks (robot memory limit: `MAX_NUM_PATH_SEGMENTS_*` in `coretech/planning/shared/path.h`).
7. Robot process **`pathFollower`** (`robot/supervisor/src/pathFollower.*`) tracks segments; R2E `pathFollowingEvent` updates status.
8. While following, long planner can **`ComputeNewPathIfNeeded`** (replan around new obstacles). Short planners that fail obstacle checks fall back to long (§3).

Driving animations / planning wait anims: action + `DrivingAnimationHandler` (see upstream `planner.md`); speeds from custom profile or **`SpeedChooser`** (`engine/speedChooser.*`).

---

## 2. `PathComponent` (orchestrator)

| Item | Detail |
|---|---|
| Class | `PathComponent` — `RobotComponentID::PathPlanning` |
| Files | `engine/components/pathComponent.h` / `.cpp` |
| Init deps | `CozmoContextWrapper` |
| Update deps | `AIComponent`, `ActionList` (runs after AI/actions decide) |
| Owns | `_speedChooser`, `_pdo` (`PathDolerOuter`), three planner slots + selected/fallback |

**Status machine** (`ERobotDriveToPoseStatus`): `Ready` · `ComputingPath` · `WaitingToBeginPath` · `FollowingPath` · `Failed` · `WaitingToCancelPath` · `WaitingToCancelPathAndSetFailure`.

**Public surface (consumers use these):**  
`StartDrivingToPose`, `PrecomputePath`, `IsPlanReady`, `IsActive`, `IsReplanning`, `Abort`, `ExecuteCustomPath`, `IsPathSafe`, motion-profile set/clear, path ID segment getters for debug.

**Plan parameters** (`PlanParameters` in `pathComponent.cpp`): start = robot **drive-center** pose; goals converted via `Robot::ComputeDriveCenterPose`; all share a pose-origin ID (origin change → `RejiggerTargetsAndReplan`).

---

## 3. Planner selection (confirmed)

Init (`PathComponent` ctor + `InitDependent` ~L97–128):

| Slot | Concrete type | Name string |
|---|---|---|
| `_shortPathPlanner` | `FaceAndApproachPlanner` | `"FaceAndApproach"` |
| `_shortMinAnglePathPlanner` | `MinimalAnglePlanner` | `"MinimalAngle"` |
| `_longPathPlanner` | `XYPlanner` (or short planner if no data platform / unit tests) | `"XYPlanner"` |

**`SelectPlannerHelper`** (`pathComponent.cpp` ~L712–770), distance in XY of root poses:

| Condition | Selected | Fallback |
|---|---|---|
| `dist² ≥ (40 mm)²` (`kMaxDistanceForShortPlanner_mm`) | `_longPathPlanner` (`XYPlanner`) | none |
| short + final heading within `2 * PLANNER_MAINTAIN_ANGLE_THRESHOLD` + large initial turn + `dist² > (1 mm)²` | `_shortMinAnglePathPlanner` | `_longPathPlanner` |
| other short | `_shortPathPlanner` | `_longPathPlanner` |

Closest goal among multi-goal list is chosen with `IPathPlanner::ComputeClosestGoalPose` for *selection only* (planner may still pick another goal by cost).

**After short plan completes:** if planner does **not** check collisions and path is unsafe under `_longPathPlanner->CheckIsPathSafe`, `ReplanWithFallbackPlanner()` restarts with long planner (`pathComponent.cpp` ~L640–664). Comment still says “lattice planner”; code path is `XYPlanner`.

**Not selected at runtime:** `DubbinsPlanner` (`engine/dubbinsPathPlanner.*`) implements `IPathPlanner` but is **never constructed** by `PathComponent` [CONFIRMED grep].

---

## 4. Engine-root planners (`IPathPlanner`)

Interface: `engine/pathPlanner.h` — `ComputePath` / `ComputeNewPathIfNeeded` / `CheckPlanningStatus` / `CheckIsPathSafe` / `ApplyMotionProfile` / `GetCompletePath`. Status enums: `EComputePathStatus`, `EPlannerStatus`.

| Class | File | What it produces | Obstacles |
|---|---|---|---|
| **`XYPlanner`** | `engine/xyPlanner.*`, `xyPlannerConfig.h` | 2D grid A* path, smoothed to lines+arcs; optional worker thread | Yes — `MapComponent` soft obstacles |
| **`FaceAndApproachPlanner`** | `engine/faceAndApproachPlanner.*` | Point-turn → straight → final point-turn | No (default safe) |
| **`MinimalAnglePlanner`** | `engine/minimalAnglePlanner.*` | Backup then face/drive/turn (docking-friendly) | No |
| **`DubbinsPlanner`** | `engine/dubbinsPathPlanner.*` | Dubins curve path | No — **unused by PathComponent** |

**`XYPlanner` internals (engine + coretech):**

- Grid resolution **32 mm** (`kPlanningResolution_mm` in `xyPlannerConfig.h`); 4-connected successors; max expansions `kPlanPathMaxExpansions = 100000`.
- Search: **`BidirectionalAStar<PlannerConfig>`** (`coretech/planning/engine/bidirectionalAStar.h`) — early exit on infeasible goals.
- Config pulls collision cost from **`MapComponent`** (`engine/navMap/mapComponent.*`).
- Path build: waypoints → `SmoothCorners` → `Planning::Path` segments (`PST_LINE` / `PST_ARC` / `PST_POINT_TURN` in `coretech/planning/shared/path.h`).
- Drawback (upstream + code): 2D only — start/end headings handled by point turns after smoothing, not in the search state.

---

## 5. `coretech/planning/` vs engine root

| Layer | Path | Role in production drive-to-pose |
|---|---|---|
| **Shared path geometry** | `coretech/planning/shared/path.*`, `goalDefs.h` | Segment list, Dubins enums, segment limits for robot vs basestation |
| **A* primitives (used)** | `coretech/planning/engine/aStar.h`, `bidirectionalAStar.h` | Grid search used by `XYPlanner` via `xyPlannerConfig.h` |
| **Lattice / xyθ (legacy)** | `xythetaPlanner.*`, `xythetaEnvironment.*`, `xythetaActions.*`, `xythetaStates.*`, motion prims | **Not referenced from `engine/`** [CONFIRMED]. Upstream `planner.md`: “We no longer use a lattice A* planner.” Tools/matlab under `coretech/planning/{tools,matlab}` still support mprim authoring |
| **Helpers / tests** | `pathHelper.*`, `openList.*`, `stateTable.*`, `test/`, `tools/` | Library support + standalone tests; not PathComponent |

CMake target: `cti_planning` (`coretech/planning/CMakeLists.txt`) with `CORETECH_ENGINE`.

---

## 6. Related pieces

| Piece | Path | Role |
|---|---|---|
| Drive-to action | `engine/actions/driveToActions.*` | Status polling, precompute + planning anims, multi-goal |
| Custom path action | `engine/actions/drivePathAction.*` | `ExecuteCustomPath` — skip planning |
| Path doling | `engine/pathDolerOuter.*` | Engine→robot segment streaming |
| Speed profile | `engine/speedChooser.*`, CLAD `PathMotionProfile` | Distance-based speed/accel; cliff/carry clamp in PathComponent |
| Map obstacles | `engine/navMap/` | Soft obstacles for XYPlanner |
| Robot follow | `robot/supervisor/src/pathFollower.*` | Low-level path execution |

---

## 7. Open questions

- [UNKNOWN] Exact numeric value of `PLANNER_MAINTAIN_ANGLE_THRESHOLD` (macro; used in selection, not redefined in `pathComponent.cpp`).
- [UNKNOWN] Full matrix of when `ComputeNewPathIfNeeded` forces replan vs keeps path (map change thresholds live in `XYPlanner` + map).
- [INFERRED] Lattice code retained for tests/tools and historical Cozmo parity, not runtime.

---

## Related mapping docs

- `docs/architecture/planner.md` — product-level narrative (prefer link over restating)
- `docs/mapping/ENGINE-ROBOT-TICK.md` — PathComponent update order vs AI/actions
- `engine/components/README.md` — PathComponent among Robot components
- `engine/navMap/README.md` — map feeding the long planner
- `engine/actions/README.md` — DriveToPose in action system
