# Plan: Software WB Phase 3 (auto) + R/B label fix

**Status (2026-09-07):** Implemented and flashed. **R/B display fix PASS** (Session D via vizManager). **Auto v1 FAIL for production use** — hits MaxGain R=B rail (purple), does not walk down when lit; leave `SoftwareWBAuto=false`. **Walk-down fix implemented on top of Phase 3** (absolute integrator + slew + manual lock gate) — see [`CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md`](CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md). Auto still default **false**. Awaiting on-robot Session E.

**Goal:** (1) Make `ManualWB_R` / `ManualWB_B` match perceived colour on Xray Viz. (2) Add **auto** software gray-world that multiplies RGB in-engine, pins VicOS AWB to `(1,1,1)`, and holds last-good when too dark / starved.

**Why:** Session C proved software multiply works, but `(2,1,1)` looked blue and `(1,1,2)` red. Root cause: Xray `ImageRGB::ConvertToShowableFormat` **skips** `COLOR_RGB2BGR`, so JPEG/Viz treats RGB bytes as BGR (`image.cpp:1989-1994`). Face MirrorMode also swaps on Xray. Phase 3 auto must estimate on **memory-correct** `pixel.r()/b()` — so the fix belongs in the **display path**, not a multiply swap (an `ApplyToImage` R↔B swap would make manual labels look right but break auto vs memory).

**Prior art:** `docs/mapping/CAMERA-SOFTWARE-WB-PLAN.md`, `CAMERA-HW-V1-V2.md` Session B/C, landed `SoftwareWhiteBalance` + Apply/Clear.

**Out of scope:** VicOS daemon edits; TemporalDenoise; night gamma product; Phase 2b max exp/gain; inventing a new WB estimator.

**Default:** `kSoftwareWBAuto = false` until on-robot Session E pass (walk-down fix).

---

## Phase 0 — Allowed APIs (discovery)

### Allowed APIs

| API | Source | Use |
|---|---|---|
| `ImageRGB::ConvertToShowableFormat` | `image.cpp:1989-1994` | Fix Xray to always `cv::cvtColor(..., COLOR_RGB2BGR)` like non-Xray |
| `CompressedImage::Compress` | `compressedImage.cpp:60-65` | Viz JPEG path (uses showable format) |
| `MirrorModeManager` Xray `SetFromImageRGB2BGR` | `mirrorModeManager.cpp:293-297`, `image.cpp:2081-2088` | Align face preview with corrected Viz |
| `SoftwareWhiteBalance::{SetEnabled,SetGains,ApplyToImage,IsEnabled,GetGains}` | `softwareWhiteBalance.h/.cpp` | Keep; add `ScopedIdentity` |
| `GetRGBFromBAYER` apply hook | `imageBuffer.cpp:233-238` | Unchanged multiply (`r*=gainR`) |
| `ComputeExposureAndWhiteBalance` | `cameraParamsController.cpp:725-798` | Reuse gray-world (do **not** call unused private `ComputeWhiteBalanceAdjustment`) |
| Integrator | `cameraParamsController.cpp:494-499` | `next.R = clamp(cur.R*adjR)`; G held; software rails not 3.8 |
| `VisionSystem::UpdateCameraParams` | `visionSystem.cpp:577-635`, call site `1848-1861` | Identity fetch + SetGains when auto |
| HAL pin | `visionComponent.cpp:1392-1397` | Always `(1,1,1)` when `kSoftwareWBAuto` |
| Overlay | `SendCameraParams(params)` | Keep **user/estimator** gains (pre-display) |
| `kManualCameraControlLock` | `visionComponent.cpp:1372-1375` | Manual Apply still wins |
| Console | `CONSOLE_VAR(bool, kSoftwareWBAuto, "Vision.PreProcessing", false)` | Gate auto; schedule stays `VisionMode::WhiteBalance` every 5th frame |

### Anti-patterns

- Do **not** swap R/B only in Apply’s `SetGains(kManualWB_B, G, R)` — Phase 3 would diverge.
- Do **not** swap inside `ApplyToImage` if also fixing display (double invert) — pick **one** strategy (this plan: **display fix**).
- Do **not** estimate gray-world on post-multiply cached RGB without identity re-fetch / inverse.
- Do **not** send estimated gains to `camera_set_awb`.
- Do **not** enable `kSoftwareWBAuto` by default.
- Do **not** invent `ImageRGB::ScaleChannels` or a new estimator.
- Do **not** treat `SoftwareWhiteBalance::IsEnabled()` alone as “auto” (Apply also sets that).

### Confidence

- **High:** Xray JPEG skip is the Session C invert; PixelRGB/NEON are RGB; HAL pin sites; cache is often Full before AE/WB.
- **Medium:** Extra Half re-debayer every 5th frame cost; software auto rail values (start 0.5–2.5).
- **Unknown:** Whether fixing ConvertToShowableFormat surprises other Xray consumers that “liked” wrong colours — call out in verification.

---

## Phase 1 — R/B perception fix (Xray display)

### What to implement

1. In `ImageRGB::ConvertToShowableFormat` (`image.cpp:1989-1994`): **remove the Xray special case** that `copyTo` without conversion. Always:

   `cv::cvtColor(this->get_CvMat_(), showImg, cv::COLOR_RGB2BGR);`

   (Same as current non-Xray branch.)

2. Face MirrorMode: on Xray, stop using `SetFromImageRGB2BGR` for the preview path that Session viewing used; use the non-swap path consistent with corrected RGB→showable (read `mirrorModeManager.cpp:293-297` and match non-Xray). Goal: `ManualWB_R=2` looks warmer on **both** WebViz and face mirror.

3. **Do not** change `SoftwareWhiteBalance::ApplyToImage` channel mapping.

4. Leave Apply overlay `CameraParams` as ManualWB (unchanged).

### Doc references

- Session C: `CAMERA-HW-V1-V2.md` §7
- `image.cpp:1989-1994`, `mirrorModeManager.cpp:293-297`

### Verification checklist (on-robot — **gate for Phase 2**)

| Trial | Expect after fix |
|---|---|
| Apply `(1,1,1)` | ≈ baseline |
| Apply `(2,1,1)` | **Warmer / redder** (not blue) |
| Apply `(1,1,2)` | **Cooler / bluer** (not red) |
| Clear | stock path |

HTTP: same Session C protocol on `192.168.50.189:8888`.

### Anti-pattern guards

- Do not “fix” by swapping gains in `SetGains` call site only.
- Do not change `PixelRGB::r()/b()` accessors.

---

## Phase 2 — `ScopedIdentity` + uncorrected stats fetch

### What to implement

1. Extend `SoftwareWhiteBalance`:

   ```cpp
   class ScopedIdentity {
   public:
     ScopedIdentity();  // push: force ApplyToImage no-op (or gains 1) for this thread/scope
     ~ScopedIdentity(); // pop
   };
   ```

   Implementation: nested counter or thread-local “identity depth”; `ApplyToImage` no-ops while depth > 0. Copy mutex style from existing `softwareWhiteBalance.cpp`.

2. Add a way to drop cached RGB for a size so `GetRGB` re-runs Bayer (e.g. `ImageCache::InvalidateRGB(ImageCacheSize)` or clear `_hasValidRGB` on the Half entry). **Must exist** — `ScopedIdentity` alone does nothing if Half RGB is already FullyCached from detectors.

3. In `VisionSystem::UpdateCameraParams`, when `kSoftwareWBAuto && !manualLock`:

   - `ScopedIdentity` + invalidate Half RGB + `GetRGB()` → uncorrected.
   - Run existing `ComputeNextCameraParams(..., GrayWorld or Off, ...)`.
   - After computing next software gains (Phase 3), `SetGains` + `ApplyToImage(*mutable cache rgb)` so this frame’s Viz (later in Update) sees corrected colour.

### Doc references

- Plan preferred option A: prior `CAMERA-SOFTWARE-WB-PLAN.md` Phase 3
- `visionSystem.cpp:630-635`, `1848-1861`
- `imageCache.h` ResizedEntry / Reset patterns

### Verification checklist

- [ ] With auto off, no behaviour change
- [ ] With auto on, unit/log: stats path logs or asserts identity apply (optional DEV_ASSERT)
- [ ] Grep: `ScopedIdentity` used only around stats GetRGB, not globally left on

### Anti-pattern guards

- Do not use “set gains to 1, GetRGB, restore” without invalidate (cache hit returns old corrected RGB).
- Prefer not option C (inverse-divide) for v1 unless invalidate proves too expensive.

---

## Phase 3 — Auto software gray-world

### What to implement

1. `CONSOLE_VAR(bool, kSoftwareWBAuto, "Vision.PreProcessing", false);` in `visionComponent.cpp` (or visionSystem console block — engine-visible).

2. Rising edge when auto becomes true (and not manual lock):
   - Reset engine `CameraParams` WB to `(1,1,1)` via `SetNextCameraParams` / equivalent (do **not** start from railed 3.8).
   - `SoftwareWhiteBalance::SetEnabled(true); SetGains(1,1,1);`
   - Pin HAL `(1,1,1)`.

3. Each WB tick (`VisionMode::WhiteBalance` processed) with auto on:
   - Uncorrected Half RGB (Phase 2).
   - Existing `ComputeNextCameraParams` gray-world.
   - **Hold-last-good:** if `ImageQuality::TooDark` **or** new `wellExposedCount < kSoftwareWBMinWellExposed` (new `CONSOLE_VAR` with a conservative default, e.g. 100 — tune on-robot): do **not** update software gains.
   - Else: clamp R/B with **software rails** (`CONSOLE_VAR_RANGED` min/max, default **0.5–2.5**, not analog 3.8); `SetGains(next.R, 1.f, next.B)`; apply to cache RGB.
   - Mark modes processed as today so main thread runs UpdateCameraParams.

4. `VisionComponent::UpdateCameraParams`: if `kSoftwareWBAuto`, always `CameraSetWhiteBalanceParameters(1,1,1)`; still `SendCameraParams(params)` with software gains for overlay.

5. When auto turns false: `SetEnabled(false); SetGains(1,1,1);` (optional: leave VisionMode WB on for stock overlay-only behaviour).

6. Manual Apply/lock unchanged and **overrides** auto while lock held.

### Doc references

- Gray-world loop: `cameraParamsController.cpp:661-798`, `494-499`
- TooDark: `474-481`
- HAL: `visionComponent.cpp:1392-1397`
- Session B: never trust daemon for colour

### Verification checklist (on-robot)

| Scene | Expect |
|---|---|
| Well-lit neutral | Auto on → less green; overlay R/B move gently; daemon irrelevant |
| Dark rail (old Session A) | Gains **do not** slam 3.8 and stick; hold or soft rail |
| Manual Apply while auto | Lock wins; Clear restores |
| Auto off | Identity multiply; stock AE/WB modes |

### Anti-pattern guards

- Do not enable auto by default in `vision_config.json`.
- Do not send `params.whiteBalanceGain*` to VicOS when auto on.
- Do not estimate on post-SW-WB RGB.

---

## Phase 4 — Docs + catalog

1. Update `CAMERA-HW-V1-V2.md` Session C “fix next” → display fix + auto results tables.
2. Update `CAMERA-SOFTWARE-WB-PLAN.md` status: Phase 1 display fix; Phase 3 auto.
3. Persist this plan as `docs/mapping/CAMERA-SOFTWARE-WB-PHASE3-PLAN.md`.
4. cvcatalog: `SoftwareWBAuto`, min well-exposed, software rails; refresh Apply blurb (R/B labels match after display fix).
5. AGENTS.md landmark + progress + Quick answer.

---

## Phase 5 — Closeout verification

1. Grep: Xray branch in `ConvertToShowableFormat` gone (or always RGB2BGR).
2. Grep: `kSoftwareWBAuto` pin path always `1,1,1` to HAL.
3. Grep: no `ApplyToImage` gainR↔gainB swap if display fixed.
4. On-robot Phase 1 table pass before trusting auto.
5. No VicOS edits; no clean required beyond normal metabuild for new symbols.

---

## Suggested file touch list

| File | Change |
|---|---|
| `coretech/vision/engine/image.cpp` | Xray `ConvertToShowableFormat` always RGB2BGR |
| `engine/vision/mirrorModeManager.cpp` | Align Xray preview with non-swap / correct show path |
| `coretech/vision/engine/softwareWhiteBalance.h/.cpp` | `ScopedIdentity` |
| `coretech/vision/engine/imageCache.h/.cpp` | Invalidate RGB for size |
| `engine/vision/visionSystem.cpp` | Auto stats path |
| `coretech/vision/engine/cameraParamsController.cpp` | wellExposed count + hold; optional software clamp hook |
| `engine/components/visionComponent.cpp` | `kSoftwareWBAuto`, HAL pin, rising-edge reset |
| cvcatalog + mapping docs + `AGENTS.md` | Phase 4 |

---

## Execution notes

- **One flash** can include Phase 1+2+3 code, but **on-robot gate**: confirm T1 red / T2 blue **before** turning `SoftwareWBAuto` true.
- User asked to combine Phase 3 + R/B swap — this plan uses **display R/B fix** (correct for auto), not multiply swap.
- Do not run `vbuild` unless asked; commit when user asks after implement.
