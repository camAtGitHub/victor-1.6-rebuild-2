# Observing freeplay branch + voice / user intents (L3)

**Path:** `docs/mapping/ENGINE-OBSERVING-AND-INTENTS.md`  
**Mapped:** 2026-07-28 · **Depth:** L3 · **Confidence:** high  
**Parent map:** [`ENGINE-BEHAVIOR-TREE.md`](ENGINE-BEHAVIOR-TREE.md)  
**Upstream:** [`docs/architecture/behaviors_intents.md`](../architecture/behaviors_intents.md), `behaviors.md`, `beiConditions.md`

Two freeplay slices: (A) **Observing** as the HLAI idle hub, (B) **wake-word → pending intent → claim / unclaimed**. Leaves and full intent catalogs are not enumerated.

---

## A. Observing freeplay branch

### Where it sits

`HighLevelAI` (`highLevelAI.json`, `HighLevelAI` / `InternalStatesBehavior`) is last under `GlobalInterruptions`. **`initialState`: `ObservingOnCharger`.** Off-charger idle: **`Observing`**. Config bodies live under:

`resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree/highLevelDelegates/observing/`

| Entry | Class | Role |
|---|---|---|
| `observingOnCharger.json` | `DispatcherStrictPriorityWithCooldown` | On-charger idle body |
| `observingOnChargerIdle.json` | `ObservingWithoutTurn` | Timer-scaled charger idle motions |
| `observingOnChargerEyeContact.json` | eye-contact path | Eye contact while docked |
| `observingOnChargerGetIn/Out.json` | anim helpers | HLAI `getInBehavior` on some states |
| `observing.json` | `DispatcherStrictPriority` | Off-charger idle body |
| `observingDriveOffCharger.json` | `DispatcherQueue` | Leave charger + brief look-around |
| `trackingEyeContact.json` | `DispatcherQueue` | Eye contact → interact → performance |
| `observingLookAtFaces.json` | `ObservingLookAtFaces` | Stim-gated face looking (`ObservingFindFaces`) |
| `observingOffChargerHeadOnly.json` | `ObservingWithoutTurn` | Fallback head-only idle |
| `reactToMotion.json` | `ReactToMotion` | Motion reaction (charger wrap too) |

### Dispatcher structure

**`ObservingOnCharger`** — strict priority + cooldown, `interruptActiveBehavior`, `linkScope`:

1. `WiggleBackOntoChargerFromPlatform` (10 s)  
2. `ObservingOnChargerEyeContact` (15 s)  
3. `ReactToMotionOnCharger` — anonymous pass-through → `ReactToMotion` if `OnCharger`  
4. `ObservingOnChargerIdle` (0) — fallback; `behaviorTimer: ObservingOnCharger`; motion periods slow 0.5 s → 30 s  

**`Observing`** — strict priority, **`requireGentleInterruption: true`** (non-interrupting HLAI transitions wait for calm), feature `Observing`:

1. `DriveOffChargerRandomly` — net if still on charger in off-charger state  
2. `PossibleUnintentionalPerformance`  
3. **`ObservingInternal`** (anonymous `DispatcherStrictPriorityWithCooldown`):

| # | Child | Cooldown |
|---:|---|---|
| 1 | `TrackingEyeContact` | 15 s |
| 2 | `ReactToGazeDirection` | 15 s |
| 3 | `ObservingLookAtFaces` | 30 s ± 0.5 random |
| 4 | `ReactToMotion` | 0 |
| 5 | `ObservingOffChargerHeadOnly` | 0 fallback |

`TrackingEyeContact` queue: `ObservingEyeContact` → `InteractWithFaces` → `PossibleIntentionalPerformance` (`EyeContact`).  
`ObservingLookAtFaces`: `OnTreads` + `Stimulated >= 0.1`.

### HLAI: Observing ↔ Socialize / Exploring

From `highLevelAI.json` `transitionDefinitions` (interrupting / non-interrupting / exit — parent doc):

**From `ObservingOnCharger`:** interrupt → `Observing` (off platform), `DriveOffChargerIntoSocializing` (close face + Stim≥0.7 + not dark), `InvestigateHeldCube` (held cube + feature); non-interrupt → `ObservingDriveOffCharger` (`BoredOfObserving` **1100 s** + HighStim, or `WantsToLeaveChargerForPlay` + HighStim); exit → `Observing` if not on charger.

**From `Observing` (core freeplay fork):**

| Kind | To | Condition |
|---|---|---|
| interrupting | `Socializing` | `CloseFaceForSocializing` + Stim ≥ 0.5 |
| interrupting | `PlayingWithCube` | `CloseCubeForPlaying` + HighStim + not habitat |
| non-interrupting | **`Exploring`** | feature `Exploring` + `ExploringCooldownMet` + not habitat |

**Socialize/cube cut mid-activity; Exploring waits for a gentle interrupt.** Habitat blocks cube + explore.

**Returns:** Socializing / PlayingWithCube / Exploring / … often **exit → Observing** (`TrueCondition`). Exploring → Observing on put-down, LowStim, or `BoredOfExploring` (600 s). Any of those → `ObservingOnChargerRecentlyPlaced` on `OnCharger` (`PlacedOnCharger`). Drive-off exit prefers Socializing or PlayingWithCube else Observing; `DriveOffChargerIntoSocializing` always → Socializing.

**Voice explore (only HLAI user-intent transition):** `from: "*"` interrupting → `ExploringVoiceCommand` when `UserIntentPending` `{explore_start}`; state `activateIntent: explore_start`. Most voice is **above** HLAI.

Timers/cooldowns (JSON + `BehaviorHighLevelAI` customs): BoredOfObserving 1100 s, BoredOfExploring 600 s, NoLongerRecentlyPlaced 150 s; socialize face 1800 s, cube 600 s, play-from-charger 2400 s, max face 1000 mm. Resume overrides: `Socialize`/`PlayWithCube`/`Nothing` → Socializing/PlayingWithCube/Observing.

---

## B. Voice / user intent path

Upstream: **`docs/architecture/behaviors_intents.md`**.

### 1. Trigger word → `ReactToVoiceCommand`

`globalInterruptions.json` (strict priority, interrupt active) order:

```
… → TriggerWordDetected → … → BasicVoiceCommands → ReactToObstacle
  → InterruptingVoiceReactions → ChangeEyeColor → ReactToUnclaimedIntent → …
  → HighLevelAI
```

`triggerWordDetected.json`: class **`ReactToVoiceCommand`**, ID `TriggerWordDetected`; ear-cons; `behaviorOnIntent: ReactToTriggerDirectionAwake`.  
`WantsToBeActivated` ← `IsTriggerWordPending()`; on activate **`ClearPendingTriggerWord()`** (`behaviorReactToVoiceCommand.cpp` ~L364–410). Trigger pending timeout: **`kMaxTicksToClear = 3`** (`userIntentComponent.cpp` ~L55).

After listen (`TransitionToIntentReceived` ~L963+):

| Status | Effect |
|---|---|
| `IntentHeard` | Exit; **user intent stays pending** for tree claim |
| `IntentUnknown` | Mood `NoValidVoiceIntent`; delegate **`IntentUnmatched`** |
| `SilenceTimeout` | Delegate `TriggerWordWithoutIntent` |
| Error | Stream-failure / wifi-cloud attention transfer |

Valid intents are **not** finished inside ReactToVoiceCommand; siblings (or HLAI) claim them after it ends.

### 2. `user_intent_map.json` shape (sample)

`resources/config/engine/behaviorComponent/user_intent_map.json`: array `user_intent_map` + `"unmatched_intent": "unmatched_intent"`.

```json
{ "cloud_intent": "intent_greeting_hello", "user_intent": "greeting_hello" }
```

```json
{
  "cloud_intent": "intent_clock_settimer_extend",
  "app_intent": "intent_clock_settimer",
  "user_intent": "set_timer",
  "cloud_substitutions": { "timer_duration": "time_s" },
  "cloud_numerics": ["timer_duration"]
}
```

```json
{
  "user_intent": "explore_start",
  "cloud_intent": "intent_explore_start",
  "app_intent": "explore_start",
  "feature_gate": "Exploring"
}
```

Cloud params are strings; substitutions/numerics map into CLAD (`userIntent.clad`). Unmapped cloud → `unmatched_intent` tag.

### 3. `UserIntentComponent` pending / active

`userIntentComponent.h`: at most **one pending** and **one active** user intent (no queue; new pending overwrites). Trigger word is separate from user intents.

| Role | API |
|---|---|
| Trigger | `IsTriggerWordPending` / `ClearPendingTriggerWord` / `SetTriggerWordPending` |
| Pending | `IsAnyUserIntentPending` / `IsUserIntentPending` / `SetUserIntentPending*` |
| Active | `ActivateUserIntent` / `IsUserIntentActive` / `GetActiveUserIntent` / `DeactivateUserIntent` |
| Drop / unclaimed | `DropUserIntent` / `WasUserIntentUnclaimed` / `ResetUserIntentUnclaimed` |
| Cloud | `SetIntentPendingFromCloudJSONValue`, `OnCloudData` via `UserIntentMap` |

Pending timeout **3 ticks** → DAS drop, `DropAnyUserIntent()`, **`_wasIntentUnclaimed = true`** (~L848–872).

### 4. Claiming an intent

**JSON:** `"respondToUserIntents": [{ "type": "greeting_hello" }]` → `ConditionUserIntentPending` on wants-to-activate (`iCozmoBehavior.cpp` ~L312–323); on activate auto **`SmartActivateUserIntent`** (~L827–830); auto-deactivate on behavior end (~L1600). Example: `reactions/reactToHello.json`.

**BEI (state machines):** HLAI `UserIntentPending` for `explore_start`.  
**C++:** `AddWaitForUserIntent`; e.g. `BehaviorDriveToFace` hardcodes `imperative_come` for `ComeHereVoiceCommand`.

### 5. BasicVoiceCommands / InterruptingVoiceReactions

**`BasicVoiceCommands`** (`reactions/basicVoiceCommands.json`): strict priority, `linkScope`, interrupt active, **`postBehaviorSuggestion: Socialize`**. Children: Hello/GoodMorning/GoodBye/Abuse/Apology/Love; movement F/B/L/R/around; seasonal. Goodnight is **not** here (SleepCycle). Placed **before** `ReactToObstacle` so simple VCs ignore obstacles.

**`InterruptingVoiceReactions`** (`reactions/interruptingVoiceReactions.json`): Volume, eye color, cube/trick/game VCs, come-here/look-at-me, messaging, knowledge graph, MeetVictor, PowerRobotOff, affirmative/negative (after blackjack), DanceToTheBeat VC, etc.

Both packs sit **above** `ReactToUnclaimedIntent` and **HighLevelAI** — claimed intents preempt Observing without HLAI transitions.

### 6. `ReactToUnclaimedIntent` vs unmatched

- **`ReactToUnclaimedIntent`**: `WasUserIntentUnclaimed()` → play `ReactToUnclaimedIntent` / `…InAir` anim (`behaviorReactToUnclaimedIntent.*`). Timeout: mapped intent, no claimer in scope.  
- **`IntentUnmatched`**: during ReactToVoiceCommand when cloud unknown/unmatched — `AttentionTransferIfNeeded` / “huh” path.

Do not conflate: (1) cloud unknown → IntentUnmatched in trigger reaction; (2) pending timeout → ReactToUnclaimedIntent after GlobalInterruptions re-eval.

### Sequences (compressed)

```
Observing → Socialize/Explore:
  HLAI Observing → ObservingInternal (eye/faces/motion/idle)
  → interrupt close face+stim → Socializing
  → gentle Exploring feature+cooldown → Exploring
  → exit back → Observing

Voice “hello”:
  TriggerWordDetected → clear trigger; listen
  → map → greeting_hello pending → IntentHeard exit
  → BasicVoiceCommands/ReactToHello (respondToUserIntents)
  → SmartActivate → anim → postBehaviorSuggestion Socialize

Voice “explore”:
  explore_start pending → (not Basic/Interrupting)
  → HLAI * → ExploringVoiceCommand (activateIntent)

Unclaimed:
  pending > 3 ticks → Drop + flag → ReactToUnclaimedIntent anim
```

---

## Key files

| Path | Why |
|---|---|
| `…/highLevelAI.json` | Observing/Explore/Social transitions |
| `…/highLevelDelegates/observing/*` | Observing bodies |
| `…/globalInterruptions.json` | Trigger / VC packs / unclaimed / HLAI order |
| `…/triggerWordDetected.json` + `behaviorReactToVoiceCommand.*` | Wake-word FSM |
| `…/reactions/basicVoiceCommands.json` | Simple VC pack |
| `…/reactions/interruptingVoiceReactions.json` | Feature VC pack |
| `…/reactToUnclaimedIntent.json` + `behaviorReactToUnclaimedIntent.*` | Timeout reaction |
| `…/intentUnmatched.json` | Unknown during listen |
| `user_intent_map.json` | Cloud/app → user intent |
| `userIntentComponent.h/.cpp` | Pending/active/timeout |
| `iCozmoBehavior.cpp` | `respondToUserIntents` claim |

## Open questions

- [UNKNOWN] Full split of which `UserIntentTag`s are claimed only in GlobalInterruptions vs HLAI (`testBehaviorHighLevelAI.cpp`, `completedUserIntents.json`).  
- [UNKNOWN] Exact ticks from ReactToVoiceCommand exit until BasicVoiceCommands activates on pending intent.  
- [UNKNOWN] Rebuild vs stock Anki 1.6 JSON file-for-file (no stock tree in-repo).
