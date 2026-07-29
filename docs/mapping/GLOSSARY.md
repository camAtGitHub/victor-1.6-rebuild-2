# Glossary

**Path:** `docs/mapping/GLOSSARY.md`  
**Mapped:** 2026-07-28  
**Rule:** Define repo-specific terms once here; READMEs and mapping notes link instead of re-explaining.

## How to use this glossary

1. **Prefer this file** for short definitions of Anki/Vector jargon (CLAD, BEI, HLAI, `vic-*`, …). Folder READMEs should link here rather than paste multi-paragraph definitions.
2. **“Seen in”** is evidence, not an exhaustive index — follow those paths (and upstream `docs/architecture/` / `docs/development/`) for full behavior.
3. Tags: **[INFERRED]** = reasoned from layout/names but not fully proven; **[UNKNOWN]** = open gap (also listed at bottom).
4. Do **not** invent product meaning from general Cozmo/Vector knowledge. Only terms observed in this tree’s docs/mapping notes/code comments appear below.
5. Upstream Anki docs describe stock 1.6; this rebuild may differ (`CHANGES.md`). When in doubt, trust code + mapping notes over stock prose.

Terms observed in upstream docs, mapping notes (`docs/mapping/`), and folder READMEs under `engine/`, `platform/`, `cloud/`, `clad/`, etc.

---

## Processes & binaries

| Term | Meaning | Seen in |
|---|---|---|
| **Engine / vic-engine** | Main high-level process. Actions, behaviors, vision, world state. Tick **60 ms** (`BS_TIME_STEP_MS`). Binary / log name `vic-engine`. | `arch_overview.md`, `engine/README.md`, `docs/mapping/ENGINE-ROBOT-TICK.md` |
| **Animation process / Anim / vic-anim** | Process that plays animations/audio, drives the face, processes mics; **relays** Engine↔Robot CLAD for ordering. Stock docs: ~33 ms tick; **this rebuild defaults ~16 ms** (~60 fps face). | `arch_overview.md`, `animProcess/`, `HIGH-LEVEL.md` |
| **Robot process / Supervisor / vic-robot** | Low-level process: motors, docking, path following, HAL. Tick **5 ms / 200 Hz** (`ROBOT_TIME_STEP_MS`). Historical name “supervisor”. | `arch_overview.md`, `robot/README.mapping.md` |
| **vic-cloud** | On-robot Go binary: cloudproc (voice/token/jdocs) **plus** merged gateway (TLS gRPC / grpc-gateway). systemd after engine. | `cloud/README.mapping.md`, `CHANGES.md` |
| **vic-switchboard** | Platform daemon: BLE pairing (RTS), WiFi, OTA status, engine/gateway messaging. | `platform/README.md`, `switchboard-*.md` |
| **vic-dasmgr** | DAS collector/uploader process. | `dasmgr/`, `HIGH-LEVEL.md` |
| **vic-rescue** | Mini pairing / face-display recovery path built with switchboard. | `platform/README.md` |
| **vic-faultCodeDisplay** | Draws fault codes (or special battery images) on the face LCD. | `platform/README.md` |
| **update-engine** | OTA apply tool (C++ + Python); status under `/run/update-engine`. Watched/driven by switchboard. | `platform/README.md` |
| **vic-*** | Product naming prefix for on-robot process binaries/units (`vic-engine`, `vic-anim`, `vic-robot`, …). Historical Cozmo class names often remain inside code. | `HIGH-LEVEL.md`, process READMEs |
| **CozmoEngine** | C++ class owning engine init/update (`engine/cozmoEngine.cpp`). Historical Cozmo name for the Vector engine library core. | `engine/cozmoEngine.h`, `engine/README.md` |
| **CozmoAPI** | Process façade for `vic-engine`: `Start` / `Update`; owns mutex-guarded `CozmoEngine` via `EngineInstanceRunner`. | `engine/cozmoAPI/README.md` |
| **CozmoContext** | Shared “service locator” on the engine: data platform, feature gate, experiments, viz, web service, robot manager; non-owning external/gateway interfaces. Explicitly not meant to own everything. | `HIGH-LEVEL.md`, `engine/cozmoAPI/README.md` |
| **basestation** | Historical Cozmo term still in comments/headers (e.g. vision “basestation vision system”). Not a separate modern process. | `ENGINE-ROBOT-TICK.md`, `engine/README.md` |

---

## Messaging & protocols

| Term | Meaning | Seen in |
|---|---|---|
| **CLAD** | Code-generated message IDL. `.clad` definitions are emitted to C++/Go/Python/C# by tools under `victor-clad/tools/message-buffers/emitters/`. | `docs/development/clad.md`, `clad/README.md`, `victor-clad/` |
| **CPPLite / C++-lite** | Constrained CLAD C++ emitter used by **robot + anim** (Cozmo-era, performance / size). Engine uses full C++ CLAD. `robotViz.Makefile` / `robot_clad_cpplite`; max message size often 1400. | `arch_overview.md` §Messages, `clad/README.md`, `robot/README.mapping.md` |
| **E2R** | Engine→Robot (and Engine→Anim, Anim→Robot per overview table) CLAD: `messageEngineToRobot.clad`. | `arch_overview.md`, `engine/comms/README.md`, `robot/clad/` |
| **R2E** | Robot→Anim / Robot→Engine CLAD: `messageRobotToEngine.clad`. Processed on engine connection pass **before** component updates. | `arch_overview.md`, `ENGINE-ROBOT-TICK.md` |
| **A2E** | Anim→Engine CLAD: `messageFromAnimProcess.clad`. | `arch_overview.md` |
| **A2\*** | Anim-origin robot-interface messages more broadly (robot clad unions include FromAnimProcess paths). [INFERRED] shorthand used in mapping when not distinguishing A2E vs other anim→\* unions. | `robot/README.mapping.md`, `HIGH-LEVEL.md` |
| **G2E** | Game→Engine CLAD: `messageGameToEngine.clad`. “Game” = historical Cozmo name for UI/App/SDK clients. | `arch_overview.md`, `engine/externalInterface/README.md` |
| **E2G** | Engine→Game CLAD: `messageEngineToGame.clad`. Also broadcast/subscribe inside the engine. | `arch_overview.md`, `engine/externalInterface/README.md` |
| **GatewayWrapper** | Protobuf oneof bus for gateway ↔ engine (`IGatewayInterface` Broadcast/Subscribe). Modern app/SDK path via `vic-cloud`. | `engine/externalInterface/README.md`, `engine/cozmoAPI/README.md`, `cloud/README.mapping.md` |
| **IExternalInterface** | Engine abstraction for CLAD Game↔Engine (G2E/E2G) event bus. Implemented by `UiMessageHandler`. | `engine/externalInterface/README.md` |
| **IGatewayInterface** | Engine abstraction for protobuf `GatewayWrapper` bus. Implemented by `ProtoMessageHandler`. | `engine/externalInterface/README.md` |
| **UiMessageHandler** | Implements `IExternalInterface`; G2E/E2G CLAD over sockets. | `engine/cozmoAPI/README.md` |
| **ProtoMessageHandler** | Implements `IGatewayInterface`; `GatewayWrapper` over sockets toward cloud gateway. | `engine/cozmoAPI/README.md` |
| **ProtoCladInterpreter** | Bridges selected gateway protos into CLAD G2E (and some reverse) so legacy CLAD subscribers keep working. | `engine/cozmoAPI/README.md`, `HIGH-LEVEL.md` |
| **RTS** | Robot transport/security protocol over BLE for phone pairing (documented versions v2/v4/v5). | `switchboard-ble-api-*.md`, `switchboard-pairing.md` |
| **spine** | Serial framing link HAL ↔ **syscon** (BodyToHead / HeadToBody). Not CLAD. | `robot/README.mapping.md`, `robot/hal/spine/` |
| **Chipper** | Remote speech/intent cloud service; `vic-cloud` voice stream client (`api-clients/chipper`). | `cloud/README.mapping.md` |
| **wire-pod / Wirepod** | Community local-cloud stack; rebuild loads optional CA and prefers `/data/data/server_config.json`. | `cloud/README.mapping.md`, `CHANGES.md` |

---

## Engine AI / behavior system

| Term | Meaning | Seen in |
|---|---|---|
| **Behavior** | High-level AI unit (`ICozmoBehavior`); stack of active behaviors; only stack tip has control; delegates to actions or other behaviors. | `behaviors.md`, `engine/aiComponent/behaviorComponent/` |
| **ICozmoBehavior** | Production behavior base: JSON config, BEI conditions, intents, modifiers, delegation. | `behaviors.md`, `behaviorComponent/README.md` |
| **IBehavior** | Lower activation-state base (NotInitialized → OutOfScope → InScope → Activated); holds BEI after Init. | `behaviorComponent/README.md` |
| **BehaviorID** | CLAD enum naming a **behavior instance** (JSON file id). Hundreds of entries; regenerated by `tools/ai/generateBehaviorCode.py`. | `behaviors.md`, `clad/.../behaviorIDs.clad`, `WEBVIZ-BEHAVIORS-REVIEW.md` |
| **BehaviorClass** | CLAD enum naming a **C++ behavior type** (linked to `behaviorX.h` / `BehaviorX` class). JSON instances set `"behavior_class"` / class field. | `behaviors.md`, `aiComponent/README.md` |
| **BehaviorFactory** | Code-generated static creator: JSON → `ICozmoBehaviorPtr`. | `behaviorComponent/README.md`, `HIGH-LEVEL.md` |
| **BehaviorContainer** | Registry of live instances: `BehaviorID` → `ICozmoBehaviorPtr`, loaded from `RobotDataLoader` JSON map. | `behaviorComponent/README.md`, `HIGH-LEVEL.md` |
| **BehaviorsBootLoader** | Chooses stack **base** BehaviorID from `victor_behavior_config.json` (`normalBaseBehavior`, onboarding, post-onboarding, dev, …). `GetBootBehavior()` planted by BSM. | `behaviorComponent/README.md`, `ENGINE-BEHAVIOR-TREE.md` |
| **BehaviorSystemManager (BSM)** | Owns the live **behavior stack**; Delegate/Cancel; updates only tip in control; activatable-scope peers still tick. | `behaviors.md`, `behaviorComponent/README.md` |
| **Behavior stack** | Ordered active behaviors; only the last is *in control*; others have control delegated. At least one always active (`Wait` if idle). | `behaviors.md` |
| **Activatable scope** | Behaviors reachable via `GetAllDelegates()` from active stack members; they receive updates and may `WantsToBeActivated()`. | `behaviors.md` |
| **WantsToBeActivated** | Predicate a behavior must pass (plus modifiers like on-charger) before it can become active. | `behaviors.md`, `ENGINE-BEHAVIOR-TREE.md` |
| **BEI** | **Two related uses:** (1) **BEI facade** — `BehaviorExternalInterface`, aggregate API behaviors use to read world/robot services; (2) **BEI conditions** — bool predicates over that facade. Prefer “BEI facade” vs “BEI condition”. | `beiConditions.md`, `beiConditions/README.md`, `behaviorComponent/README.md` |
| **BEI condition** | True/false activation predicate (`IBEICondition`); factory from CLAD `BEIConditionType`; ~60 classes under `engine/aiComponent/beiConditions/`. | `beiConditions.md`, `beiConditions/README.md` |
| **BEIConditionFactory** | Builds condition objects from JSON / type tags for `wantsToBeActivatedCondition` lists. | `behaviorComponent/README.md` |
| **AIComponent** | Robot-level component owning nested **BehaviorComponent** entity and related AI; `ActionList` / Animation depend on it so AI runs first. | `ENGINE-ROBOT-TICK.md`, `aiComponent/README.md` |
| **BehaviorComponent (BC)** | Nested entity under AI: container, factory consumers, BSM, intents, BEI, boot loader, trackers, … keyed by `BCComponentID`. | `aiComponent/README.md`, `behaviorComponent/README.md` |
| **BCComponentID** | Enum of subcomponents inside BehaviorComponent’s dependency-managed entity. | `behaviorComponents_fwd.h`, `behaviorComponent/README.md` |
| **UserIntent** | Cloud/app/voice request structure (CLAD union); mapped via `user_intent_map.json`. | `behaviors_intents.md`, `behaviorComponent/README.md` |
| **UserIntentTag** | Autogenerated tag for a `UserIntent` union member; used in `respondToUserIntents` / wait APIs. | `behaviors_intents.md` |
| **UserIntentComponent** | Holds **at most one pending** and **one active** user intent (no queue); maps cloud JSON; separate trigger-word pending state. | `behaviorComponent/README.md`, `ENGINE-BEHAVIOR-TREE.md` |
| **Trigger word** | Wake-word detection path; pending state managed by `UserIntentComponent` but **not** a user intent. High-priority `TriggerWordDetected` under GlobalInterruptions. | `behaviorComponent/README.md`, `ENGINE-BEHAVIOR-TREE.md` |
| **ActiveFeature** | High-level feature enum (`activeFeatures.clad`) reported to app status / DAS while behaviors run. JSON `associatedActiveFeature`; production tree must define feature or `NoFeature`. | `behaviors.md`, `ActiveFeatureComponent` |
| **ActiveFeatureComponent** | Tracks/broadcasts current ActiveFeature for DAS/status/WebViz. | `behaviorComponent/README.md`, `WEBVIZ-BEHAVIORS-REVIEW.md` |
| **InternalStatesBehavior** | JSON-driven **state machine** behavior: states, interrupting / non-interrupting / exit transitions, get-in behaviors, timer conditions. | `ENGINE-BEHAVIOR-TREE.md`, `internalStatesBehavior.*` |
| **HighLevelAI (HLAI)** | Freeplay policy state machine (`BehaviorHighLevelAI` ⊂ InternalStates); JSON `highLevelAI.json`. Fallback last child of GlobalInterruptions. States: Observing / Socializing / PlayingWithCube / Exploring / … | `ENGINE-BEHAVIOR-TREE.md`, `HIGH-LEVEL.md` |
| **GlobalInterruptions** | `DispatcherStrictPriority` BehaviorID: safety, trigger word, utilities, voice packs, … with **HighLevelAI last**. | `ENGINE-BEHAVIOR-TREE.md` |
| **ModeSelector** | Strict-priority BehaviorID above freeplay: power-off, Alexa, emergency, SDK override, quiet/shut-up; **last** always-activatable child is SleepCycle. | `ENGINE-BEHAVIOR-TREE.md` |
| **SleepCycle** | C++ `BehaviorSleepCycle`: always wants activate; awake path `delegateID` → coordinator chain; sleep/wake with `alwaysWakeReasons`. | `ENGINE-BEHAVIOR-TREE.md` |
| **InitNormalOperation** | Production **boot root** (`normalBaseBehavior`): one-shot `NormalWakeUp`, then forever ModeSelector. | `ENGINE-BEHAVIOR-TREE.md`, `victor_behavior_config.json` |
| **Boot spine / production spine** | Documented freeplay chain: InitNormalOperation → ModeSelector → SleepCycle → coordinators → GlobalInterruptions → HighLevelAI. | `ENGINE-BEHAVIOR-TREE.md`, `HIGH-LEVEL.md` |
| **Coordinator (behavior)** | Pass-through wrapper (`BehaviorDispatcherPassThrough` subclass) that **suppresses** peer activatable scope under conditions (habitat, palm, in-air, global interrupts) without re-branching freeplay policy. | `ENGINE-BEHAVIOR-TREE.md` |
| **DispatcherStrictPriority** | First child that `WantsToBeActivated` wins (`BehaviorDispatcherStrictPriority`). | `ENGINE-BEHAVIOR-TREE.md` |
| **DispatcherStrictPriorityWithCooldown** | Strict priority + per-child cooldowns (e.g. InitNormalOperation). | `ENGINE-BEHAVIOR-TREE.md` |
| **DispatcherQueue / Random / Scoring / PassThrough** | Structural dispatcher classes: ordered children, weighted random, highest score, single delegate. | `ENGINE-BEHAVIOR-TREE.md` |
| **DelegationComponent** | BEI path for behaviors to queue/run actions (and related delegation). | `behaviorComponent/README.md` |
| **ContinuityComponent** | Smooth transitions toward ActionList / anim (e.g. get-outs). Nested under AI, not a RobotComponentID. | `ENGINE-ROBOT-TICK.md`, `actions/README.md` |
| **Freeplay** | Autonomous observing/social/cube/explore policy. Production root is **HLAI + JSON**, not the thin `behaviors/freeplay/` C++ games folder. | `ENGINE-BEHAVIOR-TREE.md` |
| **Onboarding** | Alternate boot root / first-run flow (`onboardingBehavior` → `Onboarding`); not normal freeplay. | `ENGINE-BEHAVIOR-TREE.md`, `victor_behavior_config.json` |
| **SDKOverride / SDK lock** | ModeSelector / GlobalInterruptions entries that hand control to SDK-driven behavior instead of freeplay. | `ENGINE-BEHAVIOR-TREE.md` |
| **QuietMode / ShutUpMode** | ModeSelector verticals that mute or restrict freeplay/voice reactions. | `ENGINE-BEHAVIOR-TREE.md` |
| **RobotDataLoader** | Loads engine configs/assets in `LoadingData` (behaviors JSON, intent map, emotion events, …). | `HIGH-LEVEL.md`, `behaviorComponent/README.md` |
| **victor_behavior_config.json** | Boot keys for BehaviorsBootLoader (`normalBaseBehavior`, onboarding, postOnboarding, dev). | `ENGINE-BEHAVIOR-TREE.md` |
| **user_intent_map.json** | Maps cloud/app intent strings → engine `UserIntent` tags for UserIntentComponent. | `behaviorComponent/README.md` |
| **ExecuteBehaviorByID** | G2E/debug path to force-run a BehaviorID (e.g. WebViz Behaviors tab). | `WEBVIZ-BEHAVIORS-REVIEW.md` |

---

## Actions & components

| Term | Meaning | Seen in |
|---|---|---|
| **Action** | Discrete closed-loop procedure (move head, go to pose, play anim, dock). Lifecycle `Init` → `CheckIfDone`. Building block of behaviors. | `actions.md`, `engine/actions/README.md` |
| **ActionList** | Robot component (`RobotComponentID::ActionList`): map of concurrent `ActionQueue`s; **depends on AIComponent** so updates after AI each tick. | `actions/README.md`, `ENGINE-ROBOT-TICK.md` |
| **ActionQueue** | Sequential slot inside ActionList; runs current `IActionRunner`. | `actions/README.md` |
| **RobotComponentID** | Enum (~60 IDs in `robotComponents_fwd.h`) of dependency-managed components on the engine `Robot` entity. | `dependencyManagedComponents.md`, `ENGINE-ROBOT-TICK.md`, `components/README.md` |
| **Dependency-managed component** | Component with declared init/update deps; `Robot` topo-sorts `UpdateComponents()` (not a hand-written list). | `dependencyManagedComponents.md`, `ENGINE-ROBOT-TICK.md` |
| **Robot (engine class)** | Large engine entity owning pose/history + component map; `Robot::Update` is per-tick heart once connected. Distinct from `vic-robot` process. | `engine/robot.*`, `ENGINE-ROBOT-TICK.md` |
| **RobotManager** | Owns engine-side robot connection + `Robot` instance; `UpdateRobotConnection` (R2E) then `UpdateRobot`. | `ENGINE-ROBOT-TICK.md` |
| **VisionComponent / VisionSystem** | Orchestrates camera frames and async vision pipeline; results drain into FaceWorld/BlockWorld/etc. | `visionSystem.md`, `engine/vision/README.md` |
| **VisionScheduleMediator (VSM)** | Schedules which vision modes run over frames. | `ENGINE-ROBOT-TICK.md`, components |
| **PathComponent** | Engine path-planning / follow interface toward robot path execution. | `planner.md`, `ENGINE-ROBOT-TICK.md` |
| **AnimationComponent** | Engine-side animation commands toward anim process. | `animations.md`, `components/README.md` |
| **MovementComponent** | Low-level motor request surface; arch prefers **actions** over raw movement for intentional activity. | `arch_overview.md`, `ENGINE-ROBOT-TICK.md` |
| **SDKComponent** | Engine surface for SDK-facing state/control. | `ENGINE-ROBOT-TICK.md`, `components/README.md` |
| **VariableSnapshotComponent** | Persists selected variables across sessions (settings/feature-ish state). | `variableSnapshotComponent.md`, AI init deps |
| **Feature gate** | Runtime gates for optional features (e.g. Exploring); hangs off CozmoContext / configs. | `HIGH-LEVEL.md`, `ENGINE-BEHAVIOR-TREE.md` |

---

## Worlds, map, mood

| Term | Meaning | Seen in |
|---|---|---|
| **BlockWorld** | World model for cubes and fiducial-marked objects (3D poses). | `blockWorld.md`, `engine/blockWorld/` |
| **FaceWorld** | Tracks observed human faces / recognition / pose estimates. | `faceWorld.md`, `arch_overview.md` |
| **PetWorld** | Analog of FaceWorld for pet faces (heading, not full 3D pose). | `faceWorld.md` |
| **Nav map / Memory map / MemoryMap** | 2D occupancy/feature map (cliffs, prox obstacles, free space, footprints). Concrete `INavMap` impl is **MemoryMap**. | `map.md`, `engine/navMap/README.md` |
| **MapComponent** | Robot component owning one or more nav maps keyed by pose origin. | `map.md`, `navMap/README.md` |
| **QuadTree** | Spatial **storage** under MemoryMap (split/merge cells); not the semantic map API. | `map.md`, `navMap/README.md` |
| **INavMap** | Interface for nav map operations; factory returns MemoryMap. | `navMap/README.md` |
| **Observable object** | Vision-trackable object with known-size markers for pose. | `observableObjects.md` |
| **Mood / MoodManager** | Vector of scalar emotions (`EmotionType`); event deltas + decay; hooks into anim selection, some behaviors, audio, WebViz. | `emotions.md`, `moodSystem/README.md` |
| **Emotion / EmotionType** | Named affect dimension (e.g. Happy↔Sad), typically **[-1, 1]**, decay toward 0. CLAD `emotionTypes.clad`. | `emotions.md`, `moodSystem/README.md` |
| **Stim / stimulation** | Affective stimulation signal used with mood (e.g. `SendStimToApp`, SimpleMood, HLAI “close face + stim” transitions, face display helper). Exact scalar definition is config/code-driven. | `moodSystem/README.md`, `ENGINE-BEHAVIOR-TREE.md` |
| **SimpleMood** | Coarser discrete mood derived from stimulation + confidence (`GetSimpleMood`). | `moodSystem/README.md`, `simpleMoodTypes.clad` |
| **Emotion event** | Named string event applying affectors (deltas) to one or more emotions; repetition penalties. | `emotions.md`, `moodSystem/README.md` |

---

## Hardware, HAL, sensors

| Term | Meaning | Seen in |
|---|---|---|
| **HAL** | Hardware Abstraction Layer — supervisor interface to syscon and peripherals. | `arch_overview.md`, `robot/hal/` |
| **syscon** | Body MCU firmware (STM32F0): motors, encoders, lights, touch, power, mics path, bootloader. | `arch_overview.md`, `robot/syscon/` |
| **Okao / OKAO** | Omron OKAO face/vision SDK integration. | `okaoVision/`, `visionSystem.md` |
| **Signal Essence** | Third-party mic directionality library. | `mic-systems-overview.md`, `lib/signalEssence/` |
| **Sensory / THF** | Wake-word / speech recognizer stack (Trigger-word / Sensory). | `mic-systems-overview.md` |
| **Picovoice** | Rebuild wake-word option (customizable); listed in `CHANGES.md`. | `CHANGES.md`, `HIGH-LEVEL.md` |
| **Wwise** | Audio middleware used for playback. | `arch_overview.md`, `lib/audio/` |
| **ToF / whiskeyToF** | Time-of-flight range sensors (VL53L1); `ToFSensor` / `whiskeyToF` platform lib; Whiskey/Vector product split in sensors. | `platform/README.md`, `components/README.md` |
| **Cube / light cube** | BLE interactive cube; FW under `robot/cube_firmware/`; host client `cubeBleClient/` + engine cube components. | `cubeConnections.md`, `robot/README.mapping.md` |
| **Breakpad** | Google Breakpad crash dumps via `platform/victorCrashReports` / `lib/crash-reporting-vicos`. | `crash-reports.md`, `platform/README.md` |

---

## Platform, cloud, debug, build

| Term | Meaning | Seen in |
|---|---|---|
| **VICOS** | Vector’s on-robot OS / CMake platform flag (`if (VICOS)`). | root `CMakeLists.txt`, platform/cloud READMEs |
| **Switchboard** | On-robot BLE pairing / WiFi / OTA-status service (RTS protocol versions). | `switchboard-*.md`, `platform/` |
| **jdocs** | JSON documents stored/synced for robot settings/state (cloud jdocs client/server; settings/stats paths). Full schema locations [UNKNOWN]. | `cloud/README.mapping.md`, `components/README.md` |
| **DAS** | Analytics/event reporting (`DASMSG` macros); collected by `vic-dasmgr` / das-client. | `das-events.md`, `dasmgr/`, `lib/das-client/` |
| **Viz** | Debug visualization stream (engine → viz CLAD `messageViz`; Webots viz). | `arch_overview.md`, `clad/vizSrc/` |
| **WebViz** | Embedded web UI for live engine/anim debug (engine port **8888**, anim **8889**); modules under `resources/webserver/`. | `web-server.md`, `WEBVIZ-BEHAVIORS-REVIEW.md` |
| **CCIS** | On-robot configuration / console interface; rebuild adds a CONF menu. | `CONFIG_MENU.md`, `CHANGES.md` |
| **cloudproc** | Go orchestrator inside `vic-cloud`: token, voice, jdocs, logcollector, offboard_vision. | `cloud/README.mapping.md` |
| **Gateway (merged)** | Former `vic-gateway` process; **merged into** `vic-cloud` (`mainGateway` goroutine). | `cloud/README.mapping.md`, `CHANGES.md` |
| **EXTERNALS** | Git submodule for large external deps (`victor-1.6-rebuild-externals`). Out of mapping scope. | `.gitmodules`, `AGENTS.md` |
| **vbuild** | Shell alias → `victor_build_release` → `project/victor/build-victor.sh -c Release …` (after `source setenv.sh`). | `setenv.sh`, `AGENTS.md` Quick answers |
| **vclean** | Removes `_build` and `generated` [INFERRED from Quick answers / setenv tooling]. | `AGENTS.md` Quick answers |
| **factory test / FACTORY_TEST** | Build/options for manufacturing fixtures. | root `CMakeLists.txt`, `robot/fixture/` |
| **WireOS** | Community firmware lineage; several rebuild features ported from it. | `CHANGES.md` |
| **VICTOR_COMPAT_VERSION** | Compatibility pin file; value **210** in this tree. | `VICTOR_COMPAT_VERSION`, `HIGH-LEVEL.md` |
| **VERSION** | Product version pin; **1.6.1** in this tree. | `VERSION`, `HIGH-LEVEL.md` |
| **BS_TIME_STEP_MS** | Engine basestation tick period constant: **60** ms. | `ENGINE-ROBOT-TICK.md`, `cozmoEngineConfig.h` |
| **ROBOT_TIME_STEP_MS** | Robot process tick: **5** ms (200 Hz). | `robot/README.mapping.md`, `cozmoConfig.h` |
| **ANIM_TIME_STEP_MS** | Anim-related step constant in shared config (**16** in this tree — rebuild face rate). | `robot/README.mapping.md`, anim mapping |

---

## Open / expand later

- [UNKNOWN] Exact systemd dependency graph / start order for all `vic-*` units (partial: `vic-cloud.service` after engine).
- [UNKNOWN] Full jdocs schema locations and document type list.
- [UNKNOWN] Intent-graph layout vs classic behavior stack after 1.8 backport (`CHANGES.md`).
- [UNKNOWN] Precise numeric definition of “stim” vs each `EmotionType` in shipping configs.
- [UNKNOWN] Complete Ui vs Proto ownership matrix for every SDK RPC.
- [UNKNOWN] Whether `clad/robot` is symlink or copy of `robot/clad`.
