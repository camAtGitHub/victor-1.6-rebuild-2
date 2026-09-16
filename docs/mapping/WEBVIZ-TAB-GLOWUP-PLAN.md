# WebViz tab glow-up — Implementation Plan

> **For agentic workers:** Execute phase-by-phase. Each phase is self-contained with doc refs, copy-from locations, and a verification checklist. Prefer success criteria over improvisation.
>
> **Do not** add JS libraries or CDN URLs. **Do not** add C++ producers or raise send rates. **Do not** invent dashboards, payload fields, or channels. **Do not** darken `.module-host`. **Do not** `vbuild` unless Phase 8 is explicitly requested.

**Goal:** Bring every registered WebViz tab in line with the **FreePlay / Social Presence** look and feel: dense ops chrome, professional product copy, existing wires actually connected. Robot CPU must not go up; client CPU may.

**Visual SoT (do not rewrite as part of this plan):**

- Ops console: `resources/webserver/webVizModules/freeplay.js` (`fp-*`, content tokens only)
- KPI + chart dashboard: `resources/webserver/webVizModules/socialPresence.js` (`sp-*`)

**Architecture:** Shared CSS kit (not a JS library) + per-module chrome wrap around existing viz. Stock IIFE contract unchanged. Subscribe-on-open unchanged. Deploy is **scp + hard-refresh**.

**Tech stack:** Vanilla JS IIFE modules, existing `/socket` protocol, `--wv-*` / `--wv-content-*` tokens, local `/vendor/` (d3, jquery, p5, flot, datatables already loaded by `webViz.html`). No new npm, no CDN, no Google Fonts.

**Related:** `resources/webserver/AGENTS.md` §3/§5, `resources/webserver/webviz/README.md`, `docs/mapping/WEBVIZ-FREEPLAY-DESIGN.md`, `docs/mapping/WEBVIZ-FREEPLAY-UX-PLAN.md`, `docs/mapping/WEBSERVER-HOME.md`.

---

## Success outcomes (definition of done)

| # | Outcome | Proof |
|---|---|---|
| S1 | Shared kit CSS exists and is loaded from **local** `webViz.html` + `webViz.beta.html` | `rg` the `<link>`; no `cdn` / `googleapis` / `jsdelivr` |
| S2 | Stock tabs (except FreePlay/SP as SoT) use `.wv-mod` header + live pill + empty state | Open each tab; waiting → live on first packet |
| S3 | `.module-host` stays light paper (`--wv-content-*`); no `module-host--ops`; no `--wv-bg` on module body | `rg` + theme toggle |
| S4 | No new `myMethods.channels` on stock tabs; FreePlay still the only multi-subscribe | `rg "channels =" webVizModules/` |
| S5 | Cpu / CpuProfile **do not** `consolevarset` on `init`; stream is opt-in | Network tab: no POST on open; button POSTs existing keys |
| S6 | Disconnected JS wires listed in Phase 0 are connected (Features `none`→`default`, cubes `NoTarget`, mood period HTML + legend redraw, BehaviorConds same-time reorder, audio `hasCallback`, intents app empty-select) | Grep + manual |
| S7 | Project-state copy gone; product copy from the rewrite table | String grep for `when this`, `new tab`, `helpful for developers`, `<marquee>` |
| S8 | No `alert()` in glowed modules | `rg alert\\( webVizModules/` empty or only comments |
| S9 | scp-only: all changes under `resources/webserver/` (Phase 8 C++ is optional and skipped by default) | `git diff --name-only` |

---

## Phase 0: Documentation Discovery (complete — Allowed APIs)

Research already done. This phase is the **authoritative Allowed APIs list**. Implementers must use only these.

### Sources consulted

| Source | What it defines |
|---|---|
| `resources/webserver/webVizModules/freeplay.js` | Ops chrome: `.fp-root` / header / pills / panel / empty / tokens-only `getStyles` (~2181–2912); DOM (~914–1010) |
| `resources/webserver/webVizModules/socialPresence.js` | KPI + live pill + empty overlay + Flot wrap (~142–179, ~979–1439) |
| `resources/webserver/webviz/css/tokens.css` | `--wv-*` chrome vs `--wv-content-*` paper |
| `resources/webserver/webviz/css/shell.css` | `.module-host` light well (L570–583); Overview exception (L585–592) |
| `resources/webserver/webviz/js/config.js` | `MODULES_ENGINE` / `MODULES_ANIM` / `GROUPS_*` / `DESCRIPTIONS` |
| `resources/webserver/webviz/js/app.js` | `subscribeModule` / `unsubscribeModule` / `wireRetain` / `fillOverview` — **tabs accumulate subscriptions** |
| `resources/webserver/webviz/js/socket.js` | `{type, module}` subscribe / unsubscribe / data |
| `resources/webserver/webviz/js/loader.js` | IIFE contract; `getStyles` scoped to `#tab-{key}` **and** `#panel-{key}` |
| `resources/webserver/webviz/js/shell-ui.js` | `ensureModuleSurface` → `#tab-{key}` + `.module-host` |
| `resources/webserver/AGENTS.md` | Tokens, no CDN, no new HTTP, scp-first, do not darken hosts |
| `resources/webserver/webViz.html` L69–74 | Local libs: `/vendor/d3.min.js`, `/vendor/jquery-3.3.1.min.js`, `/p5.min.js`, `/jquery.flot.min.js`, `/jquery.dataTables.min.js` |
| `webServerProcess/src/webService.h` L66–74 | `SendToWebViz`, `IsWebVizClientSubscribed`, `OnWebVizSubscribed`, `OnWebVizData` |
| `webServerProcess/src/webVizSender.cpp` L43–54 | `CreateWebVizSender` returns null unless subscribed |
| `osState/osState_vicos.cpp` L58 | `kWebvizUpdatePeriod` enum `Off,10ms,100ms,1000ms,10000ms` default **0 = Off** |
| `lib/util/.../cpuThreadProfiler.cpp` L33 | `kProfilerLogOutput` enum `Console,Chrome Tracing,WebViz` default **0 = Console** |

### Allowed APIs (copy these — do not invent)

**Wire protocol** (unchanged):

```js
// client → robot
{ type: "subscribe"|"unsubscribe"|"data", module: "<lowercase>", data?: any }
// robot → client
{ module: "<lowercase>", data: <json> }
```

**Module IIFE** (`loader.js` + `module.js.template`):

```js
(function (myMethods, sendData) {
  myMethods.init = function (elem) {};
  myMethods.onData = function (data, elem) {};
  myMethods.update = function (dt, elem) {};
  myMethods.getStyles = function () { return ""; };
  // FreePlay only (already shipped):
  // myMethods.channels = ["behaviors", "behaviorconds"];
  // myMethods.onChannelData = function (channel, data, elem) {};
})(moduleMethods, moduleSendDataFunc);
```

**Shell subscribe** (`app.js`):

- Opening a tab → `subscribeModule(key)` → `wireRetain` → WS subscribe
- Leaving a tab **does not** unsubscribe (subscriptions **accumulate**)
- Header Unsubscribe / `WebViz.unsubscribe('name')` → `wireRelease`
- Overview does **not** subscribe
- Client `update()` every `WebVizConfig.UPDATE_PERIOD_MS` (200) is **browser-only**

**Existing HTTP (use; do not add routes):**

| Call | Who already uses it |
|---|---|
| `POST /consolevarset` `{key, value}` | mood period, cpu period, cpuprofile output |
| `GET /sendAppMessage?type=AppIntent&intent=` | intents.js app Trigger (`webService.cpp` ~1045) |

**Toasts (replace `alert()`):**

```js
if (window.WebVizUI && typeof window.WebVizUI.toast === "function") {
  window.WebVizUI.toast("Title", "message", "info"); // or "warn" / "error"
}
```

**Theme:** modules **must not** call `WebVizTheme`. Dual-theme chart canvases are out of scope.

### Robot-CPU contract (non-negotiable)

| Do | Do not |
|---|---|
| Client ring buffers, CSS, canvas/Flot redraw, live-pill idle after 3s of no packets | New `SendToWebViz` producers |
| Keep one wire key per stock tab | New `myMethods.channels` (FreePlay is the only exception) |
| Opt-in `consolevarset` **from a button** | `consolevarset` inside `init` |
| Fix markup so existing POST/sendData binds | Raise `kRSPE_WebVizPeriod_s`, mood period default, VSM 50-frame, mic 0.2 s |
| Honest empty states for thin payloads | Invent IMU samples, HIP trust, battery %, thermal CPU, Body HUD composite |
| Leave subscribe-accumulate as-is | Auto-unsubscribe on tab switch (behavior change / inventing) |
| Local `/vendor/` + `/fonts/` | CDN, npm, new Flot/D3 plugins |

**Silent robot-load bombs to stop (Phase 1):**

- `cpu.js` `init` currently `POST consolevarset WebvizUpdatePeriod=3` → enum **1000 ms** (`osState_vicos.cpp` L58). Default is Off. Opening the tab today **turns the producer on**.
- `cpuprofile.js` `init` currently `POST consolevarset ProfilerLogOutput=2` → enum **WebViz**. Default is Console.

### Visual kit (copy, do not invent a third palette)

**Host invariant** (`shell.css` 570–583, `webviz/README.md`): `.module-host` stays `--wv-content-bg` / `--wv-content-text` / `--wv-content-line`. Never set host background. Never add `module-host--ops`.

**Copy FreePlay token recipe** (`freeplay.js` `getStyles` ~2181):

- Body: `--wv-content-text`, `--wv-content-bg`, `--wv-content-line`
- Status: `--wv-accent`, `--wv-accent-dim`, `--wv-good`, `--wv-warn`, `--wv-bad`
- Type: `--wv-sans`, `--wv-mono`, 13px / 1.45; labels 11px uppercase 0.04em
- Geometry: `--wv-radius`, `--wv-radius-sm`, `--wv-radius-pill`, `--wv-space-*`, `--wv-shadow-sm`
- Dim text = **opacity on content text**, not `--wv-text-dim`

**Copy Social Presence structure** (not its hex): header title + live pill + meta + one-line sub; KPI cards; empty overlay; waiting / live / idle.

**Shared classes** (Phase 1 `module-kit.css` — prefix `.wv-mod` so they do not collide with `.fp-*` / `.sp-*`):

| Class | Copy from |
|---|---|
| `.wv-mod` | `.fp-root` density + `.sp-root` column flow (`freeplay.js` 2185–2198, `socialPresence.js` 981–992) |
| `.wv-mod-header` / `.wv-mod-title` / `.wv-mod-sub` | `.sp-header` / `.sp-title` / `.sp-sub` (SP 996–1041) using **tokens** not `#5c667a` |
| `.wv-mod-live` `--waiting` `--live` `--idle` | `.sp-live*` (SP 1013–1031) using `--wv-good-dim` / `--wv-warn-dim` / `--wv-content-line` |
| `.wv-mod-meta` | `.sp-meta` (SP 1032–1036) + `--wv-mono` |
| `.wv-mod-kpis` / `.wv-mod-kpi` | `.sp-kpis` / `.sp-kpi` (SP 1055–1132) |
| `.wv-mod-panel` | `.fp-panel` (FP 2320-ish: 1px content-line, radius, content-bg, shadow-sm) |
| `.wv-mod-empty` | `.fp-empty` (opacity 0.55, 12px) |
| `.wv-mod-btn` / `.wv-mod-chip` | `.fp-tool-btn` / `.sp-chip` |
| `.wv-mod-table` | dense table; do not restyle DataTables internals beyond host padding |

KPI column counts: set **inline** (`socialPresence.js` `layoutKpiGrid` ~247–283). Do not put column counts in `@media` inside `getStyles` — loader scopes `#tab-*` and unscoped `@media` loses.

Live-pill helper (copy into each module or a 20-line function in the module file — **not** a new shared JS library):

- `waiting` until first `onData`
- `live` on packet; `lastPacketAt = Date.now()`
- `update()`: if `Date.now() - lastPacketAt > 3000` → `idle`
- Meta: `{n} pkt` or `—`

### Out of scope (do not do)

- New composite dashboards (Body HUD, sleep+power strip, intent timeline merge) — `README.webVis.TODO.md` Tier 1
- Filling `HeldInPalmTracker::PopulateWebVizJson` (empty `{}` in `heldInPalmTracker.h:86`) — **Phase 8 optional C++ only**
- App-intent dropdown populate (`DevGetAppIntentsList` exists; subscribe does not emit it) — needs C++
- Full IMU stream, battery % on Power, thermal on Cpu
- Rewriting FreePlay Ops grid or Social Presence Flot
- Darkening module hosts / dual-theme Flot
- Auto-unsubscribe on tab switch
- Editing `docs/architecture/` or `docs/development/`
- New HTTP endpoints

### Disconnected wires (connect these)

| # | Wire | File:line | Fix (no new C++) |
|---|---|---|---|
| W1 | Features `"none"` never applied | `features.js` ~105–108 vs `cozmoFeatureGate.cpp` ~312 (`default`/`enabled`/`disabled` only) | Send `"default"` when UI says none; on `{error:true}` toast, do not treat as table rows |
| W2 | Cubes NO TARGET never shows | JS `citInfo["noTarget"]` (`cubes.js` ~213); C++ `citInfo["NoTarget"]` (`cubeInteractionTracker.cpp` ~612) | Read `NoTarget` with lowercase fallback |
| W3 | Mood period control broken HTML | `mood.js` ~348–351 missing `>` | Fix markup so `#sendPeriod` exists; keep existing `consolevarset MoodManager_WebVizPeriod_s` |
| W4 | Mood legend checkbox no redraw | `mood.js` ~373–381 | `setupGrid()` + `draw()` like `#showEvents` |
| W5 | BehaviorConds stack/factor race | `behaviorConditions.js` ~453–455 TODO | Insert stack snapshot **before** first `c`/`i` of the same `time` |
| W6 | Audio `hasCallback` ignored | C++ `cozmoAudioController.cpp` ~594, 621; `audioEvents.js` columns | Add default-hidden column, same toggle pattern as other optional cols |
| W7 | Intents app `<select>` stays empty | subscribe sends user+cloud only | Hide empty app `<select>`; typed Trigger via `/sendAppMessage` stays |
| W8 | Cpu/CpuProfile auto-enable producers | `cpu.js` ~105; `cpuprofile.js` ~119 | Move POST to explicit buttons (Phase 1) |
| W9 | SP leak-test name filter | `socialPresence.js` `TEST_EVENT_NAMES` | Delete filter; do not add inject buttons for those names |

**Thin wires — copy only, do not invent fields:**

| Tab | Payload actually sent |
|---|---|
| IMU | `fall_impact_count` only (`robotToEngineImplMessaging.cpp` ~327–328) |
| Power | `powerSaveEnabled`, `powerSaveRequesters` (`powerStateManager.cpp` ~224–233) — **not** battery |
| HeldInPalm | empty JSON (`heldInPalmTracker.h:86`) |
| Cpu | `usage` + `deltaTime_ms` — **not** thermal |

### Copy voice

Product copy describes **what is on screen**. Drop migration notes, “when this lands”, “helpful for developers”, Webots dump lectures, nested `<marquee>`.

**Do not use** the copy-agent’s Overview line “data streams only while that module is open” — that is **false**. Subscriptions persist until Unsubscribe or page close.

Exact strings to copy are in each implementation phase below.

---

## Phase 1 — Shared kit, Overview, registry, CPU-safety

**What to implement**

1. Create `resources/webserver/webviz/css/module-kit.css` by **copying** the tokenized rules listed in Phase 0 (FreePlay panel/empty/btn + SP header/live/KPI structure). No hex except as CSS variable fallbacks matching `tokens.css`. No `.fp-*` / `.sp-*` names (those stay module-private).

2. Link it from `webViz.html` and `webViz.beta.html` **after** `tokens.css` / `shell.css`:

```html
<link rel="stylesheet" href="/webviz/css/module-kit.css" />
```

3. Rewrite Overview (`app.js` `fillOverview` ~623–674) and fake-data banner (~1158–1159). Copy these strings:

| Slot | Copy |
|---|---|
| H2 | `WebViz` |
| Intro | `Live debug for this robot process. Open a module in the sidebar to start its data stream. The stream stays on until you click Unsubscribe in the header, or close this page. Overview itself does not subscribe.` |
| Process card | keep process title + port (already factual) |
| Modules card | `{loaded} loaded / {total} registered` |
| Data feed | `This page host` / `Remote robot` + `wsUrl` (keep) |
| Other process | `Need Anim tabs?` / `Need Engine tabs?` + link (keep) |
| Dev PC callout | `Viewing from a PC: point the data feed at the robot with WebViz.connect('robot-ip') or ?host=…&port=8888. Page assets stay on this machine.` |
| Tip | `Force-refresh with Cmd/Ctrl+Shift+R after a deploy if a tab looks stale.` |
| Drop | The paragraph about `webViz.legacy.html` and `init` / `onData` / `getStyles` (author README, not operator copy) |
| Fake data | `Replay from devData.json is on. Live robot packets replace it as they arrive.` |

4. Rewrite `config.js` `DESCRIPTIONS` (copy exactly):

| Key | Copy |
|---|---|
| `overview` | `Connection, process, and module index` |
| `FreePlay` | keep |
| `Behaviors` | `Behavior stack over time, with force-run` |
| `BehaviorConds` | `BEI activation conditions and factors` |
| `Intents` | `Pending user, cloud, and app intents` |
| `CloudIntents` | `Cloud recognizer results as they arrive` |
| `Mood` | `Emotion traces, event markers, and mood set-points` |
| `SocialPresence` | keep |
| `NavMap` | `On-robot memory map` |
| `ObservedObjects` | `Faces and objects currently in view` |
| `VisionScheduleMediator` | `Active vision modes and their update periods` |
| `Cubes` | `Cube connection, coordinator, and hold tracking` |
| `Cpu` | `Per-core CPU use for this process` |
| `CpuProfile` | `Per-thread profiler samples` |
| `Features` | `Feature-gate defaults and persistent overrides` |
| `SoundReactions` | `Mic direction on the engine process` |
| `MicData` | `Mic direction on the animation process` |
| `Animations` | `Clip start and stop on the animation process` |
| `AnimationEngine` | `Animations started by engine actions` |
| `AudioEvents` | `Audio events on the animation process` |
| `SpeechRecognizerSys` | `Wake-word hits: score, timing, and ignore reasons` |
| `Alexa` | `Alexa auth and UX state` |
| `BeatDetector` | `Beat tempo, confidence, and threshold` |
| `Touch` | `Backpack capacitive touch` |
| `Habitat` | `On-charger habitat belief and stop-on-white` |
| `HeldInPalm` | `Held-in-palm tracker` |
| `Power` | `Power-save requests` |
| `IMU` | `Fall-impact count from the body IMU` |
| `Sleeping` | `Sleep cycle, debt, and last wake/sleep reason` |

5. **CPU-safety (reduces robot load vs today):**

**Cpu** (`cpu.js`): delete `$.post('consolevarset', {key: 'WebvizUpdatePeriod', value: 3})` from `init`. Wrap chart in `.wv-mod`. Add:

- Empty: `CPU stream is off. Start a 1 second sample to see per-core use.`
- Button `Start 1 s stream` → `POST consolevarset` `{key:'WebvizUpdatePeriod', value:3}` (enum index **3 = 1000ms**, `osState_vicos.cpp` L58)
- Button `Stop stream` → `value:0` (Off)
- Do **not** use 10ms or 100ms (enum 1 / 2)

**CpuProfile** (`cpuprofile.js`): delete `ProfilerLogOutput=2` from `init`. Add:

- Empty: `Profiler output is not sent here. Send samples to this tab to plot them.`
- Button `Send samples here` → `{key:'ProfilerLogOutput', value:2}` (WebViz)
- Button `Send samples to console` → `{key:'ProfilerLogOutput', value:0}`

6. `module.js.template`: point authors at `webviz/js/config.js` (not `webViz.html` `<head>`). Keep dump/`devData.json` as optional replay. Author-facing only.

**Documentation references**

- Token recipe: `freeplay.js` 2181–2211
- Live pill: `socialPresence.js` 1013–1031, idle in `update` ~967–976
- Overview current copy: `app.js` 623–674
- Cpu init bomb: `cpu.js` 101–108
- CpuProfile init bomb: `cpuprofile.js` 115–122

**Verification**

- [ ] `webViz.html` and `webViz.beta.html` link `/webviz/css/module-kit.css`
- [ ] `rg "cdn|jsdelivr|unpkg|googleapis" resources/webserver/webViz.html` empty
- [ ] Overview has no “replaces the old folder-tab UI”
- [ ] Opening Cpu tab: no `consolevarset` POST until button
- [ ] `git diff` is resources/webserver only

**Anti-pattern guards**

- Do not put kit rules in `shell.css` (chrome vs paper)
- Do not darken `#surface-overview` cards (Overview already uses shell tokens — keep)
- Do not auto-unsubscribe on Overview click
- Do not change enum meanings; value `3` is 1000ms not 3ms

---

## Phase 2 — Status KPI tabs (engine + Alexa)

**What to implement**

Wrap each status tab in `.wv-mod` (header + live + sub + KPI strip + empty). Keep existing `sendData` buttons; restyle as `.wv-mod-btn`. Do not add channels. Do not add payload fields.

| File | Title | Sub (copy) | KPIs from existing keys | Empty |
|---|---|---|---|---|
| `imu.js` | `Fall impacts` | `Count of body-IMU fall impacts this session.` | `fall_impact_count` | `No fall impacts reported yet.` |
| `sleeping.js` | `Sleep` | `Sleep cycle, debt, and the last reasons for sleeping and waking.` | `sleep_debt_hours`, `sleep_cycle`, `reaction_state`, `last_sleep_reason`, `last_wake_reason` | `Waiting for sleep status.` |
| `power.js` | `Power save` | `Whether this process has requested power-save, and who asked.` | `powerSaveEnabled`, `powerSaveRequesters` | `Waiting for power-save status.` |
| `habitat.js` | `Habitat` | `On-charger habitat belief. Force-state buttons write the detector for testing.` | existing habitat fields already rendered | `Waiting for habitat status.` |
| `touch.js` | `Touch` | `Backpack capacitive touch: count, calibration, and enable.` | existing ESN/OS/count/calibrated | `Waiting for touch status.` |
| `heldInPalm.js` | `Held in palm` | `Held-in-palm tracker.` | none on the wire — show one empty KPI `—` | `No held-in-palm fields on this feed.` |
| `alexa.js` | `Alexa` | `Auth and UX state on the animation process.` | existing two lines as KPIs | `Waiting for Alexa status.` |

Sleep defaults: replace `Unknown (sent infrequently)` with `—`. Update a field only when that key arrives (already the pattern).

Power buttons: `Enable power save` / `Disable power save` (title case, no “Power State info”).

HeldInPalm: **do not** invent `isHeldInPalm` in JS. Honest empty until Phase 8.

**Documentation references**

- KPI DOM: `socialPresence.js` 142–179 and 416–506
- Sleep keys: `sleepTracker.cpp` `PopulateWebVizJson` (`sleep_debt_hours`); `behaviorSleepCycle.cpp` ~1277–1292
- Power keys: `powerStateManager.cpp` ~224–233
- HIP empty: `heldInPalm.js` 1–31; `heldInPalmTracker.h` 86

**Verification**

- [ ] Each tab: waiting pill → live on first packet
- [ ] IMU title is not “IMU samples”
- [ ] Power sub does not say battery
- [ ] HeldInPalm shows empty, not a fake trust meter
- [ ] Habitat/touch/power buttons still `sendData` the same payloads

**Anti-pattern guards**

- No `myMethods.channels` combining these into a Body HUD
- No new C++ in this phase
- Do not poll `/consolevarget`

---

## Phase 3 — Features, Cubes, Intents (wires + chrome)

**What to implement**

**Features** (`features.js`):

- Wrap in `.wv-mod`. Title `Feature gates`. Sub: `Build defaults and persistent overrides. Overrides are saved on the robot and survive reboot. Some flags apply only after the next boot. Console-var changes appear here after you refresh.`
- On override change: if selected text is `none`, send `"override": "default"` (C++ `cozmoFeatureGate.cpp` ~312). Keep the dropdown label `none` if that is what the subscribe payload uses.
- If `onData` receives `{error: true}`, toast `Could not apply that override` (`WebVizUI.toast`) and **return** (do not `empty()` the table).
- Reset button stays `{type:"reset"}`.

**Cubes** (`cubes.js`):

- Wrap in `.wv-mod`. Title `Cubes`. Sub: `Connection, coordinator subscriptions, and whether the robot is tracking a cube.`
- Group existing buttons: connection (Flash / Connect / Disconnect / Forget) vs coordinator (Interactable / Background). Same `sendData` keys.
- NO TARGET: `if (citInfo.NoTarget === true \|\| citInfo.noTarget === true)`.
- Relabel internal titles: `Coordinator` (was CubeConnectionCoordinator), `Hold tracking` (was CubeInteractionTracker).

**Intents** (`intents.js`):

- Wrap in `.wv-mod`. Title `Intents`. Sub: `Pending and last-seen intents. Type a name and trigger it for testing.`
- Headings: `Pending / last intent` and `Recent injections` (not “Last-received” / “Resend”).
- App row: hide the empty `<select>` until a real `all-intents` + `intentType: "app"` arrives. Placeholder stays `intent_name [param]`. Trigger still uses `/sendAppMessage`.
- Replace `alert('Format is either…')` with `WebVizUI.toast`.

**Documentation references**

- Features send: `features.js` 101–108; C++ accept list `cozmoFeatureGate.cpp` 307–321; error `334–337`
- Cubes key: `cubeInteractionTracker.cpp` 611–612 vs `cubes.js` 213
- Intents app HTTP: `intents.js` 80–94; handler `webService.cpp` ~1045
- Subscribe lists: `behaviorComponentMessageHandler.cpp` ~425–439 (user + cloud only)

**Verification**

- [ ] Features none → network payload `"override":"default"`
- [ ] Features error object does not wipe the table
- [ ] Cubes shows NO TARGET when C++ sends `NoTarget: true`
- [ ] App intent has no blank dropdown; typed trigger still fires GET
- [ ] No `alert(` in these three files

**Anti-pattern guards**

- Do not add a C++ `all-intents` for app
- Do not invent feature names missing from the enum
- Do not merge CloudIntents into this tab

---

## Phase 4 — Chart tabs (wrap Flot/canvas, fix Mood)

**What to implement**

Wrap existing plots in `.wv-mod` + `.wv-mod-panel`. **Keep** Flot/canvas/DataTables code. Do not change axis domains or sample windows.

| File | Title | Sub |
|---|---|---|
| `mood.js` | `Mood` | `Emotion traces over the last minute, with event markers and set-points.` |
| `cpu.js` | already Phase 1 | keep |
| `cpuprofile.js` | already Phase 1 | keep |
| `beatDetector.js` | `Beat detector` | `Tempo, confidence, and threshold from the beat detector.` |
| `micDataEngine.js` | `Sound reactions` | `Mic direction on the engine process.` |
| `micData.js` | `Mic data` | `Mic direction on the animation process.` |

**Mood wires (must land here):**

1. Fix period HTML (`mood.js` 348–351) — copy this markup:

```html
<div id="periodControl">
  <label for="sendPeriod">Update period (seconds)</label>
  <input type="text" id="sendPeriod" min="0" max="10.0" value="1.0" size="4"/>
</div>
```

Keep the existing `$root.find('#sendPeriod').change` → `POST MoodManager_WebVizPeriod_s`. Do **not** change the default `1.0`. Do **not** POST on init.

2. Legend checkbox: after `legend.show = isChecked`, call `setupGrid()` + `draw()` (copy the `#showEvents` block at 359–370).

3. Labels: `Show events`, `Hide overlapping events`, `Show chart legend`, `Dump raw data` (already fine). Dump status: `Recording… uncheck to download` / `download json` (match SP dump copy).

**Mic notes:** keep the port warning but rewrite as product copy:

- Engine: `This tab is the engine process. Mic direction on the animation process is on :8889.`
- Anim: `This tab is the animation process. Engine sound reactions are on :8888.`

Replace `NOTE: trigger values are for display purposes only (true values live in instance jsons)` with: `Trigger scores here are a preview. Authoritative values live in the recognizer instance JSON.`

**Documentation references**

- Mood period + legend: `mood.js` 348–416
- SP dump copy: `socialPresence.js` toolbar ~161–165
- Mic engine note: `micDataEngine.js` ~215

**Verification**

- [ ] `#sendPeriod` exists in the DOM; changing it POSTs `MoodManager_WebVizPeriod_s`
- [ ] Toggling legend actually hides/shows it
- [ ] No `consolevarset` on mood/mic init
- [ ] Chart still plots (Flot placeholder is host-scoped `#chartContainer`)

**Anti-pattern guards**

- Do not lower mood period default
- Do not add `methods.channels` to pull mood into FreePlay
- Do not swap Flot for a new chart library

---

## Phase 5 — Complex viz (Behaviors, BehaviorConds, NavMap, ObservedObjects, VSM)

**What to implement**

Chrome wrap + copy + the one BehaviorConds reorder. **Do not** rewrite D3 Gantt, p5 map, or the VSM canvas grid.

**Behaviors** (`behaviors.js`):

- Header title `Behaviors`. Sub: `Hover the timeline to see which behaviors were on the stack. Drag the lower strip to zoom (pauses live updates). Use the live-update control to resume.`
- Replace the H4 usage wall (`behaviors.js` ~721) with that sub (do not duplicate as a wall of text).
- CSV: replace `alert(...)` (~91) with toast: `Downloading a CSV of stack membership over time.`
- Keep force-run dropdown + Force checkbox (wired `sendData({behaviorName, presetConditions})`). Restyle as `.wv-mod-btn`. Optional: put them in a `<details>` titled `Force-run` so the Gantt is the first thing — same wires.

**BehaviorConds** (`behaviorConditions.js`):

- Title `Behavior conditions`. Sub: `Step by stack change or by any factor change. Conditions appear when they are evaluated, not every tick.`
- Implement the TODO at 453–455: when recording a stack snapshot, insert it **before** the first history entry with the same `time` whose kind is `c` or `i`. Then drop “continue clicking” from `instructions`.
- Keep arrow controls; restyle. Clear remains client-only.

**NavMap** (`navMap.js`): keep p5 dark island (`webviz/README.md` invariant). Wrap toolbar/copy only. Auto-update / `sendData({update:true})` stays.

**ObservedObjects** (`observedObjects.js`): Title `Observed objects`. Sub: `Faces and objects currently in view.` Keep lists. Do not invent pose HUD.

**VisionScheduleMediator**: Title `Vision schedule`. Sub: `Active vision modes and their update periods.` Replace `Waiting on Data…` with `Waiting for the vision schedule.` Keep the port warning as: `This tab is served by the engine process (:8888).`

**Documentation references**

- Behaviors usage: `behaviors.js` ~721; CSV ~91; force-run ~126–128
- BehaviorConds TODO: `behaviorConditions.js` 15–19, 453–455
- NavMap dark island: `webviz/README.md` Theme invariant
- FreePlay already owns the live-stack question — do not clone Ops into Behaviors

**Verification**

- [ ] No usage-wall H4; no `alert(`
- [ ] Factor-then-stack at the same timestamp: stack appears first in history (unit: inject two fake payloads in console)
- [ ] NavMap canvas still dark and readable under both chrome themes
- [ ] Behaviors force-run still sends `{behaviorName, presetConditions}`

**Anti-pattern guards**

- Do not add `channels` to Behaviors
- Do not “fix” stratify again (already uses `behaviorID+parent`)
- Do not restyle p5 pixels to light paper

---

## Phase 6 — Tables and lists (anim + cloud + remaining)

**What to implement**

| File | Title | Sub | Extra |
|---|---|---|---|
| `animationEngine.js` | `Animation engine` | `One row per animation started by an engine action.` | Fix typo “aniation”; keep DataTables + column toggles |
| `animations.js` | `Animations` | `Clip start and stop on the animation process. For trigger, mood, and head angle, use Animation Engine on the engine process (:8888).` | Delete the “new tab … helpful for developers” H3 |
| `audioEvents.js` | `Audio events` | `Audio events on the animation process.` | Add `hasCallback` column, default hidden, same `colToggles` pattern |
| `speechRecognizerSys.js` | `Speech recognizer` | `Wake-word hits: score, timing, and ignore reasons.` | chrome only |
| `cloud.js` | `Cloud intents` | `Cloud recognizer results as they arrive.` | **Delete nested `<marquee>`.** Static heading. Keep result list + captured-audio links |

**Documentation references**

- Animations bad copy: `animations.js` L34
- AnimationEngine typo: `animationEngine.js` L118
- Cloud marquee: `cloud.js` L37–39
- `hasCallback`: `cozmoAudioController.cpp` ~594, 621

**Verification**

- [ ] `rg marquee resources/webserver/webVizModules` empty
- [ ] `rg aniation` empty
- [ ] `rg "helpful for developers" webVizModules` empty
- [ ] audioEvents column toggle list includes `hasCallback` (hidden by default)
- [ ] Cloud results still append; list cap 200 stays

**Anti-pattern guards**

- Do not add a dual-process tape (would need two WS feeds)
- Do not load jquery-ui (not in `webViz.html`)

---

## Phase 7 — Social Presence cleanup + copy sweep + verification

**What to implement**

1. `socialPresence.js`: delete `TEST_EVENT_NAMES` and every branch that hides those names. Do **not** add inject buttons for leak-test events. Leave RSPI/Quiet/Face defaults, receptive chip, 60 s window.

2. Repo-wide string sweep under `resources/webserver/webVizModules/` + `webviz/js/app.js` + `config.js`:

```
rg -n "when this|coming soon|helpful for developers|folder-tab|TODO use|continue clicking|sent infrequently|Power State info|IMU samples|aniation|<marquee>|USING FAKE DATA|webViz.legacy" resources/webserver/webVizModules resources/webserver/webviz/js
```

Every hit must be gone or justified in the phase notes (code comments may keep `TODO` if they are engineer-only, not innerHTML).

3. Confirm FreePlay / Social Presence still load (do not regress `fp-*` / `sp-*`).

4. `resources/webserver/webviz/README.md`: add one line that stock tabs now use `.wv-mod` kit; hosts stay light paper.

**Verification (final)**

- [ ] S1–S9 from the top of this plan
- [ ] Theme toggle: chrome flips; module paper stays readable (spot-check Behaviors, Mood, Mic, NavMap, Cpu, Features)
- [ ] Overview-only: no module subscribe in WS frames
- [ ] Opening Mood does not POST period until the user changes it
- [ ] Opening Cpu does not POST `WebvizUpdatePeriod` until Start
- [ ] No new files under `vendor/`; no CDN
- [ ] `git diff --name-only` ⊆ `resources/webserver/` (unless Phase 8)

**Anti-pattern guards**

- Do not “token-clean” all SP hex in this phase (chart identity colors stay)
- Do not add a veto Flot marking if `chartOptions.grid.markings` is still unused — that is SP SoT, not this glow-up

---

## Phase 8 — Optional C++ (skip unless asked)

**Not in the default `/do`.** Needs engine rebuild + flash. Robot CPU: HIP already constructs a sender every 60 s when subscribed (`heldInPalmTracker.cpp` ~132–141, `kTrackerWebVizUpdatePeriod_s` default 60). Filling existing getters does **not** raise the rate.

**What to implement if asked**

`HeldInPalmTracker::PopulateWebVizJson` is currently `{}` (`heldInPalmTracker.h:86`). Fill **only** existing public state:

```cpp
void HeldInPalmTracker::PopulateWebVizJson(Json::Value& data) const
{
  data["isHeldInPalm"] = _isHeldInPalm;
  data["heldDuration_ms"] = GetHeldInPalmDuration_ms();
  data["timeSinceLastHeldInPalm_ms"] = GetTimeSinceLastHeldInPalm_ms();
}
```

Then `heldInPalm.js` KPIs: `Held`, `Duration`, `Since last`. Still no “trust” field (it does not exist).

**Do not** add app `all-intents` here (separate C++, out of this plan).

**Verification**

- [ ] Subscribed tab shows booleans/ms matching palm pickup
- [ ] Unsubscribed: `CreateWebVizSender` still null — no extra JSON
- [ ] Period still 60 s

---

## Suggested `/do` order

1. Phase 1 (kit + Overview + CPU-safety)  
2. Phase 2 (status KPIs)  
3. Phase 3 (Features / Cubes / Intents wires)  
4. Phase 4 (charts + Mood)  
5. Phase 5 (complex viz)  
6. Phase 6 (tables / cloud)  
7. Phase 7 (sweep + verify)  
8. Phase 8 only if the user asks for an engine flash

Each phase is one chat context. scp after Phase 1 so Overview/Cpu can be smoked on-robot before the rest.

---

## Manual on-robot smoke (after scp, no vbuild)

Engine `:8888/webViz.html` and Anim `:8889/webViz.html`:

1. Overview copy reads as product, not a changelog. WS: no module subscribe until a tab is opened.
2. Cpu: empty until Start; then ~1 Hz `cpu` packets. Stop returns to Off.
3. Mood: legend checkbox redraws; period field exists; no POST on open.
4. Features: set override to none → robot gets `default`.
5. Cubes: no-target cube → “NO TARGET”.
6. Cloud: no marquee.
7. Animations on :8889: points at Animation Engine on :8888 without “helpful for developers”.
8. Theme toggle: paper stays light; NavMap stays dark.
9. FreePlay and Social Presence unchanged in behavior (spot-check stack + RSPI chart).
)
