# textToSpeech/

**Path:** `animProcess/src/cozmoAnim/textToSpeech/`  
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** medium  
**Upstream docs:** none dedicated; see [`docs/development/alexa.md`](../../../../docs/development/alexa.md) for adjacent voice UX

## What this is

TTS generate/cache/play path for anim process. Engine sends prepare/play/cancel CLAD; component synthesizes via Acapela (VICOS) or platform stubs (Mac), then injects wave data into the audio engine. Streamer can coordinate lip/eye timing via `StreamingAnimationModifier` + TTS component pointer.

## Contents

| Entry | What it is |
|---|---|
| `textToSpeechComponent.*` | Public API; message handlers; cache of wave data by TTS id |
| `textToSpeechProvider.*` | Abstract provider |
| `textToSpeechProvider_acapela.*` | Acapela/Babile synthesis |
| `textToSpeechProvider_vicos.*` / `_mac.*` | Platform glue |
| `textToSpeechProviderConfig.*` | Voice/style config |

## Key wiring

- Created in `AnimEngine::Init` after data load (`animEngine.cpp` ~L113).
- `AnimEngine::Update` calls `_ttsComponent->Update()` each tick (~L203).
- Handlers: `TextToSpeechPrepare` / `Play` / `Cancel` on `AnimEngine` (`animEngine.h` ~L78–80).
- Passed into `AnimationStreamer::Init` and `StreamingAnimationModifier`.

## Talks to

- **Depends on:** CMake `${TEXT2SPEECH_LIBS}`; `CozmoAudioController` for playback [CONFIRMED].
- **Depended on by:** engine TTS actions via CLAD; streamer modifier [CONFIRMED].

## Open questions

- [UNKNOWN] Exact Acapela voice set and license install path on device images.
