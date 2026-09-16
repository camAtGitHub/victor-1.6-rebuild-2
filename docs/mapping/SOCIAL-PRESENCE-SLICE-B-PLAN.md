# Plan: Social Presence Slice B — HLAI reads RSPI (not a new stack)

**Status:** plan only — **blocked on Slice A** ([`SOCIAL-PRESENCE-SLICE-A-PLAN.md`](SOCIAL-PRESENCE-SLICE-A-PLAN.md) Phase 6 green). Do not implement until `/do`. Do not `vbuild` until Phase 6.  
**Goal:** Existing HighLevelAI doors to **Socializing** also require “receptive” (RSPI not inhibited). Observing / Exploring / QuietMode / SleepCycle stay. **No new HLAI state. No QuietMode-from-low-RSPI.**  
**Integration completeness:** public `GetRSPI()`, BEI getter like Mood, first-class JSON `conditionType: SocialPresence` usable from any behavior, HLAI transitions that already go to Socializing, unit test, generator-spec row, BehaviorConds visibility.  
**CPU:** the condition is a cached-float compare on the 60 ms behavior tick. **No extra vision modes.**

**Out of scope:** Adaptive dispatcher; replacing `CloseFaceForSocializing`; auto QuietMode; Observing child retune (optional later); FeatureType kill-switch (socialize has none today); restyling the Social Presence tab (Slice **A Phase 4b** already owns it; BehaviorConds already streams the new factor).

**Durable copy:** this file. `/do` after A.

---

## Phase 0 — Documentation discovery (Allowed APIs)

### Sources consulted

- Slice A plan (getter + `RobotComponentID::SocialPresenceEstimator` as RobotComponent, Mood-shaped)
- HLAI JSON: `resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree/highLevelAI.json`
- `CloseFaceForSocializing`: `behaviorHighLevelAI.cpp` `CreateCustomConditions` ~L129–162 (`VisionMode::Faces` **Low** only)
- Quiet/ShutUp **above** HLAI: `modeSelector.json` L7–16 (`ShutUpMode`, `QuietMode`, then `SleepCycle`)
- `docs/architecture/beiConditions.md` — conditions are thin wrappers over a **component**
- `docs/mapping/BEHAVIOR-GENERATOR-SPEC.md` §8 (condition table + `BEIConditionType` dump L244) — **update if a type is added**
- `docs/mapping/ENGINE-BEHAVIOR-TREE.md`, `ENGINE-OBSERVING-AND-INTENTS.md` Observing → Socializing
- Clad enum (alphabetized): `clad/src/clad/types/behaviorComponent/beiConditionTypes.clad`
- Factory: `engine/aiComponent/beiConditions/beiConditionFactory.cpp` (Emotion include L29; HeldInPalm case L351–353)
- Copy template **Emotion** (float range, **no vision**): `conditions/conditionEmotion.{h,cpp}` L33–77
- BEI Mood wiring (RobotComponent on BEI): `beiComponents_fwd.h` `MoodManager`; `behaviorExternalInterface.h` L209–210 `HasMoodManager` / `GetMoodManager`; `.cpp` `InitDependent` L84; `Init()` L107+; `CompArrayWrapper` L201–274; `test/engine/behaviorComponent/testBehaviorFramework.cpp` `InitBEIPartial` L86–127
- Tests: `test/engine/behaviorComponent/testBeiConditions.cpp` `TEST(BeiConditions, Emotion)` L272–368
- Faces Low period: `resources/config/engine/visionScheduleMediator_config.json` (Low/Med/High/Standard Faces all period **1**) — extra `{Faces, Low}` does **not** raise rate; **do not request High or People/Hands**
- Catalog HLAI knobs: `resources/webserver/cvcatalog/vars/engine-explore-hlai.json`

### Allowed APIs / copy surfaces

| API | Source | Use |
|---|---|---|
| `SocialPresenceEstimator::GetRSPI() const` | Slice A | Only float the condition reads |
| `robot->GetComponentPtr<SocialPresenceEstimator>()` | Mood in `BEI::InitDependent` L84 | BEI wiring |
| `BEIComponentID` + `Has*` / `Get*` | Mood L209–210 | Completeness: JSON conditions cannot see Robot |
| `BEIConditionType` clad insert **alphabetized** | `beiConditionTypes.clad` L11–77 comment “PLEASE KEEP ALPHABETIZED” | `SocialPresence` after `SettingsUpdatePending`, before `SimpleMood` |
| `BEIConditionFactory` switch | HeldInPalm L351–353 | `std::make_shared<ConditionSocialPresence>(config)` |
| `ConditionEmotion` | `conditionEmotion.{h,cpp}` | Clone: `min`/`max`/`value`, `AreConditionsMetInternal` reads getter, **no** `GetRequiredVisionModes` |
| HLAI AND-in | `highLevelAI.json` Observing→Socializing L331–344 | Third `and` operand; Compound max depth 2 (root stays depth 1) |
| `TEST(BeiConditions, Emotion)` | `testBeiConditions.cpp` L272–368 | Copy; stub estimator RSPI like `SetEmotion` |
| BehaviorConds WebViz | `iBEICondition.cpp` already `SendToWebViz("behaviorconds")` | No new tab |
| `docs/architecture/beiConditions.md` | Best practice: component is source of truth | Do not put RSPI only in an HLAI Lambda |

### v1 policy (integration-complete, not a personality rewrite)

**Keep `CloseFaceForSocializing` + existing Stim mins.** Those are occupancy + arousal.

**Add RSPI as a veto for “not receptive”:**

```json
{ "conditionType": "SocialPresence", "min": 0.0 }
```

Meaning: after `imperative_quiet` / `imperative_shutup` / `system_sleep` pull RSPI negative (Slice A events Sleep/Quiet/ShutUp), HLAI **must not** open Socializing even if a face is still in the 1 m box. Idle RSPI ≈ 0 still allows the old CloseFace+Stim path once a face event has decayed toward 0.

Do **not** set `min` to 0.5 in v1 (that would require strong positive evidence and would make socialize rarer before the graph is trusted). After A’s graph looks sane, a later knob can raise `min`.

**Do not** replace CloseFace with RSPI (drops 1 m + 30 min socialize cooldown + recognizable-face).

### Every Socializing door (must all get the same veto except F)

| ID | From → To | Today | B |
|---|---|---|---|
| **A** | ObservingOnCharger → DriveOffChargerIntoSocializing | CloseFace + Stim≥0.7 + not TooDark | AND `SocialPresence` min 0.0 |
| **C** | Observing → Socializing (non-interrupting) | CloseFace + Stim≥0.5 | AND same |
| **D** | Exploring → Socializing (interrupting) | CloseFace + Stim≥0.7 | AND same |
| **E** | ObservingDriveOffCharger **exit** → Socializing | CloseFace only | AND same |
| **F** | DriveOffChargerIntoSocializing **exit** → Socializing | `TrueCondition` | **leave True** (A already gated the drive-off) |
| Resume | `postBehaviorSuggestionResumeOverrides.Socialize` | → Socializing | unchanged |
| QuietMode / ShutUpMode | ModeSelector, **above** HLAI | voice `imperative_quiet` / `shutup` | **do not consume RSPI** |

`ObservingOnChargerRecentlyPlaced` has **no** socialize transition — skip.

### CPU budget (non-negotiable)

| Do | Do not |
|---|---|
| `AreConditionsMetInternal`: `HasSocialPresenceEstimator()` then `GetRSPI()` vs min/max | `GetRequiredVisionModes` on `ConditionSocialPresence` |
| Reuse CloseFace’s existing `{Faces, Low}` | Request Faces High, People, or Hands from B |
| Estimator still does **not** schedule vision (A rule) | Subscribe estimator to FaceWorld poll every 60 ms **and** E2G |
| One JSON condition object, no per-tick allocations | Allocating Json in `AreConditionsMet` |
| Threshold in JSON (and optional later `CONSOLE_VAR`) | `ConditionConsoleVar` (int equality only — `conditionConsoleVar.cpp:46–48`) |

### Anti-patterns (do not)

1. New HLAI state `"SocialPresence"` / `"Receptive"`.
2. Low RSPI → activate QuietMode / ShutUpMode (those **feed** RSPI; loop + wrong semantics).
3. HLAI-only `InjectCustomBEICondition` Lambda instead of a clad type (not usable from Observing JSON; incomplete).
4. Invent `BEIConditionType` in C++ without clad (factory `FromString` fails).
5. Hand-edit generated `beiConditionTypes.h` — edit `.clad`, let the clad build emit the header.
6. Copy `ConditionSalientPointDetected`’s People vision request.
7. Skip BEI `Init` / `InitBEIPartial` lockstep — test framework will not compile.
8. FeatureType for socialize unless product asks (Exploring is gated; Socializing is not).
9. Restyle `socialPresence.js` again (A Phase 4b owns the veto line / receptive chip).
10. `vbuild` before Phase 6 is asked.

### Confidence / gaps

- **High:** transition list; QuietMode position; Emotion template; BEI Init call sites (only `InitDependent` + `InitBEIPartial`); clad alpha insert; Faces Low already period 1.
- **Medium:** default `min: 0.0` vs a small positive — product; start at 0.0 (veto-only).
- **[UNKNOWN until A on-robot]:** how negative RSPI stays after “be quiet” (PowerDecay). If it snaps back in <1 s, raise decay or the min after measuring, do not guess in C++ now.
- **Blocked on A:** `GetRSPI()`, live component, Face series actually moving.

---

## Phase 1 — BEI wiring (Mood clone)

### What to implement

Expose the Slice A RobotComponent on BEI the same way `MoodManager` is exposed.

**Copy Mood, append as last Init parameter** (SleepTracker is currently last — add `SocialPresenceEstimator*` after it) so existing positional arguments do not permute:

| File | Edit |
|---|---|
| `engine/aiComponent/behaviorComponent/behaviorExternalInterface/beiComponents_fwd.h` | `SocialPresenceEstimator,` before `Count` |
| `behaviorExternalInterface.h` | Forward-declare class; add param on `Init(`; `HasSocialPresenceEstimator()` / `GetSocialPresenceEstimator()` like L209–210 |
| `behaviorExternalInterface.cpp` | `InitDependent`: `robot->GetComponentPtr<SocialPresenceEstimator>()` into `Init(...)`; `Init` signature + pass-through; `CompArrayWrapper` ctor + `_array` `{BEIComponentID::SocialPresenceEstimator, BEIComponentWrapper(...)}` |
| `test/engine/behaviorComponent/testBehaviorFramework.cpp` | `InitBEIPartial` last `GetFromMap<SocialPresenceEstimator>(map, BEIComponentID::SocialPresenceEstimator)` |

`rg bei.Init\(` should still be only those two production/test sites.

Need `#include` of the estimator header in the BEI `.cpp` (not necessarily the `.h` if you only store a pointer via the wrapper).

### Verification

- [ ] `rg HasSocialPresenceEstimator engine/aiComponent/behaviorComponent/behaviorExternalInterface` hits h+cpp.
- [ ] `Init(` parameter count matches `InitBEIPartial` argument count (count commas).
- [ ] `BEIComponentID::Count` still last.

### Anti-pattern guards

- Do not read `Robot&` out of `BEIRobotInfo` in the condition.
- Do not add a second HeldInPalm-style **BCComponent** copy of the estimator.

---

## Phase 2 — Clad `BEIConditionType::SocialPresence`

### What to implement

In `clad/src/clad/types/behaviorComponent/beiConditionTypes.clad`, keep **alphabetized**:

```
  SettingsUpdatePending,
  SimpleMood,
```

becomes

```
  SettingsUpdatePending,
  SocialPresence,
  SimpleMood,
```

Do **not** hand-edit `generated/` headers. Clad build (part of `vbuild` / engine clad) emits `BEIConditionTypeFromString`.

### Verification

- [ ] Enum still alphabetized (S: SettingsUpdatePending, SocialPresence, SimpleMood, StuckOnEdge, …).
- [ ] No edits under `generated/`.

### Anti-pattern guards

- Name must match JSON `"conditionType": "SocialPresence"` exactly (factory string parse).
- Do not add `RobotSocialPresence` vs `SocialPresence` aliases.

---

## Phase 3 — `ConditionSocialPresence` (Emotion clone, no vision)

### What to implement

Copy `conditionEmotion.h` / `.cpp` to:

- `engine/aiComponent/beiConditions/conditions/conditionSocialPresence.h`
- `engine/aiComponent/beiConditions/conditions/conditionSocialPresence.cpp`

Edits from the template:

1. Class / guard / debug string `ConditionSocialPresence`.
2. **Drop** `emotion` JSON key and `EmotionType`.
3. Keep `min` / `max` / `value` parse (`conditionEmotion.cpp:62–71`).
4. `AreConditionsMetInternal`: if `!bei.HasSocialPresenceEstimator()` return **false**; else `value = bei.GetSocialPresenceEstimator().GetRSPI()`; then same range / `FLT_NEAR` logic (L52–57).
5. **Do not** override `GetRequiredVisionModes`.
6. Include `socialPresenceEstimator.h` and `behaviorExternalInterface.h` in the cpp.

Factory:

- `#include "engine/aiComponent/beiConditions/conditions/conditionSocialPresence.h"` (alpha with other condition includes).
- `case BEIConditionType::SocialPresence: condition = std::make_shared<ConditionSocialPresence>(config); break;` (alpha near RobotHeldInPalm / SettingsUpdatePending).

### Verification

- [ ] `rg GetRequiredVisionModes engine/aiComponent/beiConditions/conditions/conditionSocialPresence.cpp` empty.
- [ ] Factory switch has `BEIConditionType::SocialPresence`.
- [ ] JSON keys only `conditionType`, optional `min`/`max`/`value`.

### Anti-pattern guards

- Do not copy FaceKnown / SalientPointDetected vision sets.
- Do not call `GetPendingUserIntent` here.

---

## Phase 4 — Unit test (copy Emotion)

### What to implement

In `test/engine/behaviorComponent/testBeiConditions.cpp`, copy `TEST(BeiConditions, Emotion)` L272–368 to `TEST(BeiConditions, SocialPresence)`.

- JSON fixtures: `min`, `max`, `range`, `value` on `conditionType: SocialPresence` (no `emotion` key).
- `CreateBEI` + `InitBEIPartial` must include the new BEI slot (Phase 1).
- Drive RSPI with a test setter. **If Slice A did not add `SetRSPIForTest` / friend:** add `void DevSetRSPI(float)` on the estimator behind `ANKI_DEV_CHEATS` or a `UnitTestKey` (copy other components’ test hooks) — **do not** make `_rspi` public.
- Assert: below `min` → false; at/above `min` → true; missing component → false.

`testBehaviorHighLevelAI.cpp` does **not** evaluate CloseFace — do not pretend it covers this.

### Verification

- [ ] New TEST compiles with the framework’s `InitBEIPartial`.
- [ ] Run that gtest when a host test binary is available; if only VICOS build is used, still land the TEST for the next host run.

### Anti-pattern guards

- Do not require a robot or WebViz in the unit test.

---

## Phase 5 — HLAI JSON (all socialize doors except F)

### What to implement

Edit **only** `highLevelAI.json`. Add the same operand to each Compound `and` listed in Phase 0 table A, C, D, E:

```json
{
  "conditionType": "SocialPresence",
  "min": 0.0
}
```

**C** (canonical — Observing → Socializing, L331–344 today):

```json
"condition": {
  "conditionType": "Compound",
  "and": [
    { "customCondition": "CloseFaceForSocializing" },
    { "conditionType": "Emotion", "emotion": "Stimulated", "min": 0.5 },
    { "conditionType": "SocialPresence", "min": 0.0 }
  ]
}
```

Repeat for **A** (stim 0.7 + not TooDark) and **D** (stim 0.7). For **E**, wrap CloseFace in a Compound `and` with SocialPresence (E is currently a bare `customCondition`).

Leave **F** as `TrueCondition`. Do not touch `modeSelector.json`, `quietMode.json`, `observing.json`.

### Verification

- [ ] `rg SocialPresence resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree/highLevelAI.json` hits A, C, D, E only.
- [ ] `rg SocialPresence resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree/quietMode` empty.
- [ ] `rg SocialPresence resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree/highLevelDelegates/observing` empty.
- [ ] No Compound nested deeper than 2.

### Anti-pattern guards

- Do not make Socializing interrupting again (JSON comment: face games must finish).
- Do not add FeatureGate on socialize.

---

## Phase 6 — Spec, catalog, gated flash

### What to implement

1. `docs/mapping/BEHAVIOR-GENERATOR-SPEC.md` §8: add `SocialPresence` to the enum dump (L244) and a per-type row: keys `min`/`max`/`value`, notes “RSPI ∈ [-1,1] from SocialPresenceEstimator; no vision”.
2. Optional: `cvcatalog/vars/engine-explore-hlai.json` only if you add a `CONSOLE_VAR` threshold; v1 threshold is JSON `min` — skip extra CVAR unless A’s graph shows you need live tuning without scp JSON.
3. **Do not** restyle Social Presence WebViz (A Phase 4b). Confirm the dashed **y = 0** line still matches JSON `min: 0.0`. Confirm BehaviorConds / FreePlay gates list the new factor when HLAI is in Observing. If B later raises `min`, send the new value as C++ `vetoThreshold` (A already reads it) — do not hardcode a second line in JS.

**Flash when asked:** clad + engine (condition + JSON). On robot:

| Check | Expect |
|---|---|
| Face + stim, no “be quiet” | Socializing still reachable (RSPI ≥ 0 after Face event) |
| “Hey Vector, be quiet” then show face | QuietMode runs (unchanged); when quiet ends, socialize **does not** immediately fire while RSPI still negative |
| Tab Social Presence | Quiet series down, RSPI &lt; 0 during quiet |
| FreePlay / BehaviorConds | `SocialPresence` factor true/false; CloseFace still present |
| Viz / vision schedule | No new People/Hands request from this condition |
| CPU | Estimator still 10 Hz combiner; condition is a float read |

If socialize never fires after A+B: log `GetRSPI()` vs 0 while CloseFace is true — likely Face E2G vs FaceWorld mismatch; **do not** drop the veto; fix A’s Face latch or lower min after evidence.

### Verification (code)

- [ ] `rg GetRequiredVisionModes engine/aiComponent/beiConditions/conditions/conditionSocialPresence.cpp` empty.
- [ ] `rg QuietMode engine/receptiveSocialPresenceEstimator` empty.
- [ ] Generator spec §8 row exists.
- [ ] HLAI JSON four doors; F untouched.

---

## Suggested `/do` chunking

| Chunk | Phases | Notes |
|---|---|---|
| 1 | 1–3 | BEI + clad + condition + factory (needs A’s getter) |
| 2 | 4 | Unit test |
| 3 | 5 | JSON only — scp-able after engine knows the type |
| 4 | 6 | Spec + flash when asked |

If clad generation is painful, land 1–3 in one `vbuild` with JSON, then scp JSON for min tweaks without rebuild.

---

## Completeness checklist (definition of done)

- [ ] Component is source of truth (`GetRSPI`); condition is a wrapper (`beiConditions.md`).
- [ ] Any JSON behavior can write `"conditionType": "SocialPresence"` (clad + factory), not only HLAI.
- [ ] All HLAI **entry** paths to Socializing share the veto; drive-off **exit F** stays True.
- [ ] Quiet/ShutUp/Sleep still claimed where they are today; they lower RSPI (A) instead of B re-entering those modes.
- [ ] CloseFace + Stim unchanged (occupancy + arousal).
- [ ] Tests for min/max; BEI Init arity locked.
- [ ] Spec §8 updated.
- [ ] No extra vision; no second WebViz tab.
- [ ] Observing internals **not** retuned in v1 (optional later if the graph shows HeadOnly vs look-at-faces should follow RSPI).
