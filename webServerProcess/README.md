# webServerProcess

**Path:** `webServerProcess/`  
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high  
**Upstream docs:** `docs/development/web-server.md`

## What this is

Embedded **HTTP/WebSocket service** (civetweb) used for on-robot debug: filesystem browse, console vars/funcs, WebViz JSON streams. Built primarily as library `victor_web_library` and linked into engine and anim; a standalone process binary exists in source but is **commented out** in CMake.

## Why it exists

Dev/debug surface without a full remote debugger: browser or curl against robot IP ports 8887–8889 (see upstream doc). WebViz modules subscribe for live engine/anim state.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `src/webService.h` / `.cpp` | file | `WebService` — Start/Update/Stop, WebViz signals, console-var request types |
| `src/webVizSender.h` / `.cpp` | file | RAII helper to push JSON to a WebViz module if a client is subscribed |
| `src/victorWebServerMain.cpp` | file | Standalone process main (`LOG_PROCNAME "vic-webserver"`); config via `VIC_WEB_SERVER_CONFIG` |
| `CMakeLists.txt` | file | Builds `victor_web_library`; `vic-webserver` exe block commented |

## Key entry points

- `WebService::Start` / `Update` / `Stop` — lifecycle
- `SendToWebViz` / `OnWebVizSubscribed` / `OnWebVizData` — bidirectional WebViz
- `WhichWebServer` enum: `Standalone`, `Engine`, `Anim` (ports 8887 / 8888 / 8889 per doc)
- `victorWebServerMain.cpp` — process shell still present for potential standalone build

## Talks to

- Depends on: `civetweb`, `cti_vision`, `DAS`, `osState`, `robot_interface` — [CONFIRMED] CMake
- Depended on by: `engine` and `animProcess` link `victor_web_library` — [CONFIRMED]
- Upstream: crash-reports list `vic-webserver` as a Breakpad client process — [CONFIRMED] doc; binary currently not built here

## Build

Root `add_subdirectory("webServerProcess")`. Option `USE_DAS`. Standalone `#if (VICOS AND NOT ANKI_NO_WEBSERVER_ENABLED)` executable is fully commented; comment notes mac uses `webotsCtrlWebServer` instead.

## Notable observations

- Doc: port **8887 standalone currently does not work** — matches disabled exe.
- Engine embeds web server on 8888, anim on 8889; library is shared, process role via `WhichWebServer`.
- `WebVizSender` holds raw `WebService*` — short-lived RAII only (header warns against long storage).

## Open questions

- [UNKNOWN] Whether rebuild ever re-enables `vic-webserver` or relies solely on in-process servers
- [UNKNOWN] Full list of WebViz module name strings used across engine
