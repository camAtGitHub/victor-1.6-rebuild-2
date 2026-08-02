# FreePlay WebViz module — design

**Path:** `docs/mapping/WEBVIZ-FREEPLAY-DESIGN.md`  
**Status:** implemented · **Date:** 2026-08-02  
**Phase note:** Implemented (shell multi-channel + `freeplay.js` v1). Ops UX uplift P1–P6 shipped in the same module (see `WEBVIZ-FREEPLAY-UX-PLAN.md`). No firmware C++.  
**Related:** `docs/mapping/WEBVIZ-BEHAVIORS-REVIEW.md`, `docs/mapping/WEBVIZ-FREEPLAY-PLAN.md`, `docs/mapping/WEBVIZ-FREEPLAY-UX-PLAN.md`, `resources/webserver/AGENTS.md`, `resources/webserver/webviz/README.md`

---

## 1. Goal

Add a **new** WebViz surface, **FreePlay**, that answers freeplay’s primary debug question:

> What is on the behavior stack **right now**, what **changed**, and **why** (activation gates)?

Constraints:

- **No C++ recompile** — pure assets under `resources/webserver/`.
- **Stock tabs untouched** — Behaviors (`behaviors.js`) and BehaviorConds (`behaviorConditions.js`) remain as power tools.
- **Theme-safe** — only `--wv-*` tokens; **do not darken `.module-host`**. Shell dark/light is already owned by `WebVizTheme` + footer `#btnThemeToggle` (see `AGENTS.md` §3 Color scheme, `webviz/README.md` Theme).
- Deploy: **scp + hard-refresh** (and shell JS load); no new HTTP endpoints.

Out of scope for v1: path planner, action queue, camera, IMU richness, mood/intents panels, engine protocol changes (ordered envelopes, condition snapshots). Those remain **no visualisation possible without further c++ compilation** (or later optional FreePlay channels).

---

## 2. Naming & registry

| Item | Value |
|---|---|
| Display name | **FreePlay** |
| Shell / surface key | `freeplay` (lowercased registry key) |
| Module file | `resources/webserver/webVizModules/freeplay.js` |
| Process | Engine only (`:8888`) |
| Nav group | Behavior & AI — **first** entry (above Behaviors) |
| Description | Live freeplay stack, transition log, and activation gates |
| Stock modules | Unchanged |

**Important:** C++ never calls `SendToWebViz("freeplay")`. Live data is fan-in from existing channels only.

---

## 3. Architecture

### 3.1 Data sources (existing producers)

| Channel (wire) | Engine producers (confirmed) | FreePlay use |
|---|---|---|
| `behaviors` | `StackVizMonitor`, `BehaviorComponentMessageHandler`, `ICozmoBehavior` debug state, `ActiveFeatureComponent` | Live stack, tree edges, time, activeFeature, debugState |
| `behaviorconds` | Same stack blob + `IBEICondition` factor / inactive messages | Gates for selected stack frame |

Typical stack payload (from mapping review):

```json
{
  "time": 12.401,
  "tree": [ { "behaviorID": "...", "parent": "..." } ],
  "stack": [ "root", "...", "leaf" ]
}
```

Other messages on the same channel may carry `activeFeature`, `debugState`, or behavior-ID lists (force-run dropdown for **stock** Behaviors only).

### 3.2 Multi-subscribe shell (thin, pure JS)

Stock contract remains:

```js
(function (myMethods, sendData) {
  myMethods.init = function (elem) {};
  myMethods.onData = function (data, elem) {};
  myMethods.update = function (dt, elem) {};
  myMethods.getStyles = function () { return ""; };
})(moduleMethods, moduleSendDataFunc);
```

FreePlay extends with **optional** multi-channel hooks (stock modules ignore these):

```js
myMethods.channels = ["behaviors", "behaviorconds"];
myMethods.onChannelData = function (channel, data, elem) { /* ... */ };
// No hostTheme / module-host--ops — host stays stock light .module-host
```

Shell responsibilities (`webviz/js/app.js`, `socket.js`, `config.js`, `shell-ui.js`):

1. **Registry** — add FreePlay to `MODULES_ENGINE`, `GROUPS_ENGINE` (AI group first), `DESCRIPTIONS`.
2. **On FreePlay mount / select** — for each name in `myMethods.channels`, call existing subscribe with **refcount** (increment). Do **not** require stock tabs to be open.
3. **On WS message** — deliver to every surface that claims that channel:
   - Stock: `onData(data, elem)` if `subscribed[key]` for that module key.
   - FreePlay: `onChannelData(channel, data, elem)` (or `onData(data, elem, channel)` fallback).
4. **On FreePlay leave / unsubscribe** — decrement channel refcounts; only send wire `unsubscribe` when count hits 0 (so Behaviors still open keeps the stream).
5. **Reconnect** — existing socket resubscribe of wanted modules; channel refcounts re-applied for multi-channel surfaces.
6. **Theme** — FreePlay does **not** call `WebVizTheme`; shell chrome already toggles via footer.

Optional console helpers (debug): document that FreePlay channels are managed by the shell; no need for users to manually `WebViz.subscribe('behaviors')`.

### 3.3 Client-side state model

| State | Source | Cap / policy |
|---|---|---|
| `liveStack` | last `behaviors` message with `stack` | Replace on each |
| `liveTree` | same message `tree` | Replace on each |
| `bsTime` | `time` field | Replace |
| `activeFeature`, `debugState` | side messages on `behaviors` | Replace |
| `transitionLog` | client: push when `stack` identity changes | Ring buffer **200** |
| `gatesByParent` | `behaviorconds` factor stream | Bounded map; drop stale by policy |
| `selectedLogIndex` | UI | Default: latest (live) |

Stack identity for “changed”: join `stack` array with a stable delimiter (e.g. `\0`). Empty stack: clear live view; log optional “cleared” entry; **do not** leave stale SVG/DOM (lesson from stock Behaviors).

**Honest limitation (v1):** condition messages are not guaranteed ordered with stack snapshots (P2 in review requires C++). UI labels gates as “latest factors for this behavior id” not “exact factors at transition T” unless a transition log entry stored a coincidental snapshot.

### 3.4 sendData / force controls

v1 **Dev tools (collapsed):**

- Link text: “Open stock Behaviors / BehaviorConds for force-run and inject.”
- Optional later: re-send known Behaviors JSON shapes via `sendData` on channel `behaviors` (engine handler already listens on that module name). Prefer **not** implementing force-run in FreePlay v1 to avoid footguns and keep scope small.
- Raw JSON dump of last `behaviors` / `behaviorconds` payloads (dev only, scrollable mono).

---

## 4. Visual theme (shell dark/light already shipped)

**Source of truth:** `resources/webserver/webviz/css/tokens.css` (`--wv-*`).  
**Product rules:** `resources/webserver/AGENTS.md` §3 (Color scheme + WebViz content exception).  
**Shell theme:** `webviz/js/theme.js` (`WebVizTheme`) + footer `#btnThemeToggle`; preference `localStorage` `webviz.colorScheme` ∈ `system`|`dark`|`light`; DOM `html[data-theme="dark"|"light"]` + `wv-theme-*`.  
**Token sync:** palette changes update **both** `webviz/css/tokens.css` and `cv-tokens.css` (not FreePlay’s job unless FreePlay introduces no new tokens — it must not).

### 4.1 Invariant — chrome vs module hosts

| Layer | Tokens | Who owns theme |
|---|---|---|
| Shell chrome (nav, header, footer, overview) | `--wv-bg`, `--wv-text`, panels… | `WebVizTheme` + tokens light block |
| **`.module-host` (all modules including FreePlay)** | **`--wv-content-*` paper** | **Always light content well** under either chrome theme |

**Do not** add `module-host--ops`, darken `.module-host`, or depend on `WebVizTheme` inside FreePlay (`webviz/README.md` Theme).

### 4.2 Rules for FreePlay (content host)

1. **No hard-coded hex** for UI chrome/text/borders/status.
2. **Body text / host-relative UI** use **content** tokens so dark chrome does not paint light text on the light host:
   - Text: `--wv-content-text` (primary on host)
   - Lines on paper: `--wv-content-line`
   - Host bg is already `--wv-content-bg` via shell
3. **Status / accent** (readable on light paper): `--wv-good`, `--wv-warn`, `--wv-bad`, `--wv-accent` (+ `*-dim`, `*-border` as needed).
4. **Nested panels** on the light host — prefer elevated paper, not shell dark panels under dark chrome:
   - Prefer white / slight lift: e.g. `background: var(--wv-content-bg)` with border `var(--wv-content-line)`, or under light chrome `var(--wv-bg-elev)` only if contrast is verified on **both** chrome themes while host stays light.
   - Safer v1 recipe: panel `background: #fff` is forbidden as hex — use `var(--wv-content-bg)` and a second surface via `box-shadow: var(--wv-shadow-sm)` + border `var(--wv-content-line)`; selected row `background: var(--wv-accent-dim)`.
5. **Do not use shell `--wv-text` / `--wv-bg` for FreePlay body** under dark chrome (those are light-on-dark chrome colors → unreadable on light host).
6. Type: `--wv-sans` / `--wv-mono`; ~13px; dense; pills/badges.
7. Geometry: `--wv-radius*`, `--wv-space-*`.
8. FreePlay **must not** call `WebVizTheme.*`; toggle is shell-only.

### 4.3 Theme ownership (already done — FreePlay does not reimplement)

| Piece | Status |
|---|---|
| Dark/light chrome tokens | Shipped in `tokens.css` + `cv-tokens.css` |
| Footer toggle | `#btnThemeToggle` → `WebVizTheme.toggle()` |
| FOUC | Inline in `webViz.html` / `webViz.beta.html` |
| FreePlay | Token-only styles on **light** host; works under both chrome themes |

---

## 5. UI layout

**Shipped layout:** Ops-style 3-region console inside light `.module-host` (content tokens only — §4 theme rules unchanged). Reference mock: root `webviz-ux-demo.html` Ops view; production: `webVizModules/freeplay.js`.

```
┌─ Header ──────────────────────────────────────────────────────────┐
│ ActiveFeature · leaf · BS time · pills [behaviors][conds] · Live   │
├─ (optional silence banner if both channels stale >5s) ────────────┤
├─ .fp-workspace (fill host; panel bodies scroll) ──────────────────┤
│ ┌─ Stack (narrow) ──────┬─ Transition log (wide) ───────────────┐ │
│ │ indent L0…Ln          │ n/200 · filter · Clear log            │ │
│ │ leaf [leaf badge]     │ time → to                              │ │
│ │ click → pin gates     │   from …  · client tags (clear/enter/…)│ │
│ │                       │ newest first · flash · pin-to-top     │ │
│ │                       │ click row → scrub stack + owner       │ │
│ └───────────────────────┴───────────────────────────────────────┘ │
│ ┌─ Gates (full width) ──────────────────────────────────────────┐ │
│ │ Focus: {owner} · latest factors — not time-aligned to log row │ │
│ │ filter · false-first: unmet open / met collapsed · T/F/inact. │ │
│ └───────────────────────────────────────────────────────────────┘ │
├─ Timeline (secondary, collapsed <details>): canvas bars · click scrub
├─ Dev tools (collapsed): keys hint · stock tab links · Copy log JSON · raw
└───────────────────────────────────────────────────────────────────┘
```

### 5.1 Behaviors

- **Stack column:** depth-indented breadcrumb root→leaf; leaf badge (`--wv-accent`); click non-leaf pins gates owner while live; leaf (re)click clears pin → follow live leaf.
- **Transition log:** time + **from → to** leaves; ring **200**; empty-stack events (`clear`); **client-derived tags only** (`enter` / `deeper` / `shallower` / `swap` / `clear`) — **not** engine condition `[T]`/`[F]`. Flash newest; pin scroll to newest while near top.
- **Gates:** conditions for selected behavior id from **latest** `behaviorconds` factors for that owner. Status sort false-first (FALSE → unknown → inactive → TRUE); inactive wins over stale T/F. Collapsible cards: default open unmet/unknown/inactive, closed met. Toolbar always states honesty string above.
- **Honesty (do not reword away):**
  - Gates = **latest factors for owner** — **not** frozen factors at the scrubbed log-row time (wire has no stack↔cond envelope).
  - Log tags = **client-derived** from stack depth/leaf identity change only.
- **No D3 Gantt as primary** — stock stratify path avoided. History is the log; optional **secondary** canvas Timeline (P6) under Ops, collapsed by default, click band → scrub.
- **Live vs scrub:** selecting a log row (or timeline band) freezes view stack + owner; **Live** / `L` / `Esc` returns to tail. Does not unsubscribe.
- **Filters / keyboard (P5):** client-only log and gates search; keys on focused `.fp-root` (L/Esc Live, j/k log, `/` log filter). Clear log and Copy log JSON are client-only.

### 5.2 Accessibility / density

- Interactive rows are `<button>`; Live `aria-pressed`; stack/log `aria-selected`.
- `prefers-reduced-motion` softens log flash.
- High information density; avoid marquee/toy chrome (contrast CloudIntents stock).

---

## 6. Error handling & lifecycle

| Case | Behavior |
|---|---|
| Malformed JSON / non-object | Ignore message; optional one toast via shell if throw escapes |
| Throws in FreePlay handlers | Shell `reportModuleError` → toast + nav error mark (existing); never `alert` |
| Channel silent | Stream pills dim after N seconds without message while subscribed |
| Empty stack | Clear stack panel; show “No running behavior”; clear gates or mark N/A |
| Reconnect | Socket resubscribes; FreePlay re-applies channel wants; may miss transitions during gap (acceptable v1) |
| Module load failure | Shell toast; FreePlay absent from nav if load fails (existing loader) |
| Stock Behaviors open + FreePlay | Both receive `behaviors` data; independent DOM |

---

## 7. Files to touch (implementation)

| File | Change |
|---|---|
| `webVizModules/freeplay.js` | **New** module |
| `webviz/js/config.js` | Register FreePlay, group order, description |
| `webviz/js/app.js` | Multi-channel subscribe, refcount, deliver |
| `webviz/js/shell-ui.js` | No hostTheme / no darkening module-host |
| `webviz/css/shell.css` | **No** `.module-host--ops` (do not darken hosts) |
| `webviz/js/theme.js` | **No FreePlay changes** (shell theme already shipped) |
| Stock `behaviors.js` / `behaviorConditions.js` | **No changes** |
| C++ / CLAD | **No changes** |

Deploy: scp webserver resources → hard-refresh browser. Restart eng/anim **not** required for pure JS/CSS (templates not involved).

---

## 8. Testing / acceptance

1. Open FreePlay only → network/WS shows subscribe to `behaviors` and `behaviorconds`; stack updates in freeplay.
2. Open stock Behaviors + FreePlay → both update; leave FreePlay → Behaviors still receives data.
3. Leave FreePlay with stock closed → unsubscribes both channels (refcount 0).
4. Empty stack clears UI (no stale rows).
5. No `alert()`; errors surface as shell toasts.
6. FreePlay styles: only `--wv-*`; no hex; body text uses `--wv-content-text` (readable under dark **and** light chrome). Host remains stock light `.module-host` (no dark host class). Footer theme toggle still only affects chrome.
7. Optional: serve shell from laptop + `WebViz.connect(robot)` remote feed works (existing shell).
8. `?tab=freeplay` auto-opens FreePlay after connect (existing autoTab).

Offline/dev: `devShouldDumpData` + `devData.json` path remains available for multi-channel if dump keys match channel names (document if extended).

---

## 9. Catalog context (A) — what FreePlay is *not*

Already covered by stock modules or Tier 2 HTTP; not FreePlay v1: mood, cubes body HUD, static JSON behavior-tree browser, console-var board, anim process streams.

**Needs further C++ compilation for live viz:** path planner, action queue, camera, full IMU, syscon, DAS, backpack lights, switchboard, new WebViz producers.

---

## 10. Decision log

| Decision | Choice |
|---|---|
| Approach | New module + multi-subscribe; stock tabs stay |
| Name | **FreePlay** (not BehaviorV2) |
| Theme | Token-only on **light** `.module-host`; shell dark/light via `WebVizTheme` (already shipped); no `module-host--ops` |
| Doc location | `docs/mapping/` (this file) |
| Force-run in v1 | No — link to stock Behaviors |
| History | Client transition ring 200; no D3 Gantt primary; optional secondary canvas timeline (P6) |

---

## 11. Open questions (non-blocking for v1)

- [UNKNOWN] Live condition message rate on rebuild freeplay (tune gate UI throttling if needed).
- [INFERRED] Refcount multi-subscribe is the cleanest shell extension; alternative is FreePlay opening a second WebSocket (rejected — wasteful, breaks single reconnect model).
- Whether `hostTheme` lives on `myMethods` vs config map only — implementer’s call if both stay in sync.

---

## 12. Implementation status

- **v1:** shell multi-subscribe + `freeplay.js` (stack / log / gates; content tokens; no `module-host--ops`). Plan: `WEBVIZ-FREEPLAY-PLAN.md` (S1–S9).
- **UX uplift:** Ops grid + polish P1–P6 in `freeplay.js`. Plan: `WEBVIZ-FREEPLAY-UX-PLAN.md` (U1–U11). No C++.
