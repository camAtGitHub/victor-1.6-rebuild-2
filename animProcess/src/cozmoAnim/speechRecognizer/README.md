# speechRecognizer/

**Path:** `animProcess/src/cozmoAnim/speechRecognizer/`  
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high  
**Upstream docs:** [`docs/development/mic-systems-overview.md`](../../../../docs/development/mic-systems-overview.md) (Sensory THF — **stock Anki; this rebuild differs**)  
**Parent mic hub:** [`../micData/README.md`](../micData/README.md)

## What this is

Wake-word / keyword detection wrappers and a system object that multiplexes **Vector** (“Hey Vector”) and **Alexa** triggers, locale model selection, and optional notch filtering. Fed mono PCM from `MicDataProcessor` each processing quantum.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `speechRecognizerSystem.{h,cpp}` | file | Locale + multi-trigger orchestration |
| `speechRecognizerPicovoice.{h,cpp}` | file | **Vector** trigger backend (rebuild: “swapped in Picovoice”) |
| `speechRecognizerPryonLite.{h,cpp}` | file | **Alexa** trigger backend (Amazon Pryon Lite) |

## Who uses which engine

| Role | Implementation | Init evidence |
|---|---|---|
| Vector “Hey Vector” | `SpeechRecognizerPicovoice` | `InitVector` → `TriggerContext<SpeechRecognizerPicovoice>` (`speechRecognizerSystem.cpp` ~L313); include comment “swapped in Picovoice” ~L21 |
| Alexa wake word | `SpeechRecognizerPryonLite` | `make_unique<TriggerContext<SpeechRecognizerPryonLite>>("Alexa", …)` ~L510 |
| Alexa playback recognizer | Pryon Lite again | `_alexaPlaybackTrigger` ~L529 |

Stock `mic-systems-overview.md` documents Sensory THF for Vector. That description is **upstream Anki**, not this tree’s live Vector path.

## SpeechRecognizerSystem API

- `InitVector(dataLoader, locale, callback)` — always at boot from `MicDataSystem::Init`.
- `Update(audioData, len, vadActive)` — same-thread audio pump (call site: mic processor trigger loop).
- Locale updates via `RecognizerTypeFlag` bits (`VectorMic`, `AlexaMic`, …).
- `ToggleNotchDetector` / `UpdateNotch` — drop Alexa triggers when speaker notch detected (AEC false positives).
- Friend: `AlexaPlaybackRecognizerComponent` for AVS playback path.

Config keys still reference THF-style names in places (e.g. `micTriggerConfig->Init("hey_vector_thf", …)` ~L317) — [INFERRED] legacy config key naming retained after Picovoice swap.

## Talks to

- **Depends on:** CMake `pv_porcupine`, `PRYON_LITE_LIBS`; `MicTriggerConfig` / `RobotDataLoader` models; `lib` audioUtil `SpeechRecognizer` base [CONFIRMED].
- **Depended on by:** `MicDataSystem` (owns system); Alexa opt-in path creates Pryon context [CONFIRMED].

## Notable observations

- Dual-stack: Picovoice + Pryon linked into `victor_anim` (`animProcess/CMakeLists.txt`).
- Console groups `SpeechRecognizer.Vector` / `.Alexa` for model sensitivity / locale in dev.
- When Alexa is `Active`, MicDataSystem drops Vector trigger callbacks.

## Open questions

- [UNKNOWN] Whether any Sensory binary still ships for residual code paths (no THF `.cpp` in this folder).
- [UNKNOWN] Production model file layout under resources/assets for Porcupine vs `hey_vector_thf` key.
