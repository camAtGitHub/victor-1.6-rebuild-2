# Camera hardware: Vector 1.0 vs 2.0 (low light / AWB)

**Path:** `docs/mapping/CAMERA-HW-V1-V2.md`  
**Mapped:** 2026-08-23; **revised:** 2026-09-07 (Sessions A–D on-robot; software WB + Phase 3 auto v1; walk-down fix in tree, awaiting Session E)  
**Awaiting:** flash + Session E (walk-down fix landed 2026-09-07 — see **Status**)  
**Confidence:** high (gamma `1/G`, Session B VicOS AWB ignore, manual software multiply, vizManager R/B after RGB2BGR); medium (auto walk-down fix in tree, untested on-robot); low (sensor QE / “smaller pixels”)  
**Upstream docs:** [`docs/architecture/whats_in_victor.md`](../architecture/whats_in_victor.md), [`docs/architecture/visionSystem.md`](../architecture/visionSystem.md).  
**Related plans:** [`CAMERA-SESSION-B-PLAN.md`](CAMERA-SESSION-B-PLAN.md), [`CAMERA-SOFTWARE-WB-PLAN.md`](CAMERA-SOFTWARE-WB-PLAN.md), [`CAMERA-SOFTWARE-WB-PHASE3-PLAN.md`](CAMERA-SOFTWARE-WB-PHASE3-PLAN.md), [`CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md`](CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md). Catalog: `engine-session-b-camera.json`.

How the three head revisions differ in **camera** code, why 2.0 looks grainy green-gray in the dark, and which console/config knobs exist.

### Status (2026-09-07 — walk-down fix in tree; awaiting Session E)

| Area | State |
|---|---|
| Gamma | Confirmed `x^(1/G)` — do not lower to “fix” darkness (Session A) |
| VicOS `camera_set_awb` | **Ignored** for pixels (Session B) — colour must be in-engine |
| Black-level bypass | No visible change in dark test scene (Session B) |
| Manual software WB | **Works** — Apply multiplies RGB after debayer; lock still **gates auto** |
| vizManager R/B | **Fixed** — Xray always `COLOR_RGB2BGR` (Session D T1 red / T2 blue) |
| `SoftwareWBAuto` v1 | **FAIL** (Session D) — hits max R=B rail (purple), stuck when lit. Left default **false**. |
| Walk-down fix | **Landed in tree, not yet flashed** — absolute gray-world (controller WB=`1,1,1` each tick); `SoftwareWBMaxChangeFraction` default **0.15**; `SoftwareWBMaxGain` default **1.5**; auto still default **false**; manual Apply lock gates auto. Plan: [`CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md`](CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md). |
| Robot console | Leave `SoftwareWBAuto=false` until Session E pass |

**Next (priority):**

1. **Flash this tree** and run **Session E** (vizManager): well-lit overlay R/B **settle below** MaxGain rail; dark→bright **walk-down**. Protocol in AUTO-FIX plan Phase 3 and §7 Session E below.  
2. Optional: tune MaxGain / MaxChangeFraction live after Session E (no rebuild).  
3. Parked: night brightness lift, black-level calib, PHOTO/NEON parity, VicOS daemon, denoise.

Test UI: **vizManager** (JPEG via `ConvertToShowableFormat`). Robot used: `192.168.50.189:8888`.

---

## 1. Do not confuse Whiskey with Xray

Head `HW_VER` from factory EMR (`robot/include/anki/cozmo/shared/factory/emrHelper_vicos.h`, `robot/fixture/stm/hwid.h`):

| Generation | `HW_VER` | Code | Camera in *this* tree |
|---|---|---|---|
| Original Vector 1.0 | 4–6 (DVT4 / PVT / MP) | not Whiskey, not Xray | 1280×720 sensor → **640×360** frames |
| Vector 2019 | 7–`0x19` | **`IsWhiskey()`** | **Same camera sizes as 1.0.** ToF / lights / touch differ, not the camera path |
| Vector 2.0 (DDL) | ≥ `0x20` | **`IsXray()`** | **Different camera:** 1600×1200 sensor → **800×600**, `*_2MP` capture formats |

`IsWhiskey()` is **not** used in camera/debayer/AE. Camera branches are `IsXray()`. CCIS face menu prints Xray as `HW: 8` even if EMR is `0x20+` (`animProcess/.../faceInfoScreenManager.cpp`).

The community “cheaper camera / bad low light” robot is **Xray / Vector 2.0**, not 2019 Whiskey.

Stock `whats_in_victor.md` only documents 1280×720, 90°×50° FOV — 1.0 numbers.

---

## 2. What Xray actually changes (camera)

| Item | 1.0 / Whiskey | Xray (2.0) | Where |
|---|---|---|---|
| Processed frame | 640×360 | 800×600 | `cozmoConfig.h` `DEFAULT_CAMERA_RESOLUTION_*` |
| Sensor size | 1280×720 | 1600×1200 | `CAMERA_SENSOR_RESOLUTION_*` |
| Capture enums | `ANKI_CAM_FORMAT_*` | `*_2MP` | `cameraService_vicos.cpp` `megapixels()` |
| Debayer gamma default (console) | **1.7** | **2.1** | `visionComponent.cpp` `kDebayerGamma` — see §5 (LUT uses **`1/G`**) |
| Black-level stretch | off | **on** (`BlackLevelAndNormalize`, NEON only) | `coretech/vision/engine/debayer/neon/raw10.cpp` |
| Temporal denoise | n/a | **defined, never called**; storage would not work across frames | same file |
| AE min/max | 1–66 ms, gain 0.25–3.8 | **same** | `cozmoConfig.h` — no per-sensor AE profile |
| Rolling-shutter divisions | `_rsNumDivisions` | `_rsNumDivisionsXray` | `engine/rollingShutterCorrector.cpp` |

Rebuild note (`CHANGES.md`): “Gamma correction and camera denoiser from WireOS.” Observed Xray-only processing that **runs** is black-level subtract + weak rescale. Temporal denoise is dead (and structurally unfit — §8).

The **sensor driver / ISP apply path is not editable source in either tree.** `platform/camera/` is an IPC client to VicOS `mm-anki-camera` (prebuilt binary). Analog AGC, noise model, and whether commanded AWB sticks live in that daemon. [UNKNOWN] without commanding distinct gains on-robot (§7).

---

## 3. Observed low-light numbers (same scene)

User observation, 2026-08-23, both robots wide open:

| | AWB R G B | EXP | GAIN | Picture |
|---|---|---|---|---|
| **v1** | 1.489, **1.000**, 1.818 | 66 | 3.800 | Usable colour; dim but not crushed |
| **v2** | **3.800, 1.000, 3.800** | 66 | 3.800 | **A lot darker** than v1, plus grainy green/gray |

AE is **pegged on both** (max shutter and max analog gain). Same numbers **do not mean the same brightness**. AWB 3.8/1/3.8 is the colour symptom. Darkness has **actionable software contributors** (black-level; path inconsistencies) plus an **unproven** hardware floor (§5).

---

## 4. How AE / AWB work (same on all HW)

`VisionSystem::UpdateCameraParams` → `CameraParamsController` (`coretech/vision/engine/cameraParamsController.cpp`). Default schedule: AutoExp + WhiteBalance every 5th frame (`resources/config/engine/vision_config.json`).

**Auto-exposure**

- Histogram on **green**; drive a percentile toward a target (config: median → 128).
- Default mode **MinTime**: shorten shutter first, **then raise gain** (noisier in the dark). **MinGain** is the opposite (photos force it).
- Limits: `MIN/MAX_CAMERA_EXPOSURE_TIME_MS` = 1–66; `MIN/MAX_CAMERA_GAIN` = 0.25–3.8 (comment: real min should be 0.1; 0.25 is VIC-6653 bandaid).
- Console `MinCameraGain` (0.1) is **dead** — never read.
- `MaxChangeFraction` 0.0 in config = **rate limit off**.
- If still too dark at max exp+gain → `ImageQuality::TooDark` (90th percentile &lt; `TooDarkValue` 20).

**White balance (gray-world)**

- Green **fixed at 1.0**.
- `newR = oldR * (meanG / meanR)` (same for B), using pixels with R,G,B all in **[15, 240]** (`IsWellExposed`).
- Result clamped to **the analog-gain range 0.25–3.8**. There is **no separate AWB max**.
- Historically applied to the camera for the **next** frame (`CameraService::CameraSetWhiteBalanceParameters`). **Session B closed this as overlay-only:** VicOS/`mm-anki-camera` does not tint the viewed stream. Colour is now **software WB** after debayer ([`CAMERA-SOFTWARE-WB-PLAN.md`](CAMERA-SOFTWARE-WB-PLAN.md)).
- Statistics are taken on the **already gamma-processed RGB** image (not linear / pre-gamma Bayer).

So **`AWB 3.800 1.000 3.800` is the clamp**, not a settled balance. Gray-world still saw G ≫ R and G ≫ B and could not boost chroma further.

If the daemon applied those channel gains, R/B analog paths would be roughly **gain × AWB ≈ 3.8 × 3.8 ≈ 14×** vs green at **3.8×** → chroma noise (grainy green-gray). Session B showed the daemon **ignores** commanded AWB (overlay tracks ManualWB; pixels do not). The engine can still *report* 3.8/1/3.8 while the image stays green from the processed frame. **Do not treat `camera_set_awb` as the colour path.**

Initial params in `VisionSystem` ctor: exp 31 ms, gain 1.0, WB **(2.0, 1.0, 2.0)**.

---

## 5. Why v2 is darker *and* greener (same 66 / 3.8) — corrected

Both robots are fully open. That is **not** “equal brightness.” Pipeline:

VicOS sensor → RAW10 Bayer → engine debayer → RGB → AE (green histogram) + gray-world AWB.

### 5.1 Gamma — original study was **backwards**

Console `kDebayerGamma` is **not** used as the LUT exponent. `Debayer::GetDefaultOpMap` converts to **`1/gamma`** before building ops (`coretech/vision/engine/debayer.cpp`):

```text
// x^(1/G) … classes should be configured to just do powf(x,G)
gamma = … 1.0f/gamma;
```

NEON LUT (`neon/raw10.cpp`): `255 * (i/127)^(1/G)` on the top 7 bits.  
CPU PHOTO LUT (`debayer/raw10.cpp`): `255 * (i/1023)^(1/G)` on full 10 bits.

So **higher console gamma brightens mid/shadows more** (standard encode-style `x^(1/G)`):

| Console `G` | LUT exponent | Example `i=40` (7-bit domain) |
|---|---|---|
| **2.1** (Xray default) | ≈ 0.476 | **~147** |
| **1.7** (1.0 default) | ≈ 0.588 | **~129** |
| 1.0 | 1.0 | ~80 |

*(If you wrongly apply `^(G)` without the inversion — as the 2026-08-23 note did — you get ~22 vs ~36 and conclude “2.1 darkens.” That math does not match this codebase.)*

**Implication:** lowering Xray `DebayerGamma` toward 1.7/1.5 would **reduce** shadow lift and **worsen** darkness at fixed exposure. The original “night gamma first” recommendation is **rejected**.

Header comment in `neon/raw10.h` already hints at this (“If gamma is greater than 1 (i.e. 1/G &lt; 1), then this results in flatter coloring in dark areas”).

### 5.2 Black-level — strongest actionable software darkener / green feeder

Xray-only `BlackLevelAndNormalize` (`neon/raw10.cpp`):

1. Subtract `BLACK_LEVEL_8 = 6`
2. Clip to `WHITE_LEVEL_8 - BLACK_LEVEL_8` → **234** (`WHITE_LEVEL_8 = 240`)
3. Multiply by 255 and narrow-shift by 8 → **`×255/256`**, not a real stretch to full 8-bit white

Net effect: crush near-black signal (especially weak R/B), then slightly darken further. Comment says “increases contrast”; the arithmetic is mostly **black crush**. Excess subtraction can zero faint chroma that gray-world later tries (and fails) to recover → walk to AWB **3.8/1/3.8**.

**PHOTO (CPU) path does not apply this subtraction** and keeps 10-bit indices into its LUT. Perception NEON vs PHOTO can disagree on the same RAW — compare both before blaming the sensor (§8).

### 5.3 Path inconsistencies (NEON)

With `DO_GREEN_AVG` **0** (current default):

- **FULL** RGB: black-level on R, G, G, B — consistent.
- **HALF/QUARTER** RGB: black-level on R, G, B — skips the unused second green (OK for nearest-neighbour pick).
- **EIGHTH** RGB: black-level on **G, G, B only** — **output red skips black correction** then still gets gamma. Systematic R vs G/B mismatch at eighth scale.
- If `DO_GREEN_AVG` were **1**: several branches **skip `BlackLevelAndNormalize` entirely** and only gamma-correct.

### 5.4 Photons / “cheaper sensor”

[~2 MP vs ~0.9 MP](§2) is a real resolution change. Calling that the **proven** reason v2 is darker is **over-claimed**. Same analog “gain 3.8” may not be the same ISO; CFA/QE are not in this tree. Treat hardware as a **remaining** limitation to measure with RAW + commanded exp/WB — after software defects are isolated.

### 5.5 Greener (still largely holds, cause refined)

Black-level (and any path that zeros R/B) leaves G-heavy RGB → gray-world → AWB clamp 3.8/1/3.8. `IsWellExposed` drops pixels with any channel &lt; 15, so dark AWB stats are a thin G-biased sample. Gamma **does not** explain “v2 darker than v1”; if anything Xray’s higher console gamma lifts shadows more than 1.7.

---

## 6. Console vars / config (engine `:8888`)

Catalog: `resources/webserver/cvcatalog/vars/engine-autoexp.json`, `engine-vision-ae-illum.json`.

| Id | Default | Live? | Notes |
|---|---|---|---|
| `AutoExp` | on | yes | Histogram AE |
| `AutoExp_MinGain` | off | yes | Long shutter, low gain (less grain). Photos already force this |
| `AutoExp_Cycling` | off except charger search | yes | Targets 5 → 100 → 250 |
| `WhiteBalance` | on (~every 5th frame) | yes | Gray-world; **Off preserves current gains** (adjR/adjB forced to 1) — does **not** force (1,1,1) |
| `Exposure_TargetPercentile` | **0 = off** | yes | Must be **> 0** to override config; production uses 0.50 |
| `Exposure_TargetValue` | 128 | yes | Ignored unless percentile > 0 |
| `DebayerGamma` | 1.7 / **2.1 Xray** | **partial** | Slider no-op until **`ResetGamma`**; LUT uses **`1/G`** (§5.1) |
| `ResetGamma` | func | yes | Applies `DebayerGamma` |
| `LinearizeForAutoExposure` | false | yes | Undo gamma before AE hist |
| `UseCenterWeightedMetering` | true | yes | |
| `Under/OverExposedThreshold` | 15 / 240 | yes | AWB skip band |
| `MaxFractionOverexposed` | 0.8 | yes | Hard exposure cut if blown out |
| `MinCameraGain` | 0.1 | **dead** | Floor is compile-time 0.25 |
| `Exposure_ms` / `Gain` | playpen | playpen only | Not freeplay |
| `UseCLAHE_*` | WhenDark | markers only | Fiducials, not photos / faces |
| `MirrorModeGamma` | 1 | preview only | Face-screen overlay |
| `NeuralNetRunner_Gamma` | 1 = off | nets only | |

Config file (survives reboot if flashed): `resources/config/engine/vision_config.json` → `ImageQuality` (`InitialExposureTime_ms` 31, `TargetValue` 128, `TooDarkValue` 20, `MaxChangeFraction` 0.0).

SDK `SetCameraSettings` can lock **exp/gain** in 1–66 / 0.25–3.8. **Does not set AWB.** Forcing explicit WB triples needs `VisionComponent::SetAndDisableCameraControl` (playpen) or new console hooks. No CCIS camera/low-light toggle (`CONFIG_MENU.md`).

Charger-only low-light path (`behaviorRobustChargerObservation.cpp`): compositing + max LCD as a torch, or `AutoExp_Cycling`. Does **not** change freeplay faces/motion/photos.

---

## 7. On-robot test plan (console-first → fewer deploys)

UI: `http://<robotIP>:8888/consolevars` (engine). Groups below are the **category / tab path** as registered in code (`CONSOLE_VAR` / `CONSOLE_FUNC` category string). Search by exact **var name** if the tree is nested differently in your build.

**Ignore for this investigation:** `Vision.MirrorMode` → `MirrorModeGamma` (face LCD preview curve only); anim `ProcFace_Gamma*` (eyes, not camera); `Playpen` → `Exposure_ms` / `Gain` unless you are actually in playpen.

**Handy readout:** `Vision.MirrorMode` → `DisplayExposureInMirrorMode` = **true** (default) so the face/mirror overlay shows EXP / GAIN / AWB.

### Session A — **0 deploys** (current firmware)

Dark room, v2, same pose. Prefer WebViz camera view + mirror overlay.

| Step | Category (tab) | Name | What to do | Expect / learn |
|---|---|---|---|---|
| A0 | `Vision.MirrorMode` | `DisplayExposureInMirrorMode` | Ensure **true** | Read EXP / GAIN / AWB on overlay |
| A0b | *(overlay)* | — | Note baseline (often EXP **66**, GAIN **3.8**, AWB **3.8 / 1 / 3.8**) | Confirms AE pegged |
| A1 | `Vision.Debayer` | `DebayerGamma` | Set **1.7** | — |
| A1b | `Vision.Debayer` | **`ResetGamma`** *(console function / button)* | **Run it** — slider alone does nothing | Shadows should look **dimmer** than at 2.1 (`1/G` encode) |
| A1c | `Vision.Debayer` | `DebayerGamma` + `ResetGamma` | Try **2.5**, then restore **2.1** + Reset | 2.5 should look **brighter**; leave at **2.1** when done |
| A2 | `Vision.General.VisionModes` | `AutoExp` | Set **false** | Holds last exposure for fair compares |
| A3 | `Vision.General.VisionModes` | `WhiteBalance` | Set **false** briefly | Gains **freeze** at last values — **not** a VicOS honour test |
| A3b | `Vision.General.VisionModes` | `WhiteBalance` | Set **true** again | Resume gray-world updates |
| A4 *(optional)* | `Vision.PreProcessing` | `UnderExposedThreshold` | Lower toward **0** (default **15**); leave `OverExposedThreshold` at **240** | See if AWB leaves 3.8/1/3.8 when more dark pixels count — probes stats starvation, not daemon |
| A5 *(optional)* | `Vision.General.VisionModes` | `AutoExp_MinGain` | **true** while `AutoExp` on | Less grain before the rail; won’t brighten past max |
| A6 *(optional)* | `Vision.PreProcessing` | `Exposure_TargetPercentile` = **0.5**, `Exposure_TargetValue` = **150–180** | Only if `AutoExp` on | Cannot pass 66/3.8 if already pegged |

**Do not use for camera look:** `Vision.PreProcessing` CLAHE vars (`UseCLAHE_u8`, `Clahe*`) — markers only. `Vision.PreProcessing` → `MinCameraGain` — **dead**. `Vision.General.VisionModes` → `SaveImages` — needs saver params/behavior, not a one-click dump.

### Session B — instrumented knobs (**implemented and live**; 2026-09-06)

Plan: [`CAMERA-SESSION-B-PLAN.md`](CAMERA-SESSION-B-PLAN.md). Knobs below still exist; **Apply now also drives software WB** (Phases 1–2 — needs a new flash vs the Session B binary):

| Category (tab) | Name | Notes |
|---|---|---|
| `Vision.Debayer` | `DebayerBypassBlackLevel` | **true** = skip Xray black-level crush; live (no `ResetGamma`) |
| `Vision.PreProcessing` | `ManualWB_R` / `ManualWB_G` / `ManualWB_B` | 0.25–3.8; sliders alone do **not** change pixels |
| `Vision.PreProcessing` | **`ApplyManualWhiteBalance`** *(func)* | Enables **software WB multiply** with ManualWB_* after debayer; overlay shows those gains; VicOS AWB pinned **1,1,1**; sets lock |
| `Vision.PreProcessing` | `ManualCameraControlLock` | Set by Apply; blocks AE/WB camera pushes |
| `Vision.PreProcessing` | **`ClearManualCameraControlLock`** *(func)* | Disables software WB (gains 1,1,1); clears lock; re-enables AutoExp+WB |

**On-robot protocol (B0–B3):** see Session B plan § Phase 4. Honour triples were `(1,1,1)`, `(2,1,1)`, `(1,1,2)` — **overlay moved, pixels did not** (results below).

**After software WB (Phases 1–2):** the same Apply knobs now change **pixels** via `SoftwareWhiteBalance`. Re-run T0–T3 on-robot per [`CAMERA-SOFTWARE-WB-PLAN.md`](CAMERA-SOFTWARE-WB-PLAN.md) Phase 2. Do not expect VicOS AWB to tint.

Optional max exp/gain probe (Phase 2b) was **not** implemented in this pass.

### Still not console / not one deploy

- NEON vs PHOTO decoder parity on the same RAW (tooling).
- Covered-lens per-channel black calibration (capture procedure + then a fix deploy).
- Sensor part / QE (datasheet).
- Analog “gain 3.8” ISO equivalence (measurement campaign, both robots).

### Deploy count (with this plan)

| Phase | Deploys |
|---|---|
| Session A (gamma, AE pegged, WB-off freeze, optional underexpose) | **0** (done) |
| Session B (black-level + VicOS honour test) | **1** (done; overlay-only) |
| Software WB Phases 1–2 (in-engine multiply) | **+1** to flash; then on-robot colour A/B |
| Phase 3 auto software WB | **+1** only if Phase 2 colour A/B passes |

### Session A live results (2026-09-06, robot `192.168.50.189`)

Same dark scene; overlay stayed **AWB 3.800 / 1.000 / 3.800 · EXP 66 · GAIN 3.800** for every step. Baseline look: overall green tint, dark in light shadows.

| Step | Change | Observed |
|---|---|---|
| Baseline | `DebayerGamma` **2.1** | Dark + green |
| A1 | **1.7** + `ResetGamma` | **Definitely darker**; same greenness |
| A2 | **2.5** + `ResetGamma` | **Brighter**, grainier; still green |
| Restore | **2.1** + `ResetGamma` | Back to baseline brightness |
| A4 | `WhiteBalance` **true**, `UnderExposedThreshold` **0** | **No change** — still 3.8/1/3.8, same green as baseline |
| Restore | `UnderExposedThreshold` **15** | — |

**Closed on-robot:** console gamma is `x^(1/G)` (higher G lifts shadows). Lowering gamma is not a darkness fix. Green is not fixed by gamma or by opening the underexpose WB gate. AE/AWB remain at the rail in this scene.

### Session B live results (2026-09-06, robot `192.168.50.189`, post-instrumentation flash)

Same dark scene. `DebayerBypassBlackLevel` / `ApplyManualWhiteBalance` / lock confirmed present on `:8888`.

| Step | Change | Overlay AWB · EXP · GAIN | Image |
|---|---|---|---|
| B0 | bypass **false** | 3.8 / 1 / 3.8 · 66 · 3.8 | Baseline green + dark (same as Session A) |
| B1 | bypass **true** | unchanged rail | **No visible change** |
| B2 T0 | Apply WB **(1,1,1)** + lock | **1 / 1 / 1** · 66 · 3.8 | Essentially **same colour** (tiny darker only vs screenshots); lock held |
| B2 T1 | Apply **(2,1,1)** | **2 / 1 / 1** | **Same** |
| B2 T2 | Apply **(1,1,2)** | **1 / 1 / 2** | **Same** |
| B2 T3 | Apply **(3.8, 1, 0.25)** | **3.8 / 1 / 0.25** | **Same** |
| B2 T4 | Apply **(0.25, 1, 3.8)** | **0.25 / 1 / 3.8** | **Same** |
| B3 | Clear lock; bypass **false** | restored | — |

**Closed on-robot (Session B):**

1. **Black-level crush is not the visible darkness/green driver** in this scene (bypass no-op to the eye).
2. **Engine successfully commands and reports AWB** (overlay tracks ManualWB after Apply).
3. **VicOS / `mm-anki-camera` does not appear to apply channel AWB gains** to the viewed stream — even rail-to-rail extremes produce no colour shift. Green/dark fixes that rely on sensor AWB will not work from this tree alone.

**Still open:** residual darkness root (sensor/optics/analog gain curve); optional max exp/gain honour (Phase 2b not built); PHOTO vs NEON parity tooling.

### Software WB — Phases 1–2 implemented

Plan: [`CAMERA-SOFTWARE-WB-PLAN.md`](CAMERA-SOFTWARE-WB-PLAN.md).

`ApplyManualWhiteBalance` now:

1. Keeps engine/overlay `CameraParams` at ManualWB_R/G/B (overlay still shows the commanded triple).
2. Pins VicOS `CameraSetWhiteBalanceParameters(1, 1, 1)` so daemon AWB cannot double-apply if it ever starts honouring gains.
3. `SoftwareWhiteBalance::SetGains` + `SetEnabled(true)` — saturating per-channel multiply at the end of `ImageBuffer::GetRGBFromBAYER` (after successful `Debayer::Invoke`). Default disabled / identity until Apply.

### Session C live results (2026-09-06) — software WB flash

| Step | Apply | Overlay | Image |
|---|---|---|---|
| S0 | SW WB off | 3.8 / 1 / 3.8 · 66 · 3.8 | Baseline green/dark |
| T0 | **(1,1,1)** + lock | 1 / 1 / 1 | **Same as baseline** |
| T1 | **(2,1,1)** | 2 / 1 / 1 | **Hella blue** (expected warmer) |
| T2 | **(1,1,2)** | 1 / 1 / 2 | **Very red** |
| Clear | SW WB off | — | restored |

**Closed:** Software multiply **works** (colour changes; Session B did not).  
**Bug (Session C):** `ManualWB_R` looked blue — Xray `ConvertToShowableFormat` skipped `COLOR_RGB2BGR` (vizManager JPEG). **Fix landed:** always RGB2BGR; MirrorMode uses non-swap pack. Re-A/B T1/T2 on next flash before `SoftwareWBAuto`.

**Phase 3:** `SoftwareWBAuto` (default false) — in-engine gray-world, VicOS pinned 1,1,1, hold on TooDark/low well-exposed, rails Min/MaxGain. Plan: `CAMERA-SOFTWARE-WB-PHASE3-PLAN.md`.

### Session D live results (2026-09-06) — vizManager + Phase 3 flash

| Step | Result |
|---|---|
| T1 `(2,1,1)` | **Very red/orange** — R/B display fix **PASS** |
| T2 `(1,1,2)` | **Super blue** — R/B display fix **PASS** |
| `SoftwareWBAuto=true` (MaxGain **2.5**) | Overlay → **2.5 / 1 / 2.5**; image **purple**; blue-green mug → **red/orange** |
| MaxGain **1.3** then auto (night) | Overlay → **1.3 / 1 / 1.3**; cast **blue/purple**; yellow toy → **blue**; bright light **still stuck** |
| Daytime MaxGain **1.3** auto (2026-09-07) | Still **1.3 / 1 / 1.3**, EXP/GAIN **66 / 3.8**; bluer; **yellow→blue, cyan→yellow, blue mug→yellow/brown** |
| Auto off | restored |

**Closed:** vizManager R/B labels correct after RGB2BGR fix.  
**Open (auto v1):** always hits max R=B rail; object colours inverted/wrong day and night; AE still pegged 66/3.8 even in daytime auto test. Daytime alone does not rescue auto v1. **Walk-down fix is now in tree** (absolute integrator + slew) — awaiting flash + Session E.

### Session E protocol (walk-down fix — **not yet run**)

Plan: [`CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md`](CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md). One flash of this tree; test via **vizManager**. Leave auto **false** when done.

| Step | Action | Pass |
|---|---|---|
| 0 | Confirm `SoftwareWBAuto=false`; optional T1 `(2,1,1)` / T2 `(1,1,2)` | R/B still red / blue |
| 1 | `SoftwareWBMaxGain=1.5`, `SoftwareWBMaxChangeFraction=0.15`, AutoExp+WB on | — |
| 2 | Auto **true**, well-lit | Overlay R/B **below** max rail and **stable-ish**; colours not wildly inverted |
| 3 | Cover lens / dark briefly then uncover (or move to window) | Gains **decrease** when brighter |
| 4 | Tune MaxGain / MaxChangeFraction live if needed | no rebuild |
| 5 | Auto **false** when done | restored |

**Fail:** still glued to MaxGain R=B in good light after 10+ s.

---

## 8. What software could do (this repo) — revised priority

Scope: **this** tree only. Daemon/ISP edits are out of band (`mm-anki-camera` prebuilt).

**Preferred order (post walk-down fix in tree):**

1. **Flash + Session E** — re-test auto on-robot (well-lit settle below rail; dark→bright walk-down). Keep default **false** until pass. See Status + AUTO-FIX plan. Manual path is good; auto v1 is not.  
2. Optional: tune MaxGain / MaxChangeFraction live after Session E.  
3. **Night / TooDark brightness lift** (optional). Higher console gamma already brightens (`1/G`). Black-level bypass was a no-op in dark Session B.

4. **Make processing consistent across paths** (park until colour/brightness is measured)  
   - EIGHTH: apply black-level to **red** as well (or none — but not G/B-only).  
   - `DO_GREEN_AVG` branches must not silently skip black-level.  
   - Align PHOTO (10-bit, no subtract) vs NEON (7-bit + subtract) policy deliberately.

5. **Denoise only after the above**  
   - Do **not** “just call” `TemporalDenoiseGreen`: it is **never invoked**; `prevG1`/`prevG2`/`prevValid` are **reset every conversion** inside local `StoreInfo`; arguments are SIMD vectors, not a previous frame buffer. A real fix needs motion-aware frame history, preferably preserving RAW10 precision, plus chroma denoise — new design, not a one-line enable.

6. **Gamma** — leave Xray 2.1 unless measurement says otherwise; it is a **shadow lift**, not the darkness bug. Raising console gamma further would brighten more; lowering worsens darkness.

7. **Longer shutter / higher gain** — only if VicOS honors values past current limits [UNKNOWN].

8. **VicOS/`mm-anki-camera` AWB ignore root-cause** — parallel/optional; daemon is prebuilt and out of this tree.

Hardware may still limit how close 2.0 can get to 1.0 after software is cleaned up; that needs RAW + response curves, not more speculation.

---

## 9. Key files

| Path | Role |
|---|---|
| `robot/include/anki/cozmo/shared/cozmoConfig.h` | Resolution, AE min/max |
| `robot/include/anki/cozmo/shared/factory/emrHelper_vicos.h` | `IsWhiskey` / `IsXray` |
| `platform/camera/cameraService_vicos.cpp` | 1MP vs 2MP formats; `CameraSetParameters` / AWB |
| `platform/camera/vicos/camera_client/` | IPC to VicOS `mm-anki-camera` |
| `engine/components/visionComponent.cpp` | `kDebayerGamma`; `ApplyManualWhiteBalance` / Clear (software WB + daemon pin 1,1,1) |
| `engine/vision/visionSystem.cpp` | AE/AWB tick, initial params |
| `coretech/vision/engine/softwareWhiteBalance.h/.cpp` | In-engine saturating R/G/B multiply; default off |
| `coretech/vision/engine/imageBuffer/imageBuffer.cpp` | `GetRGBFromBAYER` calls `SoftwareWhiteBalance::ApplyToImage` after Invoke |
| `coretech/vision/engine/cameraParamsController.cpp` | Gray-world + MinTime/MinGain; WB Off = hold gains |
| `coretech/vision/engine/debayer.cpp` | **`gamma = 1/gamma`** before ops |
| `coretech/vision/engine/debayer/neon/raw10.cpp` | Xray black-level; path inconsistencies; dead temporal denoise |
| `coretech/vision/engine/debayer/raw10.cpp` | CPU PHOTO path (10-bit LUT, no black subtract) |
| `resources/config/engine/vision_config.json` | ImageQuality / mode schedules |
| `resources/webserver/cvcatalog/vars/engine-session-b-camera.json` | Console blurbs for bypass + ManualWB Apply/Clear |

---

## 10. Open questions

- ~~[UNKNOWN] Does `mm-anki-camera` apply commanded AWB r/g/b on Xray?~~ — **Closed Session B:** overlay tracks ManualWB; **image colour unchanged** even at 3.8/1/0.25 and 0.25/1/3.8. Colour path is software WB.
- [UNKNOWN] On-robot: does software WB T1 `(2,1,1)` vs T2 `(1,1,2)` visibly shift colour vs T0? (Phase 2 gate in [`CAMERA-SOFTWARE-WB-PLAN.md`](CAMERA-SOFTWARE-WB-PLAN.md).)
- [UNKNOWN] Analog gain curve / ISO mapping for “3.8” on 2.0 vs 1.0.
- [UNKNOWN] 2.0 sensor part number / CFA / QE (not in this tree).
- [UNKNOWN] Whether raising `MAX_CAMERA_EXPOSURE_TIME_MS` or `MAX_CAMERA_GAIN` is honored on Xray.
- ~~[UNKNOWN] How much of the observed darkness remains after bypassing black-level (robot A/B).~~ — **Closed Session B:** bypass **no visible change** in the dark test scene.
- ~~[INFERRED] v2 darker because gamma 2.1 darkens~~ — **retracted**; LUT uses `1/G`.
- [INFERRED] Session B: green is not from applied sensor AWB (daemon ignores it). Remaining software colour lever is the post-debayer multiply; hardware floor unproven until measured.

---

## 11. Agreement with external review (summary)

| Claim | Verdict |
|---|---|
| Gamma recommendation in the old study was backwards (`1/G`; 2.1 brightens more than 1.7) | **Agree** — verified in `debayer.cpp` + LUT math |
| Fix black-level first; A/B bypass at fixed exp/gain/WB | **Agree** |
| `BlackLevelAndNormalize` subtract 6, clip ~234, `×255/256` darkens / crushes | **Agree** |
| Disabling AWB is a bad VicOS honour test (holds last gains) | **Agree** — `adjR=adjB=1` only |
| Command `(1,1,1)` / `(2,1,1)` / `(1,1,2)` instead | **Agree** |
| Confidence-aware AWB; stats before gamma; own WB limits; don’t blindly cut the cap | **Agree** as design direction |
| NEON eighth skips black-level on red; `DO_GREEN_AVG` bypasses; PHOTO differs | **Agree** — confirmed in `neon/raw10.cpp` / `raw10.cpp` |
| Don’t just enable `TemporalDenoiseGreen` (no call sites; storage resets; not a frame buffer) | **Agree** |
| “Smaller pixels / cheaper sensor” unproven; measure RAW | **Agree** — downgraded in §5.4 |
| Lower gamma to fix darkness | **Disagree with old study** — reviewer correct to reject it |
