# resources

**Path:** `resources/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:**
- `docs/architecture/behaviors.md`, `behaviors_intents.md` — how behavior JSON is consumed (code under `engine/`; **data lives here**)
- `docs/mapping/ENGINE-BEHAVIOR-TREE.md` — production freeplay spine; boot config paths under `config/engine/behaviorComponent/`
- `docs/architecture/animations.md`, `proceduralFace.md` — animation system (runtime assets largely via DEPS/`externals`, not only this tree)
- `docs/development/web-server.md` — WebViz / webserver static content

## What this is

Deployable robot **assets and configuration** packaged into the image under something like
`cozmo_resources` (see `CMakeLists.txt` / `BUILD.in`). Includes engine/anim config JSON,
behavior tree definitions, WebViz static UI, small in-repo asset maps/strings, speech-recognition
keyword models, test fixtures, and **shipping / beta / development** config variants.

Rough tracked size: **~2,600 files**. Much of the bulk is **`test/`** image corpora (faces,
markers, etc.). **Bulk animation, soundbank, and sprite trees are not fully in this folder** —
`BUILD.in` pulls them from `externals/animation-assets`, `externals/victor-audio-assets`,
Sensory/Pryon models, etc. Those externals are **deliberately not expanded** (and may be empty
until DEPS/EXTERNALS are populated).

## Why it exists

Engine, anim, and web debug UI need runtime data: which behavior is base freeplay, light
patterns, vision DNN models, localized strings, mic trigger config, and WebViz HTML/JS.
Without this tree (and its external asset deps), the robot has no behavior policy JSON,
no vision models/config, and no on-robot debug web UI.

## Contents

| Entry | ~Files | What it is |
|---|---:|---|
| `config/` | ~550+ | **Primary in-repo runtime config** (engine, anim, features, mic, experiments). See breakdown below. |
| `assets/` | ~40 | Small **in-repo** assets: CLAD→file maps, localized strings, cube firmware DFU, face overlays, rewarded actions. **Not** the full animation dump. |
| `webserver/` | ~80+ | WebViz shell (`webViz.html` + modular `webviz/`); legacy `webViz.legacy.html`; `webVizModules/*.js`; demos; engine/anim/standalone JSON. |
| `test/` | ~1,900+ | Offline test corpora: face rec videos, marker detection, blockWorld, image quality, laser, gaze, factory, touch, AI intent fixtures. **Deliberately not expanded** per subfolder. |
| `speech-recognition/` | ~3 | Picovoice Porcupine params + `hey_vector` / `hey_cosmo` keyword files (`.ppn`/`.pv`). |
| `beta/` | ~3 | Beta variant: `config/{alexa,DASConfig,server_config}.json` |
| `development/` | ~3 | Development variant: same three config files |
| `shipping/` | ~3 | Shipping variant: same three config files |
| `externals/` | 0 in listing | Expected mount point for DEPS-pulled animation-assets, audio assets, sensory models (`BUILD.in` references). Empty/unpopulated in this mapping pass. |
| `CMakeLists.txt` | 1 | Copy-assets rules; `ANKI_BETA` / `ANKI_RESOURCE_SHIPPING` / webserver enable flags |
| `BUILD.in` | 1 | Buck-style asset project globs (assets, sound, config, variants) |
| `asset-build.manifest.in` | 1 | Asset build manifest template |

### `config/` (L1 detail — still no deep expansion)

| Entry | What it is |
|---|---|
| **`config/engine/`** | Engine runtime JSON: mood, vision, lights, TTS, jdocs, photography, puzzles, animations whitelist, etc. |
| **`config/engine/behaviorComponent/`** | **Home of behavior JSON.** ~376 JSON files. Boot: `victor_behavior_config.json` → base behaviors (`InitNormalOperation`, …). Tree under `behaviors/victorBehaviorTree/` (HighLevelAI, GlobalInterruptions, reactions, weather, timer, onboarding, …). Also `user_intent_map.json`, weather maps, cube spinner maps. See `docs/mapping/ENGINE-BEHAVIOR-TREE.md`. |
| `config/engine/lights/` | Backpack + cube light pattern JSON (incl. WireOS backpack variants). |
| `config/engine/vision/` | TFLite DNN models + ground/illumination classifiers. |
| `config/engine/emotionevents/` | Mood/emotion event tables. |
| `config/engine/animations/` | Small set of in-config anim JSON/raw (pairing icons, boot, tests) — **not** full anim library. |
| `config/cozmo_anim.fbs` | FlatBuffer schema for anim-related data. |
| `config/features.json`, `experiments.json` | Feature flags / experiments. |
| `config/micData/micTriggerConfig.json` | Mic trigger configuration. |
| `config/devOnlySprites/` | Dev-only PNGs (battery, pairing, placeholders). |
| `config/facePNGs/` | Pairing icon asset. |

### `assets/` (in-repo only)

| Entry | What it is |
|---|---|
| `cladToFileMaps/` | Maps animation / backpack / cube / composite-image triggers → files |
| `LocalizedStrings/` | de-DE, en-US, fr-FR, ja-JP JSON (behaviors, blackjack, date, enrollment, RPS) |
| `cubeFirmware/cube.dfu` | Cube firmware image |
| `faceOverlays/` | Pride / overlay face JPGs |
| `RewardedActions/RewardedActions.json` | Rewarded action table |

### Explicit non-expansion

| Area | Policy |
|---|---|
| `externals/animation-assets`, sprites, faceAnimations, soundbanks | **Deliberately not expanded** — asset dumps; pulled via DEPS when present |
| `test/faceRecVideoTests/**`, `markerDetectionTests/**`, etc. | **Deliberately not expanded** — homogeneous image buckets |
| `webserver/jquery*.js`, minified vendor JS | **Deliberately not expanded** — third-party web assets |
| Full tree under every `behaviorComponent/behaviors/**` child | L1 names only; production spine already documented in `ENGINE-BEHAVIOR-TREE.md` |

## Key entry points

| Path | Why |
|---|---|
| `resources/CMakeLists.txt` | Which resource packs deploy; beta/shipping/dev switches |
| `resources/BUILD.in` | Declares externals globs for animations/audio/speech models |
| `resources/config/engine/behaviorComponent/victor_behavior_config.json` | Selects onboarding / normal / dev / post-onboarding base behaviors |
| `resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree/` | Production freeplay + interruptions JSON |
| `resources/config/engine/behaviorComponent/user_intent_map.json` | Voice/user intent → behavior mapping data |
| `resources/config/engine/configuration.json` | Core engine configuration |
| `resources/config/engine/vision_config.json` | Vision system config |
| `resources/webserver/webViz.html` + `webviz/` + `webVizModules/` | On-robot WebViz host shell + modules (see `webserver/webviz/README.md`) |
| `resources/webserver/webServerConfig_engine.json` | Engine web server static config |

## Talks to

- Consumed by: `engine/` (behavior factory loads JSON; vision loads models/config) [CONFIRMED]
- Consumed by: `animProcess/` (anim/web config, mic trigger) [INFERRED for some paths; webserver configs named `_anim`]
- Consumed by: `webServerProcess/` / engine embedded web server serving `webserver/` [CONFIRMED via web-server docs + config files]
- Depends on: DEPS/EXTERNALS for full animation + audio packages referenced in `BUILD.in` [CONFIRMED by BUILD.in paths]
- Related: rebuild personality-pack idea would primarily edit `config/engine/behaviorComponent/` JSON — see `docs/mapping/IDEA-personality-packs.md` [mapping note]

## Build

- CMake `anki_build_copy_assets` targets: `cozmo_resources_assets`, sound (platform-specific), config, beta/shipping/development overlays.
- Flags: `-DANKI_BETA=1`, `-DANKI_RESOURCE_SHIPPING=1`; default is development resources. Webserver omitted if `FACTORY_TEST` or `ANKI_NO_WEBSERVER_ENABLED`.
- Sound can switch to `USE_LOCAL_AUDIO_ASSETS` → `externals/local-audio-assets` when present.

## Notable observations

- **Behavior “source of truth” for production tree is JSON here**, not C++ alone — C++ implements classes; instances/stack wiring are data under `behaviorComponent/`.
- In-repo `assets/` is small; do not expect thousands of animation bins under `resources/assets/`.
- `resources/externals/` was empty at map time — full robot asset image needs DEPS fetch.
- `test/` dominates file count; it is fixture data, not runtime ship content for freeplay.

## Open questions

- [UNKNOWN] Exact on-robot install path prefix for this rebuild image (stock docs say `cozmo_resources` under binary data dir).
- [UNKNOWN] Which beta/shipping server_config values differ from stock Anki vs rebuild (wire-pod) — check those three JSON files when documenting cloud.
