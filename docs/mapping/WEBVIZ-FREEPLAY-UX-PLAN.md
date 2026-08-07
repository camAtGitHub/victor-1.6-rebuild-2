# FreePlay UX uplift plan (Ops-console)

**Status:** implemented (P1–P6 done; P7 docs closeout)  
**Date:** 2026-08-02  
**Goal:** Make `resources/webserver/webVizModules/freeplay.js` match the **Ops** visualizer quality in `webviz-ux-demo.html`, keep wire/theme contracts intact, and include honest nice-to-haves beyond the demo.  
**Primary reference UI:** Ops view in `webviz-ux-demo.html` (not Timeline).  
**Primary code target:** `freeplay.js` only unless a phase proves a shell gap.  
**Related docs:** `WEBVIZ-FREEPLAY-DESIGN.md`, `WEBVIZ-FREEPLAY-PLAN.md` (v1 shipped), `WEBVIZ-BEHAVIORS-REVIEW.md`.  
**Production module:** `resources/webserver/webVizModules/freeplay.js` (demo HTML is reference only).

---

## Progress (closeout)

| Phase | Status | Notes |
|---|---|---|
| P0 discovery | ✅ done | Allowed APIs, gap matrix, anti-patterns |
| P1 Ops layout grid | ✅ done | `.fp-root` / `.fp-workspace` / `.fp-ops-top` stack\|log + gates; panel-body scroll; no drag-split (fixed fractions) |
| P2 Stack polish | ✅ done | Was depth indent; **2026-08-05:** flat depth# + rail (no indent), leaf badge, pin non-leaf / leaf clears pin |
| P3 Log polish | ✅ done | from→to, client tags (clear/enter/deeper/shallower/swap), flash, pin-to-newest, `n/200` |
| P4 Gates polish | ✅ done | False-first collapse; focus meta honesty; `openGates` by owner+label |
| P5 Nice-to-haves | ✅ done | Keyboard (L/Esc, j/k, `/`), log+gates filter, Clear log, silence banner, Copy log JSON, reduced-motion |
| P6 Timeline secondary | ✅ done | Collapsed `<details>`; canvas bars; click scrub; dirty on log head only |
| P7 Verify + docs | ✅ done | This plan + design §5 + `AGENTS.md` §6/§7; optional demo pointer comment |

**Honesty (shipped):** gates = **latest factors for owner** (not time-aligned to scrubbed log row). Log tags = **client-derived** from stack depth/leaf only — never engine `[T]`/`[F]`.

---

## Phase 0 — Documentation discovery (done)

### Sources consulted

| Source | What was extracted |
|---|---|
| `webviz-ux-demo.html` (full) | Ops 3-region grid, stack/log/gates CSS+JS, Timeline secondary, tokens, mock data |
| `webVizModules/freeplay.js` (full) | Multi-channel module, DOM, dirty render, styles, caps |
| `webVizModules/module.js.template` | Required `init` / `onData` / `update` / `getStyles` |
| `webviz/js/app.js`, `socket.js`, `config.js`, `theme.js` | Multi-channel retain/release, registry, theme API |
| `webviz/css/tokens.css`, `shell.css` | Content tokens; `.module-host` light paper + `overflow: auto` |
| `docs/mapping/WEBVIZ-FREEPLAY-DESIGN.md` + `PLAN.md` | v1 goals, deferred items, anti-patterns |
| `docs/mapping/WEBVIZ-BEHAVIORS-REVIEW.md` | Real wire shapes vs stock pain |
| `resources/webserver/AGENTS.md`, `webviz/README.md` | Product: no darken hosts; scp-only |

### Verdict: which visualizer to copy

| Visualizer | Role | Decision |
|---|---|---|
| **Ops** (`#view-ops`) | Stack \| Log on top; Gates full width under; resizable split; dense panels | **Primary target for FreePlay** |
| **Timeline** (`#view-timeline`) | Passive canvas Gantt of last 40 log rows | **Optional Phase-N only** (design v1 explicitly rejected D3 Gantt; canvas bars may return later) |

### Gap matrix (demo Ops → freeplay.js today)

| Capability | Demo Ops | freeplay.js now | Plan action |
|---|---|---|---|
| Viewport-locked 3-panel grid | Yes (`#view-ops` grid + panel scroll only) | Document flow; flex-wrap stack/log; fixed max-heights | **P1** fill host height, internal scroll |
| Narrow stack + wide log | `minmax(180px,240px) 1fr` | Equal flex wrap | **P1** |
| Resizable top/bottom | `#splitHandle` | None | **P1** optional; fixed fractions first |
| Stack indent + leaf badge | Connectors, leaf purple, role subline | Flat names + `◀` | **P2** |
| Log from→to + flash + pin scroll | Yes | leaf + `n=depth` only | **P3** |
| Gate collapse + false-first | Expandable; auto-open false | Always expanded flat cards | **P4** |
| Focus toolbar | “Focus: leaf” | Title meta only | **P4** |
| Dark hex ops palette | Full dark shell | Forbidden on module host | **Never** — content tokens only |
| Mood / nested compound gates | Mock catalog | No wire support | **Never invent** |
| Timeline secondary | Demo has it | Out of v1 design | **Nice-to-have P6** |
| Keyboard nav | Escape only | Click-only | **Nice-to-have P5** |
| Search/filter | None in demo | None | **Nice-to-have P5** (improve on demo) |
| Dual stream stale pills | Weak in demo | Strong in freeplay | **Keep** |
| Dirty partial render | Full re-render every tick | Dirty headers/stack/log/gates | **Keep / extend** |
| Historical gates at log T | Demo fakes it | Honest “latest factors” | **Keep honesty** |

### Allowed APIs (do not invent)

**Module IIFE (required by `loader.js`):**

```js
myMethods.init(elem)
myMethods.onData(data, elem[, channel])
myMethods.update(dt, elem)
myMethods.getStyles()  // string of CSS
```

**Multi-channel (FreePlay already uses; shell-honored):**

```js
myMethods.channels = ["behaviors", "behaviorconds"]
myMethods.onChannelData(channel, data, elem)
myMethods.resetSession(elem)  // optional; already present
```

**Shell / wire (do not call retain/release from module):**

| API | Owner | Notes |
|---|---|---|
| `wireRetain` / `wireRelease` | `app.js` | Shell only |
| `socket.subscribe` / `sendData` | `socket.js` | FreePlay stays **read-only** (no force-run) |
| `WebViz.subscribe("behaviors"\|"behaviorconds")` | console / Dev links | Open stock tabs only |
| `WebVizTheme.*` | shell only | FreePlay **must not** call |

**Wire channels (existing producers only):**

| Channel | FreePlay fields |
|---|---|
| `behaviors` | `stack`, `time`, `activeFeature`, `debugState`; ignore force-run **arrays** |
| `behaviorconds` | `factors` (`ownerDebugLabel`, `conditionLabel`, `areConditionsMet`, …); `inactive`+`owner`; **ignore** stack/tree on this channel |

**Theme tokens FreePlay may use** (`tokens.css` + design §4.2):

- Content: `--wv-content-text`, `--wv-content-bg`, `--wv-content-line`
- Semantic: `--wv-accent`, `--wv-accent-dim`, `--wv-good`, `--wv-bad`, `--wv-warn` (+ dim/border variants if present)
- Type/space: `--wv-sans`, `--wv-mono`, `--wv-space-*`, `--wv-radius*`, `--wv-shadow-sm`
- Dim text: **opacity on content text**, not bare `--wv-text` / `--wv-bg` under dark chrome

**Host reality:** `.module-host` is `flex:1; min-height:0; overflow:auto` with 15px padding (`shell.css` ~532–543). Ops “viewport lock” is **inside** FreePlay’s root: fill host, scroll only panel bodies — not change shell chrome.

### Anti-patterns (global for every phase)

1. Do **not** invent `SendToWebViz("freeplay")` or new C++ producers.
2. Do **not** edit `behaviors.js` / `behaviorConditions.js`.
3. Do **not** darken `.module-host`, add `module-host--ops`, or hard-code dark hex chrome.
4. Do **not** use `--wv-text` / `--wv-bg` for FreePlay body text.
5. Do **not** claim historical gates at log-row T (wire has no envelope) — label remains “latest factors for owner”.
6. Do **not** invent mood, nested compound gate trees, or log tags that require data the client does not have (client-derived tags only — see P3).
7. Do **not** double-process stack from `behaviorconds`.
8. Do **not** `alert()`; do not force-run in FreePlay.
9. Do **not** add D3 / stratify Gantt as primary (stock crash path; design rejected).
10. Keep caps: log ring 200, owners 100, gates display 50, etc. (tune only with comment + reason).
11. Prefer **`freeplay.js` only**; shell CSS changes need explicit phase + justification.
12. Keep dirty partial render; do not full-rebuild every cond tick.

### Product principles for this uplift

1. **Ops layout first** — density and panel scroll beat decorative chrome.
2. **Honesty over theater** — demo features without wire support stay out or are labeled client-derived.
3. **Improve on the demo** where freeplay already wins (stale pills, dirty render, a11y buttons) and where demo is weak (filter, keyboard, honest tags).
4. **scp-only deploy** under `resources/webserver/`.

---

## Phase 1 — Ops layout grid (structure)

### What to implement

Rebuild FreePlay DOM/CSS so the module body is an **Ops-style 3-region console** inside `#tab-freeplay` / `.module-host`, copying structure from demo Ops — not the dark palette.

**Copy layout patterns from:**

| Pattern | Demo source | FreePlay target |
|---|---|---|
| Ops grid rows | `webviz-ux-demo.html` `#view-ops` L259–280 | `.fp-root` → header + workspace grid |
| Stack \| Log columns | `.ops-top` L268–274 | `.fp-ops-top` narrow stack / wide log |
| Gates full width | `.ops-bottom` L275–280 | `.fp-ops-bottom` |
| Panel: fixed head, scrolling body | `.panel` / `.panel-body` L292–336 | `.fp-panel` + `.fp-panel-body` |
| Split handle (optional) | `#splitHandle` + JS L1621–1654 | `.fp-split` + pointer handlers **or** fixed `~45% / ~55%` first |

**Concrete tasks:**

1. Change `buildDom` (`freeplay.js` ~331–431) so structure is:
   ```
   .fp-root
     header.fp-header          (existing pills / Live / feature)
     .fp-workspace             (flex/grid fill remaining height)
       .fp-ops-top
         section.fp-panel.fp-stack  (title + .fp-panel-body scroll)
         section.fp-panel.fp-log
       [.fp-split]             (optional)
       section.fp-panel.fp-gates
     details.fp-dev            (collapsed; does not steal ops height when closed)
   ```
2. Styles in `getStyles` (~889+):
   - `.fp-root { height: 100%; min-height: 0; display:flex; flex-direction:column; overflow:hidden; box-sizing:border-box; }`
   - Compensate host padding if needed: root uses full host content box; panels use `min-height:0`.
   - Remove flex-wrap equal columns; use demo-like fixed stack width (`minmax(160px, 220px)`).
   - Replace hard `max-height: 280px/320px` on lists with **flex:1; overflow:auto** on panel bodies.
3. **Host height caveat:** `.module-host` scrolls if content overflows. For fill-to-host to work, FreePlay root must be `height:100%` **and** the surface flex chain must give the host a bounded height (already `flex:1; min-height:0` on surface). If 100% fails in browser, use `min-height: calc(100vh - <chrome estimate>)` only as last resort with a comment — prefer `height:100%` on `.fp-root` after verifying surface CSS.
4. Keep Dev tools **below** workspace (or overlay later); when collapsed it must not reserve large space.
5. Optional in this phase: drag split like demo; if deferred, fixed fractions are enough for P1 pass.

### Documentation references

- Demo Ops HTML: `webviz-ux-demo.html` ~L821–862  
- Demo Ops CSS: ~L259–336, custom-split ~L780–782  
- Design wireframe: `WEBVIZ-FREEPLAY-DESIGN.md` §5  
- Host contract: `shell.css` `.module-host` ~532–543  
- Content token recipe: design §4.2; plan styles table in `WEBVIZ-FREEPLAY-PLAN.md`

### Verification checklist

- [ ] FreePlay open: stack left, log right, gates bottom — no vertical page of three equal blocks on desktop width ≥900px.
- [ ] Only panel bodies scroll; header stays visible while log scrolls long history.
- [ ] Under dark **and** light chrome: body text readable (content tokens).
- [ ] Empty stack still shows empty states in each panel.
- [ ] `grep` freeplay styles: no new hex colors; no `--wv-text` / `--wv-bg` for body.
- [ ] Multi-channel still works: subscribe FreePlay → behaviors + conds pills go fresh.
- [ ] Stock Behaviors / BehaviorConds untouched (`git diff` only freeplay + maybe docs).

### Anti-pattern guards

- Do not change `shell.css` unless height 100% is impossible after measuring surface flex (justify in notes first).
- Do not port demo dark `--bg` / `--text` tokens.
- Do not remove stream pills or Live button.

---

## Phase 2 — Stack panel polish

### What to implement

Upgrade stack rendering to demo-quality hierarchy **without** inventing role labels the wire lacks.

**Copy from demo:**

| Feature | Demo | FreePlay adaptation |
|---|---|---|
| Nesting without indent | Demo indents + connectors | **Shipped (post-P2):** flat rows; fixed depth index + short depth rail; full-width mono names (indent ate deep IDs in narrow panel) |
| Leaf treatment | `.stack-item.leaf` + badge | Keep accent leaf; replace `◀` with small “leaf” badge using `--wv-accent` / optional soft tint via `accent-dim` |
| Selected frame | `.selected` | Keep `fp-stack-selected` + pin semantics (`ownerPinned`) |
| Role subline | Demo invents roles | **Only if** you can derive something real (e.g. depth index `L0…Ln`, or parent name from previous stack entry). Do **not** invent “HighLevelAI role” fiction |

**Concrete tasks:**

1. `renderStack` (~457–521): build structure  
   `button.fp-stack-item` → indent gutter + `.fp-stack-main` (name) + optional `.fp-stack-meta` (depth) + leaf badge.
2. Visual tree connectors optional (CSS borders on gutter) — copy demo connector idea with content-line color.
3. Click leaf while selected: optional clear pin / re-default to leaf (demo clears on leaf re-click) — match demo if low risk.
4. Stack panel body scrolls when freeplay spine is long (Init…→…→leaf).
5. Keep `data-owner` and pin-while-live behavior.

### Documentation references

- Demo stack CSS/JS: `webviz-ux-demo.html` L349–421, L1259–1297  
- FreePlay pin logic: `freeplay.js` stack click ~505–515; `ownerPinned` state ~21–43  
- Design §5.1 stack column

### Verification checklist

- [ ] Deep stacks (≥6 frames) show clear hierarchy; leaf visually strongest.
- [ ] Click non-leaf pins gates owner; later stack ticks do not reset pin while live.
- [ ] Click Live clears pin and returns gates to live leaf.
- [ ] Keyboard focus outline still present on stack buttons.
- [ ] No role strings that are not derived from stack data.

### Anti-pattern guards

- No mock `BEHAVIORS` catalog roles.
- No purple hex leaf color — use `--wv-accent` / opacity.

---

## Phase 3 — Transition log polish

### What to implement

Make the log a **transition narrative** like demo Ops, using only data FreePlay already stores or can derive client-side.

**Copy from demo:**

| Feature | Demo | FreePlay adaptation |
|---|---|---|
| from → to leaf | `log-from` / `log-to` L423–482, L1299–1358 | Store `prevLeaf`/`fromLeaf` on push; show `from → to` |
| Time column | mono time | Keep `formatTime` |
| Flash newest | `.flash` animation | Brief class on newest row after push; CSS animation with accent-dim |
| Pin scroll to newest | `pinLogScroll` if near top | On log rebuild/append, if `scrollTop < 8` keep stuck to newest (FreePlay is newest-first → stick `scrollTop = 0`) |
| Tags [T]/[F]/sys | Demo invents | **Honest client tags only** (see below) |

**Log entry shape upgrade** (`pushTransition` ~74–86):

```js
// extend existing { id, t, stack, leaf }
{
  id, t, stack, leaf,
  fromLeaf: <previous leaf or null>,
  fromStackKey: <optional>,
  // client-derived only:
  tag: null | { kind: "empty"|"enter"|"same-depth"|"deeper"|"shallower", label: string }
}
```

**Honest tag rules (improve on demo fiction):**

| Event | Tag |
|---|---|
| Stack becomes empty | `empty` / “clear” |
| First non-empty after empty | `enter` |
| Depth increased | `+depth` or “deeper” |
| Depth decreased | “shallower” |
| Same depth, different leaf | no tag or “swap” |
| Condition-only updates | **Do not invent log rows** (wire does not send transition for conds alone) |

Do **not** invent [T]/[F] on log rows unless derived from factors for the **new leaf at receive time** (optional advanced: if factors already known for new leaf, show aggregate met/unmet — label as best-effort snapshot, not history).

**Concrete tasks:**

1. Extend `pushTransition` to capture fromLeaf/fromStack.
2. `renderLog` row grid: `time | from→to | meta/tags` (demo grid ~58px 14px 1fr auto; adapt with content tokens).
3. Flash newest once per push.
4. Preserve scrub: click row sets `viewStack`, `selectedLogId`, `selectedOwner = leaf`.
5. Empty-stack transitions remain visible (`(empty)`).
6. Keep ring `MAX_LOG = 200`; show count in panel title meta (`n/200`) like demo logCount/logCap.

### Documentation references

- Demo log: CSS L423–482; `renderLog` L1299–1358; `pushLog` L1138–1184  
- FreePlay: `pushTransition` ~74–86; `renderLog` ~527–602  
- Design honesty: gates “latest factors”; same spirit for log tags

### Verification checklist

- [ ] After two transitions A→B→C, log shows from/to leaves correctly.
- [ ] Empty stack event shows clearly.
- [ ] Scrub still freezes stack view; Live returns to tail.
- [ ] Auto-pin: while scrolled to top (newest), new events stay visible; if user scrolled down into history, do not jump.
- [ ] No fake [T]/[F] without factor data.
- [ ] Dirty path: selection-only class update still works.

### Anti-pattern guards

- Do not log every cond message as a transition.
- Do not claim tags came from engine.
- Do not unbounded log growth.

---

## Phase 4 — Gates panel polish

### What to implement

Match demo gates **interaction density** while keeping FreePlay’s superior status logic (inactive > T/F).

**Copy from demo:**

| Feature | Demo | FreePlay adaptation |
|---|---|---|
| Collapsible gate cards | `.gate` open toggle L1365–1448 | Click head toggles body; default **open FALSE / unmet**, **closed TRUE** (false-first) |
| Focus toolbar | `#gatesFocus` | “Focus: {owner} · latest factors · live|scrub” |
| Factor key/val rows | `.factor-row` | Keep existing skip keys / formatFactorVal |
| Nested children | Demo catalog | **Skip** — no wire tree of compound conditions |

**Concrete tasks:**

1. `renderGates` (~612–709):  
   - Sort: FALSE/unmet first, then unknown, then inactive, then TRUE (or false-first then alpha).  
   - Head clickable button; body collapsed for met unless user opened.  
   - Persist open state in module map `openGates[owner + "\0" + label]` (demo keys by name only — **improve**: include owner).
2. Panel head meta always states honesty string: `(latest factors — not time-aligned to log row)`.
3. Empty / no-owner messages unchanged in meaning.
4. Optional: show count `met/total` in title.
5. Keep inactive preference over stale T/F (Issue 1 from v1).

### Documentation references

- Demo gates CSS L491–610; `renderGateNode` / `renderGates` L1365–1448  
- FreePlay `renderGates` ~612–709; `factorSkipKey`  
- Design §5.1 gates + honesty note

### Verification checklist

- [ ] Unmet gates expanded by default; met collapsed.
- [ ] Toggle survives re-render for same owner/label (until owner change optional clear).
- [ ] Inactive still wins over TRUE/FALSE when both present.
- [ ] Scrub mode: gates still latest for selected owner (meta says so).
- [ ] No nested children UI.

### Anti-pattern guards

- Do not clone demo nested `children` without wire.
- Do not freeze factors into log entries without C++ envelopes.
- Do not show more than `MAX_GATES_DISPLAY` without indicator (“+N more”).

---

## Phase 5 — Nice-to-haves (improve on the demo)

Implement after P1–P4. Each item is independently shippable.

### 5.1 Keyboard ops (demo almost empty)

| Key | Action |
|---|---|
| `L` or `Escape` when scrubbing | Return to Live |
| `j` / `k` or arrows | Move selection in log (scrub) |
| `Enter` on stack/log | Activate focused row (native button) |
| `/` | Focus filter box if 5.2 present |

Scope: listeners on `.fp-root` with `tabIndex=0` or document when FreePlay surface active — **only if** shell exposes active surface; else attach on root focus. Do not steal keys from inputs.

### 5.2 Filter / search (demo has none — freeplay improves)

- Single filter input in log panel head: case-insensitive match on leaf / from / to.
- Optional second filter on gates by condition label.
- Filter is client-only; does not drop state, only hides DOM rows.

### 5.3 Clear log / session affordance

- Button “Clear log” in log head: clears `transitionLog` only (not wire).
- Optional “Reset view” = Live + clear pin (not demo Reset of engine).

### 5.4 Connection / silence UX (freeplay already has pills — extend)

- If **both** channels stale >5s: one-line banner under header “No freeplay stream (both channels silent)”.
- Keep per-channel pills.

### 5.5 Export transition log (optional)

- Dev tools: “Copy log JSON” or download text — mirror Behaviors CSV idea but simpler. Read-only dump of `transitionLog`.

### 5.6 a11y / density polish

- Ensure all interactive rows remain `<button>` (freeplay already better than demo divs).
- `aria-pressed` on Live; `aria-selected` on stack/log.
- Reduce motion: honor `prefers-reduced-motion` for flash animations.

### Documentation references

- Demo keyboard: Escape closes Dev only (~controls section)  
- FreePlay focus styles already in getStyles  
- Design §5.2 “keyboard optional later”

### Verification checklist

- [ ] Keyboard paths documented in Dev tools hint line.
- [ ] Filter does not break scrub selection identity.
- [ ] No listeners leak after re-init (`init` rebinds cleanly; no duplicate listeners on double init).
- [ ] Reduced-motion: no aggressive flash.

### Anti-pattern guards

- Do not bind global `window` keydown without checking FreePlay is the active surface (if undeterminable, bind on `.fp-root` only when focused).
- Do not add force-run shortcuts.

---

## Phase 6 — Optional Timeline secondary (nice-to-have)

**Only if** user wants visual history after Ops is solid. Design v1 said no D3 Gantt; this is a **lightweight canvas or CSS bars**, not stock Behaviors rewrite.

### What to implement (if approved)

1. Collapsed panel or toggle “Timeline” under ops (not a second shell tab).
2. Render last N log entries as horizontal bars per stack frame identity (demo `renderTimeline` L1450–1527).
3. Click bar → select log id / scrub (demo lacks this — **improve**).
4. Content tokens only; no dark canvas assumptions — draw with computed styles from CSS variables if possible.
5. Caption: “Secondary history — primary debugging stays on Ops.”

### Out of scope here

- Fixing stock Behaviors stratify/Gantt bugs (separate track).
- Mood / intent lanes without those channels subscribed.

### Verification checklist

- [ ] Timeline hidden by default; Ops remains default.
- [ ] Click scrub syncs stack + log selection.
- [ ] No D3 dependency.
- [ ] Performance: do not redraw every cond tick — only on log head change.

### Anti-pattern guards

- Do not replace Ops with Timeline.
- Do not pull `p5` / d3 for this.

---

## Phase 7 — Verification & docs closeout

### Status: done (2026-08-02)

Docs updated: this plan status/progress; `WEBVIZ-FREEPLAY-DESIGN.md` §5 Ops grid; `AGENTS.md` landmarks + progress; optional `webviz-ux-demo.html` pointer to production `freeplay.js`.

### What was required

1. Manual checklist against real robot or `devData` dumps (from original S1–S9 + new UX cases) — runtime U1–U11 on robot/devData remains operator-side.
2. Update mapping docs only (allowed):
   - `WEBVIZ-FREEPLAY-DESIGN.md` §5 wireframe → Ops grid + new log/gate/timeline behaviors.
   - This plan → mark phases done.
   - `AGENTS.md` §6 quick answers / landmarks if FreePlay UX description changes; §7 progress line.
   - Optional: `resources/webserver/webviz/README.md` one-liner if still says FreePlay “later”.
3. Keep `webviz-ux-demo.html` as **reference mock** (optional: add comment at top pointing to freeplay.js as production target). Do not require shipping the demo to the robot.

### Acceptance matrix (UX uplift)

| ID | Check |
|---|---|
| U1 | Ops 3-region layout fills module host; panel-internal scroll |
| U2 | Stack shows depth hierarchy + leaf emphasis; pin works |
| U3 | Log shows from→to, count, flash, pin-to-newest |
| U4 | Gates false-first collapse; focus meta honest |
| U5 | Content tokens only; readable under dark+light chrome |
| U6 | Multi-channel subscribe/refcount unchanged; stock tabs untouched |
| U7 | Empty stack / reconnect / scrub / Live still correct |
| U8 | No new wire channels; no force-run; no alert |
| U9 | Caps still enforced |
| U10 | (If P5) filter + keyboard do not break live path |
| U11 | (If P6) timeline secondary only |

### Anti-pattern regression grep

```bash
# From repo root — expect no matches in freeplay for forbidden patterns:
rg -n 'WebVizTheme|module-host--ops|--wv-text|--wv-bg|alert\(|SendToWebViz|#0f1218|#171b24' \
  resources/webserver/webVizModules/freeplay.js
# Stock modules not edited:
git diff --stat -- resources/webserver/webVizModules/behaviors.js \
  resources/webserver/webVizModules/behaviorConditions.js
```

### Robot / scp note

Deploy still: copy `webVizModules/freeplay.js` (+ shell files only if a phase touched them). Hard-refresh browser.

---

## Suggested execution order

```
P0 discovery     ✅
P1 layout grid   ✅
P2 stack polish  ✅
P3 log polish    ✅
P4 gates polish  ✅
P5 nice-to-haves ✅ (filter, keyboard, silence, clear/copy log, a11y)
P6 timeline      ✅ (secondary, collapsed by default)
P7 verify + docs ✅
```

**Shipped:** P1–P6 in `freeplay.js` + P7 mapping-doc closeout.  
**Minimum valuable ship was:** P1+P2+P3+P4.  
**Demo-beating polish:** +P5.1–5.4.  
**Extra:** +P6.

---

## Explicit non-goals (unchanged from v1 unless user reopens)

| Non-goal | Why |
|---|---|
| C++ ordered stack↔cond envelopes | Firmware work |
| Force-run / intent inject in FreePlay | Stock Behaviors footgun surface |
| Dark module host | Product rule |
| New HTTP / WebSocket / freeplay channel | No producer |
| Merging/deleting stock tabs | Escape hatches |
| Mood/intents/path panels in FreePlay | Other modules / no multi-channel expansion this plan |
| Full-frame re-render like demo tick() | FreePlay dirty path is better |

---

## File touch map

| File | P1 | P2 | P3 | P4 | P5 | P6 | P7 |
|---|---|---|---|---|---|---|---|
| `resources/webserver/webVizModules/freeplay.js` | ● | ● | ● | ● | ● | ● | |
| `docs/mapping/WEBVIZ-FREEPLAY-UX-PLAN.md` | | | | | | | ● status |
| `docs/mapping/WEBVIZ-FREEPLAY-DESIGN.md` | | | | | | | ● §5 |
| `AGENTS.md` §6/§7 | | | | | | | ● optional |
| `webviz/css/shell.css` | ◐ only if height chain broken | | | | | | |
| `webviz-ux-demo.html` | | | | | | | optional pointer comment |
| Stock `behaviors.js` / `behaviorConditions.js` | — never — | | | | | | |

● = expected · ◐ = last resort

---

## Session handoff

**UX uplift complete.** Further work is runtime verify (U1–U11 on robot/`devData`) or new features — not re-implement P1–P6.

1. Production UI: `resources/webserver/webVizModules/freeplay.js` (`buildDom` Ops grid; `renderStack` / `renderLog` / `renderGates` / `renderTimeline`).  
2. Design wireframe: `WEBVIZ-FREEPLAY-DESIGN.md` §5.  
3. Theme/API contracts still apply (content tokens; no dark host; multi-channel shell).  
4. Demo mock: root `webviz-ux-demo.html` (reference only; not robot-deployed).

**Confidence:** high — implementation observed in `freeplay.js` header comments + DOM structure (P1–P6).
