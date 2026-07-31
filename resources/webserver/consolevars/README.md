# Console vars catalog (sharded)

**Path:** `resources/webserver/consolevars/`  
**Consumer:** `consolevars-app.js` (`fetchCatalog`) on classic `/consolevars` and explorer (if present).

## Layout

```text
consolevars/
  index.json          # manifest — lists shard paths relative to this folder
  meta.json           # version, status glyph legend, process notes, dump pointers
  vars/*.json         # { "vars": { "DumpId": { ... } } }
  categories/*.json   # { "categories": { "Tab.Path": { ... } } }
  recipes/*.json      # { "recipes": [ { "id", "steps", ... } ] }
  README.md           # this file
```

Browser: load `consolevars/index.json` → fetch each listed shard → merge:

| Section | Merge |
|---|---|
| `vars` | `Object.assign` (later shard wins on key clash) |
| `categories` | `Object.assign` |
| `recipes` | concatenate arrays |
| `meta` | single `meta.json` if listed |

If `index.json` fails, app falls back to root `consolevars-catalog.json` (monolithic copy).

A **missing single shard** is warned and skipped; the rest still load.

## Rules for agents (when documenting vars)

1. **Exact dump ids only.** Keys must match `resources/webserver/.docs/consolevarlist_8888|8889` and `consolefunclist_*` strings — the same ids the UI uses (usually **without** leading `k`/`g`). Do not invent names. Source symbols like `kRenderZOffset` may appear in `evidence` notes only.
2. **One domain per file.** e.g. `vars/vision.json`, `vars/navmap-quadtree.json`. Target ~20–80 entries per file, not hundreds.
3. **Progressive.** Add entries as you verify them. Catalog is curated, not exhaustive. Prefer documenting high-value or confusing controls first.
4. **Deprioritize WebViz-covered domains.** Mood, CPU, cubes, intents, etc. already have WebViz modules — document console vars there only when they are not obvious from WebViz or when status is dead/danger.
5. **Evidence for dead/partial/danger.** Set `status` + `statusNote`; optional `evidence` (file path or dump note). Never mark dead without a read of the registration site.
6. **Recipes stay small.** One family per recipes file (or a tight bundle). Steps use dump ids in `{ "var", "value" }` or `{ "func", "args" }`.
7. **Register new shards in `index.json`.** A new file that is not listed will never load.
8. **Keep fallback in sync** when doing bulk migrations: either regenerate `../consolevars-catalog.json` as the merged view, or accept brief drift until the next sync. Prefer shards as source of truth.

## Entry sketch

```json
{
  "vars": {
    "RenderZOffset": {
      "process": "engine",
      "blurb": "One sentence: what it is for.",
      "status": "dead",
      "statusNote": "Why it no-ops on this tree.",
      "requires": [],
      "related": [],
      "evidence": "optional path or note",
      "category": "Optional.UI.Category",
      "tags": []
    }
  }
}
```

`process`: `engine` | `anim` | `both`.

Suggested `status`: `live` (default) | `dead` | `orphan` | `noop` | `partial` | `danger`.

## Deploy

JSON only → scp + browser hard-refresh (no process restart). See parent `AGENTS.md`.
