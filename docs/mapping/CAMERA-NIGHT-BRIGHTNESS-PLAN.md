# Plan: Night brightness (TooDark / AE-pegged tone lift)

**Status (2026-09-07):** **Phase 1 implemented** (`NightGammaAuto` / `NightDebayerGamma` 2.5 / `NightGammaExitHysteresisFrames` 15). **Phase 2 probe not built.** **Phase 0b soak** may be in progress on robot (`DebayerGamma` 2.5, no flash). Awaiting NightGammaAuto flash + **Session F**. Default `NightGammaAuto=false`.

**As landed (2026-09-07, not yet flashed):** Console vars in `Vision.Debayer` next to `kDebayerGamma` (`engine/components/visionComponent.cpp`). `UpdateNightGammaAuto` runs at the end of `VisionComponent::UpdateCameraParams` after AE params are applied. Enter when auto is on and exp **and** gain are `Util::IsNear` `GetMaxCameraExposureTime_ms()` / `GetMaxCameraGain()` (same rails as `cozmoConfig.h`: 66 ms / 3.8). Exit after `kNightGammaExitHysteresisFrames` consecutive unpegged ticks (or immediately if auto is turned off). `Debayer::SetGamma` only on enter/exit edges. Catalog: `engine-autoexp.json` + `ResetGamma` related in `funcs-vision-anim-text.json`. Canonical log: [`CAMERA-HW-V1-V2.md`](CAMERA-HW-V1-V2.md) Status + Session F.

**Goal:** Make freeplay camera look brighter when AE is already at **66 ms / gain 3.8**, without breaking daytime colour or Session E software WB.

**Why:** Software WB fixes green (~1.15–1.22 R/B) but does **not** lift luminance. Night (and sometimes day) stays dark because AE has no headroom. Session A proved higher `DebayerGamma` brightens at the rail (`2.5` brighter than `2.1` via `x^(1/G)`).

**Out of scope:** Changing `MAX_CAMERA_*` globals as the “fix”; VicOS daemon rewrite; black-level (Session B no-op); MirrorModeGamma / CLAHE / LinearizeForAutoExposure as the viewed-stream lever; folding brightness into WB R/G/B.

**Keep:** `SoftwareWBAuto` behaviour; Xray display restore; ManualWB `SetGains(B,G,R)`.

---

## Phase 0 — Documentation discovery (Allowed APIs)

### Allowed APIs

| API | Source | Use |
|---|---|---|
| `Debayer::SetGamma` / `GetDefaultOpMap` `1/G` | `debayer.cpp:54-60`, `107-110` | Night lift = higher console G |
| `kDebayerGamma` + `ResetGamma` | `visionComponent.cpp:130-136` | Existing manual soak; pattern for auto apply |
| AE rails 1–66 / 0.25–3.8 | `cozmoConfig.h:182-187` | Peg detect: at max exp **and** max gain |
| `ImageQuality::TooDark` | `cameraParamsController.cpp:474-481` | Optional secondary signal; **not** sole 1-frame toggle |
| `GetCurrentCameraParams()` | `visionSystem.cpp` | Read exp/gain for peg detect |
| `SoftwareWBAuto` edge/hold pattern | `visionSystem.cpp:104-110`, `644+` | Copy for night-gamma auto |
| `CameraService::CameraSetParameters` | `cameraService_vicos.cpp:317-332` | Optional probe **above** rails (no clamp) |
| Session B Phase 2b spec | `CAMERA-SESSION-B-PLAN.md` | Max exp/gain probe design |

### Anti-patterns

- Do not raise `MAX_CAMERA_EXPOSURE_TIME_MS` / `MAX_CAMERA_GAIN` as the probe.
- Do not gate night gamma on `TooDark` alone (histogram can clear TooDark while still pegged → flicker).
- Do not use `MirrorModeGamma`, CLAHE, or `LinearizeForAutoExposure` for freeplay look.
- Do not boost WB R/B to “brighten.”
- Do not expect `Exposure_Target*` / `AutoExp_MinGain` to help when already at 66/3.8.
- Do not call `SetGamma` every frame (rebuilds op map) — **edges only**.

### Confidence

- **High:** Gamma 2.5 brightens at rail (Session A); AE cannot exceed 66/3.8 via engine; WB ≠ brightness.
- **Medium:** Auto night-gamma hysteresis values; grain vs faces at 2.5–3.0.
- **Unknown:** VicOS honour of exp/gain > 66/3.8.

---

## Phase 0b — Zero-deploy night soak (do before or with flash)

On robot **tonight** (no rebuild):

1. Leave `SoftwareWBAuto` as-is (user prefers on).  
2. `DebayerGamma` **2.5** → **`ResetGamma`**.  
3. Note brightness vs baseline 2.1; overlay EXP/GAIN (expect still 66/3.8).  
4. Optional try **3.0** + Reset; restore **2.1** + Reset when done / before day.

**Pass:** visibly brighter shadows without wrecking Session E colour.  
Feeds default for `kNightDebayerGamma` in Phase 1.

**Status:** may be in progress on robot (`DebayerGamma` 2.5). Does not require this firmware.

---

## Phase 1 — Night DebayerGamma auto (required; one flash) — **implemented**

### What to implement

Copy `SoftwareWBAuto` edge style in `visionComponent.cpp` or `visionSystem.cpp` (prefer next to `kDebayerGamma` / where AE params are known each tick — **visionSystem** has `GetCurrentCameraParams` after AE, or visionComponent after `UpdateCameraParams`).

1. Console vars (`Vision.Debayer` or `Vision.PreProcessing`):

   | Name | Default | Meaning |
   |---|---|---|
   | `kNightGammaAuto` | **false** | Master enable |
   | `kNightDebayerGamma` | **2.5** (Session A) | Night LUT G when active |
   | Optional `kNightGammaExitHysteresisFrames` | e.g. 15 | Stay in night G until AE un-pegs for N frames |

2. **Enter night G** when all true:
   - `kNightGammaAuto`
   - `exposureTime_ms` at max (≈66) **and** `gain` at max (≈3.8) — use `Util::IsNear` vs `GetMaxCameraExposureTime_ms()` / `GetMaxCameraGain()`
   - Optional: also require `ImageQuality::TooDark` **or** allow enter on peg alone (prefer **peg alone** so we lift whenever AE is stuck, not only when p90 &lt; 20)

3. On enter edge: `Debayer::Instance().SetGamma(kNightDebayerGamma)` (same as ResetGamma).

4. **Exit night G** when exp **or** gain drops below max (lights returned), with hysteresis frames. On exit: `SetGamma(kDebayerGamma)` so daytime Xray returns to **2.1**.

5. While in night mode, if user moves `kDebayerGamma` slider, do **not** fight until exit — or document that `kNightDebayerGamma` is the active value until exit.

6. Catalog blurbs; default **false** until on-robot pass (same discipline as SoftwareWBAuto).

**Landed in** `visionComponent.cpp` (`UpdateNightGammaAuto` after `UpdateCameraParams` applies `params`). Peg-alone (no TooDark gate). Turning auto off restores `kDebayerGamma` immediately.

### Doc references

- Session A gamma table: `CAMERA-HW-V1-V2.md` §7  
- `debayer.cpp` `1/G` + `SetGamma`  
- Peg / TooDark: `cameraParamsController.cpp:441-481`

### Verification checklist

- [x] Grep: `SetGamma` only on enter/exit edges when auto on (code)  
- [ ] Daytime unpegged: stays on `kDebayerGamma` (2.1 Xray)  
- [ ] Night pegged + auto on: LUT uses night G; brighter than 2.1  
- [ ] Software WB still settles (~1.x); no purple slam regression  
- [x] Console: `NightGammaAuto`, `NightDebayerGamma` present (catalog; needs flash to appear on robot)

### Anti-pattern guards

- No per-frame `SetGamma`.  
- No TooDark-only toggle.  
- Do not change Xray showable RGB2BGR restore.

---

## Phase 2 — Optional max exp/gain VicOS probe (same flash if desired) — **not built**

### What to implement

From `CAMERA-SESSION-B-PLAN.md` Phase 2b:

1. `CONSOLE_VAR_RANGED` e.g. `kProbeExposure_ms` (allow **> 66**, e.g. up to 120) and `kProbeGain` (allow **> 3.8**, e.g. up to 8).  
2. `CONSOLE_FUNC` `ApplyProbeExposure` → `CameraService::CameraSetParameters` **directly** + set `kManualCameraControlLock` (or reuse lock) so AE does not overwrite.  
3. `Clear…` restores lock off and re-enables AutoExp.  
4. **Do not** change `cozmoConfig.h` max macros.  
5. Document: overlay may still show 66/3.8; judge by **image**.

### Verification (on-robot)

| Trial | Expect |
|---|---|
| Apply probe 100 ms / 5.0 | Brighter → VicOS honours; **or** unchanged → stop, tone-curve only |
| Clear | AE resumes |

### Anti-pattern guards

- Never `SetNextCameraParams` with OOR values (validation fail).  
- Do not ship probe as default behaviour.

**Default scope for first `/do`:** Phase 1 only. Include Phase 2 only if user asks for both knobs in one flash. **This flash: Phase 1 only.**

---

## Phase 3 — Docs + on-robot protocol

1. Persist plan → `docs/mapping/CAMERA-NIGHT-BRIGHTNESS-PLAN.md`.  
2. Update `CAMERA-HW-V1-V2.md` Status: brightness track; Session F results later.  
3. AGENTS landmark + Quick answer + progress.  
4. Catalog for new vars.

### On-robot Session F (after Phase 1 flash)

| Step | Action | Pass |
|---|---|---|
| F0 | Night, AE pegged, `NightGammaAuto=false`, gamma 2.1 | Baseline dark |
| F1 | Manual soak: DebayerGamma 2.5 + Reset (if not done in 0b) | Brighter |
| F2 | `NightGammaAuto=true`, night G 2.5 | Auto applies; brighter; WB still OK |
| F3 | Add light so AE unpegs | Gamma returns to 2.1 |
| F4 | Optional Phase 2 probe | Honour or not — **not in this flash** |

---

## Phase 4 — Verification closeout

1. No `cozmoConfig.h` max edits.  
2. `SoftwareWBAuto` / ManualWB mapping untouched.  
3. Xray display branches still restored.  
4. Session F table in mapping doc.  
5. Commit when user asks.

---

## Suggested file touch list

| File | Change |
|---|---|
| `engine/components/visionComponent.cpp` and/or `engine/vision/visionSystem.cpp` | Night gamma auto + edges — **visionComponent.cpp landed** |
| `resources/webserver/cvcatalog/vars/*.json` | New knobs — `engine-autoexp.json` + `ResetGamma` related |
| `docs/mapping/CAMERA-NIGHT-BRIGHTNESS-PLAN.md` | This plan |
| `docs/mapping/CAMERA-HW-V1-V2.md` | Status + Session F |
| `AGENTS.md` | Landmark / progress |
| Optional Phase 2 | `visionComponent.cpp` probe func + catalog — **not this flash** |

---

## Execution notes

- **Tonight before code:** Phase 0b soak (`DebayerGamma=2.5` + `ResetGamma`) — orchestrator can drive via HTTP when user is ready.  
- **One flash** for Phase 1 (+ optional Phase 2).  
- Test UI: **vizManager**.  
- Do not `vbuild` unless asked.  
- Prefer **not** enabling `NightGammaAuto` by default until Session F pass.
