---
name: doco-more-consolevars
description: Map undocumented Vector console variables into cvcatalog shards: diff robot dumps vs catalog, research registration/call sites, write plain-English entries with process/blurb/evidence/paths/status, and register shards in index.json. Use when the user runs /doco-more-consolevars, or says document console vars, map unmapped consolevars, expand cvcatalog, fill console var tooltips, or research consolevarlist gaps.
---

# Document more console vars (`cvcatalog/`)

Find unmapped console variables/functions, trace them in the codebase, and write human-readable catalog entries under `resources/webserver/cvcatalog/`.

## Mandatory first step

**Read the full mapping guide before researching or writing anything:**

```text
resources/webserver/cvcatalog/AGENTS.md
```

Also skim if present:

- `resources/webserver/AGENTS.md` — webserver theme, Path A, CivetWeb URL rules
- Existing shards under `resources/webserver/cvcatalog/vars/` — match style and schema
- `resources/webserver/cvcatalog/index.json` — how shards are registered

`AGENTS.md` is the **source of truth** for goals, inventory paths, research steps, field schema, status values, writing style, and the done checklist. This skill orchestrates that process; do not invent a different schema or invent dump ids.

## When invoked

1. **Read** `resources/webserver/cvcatalog/AGENTS.md` end-to-end.
2. **Diff** robot dumps vs catalog to find unmapped ids (engine `:8888` and/or anim `:8889` as relevant).
3. **Pick** a coherent prefix cluster (prefer opaque game/factory/sleep/explore internals over WebViz-obvious surfaces).
4. **Research** each id (registration → every use → paths/side effects → status).
5. **Write** entries into `cvcatalog/vars/<domain>.json` (or a new shard); update `index.json`.
6. **Optionally** note the session under `resources/webserver/.docs/progress/`.
7. **Report** what was documented, dead/orphan findings, confidence, and remaining unmapped count.

## Inventory and “unmapped”

| File | Port | Content |
|---|---|---|
| `resources/webserver/.docs/consolevarlist_8888` | Engine :8888 | var ids |
| `resources/webserver/.docs/consolevarlist_8889` | Anim :8889 | var ids |
| `resources/webserver/.docs/consolefunclist_8888` | Engine | function ids |
| `resources/webserver/.docs/consolefunclist_8889` | Anim | function ids |

- Dumps = **what the robot exposes**. Catalog **keys must match dump/UI ids exactly**.
- **Documented** = key present under `cvcatalog/vars/*.json` (and shard listed in `index.json`).
- **Never** remove completed names from the dump files. Completion = catalog entry only.

Quick unmapped sample (from repo root):

```bash
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

Regenerate dumps only when the user has a live robot and asks (see curl commands in `AGENTS.md`).

## Research loop (per dump id)

Follow **§4 Research process** in `AGENTS.md`. Summary:

1. **Registration** — `rg` for dump id and `k`/`g` prefix forms (`CONSOLE_VAR`, `CONSOLE_FUNC`, `MakeMemberTunable`, category string, process).
2. **Every use** — when read, what changes, prerequisites, dead-if-never-read.
3. **Paths / side effects** — robot paths (`/data/data/...`), assets, order of operations.
4. **Status** — `live` | `partial` | `dead`/`orphan`/`noop` | `danger` (prove dead with search).
5. **Write plain English** — standalone tooltip quality; use `blurb`, `detail`, `howTo`, `paths`, `evidence`, etc. as defined in `AGENTS.md`.

UI strips leading `k`/`g`: dump `IgnoreAnimWhitelist` ↔ code `kIgnoreAnimWhitelist`.

## Where to write

| Content | Path |
|---|---|
| Var/func notes | `resources/webserver/cvcatalog/vars/<domain>.json` → `{ "vars": { "Id": { ... } } }` |
| Category blurbs | `resources/webserver/cvcatalog/categories/<name>.json` |
| Recipes | `resources/webserver/cvcatalog/recipes/<name>.json` |
| Register shard | add path to `resources/webserver/cvcatalog/index.json` |
| Monolith | merge important keys into `cv-catalog.json` when practical |

Shard size: prefer **~20–80** entries per file. Group by dump id prefix.

## Writing rules (non-negotiable)

From `AGENTS.md` — enforce strictly:

- Answer: **If I flip this / set this number, what actually changes — in plain English?**
- Reader knows **nothing** about sibling vars, acronyms, or filenames unless you explain them.
- Prefer paths and multi-step `howTo` over cryptic one-liners.
- **Never disable** dead vars in the UI — mark `status` only.
- Exact dump strings only; **no invented ids**.

## Parallel / multi-agent (optional)

If covering a large unmapped set:

1. Orchestrator diffs dump vs catalog → assigns **prefix clusters**.
2. Each agent owns only those ids → one shard file.
3. Each agent **must read** `cvcatalog/AGENTS.md` first.
4. Return: sources, confidence, dead list, JSON.
5. Orchestrator merges and registers shards in `index.json`.

## Done checklist

Copy from `AGENTS.md` §8; do not mark complete until:

- [ ] Key equals dump/UI id exactly
- [ ] `process` correct (`engine` | `anim` | `both`)
- [ ] `blurb` readable alone
- [ ] Paths recorded if files are loaded
- [ ] `evidence` points at real code
- [ ] `status` honest
- [ ] Shard listed in `index.json`
- [ ] Optional: `resources/webserver/.docs/progress/session-YYYY-MM-DD.md`
- [ ] Git add files and commit changes

## Constraints

- This repo’s root `AGENTS.md` may be in a **documentation / mapping phase**. Creating or editing files under `resources/webserver/cvcatalog/` and optional progress notes under `resources/webserver/.docs/progress/` is the intended work of this skill when the user invokes it. Do **not** edit unrelated source, build, or git state unless the user asks.
- Do not open or print `robot_sshkey`.
- Do not run builds or clone `EXTERNALS` unless asked.

## Session report format

When finished, summarize:

1. Cluster(s) documented and shard path(s)
2. Count added / updated
3. Dead / partial / danger list
4. Remaining unmapped (engine/anim) if computed
5. Suggested next prefix cluster
