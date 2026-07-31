# Idea: backpack light preferences via flag files (+ Wired option)

**Path:** `docs/mapping/IDEA-backpack-lights-flags.md`  
**Captured:** 2026-07-29  
**Status:** idea / product note — **not implemented in this note**; verify against current code before coding  
**Related in-tree today:**
- `CHANGES.md` — toggle Anki vs WireOS lights (CCIS); custom backpack lights (WireOS PR)
- `CONFIG_MENU.md` — **WIREOS LIGHTS / ANKI LIGHTS**; shows `CUSTOM LIGHTS ON` when custom pack is active and menu toggle is inert
- Code entry points (for a future implementer): `animProcess/src/cozmoAnim/backpackLights/`, engine `BackpackLightComponent`, robot backpack light control

---

## What people want

Some users prefer **stock Anki backpack light behavior** over WireOS-style lights. Others want **user-custom backpack light definitions** without rebuilding firmware.

A community-facing approach (as described for a related commit / Wired flow):

### 1. Prefer Anki backpack lights (flag file) — **as implemented in this tree**

This fork does **not** use `enableankilights`. Observed logic (`engine/components/lightsConfig.h` + CCIS):

| Preference | Mechanism |
|---|---|
| **WireOS** lights | Flag file present: `/data/data/wirelights` **or** `/data/data/rebuild/wirelights` → load `config/engine/lights/backpackLightsWireOS/` |
| **Anki stock** lights | **Absence** of that flag → load `config/engine/lights/backpackLights/` |

CCIS “USE WIREOS / USE ANKI LIGHTS” creates or deletes `/data/data/rebuild/wirelights` (`faceInfoScreenManager.cpp`).

**Wired idea (still valid):** expose “Anki backpack lights” as UI that **removes** the wirelights flag (and “WireOS lights” that **creates** it), so users never touch the filesystem. A separate `enableankilights` file would be redundant unless you want a clearer name and rewire the check.

### 2. User-customizable backpack lights (drop-in folder) — **already coded**

| Item | Value |
|---|---|
| **Path** | `/data/data/customBackpackLights/` (mirror of stock tree) |
| **Enable check** | `_userlights()` true iff **both** exist: `off.json` **and** `cubeSpinner/purple/spinner_purple_celebration.json` |
| **Load path** | `animProcess/.../robotDataLoader.cpp` → `kPathToEngineBackpackLightsUser` |
| **Format** | Same JSON as stock — see below and example pack |
| **CCIS** | Custom active → **CUSTOM LIGHTS ON**; WireOS/Anki toggle inert |

**Example pack to upload:** `docs/mapping/examples/customBackpackLights/`

---

## Why this is a good “wire it up” item

- **Already product-adjacent:** rebuild ships Anki/WireOS toggle + custom lights concept (`CHANGES.md`, CCIS).
- **Low-friction for users:** flag file + folder drop is the usual Vector community pattern (`/data/data/…`), and **Wired** can hide the filesystem.
- **Clear precedence story to implement/document:**
  1. Custom folder present → custom wins (menu locked)
  2. Else `enableankilights` present → Anki lights
  3. Else WireOS / default rebuild path  
  *(Proposed; match or adjust to whatever the tree already does.)*

---

## Suggested implementation checklist (when feature phase starts)

1. **Find current behavior** — where WireOS vs Anki lights are chosen (likely anim backpack path + config/CCIS). Confirm whether `enableankilights` or custom folder already exist in this fork or only in a sibling commit/PR.
2. **Flag file** — if missing: on backpack-light init, `access()`/`stat()` `/data/data/enableankilights` and select Anki light tables/behavior.
3. **Custom folder** — load definitions from `/data/data/customBackpackLights/` (format TBD: JSON? existing light map assets? match WireOS PR 30).
4. **Precedence** — custom > Anki flag > default; surface state to CCIS (`CUSTOM LIGHTS ON`).
5. **Wired** — add UI option “Use Anki backpack lights” that creates/removes the flag file over the install/pair channel; optional “upload custom lights” to the folder.
6. **Docs** — update `CONFIG_MENU.md` / user ABOUT notes with paths and Wired steps.
7. **Tests** — at least unit or scripted checks that missing/present flag selects the right mode without crashing when folder is empty/malformed.

---

## JSON format (confirmed)

3 LEDs (front, middle, back). Colors are **RGBA floats 0–1**:

```json
{
  "onColors": [[R,G,B,A], [R,G,B,A], [R,G,B,A]],
  "offColors": [[R,G,B,A], [R,G,B,A], [R,G,B,A]],
  "onPeriod_ms": [n,n,n],
  "offPeriod_ms": [n,n,n],
  "transitionOnPeriod_ms": [n,n,n],
  "transitionOffPeriod_ms": [n,n,n],
  "offset": [n,n,n]
}
```

Parser: `animProcess/.../backpackLights/animBackpackLightAnimation.cpp` `DefineFromJSON`.  
Triggers ↔ filenames: `resources/assets/cladToFileMaps/BackpackAnimationTriggerMap.json`.

## Open questions

- [CONFIRMED] Custom path + sentinel files + JSON schema (this tree).
- [CONFIRMED] WireOS vs Anki via `wirelights` flag, not `enableankilights`.
- [UNKNOWN] Hot-reload without process restart (`_userlights()` / `_wireoslights()` cached after first `stat`).
- [UNKNOWN] Persistence across OTA / factory reset / slot swap.

---

## One-liner for a future agent

> Custom pack: JSON backpack light defs under `/data/data/customBackpackLights/` (must include `off.json` + purple spinner celebration). WireOS vs Anki: presence/absence of `/data/data/rebuild/wirelights`. Wired can toggle that flag + push a full pack. Example: `docs/mapping/examples/customBackpackLights/`.
