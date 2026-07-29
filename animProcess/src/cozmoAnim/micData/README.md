# micData/

**Path:** `animProcess/src/cozmoAnim/micData/`  
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high  
**Upstream docs:** [`docs/development/mic-systems-overview.md`](../../../../docs/development/mic-systems-overview.md)  
**Sibling:** [`../speechRecognizer/README.md`](../speechRecognizer/README.md)

## What this is

Microphone pipeline hub inside `vic-anim`: accepts multi-channel mic payloads from the robot process, runs Signal Essence beamforming + VAD, hands mono audio to wake-word recognizers, manages cloud streaming jobs, and publishes direction / beat / trigger events toward engine and cloud.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `micDataSystem.{h,cpp}` | file | API hub: Init, Update, jobs, mute, locale, cloud UDP, Alexa state |
| `micDataProcessor.{h,cpp}` | file | SE processing threads, VAD, direction, stream-job creation |
| `micDataInfo.{h,cpp}` | file | Per-job recording / streaming buffer state |
| `micImmediateDirection.{h,cpp}` | file | Immediate direction estimate helper |
| `micTriggerConfig.{h,cpp}` | file | Locale → model/search file map (JSON-driven) |
| `audioFFT.{h,cpp}`, `notchDetector.{h,cpp}` | files | FFT utility; Alexa notch filter for false triggers |
| `../beatDetector/` | dir | Aubio beat detector used from processor |

## Data path (entry)

```
robot process  --RobotToEngine::micData-->  AnimProcessMessages
       → MicDataSystem::ProcessMicDataPayload
       → MicDataProcessor::ProcessMicDataPayload  (enqueue raw buffers)
       → ProcessRawLoop (SE combine / direction / VAD)
       → ProcessTriggerLoop → SpeechRecognizerSystem::Update
```

Evidence: `animProcessMessages.cpp` `ProcessMicDataMessage` ~L722; `micDataSystem.cpp` ~L191; `micDataProcessor.cpp` `ProcessMicDataPayload` ~L830.

## MicDataSystem

- Constructed in `AnimContext`; owns `MicDataProcessor` + `SpeechRecognizerSystem`.
- `Init(dataLoader)`: `SpeechRecognizerSystem::InitVector` (Hey Vector callback) + processor `Init` (`micDataSystem.cpp` ~L142).
- `Update` each tick from `AnimProcessMessages::Update` (~L947) — streaming jobs, cloud, mute, Alexa screen abort flags.
- Listens on `MIC_SERVER_BASE_PATH` UDP for cloud/mic side (`~L133`).
- Trigger callback: ignore if Alexa Active; else `VoiceTriggerWordDetection` + DAS log (~L145–164).

## MicDataProcessor

- **ProcessingState:** `None` / `NoProcessingSingleMic` / `SigEsBeamformingOff` / `SigEsBeamformingOn` (`micDataProcessor.h` ~L75).
- Signal Essence: includes `se_diag.h`, `svad.h`; policy via `SEDiagSetEnumAsInt` / fallback flags (`~L867+`).
- VAD (`DoSVad` / `SVadObject`) gates expensive work and trigger recognition (matches upstream overview).
- Direction: confidence lists aligned to `RobotInterface::MicDirection` size asserts.
- `CreateStreamJob` starts cloud-bound capture with optional overlap.
- Mute freezes enqueue (`MuteMics`).

## Talks to

- **Depends on:** robot `MicData` CLAD; `lib` `signal_essence`, `micdata`; `speechRecognizer/`; `Alexa` (state, samples); cloud CLAD + local UDP [CONFIRMED].
- **Depended on by:** `animProcessMessages` (payload + Update); `AnimEngine` (mic direction → `MicrophoneAudioClient`); face info screens (draw mic clock) [CONFIRMED].
- **Rebuild note:** wake word is **Picovoice** for Vector (not Sensory THF as stock docs describe) — see speechRecognizer README.

## Notable observations

- Ownership order in `AnimContext`: MicDataSystem destroyed **before** Alexa (comment in `animContext.h`).
- Cache write path: `DataPlatform` cache `micdata/` for clips (dev).
- Engine localization update resets listen direction (`Tag_absLocalizationUpdate`).

## Open questions

- [UNKNOWN] Live model files under `resources` for Picovoice vs residual Sensory assets.
- [UNKNOWN] Exact SE library version flag `SE_V009` in this rebuild’s EXTERNALS (out of scope to open).
