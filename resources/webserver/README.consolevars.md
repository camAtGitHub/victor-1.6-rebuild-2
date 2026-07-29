# Console vars UI (`/consolevars`)

**Paths:** engine `:8888/consolevars`, anim `:8889/consolevars`  
**Template:** `consolevarsui.html` (filled by `WebService::GenerateConsoleVarsUI`)  
**Catalog:** `consolevars-catalog.json` + `consolevars-app.js`

## How it works

1. C++ registers thousands of `CONSOLE_VAR` / `CONSOLE_FUNC` at runtime.
2. `GET /consolevars` builds HTML tabs from those registrations (ids = var names, categories = tab/fieldset).
3. Browser loads the template, then `consolevars-app.js` fetches the **curated catalog** and:
   - Shows **recipes** (e.g. MirrorMode face boxes) with **Apply** / **Highlight**
   - Attaches **blurbs**, **requires**, **related** links on known vars
   - Provides **filter** search across labels

The catalog is intentionally incomplete. Grow it when you discover useful combos.

## Adding a recipe or note

Edit `consolevars-catalog.json`:

```json
"vars": {
  "MyVarName": {
    "process": "engine",
    "blurb": "What it does in one sentence.",
    "requires": ["OtherVar"],
    "related": ["FriendVar"],
    "tags": ["highlight"]
  }
}
```

Var keys must match the **id** in the UI (first argument of `CONSOLE_VAR`, or `EnumToString` for VisionModes such as `Faces` / `MirrorMode`).

## Process ports

| Port | Process | Typical tabs |
|---|---|---|
| 8888 | Engine | Vision, Mood, Behaviors, … |
| 8889 | Anim | MicData, ProceduralFace, … |

Recipes filter by `process`. Open the matching port (or remote feed to that process).

## API (unchanged)

- `POST /consolevarset` key/value  
- `GET /consolevarget?key=`  
- `GET /consolevarlist`  
- `POST /consolefunccall`  

See `docs/development/web-server.md`.
