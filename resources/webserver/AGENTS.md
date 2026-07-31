# AGENTS.md — `resources/webserver/`

Guidance for agents (and humans) changing **on-robot web UI** assets.  
Scope: static HTML/CSS/JS/JSON under this tree. Prefer scp + process restart over any C++ rebuild.

---

## 1. Prime rules

1. **Do not add new HTTP endpoints** or change Civetweb/C++ handlers unless the user explicitly asks **and** a rebuild is available. Use routes that already exist.
2. **Build on what exists** — extend templates, CSS, and client JS; do not invent parallel servers or alternate protocols.
3. **Path A for console vars (current strategy):**
   - Keep **`GET /consolevars`** and C++-injected control markup.
   - Reskin via CSS, decorate via JS, document via catalog JSON.
   - Do **not** depend on `GET /consolevars-explorer` — that route may be **absent** from robots that have not rebuilt webserver C++.
4. **Copy-only deploy is first-class.** Many robots cannot recompile. Prefer changes that work after `scp` + hard-refresh, and process restart only when HTML templates are re-read at startup.
5. **Do not edit firmware C++** for cosmetic or docs UI work. Stay in `resources/webserver/`.
6. **Do not open or transmit credentials** (e.g. repo-root `robot_sshkey`).

---

## 2. Existing routes (use these)

| Route | Role |
|---|---|
| `GET /consolevars` | Classic console UI; C++ injects tabs/controls into `consolevarsui.html` |
| `POST /consolevarset` | Set var (`key`, `value`) |
| `GET /consolevarget?key=` | Read one var |
| `GET /consolevarlist` | List vars (optional filter) |
| `GET /consolefunclist` | List console functions |
| `POST /consolefunccall` | Call function (`func`, `args`) |
| `GET /consolevars-explorer` | **Optional / may be missing** on older binaries — do not require it |
| WebViz shell | `webViz.html` + `webviz/` + modules |
| Static files | Served from this resource tree (exact path depends on install) |

Upstream notes: `docs/development/web-server.md`.

**Ports:** Engine `:8888`, Anim `:8889` — different `CONSOLE_VAR` sets per process.

---

## 3. Visual theme (canonical)

**Source of truth:** `webviz/css/tokens.css` (`--wv-*` variables).  
**Path A tokens file:** `cv-tokens.css` (same values as WebViz tokens; self-contained deploy). Keep in sync with `webviz/css/tokens.css` when palette changes.  
Static asset names must **not** begin with `consolevars` (CivetWeb steals those URLs).  
New chrome **must use `--wv-*` tokens**. Do not invent a second palette.

### Surfaces

| Token | Hex | Use |
|---|---|---|
| `--wv-bg` | `#0c0f14` | Page background |
| `--wv-bg-elev` | `#12161e` | Header / elevated chrome |
| `--wv-bg-panel` | `#161b24` | Cards, tab panels, fieldsets |
| `--wv-bg-hover` | `#1c2330` | Hover |
| `--wv-bg-active` | `#222a3a` | Active / selected |
| `--wv-bg-input` | `#0e1218` | Inputs, search fields |

### Lines & text

| Token | Hex | Use |
|---|---|---|
| `--wv-line` | `#2a3344` | Borders / frames |
| `--wv-line-soft` | `#1e2533` | Subtle dividers |
| `--wv-line-strong` | `#3a465c` | Strong borders |
| `--wv-text` | `#e8edf5` | Primary text |
| `--wv-text-dim` | `#8b95a8` | Secondary |
| `--wv-text-faint` | `#5c667a` | Muted / meta |

### Accents & status

| Token | Hex | Use |
|---|---|---|
| `--wv-accent` | `#5b9fd4` | Links, focus, primary actions |
| `--wv-accent-dim` | `rgba(91,159,212,0.14)` | Soft highlight |
| `--wv-good` | `#3ecf8e` | Success / live |
| `--wv-warn` | `#e6b450` | Caution / partial |
| `--wv-bad` | `#f07178` | Danger / error |
| `--wv-violet` | `#c792ea` | Anim-process accent (optional) |

### Type

| Role | Stack |
|---|---|
| **UI sans** | `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| **Mono** (var names, values, code) | `ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace` |

Load Inter like WebViz (`fonts.googleapis.com` … `Inter:wght@400;500;600;700`) when the page is dark chrome.  
**Body ~13px / 1.45.** Labels for console var ids: mono ~12px.

### Geometry

| Token | Value |
|---|---|
| `--wv-radius` | `8px` (panels, cards) |
| `--wv-radius-sm` | `6px` (inputs, fieldsets) |
| `--wv-radius-pill` | `999px` (badges) |
| Spacing scale | `--wv-space-1`…`5` → 4 / 8 / 12 / 16 / 24 px |

### “Frames”

Use **one frame language** everywhere:

- Panel = `background: var(--wv-bg-panel); border: 1px solid var(--wv-line); border-radius: var(--wv-radius);`
- Nested fieldset = same with `--wv-radius-sm`
- Header bar = `--wv-bg-elev` + bottom border `--wv-line`
- Do not introduce thick skeuomorphic frames or light jQuery-UI defaults on new work

### WebViz content exception

WebViz **module hosts** may keep a light content surface (`--wv-content-*`) so charts/tables stay readable.  
**Console vars chrome is full dark** — no light content well unless embedding a chart later.

### Density

Developer-ops UI: dense, high information, low decoration. Prefer pills/badges over large hero blocks.

---

## 4. Console vars — Path A (required approach)

### Architecture

```
C++ (existing)          resources (we own)
───────────────         ──────────────────
Register CONSOLE_VAR →  consolevarsui.html  (template markers)
Inject HTML into        CSS tokens + chrome
  <!-- generated html -->
Serve APIs              JS decorator + catalog shards
```

1. **Do not reimplement** the control list in the browser unless the user later chooses Path B.
2. **Restyle** generated nodes: `#tabs`, `fieldset`, `label`, `.slider`, `.amount`, `.listbox`, `.function`, checkboxes.
3. **Decorate** after load: for each catalog entry whose `id` matches a control, add help + status UI.
4. **Catalog is progressive** — most vars have no entry; that is OK.

### C++ template markers (do not remove)

`consolevarsui.html` (and explorer template if present) must keep:

- `/* -- generated style -- */`
- `// -- generated script --`
- `<!-- generated html -->`

C++ replaces these strings. Breaking them yields an empty vars page.

### Generated control shapes (style these)

| Kind | Markup cues |
|---|---|
| Bool | `input[type=checkbox]` + `label[for=id]`, `onclick=onCheckboxClickHandler` |
| Numeric | `.slider` (`data-value|begin|end|scale`) + `input.amount` id `Var_amount` |
| Enum | `select.listbox` |
| Func (no args) | `input.function` value = name |
| Func (args) | `Var_args` text + `Var_function` Call button |

Ids equal console var / function names. Catalog keys **must match those ids**.

### Explainers & dead marks (product intent)

| UI | When | Behavior |
|---|---|---|
| **`?` / ⓘ** | Catalog has `blurb` | Tooltip or small popover; do not clutter rows without docs |
| **Dead / orphan glyph** | `status: "dead"` (or `orphan` / `noop`) | Visible mark + `statusNote` tooltip; **do not disable** the control |
| Nothing | No catalog entry | Leave row stock (styled only) |

Suggested status values: `live` | `dead` | `partial` | `danger`.

### Catalog files (prefer shards, not one behemoth)

**Target layout** (create when implementing; keep shards small for agents):

```text
resources/webserver/cvcatalog/   # URL /cvcatalog/*  — NOT under /consolevars/
  index.json
  meta.json
  vars/*.json
  categories/*.json
  recipes/*.json
```

⚠️ **CivetWeb:** handler `/consolevars` also matches `/consolevars/*`. Catalog JSON must **not** live at `/consolevars/...` or fetches return the HTML UI.

- Browser loads `/cvcatalog/index.json`, merges shards.
- Fallback: `/cv-catalog.json` (must not start with `/consolevars`).

Entry sketch:

```json
{
  "vars": {
    "kRenderZOffset": {
      "process": "engine",
      "blurb": "One sentence: what it is for.",
      "status": "dead",
      "statusNote": "Why it no-ops on this tree.",
      "requires": [],
      "related": [],
      "evidence": "optional path or note",
      "tags": []
    }
  }
}
```

`process`: `engine` | `anim` | `both` — filter by port when useful.

### Deploy (Path A)

| Changed | Robot action |
|---|---|
| `.js` / `.json` / `.css` only | scp + browser hard-refresh |
| `consolevarsui.html` | scp + **restart** eng/anim webserver process (template cached at start) |

---

## 5. WebViz (related chrome)

| Path | Role |
|---|---|
| `webViz.html` | Modern shell |
| `webviz/css/tokens.css` | **Theme tokens** |
| `webviz/css/shell.css` | Shell layout |
| `webviz/js/` | Shell logic |
| `webVizModules/` | Stock modules (keep protocol-compatible) |
| `webViz.legacy.html` | Legacy UI |

Module JS should keep working if the shell is absent; do not break stock module contracts for theme work.

---

## 6. Do / don’t checklist

| Do | Don’t |
|---|---|
| Use `--wv-*` tokens | New random hex palettes per page |
| Extend `/consolevars` + existing set/list/call APIs | New REST paths for docs or theming |
| Progressive catalog shards | One huge mandatory JSON |
| Mark dead vars without disabling | Grey-out / remove orphan vars from UI |
| Match Inter + mono + 8px radius | Bring back default jQuery UI light skin for new chrome |
| scp-friendly resource edits | Require C++ rebuild for docs/theme |
| Keep template injection markers | Rewrite generated HTML structure unless user asks |

---

## 7. File map (this folder)

| Entry | Notes |
|---|---|
| `AGENTS.md` | This file |
| `consolevarsui.html` | Path A template for `/consolevars` |
| `consolevars-explorer.html` | Explorer template; needs C++ route to inject |
| `cv-app.js` | Decorator / recipes |
| `cv-tokens.css` / `cv-chrome.css` | Theme |
| `cv-catalog.json` | Monolithic catalog fallback |
| `cvcatalog/` | Multi-file catalog (URL `/cvcatalog/`) |
| `README.consolevars.md` | Human consolevars notes |
| `webViz.html`, `webviz/` | Modern WebViz |
| `webVizModules/` | Per-module scripts |
| `webServerConfig_*.json` | Port / feature flags for webserver process |
| `style.css`, jQuery assets | Legacy shared CSS/JS |

---

## 8. When C++ rebuild becomes available (later)

Only then consider: default `/consolevars` → modern template, or enable `/consolevars-explorer` injection. Until then, Path A on classic route is the only guaranteed robot path.

---

## 9. Live inventory dumps (unknown vars)

Robot-exported name lists (one id per line) for agents documenting the **opaque** majority:

```text
resources/webserver/.docs/
  consolevarlist_8888
  consolevarlist_8889
  consolefunclist_8888
  consolefunclist_8889
```

- Catalog keys must match dump strings exactly.  
- Prefer documenting clusters **not** already clear via WebViz modules / existing recipes.  
- Plan: `plans/01-path-a-consolevars.md` Phase 4.

## 10. Quick answers

- **Theme source?** `webviz/css/tokens.css`
- **Font?** Inter (UI) + system mono (ids/values)
- **Console vars strategy?** Path A: CSS + JS decorate C++ markup; catalog explainers progressive
- **New endpoints?** No
- **Explorer route?** Optional; must not be required
- **Dead var UX?** Glyph + tooltip; control stays usable
- **Docs growth?** Add a small JSON shard from dump-backed exploration; reload page
- **What to document first?** Unknown prefixes from `.docs/consolevarlist_*`, not WebViz-covered surfaces
