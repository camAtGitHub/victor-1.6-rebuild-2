# alexa/

**Path:** `animProcess/src/cozmoAnim/alexa/`  
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** medium  
**Upstream docs:** [`docs/development/alexa.md`](../../../../docs/development/alexa.md)

## What this is

Opt-in Amazon Alexa Voice Service integration living in the anim process: AVS client wrapper, mic sample feed, media player, keyword observer hooks, revoke-auth path. Heavy enough to be its own subtree (`media/` for player + attachment readers).

## Contents (top)

| Entry | What it is |
|---|---|
| `alexa.{h,cpp}` | Public façade: opt-in, update, mic samples, tap-to-talk, wake word notify |
| `alexaImpl.*`, `alexaClient.*`, `alexaObserver.*` | AVS SDK pimpl / client / observers |
| `alexaAudioInput.*` | Mic path into AVS |
| `alexaMessageRouter.*`, capability wrappers | AVS message routing |
| `alexaKeywordObserver.*` | Wake-word glue |
| `media/` | `AlexaMediaPlayer`, audio factory, stream/attachment readers, playback recognizer component |
| revoke-auth handlers/observers | Account unlink |

## Wiring

- Held on `AnimContext`; `AnimEngine::Init` → `GetAlexa()->Init`; `AnimProcessMessages::Update` → `GetAlexa()->Update`.
- Mic: `Alexa::AddMicrophoneSamples` from mic pipeline; charger state from robot state handler.
- Wake word: `SpeechRecognizerPryonLite` under `speechRecognizer/` (not Picovoice).
- CMake: `${AVS_LIBS}`; option `ALEXA_ACOUSTIC_TEST`.

## Talks to

- Engine (opt-in / UX state CLAD — details in upstream alexa.md); mic system; audio engine; face info screens (auth/debug).

## Open questions

- [UNKNOWN] Which AVS SDK version is linked (EXTERNALS).
- [UNKNOWN] Full engine CLAD surface for Alexa UX states in this rebuild.
