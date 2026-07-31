# Console var mapping session — 2026-07-31 (orchestrator + 25 agents)

## Mode
Orchestrator assigned prefix clusters; subagents researched per `cvcatalog/AGENTS.md`, wrote shards, and git-committed. Orchestrator registered shards in `index.json` after each wave.

## Waves
| Agents | Pattern | Clusters |
|---:|---|---|
| 1 | solo | Markers + MarkerDetector |
| 2–3 | 2 parallel | PowerSave; MicData (anim) |
| 4–6 | 3 parallel | RTS; BPDB; ProcFace (anim) |
| 7–9 | 3 parallel | VisionBenchmark; Faces/StimFace; Left eye |
| 10 | solo | Right eye |
| 11–25 | 5×3 parallel | Alexa, LED1–4, AutoExp, audio/TTS, custom eye, motors, DirStream, speech/noise, cliff, OS/display, mood/stats, calib |

## New / updated shards (this session, approx)
Engine: markers, powersave, rts, bpdb, vision-benchmark, faces, autoexp, led1–4, custom-eye, dirstream-trigger, cliff-obs, mood-stats, calib  
Anim: mic (append), procface, eye-left, eye-right, alexa, audio-tts, procedural-motors, speech-noise, os-display-dev  

## Notable findings (samples)
- RTS display thresholds are **partial** (WebViz only; real gates in reactToSound JSON)
- ProcFace_InterpolationType **dead**; DefaultScanlineOpacity **partial**
- CustomEyeColor* need **DebugSetCustomEyeColor** to apply
- LED alpha channels **partial** (ignored by Block::SetLEDs)
- Calibration VisionMode largely **partial** (VIC-7177 image store commented; factory gates)
- Bare dump ids like `Alexa`, `Microphones`, `SpeechRecognizer` often **dead** category artifacts

## Counts (end of session — re-run diff if needed)
See orchestrator final python print for engine/anim documented vs unmapped.

## Suggested next
- Remaining engine singles / mid-size clusters (NeuralNetRunner, Onboarding/PRDemo, BodyTurnSpeed, RenderBorders, …)
- Remaining anim dump orphans and shared util channel vars
- Optional: console **functions** (`consolefunclist_*`)
