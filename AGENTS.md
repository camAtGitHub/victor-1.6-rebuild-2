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
| `docs/` | 63 | upstream docs — index only | Anki's own architecture and development docs |
| `engine/` | 1109 | unmapped | Main process: actions, behaviors, vision, world state, planning |
| `animProcess/` | 145 | unmapped | Animation process: animation/audio playback, face, mic processing |
| `robot/` | 2516 | unmapped | Low-level robot: HAL, supervisor, syscon, cube firmware, fixture |
| `coretech/` | 797 | unmapped | Anki robotics library: `common`, `messaging`, `neuralnets`, `planning`, `vision` |
| `clad/` | 81 | unmapped | CLAD message definitions + C++/viz emitters |
| `victor-clad/` | 168 | unmapped | Victor-specific CLAD definitions, emitters, generator tooling |
| `lib/` | 2825 | unmapped | Vendored/shared libs: `anki-ble`, `audio`, `das-client`, `micData`, `signalEssence`, `util`, `crash-reporting-vicos` |
| `platform/` | 311 | unmapped | OS services: `switchboard`, `update-engine`, `camera`, `gpio`, logging, crash reports, `whiskeyToF` |
| `cloud/` | 187 | unmapped | Go — `vic-cloud` service, protobuf, systemd unit |
| `resources/` | 2625 | unmapped | Assets, config, webserver, speech-recognition data, shipping/beta variants |
| `tools/` | 2550 | unmapped | Dev tooling: sdk, build, audio, animation scripts, perfmetric, protobuf, smartling, etc. |
| `project/` | 168 | unmapped | Build scripts, build server, doxygen, `victor/` project config |
| `simulator/` | 480 | unmapped | Webots simulation: controllers, worlds, plugins, protos |
| `test/` | 76 | unmapped | Tests for `engine`, `animProcess`, `switchboard` |
| `matlab/` | 186 | unmapped | [UNVERIFIED] MATLAB research/vision tooling — likely legacy |
| `okaoVision/` | 41 | unmapped | Omron OKAO face/vision SDK integration |
| `cmake/` | 38 | unmapped | CMake modules and toolchain files |
| `python/` | 34 | unmapped | [UNVERIFIED] Python helpers |
| `cannedAnimLib/` | 27 | unmapped | Pre-authored ("canned") animation library |
| `crypto/` | 14 | unmapped | [UNVERIFIED] crypto helpers |
| `install-images/` | 11 | unmapped | [UNVERIFIED] installer / OTA images |
| `licenses/` | 39 | skipped (license text) | Third-party license texts |
| `templates/` | 9 | unmapped | [UNVERIFIED] |
| `cubeBleClient/` | 8 | unmapped | Cube BLE client |
| `webServerProcess/` | 7 | unmapped | On-robot web server process |
| `osState/` | 7 | unmapped | OS state reporting |
| `dasmgr/` | 7 | unmapped | DAS (analytics/event) manager |
| `build/` | 4 | unmapped | Build helper files |
| `testCrash/` | 3 | unmapped | Crash-reporting test harness |
| `.github/` | 2 | unmapped | CI / repo config |
| `EXTERNALS/` | submodule | ⚠️ out of scope | Separate repo — do not clone or descend |

### Known second-level landmarks (seeded — expand as mapped)

| Path | What it is |
|---|---|
| `engine/aiComponent/behaviorComponent/` | Behavior tree / behavior definitions |
| `engine/aiComponent/beiConditions/` | Behavior External Interface conditions |
| `engine/components/` | `backpackLights`, `battery`, `cubes`, `mics`, `sensors`, `textToSpeech`, `variableSnapshot`, `visionScheduleMediator` |
| `engine/actions/`, `engine/animations/`, `engine/audio/`, `engine/blockWorld/`, `engine/navMap/`, `engine/moodSystem/`, `engine/vision/`, `engine/viz/` | Engine subsystems |
| `engine/cozmoEngine.cpp/.h`, `engine/cozmoContext.cpp/.h`, `engine/cozmoAPI/` | Engine entry points |
| `robot/core/`, `robot/hal/`, `robot/supervisor/`, `robot/syscon/`, `robot/cube_firmware/`, `robot/fixture/` | Robot-process and firmware layers |
| `coretech/vision/`, `coretech/planning/`, `coretech/messaging/`, `coretech/common/`, `coretech/neuralnets/` | Coretech subsystems |
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

- **Where does the engine start?** — `engine/cozmoEngine.cpp` [INFERRED, confirm]
- **Where are behaviors defined?** — `engine/aiComponent/behaviorComponent/` + behavior JSON under
  `resources/` [INFERRED, confirm]
- **Where are animations stored vs. played?** —
- **Where are CLAD messages defined, and what generates the C++/Go/Python?** —
- **Where does the build begin, and what does `vbuild` actually run?** —
- **What runs on the robot vs. off it (simulator, tools, cloud)?** —
- **Which parts are rebuild-specific vs. stock Anki 1.6?** — start from `CHANGES.md`

---

## 7. Progress Log

Append one line per session. Newest at the bottom. Every session ends with §6 and §7 accurate;
if you ran out of context mid-folder, say so here.

| Date | Agent | Did | Next |
|---|---|---|---|
| | | | |

---

## 8. Session Etiquette

- Work in **small, resumable chunks**. Finish a folder, write its README, update §6 and §7, then
  move on. Never leave a folder half-documented across a context break.
- Read §6 and §7 before starting. **Do not re-map anything marked `mapped`** — extend it instead.
- If a listing would blow your context, sample: list one level, count children, descend selectively.
- Prefer `git ls-tree` / `find -maxdepth` over recursive dumps on the big trees.

---

## 9. Exit Criteria for This Phase

- [ ] `docs/mapping/UPSTREAM-DOCS-INDEX.md` exists and covers every file in `docs/`.
- [ ] Every top-level directory has a README and a current ToC row.
- [ ] Every substantial second-level directory is documented or explicitly `skipped` with a reason.
- [ ] `docs/mapping/GLOSSARY.md` covers the terms used across the READMEs.
- [ ] §6 "Quick answers" is fully populated.
- [ ] `git status` shows **only added documentation files** — no modified source.

Do not propose refactors, fixes, or feature work until the user says this phase is over.
