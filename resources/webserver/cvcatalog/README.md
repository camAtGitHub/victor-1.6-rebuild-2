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

1. Catalog keys = exact UI / dump ids (`resources/webserver/.docs/consolevarlist_*`).
2. Prefer documenting unknown clusters; WebViz-covered surfaces are lower priority.
3. `status: dead` only with evidence; never disable the control in UI.
4. Register new shard files in `index.json`.
5. Keep shards small (~20–80 vars).
