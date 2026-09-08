# Plan: CPU-hot backpack lights (`CpuOverheated` + `LowBatteryCpuOverheated`)

**Status:** Implemented 2026-09-08 (Phases 1–5 code/assets/catalog). User JSON from /tmp/CPUOverHeated.json and /tmp/CPUOverHeated_lowBatt.json. Phase 8 vbuild and on-robot A/B **not run**.

**Goal:** When **CPU** temperature is ≥ 90 °C, play dedicated backpack LED patterns (not charger-cooldown `Overheated`). User will supply JSON; until then stub from existing thermal files. Custom packs must include the new files (loader is a **full overlay**, not a merge).

**Durable copy after approval / during execute docs:** `docs/mapping/CPU-OVERHEAT-BACKPACK-LIGHTS-PLAN.md`

**Out of scope:** `conditionHighTemperature.cpp`, charger-cooldown `if`s, `IsBehaviorBackpackLightActive`, `robotDataLoader.cpp` / sentinels, `Idle_09` / `Offline_Off`.

**Related (separate):** charger-cooldown ~41 °C uses `Overheated` / `ChargingOverheated` / `ChargingLowBatteryOverheated` — see [`OVERHEAT-BACKPACK-LIGHTS-PLAN.md`](OVERHEAT-BACKPACK-LIGHTS-PLAN.md). Do not reuse those triggers for CPU.

---

## Phase 0 — Documentation Discovery (Allowed APIs)

### Sources

- `robot/clad/src/clad/types/backpackAnimationTriggers.clad` — alphabetical enum + `EnumToString`
- `resources/assets/cladToFileMaps/BackpackAnimationTriggerMap.json` — `{ CladEvent, AnimName }`
- `animProcess/src/cozmoAnim/backpackLights/animBackpackLightComponent.cpp` — `UpdateCriticalBackpackLightConfig` L93–169; `CONSOLE_VAR` L34–35; `#include "osState/osState.h"` L28
- `osState/osState.h` — `uint32_t GetTemperature_C() const`
- `osState/osState_vicos.cpp` L61–62, L424–426 — `kSendFakeCpuTemperature` / `kFakeCpuTemperature_degC`
- `animationStreamer.cpp` L213, L1441–1451 — overlay 90 °C is `#if ANKI_DEV_CHEATS` only; **do not** reuse that ifdef
- `animProcess/src/cozmoAnim/robotDataLoader.cpp` L57–59, L188–197 — exclusive custom → WireOS → stock
- `engine/components/lightsConfig.h` L36–42 — custom sentinels `off.json` AND `cubeSpinner/purple/spinner_purple_celebration.json`
- `cannedAnimLib/cannedAnims/cannedAnimationLoader.cpp` — recursive `*.json` scan
- `backpackLightAnimationContainer.cpp` — play by **basename**
- Stock `overheated.json` / `badCharger.json` — JSON schema
- `resources/webserver/cvcatalog/vars/anim-speech-noise.json` — `OfflineTimeBeforeLights_ms` catalog shape (key **drops** `k`)
- `docs/mapping/OVERHEAT-BACKPACK-LIGHTS-PLAN.md` — charger-cooldown v1 (leave those `if`s)

### Allowed APIs / touch surfaces

1. Clad: `CpuOverheated`, `LowBatteryCpuOverheated` (PascalCase like `ChargingOverheated`, **not** `CpuOverHeated`).
2. Map: `AnimName` = json stem `cpuOverheated` / `lowBatteryCpuOverheated`.
3. JSON: seven keys, 3× RGBA. Copy schema from `resources/config/engine/lights/backpackLights/overheated.json`.
4. Selection: `OSState::getInstance()->GetTemperature_C() >= kCpuOverheatBackpackTemp_C` in `UpdateCriticalBackpackLightConfig` only.
5. Console: `CONSOLE_VAR(u32, kCpuOverheatBackpackTemp_C, "Backpacklights", 90);` next to existing backpack vars.
6. Packs (drop **both** JSON into **each**):
   - `resources/config/engine/lights/backpackLights/`
   - `resources/config/engine/lights/backpackLightsWireOS/`
   - `docs/mapping/examples/customBackpackLights/`
   - `docs/mapping/examples/customBackpackLights-hotpink-yellow/`
7. Catalog: `CpuOverheatBackpackTemp_C` in `anim-speech-noise.json` (or a backpack shard if splitting later).
8. Fake test: existing `kSendFakeCpuTemperature` + `kFakeCpuTemperature_degC` (category `OSState.Temperature`).

### Custom pack (no C++ loader change)

Custom is **exclusive**: if both sentinels exist, **only** `/data/data/customBackpackLights/` is scanned. Missing basename → `NullAnim` / dark for that trigger. Adding files to stock does **not** fill a live custom pack. Example packs in `docs/mapping/examples/` must get the new JSON so the next upload includes them. On-robot packs already deployed need a copy + **anim restart**.

### Anti-patterns

1. Reuse `Overheated` / `overheated.json` for CPU (that is **full-battery charger cooldown**).
2. Edit `conditionHighTemperature.cpp`.
3. Add CPU triggers to `IsBehaviorBackpackLightActive()`.
4. Gate lights on `ANKI_DEV_CHEATS` or read `kThermalAlertTemp_C` (symbol missing in non-cheat builds).
5. Call engine `GetCpuTemperature_degC()` from anim — use `OSState::GetTemperature_C()`.
6. Put `LowBatteryCpuOverheated` **after** the existing `LowBattery` branch (it would never run).
7. Change `robotDataLoader.cpp` or sentinels — scan-all already works.
8. Invent `LowBatteryOverheated.json` / `CpuOverHeated` spelling.
9. Merge custom with stock (firmware does not).

### Product: critical priority (copy this order)

1. Streaming (unchanged)
2. **LowBatteryCpuOverheated** — `_isBatteryLow && !_isOnChargerContacts && cpuHot`
3. LowBattery — `_isBatteryLow && !_isOnChargerContacts`
4. Charger-cooldown trio (unchanged) — 41 °C dock stays distinct when CPU is also hot
5. **CpuOverheated** — `cpuHot` (beats Offline / Muted / Charging; not Streaming)
6. Offline → Muted → behavior Off → Alexa → Charging

---

## Phase 1 — CLAD enum + EnumToString

**What:** Insert two values alphabetically in `robot/clad/src/clad/types/backpackAnimationTriggers.clad`. `Count` last. Mirror in `EnumToString`.

Copy insert:

```
  ChargingOverheated,
  CpuOverheated,
  DanceToTheBeat,
  ...
  LowBattery,
  LowBatteryCpuOverheated,
  LowBatteryOverheated,
```

Same names as `verbatim "CpuOverheated"` / `"LowBatteryCpuOverheated"`.

**Refs:** clad file comment “keep alphabetical”; charger-cooldown v1 Phase 1.

**Verify:**

- [x] `rg CpuOverheated|LowBatteryCpuOverheated` shows enum + EnumToString
- [x] alpha order; `Count` last

**Anti-patterns:** `CpuOverHeated`. Do not restore `Idle_09`.

---

## Phase 2 — Trigger map

**What:** Two rows in `resources/assets/cladToFileMaps/BackpackAnimationTriggerMap.json`. Shape = existing `ChargingOverheated` object.

| CladEvent | AnimName |
|---|---|
| `CpuOverheated` | `cpuOverheated` |
| `LowBatteryCpuOverheated` | `lowBatteryCpuOverheated` |

Insert Cpu row after `ChargingOverheated`; LowBatteryCpu after `LowBattery` / before `LowBatteryOverheated`.

**Verify:**

- [x] `python3 -m json.tool` on the map
- [x] four strings present (`CpuOverheated`, `cpuOverheated`, `LowBatteryCpuOverheated`, `lowBatteryCpuOverheated`)

**Anti-patterns:** AnimName `badChargerCpu` (not requested). Do not remap `Overheated`.

---

## Phase 3 — JSON in all four pack trees

**What:** Add `cpuOverheated.json` and `lowBatteryCpuOverheated.json` at pack **root** (not under `cubeSpinner/`).

**Content (landed):** Stubs were **not** used. User files `/tmp/CPUOverHeated.json` and `/tmp/CPUOverHeated_lowBatt.json` were copied as `cpuOverheated.json` / `lowBatteryCpuOverheated.json` into every pack folder (customLedPack is a full overlay).

Original stub fallback (unused):

- `cpuOverheated.json` ← copy `resources/config/engine/lights/backpackLights/overheated.json`
- `lowBatteryCpuOverheated.json` ← copy `resources/config/engine/lights/backpackLights/badCharger.json` (or overheated if user prefers one family until they replace)

Identical copies into:

1. `resources/config/engine/lights/backpackLights/`
2. `resources/config/engine/lights/backpackLightsWireOS/`
3. `docs/mapping/examples/customBackpackLights/`
4. `docs/mapping/examples/customBackpackLights-hotpink-yellow/`

Do **not** edit `robotDataLoader.cpp`. Example READMEs: one line that custom upload must include these two files (and still both sentinels).

**Verify:**

- [x] `ls` all four dirs for both names
- [x] `python3 -m json.tool` each; seven keys present

**Anti-patterns:** Only adding to stock. Nested `customBackpackLights/customBackpackLights/`. Changing sentinels.

**On-robot note (docs, not code):** after flash, copy the two JSON onto `/data/data/customBackpackLights/` if CUSTOM LIGHTS ON, then restart anim.

---

## Phase 4 — Selection `if`s + console threshold

**File:** `animProcess/src/cozmoAnim/backpackLights/animBackpackLightComponent.cpp`

**What:** Next to L34–35:

```cpp
CONSOLE_VAR(u32, kCpuOverheatBackpackTemp_C, "Backpacklights", 90);
```

In `UpdateCriticalBackpackLightConfig`, after `trigger = Off`, before Streaming:

```cpp
  const bool cpuOverheated =
    OSState::getInstance()->GetTemperature_C() >= kCpuOverheatBackpackTemp_C;
```

Then **replace** the LowBattery `else if` with the two-step (Streaming stays first):

```cpp
  if(isCloudStreamOpen)
  {
    trigger = BackpackAnimationTrigger::Streaming;
  }
  else if( _isBatteryLow && !_isOnChargerContacts && cpuOverheated )
  {
    trigger = BackpackAnimationTrigger::LowBatteryCpuOverheated;
  }
  else if( _isBatteryLow && !_isOnChargerContacts )
  {
    trigger = BackpackAnimationTrigger::LowBattery;
  }
  // existing charger-cooldown trio UNCHANGED
  else if( ... ChargingLowBatteryOverheated ... )
  ...
  else if ( ... Overheated ... )
  {
    trigger = BackpackAnimationTrigger::Overheated;
  }
  else if( cpuOverheated )
  {
    trigger = BackpackAnimationTrigger::CpuOverheated;
  }
  else if(_offlineAtTime_ms > 0 &&
```

**Refs:** this plan Phase 0 order; `GetTemperature_C` in `osState.h`; overlay value 90 from `animationStreamer.cpp` (value only).

**Landed line numbers:** `CONSOLE_VAR` L36; `cpuOverheated` L97–99; `LowBatteryCpuOverheated` L106–108; `CpuOverheated` L149–151.

**Verify:**

- [x] `rg kCpuOverheatBackpackTemp_C` in that cpp
- [x] LowBatteryCpu branch **before** LowBattery
- [x] CpuOverheated **after** charger-cooldown trio, **before** Offline
- [x] `IsBehaviorBackpackLightActive` unchanged
- [x] no `ANKI_DEV_CHEATS` around the new code
- [x] charger-cooldown predicates byte-identical

**Anti-patterns:** `hotBattery = true`; `IS_STATUS_FLAG_SET`; engine includes.

---

## Phase 5 — cvcatalog tooltip

**What:** Add `CpuOverheatBackpackTemp_C` to `resources/webserver/cvcatalog/vars/anim-speech-noise.json` (same object shape as `OfflineTimeBeforeLights_ms`). Catalog key **without** `k`.

- process: `anim`
- category: `Backpacklights`
- default 90; related: `SendFakeCpuTemperature`, `FakeCpuTemperature_degC`
- howTo: fake CPU to 92 to test without heat; lower this var to trip earlier
- evidence: backpack cpp L36, L97–99, L106–108, L149–151

If catalog registry requires listing the shard, do not duplicate if this file is already registered.

**Verify:**

- [x] JSON still parses
- [x] key is `CpuOverheatBackpackTemp_C` not `kCpuOverheatBackpackTemp_C`

---

## Phase 6 — Docs closeout

**What:**

1. Write this plan to `docs/mapping/CPU-OVERHEAT-BACKPACK-LIGHTS-PLAN.md`.
2. Short pointer from `docs/mapping/TODO-overheat-backpack-lights.md` / OVERHEAT plan: CPU lights are a **separate** trigger, not `Overheated`.
3. Example pack READMEs: list the two new files.
4. `AGENTS.md` §6 landmark + §7 log line (do not clobber unrelated uncommitted hunks).
5. Do not edit upstream `docs/FAQ.md`.

**Verify:**

- [x] plan exists
- [x] AGENTS log appended

---

## Phase 7 — Verification (final)

### Static

- [x] clad enum + EnumToString for both names, alphabetical
- [x] map two rows; `json.tool` OK
- [x] both JSON in all four pack dirs
- [x] selection order matches Phase 0
- [x] `rg conditionHighTemperature` git diff empty
- [x] `rg CpuOverheated animProcess/.../IsBehaviorBackpackLightActive` empty (not in that switch)
- [x] catalog key present

### On-robot (after rebuild/flash — Phase 8)

- [ ] Stock or WireOS: `kSendFakeCpuTemperature=true`, `kFakeCpuTemperature_degC=92` → `CpuOverheated` pattern
- [ ] Same fake + low battery off charger → `LowBatteryCpuOverheated` (not plain LowBattery)
- [ ] Fake off, on charger cooldown flags → still Charging*Overheated / Overheated (not CPU)
- [ ] Streaming still beats CPU
- [ ] Face overlay `"92C"` may also appear (dev cheats); that is independent
- [ ] If CUSTOM LIGHTS ON: copy two JSON to `/data/data/customBackpackLights/`, restart anim, retest

---

## Phase 8 — Build (only when user asks)

Rebuild clad + `vic-anim` (`source setenv.sh` / `vbuild` per user). Prior charger-cooldown enum also needs this if not built yet.

**Anti-pattern:** claiming lights work from overlay alone without this flash.

---

## Suggested execute order

`1 → 2 → 3 → 4 → 5 → 7 static` in one change set. User JSON can replace stubs in Phase 3 anytime. `8` then on-robot. `6` docs with the code.

**Landed:** Phases 1–5 + Phase 7 static done 2026-09-08 (user JSON, not stubs). Phase 6 this pass. Phase 8 + on-robot A/B still pending.

**Implementer one-liner:** Add `CpuOverheated` / `LowBatteryCpuOverheated` clad+map; drop both JSON into stock, WireOS, and both example custom packs (custom is exclusive overlay); select via `OSState::GetTemperature_C() >= 90` after Streaming, with LowBatteryCpu **before** LowBattery and generic CPU **after** charger-cooldown; do not touch `conditionHighTemperature` or reuse `Overheated`.
