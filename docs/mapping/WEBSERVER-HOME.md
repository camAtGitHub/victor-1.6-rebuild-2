# Webserver home landing (`:8888` / `:8889`)

**Path:** `resources/webserver/index.html` (+ `home-*.{css,js}`)  
**Mapped:** 2026-09-10   **Depth:** L1   **Confidence:** high  
**Upstream docs:** `docs/development/web-server.md` (stock Civetweb overview — **do not edit**; this note covers the rebuilt themed home)

## What this is

The classic Victor embedded-web **home** page served by the engine (`:8888`) and anim (`:8889`) webservers. Tabs cover MAIN, CONSOLE VARS (link-out), PERF, ENGINE (engine only), PROCESSES, FILES, PERF METRIC, and related surfaces. Chrome matches WebViz / Console Vars (`--wv-*`); client extras (sparklines, flag pills, robot overlay) ride the existing polls.

## Ports

| Port | Process | Home notes |
|---|---|---|
| **8888** | `vic-engine` | Full home: PERF + ENGINE + PERF METRIC + processes |
| **8889** | `vic-anim` | Same chrome; ENGINE tab disabled; anim console-var set |
| 8887 | standalone | Stock note: often broken; PERF METRIC may be disabled |

Config: `resources/webserver/webServerConfig_{engine,anim,standalone}.json` (`startPage` stays `page_consolevars` — do not change for home chrome work).

## Endpoints used by home

| Endpoint | Role |
|---|---|
| `POST /getinitialconfig` | Boot: titles, whichWebServer, page allow-flags |
| `POST /getmainrobotinfo` | MAIN: serial / build / static robot info |
| `POST /getperfstats?<bitstring>` | PERF table; bitstring mirrors row checkboxes |
| `POST /getenginestats?<bitstring>` | ENGINE table (engine only); bitstring mirrors checkboxes |
| `POST /getprocessstatus?proc=` | PROCESSES status strip |
| `GET/POST /systemctl?proc=&…` | PROCESSES stop / start / restart |
| `POST perfmetric?…` | PERF METRIC status/start/stop/dump* |
| `POST consolefunccall` | MAIN (and related) console function calls |
| FILES submits | `persistent`, `resources`, `cache`, `currentgamelog` folder POSTs |

Console-var pages use the separate `/consolevars*` family (see `resources/webserver/AGENTS.md`). WebViz is `/webViz.html` + `/socket` — not this landing.

## Client extras (no extra polling)

| Piece | File | Behavior |
|---|---|---|
| Chrome | `home-chrome.css` | `--wv-*` panels/tabs/tables; dark/light via `WebVizTheme` |
| Sparklines | `home-spark.js` | SVG ring buffers; samples only when that row’s checkbox is on **and** an existing PERF/ENGINE poll already ran |
| Explainers | `home-catalog.js` | `?` blurbs keyed by row `desc` |
| Flag pills / mic / overlay | `home-overlay.js` | Decode `StatusFlags` + mic directions from ENGINE values; SVG hotspots over the top-down photo |
| Overlay photo | `images/vector-topdown.png` | Downscaled from `/tmp/robotTopDown.png` (1000×710). **Lift/front RIGHT**, backpack/rear LEFT |

Default poll period **1000 ms** (min **250**). Do **not** raise rates, add per-row HTTP, or open WebSockets for these extras.

## CDN gone

Third-party scripts/CSS live under `vendor/`. Inter is local: `webviz/css/fonts.css` + `/fonts/inter-latin-*.woff2`. No fonts.googleapis.com / CDN fetches for home or modern WebViz.

## ENGINE checkboxes (C++)

`/getenginestats` in `engine/cozmoEngine.cpp` now honors the checkbox bitstring. Inactive slots still emit an **empty line** so `payload[i]` indexing stays aligned with `engineItems` (42 slots). Short/missing query → remaining bits treated as on (unfiltered clients still get every field). PERF `/getperfstats` already used a bitstring.

Static UI assets still deploy by **scp + hard-refresh** (`static_file_max_age` **0** in `webServerProcess/src/webService.cpp`). The checkbox-bit fix needs an **engine rebuild/flash**.

## Talks to

- Depends on: Civetweb handlers in `webServerProcess/` + engine registrations in `engine/cozmoEngine.cpp` [CONFIRMED]
- Theme tokens: `resources/webserver/webviz/css/tokens.css` [CONFIRMED]
- Product rules: `resources/webserver/AGENTS.md` [CONFIRMED]

## Open questions

- [UNKNOWN] On-robot smoke after scp (static) + flash (getenginestats bits) not recorded in this note.
