# Behavior generator spec

**Path:** `docs/mapping/BEHAVIOR-GENERATOR-SPEC.md`  
**Mapped:** 2026-09-13   **Confidence:** high (JSON keys + factory + conditions from code)  
**Audience:** a behavior-generator tool (and a human writing the same JSON)  
**Upstream:** `docs/architecture/behaviors.md`, `behaviors_intents.md`, `beiConditions.md`, `actions.md`, `animations.md`  
**Related:** `ENGINE-BEHAVIOR-TREE.md`, `ENGINE-OBSERVING-AND-INTENTS.md`, `ENGINE-PATH-PLANNING.md`

This is the contract for **creating new Vector behaviors** that the engine will load. Field names, types, and enum values below are taken from this tree (`ICozmoBehavior`, `BEIConditionFactory`, dispatcher classes, `GetBehaviorJsonKeys`, CLAD enums). Do not invent keys.

A machine-readable catalog sits in **§18** (copy the fenced JSON). Human rules and examples are §§1–17.

---

## 0. What a generator must emit

A new behavior is **one JSON instance file** (almost always) and **optionally** a new C++ class.

| Track | When | Generator outputs | Then |
|---|---|---|---|
| **A. JSON instance of an existing `BehaviorClass`** | Play an anim, dispatch, wait, come-here, greet, etc. | One `.json` under `resources/config/engine/behaviorComponent/behaviors/` | `./tools/ai/generateBehaviorCode.py` → restart engine |
| **B. New C++ `BehaviorClass`** | Logic JSON classes cannot express (custom state machine, sensors, unique action sequence) | `.h` + `.cpp` via `createNewBehavior.py` **plus** a JSON instance | same codegen + compile + restart |

Stock Anki’s rule (`behaviors.md`): if you want the robot to do something from engine, **99% of the time you use a behavior**. New personality is usually Track A: `AnimSequence` / dispatcher / existing leaf class + a tree hook.

**No hot reload.** `RobotDataLoader` loads behavior JSON at engine start. `BehaviorID` / `BehaviorClass` CLAD enums are generated, then compiled.

---

## 1. Runtime model (generator must respect)

```
JSON file  →  BehaviorFactory  →  ICozmoBehavior instance in BehaviorContainer
BootLoader plants one base BehaviorID on the stack (normal: InitNormalOperation)
Dispatcher children that WantsToBeActivated() may be delegated to
Only the TOP of the stack may DelegateIfInControl() to an action or child behavior
When the top cancels / finishes, the parent gets control back
At least one behavior is always active (Wait is the no-op)
```

**IDs vs classes**

| Term | CLAD | Meaning | Example |
|---|---|---|---|
| `BehaviorClass` | `clad/src/clad/types/behaviorComponent/behaviorClasses.clad` | C++ class (minus `Behavior` prefix) | `AnimSequence`, `DriveToFace`, `DispatcherStrictPriority` |
| `BehaviorID` | `clad/src/clad/types/behaviorComponent/behaviorIDs.clad` | One JSON **instance** | `ReactToHello`, `ComeHereVoiceCommand`, `Observing` |

Many instances can share one class (`AnimSequence` is used dozens of times).

**Delegation names** resolve in this order (`ICozmoBehavior::FindBehavior`):

1. This instance’s `anonymousBehaviors` map (`behaviorName`)
2. Global `BehaviorID` string

---

## 2. File / naming rules (codegen will fail otherwise)

`tools/ai/generateBehaviorCode.py` + `behavior_instance.py` + `ICozmoBehavior::ExtractBehaviorIDFromConfig`:

| Rule | Detail |
|---|---|
| JSON lives under | `resources/config/engine/behaviorComponent/behaviors/` (recursive) |
| Production tree | `…/behaviors/victorBehaviorTree/` |
| Dev / playpen | `…/behaviors/devBehaviors/` |
| Filename | `{behaviorID}.json` — **case-insensitive match** to `behaviorID` (`ReactToHello.json` ↔ `"behaviorID": "ReactToHello"`). Engine `DEV_ASSERT`s this. |
| Required root keys | `behaviorClass`, `behaviorID` |
| Comments | `//` comments are used throughout production JSON. Engine loader accepts them. Codegen uses `demjson`. |
| Unexpected **root** keys | `ICozmoBehavior::CheckJson` → `HasUnexpectedKeys` against `GetAllJsonKeys()` (base keys ∪ class keys). Nested object keys are **not** checked at the parent root. |
| C++ class file | `engine/aiComponent/behaviorComponent/behaviors/**/behaviorFooBar.{h,cpp}` |
| C++ class name | `BehaviorFooBar` |
| `BehaviorClass` enum | `FooBar` (script strips the `Behavior` prefix) |
| Do not hand-edit | `behaviorFactory.cpp`, `behaviorClasses.clad`, `behaviorIDs.clad` |

**Anonymous instances** (nested in `anonymousBehaviors`) do **not** get a `BehaviorID` enum. Codegen still records their `behaviorClass`. Filename rule does not apply. They **must not** set `behaviorID` (engine overwrites it to `Anonymous`).

---

## 3. Codegen pipeline

### Track A — instance only

```bash
# 1. Write resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree/<area>/<id>.json
# 2. If a parent dispatcher should run it, add its BehaviorID string to that parent's "behaviors"
./tools/ai/generateBehaviorCode.py
# 3. Rebuild engine (or at least clad + engine) and restart vic-engine
```

`generateBehaviorCode.py` walks all `.h` under `engine/aiComponent/behaviorComponent/behaviors/` (skips `helpers/`) and all `.json` under the config tree, then writes:

- `engine/aiComponent/behaviorComponent/behaviorFactory.cpp`
- `clad/src/clad/types/behaviorComponent/behaviorClasses.clad`
- `clad/src/clad/types/behaviorComponent/behaviorIDs.clad`

Flags: `-d` / `--dangling-classes` warns about classes with no instance.

### Track B — new C++ class

```bash
./tools/ai/createNewBehavior.py engine/aiComponent/behaviorComponent/behaviors/<subdir> \
  --class-name BehaviorDoDishes \
  --author "Name" \
  --description "Does the dishes"
# prepends Behavior if missing; writes behaviorDoDishes.h/.cpp from
# tools/ai/behavior/b_template.{h,cpp}; then calls generate_all()
```

Then implement: ctor JSON parse, `GetBehaviorJsonKeys`, `WantsToBeActivatedBehavior`, `OnBehaviorActivated`, optional `BehaviorUpdate` / `GetAllDelegates` / `GetBehaviorOperationModifiers`. Add a JSON instance. Re-run `generateBehaviorCode.py`.

### What codegen does **not** do

- Does **not** write `animationTrigger.clad` or `AnimationTriggerMap.json`
- Does **not** hook the instance into Observing / GlobalInterruptions / HLAI — **you must edit a parent JSON**
- Does **not** add `user_intent_map.json` rows or unit tests (`testUserIntentTransitions.cpp`)

---

## 4. Activation gate (order)

`WantsToBeActivated` is **not** only the JSON condition. `ICozmoBehavior::WantsToBeActivatedBase` then `WantsToBeActivatedBehavior` (`iCozmoBehavior.cpp` ~L1020–1078):

1. Factory test → always true
2. Coordinator veto this tick (`_tickDontActivateSetFor`)
3. Off treads and `wantsToBeActivatedWhenOffTreads == false` → **false** (default)
4. On charger contacts and `wantsToBeActivatedWhenOnCharger == false` → **false** (default is **true**)
5. Carrying a cube and `wantsToBeActivatedWhenCarryingObject == false` → **false**
6. Cube connection requirements not met → **false**
7. Every `wantsToBeActivatedCondition` **and** `respondToUserIntents` (compiled to `ConditionUserIntentPending`) must be true
8. Then the class’s `WantsToBeActivatedBehavior()` (e.g. `AnimSequence` requires at least one anim)

`wantsToCancelSelfCondition` is evaluated while active; if true, the behavior cancels itself.

If `behaviorAlwaysDelegates` is true (C++ default, **illegal in JSON**), and the behavior has not delegated by end of tick, it auto-cancels. JSON-only classes that play an action on activate rely on this.

---

## 5. Base JSON keys (`ICozmoBehavior`)

Every instance may use these **root** keys (`GetAllJsonKeys` base list). Types below are JSON types.

| Key | Type | Required | Default | Meaning |
|---|---|---|---|---|
| `behaviorClass` | string | **yes** | — | `BehaviorClass` enum name |
| `behaviorID` | string | **yes** (non-anon) | — | `BehaviorID` enum name; must match filename |
| `alwaysStreamline` | bool | no | false | Streamline mode [CONFIRMED key; rarely set] |
| `behaviorModifiers` | object | no | see §6 | Operation modifiers |
| `wantsToBeActivatedCondition` | object | no | none | One BEI condition (§8). All listed conditions ANDed with intent waiters. |
| `wantsToCancelSelfCondition` | object | no | none | One BEI condition; cancels self while active |
| `respondToUserIntents` | array | no | none | See §12. Also **blocks activation** until a listed intent is pending; auto-activates that intent |
| `showActiveIntentFeedback` | bool | no | false | Intent activity lights/UI |
| `autoShutOffIntentFeedback` | bool | no | false | Auto shut off that feedback |
| `emotionEventOnActivated` | string | no | `""` | Mood `EmotionEvent` name fired on activate |
| `resetTimers` | string[] | no | `[]` | `BehaviorTimerTypes` names reset on activate. Valid: §11 |
| `anonymousBehaviors` | object[] | no | none | Nested instances (§7) |
| `postBehaviorSuggestion` | string | no | none | `PostBehaviorSuggestions` enum. HLAI uses this to resume a state |
| `associatedActiveFeature` | string | no | inherit | `ActiveFeature` enum. **Required somewhere on every production branch** (or `NoFeature`). Unit test `DelegationTree.CheckActiveFeatures` |
| `behaviorStatToIncrement` | string | no | none | `BehaviorStat` enum incremented on activate |
| `tracksToLockWhileActivated` | string[] | no | none | `AnimTrackFlag` names OR’d together |
| `alterStreamAfterWakeword` | string | no | none | `StreamAndLightEffect`. Mutually exclusive with next |
| `pushTriggerWordResponse` | object | no | none | Full trigger-word response push; cannot combine with `alterStreamAfterWakeword` |
| `debugLabel` | string | anon only | auto | Display name; anon auto-gets `"@" + behaviorName` |
| `behaviorName` | string | anon only | — | Lookup key for `FindBehavior` / parent `behaviors` entries |

### `postBehaviorSuggestion` values

`Invalid`, `Socialize`, `PlayWithCube`, `Nothing`, `ReactToPutDownFromPalm`, `Sleep`, `SleepOnCharger`, `SleepOnPalm`

### `associatedActiveFeature` values

`NoFeature`, `Alexa`, `AskForHelp`, `BeQuiet`, `Blackjack`, `CantDoThat`, `Clock`, `ComeHere`, `CubeSpinner`, `DanceToTheBeat`, `EyeColor`, `Exploring`, `FetchCube`, `FindCube`, `FindHome`, `FistBump`, `Frustrated`, `GoHome`, `HeldInPalm`, `HowOldAreYou`, `InTheAir`, `InteractWithFaces`, `Keepaway`, `KnowledgeGraph`, `ListeningForBeats`, `LookAtMe`, `LowBattery`, `MeetVictor`, `MoveCube`, `MovementForward`, `MovementBackward`, `MovementLeft`, `MovementRight`, `MovementTurnAround`, `Observing`, `ObservingOnCharger`, `Onboarding`, `Petting`, `PlayingMessage`, `PopAWheelie`, `ReactToAbuse`, `ReactToAffirmative`, `ReactToApology`, `ReactToCliff`, `ReactToGazeDirection`, `ReactToGoodBye`, `ReactToGoodMorning`, `ReactToHand`, `ReactToHello`, `ReactToLove`, `ReactToNegative`, `ReactToRobotOnSide`, `RecordingMessage`, `RequestCharger`, `RobotShaken`, `RollBlock`, `SDK`, `SeasonalHappyHolidays`, `SeasonalHappyNewYear`, `Sleeping`, `ShutUp`, `StuckOnEdge`, `TakeAPhoto`, `TimerCanceled`, `TimerChecked`, `TimerReminder`, `TimerRinging`, `TimerSet`, `UnmatchedVoiceIntent`, `VolumeAdjustment`, `BasicVoiceCommand`, `Weather`, `WhatsMyName`, `VC_Greeting`

### `behaviorStatToIncrement` values

`AVS`, `AnimationPlayed`, `AttemptedFistBump`, `AttemptedPounceOnCube`, `BehaviorActivated`, `BlackjackDealerWon`, `BlackjackGameComplete`, `EnrolledFace`, `FistBumpSuccess`, `MountedCharger`, `PettingBlissIncrease`, `PettingReachedMaxBliss`, `PickedUpCube`, `PounceOnCubeSuccess`, `ReactedToCliff`, `ReactedToEyeContact`, `ReactedToMotion`, `ReactedToSound`, `ReactedToTriggerWord`, `RolledCube`

### `tracksToLockWhileActivated` / `AnimSequence.tracksToLock` values

`NO_TRACKS`, `HEAD_TRACK`, `LIFT_TRACK`, `BODY_TRACK`, `FACE_TRACK`, `EVENT_TRACK`, `BACKPACK_LIGHTS_TRACK`, `AUDIO_TRACK`, `ALL_TRACKS`

### `alterStreamAfterWakeword` values

`StreamingDisabled`, `StreamingEnabled`, `StreamingDisabledButWithLight`

### `resetTimers` values (`BehaviorTimerTypes`)

`Invalid`, `DancingCooldown`, `FistBump`, `ListenForBeatsCooldown`, `PlayingWithCube`, `ReactToIllumination`, `Socializing`, `ObservingOnCharger`, `ObservingOffCharger`, `ReactToTouchPetting`

---

## 6. `behaviorModifiers` object

Set on the instance; applied in `SetDefaultBehaviorOperationModifiers`. **Root of this object**, not the behavior root.

| Key | Type | JSON-legal? | Default | Meaning |
|---|---|---|---|---|
| `wantsToBeActivatedWhenCarryingObject` | bool | yes | `false` | Can run while holding a cube |
| `wantsToBeActivatedWhenOffTreads` | bool | yes | `false` | Can run in air / on back / side / face |
| `wantsToBeActivatedWhenOnCharger` | bool | yes | `true` | Can run on charger contacts |
| `connectToCubeInBackground` | bool | yes | `false` | Hold BLE without status lights |
| `ensuresCubeConnectionAtDelegation` | bool | yes | `false` | Satisfies child’s `RequiredManaged` |
| `cubeConnectionRequirements` | string | yes | `None` | See below |
| `behaviorAlwaysDelegates` | bool | **NO** — `illegalKeys` | C++ `true` | Auto-cancel if not delegated. Override only in C++ `GetBehaviorOperationModifiers` |

`cubeConnectionRequirements`: `None` | `OptionalLazy` | `OptionalActive` | `RequiredLazy` | `RequiredManaged`

Vision-mode subscriptions (`visionModesForActivatableScope` / `ActiveScope`) are **C++ only** (TODO in code: “Allow user to set vision mode operation modifiers via JSON as well”).

---

## 7. Anonymous behaviors

Array of full behavior configs nested under a parent. Used so a dispatcher can own private children without polluting the global `BehaviorID` enum.

```json
"anonymousBehaviors": [
  {
    "behaviorName": "FindFaceInternal",
    "behaviorClass": "FindFaceAndThen",
    "timeUntilCancelFaceLooking_s": 2.0,
    "searchForFaceBehavior": "ActiveLookForFaces",
    "exitOnceFound": true
  }
]
```

Rules (`iCozmoBehavior.cpp` ~L506–533):

- `behaviorName` required
- `behaviorClass` required
- `behaviorID` **forbidden** (injected as `Anonymous`)
- `debugLabel` optional; default `"@" + behaviorName`
- Nested `anonymousBehaviors` allowed
- Parent refers to them by `behaviorName` string (same as a `BehaviorID` in `behaviors` arrays)
- Each anon instance is `CheckJson`’d as its class

---

## 8. BEI conditions

Every condition object **must** have `"conditionType": "<BEIConditionType>"`.

`BEIConditionType` (`beiConditionTypes.clad`):  
`Invalid`, `TrueCondition`, `AlexaInteractionActive`, `AnyStimuli`, `BatteryLevel`, `BeatDetected`, `BecameTrueThisTick`, `BehaviorSuggested`, `BehaviorTimer`, `BeingHeld`, `CarryingCube`, `CliffDetected`, `Compound`, `ConnectedToCube`, `ConsoleVar`, `CubeTapped`, `Emotion`, `EngineErrorCodeReceived`, `EyeContact`, `FaceKnown`, `FacePositionUpdated`, `FeatureGate`, `HighTemperature`, `IlluminationDetected`, `InCalmMode`, `IsMaintenanceReboot`, `IsNightTime`, `Lambda`, `MotionDetected`, `ObjectInitialDetection`, `ObjectKnown`, `ObjectMoved`, `ObjectPositionUpdated`, `ObstacleDetected`, `OffTreadsState`, `OnCharger`, `OnChargerPlatform`, `PetInitialDetection`, `ProxInRange`, `RobotHeldInPalm`, `RobotInHabitat`, `RobotPickedUp`, `RobotPitchInRange`, `RobotPlacedOnSlope`, `RobotPoked`, `RobotRollInRange`, `RobotShaken`, `RobotTouched`, `SalientPointDetected`, `SettingsUpdatePending`, `SocialPresence`, `SimpleMood`, `StuckOnEdge`, `TimePowerButtonPressed`, `TimedDedup`, `TimerInRange`, `TooHotToCharge`, `TriggerWordPending`, `UnexpectedMovement`, `UserIntentActive`, `UserIntentPending`, `UserIsHoldingCube`, `UnitTestCondition`

`Lambda` and `UnitTestCondition` are **not for JSON generators** (C++ inject / tests).

### Compound (boolean)

Max depth **2** (`ConditionCompound` asserts). Root still needs `conditionType: "Compound"`.

```json
{
  "conditionType": "Compound",
  "and": [ { "conditionType": "OnCharger" }, { "conditionType": "Compound", "not": { "conditionType": "FeatureGate", "feature": "PRDemo" } } ]
}
```

| Key | Type | Notes |
|---|---|---|
| `and` | array of conditions | AND |
| `or` | array of conditions | OR |
| `not` | one condition | NOT |

Exactly one of `and` / `or` / `not` at each node.

### Per-type fields

| conditionType | Extra fields | Values / notes |
|---|---|---|
| `TrueCondition` | — | Always true |
| `OnCharger` | — | On charger **contacts** |
| `OnChargerPlatform` | — | On charger platform |
| `CarryingCube` | — | |
| `EyeContact` | — | |
| `FacePositionUpdated` | — | |
| `HighTemperature` | — | Battery/charger thermal (not CPU-hot backpack) |
| `InCalmMode` | — | |
| `IsMaintenanceReboot` | — | |
| `IsNightTime` | — | |
| `ObjectMoved` | — | |
| `ObjectPositionUpdated` | — | |
| `ObstacleDetected` | — | |
| `PetInitialDetection` | — | |
| `RobotInHabitat` | — | |
| `RobotPickedUp` | — | |
| `RobotPlacedOnSlope` | — | |
| `TooHotToCharge` | — | |
| `TriggerWordPending` | — | Wake word pending (not a user intent) |
| `UnexpectedMovement` | — | |
| `UserIsHoldingCube` | — | |
| `AlexaInteractionActive` | — | |
| `AnyStimuli` | — | |
| `BatteryLevel` | `targetBatteryLevel` string | `Unknown` `Low` `Nominal` `Full` |
| `BeatDetected` | `allowPotentialBeat` bool | |
| `BecameTrueThisTick` | `subCondition` object | Edge trigger |
| `TimedDedup` | `subCondition` object, `dedupInterval_ms` number | |
| `BehaviorSuggested` | `postBehaviorSuggestion` string, `maxTicksForSuggestion` number | |
| `BehaviorTimer` | `timerName` string, `cooldown_s` number | `timerName` ∈ BehaviorTimerTypes |
| `BeingHeld` | `shouldBeHeld` bool | |
| `CliffDetected` | `numCliffDetectionsToTrigger` int, `shouldDetectNoCliffs` bool, `minDuration_ms` int, `maxDuration_ms` int | |
| `ConnectedToCube` | `connectionType` string | `Unspecified` `Background` `Interactable` |
| `ConsoleVar` | `variable` string, `value` (varies) | Named console var |
| `CubeTapped` | `maxTapResponseTimeSec` number | |
| `Emotion` | `emotion` string, optional `min` `max` `value` number | Emotion: `Happy` `Confident` `Social` `Stimulated` `Trust` |
| `SocialPresence` | optional `min` `max` `value` number | RSPI ∈ [-1, 1] from `SocialPresenceEstimator`; no vision. HLAI socialize doors use `"min": 0.0` as a receptiveness veto |
| `EngineErrorCodeReceived` | `engineErrorCode` string | CLAD error code name |
| `FaceKnown` | `maxFaceDist_mm` number, `maxFaceAge_s` number, `mustBeNamed` bool | |
| `FeatureGate` | `feature` string, `expected` bool (default true) | FeatureType: `Laser` `Exploring` `FetchCube` `FindCube` `Keepaway` `ReactToHeldCube` `RollCube` `MoveCube` `Messaging` `ReactToIllumination` `KnowledgeGraph` `Dancing` `CubeSpinner` `GreetAfterLongTime` `AttentionTransfer` `UserDefinedBehaviorTree` `PopAWheelie` `ActiveIntentFeedback` `Alexa` `Alexa_UK` `Alexa_AU` `HeldInPalm` `Volume` `HandDetection` `GazeDirection` `HowOldAreYou` `StayOnChargerUntilCharged` `EyeColorVC` `PRDemo` `TestFeature` |
| `IlluminationDetected` | `preTriggerStates` `postTriggerStates` arrays, `preConfirmationTime` `postConfirmationTime` `preConfirmationMinNum` `postConfirmationMinNum` `matchHoldTime` | Illumination state names |
| `MotionDetected` | `motionArea` string, `motionLevel` string | Area: `Left` `Right` `Top` `Ground` `Any`. Level: `High` `Low` `Any` |
| `ObjectInitialDetection` | `firstTimeOnly` bool | |
| `ObjectKnown` | `objectTypes` string[], `maxAge_ms` number | ObjectType CLAD names |
| `OffTreadsState` | `targetState` string, `minTimeSinceChange_ms` int (default 0), `maxTimeSinceChange_ms` int (default −1 = none) | `OnTreads` `InAir` `OnBack` `OnLeftSide` `OnRightSide` `OnFace` `Falling` |
| `ProxInRange` | `minProxDist_mm` `maxProxDist_mm` number, `invalidSensorReturn` | |
| `RobotHeldInPalm` | `shouldBeHeldInPalm` bool, `minDuration_s` `maxDuration_s` number | |
| `RobotPitchInRange` | `minPitchThreshold_deg` `maxPitchThreshold_deg` | |
| `RobotRollInRange` | `minRollThreshold_deg` `maxRollThreshold_deg` | |
| `RobotPoked` | `wasPokedRecentlyTimeThreshold_sec` | |
| `RobotShaken` | `minAccelMagnitudeThreshold` | |
| `RobotTouched` | `minTouchTime` | |
| `SalientPointDetected` | `targetSalientPoint` string | `Unknown` `Object` `Person` `Hand` `Cat` `Dog` `BrightColors` |
| `SettingsUpdatePending` | `setting` string | |
| `SimpleMood` | either `mood` **or** (`from` + `to`) | `Default` `LowStim` `MedStim` `HighStim` `Frustrated`. Cannot mix `mood` with from/to |
| `StuckOnEdge` | `enableWhileHeldOnPalm` bool | |
| `TimePowerButtonPressed` | `minTimeButtonPressed_ms` | |
| `TimerInRange` | `begin_s` number, `end_s` number, `manualResetOnly` bool | Time **since this behavior entered activatable scope** (or manual reset) |
| `UserIntentPending` | `list` array | See §12. Prefer `respondToUserIntents` on the behavior instead |
| `UserIntentActive` | `list` array | Same list shape as pending |

**Negation example used in production** (`comeHereVoiceCommand.json`):

```json
"wantsToCancelSelfCondition": {
  "conditionType": "Compound",
  "not": { "conditionType": "OffTreadsState", "targetState": "OnTreads" }
}
```

---

## 9. JSON-first classes (generator should default here)

These classes are fully data-driven. Prefer them over new C++.

### 9.1 `Wait`

No extra keys. Always wants to activate (subject to base gate). Does nothing. Use as dispatcher fallback.

### 9.2 `AnimSequence`

Play canned animation(s) then cancel.

| Key | Type | Required | Default | Notes |
|---|---|---|---|---|
| `animTriggers` | string[] | xor `animNames` | — | `AnimationTrigger` enum names. **Must specify exactly one of triggers or names** |
| `animNames` | string[] | xor `animTriggers` | — | Raw clip names (e.g. `anim_rtpmemorymatch_yes_03`) |
| `num_loops` | int | no | `1` | |
| `tracksToLock` | string[] | no | none | `AnimTrackFlag` |
| `renderInEyeHue` | bool | no | `true` | |

Minimal production example (`reactToHello.json`):

```json
{
  "behaviorID": "ReactToHello",
  "behaviorClass": "AnimSequence",
  "emotionEventOnActivated": "RespondToShortVoiceCommand",
  "associatedActiveFeature": "ReactToHello",
  "respondToUserIntents": [ { "type": "greeting_hello" } ],
  "animTriggers": [ "ReactToGreeting" ]
}
```

### 9.3 `AnimGetInLoop`

Get-in → loop until condition → get-out.

| Key | Type | Required | Default |
|---|---|---|---|
| `getIn` | string | **yes** | AnimationTrigger |
| `loopAnimation` | string | **yes** | AnimationTrigger |
| `getOut` | string | **yes** | AnimationTrigger |
| `emergencyGetOut` | string | no | AnimationTrigger |
| `loopEndCondition` | object | typical | BEI condition |
| `shouldCheckEndCondDuringAnim` | bool | no | true |
| `loopInterval_s` | number | no | 0 (don’t interrupt mid-clip if shorter than anim) |
| `shouldForceLoopGetOutAnim` | bool | no | |
| `lockTreads` | bool | no | |

### 9.4 `AnimSequenceWithFace` / `AnimSequenceWithObject`

Inherits AnimSequence keys, plus:

**WithFace:** `faceSelectionPenalties` object, `requireFaceForActivation` bool, `requireFaceConfirmation` bool, `returnToOriginalPose` bool, `setFastTurn` bool  

**WithObject:** `objectType` string

### 9.5 Dispatchers — shared

All dispatchers inherit `IBehaviorDispatcher`:

| Key | Type | Required | Default |
|---|---|---|---|
| `interruptActiveBehavior` | bool | **yes** (most) | — | If true, a higher-priority child can cancel the current one |
| `requireGentleInterruption` | bool | no | false | Only interrupt if current allows gentle interrupt. Invalid if `interruptActiveBehavior` is false |

Child **references** are strings looked up by `FindBehavior` (anon name or BehaviorID).

### 9.6 `DispatcherStrictPriority`

First child in the list whose `WantsToBeActivated()` is true wins.

| Key | Type | Notes |
|---|---|---|
| `behaviors` | **string[]** | BehaviorID or anon `behaviorName`. **Not objects.** |
| `linkScope` | bool | If true, children share activatable scope; dispatcher wants activate iff a child does |
| `actAsSelector` | bool | Selector semantics |
| `interruptActiveBehavior` | bool | |

### 9.7 `DispatcherStrictPriorityWithCooldown`

Same priority order, plus per-child cooldown.

| Key | Type |
|---|---|
| `behaviors` | **object[]** — see cooldown child |
| `linkScope` | bool |
| `resetCooldownOnDeactivation` | bool |
| `interruptActiveBehavior` | bool |

**Cooldown child object:**

| Key | Type | Required | Default | Notes |
|---|---|---|---|---|
| `behavior` | string | **yes** | — | ID or anon name |
| `cooldown_s` | number | **yes** | — | Seconds after the child **stops**. **Negative ⇒ forever** (InitNormalOperation uses `-1` for wake-up once) |
| `cooldown_random_factor` | number | no | `0` | Multiplier range `(1−f)…(1+f)` |
| `ignoreFastForward` | bool | no | false | Ignore `kTimeMultiplier` |
| `linkedBehaviorTimer` | string | no | | `BehaviorTimerTypes` reset when child stops |
| `resetLinkedTimerOnDispatcherActivation` | bool | no | false | |

### 9.8 `DispatcherRandom`

Picks among ready children by weight; **cancels itself after the chosen child ends**.

| Key | Type |
|---|---|
| `behaviors` | **object[]** |
| `interruptActiveBehavior` | bool (this class forces false in C++ ctor) |

**Random child object:** cooldown child keys **plus** `weight` number (**required**).

### 9.9 `DispatcherQueue`

Runs children **in order** if each wants activate.

| Key | Type |
|---|---|
| `behaviors` | **string[]** |

### 9.10 `DispatcherPassThrough`

Exactly one delegate. Coordinators subclass this.

| Key | Type |
|---|---|
| `delegateID` | string | BehaviorID / anon name |

### 9.11 `DispatcherScoring`

Highest score among children that want to run.

| Key | Type |
|---|---|
| `behaviors` | object[] |

**Scoring child object (different from cooldown children!):**

| Key | Type |
|---|---|
| `behaviorID` | string | **Uses `behaviorID`, not `behavior`** |
| `scoring` | object | `flatScore` number and/or `emotionScorers` array; optional `repetitionPenalty`, `activatedPenalty` |

### 9.12 `InternalStatesBehavior` / `HighLevelAI`

JSON state machine. HLAI is the C++ subclass with extra keys.

**Root:**

| Key | Type |
|---|---|
| `states` | object[] |
| `initialState` | string | must match a state `name` |
| `transitionDefinitions` | object[] |
| `resumeReplacements` | object | map from-state-name → to-state-name on resume |
| `stateTimerConditions` | object[] | inject named custom timer conditions |
| `ignoreMissingTransitions` | bool |
| `use_debug_lights` | bool | backpack debug (not in GetBehaviorJsonKeys — avoid in generator unless needed) |

**State object:**

| Key | Type | Notes |
|---|---|---|
| `name` | string | **required** |
| `behavior` | string | BehaviorID to run in this state XOR |
| `cancelSelf` | bool | if true, state has no behavior (must not also set `behavior`) |
| `getInBehavior` | string | optional get-in BehaviorID |
| `resetBehaviorTimer` | string | BehaviorTimerTypes |
| `ensureMinStimValue` | number | −1 disabled |
| `debugColor` | string | NamedColors |
| `activateIntent` | string | UserIntentTag to activate while in state |

**Transition definition:**

```json
{
  "from": "Observing",          // string, "*" (all states), or string[]
  "interruptingTransitions": [
    { "to": "Socializing", "condition": { "conditionType": "FaceKnown", "mustBeNamed": true }, "emotionEvent": "" }
  ],
  "nonInterruptingTransitions": [ ],
  "exitTransitions": [ ]
}
```

| Transition kind | When it fires |
|---|---|
| `interruptingTransitions` | Can cancel the current state’s behavior immediately |
| `nonInterruptingTransitions` | Only when current delegate is idle / allows gentle interrupt |
| `exitTransitions` | Only after the delegated behavior **ends** |

Each transition: `to` string, `condition` BEI object, optional `emotionEvent` string.

**`stateTimerConditions`:** `{ "name": "BeenInState10s", "begin_s": 10 }` — injects a custom condition you can reference (customCondition path). Prefer `TimerInRange` on the behavior when possible.

**HLAI extra keys:** `socializeKnownFaceCooldown_s`, `playWithCubeCooldown_s`, `playWithCubeOnChargerCooldown_s`, `maxFaceDistanceToSocialize_mm`, `postBehaviorSuggestionResumeOverrides`

### 9.13 `DriveToFace` (come here)

| Key | Type | Required | Default |
|---|---|---|---|
| `minDriveToFaceDistanceKey_mm` | number | **yes** | — | Stop this far from the face (come-here uses `200`) |
| `findFaceBehavior` | string | **yes** | — | Must be a `FindFaceAndThen` (ID or anon name) |
| `trackFaceOnceKnown` | bool | no | true |
| `timeUntilCancelFaceTrack_s` | number | if tracking | |
| `animTooClose` | string | **yes** | AnimationTrigger |
| `animDriveOverride` | string | no | skip drive, play this instead |
| `initialAnimation` | string | no | AnimationTrigger before drive |
| `animationAfterDrive` | string | no | |
| `resumeAnimation` | string | with `maxNumResumes` | |
| `maxNumResumes` | int | no | 0 |
| `maxNumFailures` | int | no | 2 |
| `motionProfile` | object | no | PathMotionProfile |

**`motionProfile`** (`pathMotionProfile.clad`):

| Field | Type | Default |
|---|---|---|
| `speed_mmps` | number | 100 |
| `accel_mmps2` | number | 200 |
| `decel_mmps2` | number | 500 |
| `pointTurnSpeed_rad_per_sec` | number | 2 |
| `pointTurnAccel_rad_per_sec2` | number | 10 |
| `pointTurnDecel_rad_per_sec2` | number | 10 |
| `dockSpeed_mmps` | number | 60 |
| `dockAccel_mmps2` | number | 200 |
| `dockDecel_mmps2` | number | 500 |
| `reverseSpeed_mmps` | number | 80 |
| `isCustom` | bool | false — **set true** if you ship a custom profile |

Drive is `DriveToPoseAction` toward a point **along current heading**, shortened for cliffs — not “follow the person.” See `ENGINE-PATH-PLANNING.md`.

### 9.14 `FindFaceAndThen`

Used as DriveToFace’s search helper (often anonymous).

| Key | Type |
|---|---|
| `startsWithMicDirection` | bool |
| `shouldLeaveChargerFirst` | bool |
| `driveOffChargerBehavior` | string |
| `timeUntilCancelFaceLooking_s` | number |
| `timeUntilCancelFaceSearch_s` | number |
| `timeUntilCancelFollowup_s` | number |
| `searchForFaceBehavior` | string |
| `alwaysDetectFaces` | bool |
| `behavior` | string | follow-up |
| `callSetFaceOnBehavior` | bool |
| `exitOnceFound` | bool |
| `useBodyDetector` | bool |
| `additionalLookTimeIfSawBody_s` | number |
| `additionalSearchTimeIfSawBody_s` | number |
| `upperPortionLookUpPercent` | number |
| `animWhenSeesFace` | string |
| `animWhileSearching` | string |

---

## 10. Extra root keys by `BehaviorClass`

Complete dump of `GetBehaviorJsonKeys` string literals (plus nested keys documented above). **Root-only** keys must be declared here or CheckJson fails. Nested keys (`cooldown_s` inside `behaviors[]`, condition fields, etc.) are not listed on the parent.

Empty `[]` means the class adds **no** extra root keys (base keys only).

| BehaviorClass (file stem) | Extra root keys |
|---|---|
| Wait | *(none — not even GetBehaviorJsonKeys override)* |
| GreetAfterLongTime | [] |
| AnimSequence | `animTriggers` `animNames` `num_loops` `tracksToLock` `renderInEyeHue` |
| AnimGetInLoop | `getIn` `loopAnimation` `getOut` `emergencyGetOut` `loopEndCondition` `shouldCheckEndCondDuringAnim` `loopInterval_s` `shouldForceLoopGetOutAnim` `lockTreads` |
| AnimSequenceWithFace | parent AnimSequence keys **plus** `faceSelectionPenalties` `requireFaceForActivation` `requireFaceConfirmation` `returnToOriginalPose` `setFastTurn` (calls `BaseClass::GetBehaviorJsonKeys`) |
| AnimSequenceWithObject | `objectType` |
| DispatcherStrictPriority | `behaviors` `linkScope` `actAsSelector` `interruptActiveBehavior` |
| DispatcherStrictPriorityWithCooldown | `behaviors` `linkScope` `resetCooldownOnDeactivation` `interruptActiveBehavior` |
| DispatcherRandom | `behaviors` `interruptActiveBehavior` |
| DispatcherQueue | `behaviors` `interruptActiveBehavior` |
| DispatcherPassThrough | `delegateID` |
| DispatcherScoring | `behaviors` `interruptActiveBehavior` |
| DispatcherRerun | `behaviors` `delegateID` `numRuns` `presetConditions` |
| InternalStatesBehavior | `states` `resumeReplacements` `transitionDefinitions` `initialState` `stateTimerConditions` `emotionEvent` `ignoreMissingTransitions` |
| HighLevelAI | `socializeKnownFaceCooldown_s` `playWithCubeCooldown_s` `playWithCubeOnChargerCooldown_s` `maxFaceDistanceToSocialize_mm` `postBehaviorSuggestionResumeOverrides` |
| DriveToFace | `minDriveToFaceDistanceKey_mm` `trackFaceOnceKnown` `timeUntilCancelFaceTrack_s` `animTooClose` `animDriveOverride` `motionProfile` `initialAnimation` `animationAfterDrive` `findFaceBehavior` `maxNumResumes` `resumeAnimation` `maxNumFailures` |
| FindFaceAndThen | `startsWithMicDirection` `shouldLeaveChargerFirst` `driveOffChargerBehavior` `timeUntilCancelFaceLooking_s` `timeUntilCancelFaceSearch_s` `timeUntilCancelFollowup_s` `searchForFaceBehavior` `alwaysDetectFaces` `behavior` `callSetFaceOnBehavior` `exitOnceFound` `useBodyDetector` `additionalLookTimeIfSawBody_s` `additionalSearchTimeIfSawBody_s` `upperPortionLookUpPercent` `animWhenSeesFace` `animWhileSearching` |
| InteractWithFaces | `minTimeToTrackFaceLowerBound_s` `minTimeToTrackFaceUpperBound_s` `maxTimeToTrackFaceLowerBound_s` `maxTimeToTrackFaceUpperBound_s` `minTrackingTiltAngle_deg` `minTrackingPanAngle_deg` `eyeContactWithinLast_ms` `noEyeContactTimeout_s` `trackingTimeout_s` `clampSmallAngles` `minClampPeriod_s` `maxClampPeriod_s` |
| ObservingLookAtFaces | `searchBehavior` `searchTimeout_sec` `staringTime_sec` |
| ObservingWithoutTurn | `small_motion_period_s` `small_motion_period_random_factor` `look_up_period_multiplier` `look_straight_period_multiplier` `behaviorTimer` |
| LookAtFaceInFront | `confirmFace` |
| LookAtMe | `panTolerance_deg` `animGetIn` `animLoop` `animGetOut` `numLoops` `playEmergencyGetOut` |
| SayName | `dontKnowNameAnimation` `knowNameAnimation` `dontKnowTextKey` `waitForRecognitionMaxTime_sec` |
| FindFaces | `maxFaceAgeToLook_ms` `stoppingCondition` `searchBehavior` `timeout_sec` |
| LookForFaceAndCube | `bodyTurnSpeed_degPerSec` `headTurnSpeed_degPerSec` `face_headAngleAbsRangeMin_deg` `face_headAngleAbsRangeMax_deg` `face_bodyAngleRelRangeMin_deg` `face_bodyAngleRelRangeMax_deg` `face_sidePicks` `cube_headAngleAbsRangeMin_rad` `cube_headAngleAbsRangeMax_rad` `cube_bodyAngleRelRangeMin_rad` `cube_bodyAngleRelRangeMax_rad` `cube_sidePicks` `stopBehaviorOnCube` `verifySeenFaces` `stopBehaviorOnAnyFace` `stopBehaviorOnNamedFace` `lookInPlaceAnimTrigger` |
| LookAroundInPlace | `params` (object — large nested; copy from an existing JSON) |
| DriveOffCharger | `extraDistanceToDrive_mm` `driveDirectionCues` `maxFaceAge_s` `maxCubeAge_s` |
| Turn | `shouldTurnClockwise` `turnDegrees` |
| MoveHeadToAngle | `headAngle_deg` |
| TrackFace | `faceSelectionPenalties` |
| TrackCube | `maxTimeSinceObserved_ms` `maxDistance_mm` |
| TrackLaser | `skipGetOutAnim` `maxLostLaserTimeoutGraph_sec` |
| SleepCycle | `delegateID` `wakeReasonConditions` `alwaysWakeReasons` `wakeFromStates` `goToChargerBehavior` `emergencyCondition` |
| Sleeping | `enablePowerSave` `shouldPlayEmergencyGetOut` `canActivateOffTreads` |
| StayOnChargerUntilCharged | `delegate` |
| ConnectToCube | `delegateBehaviorID` `delegateOnFailedConnection` |
| CoordinateInHabitat | `delegateID` `suppressedBehaviors` |
| QuietModeCoordinator | `behaviors` `behavior` `audioAllowed` `activeTime_s` `timeToPowerSave_s` |
| ReactToVoiceCommand | `earConAudioEventBegin` `earConAudioEventSuccess` `earConAudioEventNeutral` `backpackLights` `behaviorOnIntent` `animListeningGetIn` `animListeningLoop` `animListeningGetOut` `exitAfterGetIn` `exitAfterListeningIfNotStreaming` `pushResponse` `notifyOnWifiErrors` `notifyOnCloudErrors` `whiteListedIntents` |
| ReactToMicDirection | `reaction_list` |
| ReactToSound | `micDirectionReactionBehavior` `micAbsolutePowerThreshold` `micMinPowerThreshold` `micConfidenceThresholdAtMinPower` |
| ReactToMotion | `procedural` `eyeMotionTimeout_s` `eyeMotionShiftTimeout_s` `ticksInIntervalForTurn` `turnIntervalSize` `procTurnAngle_deg` `procHeadAngle_deg` |
| ReactToCliff | `cliffBackupDistance_mm` `cliffBackupSpeed_mmps` `eventFlagTimeout_ms` |
| ReactToDarkness | `lookHeadAngleMin_deg` `lookHeadAngleMax_deg` `lookTurnAngleMin_deg` `lookTurnAngleMax_deg` `lookWaitTime_s` `lookMinImages` `numOffChargerLooks` `numOnChargerLooks` `reactionEmotion` `sleepInPlace` |
| ReactToFrustration | `randomDriveMinDist_mm` `randomDriveMaxDist_mm` `randomDriveMinAngle_deg` `randomDriveMaxAngle_deg` `anim` `finalEmotionEvent` |
| ReactToRobotShaken | `shakeAnimations` `getInAnimation` `renderInEyeHue` |
| ReactToRobotOnBack | `exitIfHeld` |
| ReactToRobotOnSide | `askForHelpAfter_sec` `askForHelpBehavior` |
| ReactToUnexpectedMovement | `enableRepeatedActivationChecks` `repeatedActivationWindow_sec` `repeatedActivationAngleWindow_deg` `numRepeatedActivationsAllowed` `retreatDistance_mm` `retreatSpeed_mmps` `repeatedActivationDetectionWindow_sec` `numRepeatedActivationDetectionsAllowed` `lockTreadsDuringAnim` |
| ReactToTouchPetting | `timeTilTouchCheck` `animGroupNames` `animGroupNamesGetout` `timeTilBlissGetout` `timeTilNonBlissGetout` `numPetsToAdvanceBliss` `animGroupGetin` |
| ReactToCubeTap | `onChargerBehavior` `interactionDuration_s` |
| ReactToGazeDirection | `searchForFaces` |
| ReactToBody | `driveOffChargerBehavior` `shouldDriveStraightIfNotOnCharger` `drivingForwardDistance_mm` `upperPortionLookUpPercent` `trackingTimeout_sec` `faceSelectionPenalties` |
| ReactToPalmEdge | `cliffBackupDistance_mm` `cliffBackupSpeed_mmps` `animOnTurnFailure` |
| TextToSpeechLoop | `idleAnimation` `getInAnimation` `loopAnimation` `getOutAnimation` `emergencyGetOutAnimation` `utteranceTriggeredByAnim` `lockTreads` `DEV_TEST_UTTERANCE` |
| PromptUserForVoiceCommand | `earConAudioEventSuccess` `earConAudioEventNeutral` `shouldTurnToFaceBeforePrompting` `textToSpeechBehaviorID` `vocalPromptKey` `vocalResponseToIntentKey` `vocalResponseToBadIntentKey` `vocalRepromptKey` `stopListeningOnIntents` `maxNumberOfReprompts` `playListeningGetIn` `playListeningGetOut` `streamType` |
| DisplayWeather | `imageLayouts` `imageMaps` `animationName` |
| CoordinateWeather | `responseMap` `CladType` `BehaviorID` |
| Volume | `config` |
| EyeColor / EyeColorVoiceCommand | [] |
| HowOldAreYou | [] |
| Exploring | `minSearchRadius_m` `maxSearchRadius_m` `maxChargerDistance_m` `pAcceptKnownAreas` `allowNoCharger` `motionProfile` |
| GoHome | `useCliffSensorCorrection` `leftTurnAnimTrigger` `rightTurnAnimTrigger` `drivingStartAnimTrigger` `drivingEndAnimTrigger` `drivingLoopAnimTrigger` `raiseLiftAnimTrigger` `nuzzleAnimTrigger` `driveToRetryCount` `turnToDockRetryCount` `mountChargerRetryCount` |
| FindHome | `searchTurnAnimTrigger` `postSearchAnimTrigger` `minSearchAngleSweep_deg` `maxSearchTurns` `recentSearchWindow_sec` `maxNumRecentSearches` `numSearchesBeforePlayingPostSearchAnim` `minDrivingDist_mm` `maxDrivingDist_mm` |
| FindCube | `skipReactToCubeAnim` |
| FindCubeAndThen | `followUpBehaviorID` `skipConnectToCubeBehavior` |
| FetchCube | `skipConnectToCubeBehavior` |
| PickUpCube | `retryCount` `skipInitialReactionAnim` |
| RollBlock | `isBlockRotationImportant` `rollRetryCount` |
| PopAWheelie | `numRetries` `sayName` `playCubeReaction` |
| BumpObject | `minDist_mm` `maxDist_mm` `pEvil` `pBumpWhenEvil` `pBumpWhenNotEvil` |
| FistBump | `maxTimeToLookForFace_s` `abortIfNoFaceFound` `updateLastCompletionTime` |
| Keepaway | `minPouncesForSoloPlay` `maxPouncesForSoloPlay` `useProxForDistance` |
| EnrollFace | `maxFacesVisible` `tooManyFacesTimeout_sec` `tooManyFacesRecentTime_sec` `faceSelectionPenalties` |
| LeaveAMessage | `ttsNoRecipientKey` `ttsUnknownRecipientKey` `ttsMailboxFullKey` `recordDuration` `requireKnownUser` |
| PlaybackMessage | `ttsAnnounceSingleKey` `ttsAnnouncePluralKey` `ttsNoRecipientKey` `ttsNoMessagesKey` |
| DanceToTheBeat | `useBackpackLights` `backpackAnim` `eyeHoldAnim` `getOutAnim` `danceSessions` |
| DanceToTheBeatCoordinator | `listeningBehavior` `longListeningBehavior` `offChargerDancingBehavior` `onChargerDancingBehavior` |
| ListenForBeats | `preListeningAnim` `listeningAnim` `postListeningAnim` `noBeatAnim` `minListeningTime_sec` `maxListeningTime_sec` `cancelSelfIfBeatLost` |
| PossiblePerformance | `cooldown_hours` `animTrigger` `probability` `period_hours` |
| PowerRobotOff | `powerOffAnimName` `goToChargerBehavior` |
| PoweringRobotOff | `powerOnAnimName` `powerOffAnimName` `powerButtonHeldToActivate_ms` `waitForAnimMsg` |
| RequestToGoHome | `numRequests` `requestAnimTrigger` `getoutAnimTrigger` `waitLoopAnimTrigger` `idleWaitTime_sec` `pickupAnimTrigger` `maxFaceAge_sec` `normal` `severe` |
| ClearChargerArea | `tryToPickUpCube` `maxNumAttempts` |
| ConfirmHabitat | `onTreadsTimeCondition` `searchForChargerBehavior` |
| ConfirmObject | `objectTypes` `minAgeForActivation_s` `maxNumAttempts` |
| InspectCube | `PlayWithCubeBehaviorID` |
| VectorPlaysCubeSpinner | `gameConfig` `minRoundsToPlay` `maxRoundsToPlay` `vectorPlayerConfig` `maxTimeSearchForCube_ms` |
| CubeDrive | `triggerLiftGs` `deadZoneSize` `timeBetweenLiftActions` `highHeadAngle` `lowHeadAngle` |
| ProxGetToDistance | `goalDistance_mm` `tolerence_mm` `endWhenGoalReached` `distMM_speedMM_Graph` |
| SearchWithinBoundingBox | `howManySearches` `waitBeforeTurning_s` |
| AttentionTransferIfNeeded | `attentionTransferReason` `animsIfNotRecent` |
| OnboardingCoordinator | `phases` `phaseName` `phaseBehaviorID` `phaseTimeout_s` `allowCoordinatorPowerOff` `startTimeout_s` `completionTimeout_s` `appDisconnectTimeout_s` `idleTimeout_s` `allowPowerOffFromIdle` |
| OnboardingTeachWakeWord | `simulatedStreamingDuration_ms` |
| SDKInterface | `behaviorControlLevel` `disableCliffDetection` `driveOffChargerBehavior` `findAndGoToHomeBehavior` `findFacesBehavior` `lookAroundInPlaceBehavior` `rollBlockBehavior` `enrollFaceBehavior` |
| TimerUtilityCoordinator | `anticConfig` `minValidTimer_s` `maxValidTimer_s` `timerRingingBehaviorID` `touchTimeToCancelTimer_ms` |
| ProceduralClock | `clockLayout` `clockLayoutXray` `digitImageMap` `getInAnimTrigger` `getOutAnimTrigger` `displayClockFor_s` `staticElements` `shouldTurnToFace` `shouldPlayAudioOnClockUpdates` |
| InitialHeldInPalmReaction | `interruptingBehaviors` |
| DispatchAfterShake | `behaviors` |

If a class is missing from this table, read its `GetBehaviorJsonKeys` and ctor. Factory switch is generated from headers named `behavior*.h`.

---

## 11. Hooking into the live tree

Creating a JSON file is not enough. Something already on the stack must **delegate** to it.

Production spine (`ENGINE-BEHAVIOR-TREE.md`):

```
InitNormalOperation → ModeSelector → SleepCycle → … → GlobalInterruptions → HighLevelAI
                                                                      ├─ reactions / voice
                                                                      └─ HighLevelAI states
                                                                           └─ Observing → ObservingInternal (anon dispatcher)
```

| Want | Edit |
|---|---|
| Voice command | Parent that already lists voice reactions (`basicVoiceCommands.json`, `interruptingVoiceReactions.json`) **or** `respondToUserIntents` + put ID in that dispatcher’s `behaviors` |
| Freeplay idle moment | `observing.json` → `ObservingInternal.behaviors[]` (cooldown object). **Order matters:** first child that wants activate wins. Never put an always-true child above the new one. |
| Physical reaction | `mandatoryPhysicalReactions.json` or `globalInterruptions.json` |
| HLAI state | `highLevelAI.json` states + transitions (heavy; don’t do this for a one-shot anim) |
| Force-run / dev | Webots `behaviorName` + Shift+C, or WebViz Behaviors tab, or a `devBehaviors/` instance |
| After another behavior | `postBehaviorSuggestion` + HLAI resume overrides |

**Cooldown placement:** a child that `WantsToBeActivated` always (`Wait`, HeadOnly idle) **starves everything below it**. Face games were inserted **above** `ObservingOffChargerHeadOnly` for that reason.

---

## 12. User intents

`respondToUserIntents` is an **array**. Each element is passed to `UserIntent::SetFromJSON`. Engine wraps it as `ConditionUserIntentPending` with `"list": <that array>`.

Three shapes (`iConditionUserIntent.cpp`):

1. **Tag only:** `{ "type": "greeting_hello" }` — match tag, ignore params  
2. **Full struct:** `{ "type": "meet_victor", "given_name": "Cam" }` — **all** fields must be present if more than `type`  
3. **Lambda:** `{ "type": "test_name", "_lambda": "test_lambda" }` — named C++ lambda; JSON generators should not use this

`type` is the **union member name** in `userIntent.clad` (also the `UserIntentTag`).

**Void intents (no params)** — complete list from the union:

`unmatched_intent`, `amazon_signin`, `amazon_signout`, `blackjack_hit`, `blackjack_stand`, `blackjack_playagain`, `character_age`, `check_timer`, `imperative_eyecolor`, `explore_start`, `greeting_goodbye`, `greeting_goodmorning`, `greeting_goodnight`, `greeting_hello`, `imperative_abuse`, `imperative_affirmative`, `imperative_apology`, `imperative_come`, `imperative_dance`, `imperative_fetchcube`, `imperative_findcube`, `imperative_lookatme`, `imperative_lookoverthere`, `imperative_love`, `imperative_praise`, `imperative_negative`, `imperative_scold`, `imperative_shutup`, `imperative_quiet`, `imperative_volumeup`, `imperative_volumedown`, `movement_forward`, `movement_backward`, `movement_turnleft`, `movement_turnright`, `movement_turnaround`, `knowledge_question`, `knowledge_unknown`, `names_ask`, `name_victor_setname`, `name_victor_setpronouns`, `name_victor_sayname`, `name_victor_saynameandpronouns`, `name_victor_saypronouns`, `play_anygame`, `play_anytrick`, `play_blackjack`, `play_cubedrive`, `play_fistbump`, `play_keepaway`, `play_pickupcube`, `play_popawheelie`, `play_rockPaperScissors`, `play_rockPaperScissorsRock`, `play_rockPaperScissorsPaper`, `play_rockPaperScissorsScissors`, `play_rollcube`, `seasonal_happyholidays`, `seasonal_happynewyear`, `show_clock`, `show_date`, `silence`, `snake_victor_score`, `status_feeling`, `system_charger`, `system_sleep`, `victor_reboot`, `victor_shutdown`, `victor_shutdown_satisfied`

**Param’d intents** (must include struct fields if not tag-only):

| type | Struct fields |
|---|---|
| `imperative_eyecolor_specific` | `eye_color` string |
| `imperative_volumelevel` | `volume_level` string |
| `global_stop` / `global_delete` | `what_to_stop` string |
| `knowledge_response` / `knowledge_response_bypass` / `knowledge_date_response_igraph` | `answer`, `query_text` |
| `meet_victor` | `given_name` |
| `message_playback` | see `UserIntent_PlaybackMessage` |
| `message_record` | see `UserIntent_RecordMessage` |
| `set_timer` | `time_s` uint |
| `take_a_photo` | `empty_or_selfie` |
| `weather_response` | `speakableLocationString` `isForecast` `condition` `temperature` `temperatureUnit` `localDateTime` |

New cloud intents also need a row in `user_intent_map.json` and unit tests (`behaviors_intents.md`). Pending intents must be claimed in **2–4 engine ticks** or `ReactToUnclaimedIntent` fires.

---

## 13. Animations (not generated by behavior codegen)

To play a **new** animation from a behavior:

1. Clip exists on robot (`DEPS` `victor-animation-assets` / on-robot `animations/*.bin`)
2. Optional group `ag_*` in animation-assets
3. `AnimationTrigger` enum in `clad/src/clad/types/animationTrigger.clad` (`Count` stays last)
4. Map row in `resources/assets/cladToFileMaps/AnimationTriggerMap.json`
5. Behavior JSON `animTriggers: ["YourNewTrigger"]`

Reuse an existing trigger whenever possible. Full enum is ~529 names — read the clad file; do not duplicate it here.

Mood: `emotionEventOnActivated` names live in the mood config (`resources/config/engine/mood_config.json` / emotion events). Invalid names fail verify at load.

### 13.1 Animator → behavior-generator handoff

The two tools do **not** share Maya, WAVs, Wwise event IDs, or keyframes. `vic-anim` already plays those when a trigger/clip is posted. The behavior generator only needs **names and roles**.

Stock Anki handoff (`docs/architecture/animations.md`) was two strings: a **DEPS revision** and one or more **`ag_*` group names**. For two generators to cooperate, expand that into the packet below. Anything not in this packet is either already inside the clip, or is the **behavior author’s** job (when / why), not the animator’s.

**Do not send (behavior generator must ignore):** Maya `.ma`, sprite PNGs, `.wav` / `.wem`, Wwise event hashes, per-keyframe tracks, procedural-face 56-D params. Those never appear in behavior JSON.

**Must send (else the generator cannot emit a working `AnimSequence`):**

| Field | Example | Why |
|---|---|---|
| `animationTrigger` | `ReactToHello` | CLAD ident the behavior puts in `animTriggers[]`. PascalCase, unique, not `Count`. Prefer **reuse** of an existing trigger if the group already maps. |
| `group` | `ag_greeting_hello` | `AnimationTriggerMap.json` `AnimName`. Basename of the group JSON. **Always `ag_*`, never `anim_*`.** |
| `reuseExistingTrigger` | `true` / `false` | If true, generator does **not** add a clad enum or map row; it only references the trigger. |
| `clipsOnRobot` | `true` | Lie here and the robot is silent/still. Clips named in the group must exist as `.bin` on the robot. |

Map row the generator (or a sibling anim-pipeline step) writes when `reuseExistingTrigger` is false:

```json
{ "CladEvent": "ReactToHello", "AnimName": "ag_greeting_hello" }
```

`CladEvent` = trigger. `AnimName` = **group**, not a clip. Confirmed: every production row uses `ag_*`.

**Should send (so the generator picks the right behavior class and doesn’t fight the anim):**

| Field | Values | Why |
|---|---|---|
| `playPattern` | `oneshot` `sequence` `getInLoop` `driveSlots` | `oneshot`/`sequence` → `AnimSequence`. `getInLoop` → `AnimGetInLoop` (needs **three** triggers). `driveSlots` → `DriveToFace` keys `animTooClose` / `initialAnimation` / `animationAfterDrive`. |
| `role` per slot | `oneshot` `getIn` `loop` `getOut` `emergencyGetOut` `tooClose` `success` `driveOverride` `searching` `seesFace` | Which JSON key the name lands in. One group per role. |
| `locksTracks` | `AnimTrackFlag` names the clip actually writes | If the clip drives `BODY_TRACK`, the behavior must not also `DriveToPose` without locking/waiting. Generator may set `tracksToLock` / `tracksToLockWhileActivated`. |
| `approxDuration_ms` | number, optional | **Not** needed for playback (`TriggerAnimationAction` waits for end). Needed only if the behavior also has a `TimerInRange` / search timeout. |
| `canLoop` | bool | Hint for `num_loops` or `AnimGetInLoop`. |
| `renderInEyeHue` | bool, default true | Face sprites vs procedural eyes. |

**Nice to send (behavior does not consume these; they stay in the group file):**

Group JSON (`animationGroupEntry.cpp`): each clip row is `Name`, `Weight`, `Mood`, optional `CooldownTime_Sec`, optional `UseHeadAngle` + `HeadAngleMin_Deg` + `HeadAngleMax_Deg`.

`Mood` ∈ `Default` `LowStim` `MedStim` `HighStim` `Frustrated`. The engine picks a clip from the group at play time. The behavior generator should **not** pick `anim_greeting_hello_01` unless the animator explicitly asks for the `animNames` path (skips mood/weight/head-angle).

Example group the animator already produces — generator never copies this into behavior JSON:

```json
{
  "Animations": [
    { "Name": "anim_greeting_hello_01", "Weight": 0.4, "CooldownTime_Sec": 0.0, "Mood": "Default" },
    { "Name": "anim_greeting_hello_02", "Weight": 0.4, "CooldownTime_Sec": 0.0, "Mood": "Default" }
  ]
}
```

**Animator does not decide these** (behavior author / generator UI does). If the same person is both, they still belong on the **behavior** form, not the anim packet:

- `behaviorID`, `behaviorClass`, tree parent (`ObservingInternal` vs voice dispatcher)
- `respondToUserIntents` (`greeting_hello`, …)
- `wantsToBeActivatedCondition`
- `associatedActiveFeature`, `emotionEventOnActivated`
- cooldowns, weights on a `DispatcherRandom`

**Handoff JSON** the animation creator should emit (one record per “thing Vector should be able to play”):

```json
{
  "schema": "victor.animHandoff.v1",
  "label": "hello greeting",
  "clipsOnRobot": true,
  "playPattern": "oneshot",
  "slots": [
    {
      "role": "oneshot",
      "animationTrigger": "ReactToHello",
      "group": "ag_greeting_hello",
      "reuseExistingTrigger": true,
      "locksTracks": ["HEAD_TRACK", "LIFT_TRACK", "BODY_TRACK", "FACE_TRACK", "AUDIO_TRACK"],
      "approxDuration_ms": 2500,
      "canLoop": false,
      "renderInEyeHue": true
    }
  ]
}
```

`getInLoop` example — three slots, same `playPattern`:

```json
{
  "schema": "victor.animHandoff.v1",
  "label": "listening loop",
  "clipsOnRobot": true,
  "playPattern": "getInLoop",
  "slots": [
    { "role": "getIn", "animationTrigger": "VC_ListeningGetIn", "group": "ag_vc_listening_getin", "reuseExistingTrigger": true },
    { "role": "loop", "animationTrigger": "VC_ListeningLoop", "group": "ag_vc_listening_loop", "reuseExistingTrigger": true, "canLoop": true },
    { "role": "getOut", "animationTrigger": "VC_ListeningGetOut", "group": "ag_vc_listening_getout", "reuseExistingTrigger": true },
    { "role": "emergencyGetOut", "animationTrigger": "VC_ListeningGetOut", "group": "ag_vc_listening_getout", "reuseExistingTrigger": true }
  ]
}
```

**Generator mapping from this packet:**

| `playPattern` | Behavior JSON it fills |
|---|---|
| `oneshot` | `AnimSequence.animTriggers = [slots[oneshot].animationTrigger]` |
| `sequence` | `AnimSequence.animTriggers` = slots in order |
| `getInLoop` | `getIn` `loopAnimation` `getOut` `emergencyGetOut` from roles |
| `driveSlots` | `DriveToFace` `animTooClose` / `initialAnimation` / `animationAfterDrive` / `animDriveOverride` |

If `reuseExistingTrigger` is false, a **separate** anim-pipeline step (not `generateBehaviorCode.py`) must add the clad enum + map row **before** the behavior will play audio/motion. Behavior codegen does not touch `animationTrigger.clad`.

---

## 14. C++ class API (Track B)

Template methods the generator’s C++ backend must fill:

| Method | Role |
|---|---|
| ctor `(const Json::Value& config)` | `ICozmoBehavior(config)`; parse into `_iConfig` |
| `GetBehaviorJsonKeys` | **Every extra root key** as `const char*` literals |
| `GetBehaviorOperationModifiers` | Off-treads / charger / alwaysDelegates / vision modes |
| `GetAllDelegates` | Every behavior this **might** `DelegateIfInControl` |
| `WantsToBeActivatedBehavior` | Class-specific gate (JSON conditions already applied) |
| `OnBehaviorActivated` | Reset `_dVars`; start first action/child |
| `BehaviorUpdate` | Optional; only top-of-stack / in-scope ticks |
| `InitBehavior` | `FindBehavior("Name")` after container exists |

Delegation helpers: `DelegateIfInControl(IActionRunner*)`, `DelegateIfInControl(IBehavior*)`, `DelegateNow`, `CancelSelf`, `CancelDelegates`, `FindBehavior`, `FindAnonymousBehaviorByName`.

Actions worth composing (not a full list): `TriggerAnimationAction`, `DriveToPoseAction`, `TurnTowardsFaceAction`, `TrackFaceAction`, `CompoundActionSequential`, `CompoundActionParallel`. See `docs/architecture/actions.md`.

---

## 15. Validation checklist (generator should run)

1. JSON parses (allow `//` comments)
2. `behaviorClass` ∈ generated `BehaviorClass` enum
3. `behaviorID` matches filename (case-insensitive)
4. No unknown **root** keys vs base ∪ class extra keys
5. `associatedActiveFeature` valid or inherited from an ancestor that sets it
6. Every string in `behaviors` / `delegateID` / `findFaceBehavior` / etc. is either a `BehaviorID` or a sibling/ancestor `behaviorName`
7. `animTriggers[]` ∈ `AnimationTrigger` (not `Count`)
8. Conditions: known `conditionType`; Compound depth ≤ 2
9. `respondToUserIntents[].type` ∈ UserIntent union
10. DispatcherStrictPriority `behaviors` are **strings**; cooldown/random `behaviors` are **objects** with `behavior`
11. AnimSequence: exactly one of `animTriggers` / `animNames`, non-empty
12. After write: `./tools/ai/generateBehaviorCode.py` exits 0
13. Parent tree JSON updated if it should ever run
14. Engine restart; WebViz FreePlay / Behaviors tab shows the ID

---

## 16. Worked recipes for a generator UI

### Recipe 1 — “Play this animation when I say hello”

Track A, class `AnimSequence`. Copy `reactToHello.json`. Change `behaviorID`, filename, `respondToUserIntents`, `animTriggers`, `associatedActiveFeature`. Insert ID into `basicVoiceCommands.json` `behaviors` (string list) if not using an already-listed intent parent.

### Recipe 2 — “In Observing, sometimes do X”

Track A, class `AnimSequence` (or existing leaf). Add as **anonymous** child of `ObservingInternal` **or** as a named instance referenced from `observing.json` cooldown list **above** HeadOnly. Set `cooldown_s` and optional `wantsToBeActivatedCondition` (`TimerInRange`, `FaceKnown`, `FeatureGate`, …).

### Recipe 3 — “See a known face, drive closer, excited anim”

Do **not** write a planner. Compose:

1. Anon `FindFaceAndThen` (as in `comeHereVoiceCommand.json`)
2. Instance `DriveToFace` with `animationAfterDrive: "GreetAfterLongTime"` (or your trigger), `minDriveToFaceDistanceKey_mm: 200`
3. Gate with `FaceKnown` `{ "mustBeNamed": true }` and/or reuse `GreetAfterLongTime` (already in GlobalInterruptions)

### Recipe 4 — Weighted pick among three anims

Anon `DispatcherRandom` with three `AnimSequence` anons, each `weight: 1.0`, `cooldown_s: 0`. Parent cooldown on the random dispatcher.

### Recipe 5 — New C++ class

Only if you need custom `BehaviorUpdate` (e.g. TrackLaser). `createNewBehavior.py` → implement → JSON instance → codegen → compile.

---

## 17. Evidence index

| Concern | File |
|---|---|
| Base JSON keys | `engine/aiComponent/behaviorComponent/behaviors/iCozmoBehavior.cpp` L77–106, L434–474 |
| Modifiers | `iCozmoBehavior.h` `BehaviorOperationModifiers` |
| Factory / IDs | `tools/ai/generateBehaviorCode.py`, `behaviorFactory.cpp` |
| Conditions | `beiConditionFactory.cpp`, `beiConditionTypes.clad`, `conditions/*` |
| Compound | `conditionCompound.cpp` (max depth 2) |
| Cooldown child | `dispatch/helpers/behaviorCooldownInfo.cpp` |
| AnimSequence | `behaviors/animationWrappers/behaviorAnimSequence.cpp` |
| DriveToFace | `behaviors/simpleFaceBehaviors/behaviorDriveToFace.cpp` |
| Tree boot | `docs/mapping/ENGINE-BEHAVIOR-TREE.md` |
| Intents | `userIntent.clad`, `docs/architecture/behaviors_intents.md` |

---

## 18. Machine-readable catalog

Copy this JSON as the generator’s schema seed. `enumFiles` point at the live CLAD sources of record for long enums (`AnimationTrigger`, `BehaviorClass`, `BehaviorID`).

```json
{
  "version": 1,
  "source": "docs/mapping/BEHAVIOR-GENERATOR-SPEC.md",
  "paths": {
    "instanceRoot": "resources/config/engine/behaviorComponent/behaviors",
    "productionTree": "resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree",
    "cppRoot": "engine/aiComponent/behaviorComponent/behaviors",
    "codegen": "tools/ai/generateBehaviorCode.py",
    "createClass": "tools/ai/createNewBehavior.py",
    "factoryOut": "engine/aiComponent/behaviorComponent/behaviorFactory.cpp",
    "classClad": "clad/src/clad/types/behaviorComponent/behaviorClasses.clad",
    "idClad": "clad/src/clad/types/behaviorComponent/behaviorIDs.clad",
    "animTriggerClad": "clad/src/clad/types/animationTrigger.clad",
    "animTriggerMap": "resources/assets/cladToFileMaps/AnimationTriggerMap.json",
    "intentMap": "resources/config/engine/behaviorComponent/user_intent_map.json",
    "bootConfig": "resources/config/engine/behaviorComponent/victor_behavior_config.json"
  },
  "rules": {
    "filenameMatchesBehaviorID": "case-insensitive",
    "commentsAllowed": true,
    "unexpectedRootKeysFail": true,
    "noHotReload": true,
    "anonymousMustNotSetBehaviorID": true,
    "compoundMaxDepth": 2,
    "behaviorAlwaysDelegatesNotInJson": true
  },
  "baseKeys": [
    {"key": "behaviorClass", "type": "string", "required": true},
    {"key": "behaviorID", "type": "string", "required": "non-anonymous"},
    {"key": "alwaysStreamline", "type": "bool", "required": false},
    {"key": "behaviorModifiers", "type": "object", "required": false},
    {"key": "wantsToBeActivatedCondition", "type": "BEICondition", "required": false},
    {"key": "wantsToCancelSelfCondition", "type": "BEICondition", "required": false},
    {"key": "respondToUserIntents", "type": "array", "required": false},
    {"key": "showActiveIntentFeedback", "type": "bool", "required": false},
    {"key": "autoShutOffIntentFeedback", "type": "bool", "required": false},
    {"key": "emotionEventOnActivated", "type": "string", "required": false},
    {"key": "resetTimers", "type": "string[]", "enum": "BehaviorTimerTypes", "required": false},
    {"key": "anonymousBehaviors", "type": "object[]", "required": false},
    {"key": "postBehaviorSuggestion", "type": "string", "enum": "PostBehaviorSuggestions", "required": false},
    {"key": "associatedActiveFeature", "type": "string", "enum": "ActiveFeature", "required": false},
    {"key": "behaviorStatToIncrement", "type": "string", "enum": "BehaviorStat", "required": false},
    {"key": "tracksToLockWhileActivated", "type": "string[]", "enum": "AnimTrackFlag", "required": false},
    {"key": "alterStreamAfterWakeword", "type": "string", "enum": "StreamAndLightEffect", "required": false},
    {"key": "pushTriggerWordResponse", "type": "object", "required": false},
    {"key": "debugLabel", "type": "string", "required": "anonymous-only"},
    {"key": "behaviorName", "type": "string", "required": "anonymous"}
  ],
  "modifiers": {
    "wantsToBeActivatedWhenCarryingObject": {"type": "bool", "default": false, "json": true},
    "wantsToBeActivatedWhenOffTreads": {"type": "bool", "default": false, "json": true},
    "wantsToBeActivatedWhenOnCharger": {"type": "bool", "default": true, "json": true},
    "connectToCubeInBackground": {"type": "bool", "default": false, "json": true},
    "ensuresCubeConnectionAtDelegation": {"type": "bool", "default": false, "json": true},
    "cubeConnectionRequirements": {"type": "string", "default": "None", "values": ["None", "OptionalLazy", "OptionalActive", "RequiredLazy", "RequiredManaged"]},
    "behaviorAlwaysDelegates": {"type": "bool", "default": true, "json": false}
  },
  "jsonFirstClasses": [
    "Wait",
    "AnimSequence",
    "AnimGetInLoop",
    "AnimSequenceWithFace",
    "AnimSequenceWithObject",
    "DispatcherStrictPriority",
    "DispatcherStrictPriorityWithCooldown",
    "DispatcherRandom",
    "DispatcherQueue",
    "DispatcherPassThrough",
    "DispatcherScoring",
    "InternalStatesBehavior",
    "DriveToFace",
    "FindFaceAndThen"
  ],
  "dispatcherChildShapes": {
    "DispatcherStrictPriority": {"behaviors": "string[]"},
    "DispatcherQueue": {"behaviors": "string[]"},
    "DispatcherPassThrough": {"delegateID": "string"},
    "DispatcherStrictPriorityWithCooldown": {
      "behaviors": "object[]",
      "objectKeys": ["behavior", "cooldown_s", "cooldown_random_factor", "ignoreFastForward", "linkedBehaviorTimer", "resetLinkedTimerOnDispatcherActivation"]
    },
    "DispatcherRandom": {
      "behaviors": "object[]",
      "objectKeys": ["behavior", "cooldown_s", "cooldown_random_factor", "ignoreFastForward", "weight"]
    },
    "DispatcherScoring": {
      "behaviors": "object[]",
      "objectKeys": ["behaviorID", "scoring"]
    }
  },
  "animSequenceKeys": {
    "animTriggers": "string[]",
    "animNames": "string[]",
    "num_loops": "int",
    "tracksToLock": "string[]",
    "renderInEyeHue": "bool",
    "xor": ["animTriggers", "animNames"]
  },
  "pathMotionProfile": ["speed_mmps", "accel_mmps2", "decel_mmps2", "pointTurnSpeed_rad_per_sec", "pointTurnAccel_rad_per_sec2", "pointTurnDecel_rad_per_sec2", "dockSpeed_mmps", "dockAccel_mmps2", "dockDecel_mmps2", "reverseSpeed_mmps", "isCustom"],
  "enums": {
    "PostBehaviorSuggestions": ["Invalid", "Socialize", "PlayWithCube", "Nothing", "ReactToPutDownFromPalm", "Sleep", "SleepOnCharger", "SleepOnPalm"],
    "BehaviorTimerTypes": ["Invalid", "DancingCooldown", "FistBump", "ListenForBeatsCooldown", "PlayingWithCube", "ReactToIllumination", "Socializing", "ObservingOnCharger", "ObservingOffCharger", "ReactToTouchPetting"],
    "AnimTrackFlag": ["NO_TRACKS", "HEAD_TRACK", "LIFT_TRACK", "BODY_TRACK", "FACE_TRACK", "EVENT_TRACK", "BACKPACK_LIGHTS_TRACK", "AUDIO_TRACK", "ALL_TRACKS"],
    "StreamAndLightEffect": ["StreamingDisabled", "StreamingEnabled", "StreamingDisabledButWithLight"],
    "BatteryLevel": ["Unknown", "Low", "Nominal", "Full"],
    "OffTreadsState": ["OnTreads", "InAir", "OnBack", "OnLeftSide", "OnRightSide", "OnFace", "Falling"],
    "SimpleMoodType": ["Default", "LowStim", "MedStim", "HighStim", "Frustrated"],
    "EmotionType": ["Happy", "Confident", "Social", "Stimulated", "Trust"],
    "MotionArea": ["Left", "Right", "Top", "Ground", "Any"],
    "MotionLevel": ["High", "Low", "Any"],
    "SalientPointType": ["Unknown", "Object", "Person", "Hand", "Cat", "Dog", "BrightColors"],
    "CubeConnectionType": ["Unspecified", "Background", "Interactable"],
    "FeatureType": ["Invalid", "Laser", "Exploring", "FetchCube", "FindCube", "Keepaway", "ReactToHeldCube", "RollCube", "MoveCube", "Messaging", "ReactToIllumination", "KnowledgeGraph", "Dancing", "CubeSpinner", "GreetAfterLongTime", "AttentionTransfer", "UserDefinedBehaviorTree", "PopAWheelie", "ActiveIntentFeedback", "Alexa", "Alexa_UK", "Alexa_AU", "HeldInPalm", "Volume", "HandDetection", "GazeDirection", "HowOldAreYou", "StayOnChargerUntilCharged", "EyeColorVC", "TestFeature", "PRDemo"]
  },
  "hookHints": {
    "voice": "resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree/reactions/basicVoiceCommands.json",
    "observing": "resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree/highLevelDelegates/observing/observing.json",
    "globalInterrupts": "resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree/globalInterruptions.json",
    "hlai": "resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree/highLevelAI.json"
  },
  "animatorHandoff": {
    "schema": "victor.animHandoff.v1",
    "requiredPerSlot": ["role", "animationTrigger", "group", "reuseExistingTrigger"],
    "requiredRecord": ["clipsOnRobot", "playPattern", "slots"],
    "playPattern": ["oneshot", "sequence", "getInLoop", "driveSlots"],
    "roles": ["oneshot", "getIn", "loop", "getOut", "emergencyGetOut", "tooClose", "success", "driveOverride", "searching", "seesFace"],
    "mapRow": { "CladEvent": "animationTrigger", "AnimName": "group" },
    "groupIsAgPrefix": true,
    "ignoreFromAnimator": ["maya", "wav", "wem", "wwiseEventId", "keyframes", "sprites"],
    "behaviorAuthorNotAnimator": ["behaviorID", "behaviorClass", "respondToUserIntents", "wantsToBeActivatedCondition", "associatedActiveFeature", "emotionEventOnActivated", "treeParent"]
  }
}
```
