# Plan: leftover overhead edges → InterestingEdge (curiosity paint)

**Status:** Phase 1 **in tree**. vbuild/flash not run. Desk A not done.  

**Goal:** Restore the unused `InterestingEdge` life-cycle as a **default-off** paint of leftover camera ground-plane borders, then decide from desk tests whether to demote-on-look and let Exploring walk *near* them.  
**On-robot protocol (full):** **A** (required) → cheap **C+E** same sitting → later **D → B**.  
**Phase 1 code:** leftover paint + log + area (default off). That code is for **A**. C and E are the same flash, not extra features.  
**Phase 1 desk:** paint-off log kill → **A** → **C** and a 30s **E**. Do not drop off the table (**B**) until Phase 3. Do not hunt rugs (**D**) until Phase 2.  
**Out of scope for this plan:** new `EContentType`; edges as `IsCollisionType()`; new BehaviorID / HLAI state; splitting `AddDetectedObstacles` vs overhead (the TODO at `mapComponent.cpp:1419`); soft cliff *before* the first drop-sensor hit; personality-pack knobs.  
**Related:** `engine/navMap/README.md` · `docs/architecture/map.md` · Kinetic Familiar “notices thresholds” (charter only).  
**Durable copy:** this file. `/do` phases in order. Do not start Phase 2 until desk **A** is green (magenta line). C/E are same-session checks, not a second milestone.

---

## Desk setups (what “A–E” means)

| ID | When | Setup | Pass | Kill |
|---|---|---|---|---|
| **A** | Phase 1 **required** | Bare table, head down, **no** drop | Magenta **line** on the lip; area > 0, stable | Empty magenta with a visible lip, or a cloud |
| **C** | Phase 1, same sitting (~2 min) | Cube/charger already **red on NavMap** | Magenta **not** on the object | Magenta on a mapped cube (unmapped cube silhouette is not a kill) |
| **E** | Phase 1, same sitting (~30 s) | Open floor, no lip | Area ~0 | False borders on empty floor |
| **D** | Phase 2 | Patterned wood / rug / shadow | Area does not explode | Area climbs every frame |
| **B** | Phase 3 | After a real drop + Hough | Cliff cells appear; magenta = crumbs not a second wall | Parallel magenta wall; Hough broken |

**Trap:** the best long lips are what Hough consumes **once a cliff-sensor node exists**. Empty magenta on **B** is OK. Empty magenta on **A** is a fail.

`OverheadEdges` is **not** on in freeplay. Stock callers: `BehaviorReactToCliff` (after a drop = **B**) and console. Phase 1 **must** force `Vision.General.VisionModes` → `OverheadEdges` (same pattern as TrackLaser forcing `Lasers`). Head down so `groundPlaneVisible`.

---

## Phase 0 — Documentation discovery (Allowed APIs)

### Sources consulted

- `engine/navMap/mapComponent.{h,cpp}` — `AddVisionOverheadEdges` L1459–1613; Hough gate L1551; else-log L1607–1610; `InsertData` L1352–1365; `BroadcastMapToWeb` L755–802; `TimeoutObjects` L492–528; Flag\* L532–580; console vars L62–94; `DevProcessOneFrameForVisionEdges` / `DevDrawCliffPoses` L218–267; `_webMessageDirty` L280, L311–314 (WebViz **must request**)
- `engine/components/visionComponent.cpp` L1228–1236, L1327–1335 — `UpdateVisualObstacles` / `UpdateOverheadEdges`
- `engine/overheadEdge.h` L39 — `isBorder`
- `engine/navMap/memoryMap/memoryMapTypes.h` L37–48 — enum comments
- `engine/navMap/memoryMap/data/memoryMapData.{h,cpp}` — ctor; `CanOverrideSelfWithContent` L47–78; `IsCollisionType` L47
- `engine/navMap/iNavMap.h` L53–81 — `GetArea` / protected `Insert` / friend `MapComponent`
- `engine/navMap/memoryMap/memoryMap.cpp` L214–236 — `GetArea` (mm² = sideLen²); `Insert` applies override
- `engine/navMap/quadTree/quadTree.cpp` L32–58 — `GetContentPrecisionMM()` = **8 mm**
- `engine/navMap/quadTree/quadTreeProcessor.h` L69, L115 — `_totalInterestingEdgeArea_m2` **write-only, no getter**
- `engine/aiComponent/behaviorComponent/behaviors/exploring/behaviorExploring.cpp` L109–133, L717–719, L830–928 — both edge types already **block sampling** + **known**; prox-facing copy site
- `engine/aiComponent/behaviorComponent/behaviors/reactions/behaviorReactToCliff.cpp` L523 — `WaitForImagesAction(..., OverheadEdges)`
- `test/engine/testNavMap.cpp` L65–70 — **only** tree insert of `InterestingEdge`
- `resources/webserver/webVizModules/navMap.js` L351–352, L1451–1572 — already colors magenta/pink; extra End keys ignored today
- `resources/webserver/cvcatalog/vars/engine-hough.json`, `engine-nav-render.json` (`OverheadEdges`), `engine-vision-save-display.json` (`VisionTimeout_ms`), `cvcatalog/README.md`
- `docs/architecture/map.md` · `engine/navMap/README.md`
- Plan format: `TRACK-LASER-PLAN.md`, `SOCIAL-PRESENCE-SLICE-A-PLAN.md`

### Allowed APIs / copy surfaces

| API | Source | Use |
|---|---|---|
| `CONSOLE_VAR(bool, name, "MapComponent.VisualEdgeDetection", false)` | `mapComponent.cpp:70` (`kMergeOldMaps`); category L87–94 | Paint gate, default **off** |
| `AddVisionOverheadEdges` else of Hough gate | `mapComponent.cpp:1607–1610` | **Only** leftover insert hook for Phase 1 |
| `InsertData(region, MemoryMapData(InterestingEdge, frameInfo.timestamp))` | `mapComponent.cpp:1358–1364`; twin L556–558 | Broadcast flags via `InsertData` (do **not** copy Hough’s raw `currentMap->Insert` which skips flags) |
| `MemoryMapData(EContentType::InterestingEdge, t)` | `memoryMapData.h:36`; `ExpectsAdditionalData` false | No subclass |
| `FastPolygon({p1,p2,p3,p4})` stamp | `movementComponent.cpp:460–466` | Point → ~cell-sized quad. Precision **8 mm** |
| `INavMap::GetArea(pred)` | `iNavMap.h:55–56`; copy `GetCollisionArea` `mapComponent.cpp:1388–1394` | Interesting area **mm²**. Do not add QuadTreeProcessor getter in Phase 1 |
| `BroadcastMapToWeb` End JSON | `mapComponent.cpp:788–801` | Extra keys on existing `MemoryMapMessageVizEnd` (robot pose already there) |
| `navMap.js` `onData` End + `liveEls.meta` | L1471–1572, L135–156, L1303–1304 | Read extra keys; keep Begin/Viz/End |
| Console `OverheadEdges` | catalog `engine-nav-render.json` `OverheadEdges`; `VisionComponent::SetupVisionModeConsoleVars` | Force detector for A/C (not on in freeplay) |
| `DevProcessOneFrameForVisionEdges` / `DevDrawCliffPoses` | `mapComponent.cpp:218–267` | One-shot frame / draw cliffs (B) |
| `CanOverrideSelfWithContent` | `memoryMapData.cpp:47–78` | **Do not change.** Interesting cannot overwrite cube / unrecognized / cliff / NotInteresting |
| `IsCollisionType()` | `memoryMapData.h:47` | **Do not change.** Edges stay non-hard-collisions |
| `TimeoutObjects` + `kVisionTimeout_ms` | L77, L516–519 | Already expires both edge types at **120 s** |
| Flag\* | `mapComponent.h:87–97` | Dead; wire in **Phase 5** only |
| `SampleVisitLocationsFacingObstacle` | `behaviorExploring.cpp:830–928` | Copy in **Phase 6** only |
| Catalog shard entry shape | `engine-hough.json`; register in `cvcatalog/index.json` if new file | New var blurbs |
| `PRINT_CH_INFO("MapComponent", ...)` | existing L1608–1610 | Leftover counts even when paint off |

### Anti-patterns (do not)

1. Insert InterestingEdge on the **Hough-success** path (`L1551–1605`). That path writes `MemoryMapData_Cliff` / `isFromVision`. Leave it.
2. Change `IsCollisionType()` to include edges (planner walls / false lips).
3. New `EContentType` / `SmallInterestingEdge` / `memoryMapData_InterestingEdge` (they rejected the third type).
4. New WebViz module or new `data.type` string. Extra keys on **End** only.
5. Paint `!isBorder` chains (open floor end of ground quad — `overheadEdge.h:39`).
6. Paint **before** the ray filter (`ObstacleProx | ObstacleObservable | ObstacleUnrecognized`).
7. `currentMap->Insert` for Interesting without `InsertData` (WebViz dirty via `UpdateBroadcastFlags`; Hough cliff path is the bad example).
8. Force `OverheadEdges` in C++ / VSM as a new freeplay request in Phase 1. Console only, like TrackLaser `Lasers`.
9. Hook Exploring / HLAI / new BehaviorID in Phase 1. Exploring already **refuses to sample on** both edge types (`kTypesToBlockSampling` true) — paint-on during idle explore can starve goals if the table is all magenta. Test A **parked** + forced `OverheadEdges`.
10. Drop off the table (desk **B**) on the Phase 1 flash. Stale A magenta can sit 120 s beside a new cliff.
11. Expose `_totalInterestingEdgeArea_m2` by reaching into `QuadTreeProcessor` (private). Use `GetArea`.
12. `vbuild` / flash until the last phase is asked.
13. Enable `kPaintInterestingEdges` by default in the binary.
14. Split visualObstacles vs overhead in this plan (`AddDetectedObstacles` already calls the same fn). Phase 1 tests **OverheadEdges**, not `Obstacles`.

### Confidence / gaps

| | |
|---|---|
| **High** | No live Interesting insert except tests; Flag\* have zero callers; Hough gate; ray filter; override latch; WebViz already draws magenta; `GetArea` mm²; OverheadEdges not in freeplay; Exploring already blocks-on. |
| **Medium** | `_webMessageDirty` only on WebViz `OnWebVizData` (navMap **Update** / 5 s auto). Paint will show after Update, not instantly. Stamp size 16 mm is a guess (2× 8 mm cell). |
| **[UNKNOWN until A]** | Whether leftover `validPoints` on a bare lip are a **line** or noise. If ~0, stop — do not build Phases 2–6. |
| **Phase 6 gap** | `FindContentIf` returns data ptrs **without** node centers. Interesting has no pose subclass. Phase 6 must add a Fold/centers helper copying `MemoryMap::GetArea` (`memoryMap.cpp:214–222`), not pretend Prox `GetObservationPose` exists. |

---

## Implementation vs desk map

| Impl phase | Desk | Code |
|---|---|---|
| **1** | **A** (then C+E same sitting) | Log leftover counts; paint leftover in Hough-gate **else**, default off; area + counts on End JSON; catalog; tiny navMap meta |
| **2** | **D** | Skip short/noisy leftover (reuse `kHoughMinLineLength_mm` / `kHoughAccumThreshold`) |
| **3** | **B** | Verify Hough untouched; policy for stale magenta after a drop |
| **4** | **E** | Checklist; code only if A–D leaked false borders |
| **5** | (latch) | Wire dead Flag\* — demote on look |
| **6** | (explore) | 1–2 Exploring poses *near* magenta |
| **7** | grep / tests / docs | |
| **8** | `vbuild`/flash | User-gated |

---

## Phase 1 — Desk A (C+E same sitting): leftover paint, default off

### What to implement

Copy existing patterns. Do not invent types.

1. **Console vars** next to `mapComponent.cpp:87–94`:
   ```cpp
   CONSOLE_VAR(bool,  kPaintInterestingEdges,     "MapComponent.VisualEdgeDetection", false);
   CONSOLE_VAR(float, kInterestingEdgeStamp_mm,   "MapComponent.VisualEdgeDetection", 16.f);
   ```
   Copy `CONSOLE_VAR(bool, kMergeOldMaps, "MapComponent", false)` at L70.

2. **Always log** at the end of `AddVisionOverheadEdges` (paint on or off), same channel as L1608:
   - border point count, ray-dropped count, `validPoints.size()`, `cliffNodes.size()`, `houghAttempted` (`validPoints.size() >= kHoughAccumThreshold && cliffNodes.size() > 0`), `houghOk` if attempted.

3. **Paint only in the Hough-gate `else`** (`mapComponent.cpp:1607`) when `kPaintInterestingEdges`. That is: **no cliff nodes and/or too few points** — desk **A**. Do **not** paint when the gate passes (even if `RefineNewCliffPose` fails).

   For each leftover `validPoints[i]`, copy the 4-point stamp from `movementComponent.cpp:460–466`:
   axis-aligned square, half-side = `0.5f * kInterestingEdgeStamp_mm`, then:
   ```cpp
   InsertData(FastPolygon({p1,p2,p3,p4}),
              MemoryMapData(EContentType::InterestingEdge, frameInfo.timestamp));
   ```
   `Insert` already runs `CanOverrideSelfWithContent` → will **not** overwrite cube / charger / cliff.

4. **Area + debug on existing End packet** — copy `GetCollisionArea` (`mapComponent.cpp:1388–1394`) inside `BroadcastMapToWeb` End block L788–801:
   ```cpp
   toWeb["interestingEdgeArea_mm2"] = currentMap->GetArea(
     [](const auto& data){ return data->type == EContentType::InterestingEdge; });
   ```
   Also attach the last-frame counts from (2) as extra numeric keys (`edgeValid`, `edgeRayDropped`, `edgeHoughAttempted`, …). **Do not** add a new `type`.

   Need `GetCurrentMemoryMap()` in `BroadcastMapToWeb` (already has `_robot`). If map is null, omit keys.

5. **navMap.js** — on `MemoryMapMessageVizEnd` (`L1471+`), if `typeof data.interestingEdgeArea_mm2 === 'number'`, put it in `liveEls.meta` **with** the packet count (today L153–155 is only `N pkt`). Unknown keys stay ignored if missing (old engine).

6. **Catalog** — add `PaintInterestingEdges` + `InterestingEdgeStamp_mm` to `resources/webserver/cvcatalog/vars/engine-hough.json` (same category `MapComponent.VisualEdgeDetection`). Copy entry shape from `HoughAccumThreshold`. `status: live`. `howTo`: force `OverheadEdges`, head down, enable paint, NavMap Update. Do **not** create a new shard unless the file blows up; `index.json` already lists `engine-hough.json`.

### Doc references

- Hook: `mapComponent.cpp:1543–1610`
- Insert twin: L556–558 `NotInterestingEdge`
- Override: `memoryMapData.cpp:47–57`
- WebViz End: `mapComponent.cpp:788–801` · JS L1471–1572, L351
- Force mode: catalog `OverheadEdges` howTo in `engine-nav-render.json`
- Precision: `quadTree.cpp:54–58` = 8 mm

### On-robot (Phase 1 flash — A required)

Gate **off** in the binary. After flash. Robot parked. About 15 minutes.

1. Open `:8888` NavMap (subscribe). Console: `OverheadEdges` = true. `PaintInterestingEdges` = **false**. Head down.
2. **Kill test:** log `MapComponent` leftover count on a bare lip. If ~0 → **stop**. Do not turn paint on.
3. **A (required):** `PaintInterestingEdges` = true. NavMap **Update**. Magenta **line** on the lip. Area > 0, stable.
4. **C (~2 min):** wait until cube/charger is **red on NavMap**, then check magenta is not on it. Unmapped silhouette ≠ fail.
5. **E (~30 s):** point at empty floor. Area ~0.
6. Paint **off** → no new magenta (old cells last up to 120 s).

Do **not** drive off the table. Do **not** run Exploring with paint on.

### Verification checklist

- [ ] `rg kPaintInterestingEdges engine/navMap/mapComponent.cpp` — default `false`.
- [ ] `rg InterestingEdge engine/navMap/mapComponent.cpp` insert only inside Hough-gate `else` + `kPaintInterestingEdges`.
- [ ] Hough success block L1551–1605 **unchanged** (no Interesting insert).
- [ ] `rg IsCollisionType engine/navMap/memoryMap/data/memoryMapData.h` still Cliff + ObstacleUnrecognized only.
- [ ] `BroadcastMapToWeb` End still `type == MemoryMapMessageVizEnd`; new keys additive.
- [ ] `navMap.js` still handles Begin/Viz/End; no new `data.type`.
- [ ] Catalog keys `PaintInterestingEdges`, `InterestingEdgeStamp_mm` (UI strips `k`).
- [ ] **A (required):** magenta line + area > 0.
- [ ] **C:** no magenta on a **mapped** cube/charger.
- [ ] **E:** empty floor area ~0.
- [ ] Paint off: log still prints counts; no new magenta.

### Anti-pattern guards

- Do not request `VisionMode::OverheadEdges` from MapComponent every tick.
- Do not paint in `AddDetectedObstacles` separately — shared fn is enough; don’t enable `Obstacles` mode for A/C.
- Do not set `_webMessageDirty` on every insert (would spam WebViz). Keep request-driven Update.
- Do not treat area units as m² (`GetArea` is mm²). Label `interestingEdgeArea_mm2`.

### Go / no-go after Phase 1

**Go to Phase 2** if **A** is a magenta line. C/E are sanity, not a second milestone.  
**Stop** if A is empty or a speckle cloud. Leave the var off. C fail on a *mapped* cube = fix rays/override, not more paint.

---

## Phase 2 — Desk D: speckle filter

### What to implement

Do not add a third content type. Reuse existing knobs.

Before the per-point stamp in the Hough-gate `else`:

- If `validPoints.size() < kHoughAccumThreshold` (already **20**) → log, do not paint.
- If axis-aligned bounding-box extent of `validPoints` (max side in mm) `< kHoughMinLineLength_mm` (already **40**) → log, do not paint.

Copy the “too small → Unknown not NotInteresting” *intent* from `FlagInterestingEdgesAsUseless` comment (`mapComponent.cpp:564–567`) but **skip insert** rather than wiping the whole map.

Optional: `CONSOLE_VAR(bool, kPaintInterestingEdgesRequireLine, "MapComponent.VisualEdgeDetection", true)` default true so A/C can still be re-run with it off if the line gate is too strict.

Catalog: one extra blurb or mention in `PaintInterestingEdges` detail. Related: `HoughMinLineLength_mm`, `HoughAccumThreshold`.

### Doc references

- `kHoughAccumThreshold` L88, used L1551
- `kHoughMinLineLength_mm` L89
- Useless-edge comment L564–567

### On-robot (D)

Patterned wood / rug / hard shadow. Paint on, line gate on. Area must not explode. A (bare lip) must still pass.

### Verification

- [ ] D: no map-full of magenta; area not monotonically climbing every Update.
- [ ] A still a line with the same gate.
- [ ] Still no Hough-path edits.

### Anti-pattern guards

- Do not call `FlagInterestingEdgesAsUseless()` map-wide from the vision tick (wipes all Interesting every frame).
- Do not invent `SmallInterestingEdge`.

---

## Phase 3 — Desk B: Hough coexistence

### What to implement

Phase 1 already **does not paint** when the Hough gate passes. B is mostly **verification**.

Add only if A-magenta **survives beside** a new cliff as a parallel wall:

- After successful `RefineNewCliffPose` + cliff `Insert` (L1571–1604), `TransformContent` Interesting → empty inside a padded poly around the vision cliff strip (copy `FlagGroundPlaneROIInterestingEdgesAsUncertain` transform L543–548, but region = the same FastPolygon as the cliff insert, optionally grown by `kVisionCliffPadding_mm`).
- Use `UpdateBroadcastFlags` on that transform (Hough cliff insert currently **skips** flags — do not copy that quirk for the wipe).

If crumbs are small, **do nothing** — 120 s timeout is enough.

### Doc references

- Cliff insert poly L1599–1604
- ROI wipe transform L543–548
- `DevDrawCliffPoses` L229–264
- `EnableVisualCliffExtension` / ReactToCliff catalog `engine-cliff-drive.json`

### On-robot (B)

Keep `OverheadEdges` on. One real drop (or `ReactToCliff` visual extend). `DevDrawCliffPoses`. NavMap: black/cliff cells along the lip. Magenta not a second wall. Planner still avoids the cliff (`IsCollisionType` unchanged).

### Verification

- [ ] `git diff` on L1551–1605 is empty **except** optional post-success Interesting wipe.
- [ ] B: cliff extend still happens; magenta is crumbs or gone.
- [ ] C still true (cube not magenta).

### Anti-pattern guards

- Do not replace vision-Cliff with Interesting.
- Do not run B on the Phase 1 flash as the first test.

---

## Phase 4 — Desk E: open floor quiet

### What to implement

**Checklist first.** `!isBorder` is already skipped (L1527–1535). If E is quiet after 1–3, **no code**.

If false magenta on empty floor: require `foundBorder` chains only (already) **and** Phase 2 line gate. Last resort: do not paint unless `groundPlaneValid` (already required by `ProcessVisionOverheadEdges` L1401).

### On-robot (E)

Head down on open floor, no table lip, no objects. Area ~0 after Update.

### Verification

- [ ] E quiet.
- [ ] A still works (don’t over-filter).

### Anti-pattern guards

- Do not disable OverheadEdges globally to “fix” E.

---

## Phase 5 — Demote on look (wire dead Flag\*)

**Do not start until A, C, D, B, E are green.**

### What to implement

Copy existing bodies; add **callers**.

1. When `kPaintInterestingEdges` and OverheadEdges processed a frame with `groundPlaneValid`: call `FlagGroundPlaneROIInterestingEdgesAsUncertain()` **before** leftover paint so a new look can land (comment at `mapComponent.h:85–87`). That wipes Interesting in the ground quad to empty, then paint re-stamps still-visible leftover.

2. Demote, not wipe, for “I was here”: if the robot bounding quad (`UpdateRobotPose` already inserts `ClearOfObstacle` on the robot quad L480–483) overlaps Interesting, call `FlagQuadAsNotInterestingEdges(robotQuad)` so those cells become **pink** (NotInteresting). Override: NotInteresting **only** overwrites Interesting (`memoryMapData.cpp:73–78`).

Keep both behind `kPaintInterestingEdges` so paint-off is still stock.

Do **not** call `FlagInterestingEdgesAsUseless()` every tick.

### Doc references

- `mapComponent.h:85–97` comments
- Flag bodies L532–580
- Robot quad insert L477–483

### Verification

- [ ] `rg FlagQuadAsNotInterestingEdges` / `FlagGroundPlaneROI` have callers outside the definition.
- [ ] NavMap: magenta → pink (or gone) under/in front of the robot after a look; does not immediately re-paint as Interesting on the same cells (latch).
- [ ] Cubes/cliffs still not overwritten.
- [ ] Paint off: Flag\* not called.

### Anti-pattern guards

- Do not allow Interesting to overwrite NotInteresting (breaks the latch).
- Do not demote the whole map.

---

## Phase 6 — Exploring: 1–2 poses *near* magenta

**Do not start until Phase 5 latch works** (otherwise he loops the same lip).

### What to implement

Copy `SampleVisitLocationsFacingObstacle` (`behaviorExploring.cpp:830–928`) + call site L717–719.

Gaps to fill (do not invent Prox fields on Interesting):

1. **Centers:** add `INavMap` / `MemoryMap` helper copying `GetArea`’s `_quadTree.Fold` (`memoryMap.cpp:214–222`) that appends `node.GetCenter()` when `data->type == InterestingEdge`. Public via `MapComponent` or Exploring’s existing `GetCurrentMemoryMap()`.
2. Constants next to `kNumProxPoses` L102: `kNumInterestingEdgePoses = 1`, offset/min/max mirroring L63–65 (`kProxPoseOffset_mm` 120, min 100, max 750).
3. Pose: at center, facing away from robot (or toward the cluster from the robot), then `TranslateForward(-offset)` so the footprint is **not on** the cell (`kTypesToBlockSampling` already true L118–119).
4. Call from `SampleVisitLocations` under the same `!tooFarFromCharger` gate, **after** open-space, **in addition to** prox poses.
5. Gate with `kPaintInterestingEdges` **or** a new Exploring console bool default false (`CONSOLE_VAR` in `behaviorExploring.cpp` already has `kMoveLiftAboveProx`). Prefer Exploring-local bool default false so paint-on NavMap tests don’t change freeplay until this phase is on.

Do **not** add a BehaviorID. Do **not** change HLAI JSON. Do **not** change FindHome/PlaceCube arrays (already block-on).

### Doc references

- `behaviorExploring.cpp:63–65, 102–133, 675–721, 830–928`
- `behaviorExploring.h:107–111`
- Fold copy: `memoryMap.cpp:214–222`

### On-robot

Paint on, Exploring-local poses on, idle HighLevelAI. He sometimes approaches a lip, looks, Phase 5 pinks it, then **leaves**. He can still plan (edges not `IsCollisionType`). FindHome on a table that is not 100% magenta still samples.

### Verification

- [ ] No new `BehaviorClass` / `generateBehaviorCode.py`.
- [ ] `kTypesToBlockSampling` unchanged (still true for both edges).
- [ ] Exploring-local flag default **false**.
- [ ] One approach then move-on (latch), not a magenta moat.
- [ ] Planner does not stick (`IsCollisionType` unchanged).

### Anti-pattern guards

- Do not `MemoryMapDataCast<MemoryMapData_ProxObstacle>` on Interesting.
- Do not sample **on** the cell (blocked + looks like driving off).
- Do not enable this on the Phase 1 flash.

---

## Phase 7 — Verification (grep / tests / docs)

### What to implement

- Optional: extend `test/engine/testNavMap.cpp` — insert Interesting over a cube-sized ObstacleObservable region and assert cube type **remains** (override). Copy existing insert L65–70 + AnyOf asserts.
- Plan Status banner → which phases are in tree.
- `engine/navMap/README.md` one line: leftover paint is console-gated; Hough still writes Cliff. Do **not** rewrite `docs/architecture/map.md` (upstream).
- AGENTS.md §6/§7 already pointed here from the plan-writing session; refresh Status if phases landed.

### Verification

- [ ] `rg kPaintInterestingEdges` default false.
- [ ] `rg IsCollisionType engine/navMap/memoryMap/data/memoryMapData.h` unchanged.
- [ ] No new clad enum.
- [ ] No new webViz module in `webviz/js/config.js`.
- [ ] Flag\* have callers only if Phase 5 landed.
- [ ] Exploring pose helper only if Phase 6 landed.

### Anti-pattern guards

- Do not “improve” upstream `docs/architecture/map.md`.
- Do not run `vbuild` here.

---

## Phase 8 — Build / flash (user-gated)

**Do not start until asked.**

```text
source setenv.sh
vbuild -t vic-engine
```

Flash `vic-engine` only. Then:

1. Paint **off** smoke: stock NavMap, no magenta, Hough/ReactToCliff still works if you already trust B from a later tree.
2. Phase 1 on-robot: log kill → **A** → C+E (force `OverheadEdges`).
3. Only then D → B → E as later phases exist in the binary.

Do not run `setenv.sh` / `vbuild` in a docs-only `/do` of Phases 1–7 if the user did not ask to flash.

---

## Suggested `/do` chunking

| Chunk | Phases | Notes |
|---|---|---|
| 1 | 1 | A paint + log + area. Default off. Desk: log kill → A → C+E. **No vbuild** unless asked to jump to 8. |
| 2 | 2 | D speckle. Needs Phase 1 in tree. |
| 3 | 3–4 | B policy if needed; E checklist. |
| 4 | 5 | Demote. After A–E green. |
| 5 | 6 | Exploring poses. After latch. |
| 6 | 7–8 | Grep + flash when asked. |

**First ship that can decide the whole bet:** Chunk 1 + Phase 8 A/C. If A is junk, never do 2–6.
