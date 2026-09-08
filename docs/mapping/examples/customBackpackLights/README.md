# Example custom backpack light pack (cyan / magenta)

**Upload target on robot:** `/data/data/customBackpackLights/`  
**Sibling theme:** [`../customBackpackLights-hotpink-yellow/`](../customBackpackLights-hotpink-yellow/) (hot pink + hot yellow)  
**Source of truth in firmware:** same JSON schema as `resources/config/engine/lights/backpackLights/`

This folder is a **ready-to-upload** pack (cyan / magenta “rebuild” theme). Copy its *contents* onto the robot so that:

```text
/data/data/customBackpackLights/off.json
/data/data/customBackpackLights/cubeSpinner/purple/spinner_purple_celebration.json
… (full tree)
```

## Detection (what enables custom mode)

`engine/components/lightsConfig.h` → `_userlights()` is true only if **both** exist:

- `/data/data/customBackpackLights/off.json`
- `/data/data/customBackpackLights/cubeSpinner/purple/spinner_purple_celebration.json`

Then anim loads user pack instead of stock/WireOS (`animProcess/.../robotDataLoader.cpp`).

## JSON format (per file)

3 backpack LEDs: **Front, Middle, Back** (`LEDId::NUM_BACKPACK_LEDS`).

```json
{
  "onColors"                : [[R, G, B, A], [R, G, B, A], [R, G, B, A]],
  "offColors"               : [[R, G, B, A], [R, G, B, A], [R, G, B, A]],
  "onPeriod_ms"             : [n, n, n],
  "offPeriod_ms"            : [n, n, n],
  "transitionOnPeriod_ms"   : [n, n, n],
  "transitionOffPeriod_ms"  : [n, n, n],
  "offset"                  : [n, n, n]
}
```

| Field | Meaning |
|---|---|
| `onColors` / `offColors` | RGBA floats **0.0–1.0** (not 0–255) |
| `onPeriod_ms` / `offPeriod_ms` | Time each phase holds (per LED) |
| `transitionOn/OffPeriod_ms` | Fade between on/off |
| `offset` | Phase delay ms so LEDs chase / breathe out of sync |

Parsed by `BackpackLightAnimation::DefineFromJSON` in anim (and engine twin).

## Filenames matter

Names map via `resources/assets/cladToFileMaps/BackpackAnimationTriggerMap.json`  
(e.g. trigger `Petting` → `petting.json`). Keep the **same relative paths and basenames** as stock.

This pack now includes `cpuOverheated.json` and `lowBatteryCpuOverheated.json` (CPU ≥ 90 °C / low-batt+CPU); a live custom overlay must include them too (full overlay, not a merge).

## Anki vs WireOS (not this folder)

| Preference | Mechanism in **this** tree |
|---|---|
| WireOS lights | Flag: `/data/data/wirelights` or `/data/data/rebuild/wirelights` → load `backpackLightsWireOS/` |
| Stock Anki lights | **No** `wirelights` flag → load `backpackLights/` |
| Custom | Full tree under `/data/data/customBackpackLights/` + both sentinel files |

(CCIS toggles `wirelights`; custom wins and shows **CUSTOM LIGHTS ON**.)

## Upload example (ssh)

```bash
# from host, pack is docs/mapping/examples/customBackpackLights/
scp -r customBackpackLights/* root@VECTOR_IP:/data/data/customBackpackLights/
# ensure sentinels present, then restart anim/engine or reboot
```

Restart may be required: `_userlights()` is initialized once per process.

## Theme in this pack

Cool cyan / magenta accents: charging breath, petting chase, dance RGB offset, spinner colors saturated. Safe to edit any JSON and re-upload single files.
