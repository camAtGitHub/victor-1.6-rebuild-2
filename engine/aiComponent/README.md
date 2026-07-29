# aiComponent

**Path:** `engine/aiComponent`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:**
- [`docs/architecture/behaviors.md`](../../docs/architecture/behaviors.md)
- [`docs/architecture/behaviors_intents.md`](../../docs/architecture/behaviors_intents.md)
- [`docs/architecture/beiConditions.md`](../../docs/architecture/beiConditions.md)
- [`docs/architecture/dependencyManagedComponents.md`](../../docs/architecture/dependencyManagedComponents.md)
- Index: [`docs/mapping/UPSTREAM-DOCS-INDEX.md`](../../docs/mapping/UPSTREAM-DOCS-INDEX.md)
- Process map: [`docs/mapping/HIGH-LEVEL.md`](../../docs/mapping/HIGH-LEVEL.md)

## What this is

Root of Vector’s higher-level AI inside `vic-engine`. `AIComponent` is a robot-level dependency-managed component that owns a nested entity of AI subsystems; the largest is `BehaviorComponent` (the behavior stack / tree). Sibling AI helpers cover Alexa, face selection, object-interaction caches, puzzles, salient points, timers, whiteboard sharing, and action/anim continuity.

## Why it exists

Without this tree, engine has no “what should the robot do next” loop: no behavior stack, no voice/app intent routing into behaviors, no data-driven activation conditions, and no AI-side continuity between actions.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `aiComponent.h/.cpp` | file | Robot-level AI owner; builds/updates nested `AIComponentID` entity |
| `aiComponents_fwd.h`, `aiComponents_impl.cpp` | file | `AIComponentID` enum + type links |
| `behaviorComponent/` | dir | Full behavior system — see `behaviorComponent/README.md` |
| `beiConditions/` | dir | BEI condition interface + factory + ~60 condition classes — see `beiConditions/README.md` |
| `aiWhiteboard.h/.cpp` | file | Cross-behavior shared state / post-behavior suggestions |
| `alexaComponent.*` | file | Alexa interaction among anim, engine, app |
| `continuityComponent.*` | file | Smooth transitions between behavior actions and anim streaming |
| `faceSelectionComponent.*` | file | Best face to interact with (uses FaceWorld + mic direction) |
| `objectInteractionInfoCache.*` | file | Caches best objects for interactions |
| `puzzleComponent.*` | file | Puzzle state for Victor puzzle behaviors |
| `salientPointsComponent.*` | file | Salient-point detection info for behaviors |
| `timerUtility.*` | file | Persistent timer-utility state |

## Key entry points

1. **`AIComponent::InitDependent`** (`aiComponent.cpp` ~L69–97) — constructs nested components including `BehaviorComponent`.
2. **`AIComponent::UpdateDependent`** (`aiComponent.cpp` ~L102–106) — ticks nested entity + sudden-obstacle check.
3. **`AIComponentID`** (`aiComponents_fwd.h`) — catalog of AI subcomponents.
4. Descend into **`behaviorComponent/`** for the stack; **`beiConditions/`** for activation predicates.

## Who owns what (stack ownership)

| Layer | Class | Role |
|---|---|---|
| Robot AI shell | `AIComponent` | Owns `BehaviorComponent` and other AI helpers; robot-tick update |
| Behavior umbrella | `BehaviorComponent` | Owns *all* BC subcomponents (container, factory consumers, BSM, intents, BEI, boot loader, …) as a `BCComponentID` entity |
| Runtime stack | `BehaviorSystemManager` | Owns the live `BehaviorStack`; implements `IBehaviorRunner` (Delegate / CancelDelegates / CancelSelf); initializes stack from boot behavior |
| Stack storage | `BehaviorStack` | Push/pop stack of active `IBehavior*`; tracks activatable scope |
| Instance registry | `BehaviorContainer` | Creates/stores every `ICozmoBehavior` instance by `BehaviorID` from JSON |
| Construction | `BehaviorFactory` | Static `CreateBehavior(Json)` → concrete `ICozmoBehavior` subclass |
| Base selection | `BehaviorsBootLoader` | Picks which behavior sits at stack base (onboarding / normal / factory / self-test / …) |

**Answer in one line:** `BehaviorComponent` *owns* the behavior subsystem; `BehaviorSystemManager` *runs* the stack each tick. BSM is a BC child, not a peer of `AIComponent`.

Evidence: `BehaviorComponent` description in `behaviorComponent.h` L7–8 (“maintaining all aspects of the AI system relating to behaviors”); BSM description in `behaviorSystemManager.h` L7–8 (“Manages and enforces the lifecycle and transitions”); BSM init pulls boot behavior and builds stack in `behaviorSystemManager.cpp` `InitDependent` / `InitConfiguration`.

## Stack flow (prose flowchart)

1. **Data load (pre-AI):** `RobotDataLoader` loads all behavior JSON under `config/engine/behaviorComponent/behaviors/`, plus `victor_behavior_config.json` and `user_intent_map.json` (`robotDataLoader.cpp` LoadBehaviors ~L444; config paths ~L964 / ~L1001).
2. **AI init:** `AIComponent::InitDependent` creates `BehaviorComponent` among other AI comps.
3. **BC assemble:** `BehaviorComponent::InitDependent` → `GenerateManagedComponents` wires BC children: `UserIntentComponent` (from intent map), `BehaviorContainer` (from behavior JSON map), `BehaviorExternalInterface`, `BehaviorSystemManager`, `BehaviorsBootLoader` (from freeplay/victor config), message gate, timers, etc. (`behaviorComponent.cpp` ~L72–235).
4. **Boot:** `BehaviorsBootLoader` reads `onboardingBehavior` / `normalBaseBehavior` / … from config; resolves a base `IBehavior*` via `GetBootBehavior()` (default normal base: `InitNormalOperation` per `victor_behavior_config.json`).
5. **Stack start:** `BehaviorSystemManager::InitDependent` calls `InitConfiguration(bootBehavior)` → `ResetBehaviorStack` → first update activates base via `BehaviorStack::InitBehaviorStack`.
6. **Each engine tick:** BSM updates stack; only top of stack has control; it may `Delegate` to another behavior (or actions via `DelegationComponent`). Activatable-scope behaviors (declared via `GetAllDelegates`) still receive updates and may `WantsToBeActivated()`.
7. **Activation gates:** `ICozmoBehavior` evaluates operation modifiers + `wantsToBeActivatedCondition` / intent waiters via `IBEICondition::AreConditionsMet(GetBEI())` (`iCozmoBehavior.cpp` ~L1074–1077).
8. **Intents:** Cloud/app → `UserIntentComponent` maps to user intent → pending → behavior activates intent (often via JSON `respondToUserIntents` or `SmartActivateUserIntent`). See upstream `behaviors_intents.md`.

## Config hooks

| Resource path (under `resources/`) | Loaded by | Used for |
|---|---|---|
| `config/engine/behaviorComponent/behaviors/**/*.json` | `RobotDataLoader::LoadBehaviors` | All behavior instances (ID + class + params) |
| `config/engine/behaviorComponent/victor_behavior_config.json` | `GetVictorFreeplayBehaviorConfig` → `BehaviorsBootLoader` | Base stack selection keys |
| `config/engine/behaviorComponent/user_intent_map.json` | `GetUserIntentConfig` → `UserIntentComponent` | Cloud/app → user intent mapping |
| `config/engine/behaviorComponent/weather/*` | RobotDataLoader weather loaders | Weather intent responses / remaps |
| `config/engine/behaviorComponent/cubeSpinnerLightMaps.json` | RobotDataLoader | Cube spinner lights |

CLAD types live under `clad/src/clad/types/behaviorComponent/` (`behaviorIDs`, `userIntent`, `beiConditionTypes`, `activeFeatures`, …).

## Talks to

- Depends on (robot comps, [CONFIRMED] via `AIComponent::GetInitDependencies`): Animation, CozmoContext, CubeComms, DataAccessor, FaceWorld, Mic, Mood, NVStorage, Vision, VariableSnapshot, RobotStatsTracker; update also BlockWorld, Map, sensors, Movement, PetWorld, VisionScheduleMediator.
- Depended on by: engine `Robot` entity (as `RobotComponentID::AIComponent`); behaviors reach world/mood/vision through BEI facades rather than raw robot pointers.
- Cross-process: cloud intents → engine (`UserIntentComponent` / cloud server); trigger-word response stack messages to anim process.

## Build

Compiled as part of `cozmo_engine` (`engine/CMakeLists.txt`). Behavior factory + BehaviorClass/ID CLAD entries are maintained by `tools/ai/generateBehaviorCode.py` (see factory file header comment). No separate binary for this folder.

## Notable observations

- Dual “BEI” vocabulary: **Behavior External Interface** (`behaviorExternalInterface/`) is the facade object; **BEI Conditions** (`beiConditions/`) are predicates that *consume* that facade. Upstream `beiConditions.md` explains the latter.
- Historical Cozmo naming throughout (`ICozmoBehavior`, Cozmo in include guards).
- `AIComponent` is also registered as an unreliable BC component so BC children can see it without a hard dependency cycle (`aiComponent.h` L33–36 comment).

## Open questions

- [UNKNOWN] Exact engine-tick ordering of `AIComponent` vs action list / vision completion on this rebuild — verify against `Robot::Update` if timing bugs appear.
- [UNKNOWN] Whether rebuild CHANGES.md alters any production base behavior IDs beyond stock Anki 1.6 (config observed matches upstream doc pointers).
- L3 not done: individual coordinator / HighLevelAI state machines, user-defined behavior tree component internals.
