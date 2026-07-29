# Production behavior tree (normal operation)

**Path:** `docs/mapping/ENGINE-BEHAVIOR-TREE.md`  
**Mapped:** 2026-07-28 · **Confidence:** high  
**Upstream docs:** `docs/architecture/behaviors.md`, `docs/architecture/behaviors_intents.md`, `docs/architecture/beiConditions.md`  
**Related mapping:** `docs/mapping/ENGINE-ROBOT-TICK.md`, `engine/aiComponent/behaviorComponent/README.md`

How Vector decides what to do in **normal freeplay** — the JSON boot chain, structural C++ classes, HighLevelAI state machine, interrupts, and intents. Leaf behaviors are not enumerated.

---

## Boot path (JSON chain)

Config load: `RobotDataLoader` → `config/engine/behaviorComponent/behaviors/**` + `victor_behavior_config.json` (`engine/robotDataLoader.cpp` ~L444 / ~L964).  
Stack root: `BehaviorsBootLoader` reads boot keys; `BehaviorSystemManager` plants `GetBootBehavior()` at stack bottom (`behaviorsBootLoader.cpp` ~L68, `behaviorSystemManager.cpp` ~L82).

```
resources/config/engine/behaviorComponent/victor_behavior_config.json
  normalBaseBehavior → "InitNormalOperation"
  (also: onboardingBehavior, postOnboardingBehavior, devBaseBehavior)
```

| Step | BehaviorID | Class (JSON) | Role |
|---|---|---|---|
| 1 | `InitNormalOperation` | `DispatcherStrictPriorityWithCooldown` | Once: `NormalWakeUp` (`cooldown_s: -1`); then forever `ModeSelector` |
| 2 | `ModeSelector` | `DispatcherStrictPriority` | Modes above freeplay; **last** entry is always-activatable `SleepCycle` |
| 3 | `SleepCycle` | `SleepCycle` (C++) | Sleep/wake; **awake** path `delegateID` → `CoordinateInHabitat` |
| 4 | `CoordinateInHabitat` | pass-through coordinator | Suppresses cube/explore games in habitat; delegates `HabitatMutedDispatcher` |
| 5 | `HabitatMutedDispatcher` | `DispatcherStrictPriority` | Habitat-only VC/cube mutes; then `CoordinateGlobalInterrupts` |
| 6 | `CoordinateGlobalInterrupts` | pass-through | Cross-interrupt suppression; → `CoordinateWhileHeldInPalm` |
| 7 | `CoordinateWhileHeldInPalm` | pass-through | Suppress while in palm; → `CoordinateWhileInAir` |
| 8 | `CoordinateWhileInAir` | pass-through | → `GlobalInterruptions` |
| 9 | `GlobalInterruptions` | `DispatcherStrictPriority` | Physical/voice/utility interrupts; **last** = `HighLevelAI` |
| 10 | `HighLevelAI` | `HighLevelAI` / `InternalStatesBehavior` | Autonomous freeplay state machine |

Evidence files:

- `resources/config/engine/behaviorComponent/victor_behavior_config.json`
- `…/victorBehaviorTree/initNormalOperation.json`
- `…/modeSelector.json` — power-off, Alexa, emergency, SDK override, quiet/shut-up, **`SleepCycle`**
- `…/highLevelDelegates/sleeping/sleepCycle.json` — `"delegateID": "CoordinateInHabitat"`
- `…/coordinateInHabitat.json` → `habitatMutedDispatcher.json` → `coordinateGlobalInterrupts.json` → `coordinateWhileHeldInPalm.json` → `coordinateWhileInAir.json` → `globalInterruptions.json` → `highLevelAI.json`

`NormalWakeUp` (`normalWakeUp.json`): `AnimSequence` / `InitialWakeUp`, skipped on night maintenance reboot.

---

## C++ classes that implement structure (not leaves)

| Class | Path | Role |
|---|---|---|
| `ICozmoBehavior` | `behaviors/iCozmoBehavior.*` | Base; JSON `respondToUserIntents` → `ConditionUserIntentPending` (~L312); `associatedActiveFeature`, timers, post-behavior suggestions |
| `IBehaviorDispatcher` | `behaviors/dispatch/iBehaviorDispatcher.*` | Common dispatcher: list of child behaviors; `interruptActiveBehavior` |
| `BehaviorDispatcherStrictPriority` | `…/behaviorDispatcherStrictPriority.*` | First child that `WantsToBeActivated` wins (ModeSelector, GlobalInterruptions, Observing, …) |
| `BehaviorDispatcherStrictPriorityWithCooldown` | `…WithCooldown.*` | Same + per-child cooldowns (InitNormalOperation, ObservingInternal, Exploring) |
| `BehaviorDispatcherQueue` | `…Queue.*` | Run children in order (Socialize, PlayWithCube) |
| `BehaviorDispatcherRandom` | `…Random.*` | Weighted random + cooldowns |
| `BehaviorDispatcherScoring` | `…Scoring.*` | Highest score wins |
| `BehaviorDispatcherPassThrough` | `…PassThrough.*` | Exactly one `delegateID`; subclass updates only (coordinators) |
| `InternalStatesBehavior` | `behaviors/internalStatesBehavior.*` | JSON state machine: states, interrupting / non-interrupting / exit transitions, get-in behaviors, timer conditions |
| `BehaviorHighLevelAI` | `behaviors/behaviorHighLevelAI.*` | Subclass of InternalStates; custom BEI conditions + cooldowns + post-behavior resume |
| `BehaviorSleepCycle` | `behaviors/sleeping/behaviorSleepCycle.*` | Always wants activate; awake → `delegateID`, else sleep states |
| Coordinators | `behaviors/coordinators/*` | Pass-through wrappers that suppress sibling reactions under conditions |
| `BehaviorsBootLoader` | `behaviorComponent/behaviorsBootLoader.*` | Chooses base BehaviorID from config |
| `UserIntentComponent` | `behaviorComponent/userIntentComponent.*` | Cloud/app → user intent pending/active; map from `user_intent_map.json` |

Transition kinds inside `InternalStatesBehavior` (`internalStatesBehavior.h` ~L101–111):

- **Interrupting** — can cancel current state mid-activity  
- **NonInterrupting** — only when current delegate accepts gentle interrupt / idle  
- **Exit** — only after delegated behavior ends  

---

## Tree shape (major nodes only)

```
InitNormalOperation
├─ NormalWakeUp                          [once]
└─ ModeSelector                          [strict priority]
   ├─ SingletonPoweringRobotOff
   ├─ AlexaSignInOut / Alexa
   ├─ EmergencyMode
   ├─ SDKOverrideAll
   ├─ ShutUpMode / QuietMode
   └─ SleepCycle                         [always WantsToBeActivated]
      │  (asleep: GoToSleep / Asleep / wake paths — not expanded)
      └─ [awake] CoordinateInHabitat
         └─ HabitatMutedDispatcher
            ├─ habitat-only trick / muted VC / held-cube cant-do-that
            └─ CoordinateGlobalInterrupts
               └─ CoordinateWhileHeldInPalm
                  └─ CoordinateWhileInAir
                     └─ GlobalInterruptions   [strict priority, interruptActive]
                        ├─ MandatoryPhysicalReactions   (cliff, on-back/face/side, stuck, …)
                        ├─ SDKDefault / SDKLock
                        ├─ TriggerWordDetected          (ReactToVoiceCommand)
                        ├─ WallTime / WallDate / Timer coordinators
                        ├─ WeatherResponses / TakeAPhotoCoordinator
                        ├─ ReactToRobotShaken / ReactToTouchPetting
                        ├─ BasicVoiceCommands             (greetings + movement)
                        ├─ ReactToObstacle
                        ├─ InterruptingVoiceReactions     (tricks, games, come-here, meet, …)
                        ├─ ChangeEyeColor
                        ├─ ReactToUnclaimedIntent
                        ├─ HeldInPalmDispatcher / WhileInAirDispatcher
                        ├─ PetDetection / ReactToPutDown / ReactToDarkness
                        ├─ GreetAfterLongTime
                        ├─ DanceToTheBeatCoordinator
                        ├─ StayOnChargerUntilCharged / ReactToSoundAwake
                        ├─ ConfirmHabitat
                        └─ HighLevelAI                  [fallback; always wants]
                           states (highLevelAI.json):
                           ├─ ObservingOnCharger / ObservingOnChargerRecentlyPlaced
                           ├─ ObservingDriveOffCharger / DriveOffChargerIntoSocializing
                           ├─ Observing  → Socializing | PlayingWithCube | Exploring
                           ├─ Exploring / ExploringVoiceCommand (intent explore_start)
                           ├─ InvestigateHeldCube
                           ├─ Socializing  (Socialize → queue of face interactions)
                           └─ PlayingWithCube (PlayWithCube → find/interact/putdown)
```

### HighLevelAI states (summary)

| State | Delegate behavior | Notes |
|---|---|---|
| `ObservingOnCharger` | `ObservingOnCharger` | **initialState** |
| `Observing` | `Observing` | Off-charger idle; face contact / motion / gaze |
| `Exploring` | `Exploring` | Feature-gated; stim / boredom timers |
| `ExploringVoiceCommand` | `ExploringVoiceCommand` | `activateIntent: explore_start` |
| `Socializing` | `Socialize` | Queue; resets Socializing timer |
| `PlayingWithCube` | `PlayWithCube` | Queue; cube cooldown params |
| `InvestigateHeldCube` | `InvestigateHeldCube` | User holding cube + feature gate |
| Drive-off variants | `ObservingDriveOffCharger`, `DriveOffChargerIntoSocializing` | Leave charger into play/social |

Custom conditions injected by `BehaviorHighLevelAI::CreateCustomConditions()`: `CloseFaceForSocializing`, `CloseCubeForPlaying`, `WantsToLeaveChargerForPlay`, `ExploringCooldownMet`, `ChargerLocated` (plus timer conditions `BoredOfObserving` / `BoredOfExploring` / `NoLongerRecentlyPlaced` from JSON).

Cooldowns (JSON): socialize known face 1800 s, play cube 600 s, play-from-charger 2400 s, max face distance 1000 mm.  
`postBehaviorSuggestionResumeOverrides`: e.g. suggestion `Socialize` → state `Socializing`.

---

## How interrupts / intents cut in

### Priority layers (outside HLAI)

1. **ModeSelector** — emergency, Alexa, quiet modes steal the whole tree above SleepCycle.  
2. **SleepCycle** — can leave awake delegate for sleep; always wakes on SDK / timer ring / voice (`alwaysWakeReasons`).  
3. **GlobalInterruptions** — strict priority **above** HLAI: cliffs/physical first, then trigger word, utilities, voice packs, then HLAI.  
4. **Coordinators** — do not choose alternate branches; they **suppress** activatable scope of peers (prox obstacle during cube games, touch during MeetVictor, exploring in habitat, etc.).

### Trigger word → intent

- `TriggerWordDetected` (`ReactToVoiceCommand`) sits high in GlobalInterruptions.  
- Cloud result → `UserIntentComponent` maps via `user_intent_map.json` → **pending** user intent (must be claimed in a few engine ticks).  
- Claim paths:
  - JSON `"respondToUserIntents": […]` on any `ICozmoBehavior` (auto-activate intent on activation).  
  - BEI condition `UserIntentPending` (e.g. HLAI → `ExploringVoiceCommand` on `explore_start`).  
  - `AddWaitForUserIntent` in C++.  
- Packs under GlobalInterruptions:
  - **BasicVoiceCommands** — hello/goodbye/love/movement/seasonal; suggests post-behavior `Socialize`.  
  - **InterruptingVoiceReactions** — volume, tricks, cube games, come-here, meet Victor, messaging, knowledge graph, dance VC, …  
- Unhandled: `ReactToUnclaimedIntent` / unmatched → “huh” path (`docs/architecture/behaviors_intents.md`).

### Inside HLAI

Interrupting transitions fire while a state runs (e.g. close face + stim → Socializing). Non-interrupting transitions wait for a gentle moment (e.g. Observing → Exploring). Exit transitions fire when the state’s main behavior ends.

---

## Freeplay vs reactions vs feature verticals

| Layer | Where | Nature |
|---|---|---|
| **Freeplay / HLAI** | `highLevelAI.json` + `highLevelDelegates/**` | Autonomous choice among observing / social / cube / explore |
| **Global reactions** | `reactions/**`, top of `globalInterruptions.json` | Safety + interruptible social/sensor reactions |
| **Voice / app features** | `InterruptingVoiceReactions`, `BasicVoiceCommands`, `timer/`, `weather/`, `takeAPhoto/`, `danceToTheBeat/`, etc. | Intent-driven verticals that **preempt** HLAI |
| **Modes** | ModeSelector children | Quiet, emergency, Alexa, SDK full override |
| **Onboarding / PR / dev** | `onboarding/`, `prDemo/`, `devBehaviors/` | Alternate boot roots, not normal freeplay |

### Freeplay C++ under `behaviors/freeplay/`

Small set of **leaf game** implementations — **not** the freeplay root:

- `freeplay/userInteractive/` — FistBump, Keepaway, InspectCube, PounceWithProx, PuzzleMaze  
- `freeplay/putDownDispatch/` — LookForFaceAndCube  

Most freeplay structure is **JSON dispatchers** under `highLevelDelegates/` with C++ in sibling folders: `observing/`, `exploring/`, `basicCubeInteractions/`, `basicWorldInteractions/`, `simpleFaceBehaviors/`, etc. Cozmo-era name “freeplay” ≈ HLAI + those delegates (`behaviorHighLevelAI.h` comment).

### Major `victorBehaviorTree/` folders (one-liners)

| Entry | What it is |
|---|---|
| `initNormalOperation.json`, `modeSelector.json`, `globalInterruptions.json`, `highLevelAI.json` | Boot spine |
| `coordinate*.json`, `habitatMutedDispatcher.json` | Pass-through coordination chain |
| `highLevelDelegates/` | HLAI state bodies: observing, exploring, socialize, cube, sleep, palm, home, VC wrappers, … |
| `reactions/` | Physical + social reactions + voice reaction packs |
| `alexa/`, `quietMode/`, `emergencyMode/`, `sdkBehaviors/` | ModeSelector verticals |
| `onboarding/`, `prDemo/`, `devBehaviors/` (sibling tree) | Non-production boot |
| `timer/`, `weather/`, `takeAPhoto/`, `danceToTheBeat/`, `blackjack/`, `clock/`, `date/` | Feature coordinators often linked from GlobalInterruptions or voice packs |
| `movement/`, `volume/`, `character/`, `seasonal/` | Small intent-driven leaves |
| `driveOffCharger/` | Shared leave-charger helpers used by HLAI + Observing |

---

## Rebuild notes

- `CHANGES.md` has **no** behavior-tree-specific entries observed for HLAI / freeplay.  
- Tree shape matches stock Anki 1.6 architecture docs; treat upstream `docs/architecture/behaviors*.md` as primary for stack semantics.  
- [UNKNOWN] Whether rebuild JSON under `victorBehaviorTree/` diverges from stock file-for-file (no stock tree in-repo to diff).

---

## Open questions

- [UNKNOWN] Exact SleepCycle tick path when transitioning awake↔sleep (which pre-sleep delegates, DAS wake reasons in code) — not fully stepped here.  
- [UNKNOWN] Full list of `UserIntentTag`s claimed only inside HLAI vs only in GlobalInterruptions (unit tests: `testBehaviorHighLevelAI.cpp`, `completedUserIntents.json`).  
- [UNKNOWN] Runtime plot of activatable scope (`tools/ai/plotBehaviorTree.sh` needs unit-test artifacts — not run in this phase).  
- [UNKNOWN] How `postOnboardingBehavior: ModeSelector` differs from InitNormalOperation’s long-term ModeSelector (skips NormalWakeUp only?).

---

## Key file index

| Path | Why |
|---|---|
| `resources/config/engine/behaviorComponent/victor_behavior_config.json` | Boot keys |
| `…/behaviors/victorBehaviorTree/initNormalOperation.json` | Root after boot |
| `…/modeSelector.json` | Mode vs freeplay |
| `…/highLevelDelegates/sleeping/sleepCycle.json` | Awake delegate into coordinator chain |
| `…/globalInterruptions.json` | Interrupt list ending in HLAI |
| `…/highLevelAI.json` | Freeplay state machine |
| `engine/aiComponent/behaviorComponent/behaviors/behaviorHighLevelAI.*` | HLAI C++ |
| `engine/aiComponent/behaviorComponent/behaviors/internalStatesBehavior.*` | State machine engine |
| `engine/aiComponent/behaviorComponent/behaviors/dispatch/*` | Dispatcher family |
| `engine/aiComponent/behaviorComponent/behaviors/coordinators/*` | Suppression wrappers |
| `resources/config/engine/behaviorComponent/user_intent_map.json` | Cloud → user intent |
| `docs/architecture/behaviors.md`, `behaviors_intents.md` | Upstream semantics |
