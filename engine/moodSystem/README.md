# moodSystem

**Path:** `engine/moodSystem`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:** [`docs/architecture/emotions.md`](../../docs/architecture/emotions.md) — **primary reference**

## What this is

Victor’s **emotion / mood** runtime: a vector of scalar emotions (CLAD `EmotionType`), event-driven deltas, time decay toward defaults, and hooks into audio, animation selection, behaviors, and external clients. Central type is **`MoodManager`** (robot + behavior-component dual interface).

## Why it exists

Gives behaviors and animation/audio a shared affective state driven by named emotion events (success/fail, social contact, etc.). Upstream notes the system is **less behavior-driving than originally intended** for Cozmo — still used for anim selection (e.g. driving anims) and some behavior gates, not as a full emergent architecture.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `moodManager.h` / `.cpp` | file | Owns emotion array, event trigger, decay update, action-completed mapping, audio/webviz export |
| `emotion.h` / `.cpp` | file | Single emotion scalar + history buffer; min/max/default; decay update |
| `emotionEvent.*` | file | Named event payload applying one or more affectors |
| `emotionEventMapper.*` | file | Name → event mapping |
| `emotionAffector.*` | file | Per-emotion delta contribution inside an event |
| `emotionScorer.*`, `moodScorer.*` | file | Scoring helpers (match mood/emotion conditions) |
| `moodDecayEvaluator.*` | file | Graph-based decay toward default over time |
| `staticMoodData.*` | file | Shared static config (decay graphs, event tables) loaded from JSON |
| `stimulationFaceDisplay.*` | file | Face/display stimulation presentation helper |

## Key entry points

1. **`MoodManager`** (`moodManager.h`)
   - `IDependencyManagedComponent<RobotComponentID>` + `UnreliableComponent<BCComponentID>`
   - Update deps: `CozmoContextWrapper`, `EngineAudioClient`; also accesses `RobotStatsTracker`
   - **Modify:** `TriggerEmotionEvent(name)`, `AddToEmotion(s)`, `SetEmotion`, `SetEmotionFixed`
   - **Query:** `GetEmotionValue`, recent deltas, `GetSimpleMood()` / transition helpers
   - **Actions:** listens for action completions → emotion events via `_actionCompletedEventMap`; `SetEnableMoodEventOnCompletion(actionTag, bool)`
   - **Egress:** `SendEmotionsToGame()`, `SendEmotionsToAudio`, `SendStimToApp`, `SendMoodToWebViz`
   - Constants: `kEmotionChangeVerySmall` … `VeryLarge` (0.06 … 1.0)

2. **`Emotion`** (`emotion.h`) — value in roughly **[-1, 1]** (upstream: positive named emotion, negative = opposite); history for recent-tick/second deltas; `Update(evaluator, dt, velocity, accel)`.

3. **`StaticMoodData`** — process-wide static config: decay evaluators, `EmotionEventMapper`; `MoodManager::GetStaticMoodData()`.

4. **Types** — `clad/types/emotionTypes.clad`, `simpleMoodTypes.clad` (referenced from headers; definitions not re-listed here).

## Emotion model (from upstream + headers)

| Idea | Detail |
|---|---|
| Range | Typically -1.0 … 1.0; 0 ≈ default/neutral drift target |
| Examples | Happy↔Sad, Confident↔Frustrated, Social↔Lonely |
| Events | Named strings; repetition penalty via event timestamps |
| Decay | Toward 0 over time via `MoodDecayEvaulator` graphs |
| SimpleMood | Coarser discrete mood from stimulation + confidence (`GetSimpleMood`) |
| Consumers | Animation selection, behavior conditions, audio game parameters |

## Talks to

- Depends on: robot context, audio client, action completion messages (`RobotCompletedAction`) [CONFIRMED]
- Depends on: JSON mood config / emotion event files via `RobotDataLoader` [CONFIRMED `LoadEmotionEvents`]
- Depended on by: behaviors / BEI conditions / `DrivingAnimationHandler` (upstream) [INFERRED from docs + engine layout]
- External: can push mood/stim to game (CLAD) and WebViz [CONFIRMED method names]

## Build

Part of `cozmo_engine`. Config data lives under resources (paths loaded via data loader — not enumerated this pass).

## Notable observations

- Dual component bases (Robot + BC Unreliable) match BlockWorld/FaceWorld pattern for behavior access.
- Historical role reduced (upstream `emotions.md` “Historical note”) — prefer explicit behavior transitions over pure mood-driven emergence.
- Typo preserved in code: `MoodDecayEvaulator` (missing ‘l’) in `emotion.h` friend/forward usage.

## Open questions

- [UNKNOWN] Exact resource JSON paths for emotion events and decay graphs in this tree.
- [UNKNOWN] Which `EmotionType` values are still actively read by shipping behaviors vs dead config.
