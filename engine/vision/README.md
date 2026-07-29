# vision

**Path:** `engine/vision`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:**
- [`docs/architecture/visionSystem.md`](../../docs/architecture/visionSystem.md)
- [`docs/architecture/neuralNets.md`](../../docs/architecture/neuralNets.md)

## What this is

**Heavy vision processing** for `vic-engine`: the `VisionSystem` class, per-mode detectors, schedules/mode sets, pose snapshots, and the `VisionProcessingResult` “mailbox” payload. Runs **off the engine tick** on a worker thread owned by `VisionComponent` (`engine/components/visionComponent.*` — not in this folder).

## Why it exists

Camera work (markers, faces, motion, neural nets, AE, etc.) is too slow and variable to block the 60 ms engine update. This directory holds the system that consumes an image + robot pose snapshot, runs enabled modes, and posts results for the main thread to apply to BlockWorld / FaceWorld / pets / nav / behaviors.

## VisionSystem vs VisionComponent boundary

| Piece | Location | Role |
|---|---|---|
| **`VisionComponent`** | `engine/components/visionComponent.h/.cpp` | Robot component: main-thread API, camera capture handoff, **worker thread** (`Processor`), mode enable via VSM, `UpdateAllResults()` → worlds |
| **`VisionSystem`** | `engine/vision/visionSystem.h/.cpp` | Member of component; actual per-image processing + detectors + result mailbox |
| **`VisionScheduleMediator` (VSM)** | `engine/components/visionScheduleMediator/` | Aggregates subscriber mode requests into `AllVisionModesSchedule`; runs **before** VisionComponent each tick |

Upstream summary (`visionSystem.md`): component is the interface; system is the async worker. Synchronous mode exists for unit/Webots tests (`SetIsSynchronous`).

**Thread path (confirmed):**

1. Engine tick: VSM applies schedule → VisionComponent updates.
2. `SetNextImage` / capture path fills `VisionSystemInput`, sets `locked`, notifies `_imageReadyCondition`.
3. `VisionComponent::Processor` thread (`std::thread`, name `"VisionSystem"`) waits on condition, calls `UpdateVisionSystem` → `VisionSystem::Update`.
4. Results queued under mutex (`CheckMailbox` / `VisionProcessingResult`); main thread drains via `UpdateAllResults` (markers → BlockWorld, faces → FaceWorld, etc.).

## Contents

| Entry | Type | What it is |
|---|---|---|
| `visionSystem.h/.cpp` | file | Core async processor; owns detectors; `Update`, face album, AE, mailbox |
| `visionSystemInput.h` | file | Image buffer + pose + modes input package shared with component |
| `visionProcessingResult.h/.cpp` | file | Output container: markers, faces, pets, motion, lasers, edges, salient points, … |
| `visionPoseData.h/.cpp` | file | Robot pose snapshot for the image timestamp |
| `visionModeSet.h/.cpp` | file | `std::set`-backed set of `VisionMode` |
| `visionModeSchedule.h/.cpp` | file | Per-mode bool schedule + `AllVisionModesSchedule` defaults |
| `visionModesHelpers.h/.cpp` | file | Mode↔neural-net name LUT (`People`→`person_detector`, `Hands`→`hand_detector`) |
| `cameraCalibrator.h/.cpp` | file | Factory / multi-image camera calibration |
| `cropScheduler.h/.cpp` | file | Horizontal crop cycling for marker detection |
| `motionDetector.h/.cpp` (+ `motionDetector_neon.h`) | file | Image motion detection (optional NEON path) |
| `laserPointDetector.h/.cpp` | file | Laser-dot detection |
| `overheadEdgesDetector.h/.cpp` | file | Ground-plane overhead edges / interesting edges |
| `overheadMap.h/.cpp` | file | Overhead mapping support |
| `groundPlaneClassifier.h/.cpp`, `groundPlaneROI.h/.cpp`, `rawPixelsClassifier.h/.cpp` | files | Driving-surface / ground-plane classification |
| `illuminationDetector.h/.cpp` | file | Scene illumination estimate |
| `imageSaver.h/.cpp` | file | Save processed images (debug / data collection) |
| `mirrorModeManager.h/.cpp` | file | Draw detections on face display (mirror mode) |
| `nearestNeighborLibraryData.h` | file | Data helper for NN library [shallow] |

## Vision modes

Enum in `clad/src/clad/types/visionModes.clad`. Full modes + “modifiers” (require a parent mode):

| Mode | Typical worker (in / used by VisionSystem) |
|---|---|
| `Markers` (+ `Markers_*` modifiers) | `Vision::MarkerDetector` (coretech); crop via `CropScheduler`; CLAHE options |
| `Faces` (+ `Faces_Expression/Smile/Gaze/Blink/Crop`) | `Vision::FaceTracker` (coretech; OKAO backend) |
| `Pets` | `Vision::PetTracker` (coretech / OKAO) |
| `Motion` | `MotionDetector` (this folder) |
| `Lasers` | `LaserPointDetector` |
| `OverheadEdges` | `OverheadEdgesDetector` |
| `OverheadMap` | `OverheadMap` |
| `Calibration` | `CameraCalibrator` |
| `AutoExp` / `WhiteBalance` (+ AE modifiers) | `Vision::CameraParamsController` |
| `Stats` | Image mean / quality stats |
| `BrightColors` | `Vision::BrightColorDetector` |
| `Obstacles` | Visual obstacles list on result |
| `Benchmark` | `Vision::Benchmark` |
| `SaveImages` | `ImageSaver` |
| `People` / `Hands` | Neural net runners (`visionModesHelpers` registration) |
| `Illumination` | `IlluminationDetector` |
| `Viz` | Compressed display image for viz/SDK |
| `MirrorMode` | `MirrorModeManager` |
| `Markers_Off` | Forces skip of Markers when “enabled” |

`CycleCompletesInOneFrame` in the same CLAD file marks multi-frame modes (`AutoExp_Cycling`, `Markers_Composite` need >1 frame).

### Schedules

- **`VisionModeSchedule`**: boolean pattern or “every N frames” with offset (`IsTimeToProcess(index)`).
- **`AllVisionModesSchedule`**: one schedule per mode; defaults from JSON.
- **Runtime control (not in this folder):** behaviors/actions subscribe via `VisionScheduleMediator::SetVisionModeSubscriptions` / `AddAndUpdate…` / `ReleaseAll…`. `IAction::GetRequiredVisionModes` feeds VSM while an action runs. Upstream still describes push/pop `VisionModeSchedule` on VisionComponent; VSM is the production multi-subscriber mediator observed in code.

## Detectors / subcomponents owned by VisionSystem

From `visionSystem.h` members (~L228–245):

- **Coretech (`Anki::Vision::`)**: `FaceTracker`, `PetTracker`, `MarkerDetector`, `BrightColorDetector`, `ImageCompositor`, `Benchmark`, `ImageCache`, `Camera` / calibration / params controller.
- **This folder**: `LaserPointDetector`, `MotionDetector`, `OverheadEdgesDetector`, `CameraCalibrator`, `OverheadMap`, `GroundPlaneClassifier`, `IlluminationDetector`, `ImageSaver`, `MirrorModeManager`.
- **Neural nets**: `std::map<std::string, unique_ptr<Vision::NeuralNetRunner>>` — async via `std::future` (see `neuralNets.md`); results as `SalientPoint`s (timestamp may lag the image).

Mailbox: `_mutex` + `queue<VisionProcessingResult> _results`; `CheckMailbox` for main thread.

## Relationship to `coretech/vision` and `okaoVision`

| Layer | Role |
|---|---|
| `engine/vision/` | Robot-specific orchestration, schedules, engine detectors, result packaging |
| `coretech/vision/` | Shared library: camera, image cache, marker/face/pet trackers, bright colors, neural net runners/models, CLAHE helpers |
| `okaoVision/` (repo top-level) | Omron OKAO SDK integration artifacts |
| `coretech/vision` CMake | `include(okao)`, `FACE_TRACKER_PROVIDER=FACE_TRACKER_OKAO`, links `OKAO_LIBS`; implementations e.g. `faceTrackerImpl_okao.cpp`, `petTracker.cpp` |

Faces/pets recognition compute is **extra-async inside** face/pet trackers (upstream: sub-threads). Neural nets are a third asynchrony level inside `VisionSystem`.

Config: `resources/config/engine/vision_config.json` (incl. NeuralNets section); models under `resources/config/engine/vision/dnn_models` (LFS) per `neuralNets.md`.

## Key entry points

1. `docs/architecture/visionSystem.md` + `neuralNets.md`
2. `visionSystem.h` — public `Init` / `Update` / `CheckMailbox` / mode queries
3. `engine/components/visionComponent.h` — thread ownership, `SetNextImage`, `UpdateAllResults`
4. `engine/components/visionScheduleMediator/visionScheduleMediator.h` — mode subscription API
5. `clad/src/clad/types/visionModes.clad` — mode enum
6. `visionProcessingResult.h` — everything one image can produce
7. `visionModesHelpers.cpp` — neural-net mode registration LUT

## Talks to

- Depends on: `coretech/vision/engine/*` (detectors, camera, image cache, NeuralNetRunner) [CONFIRMED]
- Depends on: `clad/types/visionModes.clad`, camera/image/salient CLAD types [CONFIRMED]
- Depends on: `CozmoContext`, `VizManager`, robot pose history snapshots [CONFIRMED]
- Depended on by: `engine/components/visionComponent` (sole runtime host) [CONFIRMED]
- Depended on by: BlockWorld / FaceWorld / pet world / map / behaviors via results on main thread [CONFIRMED / INFERRED for map path]
- Depended on by: actions like `WaitForImagesAction`, visually-verify / track actions (VSM subscriptions) [CONFIRMED]

## Build

Part of `cozmo_engine`. Vision algorithms also require `cti_vision` / OKAO linkage from `coretech/vision`. Neural-net backends live under `coretech/neuralnets` (TFLite default per upstream).

## Notable observations

- ImageCache compute-on-demand avoids repeated resize/color convert across modes (`visionSystem.md`).
- Rolling shutter correction and marker CLAHE policies live in `VisionSystem`.
- `People`/`Hands` are neural modes; `Pets` is OKAO tracker (commented mobilenet mapping in helpers).
- Factory dot test path runs on **main** thread inside VisionComponent (header note), not the full VisionSystem path.
- OpenCV threads explicitly limited on the Processor thread.

## Open questions

- [UNKNOWN] Full default schedule JSON field names / frequencies without reading `vision_config.json` line-by-line in this pass.
- [UNKNOWN] Whether `Obstacles` mode still has a dedicated detector class beyond result fields populated from edges/overhead path.
- [INFERRED] SalientPoint → engine `SalientPointComponent` (or similar) lives outside this folder; behaviors consume people/hands detections there.
- [UNKNOWN] Rebuild-specific vision deltas (if any) beyond stock Anki 1.6 — not flagged in this tree alone.
