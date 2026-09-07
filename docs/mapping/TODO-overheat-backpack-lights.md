# TODO — Wire overheat backpack lights (easy win)

**Status:** Implemented (charger-cooldown v1) 2026-09-07. Plan: [`OVERHEAT-BACKPACK-LIGHTS-PLAN.md`](OVERHEAT-BACKPACK-LIGHTS-PLAN.md). Phase 5 clad/`vbuild` and on-robot A/B **not run**. Optional v1.1 (off-charger `isBatteryOverheated`) **not done**.  
**Opened:** 2026-08-27  
**Why easy:** the four thermal JSON files already existed in the WireOS pack. The missing piece was restoring the trigger enum + map + a few `if`s in anim. Reverted commits were a recipe, not a patch to cherry-pick blindly.

## What landed (charger-cooldown v1)

WireOS (and custom example packs) include:

| Trigger (intended) | File |
|---|---|
| `LowBatteryOverheated` | `badChargerOverheated.json` (not `LowBatteryOverheated.json`) |
| `Overheated` | `overheated.json` |
| `ChargingOverheated` | `chargingOverheated.json` |
| `ChargingLowBatteryOverheated` | `chargingLowBatteryOverheated.json` |

Paths: `resources/config/engine/lights/backpackLightsWireOS/`  
Also in `docs/mapping/examples/customBackpackLights/` (and hotpink sibling).

Stock Anki pack **now has copies** of these four files under `resources/config/engine/lights/backpackLights/` (copied from WireOS; WireOS was not modified).

Charger-cooldown v1 wiring (checkpoint predicates only; `charging && disconnected` on contacts):

- `robot/clad/src/clad/types/backpackAnimationTriggers.clad` — four Overheated* / LowBatteryOverheated enum + EnumToString rows (alphabetical; `Count` last)
- `resources/assets/cladToFileMaps/BackpackAnimationTriggerMap.json` — four `CladEvent` / `AnimName` rows (`LowBatteryOverheated` → `badChargerOverheated`)
- `animProcess/.../animBackpackLightComponent.cpp` `UpdateCriticalBackpackLightConfig` — three critical `if`s after LowBattery / before Offline, using `_isBatteryLow` / `_isOnChargerContacts` / `_isBatteryCharging` / `_isBatteryFull` / `_isBatteryDisconnected`

`LowBatteryOverheated` enum exists for map completeness; **no live selection in v1**.

Designer note that “WireOS omits 4 thermal files” is **inverted**: WireOS has them; stock now does too. Designer already lists the four modes.

**Still not wired:** off-charger `Overheated` / `LowBatteryOverheated` (needs `BatteryStatus.isBatteryOverheated` — v1.1).

**Anti-patterns (still do not):**

- Do **not** edit `conditionHighTemperature.cpp` (sleep/power-save; not backpack lights).
- Do **not** restore `#define IS_STATUS_FLAG_SET(x) (((uint32_t)RobotStatusFlag::x) != 0)` — that is **always true** (enum value vs 0, no robot-state bits).
- Do **not** add Overheated* to `IsBehaviorBackpackLightActive()`.

## History (do not cherry-pick as-is)

| Commit | What |
|---|---|
| `e162a19f` Checkpoint | Added clad + map + JSON + selection `if`s. Also hacked `conditionHighTemperature.cpp` (`hotBattery = true`) — **leave that out**. |
| `0b3f6e8d` Finish backpack lights | Tweaked Overheated condition (weakened to `!_isOnChargerContacts && _isBatteryDisconnected`). |
| `92503631` Fix overheating | Undid `hotBattery=true`; set `skipOverheatCheck = false`. **Not about backpack lights.** Still on HEAD. |
| `406f36cd` | Dropped thermal JSON into WireOS pack; **removed** `Idle_09` / `Offline_Off` only. Overheated* clad/map/`if`s were still live after this commit. |
| `9862ed82` | Loader bugfix (`robotDataLoader.cpp`); same day, unrelated to thermal triggers. |
| `69367189` | Reverted Finish (`0b3f6e8d`). |
| `3b7ddcec` | Reverted Checkpoint: **removed** Overheated* clad/map/`if`s + stock thermal JSON. WireOS JSON survived → half-state until v1 restore. |

Commented-out selection in the checkpoint used `#define IS_STATUS_FLAG_SET(x) (((uint32_t)RobotStatusFlag::x) != 0)` — that is **always true** (enum value vs 0, no robot-state bits). Do not restore that macro.

`LowBatteryOverheated` was **never live** — only that broken commented branch.

## Temperatures (syscon, not the JSON)

Anim does not read °C. Use flags already on `RobotInterface::BatteryStatus`:

```
isLow, isCharging, onChargerContacts, isBatteryFull, isBatteryDisconnected
```

`isBatteryDisconnected` comment in `messageEngineToRobot.clad`: “too hot to charge (needs to cooldown)” — **also** true after charge-timeout (~25 min / 5 min past 4.2 V). Engine hides cooldown as **charging + disconnected** (`IsChargingStalledBecauseTooHot()`). Charge-done is **disconnected + not charging**.

Syscon (`robot/syscon/src/analog.cpp` `handleTemperature` / `too_hot`):

| Flag / effect | Temp |
|---|---|
| Charger cooldown (`too_hot` / `POWER_CHARGER_OVERHEAT`) | **> 41 °C** on landing; clears **≤ 41 °C** |
| `IS_BATTERY_OVERHEATED` (shutdown in 30 s) | **≥ 47 °C ~4 h**, **≥ 50 °C ~2 h**, **≥ 60 °C immediately** |
| Hard stop (non-Whiskey) | **≥ 70 °C** |

`batteryComponent.h` “45 °C until 42 °C” does **not** match `analog.cpp` (41 °C). Trust analog.

Engine `conditionHighTemperature` battery **≥ 55 °C** / CPU **≥ 90 °C** is sleep/power-save, **not** backpack lights.

## Suggested v1 (keep it small) — **done**

Restore triggers so **charger cooldown** lights work. That is the 41 °C case and matches flags anim already has.

1. ~~Add four enum values + `EnumToString` rows in `backpackAnimationTriggers.clad` (keep alphabetical).~~ **Done.**
2. ~~Add four `CladEvent` / `AnimName` rows in `BackpackAnimationTriggerMap.json`.~~ **Done.**
3. In `UpdateCriticalBackpackLightConfig`, after LowBattery (off charger), before Offline: **Done** (checkpoint predicates).

   - low + on charger + charging + disconnected → `ChargingLowBatteryOverheated`
   - not-full + on charger + charging + disconnected → `ChargingOverheated`
   - full + on charger + charging + disconnected → `Overheated`  
     (checkpoint used this; “finish” used off-charger + disconnected, which is a weaker proxy)

4. ~~Copy the four JSON files into **stock** `backpackLights/` too, or custom/Anki packs stay dark on those triggers. WireOS already has them.~~ **Done.**
5. If adding to `IsBehaviorLightActive` list: these are **critical**, not behavior — do not add them there. **Still do not.**
6. Rebuild clad. Do **not** touch `conditionHighTemperature.cpp`. **Clad/`vbuild` not run yet** (plan Phase 5). Still do not touch `conditionHighTemperature.cpp`.

Verify (on-robot, **not run**): on charger, battery > 41 °C → charging lights become the Overheated / ChargingOverheated pattern; cool to ≤ 41 °C → charging resume.

## Optional v1.1 (not required for the easy win) — **not done**

Off-charger `Overheated` / `LowBatteryOverheated` need **`IS_BATTERY_OVERHEATED`**, which is **not** on `BatteryStatus` today. Add `isBatteryOverheated` (engine already has `BatteryComponent::IsBatteryOverheated()`), then:

- low + off charger + overheated → `LowBatteryOverheated`
- off charger + overheated → `Overheated`

Those temps are the 47 / 50 / 60 table, and the robot shuts down 30 s later — lights would be brief.

## Related

- `docs/mapping/OVERHEAT-BACKPACK-LIGHTS-PLAN.md` — charger-cooldown v1 plan (Phases 1–4 landed)
- `docs/mapping/TODO-anki-deleted-recovery.md` — hunt deleted Anki behaviors (singing, simple-voice); this lights TODO is a half-land, not a deleted class
- `docs/mapping/IDEA-backpack-lights-flags.md` — custom vs WireOS vs Anki packs
- `docs/mapping/BACKPACK-LIGHTS-DESIGNER-PLAN.md` — designer already has the four modes
- `docs/mapping/examples/customBackpackLights/`
- `engine/components/battery/batteryComponent.h` `IsChargingStalledBecauseTooHot()`
