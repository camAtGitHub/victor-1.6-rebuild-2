# WebViz — Behaviors & BehaviorConds review

**Path:** cross-cutting (`resources/webserver/`, engine stack/BEI, `webServerProcess/`)  
**Mapped:** 2026-07-28   **Confidence:** high (code-traced; not run live on robot)  
**Upstream docs:** `docs/development/web-server.md` (one paragraph on WebViz)

> **Phase note:** Observation only. No UI or engine fixes applied.  
> User report: error popups often; Behaviors / BehaviorConds hard to use while robot is running; GUI feels like it needs a redesign.

---

## 1. What WebViz is in this stack

WebViz is the **live debug surface** for engine (port **8888**) and anim (port **8889**). Shell: `resources/webserver/webViz.html`. Each tab is a JS module under `resources/webserver/webVizModules/`. Data path:

1. Browser opens WebSocket `ws://<host>/socket`
2. Tab click → `subscribe` with module name (lowercased)
3. Engine/`WebService::SendToWebViz(module, json)` → `{ "module": "...", "data": ... }`
4. Shell `onNewData` → `modules[name].onData(data, tabElem)` (try/catch → **one global `alert`**)

Engine modules of interest:

| Tab (UI) | Module key | Primary engine producers |
|---|---|---|
| **Behaviors** | `behaviors` | `StackVizMonitor` (stack/tree), `BehaviorComponentMessageHandler` (subscribe snapshot + behavior-ID list + force-run), `ICozmoBehavior::SetDebugStateNameToWebViz`, `ActiveFeatureComponent` |
| **BehaviorConds** | `behaviorconds` | Same stack JSON as Behaviors **plus** `IBEICondition::SendConditionsToWebViz` / `SendInactiveToWebViz` (per evaluated condition) |

Shared stack payload builder: `BehaviorStack::BuildDebugBehaviorTree`  
(`engine/aiComponent/behaviorComponent/behaviorStack.cpp` ~L342).

Shape:

```json
{
  "time": <float seconds BS timer>,
  "tree": [ { "behaviorID": "...", "parent": "..." | null }, ... ],
  "stack": [ "root", "...", "leaf" ]
}
```

`tree` is **not** the active stack path alone: for each behavior currently on the stack, it emits **all `GetAllDelegates()` children** as parent→child edges, plus one root row (`stack.front()`, `parent: null`). That is a **possible-delegate fan-out**, not a pure “who is running” tree.

---

## 2. Behaviors tab — how data is displayed

**File:** `resources/webserver/webVizModules/behaviors.js` (~1009 lines)

### Intended UX

- D3 hierarchy (label column) + horizontal **Gantt-style time bars** per behavior row
- Mouse X = scrub time; labels turn red when that behavior was active at cursor time
- Bottom strip: zoom-range select (pauses live updates)
- Header lines: active feature, current leaf behavior, optional debug state name
- Controls: dropdown of all `BehaviorID`s → force `ExecuteBehaviorByID`; “Force” checkbox; CSV download of stack-over-time

### How the client builds state

| Incoming message | Handler |
|---|---|
| `{ tree, stack, time }` | Merge into `flatData`, `d3.stratify`, update `activeTimes` open/close intervals from `stack` membership, redraw if live |
| `{ debugState }` | Set “Latest state: …” text only |
| `{ activeFeature }` | Set “Active feature: …” text only |
| Array of behavior name strings | Rebuild force-run dropdown (`addControls`) |

Client **invents the timeline**: engine only sends stack snapshots on change. `activeTimes` is inferred by open/close intervals when a behavior enters/leaves `stack`. `myMethods.update(dt)` advances `globalTime` and re-layouts every **200 ms** (`kUpdatePeriod_ms` in `webViz.html`).

### Display model problems

1. **Wrong primary question for freeplay.** Operators usually want “what is the stack *right now*, and why did it change?” The UI answers a different question: “Gantt of every behavior that has ever been in the received tree since page open,” with a dense possible-delegate tree. Stack depth is lost as a first-class column (only leaf name in the H3).

2. **Tree ≠ stack path.** `BuildDebugBehaviorTree` fans out **all** delegates of each stack member. With “Show activatable” off, rows without `activeTimes` hide — still, once a child has been active once, it stays forever as a row. The viz accumulates history until force-run clears display.

3. **Stratify identity bug (likely alert source).**  
   Merge key: `behaviorID + parent`  
   Stratify id: **`behaviorID` only**  
   (`behaviors.js` ~L848–860).  
   After the stack has moved around, the same behavior can appear under different parents in `flatData`. `d3.stratify` requires unique ids → **throws** → shell shows  
   `alert('The module behaviors has an error…')`  
   (`webViz.html` ~L420–427).  
   [CONFIRMED] code path; [INFERRED] this is a common cause of the reported popups on Behaviors.

4. **Empty stack does not clear the SVG.**  
   `onData` with empty `stack` sets text “No running behavior” and nulls `flatData`/`treeData` but **does not** call `clearDisplay()` (~L832–836). Stale bars remain.

5. **Global D3 selectors.** `d3.select('svg')` / `d3.selectAll('.labelGroup text')` are document-global, not scoped to `#tab-behaviors`. Fragile if other tabs inject SVGs or if the tab is popped out vs in-container.

6. **Live update + zoom coupling.** Zooming forces `liveUpdating = false`. Easy to “freeze” without noticing; only control is a tiny blue/grey toggle drawn on the axis (easy to miss). No reconnect banner if the socket died while frozen.

7. **Debug state clear is a no-op.**  
   `currentBehaviorStateDiv.text()` with no args (~L866) **reads** text; it does not clear on behavior change.

8. **Minor HTML/attr bugs.** Usage line is `<h4>…</h3>`; resend button is `type"button"` (invalid). Cosmetic.

9. **Force-run is a footgun next to viz.** Dropdown lists every `BehaviorID` enum entry (~hundreds). Selecting one broadcasts `ExecuteBehaviorByID` and clears the display. Fine for lab, dangerous as default chrome when “just looking.”

10. **Performance under freeplay.** Every stack change rebuilds stratify + full enter/update/exit on all rows; `update()` every 200 ms recomputes label widths, axes, mini-bars. No virtualization. Grows with history.

---

## 3. BehaviorConds tab — how data is displayed

**File:** `resources/webserver/webVizModules/behaviorConditions.js` (~468 lines)

### Intended UX

Time-travel debugger for **why** activations fail/succeed:

- History of discrete events: stack change (`s`), factor change (`c`), inactive (`i`)
- Slider + dual prev/next (any change vs stack-only)
- Nested DOM: behavior boxes → condition labels `[TRUE]/[FALSE]` → scalar factors → child conditions
- Red border on “what changed this step”; optional auto-scroll

### How the client builds state

| Incoming | Handler |
|---|---|
| `{ stack, tree, time }` | `OnStackChanged` — merge parents, snapshot in-scope behavior IDs, push history |
| `{ factors, time }` | `OnFactorsChanged` — full condition JSON from `BEIConditionDebugFactors` |
| `{ inactive, owner, time }` | `OnInactive` — condition left scope (often batched same tick) |

Engine only sends factor JSON when `ANKI_DEV_CHEATS` and a **root** condition’s met-value or factors changed **and** a client is subscribed (`iBEICondition.cpp` ~L119–157). Comment in UI: conditions update only when evaluated — true.

### Display model problems

1. **Full DOM rebuild every step.** `Redraw()` empties `#conditionsContainer` and rebuilds the entire hierarchy (~L90–163). Under freeplay, conditions flip often → constant reflow + scroll animation. This is the “GUI is trash while running” feel for this tab.

2. **Hierarchy assembly is fragile.**  
   `parentsByBehavior` **appends** parents forever (`MergeTree`); never prunes.  
   Placement:

   ```js
   if (typeof parent !== 'undefined' && parent == null) {
     $('#conditionsContainer').append(div);
   } else {
     behaviorDivs[parent].append(div);  // throws if parent not in this inScope snapshot
   }
   ```

   A parent string that is not in the current `inScope` set → **`behaviorDivs[parent]` undefined** → throw → same global alert (module name `behaviorconds`).  
   Multiple parents over history re-parent the same DOM node (last write wins).

3. **Ordering race acknowledged in code.**  
   Comment at ~L214–216: when the stack changes, **conditions for the new scope can arrive before the stack message**. Entries attach to `stacks.length-1` (old stack). UI text even says keep clicking if arrows do nothing. That is a data-protocol bug, not user error.

4. **No “live stack” summary.** When auto-scrolling at the head, you still get a huge nested factor dump, not a compact “current leaf’s activation gates” view. The useful question (“why didn’t Observing yield?”) is buried in full in-scope trees.

5. **Unbounded history.** `history`, `stacks`, `condChanges`, `changesByCond` Sets grow for the whole session. No ring buffer / clear.

6. **Duplicate HTML ids.** Every condition div uses `id="cond"` (~L59, L84) — invalid HTML; breaks any `#cond` selector and accessibility.

7. **Inactive vs factors type union.** `condChanges` stores either a factor object or an array of inactive names. Redraw branches on `areConditionsMet` / `Array.isArray`. Workable but opaque; any new payload shape blows up with little diagnostics (only console.log under the global try/catch).

8. **Subscribe does not seed conditions.** Opening BehaviorConds only gets future events + stack pushes from `StackVizMonitor`. No snapshot of currently active conditions’ last factors — blank until something evaluates.

---

## 4. Shell-level issues (`webViz.html`) that amplify both tabs

| Issue | Detail |
|---|---|
| **One alert forever** | `hasShownAlert` is global; first module error silences all later ones (~L416–427). User sees one popup, then silent wrong UI. |
| **No WebSocket reconnect** | `onclose` marks Disconnected and **clears subscription list without resubscribe**. Must full reload. |
| **Lazy subscribe only on first tab click** | Correct for bandwidth; easy to miss that Overview does nothing until you open a tab. |
| **CDN deps** | jQuery 3.3.1 / D3 4.13 / Flot / DataTables from cdnjs; local copies of jQuery 1.12 / UI exist but shell uses CDN. Offline or flaky network → partial failure. |
| **Fixed 800px chrome** | 2017-era tab strip with ~20 engine modules wraps poorly; pop-out is a pin icon only. |
| **Module errors on load** | Missing `init`/`onData`/`update`/`getStyles` → alert and drop module (~L573–580). |
| **Fake data path** | `getDevData()` always GETs `devData.json` (404 normally); fine, but Overview still mentions template workflow. |

---

## 5. Engine-side coupling (why volume hurts)

| Source | When | Cost |
|---|---|---|
| `StackVizMonitor::NotifyOfChange` | Every stack change | Builds full delegate tree JSON; fans out to **both** `behaviors` and `behaviorconds` if either subscribed |
| `IBEICondition::AreConditionsMet` | Each root eval with changed factors | Full debug factor JSON over WS while BehaviorConds open |
| `SetActive(false)` | Condition deactivated | `inactive` message |
| Force-run from UI | User dropdown | `ExecuteBehaviorByID` via G2E |

Opening **both** tabs doubles stack traffic and enables the heavy condition stream. There is no server-side sampling/coalescing for WebViz.

---

## 6. Redesign thesis (recommendation only — not implemented)

The current design is a **2018 engineer’s notebook**: one WebSocket, one module per concern, each module invents its own DOM + history. That scales poorly to freeplay (deep trees, high condition churn, long sessions).

### What to keep

- Subscribe-on-demand modules and `SendToWebViz` protocol (cheap when unused)
- Bidirectional channel for force intents / force behaviors (dev power)
- Separation of engine stack snapshot vs condition factor streams
- CSV / log export idea for behavior stacks

### What to throw away or invert

| Old | Better primary UI |
|---|---|
| Gantt of every ever-seen behavior | **Live stack as a vertical breadcrumb** (root→leaf), updated only on stack change |
| D3 stratify of all delegates | **Optional** “possible delegates of current leaf” panel |
| Client-inferred `activeTimes` | Optional history: engine sends **transition events** `{t, fromStack, toStack}` or client keeps a ring buffer of stack snapshots only |
| Full DOM rebuild of all conditions | **Current leaf’s activation conditions only** (met/unmet + top factors); expand-on-demand for parents |
| Dual cryptic arrow buttons | Timeline of **stack transitions** with condition delta attached to the transition that failed/succeeded |
| `alert()` | Toast + error panel with stack trace; per-module error badge; never block the page |
| Global CSS/D3 | Shadow DOM or strict `#tab-*` scoping; no document-level `d3.select('svg')` |

### Suggested information architecture (v2 sketch)

```
┌─────────────────────────────────────────────────────────────┐
│ Connection · robot time · ActiveFeature · Mood (compact)    │
├───────────────┬─────────────────────────────────────────────┤
│ STACK (live)  │ TRANSITION LOG (ring, e.g. last 200)        │
│ Root          │ 12.401  → ReactTo...   [cond: FaceKnown T]  │
│  Dispatcher   │ 12.380  → Observing    [prev leaf exited]   │
│  HighLevelAI  │ …                                           │
│  Observing ◀  │                                             │
├───────────────┴─────────────────────────────────────────────┤
│ GATES for selected stack entry (default = leaf)             │
│  [T] TimerInRange  elapsed=2.1 / min=0                      │
│  [F] FaceKnown     lastSeen=…                               │
│  children…                                                  │
└─────────────────────────────────────────────────────────────┘
 Dev tools (collapsed): Force behavior · Force intent · Raw JSON
```

Behaviors tab and BehaviorConds tab should **merge** for freeplay debugging; split only if bandwidth requires (conditions still optional subscribe).

### Protocol fixes that matter even without a full redesign

1. **Stable node identity** for tree rows: id = `behaviorID` + parent (or engine-side unique debug instance id), not bare `behaviorID`.
2. **Order guarantees / single envelope** on stack change: `{ stack, tree, time, conditionsSnapshot? }` so conds cannot land on the wrong stack index.
3. **Snapshot on subscribe** for BehaviorConds (current in-scope conditions’ last factors).
4. **Ring buffer** client-side; cap history.
5. **Reconnect** with auto-resubscribe of open tabs.
6. Replace `alert` with non-blocking error UI; log full error string in-page.

### Effort framing

| Scope | Rough nature |
|---|---|
| **P0 bugfix** (stratify id, empty-stack clear, parent DOM guard, reconnect, no alert) | Small JS-only; big reliability win |
| **P1 UX** (live stack + transition log; merge tabs’ mental model) | Medium JS; may keep existing engine messages |
| **P2 protocol** (snapshots, ordered envelopes, instance ids) | Engine + JS; enables correctness under race |
| **P3 full redesign** (layout, design system, virtualized history) | Greenfield front-end; keep `SendToWebViz` backend |

---

## 7. File index

| Path | Role |
|---|---|
| `resources/webserver/webViz.html` | Shell: tabs, WS, update loop, error alert |
| `resources/webserver/webVizModules/behaviors.js` | Behaviors viz |
| `resources/webserver/webVizModules/behaviorConditions.js` | BehaviorConds viz |
| `resources/webserver/webVizModules/module.js.template` | Module contract |
| `engine/.../stackMonitors/stackVizMonitor.cpp` | Stack → both modules |
| `engine/.../behaviorStack.cpp` `BuildDebugBehaviorTree` | Payload shape |
| `engine/.../behaviorComponentMessageHandler.cpp` | Subscribe + force-run |
| `engine/.../beiConditions/iBEICondition.cpp` | Factor / inactive → `behaviorconds` |
| `engine/.../activeFeatureComponent.cpp` | activeFeature line on Behaviors |
| `webServerProcess/src/webService.*` | WS transport |
| `docs/development/web-server.md` | Upstream 1-paragraph WebViz note |

---

## 8. Open questions

- [UNKNOWN] Live frequency of factor messages during freeplay on rebuild firmware (needs robot capture / `devShouldDumpData`).
- [UNKNOWN] Whether rebuild already toggles `ANKI_DEV_CHEATS` off in some shipping-like builds (would mute BehaviorConds entirely).
- [UNKNOWN] Whether duplicate `behaviorID` under multiple parents is common in production trees or only after long sessions / force-run — stratify crash still follows from the merge key mismatch either way.
- [INFERRED] User “error popups often” maps primarily to shell `alert` after module throw; Behaviors stratify and BehaviorConds parent lookup are the two strongest code-backed suspects.

---

## 9. Bottom line

WebViz Behaviors/BehaviorConds are **historically clever** but **wrong defaults for a running freeplay robot**: they prioritize infinite client-side history and full-tree Gantt/DOM dumps over a stable live stack and “why this leaf” gates. Combined with at least two hard throw paths and a blocking global alert, the UI fails exactly when the behavior system is most interesting. A redesign should center **live stack + transition log + leaf gates**, fix identity/ordering in the protocol, and treat history as a capped, secondary view — not the main canvas.
