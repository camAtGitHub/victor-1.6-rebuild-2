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
| `resources/webserver/index.html` | Themed home landing (`:8888`/`:8889`); sparklines/overlay/catalog — see `docs/mapping/WEBSERVER-HOME.md` |
| `docs/mapping/WEBSERVER-HOME.md` | Home chrome map: endpoints, local vendor/Inter, ENGINE checkbox bits, no extra polls; PerfMetric legend/budget, overlay, theme label, cross-port nav |
| `webviz-ux-demo.html` | Standalone Ops vs Timeline mock (reference only; not robot-deployed) |
| `docs/mapping/GLOSSARY.md` | ~130 repo terms |
| `docs/mapping/CAMERA-HW-V1-V2.md` | Camera 1.0 vs Whiskey vs Xray/2.0; AWB rails; Session B VicOS ignore; software WB after debayer |
| `docs/mapping/CAMERA-SESSION-B-PLAN.md` | Session B plan + protocol: bypass + manual WB Apply/lock |
| `docs/mapping/CAMERA-SOFTWARE-WB-PLAN.md` | In-engine software WB Phases 1–2 (manual RGB multiply) |
| `docs/mapping/CAMERA-SOFTWARE-WB-PHASE3-PLAN.md` | Phase 3 auto + Xray Viz RGB2BGR fix (vizManager) |
| `docs/mapping/CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md` | Auto walk-down: absolute integrator + slew; **implemented**, awaiting Session E |
| `docs/mapping/CAMERA-NIGHT-BRIGHTNESS-PLAN.md` | Night brightness: `NightGammaAuto` AE-pegged DebayerGamma lift; **Phase 1 implemented**, Session F after flash |
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
| `docs/mapping/CPU-OVERHEAT-BACKPACK-LIGHTS-PLAN.md` | CPU-hot backpack: `CpuOverheated` + `LowBatteryCpuOverheated`; custom packs need the two JSON (exclusive overlay) |
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
- **Where is the themed webserver home?** — `resources/webserver/index.html` on engine
  `:8888` / anim `:8889` (`home-chrome.css`, `home-spark.js`, `home-catalog.js`,
  `home-overlay.js`; local `vendor/` + Inter). Sparklines/flags/overlay reuse
  `/getperfstats` + `/getenginestats` (no extra polls). PROCESSES default **3000 ms**.
  PERF METRIC: selected series only, legend under the plot. Header **Animation**/
  **Engine** cross-port links. ENGINE checkbox bits honored in
  `engine/cozmoEngine.cpp` (empty lines). Map: `docs/mapping/WEBSERVER-HOME.md`.
- **How does drive-to-pose work?** — `ENGINE-PATH-PLANNING.md`: ≥40 mm → `XYPlanner` (threaded);
  short moves → FaceAndApproach / MinimalAngle. Robot path follower runs on `vic-robot`.
- **Which parts are rebuild-specific vs. stock Anki 1.6?** — `CHANGES.md`. Observed: wirepod
  cloud, anim 16 ms, platform OTA/diagnostics notes. Upstream `docs/` = stock 1.6.
- **Version pins** — `VERSION` = `1.6.1`; `VICTOR_COMPAT_VERSION` = `210`.
- **Camera 1.0 vs 2.0 / low light?** — **Xray** (`HW_VER` ≥ `0x20`): different camera; Whiskey ≠ camera. Gamma is **`x^(1/G)`**. VicOS AWB **ignored** (Session B). In-engine software WB: Xray Viz keeps pre-`17ecb816` showable path; ManualWB `SetGains(B,G,R)`. **`SoftwareWBAuto` defaults on for Xray** (`IsXray()`). **`NightDebayerGamma` default 3.0**; `NightGammaAuto` still default **false** (enable for night lift). Map: `CAMERA-HW-V1-V2.md` Status.
- **Glossary / indexes** — `docs/mapping/GLOSSARY.md`, `UPSTREAM-DOCS-INDEX.md`, `HIGH-LEVEL.md`.
- **Custom firmware north star (ideation)?** — **Kinetic Familiar** — saved charter
  `docs/mapping/KINETIC-FAMILIAR.md` (name + goal/intent locked; what’s-first TBD). Hermit/night-lock
  retracted. Affect beats: `IDEA-affect-micro-library.md`. Voice/off-repo continuity:
  `KINETIC-FAMILIAR-VOICE-SYSTEM-PROMPT.md` + `KINETIC-FAMILIAR-SPR.md`.
- **Deleted Anki leftovers we could restore?** — Hunt on **`kercre123/victor`** (`git log --diff-filter=D`, `master...snowboy`), not this 2026-root clone. Catalog + **Singing** (VIC-24) + SimpleVoiceResponse notes: `docs/mapping/TODO-anki-deleted-recovery.md`. Overheat lights: `TODO-overheat-backpack-lights.md`. Snake is already on Victor-Rebuild **master** (oelinux pin `1ca901bb`), not this `cam_explore` HEAD.
- **Overheat backpack lights?** — Charger-cooldown v1 **wired**: clad + map + stock JSON + anim `if`s. Plan: `docs/mapping/OVERHEAT-BACKPACK-LIGHTS-PLAN.md`. Needs rebuild + on-robot A/B. Off-charger overheat still unwired (v1.1).
- **CPU-hot backpack lights?** — `CpuOverheated` / `LowBatteryCpuOverheated` via OSState::GetTemperature_C() ≥ kCpuOverheatBackpackTemp_C (90). Not charger-cooldown Overheated. JSON in stock, WireOS, both example custom packs. Live `/data/data/customBackpackLights/` must get the two files + anim restart. Needs rebuild + fake-temp A/B.

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
| 2026-09-07 | Grok | **Session F2:** `NightGammaAuto=true` at 66/3.8 → marginally brighter, colour OK (AWB ~1.13/1/1.19). F3 unpeg restore pending. | User adds light for F3; then decide default-on / higher night G / Phase 2 probe. |
| 2026-09-07 | Grok | Defaults: **`NightDebayerGamma=3.0`**; **`SoftwareWBAuto=IsXray()`** (on for 2.0). | Flash; confirm Xray boots with SW WB on; night G 3.0 when NightGammaAuto enabled. |
| 2026-09-07 | Grok | **Phase 3 docs for auto walk-down fix:** persisted `CAMERA-SOFTWARE-WB-AUTO-FIX-PLAN.md` (**Implemented**, awaiting Session E); Status + Session E protocol in `CAMERA-HW-V1-V2.md`; Phase3 banner; catalog slew knob already present. No C++ this pass. | Flash + Session E (well-lit settle below rail; dark→bright walk-down). |
| 2026-09-07 | Grok | Anki-deletion hunt: snake 2018 original is `kercre123/victor` (`0b3bafc`); rebuild master productized it (`1ca901bb` / oelinux submodule), this `cam_explore` HEAD does not. Wrote `docs/mapping/TODO-anki-deleted-recovery.md` (hunt method, **Singing**/VIC-24, SimpleVoiceResponse, catalog). Linked from overheat TODO + Quick answers. No C++. | Feature phase only when asked: Wwise bank check then Singing force-run; or fetch rebuild master for snake. |
| 2026-09-07 | Grok | **Overheat backpack lights v1:** restored four triggers + map + stock JSON + checkpoint charger-cooldown `if`s (`charging && disconnected` on contacts). No `conditionHighTemperature` / no `IS_STATUS_FLAG_SET`. Plan `OVERHEAT-BACKPACK-LIGHTS-PLAN.md`. | Rebuild clad + flash; on-robot 41 °C A/B. Optional v1.1 `isBatteryOverheated` bit. |
| 2026-09-07 | Grok | **NightGammaAuto Phase 1 + docs:** AE-pegged DebayerGamma lift (`NightGammaAuto` default false, night G 2.5, hysteresis 15). Plan `CAMERA-NIGHT-BRIGHTNESS-PLAN.md`; Status + Session F in `CAMERA-HW-V1-V2.md`. Phase 2 probe not built. | Flash + Session F (F0–F3). Phase 0b soak may already be on robot (DebayerGamma 2.5). |
| 2026-09-08 | Grok | **CPU-hot backpack lights:** CpuOverheated + LowBatteryCpuOverheated (clad/map/JSON×4 packGs + anim ifs + catalog). User JSON from /tmp. Custom is exclusive overlay. | Rebuild clad+anim; fake CPU 92 A/B; copy JSON onto live custom pack if CUSTOM LIGHTS ON. |
| 2026-09-10 | Grok | **Webserver home closeout:** themed home chrome, local CDN vendor + Inter, sparklines/flag pills/overlay, `/getenginestats` checkbox bits. Docs: `WEBSERVER-HOME.md` + `resources/webserver/AGENTS.md`. | scp/flash + on-robot smoke. |
| 2026-09-10 | Grok | Home follow-up (no extra polls): PerfMetric drop forced tick-budget + legend under plot; PROCESSES default 3000 ms; overlay hint + backpack rounded-rect; Theme: dark/light footer; header Animation/Engine cross-port. | scp + hard-refresh; on-robot smoke. |

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

## 10. Coding Standards


### General formatting

###### Comments
* Standard comment block at the top of each file with the format:
* Note: Header and cpp can share the same description

```c++
/**
 * File: vehicleAIComponent
 *
 * Author: raul
 * Created: 02/10/14
 *
 * Description: Vehicle component for AI that makes high level decisions, such as
 *              item or target selection, who to evade, etc.
 *
 * Copyright: Digital Dream Labs, Inc. 2017
 *
 **/
```

* Use `//` commenting everywhere else (including above functions)

* Descriptive comments are mandatory for types defined in a header
   * Not mandatory for the main class of the file (since it’s in the file block)

* Add descriptive comments for all class members or at least for groups of members in header
   * Not mandatory for constructor/destructor/operators


###### Spaces / tabs

* No tabs at all. Insert spaces instead: 2 spaces per indent
* Max Column width: 108 characters ( so we don't have to side scroll when reviewing changes in GitHub )
* Return type on same line as function
* Space after comma in arguments
* No space between function name and open parenthesis
* Namespaces don't add tab/space indentation
   * Exception for pre-declaration sections in headers, where compact and indented declarations are more readable.
```c++
namespace Anki {
  namespace Cozmo {
    namespace MicData {
      class MicDataInfo;
    }
  }
  namespace Util {
    namespace Data {
      class DataPlatform;
    }
  }
}


namespace Anki {
namespace Util {

class MyClass {
  void MyMethod();
}

} // namespace
} // namespace
```

#### Brackets

* Brackets are required for one-line blocks (prevents nasty bugs from omission mistakes)

```c++
if (myBool) {
  myDo();
}
```

* For functions, brackets “{“ on separate line after closing declaration, with the exception of empty bodies and one-line accessors (get/set) in header files.

```c++
void myFunction()
{
}
```

* Loops, if/else blocks can have brackets in the same line or in new line, whatever makes the code easier to read based on your judgement.

* Always group logic within parentheses

```c++
if ( myvar == yourvar && hisvar == hervar )     // BAD
if ((myvar == yourvar) && (hisvar == hervar)) // GOOD

// even when operator precedence does not require it
int number = a - b * c;       // BAD
int number = a - (b * c);   // GOOD
```

## Preprocessor

### `#ifdef`
* All header files must be wrapped with `#ifndef` / `#endif` with the format:

`__Folder1_FolderN_ClassOrFilename_H__`

eg: /Basestation/metagame/achievements/achievementTypes.h:

```c++
  #ifndef __Metagame_Achievements_AchievementTypes_H__
  #define __Metagame_Achievements_AchievementTypes_H__
    ...
  #endif // __Metagame_Achievements_AchievementTypes_H__
```

* Use `UNIT_TEST` for unit test specific code in basestation/drive. Should be little to nothing.


### `#if`

* Do not use #ifdef, but `#if`, for conditional code (prevents omission/inclusion mistakes)

* Define macro value for `#if` in the most confined scope possible. For example, if only 1 function uses it, define right before its usage. Generally this means a cpp file rather than a header file.

* Use brackets to delimit the scope of variables inside the clause

```c++
          void myFun()
          {
            #define MY_DEBUG 0
            #if MY_DEBUG
            {
              int thisVarIsOnlyHere = 0;
              printf(“\n”);
            }
            #endif
          }
```

* Indent the `#if` clause to the level it belongs to in the scope, not to the left
* Use `ANKI_DEVELOPER_CODE` to strip out code that should not be present in shipping product.


## Macros

* Minimize the use of macros, and replace with inlined functions whenever possible
* For macros that use arguments, make sure function calls or modifications of variables aren’t passed in, since they may be executed multiple times. This would be avoided with proper inlined functions.


## `#include`
* In some cases, consider pointers instead of objects for members, when big headers would be required to define the type. This allows forward declaration instead.
* Make sure there are no cyclic dependencies when designing systems (for example, in our current codebase: basestation includes metagame includes ankiutils, but not the other way around.
* Use complete path for local / project includes
* Prefer deeper folder structure when designing your component. Don't add a top-level folder unless you are adding a top-level component.
* Format:
   * Corresponding header must be the first included. 
   * Then from local to global namespace

```c++
#include “myFile.h”
#include “userPathY/userFileA.h” // from local to global, then in alphabetic order
#include “userPathY/userFileB.h” // from local to global, then in alphabetic order
#include “userPathX[a][b][c][d]/userFileA.h” // from local to global, then in alphabetic order
#include “userPathX/userFileB.h” // from local to global, then in alphabetic order
#include <systemFile>


//////////////////////////////////////////////////////////////////////////////////
// example of VehicleAIComponent.cpp
// note how basestation, metagame, util are packed together from local to global
// note how files within namespaces are alphabetically ordered 
// note how system headers use <>
#include "vehicleAIComponent.h" // your header in local directory
#include "basestation/vehicle/vehicleConditions/vehicleCondition.h"
#include "basestation/vehicle/vehicleConditions/vehicleConditionFactory.h"
#include "basestation/vehicle/vehicleConfig.h"
#include "basestation/vehicle/vehicleManager.h"
#include "metagame/stringMap/stringMap.h"
#include "util/logging/logging.h"
#include "util/parsingConstants/parsingConstants.h"
#include <vector>
//////////////////////////////////////////////////////////////////////////////////
```

## Code

### Naming convention

* Folders and files in lowerCamelCase (no spaces)        : `/highLevelAI/vehicleAIComponent.h`
* Namespaces in UpperCamelCase                        : `namespace BaseStation { …  }`
* Class/struct/typedef names in UpperCamelCase        : `class VehicleAIComponent { …  };`
* Interfaces in UpperCamelCase, starting “I”                : `class IBountyProvider { … };`
* Methods/functions in UpperCamelCase                : `void ClearAll();`
* Variables in lowerCamelCase                                : `int thisIsALocalVar;`
* Member variables in lowerCamelCase, starting “_”        : `int _thisIsAMemberVar;`
* Constants lowerCamelCase, starting “k”                : `const int kIterations = 3;`
* Non-constant static members, starting with “s”        : `static MapType sSharedTable;`
* Enumerations : see section Enumerations below 

#### Physical Units

* Including physical units in a name is often very helpful, but not required.
* Add an underscore at the end of the variable name, followed by the unit.
* Use the unit's official SI abbreviation.
* "Sec" can be used instead of "s", when it is more clear.
```c++
float offsetFromDSCenter_m;           // meters
float offsetFromDSCenter_mm;          // millimeters
uint  clockFreq_MHz;                  // Megahertz
float timeout_s;                      // seconds
uint  timeStamp_us;                   // micro seconds
```

If the unit has an exponent, include the exponent value directly:
```c++
float ComputeArea_m2();               // meters squared
```

For units that have a denominator, separate the numerator and denominator with "Per".
```c++
float speed_mmPers;                   // millimeters / second
float horzAccel_mPerSec2;             // meters / (second^2)
```

### Namespaces

* Do not ever import namespaces in header files, use qualified-id instead (eg: `std::vector`)
  * If a qualified id is long and/or is going to be used several times, import with a type alias, but within the scope of the class:

```c++
class MyClass
{
  public:
    using ptree = ::boost::property_tree::ptree;
};
```

* Do not import namespaces in cpp files in general, use qualified-id instead (eg: std::vector)
   * See above for `using/typedef`

* Make proper use of namespaces for our components (`basestation`, `metagame`, `ankiutil`, etc)
   * Nothing in our codebase should be outside of a namespace


### Typedefs

* Prefer new c++11 type alias syntax instead of typedef
* Use most confined scope/visibility possible for the type usage (class private, namespace public, …) For example, an internal type in a class should be declared in the private section of such class.

### Constants

* Consider using enums for exported or global integer constants that behave as ids, error codes, etc.
```c++
enum { ACHIEVEMENT_DEFINITION_INVALID_ID = 0 };
// instead of
#define ACHIEVEMENT_DEFINITION_INVALID_ID ((AchievementDefinitionIdType)0)
```

* Consider using static const variables for constants of integral types (not objects)
* Limit scope of constants as much as possible
* Define class constants as static const class members


### Classes

* All member variables must be private, and provide getters/setters whenever needed
* All primitive member variables must be given a value in the constructor initialization list or in the class definition
   * Note this does not mean they have to be constructed (for example, pointers can delay construction of their types to a later initialization)
   * Respect the format:

```c++
    class Foo {
      ...
    private:
      int member_1 = val1;
    };

    Bar::Bar(...)
    : member_2( val2 )
    , member_3( val3 )
    {
      // ...
    }
```

* Const getters must return copy of the value or const reference/pointer to the member
* Only one class per file. Small helper structs are allowed (see below), but not encouraged
* Order of declaration is: public, then protected, then private.
* Order of declaration within visibility: types, then methods, then variables.


### Structs

* Use structs only as data containers. If functionality is provided, it should be a class, excluding convenience constructors.
* Member variables can be public if the scope of the struct is limited (local to class for example), omit underscore in this case.

### Methods
* Functions which contain output parameters should prefer to order the arguments so that all input arguments are supplied before the ouput arguments, as well as prepending ‘out’ to the name
         `void MyFunction( int myInput, int& outMyOutput1, int& outMyOutput2 );`

* Use override keyword whenever overriding a virtual method. This allows catching unintended spelling mistakes or changes in base API. Do not omit the virtual keyword when using override.


### Types

* Of the built-in C++ integer types, the only one used is int. If a program needs a variable of a different size, use a precise-width integer type from `<cstdint>`, such as `int16_t`.

* Use `size_t` for sizes

* Respect types from system libraries. If your variable stores a value returned by a system function or method, your variable should match the return type of such function.

* Pointers and references must be adjacent to the type rather than with the variable
   * For this reason, no multiple pointers/references shall be declared in the same line

```c++
const MyClass* myClassVar;         // preferred
const MyClass *myClassVar;         // not preferred
const MyClass *a, *b;         // not allowed
```

* Use references instead of pointers whenever the value can not be null

### Enumerations

* Use strongly typed enums (enum classes) for variables with mutually-exclusive values
   * Type name in UpperCamelCase starting with E
   * Entry names in UpperCamelCase

```c++
// Mission group state
enum class EMissionGroupState
{
    Locked
  , Available
  , Completed
};
```

* Use old-style enums when arithmetic is expected from the type or for constants
   * Use typedef if C-code uses the enumeration
   * Type name in UpperCamelCase
   * Entry names in all caps

```c++
// Mask
typedef enum
{
    MM_SELF        = 0x01,
  , MM_TARGET      = 0x02
  , MM_HOST        = 0x04
  , MM_ALL         = SM_SELF | SM_TARGET | SM_HOST
} MessageMask;

enum { ACHIEVEMENT_DEFINITION_INVALID_ID = 0 };
```

### Switch statements

* Indent ‘case’ and indent again everything inside the case
* Must have a default block with error message if not expected
* Use brackets per case (allows defining variables in scope)

```c++
switch( var ) {
  case 1:
  {
    break;
  }
  case 2:
  {
    break;
  }
  default:
  {
    handleOrError();
  }
}
```

* Do not cascade (fall through) cases unless they have the exact same code

```c++
switch( var ) {
  case 1:
  case 2:           // case 1 and case 2 have the same code    [ OK ]
  {
    do();
    break;
  }
  case 3:
  {
    do3();
  }
  case 4:           // case 3 cascades into case 4 sneakily    [ NOT ALLOWED ]
  {
    do4();
    break;
  }
  default:
    handleOrError();
}
```

### Const-correctness

* Make extensive use of const. In particular:
   * Use const wherever possible, especially references and pointers passed as arguments that are not expected to be modified, getters, and local/temp variables inherently const.
   * provide const and non-const version of methods whenever necessary
* const methods must return const references/pointers (does not apply to return by value)
* Function arguments that are not meant to be modified must be declared const, especially pointers and references
* Do not use const_cast
* Use of mutable is discouraged except for rare debugging purposes (eg: counter member in getter)
* Convention: const before the type

```c++
const MyClass* cp1 = &myObj;           // non-const pointer to const type
const MyClass* const cp2 = &myObj; // const pointer to const type
MyClass* const cp3 = &myObj;         // const pointer to non-const type
```

### Language enforced practices

* Respect the rule of three (Wikipedia): “if a class defines one of the following, it should probably explicitly define all three: destructor, copy constructor, copy assignment operator.” C++11 extends this to the rule of five with the addition of move constructors and move assignment operators. If your class implements any of these, provide proper implementations for all of them, or use non-copyable:
   * Use `AnkiUtil::noncopyable` whenever your class would not work with default implementations of copy constructor and assignment operator, but is not expected to be copied, for which you don't want to provide custom implementations.
   
* As a corollary to the above, avoid declaring members of the rule of five if you don't need them. Using smart containers (e.g. `std::unique_ptr<MyClass>` instead of `MyClass*` can help remove the need for custom destructors, and will allow the compiler to generate copy and move operations that do the right thing by default.

* When the default implementations of move/copy operations will suffice, use them instead of writing your own:

```c++
class MyClass {
  ~MyClass(); // this class needs a custom destructor for some reason
  MyClass(const MyClass& other) = default; // default copy constructor
  MyClass& operator=(const MyClass& other) = default; // default copy assignment
  MyClass(MyClass&& other) = default; // default move constructor
  MyClass& operator=(MyClass&& other) = default; // default move assignment
};
```

* Add equality assertion at the end of custom assignment operators and copy constructors:
   * `assert( *this == other ); // this should be true if the copy was correct`

* Use `nullptr` keyword instead of implementation defined NULL for null pointers

* Use constant values to the left of equality comparisons. This prevents accidental bugs due to unintended assignments:

```c++
  Output* bestSelection = do();
  if ( bestSelection = nullptr ) // compiles and introduces a bug
  if ( nullptr = bestSelection ) // doesn't compile
  if ( nullptr == bestSelection ) // preferred over if ( bestselection == nullptr )
```

* Do not compare against true/false keywords and prefer positive names for boolean variables:
        (A negative name is something that reflects the opposite of the boolean value. Eg: ignore, skip,         prevent, ...)

```c++
if ( ignoreFailure == false )         // most confusing statement ever
if ( handleFailure )                  // easier to understand
```

* Return access to member containers by const reference. When a function returns a newly-constructed container of data, return it by value so the compiler can make use of RVO or cheap move semantics.
   * Accessor: return const_reference to type alias or type

```c++
using TargetScoreList = std::vector<AITargetScore>;

    // returning access to a class member
    const TargetScoreList& GetCurrentTargetScores() const {
      return _allTargetScores;
    }
    
    // returning a newly-constructed container
    TargetScoreList GetNewTargetScores() const {
      TargetScoreList scoreList;
      // ... fill scoreList
      return scoreList;
    }
```

   * Output: When returning objects that cannot be cheaply moved, receive the object by reference as a parameter and modify it within the function.

* Consider twice before passing objects and containers by value as arguments (as opposed to pointers and references)
  * Exception: when a parameter is always copied and can be moved cheaply, passing by value is usually correct.
  
  ```c++
  // bad, parameter is always copied no matter what
  void SetName(const std::string& name) {
    _name = name;
  }
  
  // good; if SetName is called with a std::string&&, the full string
  // is not copied
  void SetName(std::string name) {
    _name = std::move(name);
  }
  ```

* Never call virtual methods from constructors or destructors (including copy constructors)

* Use prefix form (++i) of the increment and decrement operators with iterators and other template objects. In general, prefer such form to post-prefix for integers too, for consistency.
  `for( size_t index=0; index<totalSize(); ++index ) {...}`

* Make use of const variables for return values that need to be calculated, even for one-line calculations. This is important because it makes debugging easier, and allows conditional breakpoints without any overhead (compile will optimize the const var):
```c++
  bool IsSpeedChangeAllowed() const
  {
    const bool ret = ( isLocalized && speedController->IsSpeedChangedAllowed() );
    return ret;
  }
  // better than
  bool IsSpeedChangeAllowed() const
  {
    return isLocalized && speedController->IsSpeedChangedAllowed();
  }
```

* Same statement above applies to if blocks
```c++
  void DoFunStuff() const
  {
    const bool weAreFun = ( isLocalized && speedController->IsSpeedChangedAllowed() );
    if ( weAreFun )
    {
      Fun();
    }    
  }
  // better than
  void DoFunStuff() const
  {
    if ( isLocalized && speedController->IsSpeedChangedAllowed() )
    {
      Fun();
    }    
  }
```

* All variables must be given a value when declared
* No code allowed in header files, except for inline functions, getters/setters, and templates, and only in the case that they are small.
   * If you implement a function bigger than 2 lines, implement it outside the class declaration either in the header file, but outside the class declaration, or in a new file that is included from the main one:
```c++
  namespace MyNamespace {
  class MyClass
  {
    inline void DoStuffInlined();
  };


  ///// inline methods:


  void MyClass::DoStuffInlined() 
  {
    // blah
  }
  } // namespace


   -------- plannerTable.h --------
 namespace MyNamespace {
  class Table {
 public:
   // declarations go here
   inline int foo();
   inline int bar();
 };
  } // namespace

 #include "plannerTable.inl"


 -------- plannerTable.inl -------
  #ifdef INCLUDE_ONLY_ONCE_PLANNER_TABLE_INL
  #error "plannerTable.inl should only be included once. Please fix."
  #endif
  #define INCLUDE_ONLY_ONCE_PLANNER_TABLE_INL


  namespace MyNamespace 
  {
 // IN this file, no other header guard or # includes
  int Table::foo() { // ... }
 int Table::bar() { // ... }
  } // namespace
```

* Prefer `const auto&` over `auto` where possible, to avoid accidental copies. Const references will persist the lifetime of a temporary value, and are safe to use to capture objects returned by value. `auto` without a reference should not be used in ranged for loops.

```c++
  // good; no copies
  for (const auto& achievementIdIt : achievementList)
  {
    achievements_.insert(achievementIdIt);
  }
  
  // bad; unclear without looking up dataList's type whether or not this code
  // is copying objects
  std::vector<int> dataList;
  ...
  for (auto data : dataList)
  {
    ...
  }
  
  // really bad; copying every string!
  for (auto hugeString : hugeStrings)
  {
    ...
  }
```

* Use `auto*` when the type being assigned is known to be a pointer; it clarifies that objects are not being copied and the meaning of the `->` operator.

```c++
  // good; usage of auto makes it clear it's operating on pointers
  std::vector<uint8_t*> bufferList;
  ...
  for (auto* buffer : bufferList) {
    ...
  }
```

### Consistency

* If you are editing someone else's code, take a few moments to look at the code around you and determine its style. If they use spaces around their if statements, you should, too. If their comments have little boxes of stars around them, make your comments have little boxes of stars around them too, etc.
* If the code you are editing is old or is badly against the coding standards, fix it without delay. Discuss with team members large refactors.
   * If you are touching a lot of old code, try to separate that out as a separate commit that doesn’t change any behavior, for ease of code review


## Code Review

* Any commit in Master has to build if synced to that commit.

