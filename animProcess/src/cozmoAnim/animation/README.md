# animation/

**Path:** `animProcess/src/cozmoAnim/animation/`  
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high  
**Upstream docs:** [`docs/architecture/animations.md`](../../../../docs/architecture/animations.md), [`docs/architecture/proceduralFace.md`](../../../../docs/architecture/proceduralFace.md)

## What this is

Playback core for `vic-anim`. Loads a named canned animation (or procedural face) and advances multi-track keyframes each anim tick, emitting face pixels, audio events, backpack lights, and robot motion messages. Engine-side counterpart is `AnimationComponent` (commands only; does not stream).

## Contents

| Entry | Type | What it is |
|---|---|---|
| `animationStreamer.{h,cpp}` | file | Main streamer: set/abort/update; face draw; keep-alive |
| `streamingAnimationModifier.{h,cpp}` | file | Pre/post-`Update` alterations (TTS/audio-driven tweaks) |
| `trackLayerComponent.{h,cpp}` | file | Combines base anim tracks with layered face/audio/backpack |
| `trackLayerManagers/` | dir | `FaceLayerManager`, `AudioLayerManager`, `BackpackLayerManager`, `ITrackLayerManager` |

## Key entry points

| Symbol | File | Role |
|---|---|---|
| `AnimationStreamer::Init` | `animationStreamer.cpp` | After `RobotDataLoader` non-config load; wires TTS |
| `SetStreamingAnimation(name, tag, …)` | `animationStreamer.h` ~L87 | Lookup in canned container; interrupt; eye-hue flags |
| `SetPendingStreamingAnimation` | header | Deferred play (console / cross-thread) applied in `Update` |
| `Update()` | `animationStreamer.cpp` ~L1973 | Advance tracks → extract messages → send → advance time |
| `Abort(tag)` | header | Stop current (or matching tag) stream |
| `SetProceduralFace` / `Process_displayFaceImage*` | header | Engine-pushed faces/images/composite |
| `EnableKeepFaceAlive` / `KeepFaceAlive` | streamer + `TrackLayerComponent` | Idle blink/dart after stream ends |
| `DrawToFace` / `FaceDisplay::getInstance()->DrawToFace` | ~L1540 | RGB565 to face worker thread |
| `TrackLayerComponent::ApplyLayersToAnim` | `trackLayerComponent.h` | Merge layered keyframes with streaming anim |

## Playback tick (streamer)

Each `AnimEngine::Update` calls (in order):

1. `StreamingAnimationModifier::ApplyAlterationsBeforeUpdate`
2. `AnimationStreamer::Update`
3. `StreamingAnimationModifier::ApplyAlterationsAfterUpdate`

Inside `Update` (~L1973+): pending name applied → advance procedural + streaming tracks by `_relativeStreamTime_ms` → `SetKeepAliveIfAppropriate` if idle → `ExtractAnimationMessages` → `SendAnimationMessages` → `_relativeStreamTime_ms += AnimTimeStepMS` (from `_getAnimTimeStepMS()`).

Tracks locked via `SetLockedTracks` / `LockTrack` (backpack lights forced locked in non-dev builds).

## Talks to

- **Depends on:** `cannedAnimLib/` (`Animation`, `CannedAnimationContainer`, procedural face drawer); `faceDisplay/`; `audio/AnimationAudioClient` + `ProceduralAudioClient`; `animProcessMessages` for send helpers; `RobotDataLoader` for asset lookup [CONFIRMED].
- **Depended on by:** `AnimEngine` (owns streamer); `animProcessMessages` (`Process_playAnim` → `SetStreamingAnimation` ~L234); `ShowAudioStreamStateManager`, `FaceInfoScreenManager`, connection flow, perf metric [CONFIRMED].
- **Engine peer:** engine `AnimationComponent` issues `PlayAnim` / abort / face / lock CLAD; streamer executes [CONFIRMED via docs + handlers].

## Notable observations

- Naming still says “stream to robot” (Cozmo WiFi holdover); on Vector most face/audio stays local, motion keyframes go to robot via anim relay.
- Backpack light track is always locked in shipping (`SetLockedTracks`).
- Keep-alive waits `_longEnoughSinceLastStreamTimeout_s` after last stream to avoid fighting sequenced anims.
- Upstream docs say 33 Hz; this rebuild advances by `AnimTimeStepMS` (16 default) — keyframe times still authored on 33 ms grid (`SPRITE_FRAME_INTERVAL_MS`).

## Open questions

- [UNKNOWN] Full list of banned tracks / weather & wake-word lock workarounds (`InvalidateBannedTracks`).
- [UNKNOWN] Whether 16 ms step changes perceived smoothness of 33 ms–authored face sequences beyond documented intent.
