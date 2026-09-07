# AGENTS.md — victor-1.6-rebuild-2

> **PHASE: DOCUMENTATION & MAPPING (read-only).**
> This repo has not been touched by an AI agent before. The only goal right now is to
> **understand, index, and document** it. Code is not to be changed.

---

## 1. Prime Directive

**Explore. Describe. Do not modify.**

This is Vector's full robot source (Anki firmware 1.6, rebuilt with modifications) — roughly
11,000 tracked files across C++, Go, Python, CLAD, CMake and assets. It is far too large to hold
in one head or one context window. The end state of this phase is: a person or agent opens this
file, reads the Table of Contents, and lands in the right directory in one or two hops.

---

## 2. Hard Rules

⚠️ **THESE MUST NOT BE VIOLATED.**

1. **Do not edit, move, rename, or delete any existing file** unless the user has explicitly asked
   for that specific change in this session.
2. **Never edit source, config, build, or resource files to "clean them up."** No reformatting, no
   lint fixes, no whitespace or line-ending normalisation, no include reordering, no dead-code
   removal, no typo fixes in code or comments.
3. **Do not run builds, `setenv.sh`, `vbuild`, installers, or dependency fetches** unless asked.
4. **Do not touch git state** — no commits, branches, staging, stashing, submodule updates.
5. **Do not initialise or clone the `EXTERNALS` submodule** unless asked. It is a separate repo
   (`Victor-Rebuild/victor-1.6-rebuild-externals`) and is out of scope for this mapping phase.
6. **Do not add tooling** — no linters, formatters, CI configs, hooks, `.editorconfig`, or
   `.gitignore` changes.
7. **`robot_sshkey` at the repo root is a credential file.** Do not open, print, copy, or transmit
   its contents. Reference it by name only.
8. If you believe a change *is* warranted, **stop and propose it**: file, exact change, reason.
   Wait for approval. Never bundle an "obvious" fix into a documentation task.

### The only files you may create or edit in this phase

| Path | Action |
|---|---|
| `AGENTS.md` (this file) | Update §6 Table of Contents and §7 Progress Log only |
| `<subfolder>/README.md` | Create — mapping notes, **only where no upstream README exists** |
| `<subfolder>/README.mapping.md` | Create — where an upstream `README.md` already exists |
| `docs/mapping/*.md` | Create — cross-cutting notes that belong to no single folder |

⚠️ **`docs/` contains real upstream Anki documentation** (`docs/architecture/`,
`docs/development/`). It is the single most valuable thing in the repo. **Never edit or
"improve" it.** Index it, link to it, and treat it as primary evidence — but verify claims
against code where it matters, since it documents stock Anki 1.6 and this tree has been modified.

---

## 3. Repo at a Glance

*(Established from `README.md`, `docs/architecture/arch_overview.md`, and the top-level tree.
Extend during Pass 1 — do not delete.)*

This is Vector's on-robot software. Three processes run on the robot's application processor and
talk to each other over **CLAD** messages (Anki's code-generated message IDL):

- **Engine** (`engine/`) — the "main" process. Actions, behaviors, vision, localization, mapping,
  path planning, sensor processing, cube BLE. Ticks every 60 ms.
- **Animation** (`animProcess/`) — plays animations and audio, drives the face display, processes
  microphone data (Signal Essence for directionality, Sensory for wake word). Ticks every 33 ms —
  inherited from Cozmo so Cozmo animation assets play identically.
- **Robot** (`robot/`) — the low-level layer: motor control, LEDs, docking, path following, HAL,
  syscon (the separate microcontroller), cube firmware.

Plus: **`coretech/`** (Anki's robotics library — vision, planning, messaging, common),
**`cloud/`** (Go, `vic-cloud`), **`platform/`** (OS-level services: switchboard/BLE pairing,
update-engine, logging, camera, crash reporting), and **`victor-clad/` + `clad/`** (message
definitions and the generators that emit C++/Go/Python from them).

Build: bare-metal Linux amd64 or Docker; `source setenv.sh` then `vbuild`. CMake + Ninja + ccache.

**This is a fork.** `CHANGES.md` lists the deltas from stock Anki 1.6 and `VERSION` /
`VICTOR_COMPAT_VERSION` pin the build. Read `CHANGES.md` early — when documenting a subsystem,
note whether behaviour is upstream Anki or rebuild-specific where it is knowable.

---

## 4. Method — Spider Out, Top Down

Work breadth-first. Fully map a level before descending into it.

**Pass 0 — Read the map that already exists.**
Index `docs/architecture/` and `docs/development/` first (see §6 for the file list). Produce
`docs/mapping/UPSTREAM-DOCS-INDEX.md`: one line per upstream doc saying what it covers and which
code directory it describes. This is the cheapest possible orientation and prevents you rewriting
documentation that already exists.

**Pass 1 — Root inventory.**
Confirm the §6 ToC rows against the working tree (this table was seeded from `master`; the local
checkout may differ). Fix any drift. Read `README.md`, `CHANGES.md`, `ABOUT.md`, `CONFIG_MENU.md`,
`DEPS`, `VERSION`, `setenv.sh`, and root `CMakeLists.txt`, and extend §3.

**Pass 2 — Top-level folder READMEs.**
One `README.md` per top-level directory, using the §5 template. Read enough to be accurate:
the directory listing, any existing docs, build files (`CMakeLists.txt`, `BUILD.in`), and a handful
of representative sources. Shallow but honest. Update the ToC row to `mapped-L1`.

**Pass 3+ — Descend.**
Only into children that are substantial or a distinct subsystem. Same template. Stop descending
when a folder is vendored/third-party, generated output, or a flat bucket of homogeneous assets
(animations, sounds, sprites, localized strings) — one line in the parent README is enough there:
what it holds, roughly how many files, and that it was deliberately not expanded.

**Suggested order** (explains the system fastest):
`docs` → root build files → `clad` + `victor-clad` → `engine` → `animProcess` → `robot` →
`coretech` → `lib` → `platform` → `cloud` → `simulator` → `test` → `project` + `tools` +
`cmake` + `build` → `resources` → everything else.

⚠️ **Do not attempt `resources/`, `tools/`, or `lib/` in a single session.** They are 2,500+ files
each and largely third-party or asset data. Map their top level, then stop and ask before going
deeper.

---

## 5. Evidence Rules & Folder README Template

- **Only write what you have observed in this repo.** No filling gaps from general knowledge of
  Vector, Anki, Cozmo, or the wire-pod ecosystem.
- Cite real paths, e.g. `engine/cozmoEngine.cpp:210` or `engine/cozmoEngine.cpp §Init`.
- Tag inferences `[INFERRED]`. Tag gaps `[UNKNOWN]` and leave them in — an honest gap beats a
  confident guess.
- Where an upstream doc already explains something, **link to it rather than restating it**.
- Repo-specific terms (CLAD, BEI, syscon, DAS, Viz, jdocs, Okao, Signal Essence…) go in
  `docs/mapping/GLOSSARY.md`, defined once.

Create as `<folder>/README.md`, under ~150 lines. Omit sections that don't apply.

```markdown
# <folder name>

**Path:** `relative/path/from/repo/root`
**Mapped:** YYYY-MM-DD   **Depth:** L1|L2|L3   **Confidence:** high|medium|low
**Upstream docs:** `docs/...` (or: none found)

## What this is
Two to four sentences, plain language. What responsibility does this folder own?

## Why it exists
What would break or be missing without it.

## Contents
| Entry | Type | What it is |
|---|---|---|
| `subdir/` | dir | one line — see `subdir/README.md` |
| `file.cpp` | file | one line |

## Key entry points
Files or symbols worth reading first, and why.

## Talks to
- Depends on: `path/...` — how (include, CLAD message, IPC, config, build dep)
- Depended on by: `path/...` — how
Mark each [CONFIRMED] or [INFERRED].

## Build
Build files present; whether anything here is generated, and by what.

## Notable observations
Surprising, risky, dead-looking, or contradicts a nearby doc. Rebuild-vs-upstream deltas.

## Open questions
- [UNKNOWN] ...
```

---

## 6. Table of Contents

> Maintained by agents. Seeded from `master` — verify against the working tree in Pass 1.
> File counts are tracked-file counts, rounded, as a size signal only.
> Status: `unmapped` · `in-progress` · `mapped-L1` · `mapped-L2` · `mapped-L3` · `skipped (reason)`

### Root files

| File | What it is |
|---|---|
| `README.md` | Build instructions (bare metal + Docker), install pointer |
| `CHANGES.md` | Deltas from stock Anki 1.6 — **read early** |
| `ABOUT.md` | End-user install / robot onboarding steps |
| `CONFIG_MENU.md` | [UNVERIFIED] on-robot config menu (CCIS) documentation |
| `CMakeLists.txt` | Top of the build |
| `setenv.sh` | Sets up the build environment; defines `vbuild` |
| `DEPS`, `VERSION`, `VICTOR_COMPAT_VERSION` | Dependency manifest and version pins |
| `.gitmodules` | Declares `EXTERNALS` → `victor-1.6-rebuild-externals` |
| `robot_sshkey` | ⚠️ Credential — do not open or print |

### Directories

| Path | Files | Status | What it is |
|---|---:|---|---|
| `docs/` | 63 | mapped-L1 | Upstream arch/dev docs + mapping hub — `docs/README.md`, `docs/mapping/` |
| `engine/` | 1109 | mapped-L2 | `vic-engine` — L2 subsystems + freeplay/path/intents maps; see `engine/README.md` |
| `animProcess/` | 145 | mapped-L2 | `vic-anim`: streamer, face, mic/Picovoice, eng↔robot relay — `animProcess/README.md` + child READMEs |
| `robot/` | 2516 | mapped-L2 | `vic-robot` 200 Hz: supervisor+HAL+spine; syscon/cube/fixture shallow — `robot/README.mapping.md` |
| `coretech/` | 797 | mapped-L1 | CTI: common, messaging, neuralnets, planning, vision — `coretech/README.md` |
| `clad/` | 80 | mapped-L1 | Engine-facing CLAD defs + multi-lang gen — `clad/README.md` |
| `victor-clad/` | 168 | mapped-L1 | CLAD toolchain + SDK-external clad — `victor-clad/README.mapping.md` |
| `lib/` | 2824 | mapped-L1 | Shared/vendored libs (util, audio, DAS, BLE, mic, SE) — top-only `lib/README.md` |
| `platform/` | 311 | mapped-L1 | switchboard, OTA, camera, ToF, GPIO, logs/crash — `platform/README.md` |
| `cloud/` | 187 | mapped-L1 | Go `vic-cloud` gateway+cloudproc — `cloud/README.mapping.md` |
| `resources/` | 2624 | mapped-L1 | Config/assets/WebViz; behavior JSON home — top-only `resources/README.md` |
| `tools/` | 2550 | mapped-L1 | Host tooling (build, SDK, protobuf, gyp bulk) — top-only `tools/README.md` |
| `project/` | 166 | mapped-L1 | `build-victor.sh`, stage/deploy, CI, doxygen — `project/README.md` |
| `simulator/` | 480 | mapped-L1 | Webots (MACOSX) controllers/worlds — `simulator/README.mapping.md` |
| `test/` | 76 | mapped-L1 | Unit tests: engine, animProcess, switchboard — `test/README.md` |
| `matlab/` | 186 | mapped-L1 | Legacy MATLAB vision/research (not in runtime CMake) — `matlab/README.md` |
| `okaoVision/` | 41 | mapped-L1 | Omron OKAO SDK headers/libs for face tracking — `okaoVision/README.md` |
| `cmake/` | 38 | mapped-L1 | Root CMake modules/toolchains — `cmake/README.md` |
| `python/` | 34 | mapped-L1 | Host helpers; live: `anki_build_copy_assets.py` — `python/README.md` |
| `cannedAnimLib/` | 27 | mapped-L1 | Canned-anim + procedural-face lib — `cannedAnimLib/README.md` |
| `crypto/` | 14 | mapped-L1 | Standalone AES/HMAC for Keil rsync (not CMake) — `crypto/README.md` |
| `install-images/` | 11 | mapped-L1 | Screenshots for `ABOUT.md` install guide — `install-images/README.md` |
| `licenses/` | 39 | skipped (license text) | Third-party license texts |
| `templates/` | 9 | mapped-L1 | CMake version `.in` + VS Code bootstrap — `templates/README.mapping.md` |
| `cubeBleClient/` | 8 | mapped-L1 | Cube BLE/sim client — `cubeBleClient/README.md` |
| `webServerProcess/` | 7 | mapped-L1 | Civetweb WebViz lib — `webServerProcess/README.md` |
| `osState/` | 7 | mapped-L1 | OS state + wall-time — `osState/README.md` |
| `dasmgr/` | 7 | mapped-L1 | `vic-dasmgr` DAS collector — `dasmgr/README.md` |
| `build/` | 4 | mapped-L1 | Docker builder helpers — `build/README.md` |
| `testCrash/` | 3 | mapped-L1 | Dev Breakpad harness — `testCrash/README.md` |
| `.github/` | 2 | mapped-L1 | Issue templates only (no CI workflows) — `.github/README.md` |
| `EXTERNALS/` | submodule | ⚠️ out of scope | Separate repo — do not clone or descend |

### Known second-level landmarks (seeded — expand as mapped)

| Path | What it is |
|---|---|
| `docs/mapping/HIGH-LEVEL.md` | Cross-cutting process + control hierarchy |
| `docs/mapping/PROCESS-IPC.md` | Eng/anim/robot/cloud/switchboard sockets + CLAD families |
| `docs/mapping/ENGINE-ROBOT-TICK.md` | 60 ms tick: R2E → Robot → AI → actions; vision async |
| `docs/mapping/ENGINE-BEHAVIOR-TREE.md` | Production freeplay spine: InitNormalOperation → … → HighLevelAI |
| `docs/mapping/ENGINE-OBSERVING-AND-INTENTS.md` | Observing freeplay branch + voice/user-intent claim path |
| `docs/mapping/ENGINE-PATH-PLANNING.md` | Drive-to-pose: PathComponent planner selection |
| `docs/mapping/WEBVIZ-BEHAVIORS-REVIEW.md` | WebViz Behaviors/BehaviorConds review notes |
| `docs/mapping/WEBVIZ-FREEPLAY-DESIGN.md` | FreePlay WebViz module design (no-C++; multi-subscribe; Ops grid §5; dual-theme) |
| `docs/mapping/WEBVIZ-FREEPLAY-PLAN.md` | FreePlay v1 implementation plan (phased; Allowed APIs; S1–S9) — **shipped** |
| `docs/mapping/WEBVIZ-FREEPLAY-UX-PLAN.md` | FreePlay Ops UX uplift (P1–P6) — **implemented**; P7 docs closeout |
| `resources/webserver/webVizModules/freeplay.js` | Production FreePlay: Ops stack\|log + gates; client log tags; latest-factor gates; secondary timeline |
| `webviz-ux-demo.html` | Standalone Ops vs Timeline mock (reference only; not robot-deployed) |
| `docs/mapping/GLOSSARY.md` | ~130 repo terms |
| `docs/mapping/CAMERA-HW-V1-V2.md` | Camera 1.0 vs Whiskey vs Xray/2.0; AWB rails; Session B VicOS ignore; software WB after debayer |
| `docs/mapping/CAMERA-SESSION-B-PLAN.md` | Session B plan + protocol: bypass + manual WB Apply/lock |
| `docs/mapping/CAMERA-SOFTWARE-WB-PLAN.md` | In-engine software WB Phases 1–2 (manual RGB multiply) |
| `docs/mapping/CAMERA-SOFTWARE-WB-PHASE3-PLAN.md` | Phase 3 auto + Xray Viz RGB2BGR fix (vizManager) |
| `docs/mapping/CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md` | Auto walk-down: absolute integrator + slew; **implemented**, awaiting Session E |
| `docs/mapping/IDEA-backpack-lights-flags.md` | Idea: Anki lights flag + customBackpackLights folder + Wired option |
| `docs/mapping/IDEA-personality-packs.md` | Idea: selectable JSON freeplay personality packs (+ voice activate) |
| `docs/mapping/IDEA-custom-firmware-vibe-brainstorm.md` | Ideation: 8 wild firmware personas / Soul Profile spine (wiki character lens) |
| `docs/mapping/IDEA-circadian-soul-constitution.md` | Idea: Hermit-by-day / Owl-by-night circadian firmware character constitution |
| `docs/mapping/IDEA-tornado-spin-reaction.md` | Idea: flat table spin (fast yaw) → tornado anim + actions |
| `docs/mapping/KINETIC-FAMILIAR.md` | **Saved charter:** Kinetic Familiar name + goal/intent (what’s-first TBD) |
| `docs/mapping/KINETIC-FAMILIAR-SPR.md` | Memora SPR engram for cross-session / voice continuity |
| `docs/mapping/KINETIC-FAMILIAR-VOICE-SYSTEM-PROMPT.md` | Voice AI prompt: no repo access; self-contained Kinetic Familiar + stack briefing |
| `docs/mapping/IDEA-firmware-direction-amended.md` | Read-back that led to Kinetic Familiar (historical; see charter) |
| `docs/mapping/IDEA-affect-micro-library.md` | ~20 nonverbal affect beats (eyes/motion/chirps) for firmware dialect |
| `docs/mapping/TODO-overheat-backpack-lights.md` | Charger-cooldown v1 **implemented** (clad/map/`if`s + stock JSON); 41 °C; Phase 5/`vbuild` + on-robot A/B not run |
| `docs/mapping/OVERHEAT-BACKPACK-LIGHTS-PLAN.md` | Overheat backpack lights charger-cooldown v1 plan (Phases 1–4 landed; 5 + on-robot A/B pending) |
| `docs/mapping/TODO-anki-deleted-recovery.md` | Hunt Anki deletions on `kercre123/victor`; restore candidate **Singing** (VIC-24); SimpleVoiceResponse / snake notes |
| `engine/components/cubes/` | L2 cube BLE/coordinator/lights stack |
| `animProcess/src/cozmoAnim/{animation,faceDisplay,micData,speechRecognizer,audio,…}/` | L2 anim subsystems |
| `robot/supervisor/`, `robot/hal/`, `robot/clad/` | L2 control path; `robot/syscon/` L1 shallow |
| `robot/cube_firmware/BUILD.html` | End-to-end **build a Vector cube** guide (HW/FW/BLE/markers); assets in `build-guide-assets/` |
| `engine/aiComponent/` | L2 README — nested AI entity |
| `engine/aiComponent/behaviorComponent/` | L2 — stack, factory, intents, BEI (decision core) |
| `engine/aiComponent/beiConditions/` | L2 — ~60 activation predicates |
| `engine/components/` | L2 — most RobotComponentID impls |
| `engine/actions/`, `engine/vision/` | L2 — action queues; VisionSystem detectors |
| `engine/cozmoAPI/`, `externalInterface/`, `comms/` | L2 — external + robot I/O |
| `engine/blockWorld/`, `navMap/`, `moodSystem/` | L2 — worlds / map / mood |
| `engine/cozmoEngine.cpp/.h`, `cozmoContext.*`, `robot.*` | Lifecycle + component entity |
| `engine/tools/engined/cozmoEngineMain.cpp` | `vic-engine` main |
| `animProcess/src/cozmoAnim/cozmoAnimMain.cpp` | Process main for `vic-anim` |
| `platform/switchboard/`, `platform/update-engine/`, `platform/camera/`, `platform/whiskeyToF/`, `platform/config/` | Platform services |
| `cloud/cloud/main.go`, `cloud/cloud/message_handler.go`, `cloud/vic-cloud.service` | Cloud process entry + systemd unit |
| `robot/hal/src/main.cpp`, `robot/supervisor/`, `robot/syscon/`, `robot/clad/` | `vic-robot` entry; 5 ms tick; spine↔syscon |
| `robot/core/`, `robot/cube_firmware/`, `robot/fixture/` | Shared core; cube FW; factory fixture (not expanded) |
| `coretech/common/`, `messaging/`, `neuralnets/`, `planning/`, `vision/` | CTI targets `cti_*`; clad_src in common + vision |
| `resources/assets/` | `LocalizedStrings`, `RewardedActions`, `cladToFileMaps`, `cubeFirmware`, `faceOverlays` |

### Upstream documentation index

`docs/architecture/` — `README.md`, `arch_overview.md`, `whats_in_victor.md`, `actions.md`,
`animations.md`, `behaviors.md`, `behaviors_intents.md`, `beiConditions.md`, `blockWorld.md`,
`cubeConnections.md`, `dependencyManagedComponents.md`, `emotions.md`, `faceWorld.md`, `map.md`,
`neuralNets.md`, `observableObjects.md`, `physical_vs_sim.md`, `planner.md`, `poses.md`,
`proceduralFace.md`, `variableSnapshotComponent.md`, `visionSystem.md`

`docs/development/` — `build-instructions.md`, `prerequisites-osx.md`, `clad.md`,
`compiler-options.md`, `debugging.md`, `profiling.md`, `logging.md`, `das-events.md`,
`crash-reports.md`, `alexa.md`, `mic-systems-overview.md`, `perf-metric-tool.md`,
`performance_results.md`, `self-test-errors.md`, `switchboard-pairing.md`,
`switchboard-ble-api-v2/v4/v5.md`, `time.md`, `vscode.md`, `web-server.md`, `licenses.md`

`docs/` root — `DEPS.md`, `FAQ.md`, `build-system-walkthrough.md`, `ccache.md`,
`mac-client-setup.md`, `mic_capture.md`

### Quick answers

*(Populate as they become known — this is the "find it fast" layer.)*

- **Where does the engine start?** — Process main: `engine/tools/engined/cozmoEngineMain.cpp`
  (`LOG_PROCNAME = "vic-engine"`). Library: `CozmoAPI` → `Anki::Vector::CozmoEngine`
  (`engine/cozmoEngine.cpp` `Init` ~L248, `Update` ~L352). Tick **60 ms**
  (`BS_TIME_STEP_MS` in shared config). CMake: `import(cozmo_engine "engine")`. See `engine/README.md`.
- **Where are behaviors defined?** — Framework: `engine/aiComponent/behaviorComponent/`.
  **Production tree:** `docs/mapping/ENGINE-BEHAVIOR-TREE.md` — boot
  `victor_behavior_config.json` → `InitNormalOperation` → … → `GlobalInterruptions` →
  `HighLevelAI` (JSON under `resources/config/.../victorBehaviorTree/`). Factory:
  `BehaviorFactory`. Intents: `UserIntentComponent` + `user_intent_map.json`.
  **Tick:** AI before ActionList (`ENGINE-ROBOT-TICK.md`).
- **Where are animations stored vs. played?** — **Played** by `vic-anim` `AnimationStreamer`
  (`animProcess/src/cozmoAnim/animation/`). Engine `PlayAnim` → anim process. Tick default
  **16 ms** (rebuild 60 fps); **33 ms** if `/data/data/rebuild/using-30-fps`. Face:
  streamer → `faceDisplay` → LCD. **Assets:** DEPS animation-assets + `cannedAnimLib/`.
  See `animProcess/README.md` L2.
- **Where are CLAD messages defined, and what generates the C++/Go/Python?** —
  **Defs:** `clad/src/`, `robot/clad/src/`, `coretech/*/clad_src/`, `victor-clad/clad/`.
  **Toolchain:** `victor-clad/tools/message-buffers/emitters/` + `victorEmitters/`.
  **Outputs:** `generated/clad*`. IPC map: `docs/mapping/PROCESS-IPC.md`.
- **How do processes talk?** — Eng↔anim↔robot over Unix domain sockets; **anim relays** E2R/R2E
  (engine connects to anim, not robot). Cloud proto socket preferred; switchboard separate.
  Details: `PROCESS-IPC.md`.
- **Where does the build begin, and what does `vbuild` actually run?** — `source setenv.sh` →
  `vbuild` → `project/victor/scripts/victor_build_release.sh` → `project/victor/build-victor.sh`
  (VICOS/Release/Ninja). Modules: `cmake/`. Docker: `build/`. See `project/README.md`.
- **What runs on the robot vs. off it?** — **On robot:** `vic-engine` (60 ms), `vic-anim`
  (~16 ms), `vic-robot` (5 ms/200 Hz + spine to syscon STM32), `vic-switchboard`,
  `update-engine`, `vic-cloud`, `vic-dasmgr`. **Off robot:** Webots `simulator/` (MACOSX),
  host `tools/`, `test/`. Low-level path: `robot/supervisor/` + `robot/hal/`.
- **How does freeplay / voice work?** — `ENGINE-BEHAVIOR-TREE.md` +
  `ENGINE-OBSERVING-AND-INTENTS.md`. Wake word in anim: **Picovoice** (rebuild; stock docs
  said Sensory). Cloud intent → pending UserIntent → claim or unclaimed.
- **Where is FreePlay WebViz (debug UI)?** — Tab **FreePlay** on engine WebViz (`:8888`):
  `webVizModules/freeplay.js` multi-subscribes `behaviors` + `behaviorconds` (no C++
  producer). **Ops layout:** narrow stack \| wide transition log (from→to, client tags) +
  full-width gates (**latest factors** for owner — not time-aligned to scrubbed log).
  Secondary collapsed timeline optional. Design: `WEBVIZ-FREEPLAY-DESIGN.md` §5; UX plan
  P1–P6 shipped: `WEBVIZ-FREEPLAY-UX-PLAN.md`. Stock Behaviors/BehaviorConds tabs stay.
- **How does drive-to-pose work?** — `ENGINE-PATH-PLANNING.md`: ≥40 mm → `XYPlanner` (threaded);
  short moves → FaceAndApproach / MinimalAngle. Robot path follower runs on `vic-robot`.
- **Which parts are rebuild-specific vs. stock Anki 1.6?** — `CHANGES.md`. Observed: wirepod
  cloud, anim 16 ms, platform OTA/diagnostics notes. Upstream `docs/` = stock 1.6.
- **Version pins** — `VERSION` = `1.6.1`; `VICTOR_COMPAT_VERSION` = `210`.
- **Camera 1.0 vs 2.0 / low light?** — **Xray** (`HW_VER` ≥ `0x20`): different camera; Whiskey ≠ camera. Gamma is **`x^(1/G)`**. VicOS AWB **ignored** (Session B). In-engine software WB: Xray Viz keeps pre-`17ecb816` showable path; ManualWB `SetGains(B,G,R)`. **`SoftwareWBAuto` Session E PASS** (settle ~1.17/1/1.19, walk-down works); firmware default still false. Map: `CAMERA-HW-V1-V2.md` Status.
- **Glossary / indexes** — `docs/mapping/GLOSSARY.md`, `UPSTREAM-DOCS-INDEX.md`, `HIGH-LEVEL.md`.
- **Custom firmware north star (ideation)?** — **Kinetic Familiar** — saved charter
  `docs/mapping/KINETIC-FAMILIAR.md` (name + goal/intent locked; what’s-first TBD). Hermit/night-lock
  retracted. Affect beats: `IDEA-affect-micro-library.md`. Voice/off-repo continuity:
  `KINETIC-FAMILIAR-VOICE-SYSTEM-PROMPT.md` + `KINETIC-FAMILIAR-SPR.md`.
- **Deleted Anki leftovers we could restore?** — Hunt on **`kercre123/victor`** (`git log --diff-filter=D`, `master...snowboy`), not this 2026-root clone. Catalog + **Singing** (VIC-24) + SimpleVoiceResponse notes: `docs/mapping/TODO-anki-deleted-recovery.md`. Overheat lights: `TODO-overheat-backpack-lights.md`. Snake is already on Victor-Rebuild **master** (oelinux pin `1ca901bb`), not this `cam_explore` HEAD.
- **Overheat backpack lights?** — Charger-cooldown v1 **wired**: clad + map + stock JSON + anim `if`s. Plan: `docs/mapping/OVERHEAT-BACKPACK-LIGHTS-PLAN.md`. Needs rebuild + on-robot A/B. Off-charger overheat still unwired (v1.1).

---

## 7. Progress Log

Append one line per session. Newest at the bottom. Every session ends with §6 and §7 accurate;
if you ran out of context mid-folder, say so here.

| Date | Agent | Did | Next |
|---|---|---|---|
| 2026-07-28 | Grok (orchestrator + 6 subagents) | Pass 0 index + glossary. Pass 1 root + Quick answers. Wave1 L1: `clad`, `victor-clad`, `engine`, `animProcess`, `cloud`, `platform`. | Wave2. |
| 2026-07-28 | Grok (+ 3 subagents) | Wave2 L1: `robot`, `coretech`, six small dirs. | High-level + engine L2. |
| 2026-07-28 | Grok (+ 5 subagents) | High-level + engine L2 subsystem READMEs. `engine/` → mapped-L2. | L3 freeplay tree. |
| 2026-07-28 | Grok (+ 1 subagent) | **L3 vertical chosen:** production freeplay / HighLevelAI (not cubes, not planner). Wrote `docs/mapping/ENGINE-BEHAVIOR-TREE.md`; linked from HIGH-LEVEL + Quick answers. Boot spine: InitNormalOperation → ModeSelector → SleepCycle → coordinators → GlobalInterruptions → HighLevelAI. | Next if needed: one HLAI state (e.g. Observing/Exploring) deeper, or voice-intent claim path; not more menus. |
| 2026-07-28 | Grok | Captured product idea: **selectable personality packs** (JSON freeplay policy; user choose + possible voice “activate X mode”) → `docs/mapping/IDEA-personality-packs.md`. | Idea only until feature phase; design then implement. |
| 2026-07-28 | Grok | Reviewed WebViz Behaviors + BehaviorConds (no code changes). Wrote `docs/mapping/WEBVIZ-BEHAVIORS-REVIEW.md`. | Continue mapping. |
| 2026-07-28 | Grok (+ 7 subagents) | Top-level L1 closeout + engine L3 (observing/intents/path/cubes). Glossary ~134. | High-value L2: anim + robot. |
| 2026-07-28 | Grok (+ 3 subagents) | **High-value finish:** `animProcess/` → mapped-L2 (8 child READMEs: animation, face, mic, speechRecognizer, audio, TTS, backpack, alexa; Picovoice wake word). `robot/` → mapped-L2 (supervisor, HAL/spine, clad, core; syscon L1 shallow). `docs/mapping/PROCESS-IPC.md` (sockets + anim relay). Quick answers updated. | Mapping phase complete for high-value paths. Remaining optional: intent-graph 1.8 diff, deep asset trees, syscon firmware internals. |
| 2026-07-29 | Grok | Captured idea: Anki backpack lights via `/data/data/enableankilights` + auto custom lights from `/data/data/customBackpackLights/*` (Wired option) → `docs/mapping/IDEA-backpack-lights-flags.md`. Links existing CCIS/CHANGES. | Feature phase: verify if already coded; else implement flag/folder + Wired. |
| 2026-08-02 | Grok | Brainstormed no-C++ WebViz modules; designed **FreePlay** (multi-subscribe behaviors+behaviorconds; stock tabs stay; token dual-theme). Spec: `docs/mapping/WEBVIZ-FREEPLAY-DESIGN.md`. | User approved LGTM; rename WEBVIZ-* group; implementation plan next. |
| 2026-08-02 | Grok | Wrote **implementation plan** `docs/mapping/WEBVIZ-FREEPLAY-PLAN.md` (Phase 0 Allowed APIs + Phases 1–6 shell/CSS/registry/module/verify; success S1–S9). | Execute plan (shell multi-channel → freeplay.js → S1–S9). |
| 2026-08-02 | Grok | Theme catch-up: FreePlay design+plan drop `module-host--ops`; light `.module-host` + content tokens; shell dark/light via `WebVizTheme`/`#btnThemeToggle` already shipped. | Execute updated plan. |
| 2026-08-02 | Grok | **FreePlay implemented:** shell multi-channel retain/fan-out (`app.js`), registry (`config.js`), `webVizModules/freeplay.js` (stack/log/gates; content tokens; no C++). Design status → implemented. | Runtime S1–S9 on robot/devData; optional README one-liner. |
| 2026-08-02 | Grok | Reviewed `webviz-ux-demo.html`: **Ops > Timeline** for freeplay debug. Wrote UX uplift plan `docs/mapping/WEBVIZ-FREEPLAY-UX-PLAN.md` (Ops layout, stack/log/gates polish, nice-to-haves beyond demo; timeline optional). | Execute UX plan P1 layout first (`freeplay.js` only). |
| 2026-08-02 | Grok | **FreePlay UX P1–P6 complete** in `freeplay.js` (Ops grid, stack/log/gates polish, P5 filters/keyboard/silence, P6 secondary timeline). **P7 docs closeout:** UX plan status→implemented; design §5 Ops wireframe + honesty notes; AGENTS landmarks/quick answers; demo HTML pointer comment. | Runtime U1–U11 on robot/devData if desired; no further UX-plan phases. |
| 2026-08-07 | Grok | Cube hardware deep-dive + **end-to-end build guide** `robot/cube_firmware/BUILD.html` (DA14580/BMA253/BOM/pinout/BLE/DFU/markers; Path A stock silicon + Path B protocol clone; bundled images in `build-guide-assets/`). | Optional: print-ready marker pack; Path B sample firmware. |
| 2026-08-23 | Grok | Camera 1.0 vs 2.0 (Xray ≠ Whiskey): AE/AWB, `DebayerGamma`, black-level stretch, dead temporal denoise, observed AWB 3.8/1/3.8 vs ~1.5/1.8. Wrote `docs/mapping/CAMERA-HW-V1-V2.md`; glossary + HIGH-LEVEL + Quick answers. | Feature phase if wanted: stop AWB at TooDark, Xray-only AE/gamma, wire TemporalDenoiseGreen. |
| 2026-08-23 | Grok | User: v2 is **a lot darker**, not just greener, at same 66/3.8. Updated `CAMERA-HW-V1-V2.md` §3/§5/§8: tone curve (gamma 2.1, black −6) + smaller pixels; AE has no headroom. | Night gamma/black-level skip first if implementing. |
| 2026-08-27 | Grok | Overheat backpack lights: JSON in WireOS pack is never selected (clad/map/`if`s reverted). Captured easy-win TODO `docs/mapping/TODO-overheat-backpack-lights.md` (41 °C charger cooldown; do not implement until asked). | Feature phase: restore four thermal triggers + anim selection. |
| 2026-09-02 | Grok | Read `docs/ANKI-Vector-Robot-Wiki.pdf` character §§8.1–8.5; SCAMPER + reverse brainstorm for a custom firmware with a different feel. Wrote `docs/mapping/IDEA-custom-firmware-vibe-brainstorm.md` (8 wild personas + Soul Profile spine). | User picks 1–2 personas to deepen into a character constitution; no implementation yet. |
| 2026-09-02 | Grok | User chose Hermit+Owl as **one circadian soul**. Wrote `docs/mapping/IDEA-circadian-soul-constitution.md` (pillars, day/night love languages, taboos, Soul Profile spine). | Approve/edit constitution; then design or `/make-plan` when feature phase opens. |
| 2026-09-02 | Grok | Recorded user idea: flat table spin (fast rotate) → tornado animation + actions → `docs/mapping/IDEA-tornado-spin-reaction.md` (sibling to `ReactToRobotShaken`). | Implement only when feature phase opens; design detector thresholds first. |
| 2026-09-02 | Grok | User read-back: retract Hermit; want new eyes/PNG movies/motion/chirps + pounce L/R/aggressive + speed-racer + lights/easy wins; keep sound-first; park rival/glitch/archivist. Wrote `IDEA-firmware-direction-amended.md` + `IDEA-affect-micro-library.md`. | Confirm Kinetic Familiar; then prioritize A/B/C buckets when feature phase opens. |
| 2026-09-02 | Grok | **Saved charter:** `docs/mapping/KINETIC-FAMILIAR.md` — name **Kinetic Familiar** + goal/intent/pillars/wishlist/parked locked; what’s-first explicitly deferred. Quick answer + landmark. | Open feature phase / pick first slice only when user asks. |
| 2026-09-02 | Grok | Wrote Memora **SPR** `KINETIC-FAMILIAR-SPR.md` + full **voice/cross-model system prompt** `KINETIC-FAMILIAR-VOICE-SYSTEM-PROMPT.md` (charter + affect + dense engine/anim/robot latent map). | Paste system prompt into voice AI for off-repo design talk; update SPR after big decisions. |
| 2026-09-02 | Grok | Rewrote voice system prompt for **no codebase/tools** voice AIs: self-contained stack briefing, forbid fake file reads, voice-first turns. | Paste `KINETIC-FAMILIAR-VOICE-SYSTEM-PROMPT.md` BEGIN–END block into voice model. |
| 2026-09-06 | Grok | Reviewed external vision notes on green/dark camera: **agreed** gamma study was backwards (`debayer.cpp` `1/G`; 2.1 brightens more than 1.7); black-level first; WB-off test invalid; TemporalDenoiseGreen unfit; path bugs. Revised `CAMERA-HW-V1-V2.md` + Quick answers. | Feature phase only when asked: black-level A/B → commanded WB → path consistency. |
| 2026-09-06 | Grok | Console-first camera plan: §7 lists exact `:8888/consolevars` **category tabs + var names** for Session A (0 deploys) vs missing knobs for Session B (1 instrumented deploy). | User runs Session A on robot; then decide Session B knobs. |
| 2026-09-06 | Grok | **Session A live** on `192.168.50.189`: gamma 1.7 darker / 2.5 brighter (confirms `1/G`); `UnderExposedThreshold=0` no AWB/green change; rail 66/3.8/AWB3.8. Logged in `CAMERA-HW-V1-V2.md` §7. | Session B when ready: 1 deploy with black-level bypass + manual WB. |
| 2026-09-06 | Grok | **Session B instrumentation implemented** (no flash yet): `DebayerBypassBlackLevel`; `ManualWB_R/G/B` + `ApplyManualWhiteBalance` + lock/Clear; cvcatalog shard; plan `CAMERA-SESSION-B-PLAN.md`. | User rebuild/deploy; run B0–B3 on `192.168.50.189`. |
| 2026-09-06 | Grok | **Session B live:** bypass = no visible change; Apply WB updates overlay through extremes (3.8/1/0.25, 0.25/1/3.8) but **image colour unchanged** → VicOS AWB not applied. Logged in `CAMERA-HW-V1-V2.md` §7. | Next fix path: software WB in this repo and/or VicOS daemon (prebuilt). |
| 2026-09-06 | Grok | **Session C live (software WB):** T0 identity OK; T1 `(2,1,1)` → hella **blue**; T2 `(1,1,2)` → very **red**. Multiply works; **R/B labels swapped** vs perception. | Fix R/B map in Apply `SetGains`; re-A/B; then Phase 3 auto. |
| 2026-09-06 | Grok | **Phase 3 + R/B display fix:** Xray always `COLOR_RGB2BGR` (vizManager); MirrorMode unswap; `ScopedIdentity`+`InvalidateRGB`; `SoftwareWBAuto` (default off) + hold/rails; HAL pin 1,1,1. | Flash; re-A/B T1 red/T2 blue; then enable `SoftwareWBAuto`. |
| 2026-09-06 | Grok | **Software WB Phases 1–2 implemented** (`SoftwareWhiteBalance` after `GetRGBFromBAYER`; Apply pins daemon AWB 1,1,1 and multiplies pixels). **Phase 4 docs:** plan `CAMERA-SOFTWARE-WB-PLAN.md`, `CAMERA-HW-V1-V2.md` §7–§8, cvcatalog Apply/Clear/ManualWB blurbs, AGENTS landmark + quick answer. | On-robot Phase 2 colour A/B; Phase 3 auto gated on pass. |
| 2026-09-06 | Grok | **Phase 3 + R/B display fix:** Xray always `COLOR_RGB2BGR` (vizManager); MirrorMode unswap; `ScopedIdentity`+`InvalidateRGB`; `SoftwareWBAuto` (default off) + hold/rails; HAL pin 1,1,1. | Flash; re-A/B T1 red/T2 blue via vizManager; then enable `SoftwareWBAuto`. |
| 2026-09-06 | Grok | **Session D:** T1 red / T2 blue (**R/B PASS**). Auto → **2.5/1/2.5 purple**, mug colours wrong; bright light no change. Auto disabled. | Fix auto: reset integrator, lower/slew rail, walk-down when lit. |
| 2026-09-06 | Grok | **Pause camera:** MaxGain 1.3 trial still stuck (milder purple; yellow→blue). Docs Status in `CAMERA-HW-V1-V2.md`; Phase3 plan marked auto-v1 fail; Quick answers updated. `SoftwareWBAuto=false` on robot. | Resume: `/make-plan` or implement auto walk-down/integrator fix. |
| 2026-09-07 | Grok | **Daytime auto peek:** MaxGain 1.3 → still 1.3/1/1.3, EXP/GAIN 66/3.8; bluer; yellow→blue, cyan→yellow, blue mug→yellow/brown. Auto off. Logged in `CAMERA-HW-V1-V2.md` Session D. | Same next: walk-down/integrator plan when ready. |
| 2026-09-07 | Grok | **Revert Xray display RGB2BGR** (expert: Session C was label mismatch, not wrong Viz). Restore Xray showable copy + MirrorMode `SetFromImageRGB2BGR`; ManualWB `SetGains(B,G,R)` for perceived-red control. Keep walk-down auto code. | Flash; verify real R/G/B objects with SW WB off/(1,1,1); then ManualWB_R=2 → warmer. |
| 2026-09-07 | Grok | **Session E PASS:** display natural; ManualWB R→red B→blue; auto settled ~1.17/1/1.19 (no green); darken → gains walked (~0.996…1.070). Logged in `CAMERA-HW-V1-V2.md`. | Optional: leave auto on; tune rails live; or commit docs. |
| 2026-09-07 | Grok | **Phase 3 docs for auto walk-down fix:** persisted `CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md` (**Implemented**, awaiting Session E); Status + Session E protocol in `CAMERA-HW-V1-V2.md`; Phase3 banner; catalog slew knob already present. No C++ this pass. | Flash + Session E (well-lit settle below rail; dark→bright walk-down). |
| 2026-09-07 | Grok | Anki-deletion hunt: snake 2018 original is `kercre123/victor` (`0b3bafc`); rebuild master productized it (`1ca901bb` / oelinux submodule), this `cam_explore` HEAD does not. Wrote `docs/mapping/TODO-anki-deleted-recovery.md` (hunt method, **Singing**/VIC-24, SimpleVoiceResponse, catalog). Linked from overheat TODO + Quick answers. No C++. | Feature phase only when asked: Wwise bank check then Singing force-run; or fetch rebuild master for snake. |
| 2026-09-07 | Grok | **Overheat backpack lights v1:** restored four triggers + map + stock JSON + checkpoint charger-cooldown `if`s (`charging && disconnected` on contacts). No `conditionHighTemperature` / no `IS_STATUS_FLAG_SET`. Plan `OVERHEAT-BACKPACK-LIGHTS-PLAN.md`. | Rebuild clad + flash; on-robot 41 °C A/B. Optional v1.1 `isBatteryOverheated` bit. |

---

## 8. Session Etiquette

- Work in **small, resumable chunks**. Finish a folder, write its README, update §6 and §7, then
  move on. Never leave a folder half-documented across a context break.
- Read §6 and §7 before starting. **Do not re-map anything marked `mapped`** — extend it instead.
- If a listing would blow your context, sample: list one level, count children, descend selectively.
- Prefer `git ls-tree` / `find -maxdepth` over recursive dumps on the big trees.

---

## 9. Exit Criteria for This Phase

- [x] `docs/mapping/UPSTREAM-DOCS-INDEX.md` exists and covers every file in `docs/`.
- [x] Every top-level directory has a README (or `README.mapping.md` / skipped with reason) and a current ToC row.
- [x] Substantial second-level dirs documented or explicitly not expanded: engine L2+; `lib`/`tools`/`resources` L1 top-only; `robot` syscon/firmware bulk named not expanded; `licenses` skipped.
- [x] `docs/mapping/GLOSSARY.md` covers terms used across READMEs (~134 entries).
- [x] §6 "Quick answers" populated (engine, behaviors, anim, CLAD, build, on/off robot, freeplay/voice, path, rebuild, versions).
- [~] `git status` shows **added documentation** + modified `AGENTS.md` only for mapping — verify before commit. (Root may also have unrelated untracked HTML demos; do not treat as mapping deliverables.)

**Satisfactory for navigation (2026-07-28):** A reader can open `AGENTS.md` §6 / `docs/mapping/HIGH-LEVEL.md` and reach process entry points, freeplay tree, tick order, IPC, anim L2, robot control path L2, and any top-level folder in one or two hops.

**High-value process paths (finished):** engine L2+L3 freeplay/path/intents · anim L2 · robot supervisor/HAL L2 · `PROCESS-IPC.md`.

Do not propose refactors, fixes, or feature work until the user says this phase is over.
