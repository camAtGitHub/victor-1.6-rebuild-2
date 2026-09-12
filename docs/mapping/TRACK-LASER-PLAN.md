# Plan: TrackLaser — dots, then chase, then pounce

**Status:** Phase 1 **FoundCentroid live** on `192.168.50.189` (wide console; snapshot `LASER-CONSOLE-SNAPSHOT.md`). Phases 2–3 **in tree**. **Not flashed** (Phase 5). Observing not hooked.  
**Source:** `EASINESS-RANKING.md` #1/#3 · `KERCRE123-RESTORE-CANDIDATES.md` §1 · `WHY-ANKI-DELETED.md` TrackLaser  
**Goal:** On a real robot, a red or green laser on the **floor** produces `RobotObservedLaserPoint` (Phase 1), then restoring `BehaviorTrackLaser` makes Vector look down, confirm by darkening AE, track, pounce, back up (Phases 2–4).  
**Out of scope for v1:** voice command, Observing/HLAI default hook, un-deprecating clad trigger names, retuning for Xray software WB, `PounceWithProx`, singing/chirps.  
**Related (separate):** `PounceWithProx` is ToF, not this. Color salient points are `BrightColors`, not lasers.

**Durable copy:** this file. Execute later with `/do` against these phases in order. **Do not start Phase 2 until Phase 1 checklist is green on hardware.**

---

## Git archaeology — copy the class, not the 2018 world

| SHA | What |
|---|---|
| `3394f1c36c` COZMO-13881 | `features.json` Laser true→false only. Detector kept. |
| `db9431edc0` VIC-6880 | Deletes `behaviorTrackLaser.{h,cpp}` as a **dangling** class. `TrackGroundPointAction` + `laserPointDetector` **kept**. |
| `e1efbfe3c2` VIC-8027 | Laser *petting sounds* on RC banks — audio, ignore. |

**Copy C++ from** `db9431edc0^:engine/aiComponent/behaviorComponent/behaviors/freeplay/userInteractive/behaviorTrackLaser.{h,cpp}` (Andrew Stein, 2017-03-11). Namespace is already `Anki::Vector`.

JSON: last instance that matches the **graph key** is spark  
`git show 1dc59d4382:resources/config/engine/behaviorSystem/behaviors/freeplay/sparkable/sparksTrackLaser.json`  
(freeplay `trackLaser.json` died 2017-09-27 `77c821b` with obsolete `maxTimeSinceNoLaser_ms`). Copy spark numbers; **drop** `executableBehaviorType`, `needsActionID`, `displayNameKey`. Keep `alwaysStreamline` only if you want force-search without a prior dot.

---

## Phase 0 — Documentation Discovery (Allowed APIs)

### Sources consulted

- Leak header/cpp at `db9431edc0^` (full class API, JSON keys, exposure, anims, `TrackGroundPointAction`)
- `engine/vision/laserPointDetector.h` `Detect(...)` · `.cpp` L245–355 (ground plane early-out, `RobotObservedLaserPoint` ctor)
- `engine/vision/visionSystem.cpp` L1888–1902 (mode **and** `FeatureType::Laser`)
- `engine/vision/visionSystem.cpp` L1060–1069 (`isDarkExposure` = min exposure **and** min gain)
- `engine/actions/trackGroundPointAction.h` L37 / `.cpp` L42–48 (`RobotObservedLaserPoint` → `VisionMode::Lasers` High)
- `engine/components/visionComponent.h` L282–291 · `.cpp` L2364–2386 (`SetAndDisableCameraControl` also kills WB)
- `clad/src/clad/types/featureGateTypes.clad` `Laser` · `resources/config/features.json` L6–8 `"enabled": false`
- `clad/src/clad/types/visionModes.clad` `Lasers`, `Stats` (leak used `ComputingStatistics` — **renamed**)
- `clad/src/clad/externalInterface/messageEngineToGame.clad` L178–182 `RobotProcessedImage.mean` valid iff Stats
- `coretech/vision/clad_src/clad/types/cameraParams.clad` L7–16 five fields (exposure, gain, WB RGB)
- `resources/assets/cladToFileMaps/AnimationTriggerMap.json` `DEPRECATED_Laser*` + `DEPRECATED_LookDownForLaser`
- `docs/architecture/behaviors.md` L30–32, L54–71 (`generateBehaviorCode.py`, Webots Shift+C)
- `docs/architecture/visionSystem.md` L30 names Laser Point Detection only
- Gaze pattern for activatable vision: `behaviorReactToGazeDirection.cpp` L336–339
- `iCozmoBehavior.h` L356–357 `AlwaysHandleInScope(EngineToGameEvent)` still exists
- Catalog: `resources/webserver/cvcatalog/vars/engine-vision-motion-laser.json` (`Lasers`, `LaserDetectionDebug`, `Laser_DrawDetectionsInCameraView`)
- `test/engine/testVisionSystem.cpp` ~L714 already constructs `RobotObservedLaserPoint` lists

### Allowed APIs / touch surfaces

| API | Source | Use |
|---|---|---|
| `FeatureType::Laser` + `features.json` `"Laser"` | `featureGateTypes.clad`, `features.json` L6–8 | Product gate. Detector is a no-op while false. |
| Console `Lasers` | catalog `Vision.General.VisionModes` | Force `VisionMode::Lasers` when no behavior is requesting it (Phase 1). |
| `Laser_DrawDetectionsInCameraView`, `LaserDetectionDebug` {0,1,2} | `laserPointDetector.cpp` L63–68 | Viz / debug images. |
| `LaserPointDetector::Detect` | `.h` L50–60 | Do **not** rewrite. |
| `TrackGroundPointAction(MessageEngineToGameTag::RobotObservedLaserPoint)` | `trackGroundPointAction.h` L37 | Tracking + requests Lasers High. |
| `VisionComponent::SetAndDisableCameraControl(const CameraParams&)` | `visionComponent.h` L284 | Darken to confirm. Also disables AE **and WB**. |
| `EnableAutoExposure` / `EnableWhiteBalance` / `GetCurrentCameraParams` | `visionComponent.h` L282–291 | Cleanup must restore **both**. |
| `AlwaysHandleInScope(const EngineToGameEvent&)` | `iCozmoBehavior.h` L357 | Subscribe to `RobotObservedLaserPoint` + `RobotProcessedImage` while in scope. |
| `modifiers.visionModesForActivatableScope` / `ForActiveScope` | gaze.cpp L336–339 | **Must** request `Lasers` (+ `Stats` for mean) or WantsToBeActivated never sees dots. Leak header did **not** set this — add it. |
| `BehaviorClass::TrackLaser` via `./tools/ai/generateBehaviorCode.py` | `behaviors.md` L54–71 | Do not hand-edit `behaviorClasses.clad` / `behaviorIDs.clad` / factory. |
| `TriggerAnimationAction` / `TriggerLiftSafeAnimationAction` + `AnimationTrigger::DEPRECATED_Laser*` | leak cpp ~L552–721; map JSON | Keep DEPRECATED names. Map already points at `ag_laser_*` / `ag_pounce*`. |
| `GetBEI().GetRobotInfo().GetContext()->GetFeatureGate()->IsFeatureEnabled(FeatureType::Laser)` | leak cpp L179; exploring.cpp L226 for live pattern | `WantsToBeActivatedBehavior`. |
| Webots `behaviorName` + Shift+C | `behaviors.md` L32 | Force-run by BehaviorID. |

### Anti-patterns (do not)

1. Invent `VisionMode::ComputingStatistics` — it is **`Stats`** now (`visionModes.clad` L21).
2. Construct `CameraParams` with only exposure+gain (5 fields; WB must copy from `GetCurrentCameraParams()` or you pin R/G/B to 0).
3. `EnableAutoExposure(true)` on cleanup **without** `EnableWhiteBalance(true)` — `SetAndDisableCameraControl` turned both off (`visionComponent.cpp` L2373–2376).
4. Enable Laser gate and assume the detector runs — **nobody** currently requests `VisionMode::Lasers` except `TrackGroundPointAction`. Phase 1 needs console `Lasers`. Phase 2+ needs activatable-scope request.
5. Hook into Observing/HLAI in v1 (fights `PounceWithProx` / motion; mapping already said force-run first).
6. Confuse with `PounceWithProx` or `BrightColors`.
7. Cherry-pick VIC-6880 inverse / whole 2018 tree.
8. Hand-edit BehaviorClass/ID CLAD instead of `generateBehaviorCode.py`.
9. Un-deprecate clad names in v1 — play `DEPRECATED_*`; map already works.
10. Claim `ag_laser_*` files exist on disk without checking animation-assets DEPS (map row ≠ asset).
11. Run `vbuild` / flash until the user asks (Phase 5).
12. Darken AE while docking/carrying (leak already refuses `WantsToBeActivated` in those cases — keep that).

### Confidence / gaps

| | |
|---|---|
| **High** | Dual gate; ground-plane early-out; DEPRECATED map rows; `SetAndDisableCameraControl` **does** exist; `AlwaysHandleInScope` **does** exist; factory script; `Stats` rename; WB disable side-effect. |
| **Medium** | 2017 `InstanceConfig` JSON-key macro vs 2026 `GetBehaviorJsonKeys`; `ShouldStreamline()` spark path still compiles (yes) but may be unused; force-run on-robot vs Webots-only docs. |
| **Unknown until Phase 1/5** | Whether `ag_laser_*` / `ag_pounceonmotionpounce` / `ag_vc_laser_lookdown` exist in shipped animation-assets. Xray WB vs red/green saturation. Whether `RobotObservedLaserPoint` shows in current WebViz or only Viz/logs. |

---

## Phase 1 — Laser dots only (no C++)

### What to implement

No source edits required if you can scp `features.json` onto the robot. If the tree must change: set `"Laser": true` in `resources/config/features.json` L6–8 (keep all other flags).

On robot / `:8888/consolevars`:

1. Feature gate Laser = on (file or already flashed).
2. Category **Vision.General.VisionModes** → `Lasers` = true (force mode; no behavior is requesting it yet).
3. **Vision.LaserPointDetector** → `Laser_DrawDetectionsInCameraView` = true, `LaserDetectionDebug` = 1 (or 2).
4. Head down so the **ground plane** is visible. Red or green pointer on the table/floor. Not a wall, not a blue laser, not a white LED.

### Doc references

- Catalog `Lasers` blurb: mode **and** gate (`engine-vision-motion-laser.json` ~L189–203)
- `laserPointDetector.cpp` L245–249 groundPlaneVisible
- `visionSystem.cpp` L1888–1902
- Detector catch write-up from session: dual brightness 235/240, dark ring, red/green sat

### Verification checklist

- [ ] `rg '"Laser"' resources/config/features.json` shows `"enabled": true` **or** live robot file does.
- [ ] Console `Lasers` is on.
- [ ] With pointer on floor: `RobotObservedLaserPoint` in engine logs **or** green oval on camera viz (`Laser_DrawDetectionsInCameraView`).
- [ ] Head-up / no floor: **no** points (proves ground-plane filter, not a stuck true).
- [ ] Robot does **not** pounce (behavior still absent).

### Anti-pattern guards

- Do not copy TrackLaser C++ in this phase.
- Do not tune `Laser_*` thresholds until you have a miss/false-positive log with `LaserDetectionDebug=2`.
- Do not use `PounceWithProx` as a proxy test.

**Stop here if dots fail.** Missing C++ is not the reason.

---

## Phase 2 — Copy `BehaviorTrackLaser` onto 2026 APIs

### What to implement

1. Copy leak `behaviorTrackLaser.{h,cpp}` into  
   `engine/aiComponent/behaviorComponent/behaviors/freeplay/userInteractive/`  
   (same folder as `behaviorPounceWithProx.*`).
2. Keep class name `BehaviorTrackLaser` / files `behaviorTrackLaser.*` so `generateBehaviorCode.py` emits `BehaviorClass::TrackLaser`.
3. **Required 2026 adapters** (do not skip):

| Leak | This tree |
|---|---|
| `PushNextModeSchedule` + `VisionMode::DetectingLaserPoints` | **Gone.** Copy gaze: `visionModesForActivatableScope` **and** `visionModesForActiveScope` insert `{VisionMode::Lasers, High}` and `{VisionMode::Stats, High}` (`behaviorReactToGazeDirection.cpp` L336–339). Without activatable `Lasers`, `WantsToBeActivated` never sees unconfirmed dots. |
| `VisionMode::ComputingStatistics` | `VisionMode::Stats` (`visionModes.clad` L21; `RobotProcessedImage.mean` L181). |
| Darkened `CameraParams(exp, gain, orig WB RGB)` | Keep WB copy. Playpen uses 5-arg ctor (`behaviorPlaypenTest.cpp` L178–180). Do **not** pass only exposure+gain. |
| Cleanup `EnableAutoExposure(true)` only | Also `EnableWhiteBalance(true)` — `SetAndDisableCameraControl` kills both (`visionComponent.cpp` L2373–2376). |
| `AlwaysHandleInScope` + ctor `SubscribeToTags` | Keep; still virtual (`iCozmoBehavior.h` L357). **No `GetBEI()` in ctor** (`iBehavior.h`). |
| `FeatureType::Laser` C++ check | Keep. Optional extra: JSON `wantsToBeActivatedCondition` `{ "conditionType": "FeatureGate", "feature": "Laser", "expected": true }` like `reactToGazeDirection.json`. |
| `ShouldStreamline()` / `alwaysStreamline` | Keep if you want spark-style force-search. |
| `DEPRECATED_Laser*` / `DEPRECATED_LookDownForLaser` | Keep names. |

4. `GetBehaviorOperationModifiers`: keep `behaviorAlwaysDelegates = false`; add vision inserts; `wantsToBeActivatedWhenOnCharger = false` (don’t darken AE on charger).
5. Do not add HLAI JSON yet.

### Doc references

- Leak header state machine `Inactive … Pounce … GetOutBored`
- Leak cpp L176–190 `WantsToBeActivatedBehavior` (gate, docking, carrying)
- Leak cpp ~L262 `SetAndDisableCameraControl(darkenedParams)`
- Leak cpp ~L620–647 `TrackGroundPointAction` + `EnablePredictionWhenLost` + `SetStopCriteria`
- Leak cpp ~L836–837 restore camera
- `b_template.h` for 2026 include-guard style if you must re-wrap; prefer keeping leak structure if it compiles

### Verification checklist

- [ ] Files exist at the userInteractive path; class `BehaviorTrackLaser`.
- [ ] `rg 'ComputingStatistics|DetectingLaserPoints|PushNextModeSchedule' engine/aiComponent/behaviorComponent/behaviors/freeplay/userInteractive/behaviorTrackLaser.cpp` is empty.
- [ ] `rg visionModesForActivatableScope` on that cpp/h hits `VisionMode::Lasers`.
- [ ] `rg EnableWhiteBalance` in Cleanup / `OnBehaviorDeactivated`.
- [ ] `rg SetAndDisableCameraControl` still the confirm path.
- [ ] No edits to `laserPointDetector.cpp` / `trackGroundPointAction.cpp`.

### Anti-pattern guards

- Do not “modernize” the state machine.
- Do not request `VisionMode::BrightColors`.
- Do not call HAL/camera service from the behavior.

---

## Phase 3 — JSON instance + generateBehaviorCode.py

### What to implement

1. Add `resources/config/engine/behaviorComponent/behaviors/devBehaviors/trackLaser.json` (dev folder — not Observing).

**Copy numbers + graph from spark JSON** (`git show 1dc59d4382:.../sparksTrackLaser.json`). Drop `executableBehaviorType`, `needsActionID`, `displayNameKey`. v1 force-run: `alwaysStreamline: true` so it searches without a prior dot (spark behavior). Later Observing instance: `false` + FeatureGate condition.

```json
{
  "behaviorClass": "TrackLaser",
  "behaviorID": "TrackLaser",
  "alwaysStreamline": true,
  "skipGetOutAnim": true,
  "startIfLaserSeenWithin_sec": 1.0,
  "maxDistToGetAttention_mm": 120.0,
  "darkenedExposure_ms": 1.0,
  "darkenedGain": 0.1,
  "numImagesToWaitForExposureChange": 5,
  "imageMeanFractionForExposureChange": 0.5,
  "searchAmplitude_deg": 90.0,
  "maxTimeBehaviorTimeout_sec": 120.0,
  "maxTimeBeforeRotate_sec": 1.25,
  "trackingTimeout_sec": 1.25,
  "pounceAfterTrackingFor_sec": 0.6,
  "pounceIfWithinDist_mm": 55.0,
  "pouncePanTol_deg": 10.0,
  "pounceTiltTol_deg": 15.0,
  "backupDistAfterPounce_mm": -15.0,
  "backupDurationAfterPounce_sec": 0.25,
  "randomInitialSearchPanMin_deg": 20.0,
  "randomInitialSearchPanMax_deg": 45.0,
  "minPanDuration_sec": 0.30,
  "maxPanDuration_sec": 0.40,
  "minTimeToReachLaser_sec": 0.5,
  "maxTimeToReachLaser_sec": 0.7,
  "predictionDuration_sec": 2.0,
  "trackingTimeToAchieveObjective_sec": 2.5,
  "maxTimeToConfirm_ms": 5000.0,
  "maxLostLaserTimeoutGraph_sec": {
    "nodes": [
      { "x":  0.0, "y":  8.0 },
      { "x": 20.0, "y":  8.0 },
      { "x": 20.0, "y":  5.0 },
      { "x": 60.0, "y":  5.0 },
      { "x": 60.0, "y":  3.0 }
    ]
  }
}
```

2. From repo root: `./tools/ai/generateBehaviorCode.py`  
   (`behaviors.md` L54–71). Expect new `BehaviorClass::TrackLaser`, `BehaviorID::TrackLaser`, factory case.

3. Keep `DEPRECATED_*` in `animationTrigger.clad`. Optional: `rg ag_laser_react_01` in animation-assets / DEPS; if missing, Phase 4 still force-runs but anims will no-op — log it, do not invent groups.

### Doc references

- `behaviors.md` L52–71
- Leak `GetBehaviorJsonKeys` L163–172 (`skipGetOutAnim`, `maxLostLaserTimeoutGraph_sec`, plus `varNames`)
- `tools/ai/generateBehaviorCode.py` L16–18 output paths

### Verification checklist

- [ ] `rg TrackLaser clad/src/clad/types/behaviorComponent/behaviorClasses.clad`
- [ ] `rg TrackLaser clad/src/clad/types/behaviorComponent/behaviorIDs.clad`
- [ ] `rg BehaviorTrackLaser engine/aiComponent/behaviorComponent/behaviorFactory.cpp`
- [ ] JSON `behaviorClass` / `behaviorID` match the clad names exactly
- [ ] `rg DEPRECATED_LaserPounce resources/assets/cladToFileMaps/AnimationTriggerMap.json` still `ag_pounceonmotionpounce`

### Anti-pattern guards

- Do not put the JSON under Observing yet.
- Do not add a voice intent in v1.
- Do not hand-type factory switch cases.
- Do not paste `needsActionID` / `executableBehaviorType` from Cozmo spark JSON.

---

## Phase 4 — Force-run (before Observing)

### What to implement

No tree wiring. Activate by BehaviorID:

- **Webots:** paste `TrackLaser` into `behaviorName`, Shift+C (`behaviors.md` L32).
- **Robot:** same force-run path used for early Snake (WebViz / console / `behaviorName` if exposed). If none, Webots first.

Keep Laser **gate on**. Console `Lasers` can stay on as a belt; activatable-scope request should be enough once this behavior is in the boot tree **or** force-run puts it in scope.

### Doc references

- `behaviors.md` L30–32
- EASINESS “force-run before Observing”
- Leak state order: look down → wait exposure → confirm → `TrackGroundPointAction` → `DEPRECATED_LaserPounce` → backup

### Verification checklist

- [ ] Force-run with **no** laser: look-down / search / bored get-out (`DEPRECATED_LaserGetOut` / skip if `skipGetOutAnim`).
- [ ] Red/green dot on floor: acknowledge (`ag_laser_react_01`), drive loops, pounce, backup.
- [ ] After deactivate: AE and WB live again (image not stuck dark; WB not 0).
- [ ] Carrying a cube / docking: does **not** activate (leak L185–190).
- [ ] Engine log: no `SetNextCameraParamsFailed`; no `ComputingStatistics`.

### Anti-pattern guards

- Do not add to `observing.json` / `highLevelAI.json` in this phase.
- Do not lower `Laser_*` thresholds “so it always pounces” without a debug image.

---

## Phase 5 — Build / flash (user-gated)

### What to implement

Only when asked: `source setenv.sh` && `vbuild` (or the user’s usual flash). Includes clad regen from Phase 3.

### Verification checklist

- [ ] `vic-engine` links `BehaviorTrackLaser`.
- [ ] Robot `features.json` Laser true.
- [ ] Repeat Phase 1 dots **without** needing console `Lasers` **once** TrackLaser is in activatable scope (force-run or later Observing). Until then console `Lasers` remains valid.

### Anti-pattern guards

- Do not run `setenv.sh` / `vbuild` in a docs-only session.
- Do not initialize EXTERNALS.

---

## Phase 6 — Docs closeout

### What to implement

- This plan status → implemented / awaiting on-robot.
- `EASINESS-RANKING.md` Laser rows: note Phase 1 vs 2 status.
- `AGENTS.md` §6 landmark + Quick answers + §7 one line.
- Catalog `Lasers` `statusNote`: gate default if you changed `features.json` in-tree.
- Optional: `cvcatalog` blurb that TrackLaser requests the mode.

### Verification checklist

- [ ] §6/§7 match reality (gate on/off, behavior present/absent).

---

## Phase 7 — Verification (static + on-robot)

### Static

- [ ] No `ComputingStatistics` in the new cpp.
- [ ] `EnableWhiteBalance(true)` paired with AE restore.
- [ ] `visionModesForActivatableScope` includes `Lasers`.
- [ ] Factory/clad generated, not hand-copied wrong.
- [ ] Detector/action files unchanged (`git diff -- engine/vision/laserPointDetector.cpp engine/actions/trackGroundPointAction.cpp` empty).
- [ ] `test/engine/testVisionSystem.cpp` still builds (already had laser point lists).

### On-robot A/B (after flash)

| ID | Setup | Expect |
|---|---|---|
| L0 | Gate off, `Lasers` console on | No `RobotObservedLaserPoint` |
| L1 | Gate on, `Lasers` on, head down, red pointer | Dots / viz oval |
| L2 | Same, head up | No points |
| L3 | Force-run TrackLaser, no pointer | Search then get-out; camera restores |
| L4 | Force-run, red/green on floor | Track + pounce + backup |
| L5 | White LED / window glint on floor | Should **not** confirm (saturation). If it does, log `LaserDetectionDebug=2` — do not “fix” in v1 unless unusable. |

### Anti-pattern guards

- Do not declare “done” from a compile only.
- Do not tune Xray WB in this plan if L4 fails color sat — that is a follow-up.

---

## Suggested execute order

`1 (dots, scp/console) → 2 (C++ adapters) → 3 (JSON + generateBehaviorCode) → 4 (force-run) → 5 (vbuild/flash when asked) → 7 L0–L4 → 6 docs`.  
Phase 7 L5 is optional soak. Observing hook is a **v1.1** not in this plan.

**Implementer one-liner:** Phase 1 is a feature-gate + console `Lasers` experiment on the detector that already ships; Phase 2 copies `db9431edc0^` TrackLaser and only changes Stats/WB/activatable-scope so Vector’s vision scheduler actually feeds it.

---

## Live console snapshot (2026-09-13)

First `FoundCentroid` streak: `docs/mapping/LASER-CONSOLE-SNAPSHOT.md` (polled `192.168.50.189`). Wide-open: 70/80, ring radius 0, sat −1, maxRadius 4000. Head-down required (`BadProjectedZ` at 42°).
