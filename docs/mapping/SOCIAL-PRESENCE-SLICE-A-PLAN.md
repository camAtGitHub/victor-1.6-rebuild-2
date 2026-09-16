# Plan: Social Presence Slice A — estimator live, tab fed, CPU-cheap

**Status:** Phases 1–5 **in tree** (2026-09-16 `/do A`). Phase 6 **grep-only pass**; **`vbuild`/flash not run**. Do not start Slice B until on-robot graph checklist is green.  
**Follow with:** [`SOCIAL-PRESENCE-SLICE-B-PLAN.md`](SOCIAL-PRESENCE-SLICE-B-PLAN.md) (HLAI reads RSPI). Execute B only after A’s on-robot graph checklist is green.  
**Source:** leak `stout/feat/receptive_social_presence_proto_VIC-14163` / snowboy `engine/receptiveSocialPresenceEstimator/` · restore catalog #15 · WebViz tab already waiting.  
**Goal:** `vic-engine` computes a decaying **RSPI** ∈ `[-1, 1]` from existing sensors/intents and publishes `socialpresence`. The **owned** WebViz tab (`socialPresence.js`) is the debug surface for that number (and for Slice B’s veto). **Robot freeplay behavior does not change.**  
**Out of scope:** HLAI / QuietMode / Observing JSON (that is B). New vision modes. Broadcasting `RobotObservedSalientPoint`. Redesigning the combiner. New chart library / throwing away the existing dashboard. Adaptive dispatcher. Held-in-palm tab.

**Durable copy:** this file. `/do` these phases in order.

---

## Phase 0 — Documentation discovery (Allowed APIs)

### Sources consulted

- Leak estimator (full): `/home/cam-test/repos/kercre123_victor/engine/receptiveSocialPresenceEstimator/socialPresenceEstimator.{h,cpp}` (227 / 427 lines)
- Leak wiring: `robotComponents_fwd.h:81`, `robot.cpp:71,369`, `robotComponents_impl.cpp:74,143,207`, `robot.h:110,251`
- Leak UIC callback: `userIntentComponent.h:65–79,256–257,404` · `.cpp:532–535,1276–1310`
- This tree (destination): `engine/robotComponents_fwd.h`, `robot.cpp:368–369`, `robotComponents_impl.cpp` CASE list, `BUILD.in` glob, `userIntentComponent.{h,cpp}` (**no** `RegisterNewUserIntentCallback`)
- WebViz client (**we own it; edit in Phase 4b, do not replace**): `resources/webserver/webVizModules/socialPresence.js` L4–8, L127–164, L577–611, L703–827, L851–880
- Shell description: `resources/webserver/webviz/js/config.js` L101
- Flot `grid.markings` sibling: `resources/webserver/webVizModules/mood.js` L365, L558
- Shell: `resources/webserver/webviz/js/{config,loader,socket}.js` — wire name **lowercase** `socialpresence`
- WebViz send: `webServerProcess/src/webVizSender.{h,cpp}` `CreateWebVizSender`; `webService.h` `OnWebVizSubscribed` / `OnWebVizData` / `IsWebVizClientSubscribed`
- Sibling tick: `heldInPalmTracker.cpp:46,117–141` (subscribe + `CreateWebVizSender`)
- Mic: `micDirectionHistory.h:68–69`; `behaviorReactToSound.cpp:153–174` register/unregister; `ProcessSoundReactors` `.cpp:497–509`
- Touch: `touchSensorComponent.h:231` `GetIsPressed()`
- Face/motion E2G: `externalInterface.h:60` `Subscribe`; producers `faceWorld.cpp:620`, `visionComponent.cpp:1218–1223`
- Salient: **this tree has zero `RobotObservedSalientPoint` sends**. Poll `SalientPointsComponent::SalientPointDetected` (`salientPointsComponent.h:70`, `.cpp:106–174`). `ConditionSalientPointDetected.cpp:50–59` shows poll — **and** it requests `VisionMode::People` Low; the estimator must **not** copy that vision request.
- Habitat ctor pattern: `habitatDetectorComponent.cpp:115–116`
- `MakeAnkiEventUtil` + `_signalHandles` vector: `habitatDetectorComponent.cpp:134–138`, `ankiEventUtil.h`

### Allowed APIs / copy surfaces

| API | Source | Use |
|---|---|---|
| Estimator files | leak `socialPresenceEstimator.{h,cpp}` | Copy algorithm + event table; apply CPU/bug fixes listed below |
| `RobotComponentID::SocialPresenceEstimator` | leak `robotComponents_fwd.h:81` (before `StateHistory`) | Add before `Count` on this tree |
| `LINK_COMPONENT_TYPE_TO_ENUM` + `CASE()` | leak `robotComponents_impl.cpp:143,207`; this tree CASE **must stay alphabetical** (`impl.cpp` comment ~L154) | Insert `CASE(SocialPresenceEstimator)` between `SettingsManager` and `StateHistory` |
| `AddDependentComponent` | leak `robot.cpp:369`; this tree insert after `LocaleComponent` L368, before `InitComponents` | Construct |
| `IDependencyManagedComponent<RobotComponentID>(this, RobotComponentID::SocialPresenceEstimator)` | Habitat ctor L115–116 | Estimator ctor |
| `RegisterNewUserIntentCallback` | **leak-only** UIC h:256–257, cpp:1276–1310, fire 532–535 | Port onto this tree’s UIC; do not poll `GetPendingUserIntent` |
| `USER_INTENT(system_sleep\|imperative_quiet\|imperative_shutup)` | this tree `userIntents.h:47–50` | Same filters as leak cpp:261–276 |
| `MicDirectionHistory::RegisterSoundReactor` / `UnRegisterSoundReactor` | this tree h:68–69 | Copy ReactToSound bind; **unregister in dtor** |
| `TouchSensorComponent::GetIsPressed` | h:231 | Edge-trigger, not every tick |
| `IExternalInterface::Subscribe(E2G tag, …)` → `Signal::SmartHandle` | `externalInterface.h:60` | Face + Motion only; **one handle per tag** |
| `SalientPointsComponent::SalientPointDetected(Person\|Hand)` | `salientPointsComponent.h:70` | Poll at RSPI period via `AIComponent` |
| `WebVizSender::CreateWebVizSender("socialpresence", …)` | `webVizSender.h:42` | Periodic graph; no JSON if unsubscribed |
| `OnWebVizSubscribed` / `OnWebVizData` | `webService.h:66–78` | Handshake `info.events`; spoof `eventName` |
| Existing `socialPresence.js` module API | `init` / `onData` / `update` / `getStyles`; `safeSend({eventName})` | **Edit in place.** Keep `graphData` + `info.events` wire |
| Flot `grid.markings` | `mood.js` L365, L558 | Horizontal line at **y = 0** (Slice B veto) |
| `engine/BUILD.in` `cxx_src_glob(['.'])` | L3–7 | New folder auto-compiles; no CMake list edit |
| `GetRSPI() const` | **new** (leak has no getter) | One-line return `_rspi` — required handoff to Slice B |

### CPU budget (non-negotiable)

Engine tick is **60 ms**. The leak is a prototype that would hurt a 1.0/2.0 AP:

| Do | Do not |
|---|---|
| RSPI combiner ≤ **10 Hz** (`kMinRSPIUpdatePeriod_s = 0.1`, already leak cpp:123) | Combiner / JSON / `TriggerInputEvent` on every 60 ms tick |
| WebViz JSON **only if** `CreateWebVizSender` non-null, period **0.5 s** (`kRSPE_WebVizPeriod_s`) | `SendToWebViz` without subscribe check; leak also updates `_lastWebVizSendTime_s` even when unsubscribed — fix that |
| Subscribe Face + Motion E2G (already produced) | Request `VisionMode::{Faces,People,Hands}` from the estimator |
| Poll `SalientPointDetected` at 10 Hz | Broadcast new `RobotObservedSalientPoint` every vision frame (message **does not exist** on this tree; adding it is serialization + fan-out) |
| Touch: **rising edge** (or at most one trigger per RSPI period while pressed) | Leak `PollTouch` retriggers every tick while `GetIsPressed()` |
| Face/Motion/Sound: at most **one Trigger per event per RSPI period** (latched flag cleared in `UpdateRSPI`) | `LOG_INFO` twice per `RobotObservedFace` (could be every vision frame) |
| Mic reactor: threshold then latch; **`return false`** always | Leak `return true` ORs into `ProcessSoundReactors` `isTriggered` → extra mic WebViz (`micDirectionHistory.cpp:507–516`) |
| Test spoof events (`ExplicitPositive` …) **not** in `_inputEvents` combiner; WebViz buttons only under `ANKI_DEV_CHEATS` | Five test events in the live sum (leak h:183–209) |
| `LOG_DEBUG` / channel `RSPE` for triggers; salient **no** `LOG_WARNING` every callback | Leak cpp:231,240 `LOG_INFO`; cpp:298 `LOG_WARNING` every salient |

**Do not include `engine/robot.h` in the estimator header** (leak does). Forward-declare `class Robot;`. Full include paths in the `.cpp`. Header guard `__Engine_ReceptiveSocialPresenceEstimator_SocialPresenceEstimator_H__`.

### Anti-patterns (do not)

1. Invent `GetRSPI` callers in A (getter exists; nothing reads it until B).
2. Throw away `socialPresence.js` or swap Flot for another chart lib. **Edit in place.**
3. Rename the RSPI series to `rspi` (case is the default-visible key).
4. Wire name `"SocialPresence"` — WebService maps are **case-sensitive**; JS always sends `"socialpresence"`.
5. Copy leak `_faceHandle` overwrite (`cpp:155–160`) — Face unsubscribes immediately.
6. `ConditionSalientPointDetected`’s `GetRequiredVisionModes` People Low — that **starts a neural net**. Estimator is a listener, not a scheduler.
7. Poll `GetPendingUserIntent()` every tick (misses same-tick claims; retriggers while pending). Port the UIC callback.
8. Enter QuietMode / change HLAI JSON.
9. Hand-edit generated clad. A adds **no** clad.
10. `vbuild` before Phase 6 is asked.
11. Cherry-pick whole snowboy `robot.cpp`.
12. Graph leak test events (`ExplicitPositive` …) as first-class series.

### Confidence / gaps

- **High:** file list, wiring sites, WebViz JSON keys, UIC gap, Face/Motion E2G, mic/touch APIs, no GetRSPI on leak, no salient E2G on this tree.
- **Medium:** `SalientPointDetected(type, 0)` stays true as long as any stored point timestamp `> 0` — Hand/Person series may stick until the list is replaced. Accept for A; do not add extra vision to “fix” it.
- **[UNKNOWN until robot]:** mic `kmicPowerScoreThreshold = 2.0` (leak: “not tuned”); whether Face E2G rate needs a stronger debounce than one-per-0.1s.

---

## Phase 1 — Port UIC intent callback (prerequisite)

### What to implement

Copy leak callback onto this tree’s `UserIntentComponent` so the estimator can subscribe once per pending intent.

**Copy:**

1. Types + struct + member from leak `userIntentComponent.h:65–79,256–257,404`.
2. Fire loop after whiteboard notify: leak `.cpp:532–535` into this tree `.cpp` after `NotifyNewUserIntentPending` (~L527–530).
3. `RegisterNewUserIntentCallback` / `UnRegisterNewUserIntentCallback` bodies: leak `.cpp:1276–1310`.

Do not change intent claim / QuietMode / SleepCycle. Callback is fan-out only.

### Verification

- [ ] `rg RegisterNewUserIntentCallback engine/aiComponent/behaviorComponent/userIntentComponent.*` hits header + cpp + fire site.
- [ ] `SetUserIntentPending` still notifies whiteboard first, then callbacks.
- [ ] No other files need to change in this phase.

### Anti-pattern guards

- Do not use `GetPendingUserIntent()` from the estimator.
- Do not `DevSetUserIntentPending` from production code.

---

## Phase 2 — Copy estimator + CPU/bug fixes

### What to implement

Create:

- `engine/receptiveSocialPresenceEstimator/socialPresenceEstimator.h`
- `engine/receptiveSocialPresenceEstimator/socialPresenceEstimator.cpp`

**Copy** leak files, then apply this delta (do not “clean up” the combiner math):

1. **Includes / header:** full paths (`engine/receptiveSocialPresenceEstimator/socialPresenceEstimator.h` first in cpp). Drop `#include "engine/robot.h"` from `.h`; forward-declare `Robot`. Guard name as in Phase 0.
2. **Public:** `float GetRSPI() const { return _rspi; }` next to the class public section. Nothing calls it in A.
3. **Handles:** three distinct `Signal::SmartHandle`s **or** `_signalHandles` vector + `MakeAnkiEventUtil` (Habitat L134–138). Subscribe **only** `RobotObservedFace` and `RobotObservedMotion`. Prefer vector so nothing can overwrite.
4. **Hand/Person:** in `UpdateInputs` (already 10 Hz gated via `UpdateRSPI`’s `dt_s`), if `dependentComps` has `AIComponent`, `GetComponent<SalientPointsComponent>().SalientPointDetected(Person)` / `Hand` → `TriggerInputEvent` **once per period** while true. Add `AIComponent` to `AdditionalUpdateAccessibleComponents` (init already depends on it).
5. **Touch:** store `_touchWasPressed`; trigger only on `false → true`.
6. **Face/Motion/Sound/Intent:** set a per-event pending bit in the E2G/mic/callback; `UpdateRSPI` consumes bits once per 0.1 s. No `TriggerInputEvent` from the audio-rate mic callback except setting the bit + threshold check.
7. **Mic:** `OnMicPowerSample` if `powerScore > kmicPowerScoreThreshold` set sound-pending; **`return false`**. Unregister in destructor (`kInvalidSoundReactorId` like ReactToSound L167–172). Cache `MicDirectionHistory*` from `InitDependent`.
8. **UIC:** cache `UserIntentComponent*` from `InitDependent`; `UnRegisterNewUserIntentCallback` in dtor if non-null.
9. **`_inputEvents`:** production list = UserIntent, Face, Motion, Hand, Person, Sleep, Quiet, ShutUp, Touch, Sound. **Omit** `_spete1`…`_spete5` from the combiner. Keep the five objects; WebViz spoof list may include them only if `ANKI_DEV_CHEATS`.
10. **Logs:** `LOG_DEBUG` at most; delete salient `LOG_WARNING` on every callback (`leak cpp:298`).
11. **WebViz:** see Phase 4 (can stub `SubscribeToWebViz` / `SendDataToWebViz` here).
12. **Deps:** keep leak `GetInitDependencies` = AIComponent + MicComponent; `GetUpdateDependencies` = CozmoContextWrapper + TouchSensor; add AIComponent to additional **update** accessible for salient poll.

Leave `ExponentialDecay` / `PowerDecay` / combiner (`leak cpp:213–223`) as-is.

### Verification

- [ ] `rg _faceHandle =` in the new cpp is **not** two assignments to the same handle.
- [ ] `rg GetRequiredVisionModes|VisionMode::` in the new folder is empty.
- [ ] `rg RobotObservedSalientPoint` in the new folder is empty.
- [ ] `rg GetRSPI` in the new `.h` hits the inline getter.
- [ ] `OnMicPowerSample` returns `false`.
- [ ] Test event names are absent from the production `_inputEvents` initializer.

### Anti-pattern guards

- Do not request People/Hands vision “so the series moves.”
- Do not redesign PowerDecay.
- Do not `#include "socialPresenceEstimator.h"` without the `engine/...` prefix.

---

## Phase 3 — Robot component wiring

### What to implement

Copy leak insert sites onto this tree:

| File | Edit |
|---|---|
| `engine/robotComponents_fwd.h` | `SocialPresenceEstimator,` before `Count` (leak placed it before `StateHistory`; either is fine; **CASE string must be alpha**) |
| `engine/robotComponents_impl.cpp` | `class SocialPresenceEstimator;` in the fwd block; `LINK_COMPONENT_TYPE_TO_ENUM(SocialPresenceEstimator, RobotComponentID, SocialPresenceEstimator)`; `CASE(SocialPresenceEstimator)` between `SettingsManager` and `StateHistory` |
| `engine/robot.cpp` | `#include "engine/receptiveSocialPresenceEstimator/socialPresenceEstimator.h"` with other engine includes; `AddDependentComponent(RobotComponentID::SocialPresenceEstimator, new SocialPresenceEstimator());` after `LocaleComponent` L368, before `InitComponents` |
| `engine/robot.h` | `class SocialPresenceEstimator;` + `INLINE_GETTERS(SocialPresenceEstimator)` (optional for A, cheap; B/BEI can use `GetComponent<>` either way) |

No `BUILD.in` / CMake edit.

### Verification

- [ ] `rg SocialPresenceEstimator engine/robotComponents_fwd.h engine/robotComponents_impl.cpp engine/robot.cpp engine/robot.h` hits all four.
- [ ] `GetComponentStringForID` CASE list remains alphabetical (`SettingsManager`, `SocialPresenceEstimator`, `StateHistory`).
- [ ] `Count` remains last in the enum.

### Anti-pattern guards

- Do not insert the enum **after** `Count`.
- Do not add BEI `Init()` parameters in A (that is Slice B).

---

## Phase 4a — WebViz producer (C++)

### What to implement

Copy leak `SubscribeToWebViz` / `SendDataToWebViz` (`cpp:345–422`) with CPU fixes. We **own** the JS, so the payload can grow a few optional keys; keep `graphData` / `info.events` so the existing ingest path still works.

1. Module string **`"socialpresence"`** exactly (`leak cpp:122`).
2. Subscribe + data only inside `ANKI_DEV_CHEATS` (leak L166–168, L180–184). Sending is still gated by a live subscriber.
3. **Tick send:** `if (auto webSender = WebService::WebVizSender::CreateWebVizSender(kWebVizModuleName, context->GetWebService())) { fill webSender->Data(); }` copying HeldInPalm `heldInPalmTracker.cpp:139–141`. Do **not** build `Json::Value` if the helper returns empty.
4. Payload tick (JS `ingestGraphTick` L785–818 still requires `time` + `graphData`):

```json
{
  "time": <GetCurrentTimeInSeconds() float>,
  "vetoThreshold": 0.0,
  "graphData": [
    { "name": "RSPI", "value": <_rspi> },
    { "name": "Face", "value": <…> }
  ]
}
```

   `graphData` = RSPI + **production** `_inputEvents` only (no `_spete*`).  
   `vetoThreshold` is optional; JS defaults to `0` if missing (Slice B’s `min: 0.0`).

5. Subscribe handshake: `{ "info": { "events": { "<Name>": { "eventName": "<Name>", "kind": "evidence"|"inhibitor" }, … } } }`. Production names only. `kind` is optional chrome for Phase 4b buttons. JS already accepts object or array (`L714–724`).
6. `OnWebVizData`: `data["eventName"].asString()` match `GetName()`, `TriggerInputEvent` — leak L374–383.
7. Advance `_lastWebVizSendTime_s` **only after a real send**, not when unsubscribed (leak L421 bug).

Do not send Mood-style `moods`. Do not require `graphData` on the info handshake (JS L869–872).

### Verification

- [ ] `rg kWebVizModuleName engine/receptiveSocialPresenceEstimator` is `"socialpresence"`.
- [ ] `rg CreateWebVizSender` or `IsWebVizClientSubscribed` wraps the graph JSON build.
- [ ] Tick JSON has `RSPI` and production event names only.

### Anti-pattern guards

- Do not emit `ExplicitPositive` / `PowerDecay*` on the wire.
- Do not invent a second module name.

---

## Phase 4b — Owned tab JS (edit in place; wanted)

We own `socialPresence.js`. **Keep the dashboard** (KPI strip, Flot, dump, spoof buttons). Change copy, colors, default series, and a **y = 0 veto line** so A is a Slice B preview, not a leak replica.

### What to implement

Edit `resources/webserver/webVizModules/socialPresence.js` (and the one-line description in `webviz/js/config.js` L101). Do **not** new-file the module.

| Change | Copy / where | Why wanted |
|---|---|---|
| Header blurb | `buildDom` L131–139 `.sp-sub` | Say what RSPI is: decaying “someone here **and open**” ∈ [-1, 1]. Slice B will **block Socializing below the dashed line (0)**. |
| Empty / waiting copy | L154, L162 | “Estimator not publishing yet” → after A, “no ticks this session”. Drop “C++ producer only” tone. |
| Events panel hint | L156–159 | “Spoof one evidence / inhibitor (does not change HLAI until Slice B).” |
| `vetoThreshold` | `onData` L851–877; `chartOptions` L577–611 | Read `data.vetoThreshold` if number, else `0`. Draw Flot `grid.markings` like `mood.js` L365: `{ yaxis: { from: t, to: t }, color: "rgba(220,38,38,0.55)" }` (hairline at B’s min). |
| Receptive KPI | `renderKpisAndToggles` / `primaryName` L114–125 | Extra chip: **receptive** if latest RSPI ≥ veto, else **inhibited**. Derived in JS; no extra C++ series. |
| Series colors | `colorFor` L98–100; `SERIES_COLORS` L19–28 | **RSPI** = `#2563eb`. Inhibitors `Sleep`/`Quiet`/`ShutUp` = `#dc2626`. Evidence = remaining palette. Do not rainbow-assign by index only. |
| Default visible | `DEFAULT_VISIBLE` L18; `initSeriesFromPayload` L499–517 | Default **RSPI + Quiet + Face** (not “RSPI-only when >4 series”). Enable-all still works. |
| Filter test names | `initSeriesFromPayload`, `renderEvents` | Ignore `ExplicitPositive`, `ImplicitPositive`, `ExplicitInhibitor`, `PowerDecayNegative`, `PowerDecayPositive` if they ever appear. |
| `kind` on buttons | `renderEvents` L736–781 | If `ev.kind === "inhibitor"`, add a class (red-tint existing `.sp-event-btn`). Still `safeSend(ev)` with `eventName`. |
| Description | `config.js` L101 | `Social presence (RSPI) — occupancy + receptiveness; dashed line is HLAI socialize veto` |

Keep: `WINDOW_S = 60`, y-axis `[-1.05, 1.05]`, dump, enable-all, fill-primary, `safeSend`, host scoping (`#tab-socialpresence`).

### Verification

- [ ] `git diff -- resources/webserver/webVizModules/socialPresence.js` is **non-empty** (this phase is supposed to edit it).
- [ ] `rg DEFAULT_VISIBLE resources/webserver/webVizModules/socialPresence.js` includes `RSPI` and `Quiet`.
- [ ] `rg markings resources/webserver/webVizModules/socialPresence.js` hits `chartOptions`.
- [ ] `rg ExplicitPositive resources/webserver/webVizModules/socialPresence.js` is a **filter list**, not a default series.
- [ ] `config.js` description no longer says only “graphData wire”.
- [ ] Static load: `webViz.html` still inits the module (no throw in `buildDom`).

### Anti-pattern guards

- Do not rewrite the IIFE against `module.js.template`.
- Do not add a second poll / extra WebSocket.
- Do not draw HLAI stack here (that is FreePlay).
- Do not default-enable all 11 series (unreadable).
- JS may be scp’d without `vbuild`; C++ still needs flash for packets.

---

## Phase 5 — Console catalog (optional, cheap)

### What to implement

New shard `resources/webserver/cvcatalog/vars/engine-social-presence.json` for:

- `RSPE_WebVizPeriod_s` (dump id drops `k`; category `SocialPresenceEstimator`)

Follow `resources/webserver/cvcatalog/AGENTS.md` schema. Register in `cvcatalog/index.json`. Copy blurb style from `vars/engine-explore-hlai.json`.

Do **not** catalog `kMinRSPIUpdatePeriod_s` unless you promote it to `CONSOLE_VAR` (leak left it a `const`).

### Verification

- [ ] Shard listed in `index.json`.
- [ ] Key matches dump-style id (`RSPE_WebVizPeriod_s`).

---

## Phase 6 — Verification (gated `vbuild` / flash)

**Do not start until asked.** Then:

1. `rg SocialPresenceEstimator engine/` shows estimator + four wiring files + UIC callback.
2. `rg GetRequiredVisionModes engine/receptiveSocialPresenceEstimator` empty.
3. `rg "socialpresence" engine/receptiveSocialPresenceEstimator` hits subscribe/send.
4. `vbuild` `vic-engine` only when the user says flash.
5. On robot, engine WebViz `:8888` → Social Presence:
   - Badge leaves **waiting** within ~1 s of opening the tab.
   - Subtitle mentions the **veto line**; Flot shows a dashed/red line at **y = 0**.
   - Default series: **RSPI + Quiet + Face**. KPI chip **receptive** vs **inhibited**.
   - Face in view → Face series / RSPI up (after face-handle fix).
   - Pet backpack → Touch spike on rising edge only (enable Touch to see it).
   - “Hey Vector, be quiet” → Quiet series negative, RSPI crosses **below** the line, chip → inhibited.
   - Spoof **Quiet** / **Face** buttons move the graph; no test-event buttons.
   - With tab **closed**, no `socialpresence` JSON spam in logs.

**Pass A → start Slice B.** If Face never moves, inspect handle storage before B.

### HLAI / QuietMode

Unchanged. Confirm FreePlay stack still Observing/Socializing as before.

---

## Suggested `/do` chunking

| Chunk | Phases | Notes |
|---|---|---|
| 1 | 1 | UIC callback only — small, compileable |
| 2 | 2–4a | Estimator + wiring + C++ WebViz |
| 3 | 4b | JS tab (scp-able without flash; empty until 4a is on robot) |
| 4 | 5 | Catalog |
| 5 | 6 | Flash when asked |

B’s Phase 0 assumes `GetRSPI()` and `RobotComponentID::SocialPresenceEstimator` exist.
