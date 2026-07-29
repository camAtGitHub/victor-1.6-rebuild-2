# audio/

**Path:** `animProcess/src/cozmoAnim/audio/`  
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high  
**Upstream docs:** [`docs/architecture/animations.md`](../../../../docs/architecture/animations.md) (audio track as playhead clock)

## What this is

Anim-side Wwise / audio-engine integration: controller, engine↔robot audio CLAD mux input, clients that post events from animation keyframes / procedural motion / mic direction / SDK external audio, plus a small playback job system for file-like clips.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `cozmoAudioController.{h,cpp}` | file | Subclass of `AudioEngineController`; posts events, states, switches |
| `engineRobotAudioInput.{h,cpp}` | file | `AudioMultiplexer` input registered in `AnimEngine::Init` |
| `animationAudioClient.{h,cpp}` | file | Plays animation audio keyframes; abort with anim |
| `proceduralAudioClient.{h,cpp}` | file | Motion/procedural-driven audio; fed robot messages in message Update |
| `microphoneAudioClient.{h,cpp}` | file | Pushes latest mic direction into audio engine each tick |
| `sdkAudioComponent.{h,cpp}` | file | External/SDK audio prepare/chunk/complete/cancel (via AnimEngine handlers) |
| `audioPlaybackSystem/Job.{h,cpp}` | files | Scheduled playback jobs (tick from messages Update) |
| `audioProceduralFrame.{h,cpp}` | file | Procedural audio frame helper types |

## Wiring (AnimEngine)

From `animEngine.cpp`:

1. `AnimContext` owns `CozmoAudioController` + `AudioMultiplexer`.
2. `Init` registers `EngineRobotAudioInput` on the mux (~L121–128).
3. `StreamingAnimationModifier` constructed with that audio input + TTS.
4. Each `Update` end: `MicrophoneAudioClient::ProcessMessage(latest mic direction)` then `CozmoAudioController::Update()` (~L216–221).

`AnimProcessMessages::Update` also ticks `AudioPlaybackSystem` and routes robot msgs through `ProceduralAudioClient::ProcessMessage` (~L947–998).

## Relationship to animation tracks

- Canned anim **Audio** keyframes → `AnimationAudioClient` (owned by streamer).
- Layered audio (e.g. glitch repair) → `AudioLayerManager` under `animation/trackLayerManagers/`.
- Upstream notes Wwise sample clock as timing reference for multi-track sync (`animations.md`); streamer still advances `_relativeStreamTime_ms` by `AnimTimeStepMS` in software.

## Talks to

- **Depends on:** `lib` `audio_engine`, `audio_multiplexer_robot`, `util_audio` [CONFIRMED `CMakeLists.txt`].
- **Depended on by:** `AnimationStreamer`, `AnimEngine`, `animProcessMessages`, TTS (posts waves into audio engine), Alexa media [CONFIRMED / partial].
- **Engine:** posts audio-related `EngineToRobot` that mux input consumes rather than always forwarding to robot [INFERRED from mux registration + handler design].

## Notable observations

- Class names still “Cozmo*” despite Vector product.
- SDK external audio and TTS messages are handled on `AnimEngine` (`HandleMessage` overloads), not only the big switch in `animProcessMessages`.

## Open questions

- [UNKNOWN] Full set of audio CLAD tags handled only by `EngineRobotAudioInput` vs streamer clients.
