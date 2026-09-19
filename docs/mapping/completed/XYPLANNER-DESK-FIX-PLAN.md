# Plan: XYPlanner desk-path fixes

**Status:** Phases 1–7 landed 2026-09-17 (C++ + grep). Phase 8 vbuild/flash **not run here** (no docker/cmake/ninja). Human: `source setenv.sh && vbuild -t vic-engine` then vdeploy + desk A/B (G1–G3, C1, S1, E1).  
**Follow-up (2026-09-17):** Phase 5 `Error` exposed a PathComponent hang — `AbortAndSetFailure` waited for cancel of an already-finished path (`send==recv`), spamming `SentUnreceivedPath` and leaving Exploring in planning-idle. Fixed in `pathComponent.cpp` (fail immediately when not actively driving + synced; timeout no longer loops). Also restored pin-goal fallback to `_targets` when `_hasPinnedGoal` is false.  
**Goal:** Stop the live “Goal (…) is in collision, skipping / All goals are in collision, aborting” loop, stop pretending a failed search is “we arrived,” check curves where the body actually goes, and trim to a still-safe prefix instead of slam-stopping.  
**Live evidence:** robot syslog — 67× `All goals are in collision, aborting`, 201× skip of snapped `(-160, -1088)`, 27× `No path found!`. All pasted cells are 32 mm grid, **−Y**. `planning took` is **absent** because it is `LOG_INFO` on channel `Planner`, which VicOS `console_filter_config.json` does not enable (`"*": false`). Warnings always reach `/var/log/messages`.  
**Follow:** `/do` these phases in order. **One `vbuild -t vic-engine` + flash at Phase 8** (user is fine with vbuilds).  
**Out of scope:** `PathComponent::SelectPlanner` / 40 mm threshold. Short planners’ at-goal empty path. Soft-cost A* (lattice-era docs). Mutex `adopt_lock` / bidirectional iterator UB (optional follow-up). `kArtificialPlanningDelay_ms`. Radians ±180° hairpin. 128-segment cap. Editing `docs/architecture/planner.md`.

**Durable copy:** this file.

---

## Phase 0 — Documentation discovery (Allowed APIs)

### Sources consulted

- `engine/xyPlanner.cpp` / `.h` / `xyPlannerConfig.h` (full)
- `engine/pathPlanner.h` / `.cpp` — `EPlannerStatus`, `CheckIsPathSafe` contract, `_hasValidPath`
- `engine/components/pathComponent.cpp` — `UpdatePlanning` ~L526–584, `TryCompletingPath` ~L608–665, `RestartPlannerIfNeeded` ~L964–1041
- `engine/actions/driveToActions.cpp` ~L669 — `SetCanReplanningChangeGoal(!_mustUseOriginalGoal)`
- `coretech/planning/engine/geometryHelpers.h` — `ArcToBall`, `CreateArcPath`, inscribed/circumscribed
- `coretech/planning/engine/xythetaEnvironment.cpp` ~L425–465 — **prefix-fill pattern** (`PathIsSafe`)
- `coretech/planning/engine/aStar.h` — `EscapeObstaclePlanner` search
- `coretech/common/shared/math/point.h` ~L59–64 — `std::hash<Point2<T>>`
- `engine/navMap/mapComponent.cpp` ~L1368–1375 — `CheckForCollisions`
- `memoryMapData.h:47`, `memoryMapData_ProxObstacle.h:41`, `memoryMapData_ObservableObject.h:37`
- `docs/development/logging.md`, `resources/config/engine/console_filter_config.json`
- `docs/architecture/planner.md`, `docs/mapping/ENGINE-PATH-PLANNING.md`
- `test/engine/pathComponentTest.cpp` — only XYPlanner test (sync, empty map)
- `robot/include/anki/cozmo/shared/cozmoEngineConfig.h` — `ROBOT_BOUNDING_Y = 60` → radius 30 mm

### Allowed APIs / copy surfaces

| API | Source | Use |
|---|---|---|
| `GetNearestGridPoint(p, kPlanningResolution_mm)` | `xyPlannerConfig.h:83–85` | Keep; A* goals **must** stay grid-aligned |
| `FindNearestSafePoint` / `EscapeObstaclePlanner` + `AStar::Search` | `xyPlanner.cpp:416–429`, `xyPlannerConfig.h:203–226` | Copy for **goals**, not only start |
| `MapComponent::CheckForCollisions(Ball2f)` | `mapComponent.cpp:1368–1375` | Existing occupancy query |
| `Ball2f(center, kRobotRadius_mm + kPlanningPadding_mm)` | radius **33 mm** | Same disc; change **which point** it is centred on |
| `EPlannerStatus::Error` | `pathPlanner.h:35–40` | Already abort in `UpdatePlanning` L532–542 → `AbortAndSetFailure` |
| `EComputePathStatus::Error` | already used for identical retry | Keep |
| `_hasValidPath = false` | Face/Minimal/Dubbins at compute start | Copy on XYPlanner fail |
| `CheckIsPathSafe(..., validPath)` fill | `pathPlanner.h:94–97`; copy loop from `xythetaEnvironment.cpp:435–460` (`Clear` + `AppendSegment` then `return false`) | Whole-segment prefix; no intra-segment split (VIC-4315 optional) |
| PathComponent trim | **already** `pathComponent.cpp:1008–1025` | Do not rewrite consumer; fill `validPath` |
| `_replanningCanChangeGoal` / `allowGoalChange` | already plumbed | Fix `_path.Clear()` vs pin branch; no new API |
| `CreatePointTurnPath` fallback | `SmoothCorners` L537 | Already used when no safe arc |
| `IsLineSafe({tail, corner.start}, kPlanningPadding_mm)` | already on **circumscribed** branch L530–532 | Copy onto **inscribed** branch |
| `LOG_WARNING` | `xyPlanner.cpp` skip/abort/no-path | Keep for syslog; add cap-hit warning |
| `vbuild -t vic-engine` | `docs/development/build-instructions.md:52–59` | Phase 8 |

### Collision types (what the skip actually means)

`CheckForCollisions` is **hard occupancy**, not a cost: `ObstacleUnrecognized`, `Cliff`, confirmed prox (`belief > 40`), verified observable (cube). Empty/`Unknown` is not a collision.

### Why `planning took` was missing

`LOG_INFO` + channel `Planner`. VicOS filter has **no** `Planner` entry and `"*": false`. `LOG_WARNING` is not channel-filtered and **is** what you grepped. Do **not** enable the whole Planner channel (spam). Emit a **WARNING** when expansions hit `kPlanPathMaxExpansions`.

### Anti-patterns (do not)

1. Change `kMaxDistanceForShortPlanner_mm` / `SelectPlannerHelper`.
2. Use the **true** (unsnapped) pose as an A* goal — successors are 32 mm / subsampled; the search will not meet it. Snap, then **escape** like start.
3. After escaping a goal cell, `goalLookup[escaped] = original translation` if the original disc is still colliding — that glues the cube back on after a clean plan.
4. Set `CompleteNoPlan` for A* / all-skip failure (PathComponent treats that as arrived while following).
5. Change PathComponent’s `CompleteNoPlan` handler (short planners / at-goal use it).
6. Set `_planningError` (nothing else uses it; XYPlanner overrides `CheckPlanningStatus` via `_status`).
7. Call `CheckIsPathSafe` from `TryCompletingPath` for XYPlanner by flipping `ChecksForCollisions` to false.
8. Hold new mutex work in this plan.
9. Edit `docs/architecture/planner.md`.
10. Intra-segment split of long lines (VIC-4315 extra). Whole-segment prefix is enough for `TrimRobotPathToLength` / `ReplacePath`.

---

## Phase 1 — Goal skip: escape, don’t drop (live log)

**What to implement**

In `StartPlanner` (`xyPlanner.cpp:181–201`), keep snapping, **stop skipping on first overlap**.

For each target `g`:

1. `grid_g = GetNearestGridPoint(g.GetTranslation(), kPlanningResolution_mm)`.
2. If `CheckForCollisions(Ball2f(grid_g, 33 mm))` is false → current behaviour (`plannerGoals` + `goalLookup[grid_g] = true pose`).
3. If true → `safe = FindNearestSafePoint(grid_g)` (existing). If `safe` is still in collision (escape returned `p` unchanged / empty plan) → skip + same WARNING.
4. If escape moved: push `safe` as the planner goal. **Only** `goalLookup[safe.CastTo<int>()] = g.GetTranslation()` if `IsPointSafe(g.GetTranslation(), kPlanningPadding_mm)`. Otherwise plan to the free cell and **do not** append the overlapping true pose.

Log when a goal was escaped rather than skipped (`LOG_WARNING` so it hits syslog): grid point, escaped point.

If `plannerGoals` still empty → same abort, but **Phase 5** will change the status enum.

**Also in this phase:** in `PlannerConfig::StopPlanning` / after `Search()`, if `_numExpansions > kPlanPathMaxExpansions`, `LOG_WARNING("XYPlanner.StartPlanner.ExpansionCap", "expansions=%zu", ...)`. Guard the existing `planning took` divide-by-zero: if `planTime_ms.count()==0` skip the rate.

**Docs to copy:** start-side escape at L209–216 and `FindNearestSafePoint` L416–429. Do not invent a new escape class.

**Verify**

- [ ] Grep: no `continue` immediately after the goal `CheckForCollisions` without `FindNearestSafePoint`.
- [ ] `goalLookup` not written when true pose is still colliding.
- [ ] Expansion-cap WARNING exists; `planning took` rate uses `count() > 0`.

**Anti-pattern:** skipping because the **snapped** cell overlaps while a free neighbour exists.

---

## Phase 2 — Curve collision discs + inscribed joins + post-smooth check

**What to implement**

1. **`GetArcCollisionSet`** (`xyPlanner.cpp:318–320`): place disc **centres on the arc**:

   `b.GetCentroid() + Point2f(cos(rad), sin(rad)) * b.GetRadius()`  
   disc radius stays `kRobotRadius_mm + padding`.

   `nChecks = max(1, ceil(...))` so `checkLen` is never `/ 0`. Always include start and end angles.

2. **`ArcToBall`:** if `GetIntersectionPoint` returns false, treat the arc as unsafe (do not emit a circle at a junk centre). `IsArcSafe` / `CreateArcPath` callers: if ball is invalid, `safeArc = false`.

3. **`SmoothCorners` inscribed branch** (~L526–528): after `GetInscribedArc` + `IsArcSafe`, also require the same joining-line checks the circumscribed branch already has (~L530–532): `IsLineSafe({tail, corner.start})` and `IsLineSafe({corner.end, pts[i+1]})` with `kPlanningPadding_mm`.

4. **After `BuildPath` in `StartPlanner`:** `CheckIsPathSafe(_path, _start.GetAngle().ToFloat())`. If false, rebuild corners with arcs disabled (force the existing `CreatePointTurnPath` fallback for every middle turn) and `BuildPath` again. If still unsafe → empty plan (Phase 5 will mark Error). Do **not** deliver a smoothed path the grid search never occupied.

**Docs to copy:** circumscribed line checks L530–532; `CreatePointTurnPath` L537; `IsArcSafe` already used.

**Verify**

- [ ] `GetArcCollisionSet` multiplies by `b.GetRadius()`, not `kRobotRadius_mm + padding`, for the **offset**.
- [ ] Inscribed and circumscribed both call `IsLineSafe` on joins.
- [ ] `StartPlanner` calls `CheckIsPathSafe` on `_path` before `CompleteWithPlan`.

**Anti-pattern:** changing `ChecksForCollisions()` to false so PathComponent re-checks (would also change fallback semantics).

---

## Phase 3 — Do not glue a colliding start onto the path

**What to implement**

`FindNearestSafePoint` currently returns only `plan.back()`. Keep that helper for goal escape (Phase 1).

For **start** in `StartPlanner` (~L216, L236):

- Run escape as now: `plannerStart = FindNearestSafePoint(gridStart)`.
- **Do not** `plan.insert(plan.begin(), _start.GetTranslation())` if `_start` is in collision (`!IsPointSafe(_start.GetTranslation(), kPlanningPadding_mm)`).
- If start was escaped (`plannerStart` ≠ gridStart / start): prepend the **full** escape waypoint list from a new helper that returns `AStar::Search({gridStart})` (the vector already starts at the colliding cell and ends at the free cell). Then A* from `plannerStart`. Do not also prepend raw `_start`.
- If start is already free: prepend `_start.GetTranslation()` as today (true pose, not only grid).

If escape search is empty, keep current “use `p` anyway” + existing WARNING; A* may still fail (Phase 5 → Error).

**Verify**

- [ ] `plan.insert(begin, _start)` is gated on `IsPointSafe` (or equivalent).
- [ ] Escaped start uses escape waypoints, not a single jumped free cell with a colliding origin glued on.

**Anti-pattern:** returning only `plan.back()` and still inserting colliding `_start`.

---

## Phase 4 — `CheckIsPathSafe` fills the safe prefix (VIC-4315, whole segments)

**What to implement**

Replace the loop at `xyPlanner.cpp:387–392` with the lattice prefix pattern:

Copy structure from `xythetaEnvironment.cpp:435–460`:

```
validPath.Clear();
for each segment:
  if (!isSafe(seg)) return false;   // validPath already has 0..i-1
  validPath.AppendSegment(seg);
return true;
```

Do **not** split long lines. PathComponent already:

- e-stops if `_currPathSegment >= validSubPath.GetNumSegments()` (correct when prefix is empty = first segment unsafe)
- else `ReplacePath` / `TrimRobotPathToLength` (`pathComponent.cpp:1013–1025`)

On **success**, `validPath` must be the full path (today success also leaves it empty).

`startAngle` may stay unused (circular footprint). Padding 0 on this check is existing; do not change in this phase.

**Verify**

- [ ] First unsafe segment: `validPath` length == index of that segment.
- [ ] All safe: `validPath.GetNumSegments() == path.GetNumSegments()`.
- [ ] No PathComponent edits required for trim to start working.

**Anti-pattern:** returning `true` with empty `validPath`; clearing `validPath` on failure after having appended.

---

## Phase 5 — Failed search is `Error`; pin goal actually pins

**What to implement**

**5a. Status**

On “all goals in collision” (`xyPlanner.cpp:194–200`) and “No path found!” (`:257–263`):

- `_status = EPlannerStatus::Error` (not `CompleteNoPlan`)
- `_hasValidPath = false`
- keep `_planningFailed` + last start/targets (identical retry already returns `EComputePathStatus::Error`)

`PathComponent::UpdatePlanning` **already** maps `Error` → fallback if any, else `AbortAndSetFailure` → DriveToPose `PATH_PLANNING_FAILED_ABORT`. Do **not** edit the `CompleteNoPlan` branch (short planners).

**5b. Pin goal**

`InitializePlanner` clears `_path` at L147 **before** `StartPlanner` reads `_path.GetNumSegments()==0`, so `_allowGoalChange==false` never pins.

Copy this pattern (no new public API):

- Before `_path.Clear()`, if `!allowGoalChange && _path.GetNumSegments() > 0`, store end pose in a **private** `Pose2d _pinnedGoal` + `bool _hasPinnedGoal`.
- `StartPlanner`: if `!_allowGoalChange && _hasPinnedGoal`, `plannerGoals = { pinned translation snapped / escaped as Phase 1 }` only. Do not iterate `_targets`.
- `ComputePath` (fresh) sets `_hasPinnedGoal = false` (forceReplan true + new targets).

`SetMustContinueToOriginalGoal` is only used from `behaviorPlannerTest.cpp` today; still fix the dead branch — PathComponent already passes the flag.

**Verify**

- [ ] Grep `CompleteNoPlan` in `xyPlanner.cpp` — ctor only (or unused). Fail paths set `Error`.
- [ ] `_hasValidPath = false` on both fail returns.
- [ ] `_path.Clear()` no longer the condition that forces “all targets.”
- [ ] No change to `pathComponent.cpp` CompleteNoPlan handler.

**Anti-pattern:** `OnPathComplete` / `CompleteNoPlan` for boxed-in or skipped-all goals.

---

## Phase 6 — `Point2f` hash (same flash; −Y evidence)

**What to implement**

`coretech/common/shared/math/point.h:59–64`:

```cpp
return ((s64) p.x()) << 32 | ((s64) p.y());
```

Negative `y` sign-extends and **wipes `x`**. All pasted live goals were −Y. `PlannerPoint` inherits this hash. Equality is still `FLT_NEAR` (correctness of the set), but −Y buckets explode → more `No path found!` from the 100k cap.

Replace with packing two **`uint32_t` bit patterns** (memcpy/bit_cast of each component) into `uint64_t`. Do not `|` a sign-extended `s64`.

This hash is shared. The change is more unique buckets, not a new equality. Do not change `equal_to`.

**Verify**

- [ ] `operator()` does not `|` a negative `s64` `y` into `x`.
- [ ] No change to `FLT_NEAR` equality.

**Anti-pattern:** `hash = x * 31 + y` with floats; changing equality.

---

## Phase 7 — Grep / anti-pattern verification (no robot)

- [ ] `GetArcCollisionSet`: offset uses `b.GetRadius()`.
- [ ] Goal loop calls `FindNearestSafePoint` before skip.
- [ ] Failures: `_status = EPlannerStatus::Error` and `_hasValidPath = false`.
- [ ] `CheckIsPathSafe` appends before returning false.
- [ ] `nChecks` never 0; `planTime_ms.count()` guarded.
- [ ] Expansion-cap `LOG_WARNING`.
- [ ] `SelectPlannerHelper` / `kMaxDistanceForShortPlanner_mm` untouched.
- [ ] `pathComponent.cpp` CompleteNoPlan switch arm untouched.
- [ ] `docs/architecture/planner.md` untouched.
- [ ] Optional: add a comment in `docs/mapping/ENGINE-PATH-PLANNING.md` §4 that XYPlanner **hard-skips** colliding snapped goals unless escaped (Phase 1), and `CheckIsPathSafe` now fills a prefix. Do not rewrite upstream `planner.md`.

Linux host: `test_engine` is documented **MACOSX**. Do not claim gtest ran unless this environment has that target. Extending `pathComponentTest.cpp` is optional and not required to flash.

---

## Phase 8 — `vbuild` + on-robot A/B

**Build / deploy (documented)**

```bash
source setenv.sh
vbuild -t vic-engine
# then the usual vdeploy / restart vic-engine (full staging rsync; no official scp-only path)
```

**A/B checklist (desk)**

| ID | Setup | Pass |
|---|---|---|
| G1 | Same situation that spammed `(-160, -1088)` skip | Skip count drops; syslog may show **escaped** instead; robot **attempts** the drive or fails as **planning abort**, not “arrived” |
| G2 | `grep 'All goals are in collision' /var/log/messages \| wc -l` after a soak vs pre-flash 67 | Much lower for the same clutter |
| G3 | `grep ExpansionCap /var/log/messages` | Present only if a search actually hits 100k; tells timeout vs cage |
| C1 | Drive ≥ 40 mm with an object on the **outside** of a ~100 mm curve | Body does not clip; if it cannot go around, **Error** / abort, not a shoulder scrape |
| S1 | New obstacle on a **later** segment while following | Trims / keeps earlier segments; slam-stop only if the **current** segment is the unsafe one |
| E1 | Box the robot in (or block every goal) **while following** | Action `PATH_PLANNING_FAILED_ABORT` / Failed — **not** Ready / success |
| H1 | Optional: comparable long drive in **−Y** vs **+Y** | −Y no longer uniquely hits ExpansionCap |

**`planning took` still will not appear** unless channel `Planner` is enabled. Use G3 / skip / abort WARNINGs.

---

## Parked (not this plan)

| Item | Why parked |
|---|---|
| `adopt_lock` without owning the mutex | PathComponent skips replan while `_plannerActive`; latent UB |
| Bidirectional A* iterator compare / `pop_back` on empty | STL usually survives; no desk log |
| Soft obstacles in A* (cost not veto) | Different planner; docs lag |
| `kArtificialPlanningDelay_ms` | Dead console var |
| Radians wrap on >180° corners | Need a hairpin symptom first |
| `_collidable` / `SetUseProxObstaclesInPlanning` unread | Separate map bug |

---

## `/do` notes

- Phases 1–6 are C++ in `vic-engine` only. No clad.
- Phase 7 is grep.
- Phase 8 is the human `vbuild`/flash/A-B. Code phases must not run `vbuild` unless the user is in that phase.
- Do not combine mutex/iterator fixes into this `/do`.
