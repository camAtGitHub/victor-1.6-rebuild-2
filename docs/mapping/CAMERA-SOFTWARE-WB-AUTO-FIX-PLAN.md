# Plan: SoftwareWBAuto walk-down / integrator fix (single deploy)

**Status: Implemented** (absolute integrator + slew + manual lock gate). **Awaiting on-robot Session E.**

**As landed (2026-09-07, not yet flashed):** `VisionSystem::UpdateCameraParams` resets controller WB to `(1,1,1)` **before every auto `ComputeNext`**; Update-start flush also forces controller WB `1,1,1` when auto is on (estimator gains stay in `_currentCameraParams` / overlay); hold uses `SoftwareWhiteBalance::GetGains()`; `kSoftwareWBMaxChangeFraction` default **0.15**; `kSoftwareWBMaxGain` default **1.5**; `kSoftwareWBAuto` still default **false**; `kManualCameraControlLock` still skips auto. Catalog: `engine-session-b-camera.json`. Canonical log: [`CAMERA-HW-V1-V2.md`](CAMERA-HW-V1-V2.md) Status + Session D/E.

**Goal:** Make `SoftwareWBAuto` produce stable, non-railed gains that can **increase and decrease** with lighting, without purple/magenta slam or inverted object colours. One flash; tune MaxGain/slew live afterward.

**Why (Session D + daytime 2026-09-07):** Auto hits `SoftwareWBMaxGain` as R=B (2.5 or 1.3), looks purple/blue, object colours wrong; bright light never walks down. Manual Apply + vizManager R/B remain good — leave those alone.

**Root cause (code, high confidence):**

1. Auto stats use **`ScopedIdentity`** (uncorrected RGB) — correct for absolute gray-world.
2. Controller still does **`next.R = cur.R * adjR`** (`cameraParamsController.cpp:494-499`). With identity stats, `adjR ≈ raw G/R` every tick → **double integration** → slam to MaxGain; walk-down needs `adjR < 1/cur.R`, which a green-cast scene never gives once `cur` is large.
3. Rising-edge `SetNextCameraParams(1,1,1)` does **not** update controller this tick (`UpdateCurrentCameraParams` only at next `Update` start `1603-1609`); same-frame result **overwrites** the pending 1,1,1.
4. `MaxChangeFraction` is **0.0** in JSON → no slew; first WB tick can jump 1 → MaxGain.

**Out of scope:** VicOS; night gamma product; black-level; changing global JSON `MaxChangeFraction` (would also slew AE); inventing a new estimator; enabling auto by default.

**Keep default:** `SoftwareWBAuto = false` until on-robot pass.

---

## Phase 0 — Allowed APIs

| API | Source | Use |
|---|---|---|
| `CameraParamsController::UpdateCurrentCameraParams` | `cameraParamsController.h:82`, `.cpp:233-244` | Force controller WB to 1,1,1 **before** each auto `ComputeNext` (same-tick) |
| `ComputeNextCameraParams` / gray-world | `cameraParamsController.cpp:661-798`, `494-499` | Keep; drive with cur WB = 1,1,1 so `next ≈ adj` |
| Auto path | `visionSystem.cpp:641-709` | Fix here |
| `SoftwareWhiteBalance::{SetGains,GetGains,SetEnabled}` | `softwareWhiteBalance.*` | Apply absolute gains; hold reads **GetGains** |
| `ScopedIdentity` + `InvalidateRGB` | already shipped | Keep for uncorrected stats |
| HAL pin 1,1,1 | `visionComponent.cpp:1397-1401` | Keep when auto on |
| Overlay `SendCameraParams` | same | Keep showing estimator gains |
| Console pattern | `visionSystem.cpp:106-109` | Add `kSoftwareWBMaxChangeFraction` sibling |
| Existing adj slew clamp | `cameraParamsController.cpp:715-719` | **Copy** math into software-only post-step; do **not** turn on JSON MaxChangeFraction |

### Anti-patterns

- Do not “fix” by only lowering MaxGain (already disproved).
- Do not call only `SetNextCameraParams(1,1,1)` on rising edge and expect integrator reset.
- Do not estimate on post-multiply RGB (drop ScopedIdentity) as the v1 fix — prefer absolute + identity.
- Do not load auto software R/B back into controller current for the next tick’s `cur*adj` (defeats absolute mode).
- Do not enable `SoftwareWBAuto` by default.
- Do not change `vision_config.json` MaxChangeFraction globally.

---

## Phase 1 — Absolute gray-world for auto (required) — **implemented**

### What to implement

In `VisionSystem::UpdateCameraParams`, when `kSoftwareWBAuto && wbMode != Off`:

1. **Before** `ComputeNextCameraParams` (every auto WB tick, not only rising edge):

   ```cpp
   Vision::CameraParams integratorReset = GetCurrentCameraParams(); // keep exp/gain
   integratorReset.whiteBalanceGainR = 1.f;
   integratorReset.whiteBalanceGainG = 1.f;
   integratorReset.whiteBalanceGainB = 1.f;
   (void)_cameraParamsController->UpdateCurrentCameraParams(integratorReset);
   ```

   So `next.R/B = 1 * adjR/B` = **absolute** gray-world ratio, then software Min/Max clamp.

2. Rising edge: keep `SetGains(1,1,1)` + `SetEnabled(true)`; also call the same `UpdateCurrentCameraParams` reset immediately (redundant with per-tick but clear).

3. After compute + clamp, `SetGains(next.R, 1, next.B)` as today; InvalidateRGB + GetRGB for Viz.

4. **Prevent re-injection:** when auto is on, the params written into `_nextCameraParams` / applied at Update start for the **controller** must keep WB at **1,1,1** for integrator purposes, while overlay still gets estimator gains.

   Practical approach (pick one, prefer A):

   - **A (recommended, landed):** After `ComputeNext`, store software gains in `nextParams` for overlay/`SetGains`, but before returning, also ensure the next controller flush won’t use those as `cur`: e.g. when applying `_nextCameraParams` at Update start (`1603-1609`), if `kSoftwareWBAuto`, force WB to 1,1,1 when calling `UpdateCurrentCameraParams` (keep exp/gain from pending). Overlay already sent last frame via VisionComponent.
   - **B:** Split “overlay WB” from “controller WB” with a small VisionSystem member `_softwareWBGains` — more invasive.

5. Hold-last-good: if TooDark or starved, copy **`SoftwareWhiteBalance::GetGains()`**, not `GetCurrentCameraParams()` WB (avoids pending/controller mismatch).

### Doc references

- Session D / daytime: `CAMERA-HW-V1-V2.md` Status + Session D
- Integrator: `cameraParamsController.cpp:494-499`
- Auto block: `visionSystem.cpp:641-709`, flush `1603-1609`

### Verification checklist

- [x] Grep: every auto ComputeNext preceded by `UpdateCurrentCameraParams` with WB 1,1,1
- [x] Grep: hold uses `GetGains()`
- [x] Grep: Update-start controller flush forces WB 1,1,1 when auto on
- [ ] On-robot (after flash): auto on → overlay **not** glued to MaxGain in a well-lit room; gains **move down** if you start dark-railed then add light (or start lit and stay moderate)

### Anti-pattern guards

- Do not remove ScopedIdentity.
- Do not send estimator gains to VicOS.

---

## Phase 2 — Live software-only slew (recommended, same flash) — **implemented**

### What to implement

1. Add next to existing knobs (`visionSystem.cpp:106-109`):

   `CONSOLE_VAR_RANGED(f32, kSoftwareWBMaxChangeFraction, "Vision.PreProcessing", 0.15f, 0.f, 1.f);`

   Meaning: max relative step of R/B **gain** per WB tick vs previous software gains (`GetGains()`), when `> 0`. `0` = unlimited (old behaviour).

2. After absolute `nextParams` R/B computed and Min/MaxGain clamped, if `IsFltGTZero(kSoftwareWBMaxChangeFraction)`:

   ```cpp
   f32 prevR, prevG, prevB;
   SoftwareWhiteBalance::GetGains(prevR, prevG, prevB);
   // clamp nextParams.whiteBalanceGainR/B into [prev*(1-f), prev*(1+f)]
   ```

   Copy style from `cameraParamsController.cpp:715-719` (adj clamp), but on **gain values** vs previous software gains.

3. Catalog blurb in `engine-session-b-camera.json`.

4. Optionally lower **default** `kSoftwareWBMaxGain` from 2.5 → **1.5** (still live-tunable). Call out in docs; not required if absolute+slew is enough. **Landed at 1.5.**

### Verification

- [x] Console var `SoftwareWBMaxChangeFraction` registered (default 0.15)
- [ ] With fraction 0.1, first ticks crawl toward target instead of one-frame slam
- [ ] Set to 0 recovers fast jump (for A/B)

### Anti-pattern guards

- Do not set JSON `MaxChangeFraction` (AE side effect).

---

## Phase 3 — Docs + on-robot protocol (one flash)

### Docs

1. Update `CAMERA-HW-V1-V2.md` Status: auto fix shipped; protocol below.
2. Update `CAMERA-SOFTWARE-WB-PHASE3-PLAN.md` with walk-down fix note.
3. Persist this plan as `docs/mapping/CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md`.
4. AGENTS progress + Quick answer.

### On-robot Session E (single deploy — day or night)

| Step | Action | Pass |
|---|---|---|
| 0 | Confirm `SoftwareWBAuto=false`; optional T1/T2 regression (red/blue) | R/B still OK |
| 1 | `SoftwareWBMaxGain=1.5`, `SoftwareWBMaxChangeFraction=0.15`, AutoExp+WB on | — |
| 2 | Auto **true**, well-lit | Overlay R/B **below** max rail and **stable-ish**; colours not wildly inverted |
| 3 | Cover lens / dark briefly then uncover (or move to window) | Gains **decrease** when brighter |
| 4 | Tune MaxGain / MaxChangeFraction live if needed | no rebuild |
| 5 | Auto **false** when done | restored |

**Fail:** still glued to MaxGain R=B in good light after 10+ s → dig into wellExposed/TooDark hold and whether controller flush fix landed.

---

## Phase 4 — Verification closeout

1. Anti-pattern grep: no JSON MaxChangeFraction edit; auto still default false; HAL still 1,1,1.
2. Confirm manual Apply path untouched.
3. On-robot table filled in mapping doc.
4. Commit when user asks (code + docs).

---

## Suggested file touch list

| File | Change |
|---|---|
| `engine/vision/visionSystem.cpp` | Absolute reset each auto tick; flush WB=1,1,1 when auto; hold via GetGains; slew console |
| `resources/webserver/cvcatalog/vars/engine-session-b-camera.json` | New slew blurb; refresh Auto |
| `docs/mapping/CAMERA-HW-V1-V2.md` | Status + Session E results later |
| `docs/mapping/CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md` | This plan |
| `AGENTS.md` | Landmark / progress |

---

## Execution notes

- **One build** for Phases 1–2; console covers day/night A/B.
- User tests via **vizManager**.
- Do not `vbuild` unless asked.
- After implement: `/do` already implied once plan approved — wait for approval via `exit_plan_mode`.
