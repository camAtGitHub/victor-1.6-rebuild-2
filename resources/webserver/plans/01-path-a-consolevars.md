# Plan 01 — Path A: Console vars reskin + progressive catalog

**Status:** ready to execute  
**Constraint:** **no C++ rebuild** — resources only; scp + hard-refresh / process restart  
**Strategy:** Path A — keep `GET /consolevars` + C++-injected controls; CSS theme + JS decorate + sharded JSON docs  
**Authority:** `resources/webserver/AGENTS.md` (theme, endpoints, Path A rules)

---

## Phase 0 — Documentation discovery (read before coding)

### Sources (required reading)

| Source | What to extract |
|---|---|
| `resources/webserver/AGENTS.md` | Path A rules, tokens, no new endpoints, dead-glyph UX, shard layout |
| `resources/webserver/README.consolevars.md` | Ports, catalog key rules, APIs |
| `docs/development/web-server.md` | `/consolevars`, set/get/list/call contracts |
| `webServerProcess/src/webService.cpp` ~1022–1052, 1371–1571 | Template load, markers, generated HTML shapes |
| `resources/webserver/consolevarsui.html` | Classic template; injection markers; set/call JS |
| `resources/webserver/consolevars-app.js` | Existing decorate/recipes/search (explorer-oriented) |
| `resources/webserver/consolevars-catalog.json` | Current recipes/vars to migrate into shards |
| `resources/webserver/webviz/css/tokens.css` | Canonical `--wv-*` theme |
| `resources/webserver/webViz.html` | Inter load pattern, token/shell CSS links |

### Allowed APIs / mechanisms (only these)

| Mechanism | Notes |
|---|---|
| `POST /consolevarset` | `{key, value}` form or equivalent |
| `GET /consolevarget?key=` | optional for live value refresh |
| `GET /consolevarlist` | optional for coverage tooling |
| `POST /consolefunccall` | `func=…&args=…` |
| Template markers | `/* -- generated style -- */`, `// -- generated script --`, `<!-- generated html -->` |
| Static files under `resources/webserver/` | CSS/JS/JSON/HTML |

### Anti-patterns (do not)

- New HTTP routes or C++ `mg_set_request_handler` changes  
- Require `GET /consolevars-explorer` (may be missing on robot)  
- Rebuild control list client-side (that is Path B)  
- Remove template injection markers  
- One monolithic multi-thousand-line catalog as the long-term store  
- Disable controls marked `dead`  
- Invent console var names not present in UI / `CONSOLE_VAR` registrations  

### Phase 0 verification

- [ ] Agent can restate Path A in one sentence  
- [ ] Agent lists three template markers that must survive  
- [ ] Agent cites `--wv-bg` / Inter from tokens + WebViz  

---

## Phase 1 — Theme tokens on classic `/consolevars`

### What to implement

1. Ensure classic page can use **WebViz tokens**:
   - Prefer `<link rel="stylesheet" href="webviz/css/tokens.css">` from `consolevarsui.html` (path relative to web root as WebViz does).
   - Optionally add thin `consolevars-chrome.css` for console-specific rules **using only `var(--wv-*)`**.
2. Load **Inter** the same way as `webViz.html` (Google fonts preconnect + Inter weights 400–700).
3. Dark-skin the **existing** generated structure without changing C++:
   - Page / `#console` / headers → `--wv-bg`, `--wv-bg-elev`, `--wv-text`
   - `#main` / `#tabs` panels → `--wv-bg-panel`, border `--wv-line`, radius `--wv-radius`
   - `fieldset` / `legend` → frame language from AGENTS.md  
   - Labels (var ids) → `--wv-mono` ~12px  
   - `.slider` / `.amount` / `.listbox` / checkboxes → input surfaces `--wv-bg-input`, accent handle `--wv-accent`
4. Keep stock jQuery UI **behavior**; only override chrome CSS (and minimal UI widget overrides).
5. Preserve all inline set/call handlers already in `consolevarsui.html`.

### Copy / pattern references

- Tokens: `webviz/css/tokens.css` entire `:root` block  
- Font links: `webViz.html` lines ~23–28  
- Frame language: `AGENTS.md` §3 “Frames”  

### Verification

- [ ] Template still contains the three injection markers  
- [ ] No new hex colors outside token file (grep chrome CSS for `#[0-9a-fA-F]{3,8}` — should be empty or only unavoidable jQuery overrides)  
- [ ] After scp + process restart, `/consolevars` is dark and controls still set vars  

### Anti-pattern guards

- Do not replace `#main` / generated `#tabs` structure  
- Do not delete `onCheckboxClickHandler` / slider posts  

---

## Phase 2 — Wire Path A decorator (explainers on classic)

### What to implement

1. Load decorator JS from classic template:
   - `<script src="consolevars-app.js"></script>` (or rename later to `consolevars-decorate.js` — only if you keep one clear entry).
2. Adapt `consolevars-app.js` so it works **without** explorer DOM (`#cvRecipes`, `#cvSearch`, `#cvProcessBadge` optional):
   - If explorer nodes missing → skip recipes sidebar / search chrome  
   - Always run: catalog load → **decorate rows** on `#tabs` / `#main`  
3. Per catalog var that matches a control id:
   - Add **`?` / ⓘ** button → tooltip/popover with `blurb` (+ optional `statusNote`, `evidence`)  
   - If `status` is `dead` | `orphan` | `noop` → status glyph (do **not** disable input)  
4. Prefer compact marks over always-visible multi-line blurbs (blurbs can open on click).  
5. Safe no-op if catalog 404 (raw UI still works).

### Copy / pattern references

- Row finding: `consolevars-app.js` `findControlByVarName`, `rowForControl`, `decorateRows`  
- Catalog fetch: `fetchCatalog()` in same file  
- UX contract: `AGENTS.md` §4 “Explainers & dead marks”  

### Verification

- [ ] Classic page loads app JS without console errors when explorer nodes absent  
- [ ] A known catalog key (e.g. `MirrorMode` if present) shows `?` next to control  
- [ ] A `status: dead` entry shows glyph; checkbox/slider still posts `consolevarset`  
- [ ] Vars without catalog entries unchanged except theme  

### Anti-pattern guards

- Do not require explorer HTML  
- Do not grey out dead vars  

---

## Phase 3 — Multi-file catalog (agent-friendly shards)

### What to implement

1. Create:

```text
resources/webserver/consolevars/
  index.json
  meta.json                 # version, status glyph legend, process notes
  vars/                     # domain shards
  categories/
  recipes/
```

2. `index.json` lists shards; browser merges:
   - `vars`: shallow merge objects  
   - `categories`: merge  
   - `recipes`: concat arrays  
3. Migrate existing `consolevars-catalog.json` content into shards (keep legacy file as fallback **or** thin re-export if needed for one release).  
4. Update fetch path: try `consolevars/index.json` first → merge; else fall back to `consolevars-catalog.json`.  
5. Document shard rules in `consolevars/README.md` (or AGENTS.md already has layout — keep in sync).

### Shard naming (convention)

| File | Contents |
|---|---|
| `vars/vision.json` | Faces, MirrorMode, markers, mirror draw flags |
| `vars/navmap-quadtree.json` | QuadTreeProcessor / mapComponent debug |
| `vars/mood.json` | Mood / emotion webviz period etc. |
| `vars/anim-face.json` | Procedural face / overlays (anim) |
| `vars/anim-mic.json` | MicData |
| `vars/_orphans-dead.json` | Confirmed dead/noop across domains |
| `recipes/*.json` | One recipe family per file or small bundles |

Target: **~20–80 var entries per file**, not hundreds.

### Verification

- [ ] `index.json` alone is small  
- [ ] Missing one shard does not break page (warn + continue)  
- [ ] Merged var count ≥ legacy catalog var count after migration  
- [ ] Agent can add one var by editing a single shard + (if new file) one index line  

### Anti-pattern guards

- Do not put recipes and 500 vars in one file  
- Do not invent var keys without code evidence  

---

## Phase 4 — Parallel background subagents: document the **unknown** inventory

**Purpose:** Clarify vars/functions that are **not** already well covered by WebViz modules or existing recipes.

### Inventory source of truth (live robot dumps)

Captured lists live under:

```text
resources/webserver/.docs/
  consolevarlist_8888      # engine — ~801 names (one id per line)
  consolevarlist_8889      # anim  — ~223 names
  consolefunclist_8888     # engine — ~113 funcs
  consolefunclist_8889     # anim  — ~61 funcs
```

These are the **rendered** `/consolevarlist` / `/consolefunclist` names as the robot exposes them.  
Catalog keys **must match these strings exactly** (not invented `k` prefixes if the dump has none).

Refresh dumps later with:

```bash
curl -s "http://<robot>:8888/consolevarlist"  > resources/webserver/.docs/consolevarlist_8888
curl -s "http://<robot>:8889/consolevarlist"  > resources/webserver/.docs/consolevarlist_8889
curl -s "http://<robot>:8888/consolefunclist" > resources/webserver/.docs/consolefunclist_8888
curl -s "http://<robot>:8889/consolefunclist" > resources/webserver/.docs/consolefunclist_8889
```

### Deprioritize (do **not** spend Phase 4 waves on these)

Already better understood via WebViz modules and/or existing catalog recipes — document only if a dump name is still totally opaque:

| Area | Why skip for now |
|---|---|
| Vision mirror / Faces / Markers draw flags | WebViz + existing recipes |
| MoodManager / mood WebViz periods | Mood WebViz module |
| Nav map / QuadTree *render* debug if already mapped | map WebViz + prior work |
| ProcFace / custom eyes (anim) | Face recipes in catalog |
| MicData clip record (anim) | Mic WebViz / recipes |

Agents may still mark them `status: live` with a one-liner “see WebViz X” if needed for completeness later — **not** the parallel wave focus.

### Prioritize (unknown / high opacity from dumps)

Partition **from the dump files** by **name prefix**, not by “vision folder.” Example engine clusters from `consolevarlist_8888` (prefix counts shift as dumps refresh):

| Cluster (prefix) | Why it needs clarity |
|---|---|
| `Keepaway_*` | Large game-tuning surface, no WebViz |
| `EnrollFace_*` | Enrollment behavior tuning |
| `ExploringInternal*` / `Exploring*` / `AI_*` | Freeplay explore internals |
| `HighLevelAI_*` / socialize / play-with-cube cooldowns | HLAI policy knobs |
| `SleepTracker_*` / `SleepCycle_*` / `Sleeping*` | Sleep policy |
| `InteractWithFaces_*` / `ReactToMotion_*` / `ReactToHand_*` | Interaction behaviors |
| Docking / `DriveToPose*` / `Override_*` pan-tilt | Action / dock tuning |
| `BW_*` / PossibleObject* | BlockWorld debug / thresholds |
| Playpen / mfg / self-test style (`MinFirmware*`, FFT, cliff calib, …) | Factory / test paths |
| Network / `UDP*` / `NetStat*` / pressure multiples | Ops / netem — sparse docs |
| LED* hold patterns, card/dealer funcs | Niche demos / games |
| Console funcs: crash/assert, deck/cards, `ForceAssignExperiment`, … | Dangerous or obscure |

Anim dump (`8889`): focus non-ProcFace clusters (mic internals beyond clip recipe, TTS, alexa if present, animation streamer knobs not in WebViz).

### Orchestrator rules (mandatory)

1. **Seed worklists from dumps** — `resources/webserver/.docs/consolevarlist_*` / `consolefunclist_*`. Do not invent ids.  
2. Spawn **multiple explore subagents in parallel, background=true**.  
3. Each agent gets a **prefix cluster** (or dump line-range), process port, and output shard path.  
4. Each agent: for each dump id → `rg` in tree → blurb / status / evidence.  
5. Orchestrator merges shards into `consolevars/index.json`.  
6. Partial coverage is success; do not attempt all ~800 engine vars in one session.

### Subagent reporting contract

1. **Sources** — dump file + code paths grepped/read  
2. **Ids** — exact dump strings only  
3. **Findings** — `{ id, process, blurb, status?, statusNote?, evidence, tags? }`  
4. **Dead candidates** — define-only with proof  
5. **Confidence** + gaps  
6. **Copy-ready** JSON for the shard  

### Suggested parallel wave (first pass)

| Agent id | Input | Scope | Output shard |
|---|---|---|---|
| **W-keepaway** | `consolevarlist_8888` | lines matching `Keepaway` | `vars/engine-keepaway.json` |
| **W-enroll** | same | `EnrollFace` | `vars/engine-enroll-face.json` |
| **W-explore-hlai** | same | `Exploring*`, `HighLevelAI*`, `AI_*`, `ComeHere*` | `vars/engine-explore-hlai.json` |
| **W-sleep** | same | `Sleep*` | `vars/engine-sleep.json` |
| **W-interact** | same | `InteractWithFaces*`, `ReactTo*`, `Wiggle*` | `vars/engine-interact.json` |
| **W-actions-dock** | same | `Docking*`, `DriveToPose*`, `Override_*`, pickup/roll/stack dock | `vars/engine-actions-dock.json` |
| **W-blockworld** | same | `BW_*`, `FlatPossible*`, PossibleObject* | `vars/engine-blockworld.json` |
| **W-playpen-mfg** | same | playpen/mfg/calib/FFT/cliff-test style names from mid-list | `vars/engine-playpen-mfg.json` |
| **W-net-ops** | same | `UDP*`, `NetStat*`, `PrintNetwork*`, pressure/wifi multiples | `vars/engine-net-ops.json` |
| **W-funcs-engine** | `consolefunclist_8888` | non-obvious funcs (skip pure IntentionalCrash unless `danger` note) | `funcs/engine.json` or vars tags |
| **W-anim-unknown** | `consolevarlist_8889` | **exclude** well-known `ProcFace_*` overlay set; document the rest | `vars/anim-misc.json` |

Second wave (later): remaining uncategorized dump lines after subtract documented keys.

### Per-agent exploration recipe (paste into prompt)

```text
Path A catalog: document UNKNOWN console vars from robot dumps (not WebViz-covered domains).

DUMP: resources/webserver/.docs/consolevarlist_8888  (or _8889 / funclist)
PROCESS: engine|anim
CLUSTER: only names matching <prefix or provided id list>
SKIP: MirrorMode/Faces/Markers draw, MoodManager webviz periods, ProcFace custom-eyes recipe set,
      Mic clip recipe, navmap render knobs already understood — unless in your id list explicitly.

For each dump id:
  1. rg exact id in repo (cpp/h) — find CONSOLE_VAR / CONSOLE_FUNC and call sites
  2. blurb: one factual sentence from code/comments
  3. status: live|dead|partial|danger
  4. dead only if define-only (prove with rg)
  5. evidence: path:line
  6. process: from dump port

Do NOT invent ids. Prefer clarity over exhaustiveness within the cluster.
Return: sources, JSON {"vars":{...}}, confidence, gaps.
Write: resources/webserver/consolevars/vars/<shard>.json
```

### Dead-var detection heuristic

```bash
rg -n "SomeExactIdFromDump" -g '*.{cpp,h}'
```

If only the CONSOLE_VAR/FUNC registration line → candidate `status: "dead"`.

### Orchestrator post-wave checklist

- [ ] Every shard key ⊆ corresponding dump file  
- [ ] No wave spent primarily on WebViz-redundant domains  
- [ ] JSON valid; `index.json` updated  
- [ ] Spot-check 3 ids on `/consolevars` UI  
- [ ] Coverage metric: `documented / len(dump)` reported  

---

## Phase 5 — UX polish (still Path A)

### What to implement

1. Optional compact filter box on classic page (pure JS; filter labels under `#tabs`) — only if low risk.  
2. Coverage line: “Documented N / visible M” using catalog keys ∩ DOM ids (M from DOM).  
3. Align any remaining explorer-only CSS with tokens if explorer files stay in tree (optional, non-blocking).  
4. Update `README.consolevars.md` to point at Path A + shards + AGENTS.md.

### Verification

- [ ] Filter (if any) does not break tab widgets  
- [ ] README matches deploy steps (scp / restart)  

---

## Phase 6 — Verification (final)

### Functional

1. Open `http://<robot>:8888/consolevars` after deploy.  
2. Theme dark; sliders/checkboxes still write via `consolevarset`.  
3. Documented var shows `?`; dead var shows glyph; both still interactive.  
4. Anim port `:8889` still works; anim-only catalog entries decorate when present.

### Structural grep checks

```bash
# markers intact
rg -n "generated html|generated style|generated script" resources/webserver/consolevarsui.html

# no new C++ handlers required for this plan
# (do not add mg_set_request_handler for console docs)

# tokens used
rg -n "--wv-" resources/webserver/consolevarsui.html resources/webserver/consolevars-chrome.css 2>/dev/null

# shards
ls resources/webserver/consolevars/vars/
```

### Deploy proof (copy-only)

| Artifact | Action on robot |
|---|---|
| `consolevarsui.html` | scp + **restart** eng/anim process |
| `consolevars-app.js`, `consolevars/**/*.json`, `*.css` | scp + hard-refresh |

### Success criteria

- [ ] Path A works on robots **without** explorer route  
- [ ] Theme matches WebViz tokens + Inter  
- [ ] Catalog is multi-file; agents can extend one shard  
- [ ] Parallel exploration produced ≥1 solid domain shard with evidence  
- [ ] Zero new endpoints  

---

## Execution order (summary)

| Order | Phase | Parallelism |
|---|---|---|
| 1 | Phase 0 read | sequential |
| 2 | Phase 1 theme | 1 agent |
| 3 | Phase 2 decorate | 1 agent (after or slight overlap with 1 if careful) |
| 4 | Phase 3 shards + migrate | 1 agent |
| 5 | **Phase 4 explore waves** | **N background subagents in parallel** — clusters from `.docs/consolevarlist_*`, **not** WebViz-covered domains |
| 6 | Phase 5 polish | 1 agent |
| 7 | Phase 6 verify | orchestrator |

---

## Out of scope (this plan)

- C++ `ConsoleVarsExplorerUI` / making explorer the default route  
- Path B static SPA rebuilt from `/consolevarlist`  
- Documenting every CONSOLE_VAR in the tree  
- Changing webserver tick/config beyond resources  

---

## Handoff prompt (for `/do` or next session)

```text
Execute resources/webserver/plans/01-path-a-consolevars.md
Follow resources/webserver/AGENTS.md.
Path A only: no new endpoints, no C++.
Phases 1→2→3 then Phase 4 with parallel background explore subagents
seeded from resources/webserver/.docs/consolevarlist_8888|_8889 and funclists.
Cluster by dump prefixes (Keepaway, EnrollFace, Exploring/HLAI, Sleep, interact,
dock/actions, BW_, playpen/mfg, net-ops, anim-misc). Deprioritize WebViz-covered
domains (mirror/faces/mood/procface recipes/mic clip). Write consolevars/vars/*.json.
Verify Phase 6 before claiming done.
```
