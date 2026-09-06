# Plan: Session B — Instrumented deploy (black-level bypass + manual WB R/G/B)

**Goal:** One rebuild/flash that adds live `:8888` knobs so we can A/B Xray black-level crush and command explicit AWB triples `(1,1,1)` / `(2,1,1)` / `(1,1,2)` without inventing VicOS changes.

**Robot context (Session A, 2026-09-06, `192.168.50.189`):** Rail stayed **AWB 3.8/1/3.8 · EXP 66 · GAIN 3.8**. Gamma `1/G` confirmed (1.7 darker, 2.5 brighter). `UnderExposedThreshold=0` did not move AWB. Console-only path exhausted.

**Out of scope for this plan:** Permanent calibrated black-level, confidence-aware AWB redesign, TemporalDenoiseGreen, VicOS/`mm-anki-camera` edits, PHOTO-vs-NEON host tooling, raising production max exp/gain as a product change.

**Default scope:** black-level bypass + manual WB apply. **Optional** Phase 2b (max exp/gain) — include only if explicitly requested at execute time.

**Canonical prior art:** `docs/mapping/CAMERA-HW-V1-V2.md` §5.2, §7 Session B.

---

## Phase 0 — Documentation discovery (Allowed APIs)

### Allowed APIs (copy these; do not invent)

| API / pattern | Source | Use for |
|---|---|---|
| `CONSOLE_VAR` / `CONSOLE_VAR_RANGED` / `CONSOLE_FUNC` / `CONSOLE_VAR_EXTERN` | `lib/util/source/anki/util/console/consoleInterface.h` | Register knobs; UI id strips leading `k` |
| Debayer knobs live in **engine** | Comment `visionComponent.cpp:46-47`; `kDebayerGamma` + `ResetGamma` at `:129-135` | Define Session B Debayer vars next to gamma |
| `BlackLevelAndNormalize` early-return | `coretech/vision/engine/debayer/neon/raw10.cpp:335-351` | Bypass beside existing `IsXray()` gate — **no** `ResetGamma` / op rebuild |
| `Vision::CameraParams(exp, gain, wbR, wbG, wbB)` | `coretech/vision/clad_src/clad/types/cameraParams.clad` | Build commanded params |
| `VisionComponent::SetAndDisableCameraControl(const CameraParams&)` | `visionComponent.cpp:2217-2242` | Disable AE+WB modes, push exp/gain + AWB to camera, viz |
| Playpen caller of that API | `behaviorPlaypenTest.cpp:177-180` | Copy-ready usage |
| `CameraService::CameraSetWhiteBalanceParameters(r,g,b)` | `cameraService.h:81`, `cameraService_vicos.cpp:335-350` → `camera_set_awb` | What VicOS honour test ultimately hits |
| `CameraService::CameraSetParameters(exp_ms, gain)` | same files → `camera_set_exposure` | Optional max-limit probe |
| Validation rails | `cozmoConfig.h` `MIN/MAX_CAMERA_*`; `AreCameraParamsValid` | WB/gain **0.25–3.8**, exp **1–66** if going through `SetNextCameraParams` |
| HTTP | `docs/development/web-server.md` | `/consolevarset`, `/consolefunccall`, `/consolevarget` |

### Anti-patterns (do NOT)

- Treat `WhiteBalance=false` as commanding `(1,1,1)` — it only holds last gains (`cameraParamsController.cpp:320-325`).
- Expect face `MirrorMode` / `DisplayExposureInMirrorMode` to show AWB — it draws **exp + gain only** (`mirrorModeManager.cpp:277+`). Use the same AWB readout path used in Session A (user already saw AWB on overlay — confirm which UI) or engine logs / Viz `SendCameraParams`.
- Copy gamma’s “slider then ResetGamma” for black-level — BL is per-call; bool is live immediately.
- Set `BLACK_LEVEL_8=0` as “bypass” — still clips and `×255/256`.
- Rely on SDK `SetCameraSettings` for WB — **no WB fields** (CLAD/proto); freezes current WB only.
- Assume `EnableWhiteBalance(false)` alone stops the JSON every-5-frame schedule — VSM `kUseDefaultsForUnspecified=true` may re-schedule (`visionScheduleMediator.cpp`). **Must add an explicit manual-lock guard** (see Phase 2).
- Edit VicOS / `mm-anki-camera` in this deploy.
- Put new Debayer console registration only in `debayer.cpp` without verifying — historical comment says gamma vars failed there; prefer `visionComponent.cpp` + `CONSOLE_VAR_EXTERN` in NEON TU (coretech `cameraParamsController.cpp` proves *some* coretech vars work, but Debayer category home is engine).

### Confidence / gaps from discovery

- **High:** APIs above; BL math; playpen lock path; SDK has no WB.
- **Medium:** Whether EnableMode(false) alone stops WB on robot — treat as unsafe; lock flag required.
- **Unknown until Session B run:** whether daemon applies AWB; how much darkness is black-level.

---

## Phase 1 — Black-level bypass console var

### What to implement

1. In `engine/components/visionComponent.cpp`, next to `kDebayerGamma` / `ResetGamma` (`:129-135`), add:
   - `CONSOLE_VAR(bool, kDebayerBypassBlackLevel, "Vision.Debayer", false);`
2. In `coretech/vision/engine/debayer/neon/raw10.cpp`:
   - `#include "util/console/consoleInterface.h"`
   - `CONSOLE_VAR_EXTERN(bool, kDebayerBypassBlackLevel);`
   - Change early-return to: `if (!Vector::IsXray() || kDebayerBypassBlackLevel) return;`
3. Do **not** rebuild Debayer ops. Do **not** touch PHOTO `debayer/raw10.cpp`.

### Doc references

- Gate: `neon/raw10.cpp:335-351`
- Extern macro: `consoleInterface.h` `CONSOLE_VAR_EXTERN`
- Category: `"Vision.Debayer"` (same tab as Session A gamma)

### Verification checklist

- [ ] `rg kDebayerBypassBlackLevel` shows define in `visionComponent.cpp` and extern+use in `neon/raw10.cpp`
- [ ] After flash: `GET /consolevarget?key=DebayerBypassBlackLevel` → `false`
- [ ] Set `true` via `/consolevarset` — image can change **without** calling `ResetGamma`
- [ ] Default `false` matches pre-flash Xray look at same scene

### Anti-pattern guards

- Do not sprinkle `if (bypass)` at each of 15 call sites — one helper return only.
- Do not require `ResetGamma` for this flag.

---

## Phase 2 — Manual WB R/G/B + Apply (with lock)

### What to implement

Copy the **playpen + `SetAndDisableCameraControl` + ResetGamma-style apply** pattern.

1. In `visionComponent.cpp` (file-scope, near other vision console vars), add ranged knobs (UI ids strip `k`):

| C++ name | Category | Default | Range |
|---|---|---|---|
| `kManualWB_R` | `"Vision.PreProcessing"` | `1.f` | `0.25f`–`3.8f` |
| `kManualWB_G` | `"Vision.PreProcessing"` | `1.f` | `0.25f`–`3.8f` |
| `kManualWB_B` | `"Vision.PreProcessing"` | `1.f` | `0.25f`–`3.8f` |

2. Add `CONSOLE_FUNC` e.g. `ApplyManualWhiteBalance` in `"Vision.PreProcessing"` that:
   - Uses `s_VisionComponent` (already used by other console funcs in this file).
   - Reads `GetCurrentCameraParams()` for **current exp + gain** (keep scene exposure locked).
   - Builds `Vision::CameraParams(cur.exposureTime_ms, cur.gain, kManualWB_R, kManualWB_G, kManualWB_B)`.
   - Calls `SetAndDisableCameraControl(params)` — copy structure from `:2217-2242` / playpen `:177-180`.

3. **Manual lock guard (required):**  
   - Add a file-scope `bool` / `CONSOLE_VAR(bool, kManualCameraControlLock, "Vision.PreProcessing", false)` set **true** inside the Apply func (and by `SetAndDisableCameraControl` if cleaner to set in one place).  
   - At start of `VisionComponent::UpdateCameraParams` (`:1300+`), if lock is true: **do not** push AE/WB from `procResult` to `CameraService` (skip both `CameraSetParameters` and `CameraSetWhiteBalanceParameters`). Still allow viz if desired, or skip.  
   - Add `CONSOLE_FUNC` `ClearManualCameraControlLock` that sets lock false and optionally re-enables `AutoExp`/`WhiteBalance` via existing `EnableAutoExposure` / `EnableWhiteBalance`.  
   - Rationale: discovery found VSM may reschedule AutoExp/WB from JSON defaults even after `EnableMode(false)`.

4. Sliders alone must **not** hit VicOS — only Apply does (same class of bug as DebayerGamma without ResetGamma).

### Doc references

- `SetAndDisableCameraControl`: `visionComponent.cpp:2217-2242`
- Playpen: `behaviorPlaypenTest.cpp:177-180`
- `UpdateCameraParams` push gates: `visionComponent.cpp:1332-1345`
- WB Off ≠ command: `cameraParamsController.cpp:320-325`
- Valid triples for honour test: `(1,1,1)`, `(2,1,1)`, `(1,1,2)` — all within 0.25–3.8

### Verification checklist

- [ ] `/consolefunclist?key=ApplyManual` shows the new func
- [ ] Set `ManualWB_R=2`, `ManualWB_G=1`, `ManualWB_B=1` then call Apply — engine accepts (`SetNextCameraParams` OK)
- [ ] With lock true, waiting does not walk AWB back to 3.8/1/3.8 from gray-world
- [ ] Clear lock restores ability for AutoExp/WB to update when re-enabled
- [ ] Mac/sim: setters are no-ops — **robot required** for honour test

### Anti-pattern guards

- Do not invent `CameraSetWhiteBalance` with different arity.
- Do not send WB via SDK messages.
- Do not claim VicOS applied gains from engine-side numbers alone — judge by **image colour** change under fixed lighting/exp/gain.

---

## Phase 2b — OPTIONAL: max exp/gain probe (same deploy only if requested)

### What to implement (skip by default)

- `CONSOLE_VAR_RANGED` for manual exposure ms and gain (allow values **above** 66 / 3.8 for the probe).
- `CONSOLE_FUNC` that calls `CameraService::CameraSetParameters` **directly** (and sets manual lock), **bypassing** `SetNextCameraParams` / `AreCameraParamsValid` so the test can ask VicOS for higher values.
- Document that engine validation path still cannot store out-of-range params in `VisionSystem` current params — overlay/logs may disagree with daemon.

### Anti-pattern guards

- Do not change `MAX_CAMERA_EXPOSURE_TIME_MS` / `MAX_CAMERA_GAIN` globals as the “test” — that changes product clamps for everything.

---

## Phase 3 — Catalog + mapping doc (lightweight)

### What to implement

1. Optional but recommended: add cvcatalog entries (copy shape from `engine-autoexp.json` `DebayerGamma` and `funcs-vision-anim-text.json` `ResetGamma`):
   - `DebayerBypassBlackLevel` — `Vision.Debayer`, status `live`
   - `ManualWB_R/G/B`, `ApplyManualWhiteBalance`, `ManualCameraControlLock`, `ClearManualCameraControlLock` — `Vision.PreProcessing`
   - Register new shard in `resources/webserver/cvcatalog/index.json` if new file
2. Update `docs/mapping/CAMERA-HW-V1-V2.md` §7 Session B table: knobs now exist; paste on-robot protocol below.
3. Fix §7 note: face MirrorMode overlay is exp/gain only (AWB readout path as observed in Session A).

### Verification

- [ ] Catalog keys match UI ids (no `k` prefix)
- [ ] Mapping doc lists exact tab + name for each new control

---

## Phase 4 — On-robot Session B protocol (after one flash)

Robot: same dark scene as Session A. Prefer `http://192.168.50.189:8888`.

### B0 — Baseline (bypass false, stock WB behavior)

1. `DebayerBypassBlackLevel=false`
2. Note AWB/EXP/GAIN + screenshot (expect ~3.8/1/3.8 · 66 · 3.8)

### B1 — Black-level A/B (freeze exposure)

1. Ensure AE not fighting: use Apply with current params **or** confirm exp stays 66 (pegged).
2. `DebayerBypassBlackLevel=true` (no ResetGamma).
3. Screenshot + note brightness/green vs B0.  
   - Brighter / less green → black-level is a major software contributor.  
   - Unchanged → look elsewhere (sensor / daemon / AWB apply).

### B2 — VicOS AWB honour (commanded triples)

For each triple, set sliders then **`ApplyManualWhiteBalance`**:

| Trial | `ManualWB_R` | `ManualWB_G` | `ManualWB_B` |
|---|---|---|---|
| T0 | 1.0 | 1.0 | 1.0 |
| T1 | 2.0 | 1.0 | 1.0 |
| T2 | 1.0 | 1.0 | 2.0 |

Keep bypass mode constant (pick one: both with bypass true, or both false — do not change mid-triple).

**Pass criteria:** visible colour shift consistent with gains (T1 warmer/redder, T2 cooler/bluer) under fixed lighting.  
**Fail:** image unchanged → daemon likely ignores AWB; software WB becomes the path for colour fixes.

### B3 — Restore

- `ClearManualCameraControlLock`
- `DebayerBypassBlackLevel=false`
- Re-enable AutoExp/WhiteBalance as desired

### Deploy count

| Phase | Deploys |
|---|---|
| Implement Phases 1–2 (+ optional 2b/3) | **1 flash** |
| Run B0–B3 | **0** additional |
| Later real fix | separate |

---

## Phase 5 — Verification (executor closeout)

1. Grep for invented names — only the knobs listed above.
2. Confirm no VicOS tree edits.
3. Confirm `BlackLevelAndNormalize` still Xray-gated when bypass false.
4. Confirm Apply path goes through `CameraSetWhiteBalanceParameters` (or `SetAndDisableCameraControl`).
5. Confirm `UpdateCameraParams` respects manual lock (add a unit test only if cheap; otherwise on-robot B2 stability is the proof).
6. Append Session B results table to `CAMERA-HW-V1-V2.md` §7 (like Session A).
7. Do **not** claim hardware floor until B1 shows residual darkness with bypass on.

---

## Suggested file touch list

| File | Change |
|---|---|
| `engine/components/visionComponent.cpp` | `kDebayerBypassBlackLevel`; ManualWB_* ; Apply/Clear funcs; lock; guard `UpdateCameraParams` |
| `coretech/vision/engine/debayer/neon/raw10.cpp` | `CONSOLE_VAR_EXTERN` + early-return |
| `resources/webserver/cvcatalog/vars/*.json` + `index.json` | Optional tooltips |
| `docs/mapping/CAMERA-HW-V1-V2.md` | Session B knobs + protocol + later results |
| `AGENTS.md` §7 | One progress line when executed |

---

## Execution notes for `/do` or a future agent

- Mapping-phase repo rules: **user explicitly asked for this plan**; implementation still needs an explicit “execute / feature phase” go-ahead before editing source.
- Build/flash: only when user asks (`vbuild` / deploy) — do not run builds unbidden per `AGENTS.md` hard rules unless user lifts that for the session.
- Keep instrumentation defaults **off** (`Bypass=false`, lock cleared) so forgotten flags do not ship as behaviour change.
