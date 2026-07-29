# WebViz module hardening plan

**Goal:** Read every module attached to `webViz.html` (engine :8888 + anim :8889), fix bugs, ensure shell compatibility, code-review each change.

**Shell contract** (`webviz/js/loader.js` + `app.js`):

- IIFE: `(function(myMethods, sendData){...})(moduleMethods, moduleSendDataFunc)`
- Required methods: `init(elem)`, `onData(data, elem)`, `update(dt[, elem])`, `getStyles()` → string
- Host element id: `#tab-{lowercaseKey}` (e.g. `#tab-behaviors`); styles scoped under `#tab-{key}` / `#panel-{key}`
- Light content surface; do not depend on old 800px folder-tab layout
- Throws in `onData`/`update` become toasts — still fix root causes
- Optional: `myMethods.devShouldDumpData = true`

**Out of scope:** Freeplay UX redesign; shell redesign; engine C++ protocol changes.

**Registry (unique files):**

| Task | Files | Port |
|---|---|---|
| T1 | `behaviors.js` | 8888 |
| T2 | `behaviorConditions.js` | 8888 |
| T3 | `navMap.js` | 8888 |
| T4 | `mood.js` | 8888 |
| T5 | `micDataEngine.js`, `micData.js` | 8888 / 8889 |
| T6 | `cubes.js`, `intents.js`, `cloud.js` | 8888 |
| T7 | `cpu.js`, `cpuprofile.js`, `features.js`, `beatDetector.js` | both |
| T8 | `animationEngine.js`, `animations.js`, `audioEvents.js`, `speechRecognizerSys.js`, `alexa.js` | both |
| T9 | `visionScheduleMediator.js`, `observedObjects.js`, `habitat.js`, `heldInPalm.js`, `touch.js`, `power.js`, `imu.js`, `sleeping.js` | 8888 |

## Per-module acceptance

1. Still exposes four required methods; still uses `sendData` correctly if present
2. No uncaught throws on empty/malformed payloads (guard + early return)
3. DOM/SVG/Flot/DataTables scoped to `elem` / `#tab-*`, not `document` globals where practical
4. No duplicate fixed HTML ids that collide across instances
5. Compatible with subscribe/unsubscribe (init once; onData may stop — no leak of global intervals if avoidable)
6. No drive-by refactors unrelated to bugs/compat
7. Commit after task with clear message

## Known issues (from mapping review)

- **behaviors:** d3.stratify id collision (`behaviorID` only vs merge key `behaviorID+parent`); empty stack leaves stale SVG; global `d3.select('svg')`; debug-state clear no-op
- **behaviorConditions:** `behaviorDivs[parent]` throw; unbounded history; duplicate `id="cond"`; full DOM rebuild every step

## Process

For each task: implementer → spec review → code-quality review → fix loops → mark done. Sequential implementers only.
