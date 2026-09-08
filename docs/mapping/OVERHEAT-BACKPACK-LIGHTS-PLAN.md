# Plan: Wire overheat backpack lights (charger cooldown v1)

**Status:** Implemented 2026-09-07 (Phases 1–4 code/assets). Phase 5 clad/`vbuild` and on-robot A/B **not run**.

**Source TODO:** `docs/mapping/TODO-overheat-backpack-lights.md`  
**Goal:** Restore critical backpack light triggers so the four existing thermal JSON patterns play during **charger cooldown** (~41 °C: `charging && disconnected` on contacts).  
**Out of scope for v1:** off-charger `IS_BATTERY_OVERHEATED` lights, any change to `conditionHighTemperature.cpp`, designer app work, custom-pack UX.

**Related (separate):** CPU ≥ 90 backpack lights are a **separate** pair of triggers (`CpuOverheated` / `LowBatteryCpuOverheated`), not `Overheated`. See [`CPU-OVERHEAT-BACKPACK-LIGHTS-PLAN.md`](CPU-OVERHEAT-BACKPACK-LIGHTS-PLAN.md).

**Durable copy (after approval / during docs phase of execute):** also write this plan to `docs/mapping/OVERHEAT-BACKPACK-LIGHTS-PLAN.md` and flip the TODO status to point at it.

---

## Git archaeology — why it got unwired

Reviewed before planning. No cherry-pick of whole commits.

| SHA | Subject | What it did |
|---|---|---|
| `e162a19f` | Checkpoint here for now, come back later | **Good:** clad + map + stock thermal JSON + charger-cooldown `if`s. **Bad:** `conditionHighTemperature.cpp` forced `hotBattery = true`; also added broken `#define IS_STATUS_FLAG_SET` (enum≠0, always true) used only in commented branches. |
| `0b3f6e8d` | Finish backpack lights | Weakened `Overheated` to `!_isOnChargerContacts && _isBatteryDisconnected` (bad proxy). |
| `92503631` | Fix overheating | Undid `hotBattery=true`; set `skipOverheatCheck = false`. **Not about backpack lights.** Still on HEAD. |
| `406f36cd` | Delete unused… add overheated to WireOS | Moved/added thermal JSON into **WireOS**; removed `Idle_09` / `Offline_Off` only. **Overheated\* clad/map/ifs still live** after this commit. TODO’s “removed clad/map entries” is slightly wrong for this SHA. |
| `9862ed82` | Fix custom and WireOS backpack lights | Loader bugfix (`robotDataLoader.cpp`); same day, unrelated to thermal triggers. |
| `69367189` | Revert "Finish…" (claims missing `602938c0`) | Inverse of `0b3f6e8d` (rewrite SHA). |
| `3b7ddcec` | Revert "Checkpoint…" (claims missing `689c5076`) | Removed selection `if`s + Overheated\* clad/map + **stock** thermal JSON. WireOS JSON survived → today’s half-state. |

**Why unwired (best evidence):** deliberate unwind of a half-baked experiment. The checkpoint bundled a behavior-breaking debug hack (`hotBattery = true`); “Finish” then left an incomplete/weak selection; Aug 2 reverts have **no rationale body** beyond `This reverts commit …`. Not a documented “lights stuck on” bug. `9862ed82` same day fixed pack loading, then thermal WIP was ripped out cleanly while leaving WireOS assets.

**Copy selection from `e162a19f`, not `0b3f6e8d`. Leave out all `conditionHighTemperature` and `IS_STATUS_FLAG_SET` changes.**

---

## Phase 0 — Documentation Discovery (Allowed APIs)

### Sources consulted

- `docs/mapping/TODO-overheat-backpack-lights.md` (full)
- `animProcess/.../animBackpackLightComponent.cpp` `UpdateCriticalBackpackLightConfig` L88–187, `IsBehaviorBackpackLightActive` L242–276, battery latch L559–565
- `robot/clad/src/clad/types/backpackAnimationTriggers.clad` (full enum + EnumToString)
- `resources/assets/cladToFileMaps/BackpackAnimationTriggerMap.json`
- `robot/clad/src/clad/robotInterface/messageEngineToRobot.clad` `BatteryStatus` L673–680
- `engine/components/battery/batteryComponent.h` `IsChargingStalledBecauseTooHot`, `IsBatteryOverheated`
- WireOS pack: `resources/config/engine/lights/backpackLightsWireOS/{badChargerOverheated,overheated,chargingOverheated,chargingLowBatteryOverheated}.json`
- Example packs under `docs/mapping/examples/customBackpackLights*/`
- Git diffs for commits listed above

### Allowed APIs / touch surfaces

1. **`BackpackAnimationTrigger` + `EnumToString`** in `robot/clad/src/clad/types/backpackAnimationTriggers.clad` — keep alphabetical; `Count` last.
2. **`BackpackAnimationTriggerMap.json`** rows: `{ "CladEvent": "<enum>", "AnimName": "<json stem>" }` (note LowBattery → `badCharger` pattern).
3. **`BackpackLightComponent::UpdateCriticalBackpackLightConfig`** — insert branches using only existing members: `_isBatteryLow`, `_isOnChargerContacts`, `_isBatteryCharging`, `_isBatteryFull`, `_isBatteryDisconnected`.
4. **Copy four JSON files** from WireOS (or `docs/mapping/examples/customBackpackLights/`) into stock `resources/config/engine/lights/backpackLights/`.
5. **Rebuild clad** via normal CMake/`vbuild` so `generated/clad/robot` picks up the enum (see `docs/development/clad.md`, `robot/clad/CMakeLists.txt`).
6. Treat Overheated\* as **critical** lights (existing critical Start path L175–187).

### Anti-patterns (do not)

1. Edit `conditionHighTemperature.cpp` (sleep/power-save; not backpack lights).
2. Restore `#define IS_STATUS_FLAG_SET(x) (((uint32_t)RobotStatusFlag::x) != 0)`.
3. Add Overheated\* to `IsBehaviorBackpackLightActive()`.
4. Call engine `BatteryComponent::*` from anim (wrong process).
5. Invent `LowBatteryOverheated.json` — file basename is `badChargerOverheated`.
6. Cherry-pick `e162a19f` / `0b3f6e8d` / reverts wholesale.
7. Use Finish’s `!_isOnChargerContacts && _isBatteryDisconnected` for `Overheated`.
8. Claim off-charger overheat works without a new `BatteryStatus` bit (v1.1 only).

### Current critical priority (insert after #2, before Offline)

| # | Condition | Trigger |
|---|---|---|
| 1 | cloud stream open | `Streaming` |
| 2 | low && !on contacts | `LowBattery` |
| **new** | low && on contacts && charging && disconnected | `ChargingLowBatteryOverheated` |
| **new** | !full && on contacts && charging && disconnected | `ChargingOverheated` |
| **new** | full && on contacts && charging && disconnected | `Overheated` |
| 3 | offline long enough | `Offline` |
| 4 | mic muted | `Muted` |
| 5 | behavior light active | critical → `Off` |
| 6 | Alexa notification | `AlexaNotification` |
| 7 | on contacts && charging && !full && !disconnected | `Charging` |

These new predicates match engine `IsChargingStalledBecauseTooHot()` = `_isCharging && _battDisconnected`, plus contact/low/full discriminators from the checkpoint.

---

## Phase 1 — CLAD enum + EnumToString

**What to implement:** Add four values alphabetically; mirror in `EnumToString`. Copy names/order from `e162a19f` clad hunk (not the Finish/revert mess).

**File:** `robot/clad/src/clad/types/backpackAnimationTriggers.clad`

Insert:

- After `Charging`: `ChargingLowBatteryOverheated`, `ChargingOverheated`
- After `LowBattery`: `LowBatteryOverheated` (enum present for map completeness; **no live selection in v1**)
- After `Offline`: `Overheated`

Same four rows in `EnumToString` with `verbatim "…"`.

**Doc refs:** TODO § Suggested v1 step 1; clad comment “Please keep alphabetical”; `e162a19f` diff for exact spelling.

**Verify:**

- [x] `rg 'Overheated|ChargingLowBatteryOverheated|ChargingOverheated|LowBatteryOverheated' robot/clad/src/clad/types/backpackAnimationTriggers.clad` shows enum + EnumToString pairs
- [x] Alphabetical order preserved; `Count` still last in both places

**Anti-patterns:** Do not rename to match JSON (`badChargerOverheated` is AnimName only). Do not touch other clad files.

---

## Phase 2 — Trigger map rows

**What to implement:** Add four `CladEvent` / `AnimName` objects to `resources/assets/cladToFileMaps/BackpackAnimationTriggerMap.json`, same shape as existing `LowBattery` → `badCharger` entry.

| CladEvent | AnimName |
|---|---|
| `ChargingLowBatteryOverheated` | `chargingLowBatteryOverheated` |
| `ChargingOverheated` | `chargingOverheated` |
| `LowBatteryOverheated` | `badChargerOverheated` |
| `Overheated` | `overheated` |

**Copy from:** `e162a19f` map hunk; TODO table; WireOS basenames.

**Verify:**

- [x] JSON still parses (`python -m json.tool` or equivalent)
- [x] Four rows present; AnimNames match WireOS stems exactly

**Anti-patterns:** Do not use AnimName `LowBatteryOverheated`. Do not remove existing rows. Do not restore `Idle_09` / `Offline_Off` in this plan (separate leftover from `406f36cd`).

---

## Phase 3 — Stock JSON pack (Anki pack must not go dark)

**What to implement:** Copy these four files into `resources/config/engine/lights/backpackLights/`:

- `badChargerOverheated.json`
- `chargingLowBatteryOverheated.json`
- `chargingOverheated.json`
- `overheated.json`

**Preferred source:** `resources/config/engine/lights/backpackLightsWireOS/` (identical content to checkpoint stock JSON for `overheated.json`). Alternate: `docs/mapping/examples/customBackpackLights/`.

WireOS already has them — **do not modify WireOS** unless a content bug is found.

**Verify:**

- [x] `ls resources/config/engine/lights/backpackLights/*[Oo]verheat*` lists four files
- [x] `diff` vs WireOS counterparts is empty

**Anti-patterns:** Do not invent new color patterns in v1. Do not delete WireOS copies.

---

## Phase 4 — Critical selection `if`s (checkpoint logic only)

**What to implement:** In `animProcess/src/cozmoAnim/backpackLights/animBackpackLightComponent.cpp` `UpdateCriticalBackpackLightConfig`, after the LowBattery block (~L126) and before the Offline `else if` (~L132), insert **exactly** the checkpoint predicates:

```cpp
  else if( _isBatteryLow && _isOnChargerContacts && _isBatteryCharging && _isBatteryDisconnected )
  {
    trigger = BackpackAnimationTrigger::ChargingLowBatteryOverheated;
  }
  else if ( !_isBatteryFull && _isOnChargerContacts && _isBatteryCharging && _isBatteryDisconnected )
  {
    trigger = BackpackAnimationTrigger::ChargingOverheated;
  }
  else if ( _isBatteryFull && _isOnChargerContacts && _isBatteryCharging && _isBatteryDisconnected )
  {
    trigger = BackpackAnimationTrigger::Overheated;
  }
```

**Copy from:** `git show e162a19f -- animProcess/.../animBackpackLightComponent.cpp` (the three live branches only).

**Optional comment:** One short note that this mirrors charger cooldown (`IsChargingStalledBecauseTooHot` / 41 °C), not engine `conditionHighTemperature`. No macro.

**Verify:**

- [x] Three branches present; no `IS_STATUS_FLAG_SET`
- [x] No `!_isOnChargerContacts && _isBatteryDisconnected` Overheated branch
- [x] `IsBehaviorBackpackLightActive` switch unchanged (no Overheated cases)
- [x] Includes still compile without adding `robotStatusAndActions.h` solely for the dead macro

**Anti-patterns:** Do not restore commented LowBatteryOverheated / IS_BATTERY_OVERHEATED branches. Do not reorder above Streaming or LowBattery-off-charger.

---

## Phase 5 — Build clad + anim (when user asks to execute)

**What to implement:** Rebuild so generated headers include the new enum values, then build anim (and any dependents). Follow project norms: `source setenv.sh` then `vbuild` / targeted Ninja as the user prefers — **do not run builds until the user asks** (repo AGENTS mapping rule; this plan assumes feature-phase execute).

**Doc refs:** `docs/development/clad.md`, `robot/clad/CMakeLists.txt`, root `README.md` build section.

**Verify:**

- [ ] `generated/clad/.../backpackAnimationTriggers.*` (or robot clad out dir) contains the four names
- [ ] `vic-anim` (or anim target) links without missing-enum errors
- [ ] Grep build log for backpackAnimationTriggers / NullAnim warnings on startup path if runnable

**Anti-patterns:** Do not “fix” unrelated build failures. Do not deploy until Phase 6 checklist is ready.

---

## Phase 6 — Docs closeout

**What to implement (docs only):**

1. Write/copy this plan to `docs/mapping/OVERHEAT-BACKPACK-LIGHTS-PLAN.md`.
2. Update `docs/mapping/TODO-overheat-backpack-lights.md`: status → planned/implemented; correct the `406f36cd` history note (removed Idle_09/Offline_Off; Overheated unwired by `3b7ddcec`); link the plan.
3. Optional one-liner in `AGENTS.md` §6 landmarks / §7 progress log when implemented.
4. Do **not** edit upstream `docs/FAQ.md` for this (it has no backpack-wiring section).

**Verify:**

- [x] TODO no longer says “do not change until asked” after execute completes
- [x] History table matches git archaeology above

---

## Phase 7 — Verification (final)

### Static

- [x] `rg Overheated robot/clad/src/clad/types/backpackAnimationTriggers.clad` → enum + EnumToString
- [x] `rg Overheated resources/assets/cladToFileMaps/BackpackAnimationTriggerMap.json` → four rows
- [x] Stock + WireOS each have four `*overheated*.json`
- [x] `rg 'ChargingLowBatteryOverheated|ChargingOverheated' animProcess/.../animBackpackLightComponent.cpp` → selection only
- [x] `rg IS_STATUS_FLAG_SET animProcess/.../animBackpackLightComponent.cpp` → empty
- [x] `rg hotBattery.*=.*true engine/aiComponent/beiConditions/conditions/conditionHighTemperature.cpp` → empty
- [x] `IsBehaviorBackpackLightActive` still has no Overheated\* cases

### On-robot (when deploy available)

- [ ] WireOS or stock pack loaded; custom pack optional
- [ ] On charger, induce cooldown (`isCharging && isBatteryDisconnected`, battery &gt; 41 °C) → backpack shows orange blink pattern from `chargingOverheated` / `overheated` / `chargingLowBatteryOverheated` as appropriate
- [ ] Cool to ≤ 41 °C → resume normal `Charging` (or Off if full)
- [ ] Off-charger low battery still shows `LowBattery` (unchanged)
- [ ] Streaming still beats thermal lights
- [ ] Log channel `BackpackLightComponent.UpdateCriticalLightConfig` prints the new trigger names on transition

### Explicit non-goals this pass

- Off-charger `LowBatteryOverheated` / `Overheated` via `IS_BATTERY_OVERHEATED` (needs `BatteryStatus.isBatteryOverheated` — v1.1)
- CPU-hot backpack (`CpuOverheated` / `LowBatteryCpuOverheated`) — separate plan [`CPU-OVERHEAT-BACKPACK-LIGHTS-PLAN.md`](CPU-OVERHEAT-BACKPACK-LIGHTS-PLAN.md)
- Restoring `Idle_09` / `Offline_Off`
- Reverting `skipOverheatCheck = false` back to `IsXray()` (separate product decision; left by `92503631`)

---

## Suggested execute order

`Phase 1 → 2 → 3 → 4` (code/assets, can be one PR) → `Phase 5` build when asked → `Phase 7` static verify → deploy A/B → `Phase 6` docs closeout.

**Implementer one-liner:** Restore charger-cooldown backpack lights by copying `e162a19f`’s three critical `if`s + four clad/map entries + four WireOS JSON into stock; never touch `conditionHighTemperature` or the broken `IS_STATUS_FLAG_SET` macro; do not use Finish’s off-charger Overheated proxy.
