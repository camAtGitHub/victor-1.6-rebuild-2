# beiConditions

**Path:** `engine/aiComponent/beiConditions`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:**
- [`docs/architecture/beiConditions.md`](../../../docs/architecture/beiConditions.md)
- Behavior stack: [`docs/architecture/behaviors.md`](../../../docs/architecture/behaviors.md)
- Parent AI: [`engine/aiComponent/README.md`](../README.md)
- Consumers: [`engine/aiComponent/behaviorComponent/README.md`](../behaviorComponent/README.md)

## What this is

**BEI Conditions** (Behavior External Interface Conditions) are small true/false predicates used mainly by the behavior system to decide whether a behavior wants to run. Each condition answers one question by reading state through a `BehaviorExternalInterface&` (the BEI *facade* in `behaviorComponent/behaviorExternalInterface/`). Data-driven behavior JSON references condition types; `BEIConditionFactory` constructs the C++ objects.

This directory is substantial: factory + interface + **~60 condition implementations** under `conditions/` (~123 source files).

## Why it exists

Separates “what the robot is reacting *to*” from “how it reacts.” The same reaction behavior (e.g. play an animation) can be gated by different conditions (picked up, cliff, pending intent) without forking C++ classes. Upstream: `beiConditions.md`.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `iBEICondition.h/.cpp` | file | Base interface: Init, SetActive, `AreConditionsMet` |
| `iBEICondition_fwd.h` | file | Shared pointers / handles |
| `beiConditionFactory.h/.cpp` | file | Create from JSON type or enum; custom-condition injection |
| `beiConditionMessageHelper.*` | file | Helper for message-driven conditions |
| `beiConditionDebugFactors.*` | file | Debug factor reporting / WebViz |
| `iBEIConditionEventHandler.h` | file | Event-handler interface for conditions |
| `conditions/` | dir | Concrete `Condition*` classes (see groups below) |

## Relationship of BEI to behaviors

Two related but distinct “BEI” ideas:

1. **BehaviorExternalInterface** — facade object that behaviors and conditions use to access FaceWorld, BlockWorld, robot pose, mood, user intents, etc. (`behaviorComponent/behaviorExternalInterface/`).
2. **BEI Conditions** — this folder: predicates that take that facade and return bool.

Wiring into behaviors ([CONFIRMED]):

- `ICozmoBehavior` JSON key `wantsToBeActivatedCondition` builds conditions via `BEIConditionFactory::CreateBEICondition` (`iCozmoBehavior.cpp` ~L81, ~L295–304).
- On activate-scope enter/leave, conditions are `SetActive(...)`.
- `WantsToBeActivatedBase` requires every stored condition’s `AreConditionsMet(GetBEI())` (`iCozmoBehavior.cpp` ~L1074–1077).
- User-intent waiting also installs intent conditions into the same list (`respondToUserIntents` path ~L668+).
- Custom code-defined conditions can be injected with `BEIConditionFactory::InjectCustomBEICondition` (scoped handles).

Conditions are **not** the behavior stack and do not own control; they only gate activation (and can request vision modes via `IVisionModeSubscriber`).

## Key interface

From `iBEICondition.h`:

- `Init(BEI)` once after construction
- `SetActive(BEI, bool)` — active windows manage vision subscriptions
- `AreConditionsMet(BEI) const` → `AreConditionsMetInternal` pure virtual
- Type from CLAD `BEIConditionType` (`clad/types/behaviorComponent/beiConditionTypes.h`)
- Optional `GetRequiredVisionModes` for auto vision scheduling

Factory (`beiConditionFactory.h`):

- `CreateBEICondition(Json, ownerDebugLabel)`
- `CreateBEICondition(BEIConditionType, ownerDebugLabel)`
- `InjectCustomBEICondition(name, ptr)` for nested data+code conditions
- `IsValidCondition(Json)` structural check

## Condition inventory (by theme, not every class)

Under `conditions/` — names are self-describing:

| Theme | Examples |
|---|---|
| Always / logic | `conditionTrue`, `conditionCompound`, `conditionBecameTrueThisTick`, `conditionTimedDedup`, `conditionLambda`, `conditionConsoleVar` |
| Robot pose / motion | `conditionOnCharger`, `conditionOnChargerPlatform`, `conditionOffTreadsState`, `conditionCliffDetected`, `conditionStuckOnEdge`, `conditionUnexpectedMovement`, `conditionRobotPickedUp`, `conditionBeingHeld`, `conditionRobotHeldInPalm`, `conditionRobotPlacedOnSlope`, `conditionRobotShaken`, `conditionRobotPitchInRange`, `conditionRobotRollInRange`, `conditionObstacleDetected`, `conditionProxInRange` |
| Touch / button | `conditionRobotTouched`, `conditionRobotPoked`, `conditionTimePowerButtonPressed` |
| Battery / thermal | `conditionBatteryLevel`, `conditionHighTemperature`, `conditionTooHotToCharge` |
| Cube | `conditionCarryingCube`, `conditionConnectedToCube`, `conditionCubeTapped`, `conditionUserHoldingCube`, `conditionObjectKnown/Moved/InitialDetection/PositionUpdated` |
| Faces / pets / vision | `conditionFaceKnown`, `conditionFacePositionUpdated`, `conditionEyeContact`, `conditionMotionDetected`, `conditionPetInitialDetection`, `conditionSalientPointDetected`, `conditionIlluminationDetected` |
| Mood / feature | `conditionEmotion`, `conditionSimpleMood`, `conditionFeatureGate`, `conditionInCalmMode`, `conditionIsNightTime` |
| Habitat / Alexa | `conditionRobotInHabitat`, `conditionAlexaInteractionActive` |
| Behavior system | `conditionBehaviorSuggested`, `conditionBehaviorTimer`, `conditionTimerInRange`, `conditionSettingsUpdatePending`, `conditionEngineErrorCodeReceived`, `conditionIsMaintenanceReboot` |
| Voice / intent | `conditionTriggerWordPending`, `conditionUserIntentPending`, `conditionUserIntentActive`, `iConditionUserIntent` base |
| Stimuli rollup | `conditionAnyStimuli`, `conditionBeatDetected` |

Unit-test helper: `conditionUnitTest.h`.

## Talks to

- Depends on: `BehaviorExternalInterface` and whatever robot components BEI exposes (mood, sensors, user intents, habitat, …) [CONFIRMED].
- Depended on by: `ICozmoBehavior` and any dispatcher/behavior that constructs conditions from JSON or C++ [CONFIRMED].
- Types: CLAD `beiConditionTypes` [CONFIRMED].

## Build

Part of `cozmo_engine`. No separate codegen step observed for conditions (unlike behavior factory); new conditions need factory case + CLAD type [INFERRED for factory wiring — verify `beiConditionFactory.cpp` when adding].

## Notable observations

- Upstream best practice: prefer a shared engine component as source of truth when non-behavior code needs the same fact; conditions are thin wrappers for behavior JSON (`beiConditions.md`).
- Debug factors can stream to WebViz when conditions evaluate (`SendConditionsToWebViz` in `iBEICondition.cpp` path).
- Naming collision risk for agents: “BEI” alone is ambiguous — always say “BEI condition” vs “BEI facade.”

## Open questions

- [UNKNOWN] Whether every `BEIConditionType` enum value has a matching `conditions/condition*.cpp` (factory completeness not audited line-by-line).
- [UNKNOWN] How many production JSON files use compound vs single conditions (asset-side stats not run).
