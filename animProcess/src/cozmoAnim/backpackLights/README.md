# backpackLights/

**Path:** `animProcess/src/cozmoAnim/backpackLights/`  
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** medium

## What this is

Anim-owned backpack LED patterns with a priority stack. Engine `SetBackpackLights` messages are **intercepted** in anim (not blindly forwarded) so critical local states (low battery, offline, streaming, charging) can outrank engine patterns.

## Contents

| Entry | What it is |
|---|---|
| `animBackpackLightComponent.*` | Init/Update; set by pattern or `BackpackAnimationTrigger` |
| `animBackpackLightAnimation.*` | Animation/keyframe types for lights |
| `backpackLightAnimationContainer.*` | Loaded light anim storage |
| `animBackpackLightComponentTypes.*` | Priority / layer types |

## Priority (header comment)

Low Battery → Offline → Streaming → Charging → engine-sent lights  
(`animBackpackLightComponent.h` description).

## Wiring

- `AnimEngine::Init` → `GetBackpackLightComponent()->Init()`; each tick `Update()` (`animEngine.cpp` ~L118, ~L225).
- `animProcessMessages` `Tag_setBackpackLights` → `SetBackpackAnimation` (~L694–698).
- Trigger map loaded by `RobotDataLoader` from `assets/cladToFileMaps/BackpackAnimationTriggerMap.json`.
- Streamer locks backpack **animation track** in shipping; this component is the separate system path for status lights.

## Talks to

- Engine CLAD lights/triggers; robot LEDs ultimately via messages this component emits [INFERRED for final hop — verify in component Update if needed later].
