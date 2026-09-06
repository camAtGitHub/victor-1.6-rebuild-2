# Plan: In-engine software white balance

**Status: Phases 1–2 implemented (manual software WB); Phase 3 (auto) gated on on-robot colour A/B.**

**As landed (Phases 1–2):** `coretech/vision/engine/softwareWhiteBalance.h` / `.cpp`; hook at end of `ImageBuffer::GetRGBFromBAYER`; `ApplyManualWhiteBalance` / `ClearManualCameraControlLock` in `engine/components/visionComponent.cpp`; VicOS AWB pinned `(1,1,1)`. Canonical camera notes: [`CAMERA-HW-V1-V2.md`](CAMERA-HW-V1-V2.md) §7–§8.

**Goal:** Make commanded WB change the **viewed RGB** (Viz / detectors / photos that use `ImageCache::GetRGB`), without relying on VicOS `camera_set_awb`.

**Why:** Session B on `192.168.50.189` (2026-09-06): `ApplyManualWhiteBalance` updates overlay through extremes `(3.8,1,0.25)` / `(0.25,1,3.8)` but **image colour never changes**. Black-level bypass also had no visible effect. Gamma `1/G` is confirmed. Canonical log: `docs/mapping/CAMERA-HW-V1-V2.md` §7.

**Default v1 scope:** **Manual software WB first** (reuse Session B knobs). Auto gray-world software WB is Phase 3+, only after manual triples visibly shift colour on-robot.

**Out of scope:** VicOS/`mm-anki-camera` changes; TemporalDenoiseGreen; night brightness/gamma product curve; PHOTO-vs-NEON host tooling; raising AE max exp/gain.

---

## Phase 0 — Documentation discovery (Allowed APIs)

### Allowed APIs (copy; do not invent)

| API / pattern | Source | Use |
|---|---|---|
| Live RGB birth | `ImageBuffer::GetRGBFromBAYER` → `Debayer::Invoke(PERCEPTION)` → `ImageRGB` RGB24 (`imageBuffer.cpp:187-233`) | Mutate **after** successful Invoke |
| Pixel loop | `NeuralNetRunner::ApplyGamma` (`neuralNetRunner.cpp:165-201`) — `IsContinuous` flatten + `PixelRGB` r/g/b | Saturating channel multiply |
| `PixelRGB` / `ImageRGB` | `colorPixelTypes.h`, `image.h` | `pix.r()/g()/b()`; no existing `ScaleChannels` |
| `Array2d::ApplyScalarFunction` | `array2d_impl.h:333-350` | Optional alternate to GetRow loop |
| `cv::saturate_cast<u8>` | Already used in tree | Clamp after `× gain` |
| Session B knobs | `visionComponent.cpp` `kManualWB_R/G/B`, `ApplyManualWhiteBalance`, `kManualCameraControlLock`, `ClearManualCameraControlLock` | Drive gains + freeze AE/WB overwrite |
| `SetAndDisableCameraControl` | `visionComponent.cpp` | Keep for **exp/gain lock**; stop treating AWB send as colour path |
| Gray-world math (later auto) | `ComputeExposureAndWhiteBalance` / private `ComputeWhiteBalanceAdjustment` (`cameraParamsController.cpp:661-798`) | Estimate on **uncorrected** RGB only |
| Console macros | `consoleInterface.h` | Same as Session B |
| HTTP verify | `docs/development/web-server.md` `/consolevarset`, `/consolefunccall` | On-robot A/B |

### Anti-patterns (do NOT)

- Expect `camera_set_awb` to change pixels (Session B disproved).
- Mutate via `ImageCache::GetRGB` return value — it is **`const ImageRGB&`**.
- Assume one Full-res RGB then scale — each `ImageCacheSize` **re-debayers** from RAW (default consumer size **Half**).
- Put software WB only in MirrorMode / NeuralNetRunner copies — Viz and detectors would miss it.
- Run auto gray-world on **already software-corrected** RGB (adj→1 feedback) without a pre-correct buffer.
- Use `ColorRGBA` for image pixels.
- Rely on `kLinearizeForAutoExposure` for RGB WB — it is **AE hist only**, default off; production WB stats are **gamma-encoded**.
- Ship auto-only first — estimator already rails to **3.8/1/3.8** in the dark test scene.

### Confidence / gaps

- **High:** Injection after `GetRGBFromBAYER` Invoke; Session B; no ScaleChannels API; gray path is separate Y8.
- **Medium:** Whether 3.8× on 8-bit gamma RGB is enough to un-green Xray (measure in Phase 2 on-robot).
- **Unknown:** Best separate software-WB gain rails if we drop analog 0.25–3.8 clamp later.

---

## Phase 1 — Software WB multiply hook (core)

### What to implement

1. Add a small helper (new file under `coretech/vision/engine/` **or** static in `imageBuffer.cpp`):

   `void ApplySoftwareWhiteBalance(ImageRGB& rgb, f32 gainR, f32 gainG, f32 gainB);`

   - Copy loop structure from `NeuralNetRunner::ApplyGamma` (`neuralNetRunner.cpp:165-201`).
   - `pix.r() = cv::saturate_cast<u8>(pix.r() * gainR);` same for g/b.
   - Fast-path: if all gains ≈ 1.0, return immediately.

2. Call it at the **end of `ImageBuffer::GetRGBFromBAYER`** after successful `Invoke`, before `return true` (`imageBuffer.cpp:232-233`). That mutates the `ImageRGB` the cache will store for that size.

3. **Gain source (v1):** file-scope atomics or plain `f32` + mutex **or** `CONSOLE_VAR` gains readable from this TU:
   - Prefer: `CONSOLE_VAR_RANGED` **or** shared gains set via setter, registered in a place both engine and `imageBuffer` can use.
   - **Recommended wiring:** add `Vision::SoftwareWhiteBalance::{SetGains,GetGains,IsEnabled}` (tiny singleton/static) in coretech, called from `ApplyManualWhiteBalance` / Clear; read in `GetRGBFromBAYER`. Mirrors `Debayer::SetGamma` pattern (`debayer.cpp:54-60`) without rebuilding ops.
   - Do **not** leave gains only as `Anki::Vector::kManualWB_*` without a coretech-visible copy (engine→cti_vision link direction).

4. Default: software WB **disabled** (gains 1,1,1 / enable false) so stock behaviour unchanged until Apply.

### Doc references

- `imageBuffer.cpp:187-233`
- `neuralNetRunner.cpp:165-201`
- `debayer.cpp:54-60` (setter pattern)
- Session B: `CAMERA-HW-V1-V2.md` §7

### Verification checklist

- [x] `rg ApplySoftwareWhiteBalance` shows helper + single call site in `GetRGBFromBAYER` *(landed as `SoftwareWhiteBalance::ApplyToImage`)*
- [ ] Unit-style or host: RGB buffer with known pixels × (2,1,1) saturates R as expected (if no existing test harness, document manual math check)
- [ ] With enable false / gains 1,1,1: bitwise same as pre-change for a fixed RAW fixture if available; else on-robot “no change until Apply”

### Anti-pattern guards

- Do not edit all three NEON `vst3` sites unless profiling demands it later — C++ post-Invoke is the smallest correct hook.
- Do not apply inside Y8 / `GetGrayFromBAYER` in v1 (markers stay on gray; acceptable).

---

## Phase 2 — Repurpose Session B Apply / lock for software path

### What to implement

1. Change `ApplyManualWhiteBalance` (`visionComponent.cpp`) to:
   - Keep reading current exp/gain and building `CameraParams` with `kManualWB_*`.
   - Call `SetAndDisableCameraControl` **but** force **sensor** WB to `(1,1,1)` (or skip `CameraSetWhiteBalanceParameters`) so a future VicOS fix cannot double-apply.
   - Still store **commanded** software gains in engine `CameraParams` / Viz overlay (so overlay shows ManualWB values users expect) — either keep `SetNextCameraParams` with ManualWB for overlay, while HAL AWB forced to 1,1,1; **or** send ManualWB to Viz explicitly. Prefer: `SetNextCameraParams` with ManualWB for overlay continuity; HAL `CameraSetWhiteBalanceParameters(1,1,1)`.
   - Call `SoftwareWhiteBalance::SetGains(kManualWB_R, kManualWB_G, kManualWB_B)` + `SetEnabled(true)`.
   - Set `kManualCameraControlLock = true` (already).

2. Change `ClearManualCameraControlLock` to:
   - `SoftwareWhiteBalance::SetEnabled(false)` / gains `(1,1,1)`.
   - Existing unlock + re-enable AE/WB.
   - Also force console `AutoExp`/`WhiteBalance` true if needed (Session B Clear left console false until manual set).

3. Optional console: `CONSOLE_VAR(bool, kSoftwareWBEnable, "Vision.PreProcessing", false)` mirrored into the coretech enable flag for live toggle without re-Apply (nice-to-have; Apply remains source of truth for gains).

4. Update cvcatalog blurbs: Apply now **does** change image colour via software multiply; sensor AWB is intentionally pinned.

### Doc references

- `visionComponent.cpp` Apply/Clear/lock (~139-177, UpdateCameraParams lock, SetAndDisableCameraControl)
- `CAMERA-SESSION-B-PLAN.md` Phase 2 (repurpose, do not re-invent knobs)

### Verification checklist (on-robot — gate for Phase 3)

Same dark scene as Session B; lock held:

| Trial | ManualWB | Expect |
|---|---|---|
| T0 | (1,1,1) | Near-baseline colour (identity multiply) |
| T1 | (2,1,1) | **Visibly warmer/redder** |
| T2 | (1,1,2) | **Visibly cooler/bluer** |
| T3 | (3.8,1,0.25) | Strong warm shift |
| Clear | — | Back toward stock AE/WB behaviour |

HTTP same as Session B (`consolevarset` + `consolefunccall?func=ApplyManualWhiteBalance`).

**Pass criterion:** T1/T2 clearly different from each other and from T0. If still identical → multiply hook not on the viewed path (wrong cache size / RawRGB path / enable not set) — debug before auto.

### Anti-pattern guards

- Do not remove ManualWB sliders or invent parallel SoftWB_R/G/B UI in v1.
- Do not claim VicOS AWB fixed.

---

## Phase 3 — Auto software gray-world (only after Phase 2 pass)

### What to implement

1. When `VisionMode::WhiteBalance` is on and software WB enabled for auto:
   - Run existing gray-world on **uncorrected** RGB (estimate **before** multiply, or keep a pre-WB scratch / apply gains only at GetRGB after stats).
   - Clean approach: in `VisionSystem::UpdateCameraParams`, `GetRGB` for stats must see **raw debayer** output. Options:
     - (Preferred) `SoftwareWhiteBalance` disabled during stats frame fetch via a “stats pass” flag; or
     - Estimate inside `GetRGBFromBAYER` before multiply and publish adj to controller (tighter coupling); or
     - Split: controller receives gains; `GetRGB` always applies current gains after Invoke — for stats, temporarily set gains to 1, GetRGB, compute, set new gains (two GetRGB costs) — **avoid** if cache already filled.
   - **Recommended:** apply multiply in `GetRGBFromBAYER` using “output gains”; run AE/WB estimator on a **pre-multiply** path: e.g. compute adj in `ComputeExposureAndWhiteBalance` as today on image that was fetched with gains forced to 1 for that call only (`SoftwareWhiteBalance::ScopedIdentity`).

2. Write estimated R/B into `CameraParams.whiteBalanceGain*` (G stays 1). **Do not** send those to `camera_set_awb` (always 1,1,1 to daemon when software WB auto is on).

3. Confidence / hold-last-good (from earlier review): if well-exposed pixel count too low or `TooDark` at max AE, **freeze** last good software gains (do not walk to 3.8).

4. Separate software WB clamp from analog gain rails if needed (console-ranged e.g. 0.5–2.5 for auto); do not blindly reuse 3.8 as “good”.

### Doc references

- `cameraParamsController.cpp:320-325, 494-499, 661-798`
- `visionSystem.cpp` UpdateCameraParams (~577-635)
- External review notes in `CAMERA-HW-V1-V2.md` §8 (confidence-aware AWB)

### Verification checklist

- [ ] Well-lit neutral target: auto software WB converges without green cast; daemon AWB stays 1,1,1
- [ ] Dark rail scene: gains **do not** slam 3.8 and stay there forever — hold or gentle limit
- [ ] Clear / disable returns identity multiply

### Anti-pattern guards

- Do not enable Phase 3 in the same flash as Phase 1–2 without Phase 2 on-robot pass.
- Do not estimate on post-multiply RGB.

---

## Phase 4 — Docs + catalog

### What to implement

1. Update `docs/mapping/CAMERA-HW-V1-V2.md` §7–§8: software WB path; Session B → software multiply; VicOS AWB still ignored.
2. Add `docs/mapping/CAMERA-SOFTWARE-WB-PLAN.md` (copy of this plan after approval) or point AGENTS landmark at this plan file.
3. Refresh `engine-session-b-camera.json` blurbs for Apply/Clear/ManualWB.
4. AGENTS.md Quick answers + progress log.

### Verification

- [x] Docs state Apply changes **pixels**, not just overlay
- [x] Catalog keys still match UI ids (no `k` prefix)

---

## Phase 5 — Verification closeout

1. Grep: no new reliance on `camera_set_awb` for colour; HAL WB pinned to 1,1,1 when software path active.
2. Confirm multiply runs for default Viz size (Half) — same path as Session A/B viewing.
3. On-robot Phase 2 table filled in mapping doc.
4. No VicOS tree edits.
5. Defaults off / identity when Clear — no surprise green “fix” that is actually max R/B multiply left on.

---

## Suggested file touch list

| File | Change |
|---|---|
| `coretech/vision/engine/softwareWhiteBalance.h/.cpp` (new) **or** helpers in `imageBuffer` | Gains enable + `ApplySoftwareWhiteBalance` |
| `coretech/vision/engine/imageBuffer/imageBuffer.cpp` | Call apply after Invoke |
| `coretech/vision/CMakeLists.txt` | Add new .cpp if split file |
| `engine/components/visionComponent.cpp` | Repurpose Apply/Clear; pin daemon AWB |
| `resources/webserver/cvcatalog/vars/engine-session-b-camera.json` | Blurbs |
| `docs/mapping/CAMERA-HW-V1-V2.md` | Results + architecture note |
| `AGENTS.md` | Landmark / progress |

---

## Execution notes

- Mapping-phase repo: implementation needs explicit user go-ahead after plan approval (`/do` or “implement”).
- Do not run `vbuild` unless asked.
- On-robot Phase 2 is the **hard gate** before auto WB.
- Persistence: after approval, save durable copy to `docs/mapping/CAMERA-SOFTWARE-WB-PLAN.md`.
