# AGENTS.md — mapping console vars (`cvcatalog/`)

How to **research** and **document** console variables/functions so a human who has
never heard of any other var can still understand the tooltip.

Related: `resources/webserver/AGENTS.md` (theme, Path A, CivetWeb URL rules).  
Inventory dumps: `resources/webserver/.docs/`.

---

## 1. Goal

Every catalog entry should answer:

> **If I flip this / set this number, what actually changes on the robot or in the software — in plain English?**

Not: “tunes X for BehaviorY.”  
Yes: “When true, Vector will still play blocked charger animations so animators can test on the dock.”

Assume the reader knows **nothing** about sibling vars, acronyms, or file names unless you explain them.

---

## 2. Source of truth: what is unmapped?

### Robot inventory (names only)

| File | Port | Content |
|---|---|---|
| `.docs/consolevarlist_8888` | Engine :8888 | ~800 var **ids** (one per line) |
| `.docs/consolevarlist_8889` | Anim :8889 | ~200 var ids |
| `.docs/consolefunclist_8888` | Engine | function ids |
| `.docs/consolefunclist_8889` | Anim | function ids |

These lists are **what the live robot exposes**. Catalog **keys must match exactly**.

Refresh when the robot firmware changes:

```bash
curl -s "http://ROBOT:8888/consolevarlist"  > resources/webserver/.docs/consolevarlist_8888
curl -s "http://ROBOT:8889/consolevarlist"  > resources/webserver/.docs/consolevarlist_8889
curl -s "http://ROBOT:8888/consolefunclist" > resources/webserver/.docs/consolefunclist_8888
curl -s "http://ROBOT:8889/consolefunclist" > resources/webserver/.docs/consolefunclist_8889
```

### Documented = present in catalog shards

A name is **mapped** when it appears as a key under `cvcatalog/vars/*.json` (and is listed via `index.json`).

```bash
# Rough unmapped count (engine dump vs all shard keys)
python3 - <<'PY'
from pathlib import Path
import json
keys=set()
for p in Path("resources/webserver/cvcatalog/vars").glob("*.json"):
    keys |= set(json.load(open(p)).get("vars",{}))
dump=set(Path("resources/webserver/.docs/consolevarlist_8888").read_text().split())
print("documented", len(keys & dump), "unmapped", len(dump - keys), "of", len(dump))
print("sample unmapped:", sorted(dump-keys)[:20])
PY
```

### Progress tracking under `.docs/` (recommended)

**Do not** delete or “move” lines out of `consolevarlist_*` — those files should stay a full robot export.

Use `.docs/` for **work queues and session notes**:

```text
resources/webserver/.docs/
  consolevarlist_8888          # full inventory (keep)
  consolevarlist_8889
  consolefunclist_*
  progress/
    README.md                  # optional: how you track
    unmapped_8888.txt          # optional snapshot of dump − catalog (regenerate anytime)
    session-YYYY-MM-DD.md      # optional: “did Keepaway, next EnrollFace”
```

| Stage | Where it lives |
|---|---|
| Unknown name | only in dump |
| Being researched | agent notes / `progress/session-*.md` |
| **Done** | entry in `cvcatalog/vars/<shard>.json` + path in `index.json` |

“Completed” means **written into a shard**, not removed from the dump.

---

## 3. What to pick next

1. Prefer **opaque clusters** (game tuning, factory, sleep, explore internals) over surfaces already clear in **WebViz** (mirror faces, mood charts, mic clip recipes).
2. Group by **dump id prefix** (`Keepaway_*`, `EnrollFace_*`, …) into one shard file.
3. Skip reinventing WebViz docs unless the dump id is still confusing in `/consolevars`.

---

## 4. Research process (rabbit hole)

For each dump id:

### Step A — Find the registration

```bash
# UI strips leading k/g: dump "IgnoreAnimWhitelist" ↔ code kIgnoreAnimWhitelist
rg -n "IgnoreAnimWhitelist|kIgnoreAnimWhitelist" --glob '*.{cpp,h}'
```

Note:

- `CONSOLE_VAR` / `CONSOLE_VAR_ENUM` / `CONSOLE_FUNC` / `MakeMemberTunable`
- **Category** string (becomes tab / fieldset in UI)
- **process**: `engine` if under `engine/`, `anim` if under `animProcess/` (or both)

### Step B — Find every use

```bash
rg -n "kTheName|TheName" --glob '*.{cpp,h}'
```

Read call sites until you can say:

- When is it read?
- What branch/number does it change?
- Does it need another flag / function first?
- Is it **dead** (only registered, never read)?

### Step C — Paths, assets, side effects

If the code loads files, network, or hardware:

- Record **robot paths** (`/data/data/...`, `/anki/data/assets/...`)
- Record **build/resource paths** when useful
- Note **order of operations** (e.g. pick enum → call LoadFaceOverlay → enable composite)

### Step D — Status

| `status` | Meaning |
|---|---|
| `live` | Read at runtime; changes behavior |
| `partial` | Only applied at construct / limited conditions |
| `dead` / `orphan` / `noop` | Registered but unused (prove with rg) |
| `danger` | Can crash, brick UX, or flood logs |

**Never disable the control in the UI** for dead vars — mark them only.

### Step E — Write the entry (plain English)

Write for a smart non-expert. Avoid assuming they know BEI, HLAI, CLAD, etc. If you must name a system, one short gloss is enough.

**Allowed fields** (use as many as help; more is better than cryptic one-liners):

| Field | Required? | Purpose |
|---|---|---|
| `process` | yes | `engine` \| `anim` \| `both` |
| `blurb` | yes | **2–5 sentences** plain English: what it does, when it matters |
| `detail` | strongly preferred | Longer how-it-works / caveats (shown in tooltip) |
| `howTo` | if multi-step | Numbered or short recipe in prose |
| `paths` | if any files | See schema below |
| `status` | if not plain live | `live` default if omitted |
| `statusNote` | if status ≠ live | Why dead/partial/danger |
| `requires` | if needs others | Dump ids user should set first |
| `related` | optional | Sibling ids |
| `evidence` | yes | `path/to/file.cpp` or `path:line` |
| `category` | optional | UI category string if known |
| `tags` | optional | freeform |
| `enumLabels` | enums | human list matching console order |

#### `paths` schema

```json
"paths": {
  "robot": [
    "/data/data/customFaceOverlay.jpg"
  ],
  "assets": [
    "/anki/data/assets/cozmo_resources/assets/faceOverlays/trans.jpg"
  ],
  "notes": "Index 8 (Custom) uses the robot path; 0–7 use built-in assets."
}
```

Always record paths when the var selects or loads files.

#### Example (good)

```json
"ProcFace_CustomEyeOverlay": {
  "process": "anim",
  "blurb": "Chooses which picture is painted onto Vector’s procedural eyes. Built-in options are stock images (pride flags, frog, galaxy, …). The last option, Custom, uses a JPEG you place on the robot.",
  "detail": "This is only a selector. After you change it you must run LoadFaceOverlay so the image is actually loaded, then turn on ProcFace_CustomEyes so the face drawer composites it. Opacity is separate (ProcFace_CustomEyeOpacity).",
  "howTo": "1) Set this list. 2) Call LoadFaceOverlay. 3) Enable ProcFace_CustomEyes. For Custom: put a JPEG at /data/data/customFaceOverlay.jpg first.",
  "paths": {
    "robot": ["/data/data/customFaceOverlay.jpg"],
    "assets": [
      "/anki/data/assets/cozmo_resources/assets/faceOverlays/*.jpg"
    ],
    "notes": "Enum index 8 = Custom → robot path. Indices 0–7 map to named files under faceOverlays/."
  },
  "requires": ["LoadFaceOverlay", "ProcFace_CustomEyes"],
  "related": ["ProcFace_CustomEyeOpacity"],
  "evidence": "cannedAnimLib/proceduralFace/proceduralFaceDrawer.cpp",
  "status": "live",
  "tags": ["face", "procedural", "paths"]
}
```

#### Example (bad)

```json
"blurb": "ProcFace overlay enum for ParameterizedFace."
```

---

## 5. Where to write files

| Content | Path |
|---|---|
| Var/func notes | `cvcatalog/vars/<domain>.json` → `{ "vars": { "Id": { ... } } }` |
| Category blurbs | `cvcatalog/categories/<name>.json` |
| Multi-step recipes | `cvcatalog/recipes/<name>.json` |
| Register new shard | add path to `cvcatalog/index.json` |
| Monolithic fallback | also merge important keys into `cv-catalog.json` when practical |

Shard size: prefer **~20–80** entries per file.

### URL / deploy reminder

- Catalog is served as **`/cvcatalog/...`** (not `/consolevars/...`).
- Static names must not start with `/consolevars` (CivetWeb steals them).
- After scp: hard-refresh; restart eng/anim only if HTML templates changed.

---

## 6. Tooltip content (what the UI shows)

`cv-app.js` builds the `?` popover from catalog fields. Prefer filling:

1. `blurb` (always)  
2. `detail`  
3. `howTo`  
4. `paths` (robot / assets / notes)  
5. `statusNote` if not live  
6. `requires` / `related`  
7. `evidence` (for power users; still show it)

**Length:** short blurbs are fine for trivial toggles; path-heavy or multi-step vars should use `detail` + `howTo` + `paths`. Do **not** truncate research to one cryptic clause.

Popovers are styled wide enough for multi-paragraph explainers (`cv-chrome.css`).

---

## 7. Parallel / multi-agent workflow

1. Orchestrator diffs dump vs catalog → assigns **prefix clusters**.  
2. Each agent: only those ids → one shard file.  
3. Exact dump strings only; no invented ids.  
4. Return: sources, confidence, dead list, JSON.  
5. Orchestrator registers shards in `index.json`.

---

## 8. Checklist before marking a var “done”

- [ ] Key equals dump/UI id exactly  
- [ ] `process` correct  
- [ ] `blurb` readable alone (no prior knowledge of other vars)  
- [ ] Paths recorded if any file is loaded  
- [ ] `evidence` points at real code  
- [ ] `status` honest (dead only if unused)  
- [ ] Shard listed in `index.json`  
- [ ] Optional: session note under `.docs/progress/`  

---

## 9. Quick answers

| Question | Answer |
|---|---|
| Where is the unmapped list? | Diff `.docs/consolevarlist_*` against `cvcatalog/vars/*.json` |
| Move completed out of the dump? | **No** — keep full dumps; completion = catalog entry |
| Store progress where? | Catalog shards = done; `.docs/progress/` = optional queues/notes |
| Writing style? | Plain English, standalone, paths explicit |
| How much text? | As much as needed; use `detail` / `howTo` / `paths` |
