# webviz/

**Path:** `resources/webserver/webviz/`  
**Mapped:** 2026-07-29   **Depth:** L1   **Confidence:** high

## What this is

Modular **host shell** for WebViz. Entry page is still `../webViz.html` (served by engine/anim web servers). Stock folder-tab UI lives at `../webViz.legacy.html`.

## Layout

| Entry | What |
|---|---|
| `css/tokens.css` | Design tokens (dark ops chrome + light module content surface) |
| `css/shell.css` | App grid, nav, surfaces, toasts |
| `js/config.js` | Port → module registry (engine 8888 / anim 8889) |
| `js/socket.js` | WebSocket + reconnect + resubscribe |
| `js/loader.js` | Sequential load of `webVizModules/*.js` IIFEs + scoped CSS |
| `js/shell-ui.js` | Nav / surfaces / toasts DOM |
| `js/app.js` | Bootstrap + lifecycle |

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

## Why light content hosts on a dark shell

Legacy modules (Flot, DataTables, D3 Gantt, jQuery UI-ish markup) assume a **light** canvas. The shell is dark; `.module-host` keeps `#ededed` so charts and stock CSS remain readable. Freeplay-specific UX (stack / log / gates) is **not** baked into the shell — that lands later as a module rewrite.

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
