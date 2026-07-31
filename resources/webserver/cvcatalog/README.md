# Console vars catalog (shards)

**On disk:** `resources/webserver/cvcatalog/`  
**URL prefix:** `/cvcatalog/` (e.g. `/cvcatalog/index.json`)

## Why not `/consolevars/`?

The webserver registers a CivetWeb handler for **`/consolevars`** that also matches **`/consolevars/*`**.  
If catalog JSON lived there, `GET /consolevars/index.json` would return the **HTML UI**, not JSON — decoration would never load.

## Layout

```text
cvcatalog/
  index.json          # lists shards
  meta.json
  vars/*.json
  categories/*.json
  recipes/*.json
```

Browser: load `/cvcatalog/index.json` → fetch each shard → merge (`vars` Object.assign, `recipes` concat).

Fallback if index fails: `/cv-catalog.json`.

Any static path starting with `/consolevars` is stolen by the UI handler (including `/consolevars-app.js`).

## Rules for agents

**Full mapping workflow (plain-English blurbs, paths, progress):** see **`AGENTS.md`** in this folder.

1. Catalog keys = exact UI / dump ids (`resources/webserver/.docs/consolevarlist_*`).
2. Diff dumps vs `vars/*.json` to find unmapped names; do **not** delete dump lines when done.
3. Prefer documenting unknown clusters; WebViz-covered surfaces are lower priority.
4. Write for a reader who knows **no** other vars; record robot/asset **paths** when relevant.
5. `status: dead` only with evidence; never disable the control in UI.
6. Register new shard files in `index.json`.
7. Keep shards small (~20–80 vars).
