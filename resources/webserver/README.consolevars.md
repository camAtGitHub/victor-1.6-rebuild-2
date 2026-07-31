# Console vars UI (`/consolevars`) — Path A

**Path A (guaranteed on robot):** classic themed page only.  
**Ports:** engine `:8888/consolevars`, anim `:8889/consolevars`  
**Template:** `consolevarsui.html` → C++ injects tabs/controls at three markers  
**Chrome:** `consolevars-tokens.css` + `consolevars-chrome.css` (self-contained; same `--wv-*` as WebViz)  
**Decorator:** `consolevars-app.js` — curated `?` help + `⌀` dead marks; raw controls always work  
**Catalog (preferred):** sharded under `consolevars/` (`index.json` → `vars/`, `categories/`, `recipes/`, `meta.json`)  
**Catalog fallback:** root `consolevars-catalog.json` if the shard index fails  
**Dumps (name lists for docs agents):** `resources/webserver/.docs/consolevarlist_8888|8889`, `consolefunclist_*`  
**Agent rules:** `resources/webserver/AGENTS.md` · shard how-to: `consolevars/README.md`

Explorer (`consolevars-explorer.html` / `/consolevars-explorer`) is **optional** and may be missing without a webserver C++ rebuild. Do not depend on it for Path A.

## How it works

1. C++ registers `CONSOLE_VAR` / `CONSOLE_FUNC` at runtime.
2. `GET /consolevars` loads `consolevarsui.html` and injects category HTML (ids = dump/UI names).
3. `consolevars-app.js` fetches `consolevars/index.json`, merges shards, and decorates matching rows.
4. Catalog is **progressive / incomplete** — grow shards when you verify useful or confusing controls.

UI ids strip Hungarian `k`/`g` (`kRenderZOffset` → `RenderZOffset`); catalog keys must match dump/UI ids.

## Adding a note or recipe

Prefer a domain shard, then list it in `consolevars/index.json`:

| Kind | Path |
|---|---|
| Var notes | `consolevars/vars/<domain>.json` → `{ "vars": { "DumpId": { ... } } }` |
| Category notes | `consolevars/categories/<name>.json` |
| Recipes | `consolevars/recipes/<name>.json` → `{ "recipes": [ { "id", "steps", ... } ] }` |

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
`consolevarsui.html`, `consolevars-tokens.css`, `consolevars-chrome.css`, `consolevars-app.js`, `consolevars/` (shards), optional `consolevars-catalog.json` fallback.

No new HTTP routes. Stock APIs only: `consolevarset`, `consolevarget`, `consolevarlist`, `consolefunclist`, `consolefunccall`.

See `docs/development/web-server.md` and `resources/webserver/AGENTS.md`.
