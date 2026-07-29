# behaviorComponent

**Path:** `engine/aiComponent/behaviorComponent`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:**
- [`docs/architecture/behaviors.md`](../../../docs/architecture/behaviors.md) — stack concepts, active feature, codegen
- [`docs/architecture/behaviors_intents.md`](../../../docs/architecture/behaviors_intents.md) — user/cloud/app intents
- Parent: [`engine/aiComponent/README.md`](../README.md)

## What this is

The behavior system implementation: data-loaded behavior instances, factory creation, boot-time base selection, runtime stack (delegation tree), message/intent plumbing, and the Behavior External Interface (BEI) that behaviors use to read robot/world state and delegate work. Concrete behavior classes live under `behaviors/`; production *instances* are JSON under `resources/config/engine/behaviorComponent/behaviors/`.

## Why it exists

Engine decides almost all purposeful motion/interaction through behaviors. This component is the only place that holds the stack of active behaviors, maps voice/app intent into that stack, and wires activation conditions to world state.

## Contents (framework, not every behavior)

| Entry | Type | What it is |
|---|---|---|
| `behaviorComponent.h/.cpp` | file | BC entity owner; `GenerateManagedComponents` / Init / Update |
| `behaviorComponents_fwd.h`, `_impl.cpp` | file | `BCComponentID` enum + type map |
| `behaviorSystemManager.*` | file | Stack lifecycle; `IBehaviorRunner` (Delegate/Cancel) |
| `behaviorStack.*` | file | Active stack representation; activatable scope |
| `behaviorContainer.*` | file | `BehaviorID` → `ICozmoBehaviorPtr` registry |
| `behaviorFactory.*` | file | Generated switch: JSON `behavior_class` → C++ class |
| `behaviorsBootLoader.*` | file | Chooses base behavior (onboarding/normal/factory/…) |
| `iBehavior.*` | file | Low-level lifecycle interface (scope/activate/update) |
| `behaviors/iCozmoBehavior.*` | file | Concrete base: JSON config, BEI conditions, intents, modifiers |
| `behaviorExternalInterface/` | dir | BEI facade + robot info, events, audio, delegation |
| `userIntentComponent.*`, `userIntentMap.*`, `userIntents.*` | file | Pending/active intents; cloud/app mapping |
| `asyncMessageGateComponent.*` | file | Tags/subscriptions for behavior messages |
| `activeFeatureComponent.*`, `activeBehaviorIterator.*` | file | Active feature / stack iteration for DAS & status |
| `attentionTransferComponent.*` | file | Attention-transfer coordination |
| `heldInPalmTracker.*`, `sleepTracker.*` | file | Held-in-palm / sleep tracking used by behaviors |
| `onboardingMessageHandler.*` | file | Onboarding message surface |
| `behaviorTimers.*`, `behaviorTreeStateHelpers.*` | file | Timers + tree helpers |
| `stackMonitors/` | dir | Cycle detection + Viz debug monitors |
| `userDefinedBehaviorTreeComponent/` | dir | User-defined tree routing |
| `weatherIntents/` | dir | Weather cloud-intent parsing helpers |
| `behaviorListenerInterfaces/` | dir | Listener IFs for face/object/pet/subtask callbacks |
| `behaviors/` | dir | All C++ behavior implementations (categories below) |

## Key classes and how they fit

### BehaviorComponent (umbrella)

- `IDependencyManagedComponent<AIComponentID>` with id `BehaviorComponent`.
- `GenerateManagedComponents` (`behaviorComponent.cpp` ~L72–235) constructs BC children if missing, pulling config from `RobotDataLoader`:
  - `UserIntentComponent(robot, GetUserIntentConfig())`
  - `BehaviorContainer(GetBehaviorJsons())`
  - `BehaviorsBootLoader(GetVictorFreeplayBehaviorConfig())`
  - plus BSM, BEI, AsyncMessageGate, timers, message handler, trackers, …
- `InitDependent` / `UpdateDependent` init and tick the BC entity only — it does not implement stack logic itself.

### BehaviorFactory / BehaviorContainer / BehaviorsBootLoader

| Piece | Responsibility |
|---|---|
| **BehaviorFactory** | Stateless static creator: `CreateBehavior(const Json::Value&)` returns `ICozmoBehaviorPtr`. Implementation is code-generated (`behaviorFactory.cpp` header: `tools/ai/generateBehaviorCode.py`). |
| **BehaviorContainer** | Takes `BehaviorIDJsonMap` at construction; on init creates/stores behaviors (`CreateAndStoreBehavior`); lookup by ID/class. Owns the living instances the stack points into. |
| **BehaviorsBootLoader** | Config-driven base-behavior selector. Constructor parses `onboardingBehavior`, `normalBaseBehavior`, `postOnboardingBehavior`, `devBaseBehavior` from JSON; hardcodes factory/self-test/PR/acoustic IDs (`behaviorsBootLoader.cpp` ~L53–76). `GetBootBehavior()` is what BSM plants at stack bottom; can reboot stack when onboarding ends. |

Flow: **JSON instances → Container (via Factory) → BootLoader picks base ID → BSM stack holds pointers into Container.**

### BehaviorSystemManager

- Depends on BootLoader + BEI + AsyncMessage for init; UserIntent on update (`behaviorSystemManager.h` ~L56–66).
- `InitDependent` → `InitConfiguration(bootBehavior)` → `ResetBehaviorStack` (`behaviorSystemManager.cpp` ~L75–104).
- Implements delegation API used by behaviors when they yield control to a child behavior.
- Owns `std::unique_ptr<BehaviorStack>`.

### IBehavior → ICozmoBehavior

- `IBehavior`: activation-state machine (NotInitialized → OutOfScope → InScope → Activated); `WantsToBeActivated` / enter-leave scope / activate hooks; holds `BehaviorExternalInterface&` after `Init` (`iBehavior.h`).
- `ICozmoBehavior`: production base — reads JSON, builds `wantsToBeActivatedCondition` list via `BEIConditionFactory`, operation modifiers (charger/off-treads/carrying), user-intent waiters, vision/cube subscriptions, delegates to actions through BEI `DelegationComponent`.

### UserIntentComponent

- Holds **at most one pending** and **one active** user intent; does not queue (`userIntentComponent.h` L145–151).
- Maps cloud JSON / app intents through `UserIntentMap` (config `user_intent_map.json`).
- Manages **trigger word** pending state separately (not a user intent); push/pop anim responses sent to anim process.
- Behaviors gate on pending intents (JSON `respondToUserIntents` or `AddWaitForUserIntent`) and activate with `ActivateUserIntent` / `SmartActivateUserIntent`.
- Full protocol: upstream [`behaviors_intents.md`](../../../docs/architecture/behaviors_intents.md).

### BehaviorExternalInterface (BEI facade)

- Dependency-managed BC component that aggregates pointers to robot/world/AI services behaviors need (FaceWorld, BlockWorld, Mood, Vision, Mic, Map, cube stack, TTS, SDK, SleepTracker, …) — see large `Init(...)` in `behaviorExternalInterface.h` ~L135–173.
- Every `IBehavior` accesses the world through `GetBEI()`; conditions also take `BehaviorExternalInterface&`.

## Config JSON paths

Referenced from code (`engine/robotDataLoader.cpp` unless noted):

| Path under `resources/` | Consumer |
|---|---|
| `config/engine/behaviorComponent/behaviors/` (recursive `*.json`) | `LoadBehaviors` → `GetBehaviorJsons()` → `BehaviorContainer` |
| `config/engine/behaviorComponent/victor_behavior_config.json` | `GetVictorFreeplayBehaviorConfig()` → `BehaviorsBootLoader` |
| `config/engine/behaviorComponent/user_intent_map.json` | `GetUserIntentConfig()` → `UserIntentComponent` |
| `config/engine/behaviorComponent/weather/...` | Weather response / remaps |
| `config/engine/behaviorComponent/cubeSpinnerLightMaps.json` | Cube spinner |

Observed default boot keys in `victor_behavior_config.json`:

```text
onboardingBehavior     → Onboarding
normalBaseBehavior     → InitNormalOperation
devBaseBehavior        → DevBaseBehavior
postOnboardingBehavior → ModeSelector
```

Production tree JSON largely under `behaviors/victorBehaviorTree/`; dev/playpen/self-test under `behaviors/devBehaviors/`.

## Top-level folders under `behaviors/`

Rough purpose only; do not expand every class. Counts are approximate file pairs from tree listing.

| Folder / files | Purpose |
|---|---|
| `iCozmoBehavior.*`, `internalStatesBehavior.*` | Base classes for all behaviors / multi-state helpers |
| `behaviorHighLevelAI.*`, `behaviorWait.*`, `behaviorResetState.*`, … | Root-ish freeplay helpers (HLA, wait, reset, charger stay, look-around, greet) |
| `dispatch/` (~20 files) | Priority/queue/random/scoring dispatchers — tree branching |
| `coordinators/` | Global interrupt / habitat / held-in-palm / in-air / quiet-mode coordinators |
| `reactions/` (~40 files) | Physical & sensory reactions (cliff, shake, sound, voice, put-down, …) |
| `basicWorldInteractions/` | Drive off charger, find faces/cube/home, go home, turn, bump, … |
| `basicCubeInteractions/` | Pickup / put-down / roll / cube drive |
| `simpleFaceBehaviors/` | Face-centric helpers (e.g. drive-to-face / come here) |
| `animationWrappers/` | Generic anim / TTS loop wrappers used by many JSON instances |
| `observing/`, `exploring/`, `freeplay/` | Idle observing and freeplay exploration patterns |
| `heldInPalm/`, `habitat/`, `sleeping/`, `proxBehaviors/` | Mode-specific situational behaviors |
| `onboarding/` | First-run onboarding coordinator and steps |
| `sdkBehaviors/` | SDK lock / override / default |
| `devBehaviors/` (~95 files) | Playpen, self-test, factory, image capture, planner stress, … |
| `alexa/`, `timer/`, `weather/`, `volume/`, `eyeColor/`, `date/` | Feature verticals (voice features / utilities) |
| `danceToTheBeat/`, `cubeSpinner/`, `blackjack/`, `rockPaperScissors/` | Games / entertainment |
| `photoTaking/`, `knowledgeGraph/`, `meetCozmo/`, `messaging/` | Photo, KG answers, meet-Victor, messaging |
| `character/` | How-old / identify-Victor style character answers |
| `robotDrivenDialog/`, `userDefinedBehaviorTree/`, `gateBehaviors/` | Dialog, user tree, cube connect gate |
| `prDemo/`, `rebootRobot/`, `attentionTransfer/`, `performaces/` | PR demo, reboot, attention transfer, “performance” hooks |
| `victor/` | Victor-specific tree helpers (if present in tree) |

Instance JSON under resources mirrors many of these names under `victorBehaviorTree/` and `devBehaviors/`.

## Talks to

- Depends on: parent `AIComponent`; robot worlds/sensors via BEI; `RobotDataLoader` configs; CLAD `userIntent` / `behaviorIDs` / `beiConditionTypes`; `beiConditions/` factory for activation predicates [CONFIRMED].
- Depended on by: rest of engine only through AI/BC getters; anim process for trigger-word response messages; cloud for intent results [CONFIRMED / partially INFERRED for IPC details].

## Build

Part of `cozmo_engine`. Adding a behavior class: `tools/ai/createNewBehavior.py` / `generateBehaviorCode.py` updates factory + CLAD enums (upstream `behaviors.md`).

## Notable observations

- At least one behavior is always active; `Wait` is the no-op base case (upstream `behaviors.md`).
- Only top-of-stack may delegate; ancestors have control delegated away but can cancel self/children.
- `behaviorFactory.cpp` is large generated include/switch — do not hand-edit lightly.
- `performaces/` folder name is misspelled in-tree (upstream spelling).

## Open questions

- [UNKNOWN] Full graph of production stack from `InitNormalOperation` → mode selector → HLA (needs tree plot / unit-test artifacts; `tools/ai/plotBehaviorTree.sh`).
- [UNKNOWN] Rebuild-specific behavior JSON deltas vs stock 1.6 (not diffed here).
- L3 candidates: `BehaviorHighLevelAI`, coordinator priority rules, user-defined tree component.
