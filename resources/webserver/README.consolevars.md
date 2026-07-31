# Console vars UI (`/consolevars`) — Path A

**Path A (guaranteed on robot):** classic themed page only.  
**Ports:** engine `:8888/consolevars`, anim `:8889/consolevars`  
**Template:** `consolevarsui.html` → C++ injects tabs/controls at three markers  
**Chrome:** `/cv-tokens.css` + `/cv-chrome.css` (self-contained; same `--wv-*` as WebViz)  
**Decorator:** `/cv-app.js` — curated `?` help + `⌀` dead marks  
**Catalog:** `/cvcatalog/…` shards; fallback `/cv-catalog.json`  

⚠️ **Never name a static URL that starts with `/consolevars`** (except the HTML routes themselves). CivetWeb’s `/consolevars` handler prefix-matches, so `/consolevars-app.js` was returning the HTML page with HTTP 200.  
**Dumps:** `resources/webserver/.docs/consolevarlist_8888|8889`, `consolefunclist_*`  
**Agent rules:** `resources/webserver/AGENTS.md` · shard how-to: `cvcatalog/README.md`

Explorer (`consolevars-explorer.html` / `/consolevars-explorer`) is **optional** and may be missing without a webserver C++ rebuild. Do not depend on it for Path A.

## How it works

1. C++ registers `CONSOLE_VAR` / `CONSOLE_FUNC` at runtime.
2. `GET /consolevars` loads `consolevarsui.html` and injects category HTML (ids = dump/UI names).
3. `cv-app.js` fetches `/cvcatalog/index.json`, merges shards, and decorates matching rows.
4. Catalog is **progressive / incomplete** — grow shards when you verify useful or confusing controls.

UI ids strip Hungarian `k`/`g` (`kRenderZOffset` → `RenderZOffset`); catalog keys must match dump/UI ids.

## Adding a note or recipe

Prefer a domain shard, then list it in `cvcatalog/index.json`:

| Kind | Path |
|---|---|
| Var notes | `cvcatalog/vars/<domain>.json` → `{ "vars": { "DumpId": { ... } } }` |
| Category notes | `cvcatalog/categories/<name>.json` |
| Recipes | `cvcatalog/recipes/<name>.json` → `{ "recipes": [ { "id", "steps", ... } ] }` |

Entry sketch:

```json
"MyVarName": {
  "process": "engine",
  "blurb": "What it does in one sentence.",
  "status": "live",
  "requires": [],
  "related": [],
  "tags": []
}
```

`process`: `engine` | `anim` | `both`.  
`status` (optional): `live` (default) | `dead` | `orphan` | `noop` | `partial` | `danger`.

Recipe steps: `{ "var", "value" }` or `{ "func", "args" }`. Enum values are 0-based listbox indices.

## Process ports

| Port | Process | Typical tabs |
|---|---|---|
| 8888 | Engine | Vision, Mood, Behaviors, … |
| 8889 | Anim | MicData, ProceduralFace, … |

## Deploy (copy-only; no C++ rebuild)

| Changed | On robot |
|---|---|
| `.js` / `.json` / `.css` only | `scp` + browser **hard-refresh** |
| `consolevarsui.html` (template) | `scp` + **restart** eng/anim webserver (template cached at process start) |

**Minimum scp set for themed Path A:**  
`consolevarsui.html`, `cv-tokens.css`, `cv-chrome.css`, `cv-app.js`, **`cvcatalog/`**, optional `cv-catalog.json`.

**Sanity checks:**
- `http://<robot>:8888/cv-app.js` → starts with `/**` or `(function`, **not** `<!doctype`
- `http://<robot>:8888/cvcatalog/index.json` → JSON
- `http://<robot>:8888/consolevars-app.js` → **wrong name** (will be HTML if old)

No new HTTP routes. Stock APIs only: `consolevarset`, `consolevarget`, `consolevarlist`, `consolefunclist`, `consolefunccall`.

See `docs/development/web-server.md` and `resources/webserver/AGENTS.md`.
