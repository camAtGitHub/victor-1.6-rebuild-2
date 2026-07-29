# animProcess

**Path:** `animProcess/`  
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high  
**Upstream docs:**
- [`docs/architecture/arch_overview.md`](../docs/architecture/arch_overview.md) — Animation process section (stock 33 ms tick — see rebuild note below)
- [`docs/architecture/animations.md`](../docs/architecture/animations.md) — tracks, keyframes, `AnimationStreamer` vs engine `AnimationComponent`
- [`docs/architecture/proceduralFace.md`](../docs/architecture/proceduralFace.md) — parameterized eyes
- [`docs/architecture/physical_vs_sim.md`](../docs/architecture/physical_vs_sim.md) — `faceDisplay` mac vs vicos impls
- [`docs/development/mic-systems-overview.md`](../docs/development/mic-systems-overview.md) — mic pipeline (SE + trigger; stock Sensory — rebuild uses Picovoice for Vector)
- [`docs/development/alexa.md`](../docs/development/alexa.md) — Alexa integration notes
- [`docs/development/perf-metric-tool.md`](../docs/development/perf-metric-tool.md), [`performance_results.md`](../docs/development/performance_results.md) — `vic-anim` CPU profiles

**L2 child maps:**  
[`animation/`](src/cozmoAnim/animation/README.md) · [`faceDisplay/`](src/cozmoAnim/faceDisplay/README.md) · [`micData/`](src/cozmoAnim/micData/README.md) · [`speechRecognizer/`](src/cozmoAnim/speechRecognizer/README.md) · [`audio/`](src/cozmoAnim/audio/README.md) · [`textToSpeech/`](src/cozmoAnim/textToSpeech/README.md) · [`backpackLights/`](src/cozmoAnim/backpackLights/README.md) · [`alexa/`](src/cozmoAnim/alexa/README.md)

## What this is

The **Animation process** (`vic-anim` on-robot): plays canned and procedural animations, drives the face LCD and backpack lights, runs Wwise audio and TTS, and processes microphone data (beamforming, wake-word, cloud streaming). It is also the **message relay** between the engine and robot processes so ordering/sync is preserved.

## Why it exists

Engine ticks slower and less time-critically; animation needs a tight, reliable frame loop so multi-track animations (motion + face + audio + lights) stay coordinated. Mic processing lives here because it is the lowest process with enough tick budget and avoids shipping large raw audio to the engine ([`arch_overview.md`](../docs/architecture/arch_overview.md)).

## Contents

| Entry | Type | What it is |
|---|---|---|
| `CMakeLists.txt` | file | Builds static lib `victor_anim`; on VICOS also `vic-anim` and `vic-bootAnim-stock` |
| `BUILD.in` | file | Older buck-style project list for the same targets |
| `src/cozmoAnim/` | dir | Main process sources (namespace still uses Cozmo-era names) |
| `src/cozmoAnim/cozmoAnimMain.cpp` | file | `main`: crash reporter, logger, `AnimEngine`, fixed-rate loop |
| `src/cozmoAnim/animEngine.{h,cpp}` | file | Init/update container for streamer, TTS, mic audio, SDK audio |
| `src/cozmoAnim/animContext.{h,cpp}` | file | Shared holders: data loader, audio, mic, Alexa, backpack, web, perf |
| `src/cozmoAnim/animComms.{h,cpp}` | file | Unix-domain sockets to engine + robot (`socketConstants.h`) |
| `src/cozmoAnim/animProcessMessages.{h,cpp}` | file | CLAD shuttle + anim-specific handlers; `Update` per tick |
| `src/cozmoAnim/animation/` | dir | **L2** — `AnimationStreamer`, track layers — [README](src/cozmoAnim/animation/README.md) |
| `src/cozmoAnim/audio/` | dir | **L2** — Wwise controller + clients — [README](src/cozmoAnim/audio/README.md) |
| `src/cozmoAnim/faceDisplay/` | dir | **L2** — LCD path + info screens — [README](src/cozmoAnim/faceDisplay/README.md) |
| `src/cozmoAnim/micData/` | dir | **L2** — SE + VAD + stream jobs — [README](src/cozmoAnim/micData/README.md) |
| `src/cozmoAnim/speechRecognizer/` | dir | **L2** — Picovoice (Vector) + Pryon (Alexa) — [README](src/cozmoAnim/speechRecognizer/README.md) |
| `src/cozmoAnim/textToSpeech/` | dir | **L2** — Acapela TTS — [README](src/cozmoAnim/textToSpeech/README.md) |
| `src/cozmoAnim/backpackLights/` | dir | **L2** — priority backpack LEDs — [README](src/cozmoAnim/backpackLights/README.md) |
| `src/cozmoAnim/alexa/` | dir | **L2** — AVS client — [README](src/cozmoAnim/alexa/README.md) |
| `src/cozmoAnim/beatDetector/` | dir | Beat detection (Aubio; used by mic processor) |
| `src/cozmoAnim/robotDataLoader.{h,cpp}` | file | Loads configs + canned anims / sprites into memory |
| `src/bootAnim/` | dir | Standalone boot-face player (`vic-bootAnim` script + `bootAnim.cpp` stock binary) |

## Process main loop & tick period

```
cozmoAnimMain::main
  → InstallCrashReporter("vic-anim")
  → DataPlatform from env VIC_ANIM_CONFIG
  → AnimEngine(dataPlatform) → Init()
  → loop until SIGTERM:
       animEngine->Update(curTime_ns)
       sleep remaining of AnimTimeStepUS
       catch-up if ≥2 frames behind
       RegisterTickPerformance(...)
```

Evidence: `src/cozmoAnim/cozmoAnimMain.cpp` (`LOG_PROCNAME = "vic-anim"`; `AnimTimeStepMS/US` from `_getAnimTimeStep*()` at ~L39–40; loop ~L179–246).

### Tick period: 16 ms default (rebuild), 33 ms powersave

| Constant / gate | Value | Where |
|---|---|---|
| `ANIM_TIME_STEP_MS` | **16** | `robot/include/anki/cozmo/shared/cozmoConfig.h` ~L335 |
| `ANIM_TIME_STEP_POWERSAVE_MS` | **33** | same ~L344 |
| File gate | `/data/data/rebuild/using-30-fps` | `_getAnimTimeStepMS()` ~L348; toggled by face info UI ~`faceInfoScreenManager.cpp:544` |
| `SPRITE_FRAME_INTERVAL_MS` | 33 | sprite sequences still 33 ms grid |
| Upstream docs | fixed 33 ms | stock Anki / Cozmo asset compatibility narrative |

`AnimEngine::Update` order (`animEngine.cpp` ~L167–234):

1. `BaseStationTimer` + web service  
2. **`AnimProcessMessages::Update`** (comms, mic/Alexa/playback updates, engine+robot packets)  
3. OSState, **TTS**, sprite cache  
4. StreamingAnimationModifier before → **`AnimationStreamer::Update`** → modifier after  
5. Mic direction → audio controller tick  
6. Backpack lights Update  

## AnimationStreamer (summary)

Full detail: [`src/cozmoAnim/animation/README.md`](src/cozmoAnim/animation/README.md).

- Engine commands via CLAD e.g. `PlayAnim` → `Process_playAnim` → `SetStreamingAnimation` (`animProcessMessages.cpp` ~L234).
- Streamer advances tracks by `_relativeStreamTime_ms`, layers procedural face/audio/backpack, draws face via `FaceDisplay`, sends motion/etc. toward robot through message helpers.
- Engine peer: `engine` `AnimationComponent` — interface only; playback is here (`animations.md`).

## Message relay (animComms + animProcessMessages)

| Piece | Role |
|---|---|
| `AnimComms` | `LocalUdpServer` listens as engine-facing server (`ENGINE_ANIM_SERVER_PATH` + robotID); `LocalUdpClient` connects to robot (`ANIM_ROBOT_*_PATH`) — `animComms.cpp` ~L127–168; paths in `coretech/messaging/shared/socketConstants.h` |
| `AnimProcessMessages::Init` | Binds engine, streamer, modifier, audio input, context |
| `Update` | Mic/Alexa/playback ticks; drain engine packets → `ProcessMessageFromEngine`; drain robot packets → `ProcessMessageFromRobot` (+ procedural audio) |
| Engine→Robot default | Unhandled tags **forward** to robot (`forwardToRobot = true` default ~L703) |
| Handled in anim (examples) | `PlayAnim`/`AbortAnimation`, face image/procedural chunks, backpack lights intercept, calm power mode gate, mic mute/locale/… |
| Robot→Engine | Mic consumed locally (not forwarded as bulk audio path); most other tags **forward** to engine after local side-effects (`SendAnimToEngine` ~L823); `robotStopped` aborts streamer |

Header description (`animProcessMessages.h`): *“Shuttles messages between engine and robot… Responds to engine messages pertaining to animations and inserts messages as appropriate into robot-bound stream.”*

## Face display path

Full detail: [`src/cozmoAnim/faceDisplay/README.md`](src/cozmoAnim/faceDisplay/README.md).

Procedural eyes / sprite / composite / engine image chunks → `AnimationStreamer` RGB565 → `FaceDisplay::DrawToFace` → worker double-buffer → VICOS `lcd_draw_frame2`. Boot process holds LCD until `StopBootAnim` (`systemctl stop vic-bootAnim`).

## Mic pipeline entry

Full detail: [`micData/`](src/cozmoAnim/micData/README.md) + [`speechRecognizer/`](src/cozmoAnim/speechRecognizer/README.md).

```
RobotToEngine::micData → MicDataSystem → MicDataProcessor
  (Signal Essence beamform + SVad)
  → SpeechRecognizerSystem::Update
       Vector: SpeechRecognizerPicovoice
       Alexa:  SpeechRecognizerPryonLite
  → stream jobs / cloud UDP / engine trigger messages
```

## Key entry points

| What | Where | Why |
|---|---|---|
| Process entry | `src/cozmoAnim/cozmoAnimMain.cpp` | `main` → `AnimEngine::Init` → sleep/loop on `_getAnimTimeStepUS()` |
| Engine hub | `animEngine.cpp` `Init` / `Update` | Wires streamer, messages, TTS, audio, Alexa, perf |
| Animation playback | `animation/animationStreamer.*` | Streams keyframes from canned container / procedural face |
| Message relay | `animProcessMessages.*` + `animComms.*` | Engine↔anim↔robot CLAD over local sockets |
| Face pixels | `faceDisplay/` → `lcd_*` | RGB565 worker thread |
| Mic pipeline | `micData/` + `speechRecognizer/` | SE + Picovoice/Pryon + cloud |
| Data load | `robotDataLoader.*` | Config + animation assets via `canned_anim_lib_anim` |

## Talks to

- **Depends on:**
  - `cannedAnimLib/` (`canned_anim_lib_anim`) — canned animation load/play types [CONFIRMED] (`CMakeLists.txt`)
  - `lib/` — `util`, `util_audio`, `audio_engine`, `micdata`, `signal_essence`, Picovoice (`pv_porcupine`), Pryon Lite, Speex, MPG123, AVS, Aubio, etc. [CONFIRMED]
  - `coretech/` — `cti_common_robot`, `cti_vision`, `cti_messaging_robot` [CONFIRMED]
  - `victor-clad` / CLAD robot-interface + cloud mic messages [CONFIRMED]
  - `webServerProcess/` — `victor_web_library` [CONFIRMED]
  - `osState/`, `robot_interface` / `robot_core` (HAL LCD) [CONFIRMED]
  - Config/assets under `resources/` (`VIC_ANIM_CONFIG` → DataPlatform paths) [CONFIRMED]
- **Depended on by / peers:**
  - `engine/` `AnimationComponent` — commands play/display over CLAD [CONFIRMED]
  - `robot/` — mic samples, robot state, motor/light keyframes via anim relay [CONFIRMED]
  - `simulator/` `webotsCtrlAnim` — links `victor_anim` (no `vic-anim` binary on Mac) [CONFIRMED]
  - `test/animProcess/` — `test_animprocess` links `victor_anim` [CONFIRMED]
  - Cloud process via mic streaming UDP + cloud CLAD [CONFIRMED]

## Build

- Root `add_subdirectory("animProcess")` in top-level `CMakeLists.txt`.
- **Library:** `victor_anim` (static) — all `src/cozmoAnim` except `cozmoAnimMain.cpp`; platform `*_mac` / `*_vicos` selected by platform.
- **Executable (VICOS only):** `vic-anim` ← links `victor_anim` + `victorCrashReports` + (non-robot) `cti_common` for main only.
- **Boot:** `vic-bootAnim-stock` from `bootAnim.cpp`; prebuilt script `src/bootAnim/vic-bootAnim` installed to `bin`.
- Mac/sim: no `vic-anim` binary; Webots controller uses the library.
- Optional CMake flag: `ALEXA_ACOUSTIC_TEST`.

Link surface for `victor_anim` includes: `canned_anim_lib_anim`, `audio_engine`, `micdata`, `signal_essence`, `pv_porcupine`, `${PRYON_LITE_LIBS}`, `${TEXT2SPEECH_LIBS}`, `${AVS_LIBS}`, `${AUBIO_LIBS}`, `robot_core` (VICOS), etc. (`CMakeLists.txt` ~L38–76).

## Notable observations

- **Cozmo naming lives on:** folders/symbols still say `cozmoAnim` / `CozmoAudioController` while the product is Vector.
- **Rebuild tick rate:** default 16 ms with file-gated 33 ms powersave (`cozmoConfig.h`); UI toggle under face info screens. Upstream docs still say 33 ms.
- **Wake word stack (this tree):** Vector = **Picovoice**; Alexa = **Pryon Lite**. Stock `mic-systems-overview.md` Sensory THF is not the Vector backend here (`speechRecognizerSystem.cpp` “swapped in Picovoice”).
- **Message path:** engine ordered traffic to robot goes through anim (`arch_overview.md` + default forward).
- **Face draw is threaded:** double-buffer RGB565; vicos `lcd_draw_frame2`.
- **Boot anim is separate:** lightweight process until cloud+engine ready → `StopBootAnim`.
- **MicDataSystem vs Alexa destruction order** enforced in `AnimContext` (mic first).

## Open questions

- [UNKNOWN] Full enumerated CLAD tag table for anim-only vs pure forward (large generated switch `#include` from 0x50–0xAF).
- [UNKNOWN] Production Picovoice model packaging paths vs residual `hey_vector_thf` config key names.
- [UNKNOWN] Whether engine-side animation timing assumptions fully match 16 ms anim step after rebuild.
- [UNKNOWN] When device uses installed `vic-bootAnim` script vs `vic-bootAnim-stock` binary.
