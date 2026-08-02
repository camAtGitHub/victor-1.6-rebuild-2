# webviz/

**Path:** `resources/webserver/webviz/`  
**Mapped:** 2026-07-29   **Depth:** L1   **Confidence:** high

## What this is

Modular **host shell** for WebViz. Entry page is still `../webViz.html` (served by engine/anim web servers). Stock folder-tab UI lives at `../webViz.legacy.html`.

## Layout

| Entry | What |
|---|---|
| `css/tokens.css` | Design tokens (dark defaults + light overrides; light module content surface) |
| `css/shell.css` | App grid, nav, surfaces, toasts |
| `js/config.js` | Port → module registry (engine 8888 / anim 8889) |
| `js/socket.js` | WebSocket + reconnect + resubscribe |
| `js/loader.js` | Sequential load of `webVizModules/*.js` IIFEs + scoped CSS |
| `js/shell-ui.js` | Nav / surfaces / toasts DOM |
| `js/theme.js` | Color scheme preference + `data-theme` apply (`WebVizTheme`) |
| `js/app.js` | Bootstrap + lifecycle (wires `#themeSel`) |

## Theme

Selectable chrome color scheme on the modern shell (`webViz.html` / `webViz.beta.html`).

| Concept | Mechanism |
|---|---|
| Preference | `localStorage` key **`webviz.colorScheme`** ∈ `"system"` \| `"dark"` \| `"light"` (default **system**) |
| UI control | Top bar `<select id="themeSel">` — System / Dark / Light; `app.js` → `WebVizTheme.setPreference` |
| Effective theme | `html[data-theme="dark"]` or `html[data-theme="light"]` only (never `"system"` on the attribute) |
| Resolve | System → `prefers-color-scheme`; missing media API → **dark** (historic default) |

### Files

| File | Role |
|---|---|
| `css/tokens.css` | SoT: dark values on `:root`; light reassigns same `--wv-*` names under `html[data-theme="light"]` |
| `js/theme.js` | `WebVizTheme` API: get/set preference, apply, OS listener; self-inits |
| `webViz.html` / `webViz.beta.html` | Inline **FOUC** script in `<head>` before CSS sets `data-theme` from storage + `matchMedia` |

Path A mirror (console vars): `../cv-tokens.css` — keep in sync when the palette changes. Consolevars has **no** theme UI in v1; setting `data-theme` in DevTools (or later FOUC) is enough for token-driven chrome.

### Invariant — chrome vs module hosts

**Shell theme (dark/light) recolors chrome only.**  
`.module-host` stays a **light content surface** (`--wv-content-*`) so stock Flot / D3 / canvas / DataTables modules remain readable under either chrome theme.  
`#surface-overview .module-host` uses shell tokens (overview is native shell UI, not a legacy chart host).  
**`navMap`** keeps its own dark p5 canvas (intentional viz island — do not force a white map background).

Modules must **not** depend on `WebVizTheme`. Dual-theme chart canvases are out of scope for Plan 02.

### Manual smoke list (no robot browser from agents)

After scp / hard-refresh, flip System / Dark / Light and spot-check:

| Module | Why |
|---|---|
| Overview | Shell light/dark cards |
| behaviors | D3 Gantt on light host |
| mood | Flot |
| micData (or micDataEngine) | Canvas clock |
| navMap | Dark p5 island still readable |

Also optional: cpu / cpuprofile (Flot), visionScheduleMediator (canvas grid).

## Module contract (unchanged)

Each `webVizModules/*.js` still registers via:

```js
(function (myMethods, sendData) {
  myMethods.init = function (elem) { ... };
  myMethods.onData = function (data, elem) { ... };
  myMethods.update = function (dt, elem) { ... };
  myMethods.getStyles = function () { return `...`; };
})(moduleMethods, moduleSendDataFunc);
```

Wire protocol unchanged: subscribe / unsubscribe / data on `/socket`.

## Why light content hosts (any shell theme)

Legacy modules (Flot, DataTables, D3 Gantt, jQuery UI-ish markup) assume a **light** canvas. Regardless of shell dark/light, `.module-host` uses `--wv-content-bg` (≈ `#ededed` dark-chrome default, white paper under light chrome) so charts and stock CSS remain readable. Freeplay-specific UX (stack / log / gates) is **not** baked into the shell — that lands later as a module rewrite.

## Remote robot feed (dev PC serves HTML)

HTML/JS can load from your laptop; the WebSocket can point at the robot:

```js
// Browser console on http://localhost:…/webViz.html
WebViz.connect("192.168.1.42")        // engine :8888
WebViz.connect("192.168.1.42", 8889)  // anim
WebViz.useLocal()
WebViz.help()
```

Also: sidebar **Robot feed** field, or URL  
`webViz.html?host=192.168.1.42&port=8888`  
(persists in `localStorage` as `webviz.feedHost`).

Robot WebService does not gate WS by Origin (civetweb handler accepts connections), so cross-host WS from a static server works on the LAN.

## Open follow-ups

- Harden individual modules (`behaviors.js` stratify id bug, etc.)
- Optional enhanced Freeplay surface
- Local vendor fallbacks when CDN is unreachable
