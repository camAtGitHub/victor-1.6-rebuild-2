# Idea: Personality packs (selectable)

**Status:** idea only — not implemented  
**Captured:** 2026-07-28  
**Owner interest:** high — user wants selectable packs, including possible voice (“activate X mode”)

Related mapping: `docs/mapping/ENGINE-BEHAVIOR-TREE.md`, `docs/mapping/HIGH-LEVEL.md`  
Related config: `resources/config/engine/behaviorComponent/behaviors/victorBehaviorTree/` especially `highLevelAI.json`, observing/explore delegates, careful use of `globalInterruptions.json`

---

## Elevator pitch

Ship **named JSON policy packs** that retune freeplay rhythm (HLAI cooldowns, boredom timers, dispatcher `cooldown_s`, optional interrupt priorities below safety) **without** new Cozmo asset dumps and ideally **without** new `behaviorClass` C++.

**Product twist (required by stakeholder):** packs are **user-selectable** at runtime (or boot), not a rebuild-time fork. Ideally activatable by:

- Web / CCIS / config menu
- Voice: e.g. “Hey Vector, activate Desk mode” / “activate Zen mode”
- [OPTIONAL] App/SDK later

Differentiation vs other custom firmwares: they often port files/anims; this ships **switchable personality policy** on the Vector stack.

---

## What a pack is

A named bundle that overrides (or replaces) subsets of behavior JSON / dials, for example:

| Area | Example knobs (stock already has these kinds of fields) |
|---|---|
| `HighLevelAI` | `socializeKnownFaceCooldown_s`, `playWithCubeCooldown_s`, `BoredOfObserving` / `BoredOfExploring` `begin_s`, `maxFaceDistanceToSocialize_mm`, `initialState` |
| Delegate dispatchers | e.g. ObservingInternal child `cooldown_s` (eye contact, look-at-faces, …) |
| Interrupt list | Reorder or gate **non-safety** entries only — never demote mandatory physical reactions |
| Manifest | `id`, display name, description, voice trigger phrase(s), version |

Example packs (illustrative): `stock`, `desk`, `puppy`, `zen`.

---

## Selectability (design intent)

### Activation surfaces

1. **Explicit user choice** — web page, CCIS CONF, settings jdoc / variable snapshot.  
2. **Voice** — map cloud/user intent → “set active personality pack” (fits `UserIntentComponent` + `user_intent_map.json` + a small claiming behavior, or settings path).  
3. **Persistence** — selected pack survives reboot (jdocs / variable snapshot / settings manager — pick one existing store when implementing).

### Apply strategy (open decision for later design)

| Option | Pros | Cons |
|---|---|---|
| **A. Boot-time apply** — selection written to disk; `vic-engine` restart loads pack | Simple, matches current “JSON loaded at data load” model | Not instant; voice says “ok” then brief restart or next boot |
| **B. Hot reload** — swap behavior container / re-read JSON live | Instant “activate X mode” | Harder; BehaviorContainer may not be designed for full swap |
| **C. Runtime multipliers** — pack = table of cooldown scales applied in C++ | Fast switch without reload | Less “pure JSON”; more code |

**Stakeholder lean:** selectable + voice-friendly → prefer **feel of instant or near-instant**; if hot reload is too hard, **voice sets pack + soft restart of engine** or “applies next freeplay cycle” is acceptable if UX is clear.

---

## Voice sketch (not implemented)

- Intents like `set_personality_desk`, `set_personality_zen`, or one intent with parameter `pack_id`.  
- Response: short anim/TTS confirmation (“Desk mode on”).  
- Failure: unknown pack name → unmatched / I-can’t-do-that style path.  
- Interaction with QuietMode / SDK override / SleepCycle: pack should not fight **ModeSelector** entries that are hard modes; define precedence (e.g. Sleep > SDK lock > personality pack freeplay dials).

---

## Non-goals (v1)

- Not an LLM personality.  
- Not replacing the whole tree with unrelated Cozmo behaviors.  
- Not allowing packs to disable cliff/mandatory safety interrupts.  
- Not requiring EXTERNALS or new cloud vendor (local intent map + wire-pod is enough if voice is desired).

---

## Why this is feasible here

- Freeplay policy already lives largely in JSON (`ENGINE-BEHAVIOR-TREE.md`).  
- Factory + container load from `RobotDataLoader` behavior JSON set.  
- Rebuild already has CCIS config patterns and custom voice/server story (`CHANGES.md`).  
- Selectability is the product layer on top of “just alternate JSON files.”

---

## Open questions (when designing for real)

- [ ] Persist where? (jdocs vs variableSnapshot vs flat file under `/data`)  
- [ ] Apply: boot vs hot vs hybrid?  
- [ ] Pack format: full file overlays vs JSON patch vs directory replace?  
- [ ] Which voice phrases / languages?  
- [ ] Does pack switch cancel current behavior stack or wait for gentle interrupt?  
- [ ] How do packs interact with rebuild-specific features (60 fps eyes, WireOS lights)?

---

## Next step when leaving mapping phase

Run full design (brainstorming skill) on **selectable personality packs + voice activate**, then implementation plan. Until then: **do not implement in-tree** under pure mapping rules unless user explicitly opens feature work.
