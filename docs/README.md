# docs

**Path:** `docs/`  
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high  
**Upstream docs:** this tree *is* the upstream Anki 1.6 documentation set, plus rebuild mapping notes

## What this is

Engineering documentation for Vector firmware. Two upstream Anki trees (`architecture/`, `development/`) plus loose root guides; plus **`mapping/`** notes written during the documentation-only indexing phase of this rebuild fork.

⚠️ **Do not edit** files under `architecture/` or `development/` (or other upstream docs here) as part of mapping work. Index and link; verify claims against code when the rebuild may have diverged (`CHANGES.md`).

## Why it exists

Explains process layout, subsystems, and how to build/debug the robot software. Mapping notes under `mapping/` orient agents/humans to *this* checkout without rewriting Anki docs.

## Contents

| Entry | Type | What it is |
|---|---|---|
| [`architecture/`](architecture/) | dir | System design: processes, actions, behaviors, vision, map, planner, cubes, etc. Start at [`architecture/README.md`](architecture/README.md) |
| [`development/`](development/) | dir | Build, CLAD, debugging, profiling, DAS, switchboard BLE APIs, mics, VS Code, web server, … |
| [`mapping/`](mapping/) | dir | **Rebuild mapping phase** cross-cuts: high-level model, engine tick, behavior tree, glossary, WebViz review, idea notes |
| `DEPS.md` | file | How dependency (`DEPS` / deptool) entries work |
| `FAQ.md` | file | Common robot connect / log / deploy FAQ (Anki-era office context) |
| `build-system-walkthrough.md` | file | Build system narrative |
| `ccache.md` | file | ccache usage |
| `mac-client-setup.md` | file | Mac client tooling setup |
| `mic_capture.md` | file | Mic capture notes |

## Key entry points

| Goal | Open first |
|---|---|
| Process map (Engine / Anim / Robot) | [`architecture/arch_overview.md`](architecture/arch_overview.md) |
| Full upstream doc index (one line per file) | [`mapping/UPSTREAM-DOCS-INDEX.md`](mapping/UPSTREAM-DOCS-INDEX.md) |
| Cross-cutting control hierarchy | [`mapping/HIGH-LEVEL.md`](mapping/HIGH-LEVEL.md) |
| 60 ms engine tick order | [`mapping/ENGINE-ROBOT-TICK.md`](mapping/ENGINE-ROBOT-TICK.md) |
| Freeplay / HighLevelAI spine | [`mapping/ENGINE-BEHAVIOR-TREE.md`](mapping/ENGINE-BEHAVIOR-TREE.md) |
| Terms (CLAD, BEI, syscon, …) | [`mapping/GLOSSARY.md`](mapping/GLOSSARY.md) |
| Build / CLAD / debug how-tos | [`development/`](development/) (`build-instructions.md`, `clad.md`, …) |

## Talks to

- Describes code under: `engine/`, `animProcess/`, `robot/`, `coretech/`, `platform/`, `cloud/`, `clad/`, `simulator/`, … — [CONFIRMED] architecture docs
- Mapping notes may cite rebuild deltas; stock docs may lag `CHANGES.md` — [CONFIRMED] phase rules

## Build

Documentation only. Not compiled.

## Notable observations

- Stock Anki docs still use Cozmo-era names in places; code often retains them (`CozmoEngine`, etc.).
- `mapping/` is the only subtree intended for agent-authored notes in the documentation phase.

## Open questions

- None for L1; see `mapping/UPSTREAM-DOCS-INDEX.md` for per-file coverage.
