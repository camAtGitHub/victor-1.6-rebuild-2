# High-level findings

**Path:** `docs/mapping/HIGH-LEVEL.md`
**Mapped:** 2026-07-28
**Scope:** Cross-cutting architecture observed in this tree (rebuild of Anki Vector 1.6). Not a restatement of upstream docs — those live under `docs/architecture/` and are indexed in `UPSTREAM-DOCS-INDEX.md`.

---

## 1. What this software is

On-robot software for **Anki Vector**, forked from stock firmware **1.6** and modified (`CHANGES.md`). Application processor runs several cooperating processes that talk over **CLAD** messages (local domain sockets / UDP). Historical **Cozmo** names remain everywhere (`cozmoEngine`, basestation comments); product/process names are Vector / `vic-*`.

| Pin | Value |
|---|---|
| `VERSION` | `1.6.1` |
| `VICTOR_COMPAT_VERSION` | `210` |

---

## 2. Process map (the mental model)

```
                    ┌─────────────────────────────────────┐
  App / SDK  ──TCP──┤  vic-cloud (gateway gRPC + cloudproc) │
                    └──────────────┬──────────────────────┘
                                   │ domain sockets
                                   │ (proto preferred; CLAD legacy)
                    ┌──────────────▼──────────────────────┐
                    │  vic-engine  (60 ms)                  │
                    │  behaviors → actions → components     │
                    │  vision thread, world models, path    │
                    └───┬──────────────────────────▲───────┘
                        │ E2R / G2E / A2E CLAD      │ R2E / A2E
            ┌───────────▼──────────┐    ┌──────────┴───────────┐
            │  vic-anim (~16 ms*)  │◄──►│  vic-robot (5 ms)    │
            │  anim/audio/face/mic │    │  motors, path follow │
            │  relays eng↔robot    │    │  HAL → syscon        │
            └──────────────────────┘    └──────────────────────┘

  * Rebuild default ~16 ms (~60 fps); 33 ms if flag file — see animProcess L2.
    Wake word: Picovoice (rebuild), not stock Sensory THF.

Also on robot (not in the 3-way animation triangle):
  vic-switchboard (BLE pair / WiFi / OTA status)
  update-engine
  vic-dasmgr
  camera / ToF / GPIO libs used by engine
```

**Message order:** Engine↔Robot traffic is routed **through anim** so ordering/sync stays coherent for both ends (`docs/architecture/arch_overview.md`). Do not assume a direct eng↔robot UDP path for the main command stream.

**CLAD variants:** Engine uses full C++ CLAD; robot + anim use **C++-lite** (Cozmo-era constrained emitter) for performance (`arch_overview` §Messages).

---

## 3. Control hierarchy (how “doing something” works)

Think **three layers** inside `vic-engine`, not one big loop body:

| Layer | Owns | Typical unit | Mapping |
|---|---|---|---|
| **Behaviors** | AI stack / “what activity am I in?” | `ICozmoBehavior`; stack in `BehaviorSystemManager` | `engine/aiComponent/behaviorComponent/README.md`, `behaviors.md` |
| **Actions** | Discrete closed-loop procedures | Drive, dock, play anim, track face | `engine/actions/README.md`, `actions.md` |
| **Components** | Per-robot capability modules | Vision, Path, Cubes, Mood, Movement, … | `engine/components/README.md`, `dependencyManagedComponents.md` |

Rules of thumb (upstream + confirmed deps):

1. **Almost all intentional activity goes through a behavior** (`behaviors.md`).
2. Behaviors **delegate** to actions or other behaviors; actions: `Init` → `CheckIfDone`.
3. `Robot` is a **dependency-managed entity** (`RobotComponentID` ~60 IDs in `robotComponents_fwd.h`). Nested further: **Robot → AIComponent → BehaviorComponent** (three entity layers).
4. **Tick order is dep-driven, not a hand-written list:** `ActionList` and `Animation` both **depend on `AIComponent`**, so behaviors decide before actions execute on the same tick. See **`docs/mapping/ENGINE-ROBOT-TICK.md`**.
5. **R2E runs before component updates** (`UpdateRobotConnection` then `Robot::Update`) so pose/history is fresh.
6. **Movement:** prefer actions, not raw `MovementComponent` (arch_overview).

```
cozmoEngineMain (60 ms)
  → CozmoAPI::Update → CozmoEngine::Update [Running]
       → RobotManager::UpdateRobotConnection   # R2E / state history
       → RobotManager::UpdateRobot → Robot::Update
            → _components->UpdateComponents()  # topo-sorted
                 → … Vision drain, worlds, sensors …
                 → AIComponent → BehaviorComponent (stack + intents)
                 → ActionList / Animation (after AI)
```

`CozmoEngine` is a **thin lifecycle shell**. Gravity: `robot.cpp` (~2.9k lines) + `aiComponent/` (~635 files).

### Behavior subsystem (compressed)

| Piece | Role |
|---|---|
| `BehaviorFactory` | JSON `behavior_class` → C++ type (codegen `tools/ai/generateBehaviorCode.py`) |
| `BehaviorContainer` | All instances by `BehaviorID` from `RobotDataLoader` JSON |
| `BehaviorsBootLoader` | Base behavior from `victor_behavior_config.json` |
| `BehaviorSystemManager` | Live stack; Delegate/Cancel |
| `UserIntentComponent` | Cloud/app intents (no queue); map via `user_intent_map.json` |
| BEI + `beiConditions/` | Facades + ~60 activation predicates |

Config roots: `resources/config/engine/behaviorComponent/` (`behaviors/**/*.json`, `victor_behavior_config.json`, `user_intent_map.json`).

### Production freeplay tree (normal operation)

Full map: **`docs/mapping/ENGINE-BEHAVIOR-TREE.md`**.

1. **Boot:** `victor_behavior_config.json` → `normalBaseBehavior: InitNormalOperation` (`BehaviorsBootLoader`).
2. **Spine:** `InitNormalOperation` (one-shot wake → `ModeSelector`) → sleep cycle → **coordinator chain** → `GlobalInterruptions` → **`HighLevelAI`**.
3. **Coordinators** (pass-through wrappers): habitat → muted → global interrupts → held-in-palm → in-air — suppress peers; do not re-branch policy.
4. **`GlobalInterruptions`:** strict-priority list (safety, trigger word, timers/weather/photo, voice, palm/air, …) with **`HighLevelAI` last** as freeplay fallback.
5. **`HighLevelAI`:** `InternalStatesBehavior` state machine (`highLevelAI.json`): Observing (on/off charger) ↔ Socializing / PlayingWithCube / Exploring / InvestigateHeldCube; cooldowns in C++ + JSON.
6. **Structure classes:** StrictPriority (+Cooldown), Queue, Random, Scoring, PassThrough — compose the tree; leaves are mostly other JSON behaviors.
7. **Intents:** cloud → `user_intent_map.json` → `UserIntentComponent` pending; claimed via JSON `respondToUserIntents` / conditions; unclaimed → `ReactToUnclaimedIntent`.
8. **`behaviors/freeplay/` C++** is a thin set of games; freeplay *policy* lives in JSON HLAI + `highLevelDelegates/`.

---

## 4. Engine lifecycle states

From `CozmoEngine::Update` (`engine/cozmoEngine.cpp`):

| State | Role |
|---|---|
| `Stopped` | Not running |
| `LoadingData` | `RobotDataLoader` loads configs / assets |
| `ConnectingToRobot` | Link to robot process |
| `Running` | Tick robots via `RobotManager` |

Config and feature gates hang off **`CozmoContext`** (data platform, feature gate, experiments, viz, web service, robot manager) — shared “service locator” style, explicitly not meant to own everything (`cozmoContext.h` header comment).

---

## 5. External surfaces (who talks to engine from outside)

| Surface | Path | Notes |
|---|---|---|
| **Game/UI CLAD** | G2E / E2G via `UiMessageHandler` | Historical “game” = app; in-engine broadcast/subscribe |
| **Proto gateway** | `vic-cloud` ↔ `ProtoMessageHandler` | Modern app/SDK; some protos bridged via `ProtoCladInterpreter` |
| **Web / WebViz** | `victor_web_library` | Engine **8888**, anim **8889** |
| **Cube BLE** | `cubeBleClient` + `components/cubes/` | Prefer `CubeConnectionCoordinator`, not raw comms |
| **Cloud voice/jdocs** | `vic-cloud` cloudproc | Intents → `UserIntentComponent`; mic sockets |

**I/O sketch:** App → `vic-cloud` (TLS gRPC) → domain sockets → engine handlers on `CozmoContext` → Robot components → **E2R** (`engine/comms`) → `vic-robot`. Details: `engine/cozmoAPI/README.md`, `engine/externalInterface/README.md`.

---

## 6. Rebuild-specific deltas that change the mental model

Stock docs describe Anki 1.6. This tree differs — **always check `CHANGES.md`**. High-impact for understanding:

| Area | Rebuild note | Code touchpoint (when known) |
|---|---|---|
| Face rate | 60 fps default (was 30) | `animProcess` config 16 ms step |
| Intent graph | Backported from 1.8 | Behavior system / resources [map under engine AI L2] |
| Cloud | wire-pod friendly; gateway **merged into** `vic-cloud` | `cloud/README.mapping.md` |
| Eyes / lights | Rainbow, Rebuild eyes, WireOS lights toggle | anim + CCIS `CONFIG_MENU.md` |
| Wake word | Picovoice option | CHANGES; mic stack |
| OpenCV | 4.14 mainlined | vision / coretech |
| Vector 2.0 | Hardware support | syscon / platform / anim; **camera = Xray** — see `CAMERA-HW-V1-V2.md` |

---

## 7. Where to look first (fast paths)

| Goal | Start here |
|---|---|
| Process architecture | `docs/architecture/arch_overview.md` + this file |
| One engine tick | **`docs/mapping/ENGINE-ROBOT-TICK.md`** |
| “Why is the robot doing X?” | **`docs/mapping/ENGINE-BEHAVIOR-TREE.md`** then JSON under `resources/config/.../victorBehaviorTree/` |
| “Make it move once” | `engine/actions/README.md` |
| Component inventory | `engine/components/README.md` + `robotComponents_fwd.h` |
| Vision | `engine/vision/README.md` + `VisionComponent` |
| Camera 1.0 vs 2.0 / low light | **`docs/mapping/CAMERA-HW-V1-V2.md`** (Xray ≠ Whiskey; gamma=`1/G`; black-level first) |
| Worlds / map / mood | `engine/blockWorld/`, `navMap/`, `moodSystem/` READMEs |
| External I/O | `engine/cozmoAPI/README.md`, `cloud/README.mapping.md` |
| Build / deploy | `setenv.sh` → `vbuild` |
| Fork deltas | `CHANGES.md` |
| Terms | `docs/mapping/GLOSSARY.md` |

---

## 8. Size & mapping strategy

| Tree | ~Files | Mapping stance |
|---|---:|---|
| `engine/` | 1109 | **Priority.** L2 subsystems + freeplay tree L3 mapped |
| `engine/aiComponent/` | ~635 | Dominates engine; behaviorComponent alone ~half of engine |
| `robot/` | 2516 | Mostly `syscon` / firmware / fixture bulk; L1 process path is small |
| `lib/`, `tools/`, `resources/` | 2500+ each | Top-level only until asked — mostly vendored/assets |

---

## 9. Open architecture questions

- [UNKNOWN] Exact systemd dependency graph / start order for all `vic-*` units (partial: `vic-cloud.service` after engine).
- [CONFIRMED] Drive-to-pose planner selection — ≥40 mm `XYPlanner`, short FaceAndApproach/MinimalAngle; see `ENGINE-PATH-PLANNING.md`.
- [UNKNOWN] Complete Ui vs Proto ownership matrix for every SDK RPC.
- [UNKNOWN] Intent-graph layout vs classic behavior stack after 1.8 backport (CHANGES); configs need diff vs stock.
- [CONFIRMED] Production boot spine through `HighLevelAI` — see `ENGINE-BEHAVIOR-TREE.md` (individual leaves still partial).
- [CONFIRMED] Anim remains eng↔robot message relay (arch_overview); rebuild changes anim frame period, not that topology.

---

## Related mapping docs

- `docs/mapping/UPSTREAM-DOCS-INDEX.md` — every Anki doc one-liner
- `docs/mapping/GLOSSARY.md` — term definitions
- `docs/mapping/ENGINE-ROBOT-TICK.md` — 60 ms tick
- `docs/mapping/ENGINE-BEHAVIOR-TREE.md` — freeplay / HighLevelAI production spine
- `docs/mapping/ENGINE-OBSERVING-AND-INTENTS.md` — Observing + voice intent claims
- `docs/mapping/ENGINE-PATH-PLANNING.md` — drive-to-pose planner selection
- `docs/mapping/PROCESS-IPC.md` — eng/anim/robot/cloud/switchboard IPC
- `docs/mapping/IDEA-personality-packs.md` — **idea:** selectable JSON personality packs
- `docs/mapping/IDEA-backpack-lights-flags.md` — **idea:** `/data/data/enableankilights` + `customBackpackLights/*` (+ Wired)
- `engine/README.md` — engine hub + L2 links
- `animProcess/README.md` — L2 (streamer, face, mic/Picovoice, relay)
- `robot/README.mapping.md` — L2 (supervisor, HAL/spine, syscon shallow)
- Top-level L1 READMEs for all major dirs (AGENTS §6)
