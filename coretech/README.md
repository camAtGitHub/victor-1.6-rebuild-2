# coretech

**Path:** `coretech`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:**
- [`docs/architecture/arch_overview.md`](../docs/architecture/arch_overview.md) (Coretech section)
- [`docs/architecture/visionSystem.md`](../docs/architecture/visionSystem.md)
- [`docs/architecture/neuralNets.md`](../docs/architecture/neuralNets.md)
- [`docs/architecture/planner.md`](../docs/architecture/planner.md)
- [`docs/architecture/poses.md`](../docs/architecture/poses.md)
- [`docs/architecture/observableObjects.md`](../docs/architecture/observableObjects.md)
- Index: [`docs/mapping/UPSTREAM-DOCS-INDEX.md`](../docs/mapping/UPSTREAM-DOCS-INDEX.md)

## What this is

**Coretech** (CMake project name `cti`) is Anki’s product-independent robotics library used by Vector’s engine, anim, and robot processes. Upstream describes it as shareable code with robotics focus (vision and path planning) that may someday merge with `lib/util` ([`arch_overview.md`](../docs/architecture/arch_overview.md)). It is not a process by itself: consumers link static libraries (`cti_common`, `cti_vision`, `cti_planning`, `cti_messaging`, `cti_neuralnets`, plus `*_robot` / `*_shared` variants).

Roughly ~800 tracked files. Largest subtree is `vision/` (engine + robot + matlab + tools).

## Why it exists

Without coretech, engine/robot/anim lose shared math (poses/transforms), vision primitives (images, markers, faces, image cache), lattice/grid planning helpers, socket IPC helpers, and neural-net model wrappers. Product-specific orchestration stays in `engine/`; algorithms and data types live here so they can be reused across processes and (historically) products.

## Contents

Top-level only (L1). Do not fully expand `vision/` internals here.

| Entry | Type | What it is |
|---|---|---|
| `common/` | dir | Shared types, math/poses, array2d, logging, JSON tools; `engine/` / `robot/` / `shared/` splits; CLAD for points/rects/poses. Has a legacy upstream `README.md` (MSVC/MATLAB env notes). |
| `messaging/` | dir | TCP/UDP/unix-domain client/server wrappers + `IComms`; local socket path constants for engine/anim/switchboard/gateway. |
| `neuralnets/` | dir | `INeuralNetModel` + TensorFlow / TFLite / offboard backends; default build platform **TFLite** (`NEURAL_NET_PLATFORM`). |
| `planning/` | dir | Path types + A* / bidirectional A* / `xythetaPlanner` lattice planner code used under engine’s `XYPlanner`. |
| `vision/` | dir | Images, camera, markers, faces (OKAO), neural-net runner glue, sprite/composite helpers; large `matlab/` and `robot/` (fiducials, LK tracking). |
| `CMakeLists.txt` | file | `project(cti)`; generates common+vision CLAD; `import`s all five `cti_*` subdirs |

### Second-level map (one paragraph each)

#### `common/`

Foundation library for all other CTI modules. **`engine/`** holds higher-level basestation code: `math/` (poses, transforms, polygons, quads — see [`poses.md`](../docs/architecture/poses.md)), `colorRGBA`, `jsonTools`, `objectIDs`, `mailbox`, OpenCV threading helpers. **`robot/`** is the embedded-oriented layer: fixed-size arrays/lists, matrix/geometry, compress, decision trees, error handling, host M4 intrinsics — built as `cti_common_robot` with `CORETECH_ROBOT`. **`shared/`** has types, array2d, logging, and math shared by both. **`clad_src/clad/types/`**: `cladPoint.clad`, `cladRect.clad`, `poseStructs.clad` → generated to `generated/coretech/common` (`cti_common_clad`). Also `matlab/`, `test/`, and small `tools/`. Public include root is the repo parent of `coretech/` so includes look like `coretech/common/engine/math/pose.h`.

#### `messaging/`

Transport helpers, not CLAD message definitions. **`shared/`**: `TcpClient`/`TcpServer`/`TcpMultiClientServer`, `UdpClient`/`UdpServer`, `LocalUdpClient`/`LocalUdpServer`, `SocketUtils`, and `socketConstants.h` (unix-domain paths under `/dev/socket/` on device or `/tmp/` in simulator: engine↔anim, anim↔robot, engine↔switchboard, engine/gateway, switchboard/gateway). **`engine/IComms.h`**: abstract comms interface. **`apps/`**: echo-server sample binaries. Builds `cti_messaging`, `cti_messaging_robot`, `cti_messaging_shared`.

#### `neuralnets/`

On-device (and offboard) CNN inference support used by vision. Flat C++ sources (no engine/robot split): `neuralNetModel_interface` plus backends `neuralNetModel_tflite`, `neuralNetModel_tensorflow`, `neuralNetModel_offboard`; params/keys/filenames helpers; `iNeuralNetMain` for the historical separate `vic-neuralnets` / Webots controller path ([`neuralNets.md`](../docs/architecture/neuralNets.md) notes that production now runs models in-process). CMake defaults `NEURAL_NET_PLATFORM` to **TFLite**; links TensorFlow/TFLite artifacts from `ANKI_EXTERNAL_DIR` / EXTERNALS. `test/` has sample images, `.tflite`/`.pb` models, and gtest. Salient-point types come from vision CLAD (`salientPointTypes.clad`).

#### `planning/`

Motion-planning library consumed by engine planners (not the product `XYPlanner` wrapper itself). **`engine/`**: `aStar`, `bidirectionalAStar`, `xythetaPlanner` / environment / actions / states, open list, state table, path helper, robot action params — lattice A\* in (x, y, θ); upstream [`planner.md`](../docs/architecture/planner.md) notes production path planning uses grid A\* in engine with bidirectional search from coretech. **`shared/`**: `path` (segment lists with engine vs robot max segment counts via `CORETECH_ENGINE` / `CORETECH_ROBOT`) and `goalDefs`. **`matlab/`** and **`tools/`**: motion-primitive generation, env JSON fixtures, viz scripts. Builds `cti_planning` and `cti_planning_robot`.

#### `vision/`

Largest CTI module; product vision *system* orchestration lives in `engine/vision/` and uses these types. **`engine/`**: `Image`/`ImageCache`/`CompressedImage`, `Camera`/`CameraCalibration`/`CameraParamsController`, `MarkerDetector`/`VisionMarker`, `ObservableObject` library, face/pet trackers (default `FACE_TRACKER_PROVIDER=FACE_TRACKER_OKAO`), `NeuralNetRunner`, debayer, undistorter, gaze/eye-contact, brightness histogram, profiler — do **not** fully map further at L1. **`shared/`**: composite images, RGB565 helpers, sprite cache/sequence/path map, marker code definitions (used heavily by anim face display). **`robot/`**: lower-level fiducial detection, connected components, Lucas–Kanade trackers, decision trees, mex helpers. **`clad_src/clad/types/`**: camera params, face/pet/salient-point types, image formats, composite-image layouts/maps/motion sequences, enrolled-face storage → `generated/coretech/vision` (`cti_vision_clad`); a subset is also emitted as **cpplite** for robot-size messages (`cti_vision_clad_cpplite`). **`matlab/`** (~150 `.m` files) and **`tools/`** (test images, decision-tree tooling) are research/dev — not expanded. Builds `cti_vision` (+ MACOSX tests/eval/debayer tools). Links OpenCV and OKAO (`include(okao)`).

## Key entry points

| What | Where | Why |
|---|---|---|
| CMake root | `coretech/CMakeLists.txt` | Wires CLAD gen + all `cti_*` imports |
| Poses / transforms | `common/engine/math/pose.h`, `poseBase.h`, `transform.h` | Coordinate frames used everywhere; see [`poses.md`](../docs/architecture/poses.md) |
| Path representation | `planning/shared/path.h` | Shared engine/robot path segments |
| Bidirectional A* | `planning/engine/bidirectionalAStar.h` | Cited by [`planner.md`](../docs/architecture/planner.md) |
| Lattice planner | `planning/engine/xythetaPlanner.h` | Full (x,y,θ) planner implementation |
| Images / markers | `vision/engine/image.h`, `markerDetector.h`, `observableObject.h` | Core vision data types |
| Face tracker facade | `vision/engine/faceTracker.h` | Hides OKAO (default) / other providers |
| Neural net models | `neuralnets/neuralNetModel_interface.h`, `*_tflite.*` | TFLite production backend |
| Local socket paths | `messaging/shared/socketConstants.h` | IPC path names for multi-process comms |
| Common CLAD | `common/clad_src/clad/types/*.clad` | Points, rects, pose structs |
| Vision CLAD | `vision/clad_src/clad/types/*.clad` | Faces, pets, salient points, composite image, camera |

## Talks to

- **Depends on:**
  - `lib/util` (`util`) — [CONFIRMED] linked by `cti_common` / vision / neuralnets
  - OpenCV via `opencv` CMake module / `opencv_interface` — [CONFIRMED] `cti_common`, `cti_vision`
  - `okaoVision/` / OKAO libs — [CONFIRMED] `cti_vision` `include(okao)`, face tracker provider OKAO
  - TensorFlow / TFLite under external deps — [CONFIRMED] `cti_neuralnets` CMake
  - CLAD toolchain (`generate_clad`, `clad` target) — [CONFIRMED] common/vision clad CMake
  - `robot_interface` — [CONFIRMED] linked by `cti_vision`
  - jsoncpp, zlib — [CONFIRMED] common / neuralnets
- **Depended on by:**
  - `engine/` (`cozmo_engine`) — [CONFIRMED] links `cti_common`, `cti_messaging`, `cti_vision`, `cti_planning`, `cti_neuralnets` (`engine/CMakeLists.txt`)
  - `robot/` — [CONFIRMED] `cti_common_robot`, `cti_planning_robot`, `cti_messaging` / `cti_messaging_robot`
  - `animProcess/` — [CONFIRMED] `cti_common_robot`, `cti_vision`, `cti_messaging_robot` (+ deliberate non-robot `cti_common` for executable)
  - `cubeBleClient/` — [CONFIRMED] `cti_common`
  - `test/engine`, `test/animProcess`, `test/switchboard` — [CONFIRMED]
  - Root build — [CONFIRMED] `import(coretech "coretech")` in root `CMakeLists.txt` ~L174
  - CLAD aggregators — [CONFIRMED] `clad/CMakeLists.txt` and `robot/clad/CMakeLists.txt` include `coretech/*/clad_src` paths
- **Generated output:** `generated/coretech/common`, `generated/coretech/vision`, plus vision composite-image **cpplite** under `generated/clad/robot` — [CONFIRMED]

## Build

- Root: `import(coretech "coretech")` → `coretech/CMakeLists.txt` (`project(cti)`).
- Order: `common/clad_src/clad` and `vision/clad_src` first (`CTI_GENERATED_LIBS`), then `import(cti_common|messaging|neuralnets|planning|vision …)`.
- Each subdir has `CMakeLists.txt` + often `BUILD.in` (src lists for `anki_build_cxx_library`).
- Dual builds: several modules produce `cti_*` (engine, `CORETECH_ENGINE`) and `cti_*_robot` (`CORETECH_ROBOT`); messaging also has `cti_messaging_shared` (`CORETECH_SHARED`).
- MACOSX enables unit tests under common/planning/vision/neuralnets where present.
- MATLAB subdirs only when `MATLAB` is on (vision mex, etc.).
- OpenCV Android libs copy step on VICOS for `cti_common`.

## Notable observations

- Naming is consistently **CTI** (`cti_*` targets) while the folder is **coretech**; include paths use `coretech/...`.
- Split between **product orchestration** (`engine/vision`, `engine/xyPlanner.h`) and **library code** here is intentional; upstream docs mix both layers — always check which tree a type lives in (e.g. `Vision::ObservableObject` in coretech vs `Vector::ObservableObject` in engine).
- `common/README.md` is a short legacy MSVC/MATLAB note, not a mapping doc.
- Vision CLAD intentionally dual-emits a size-limited **cpplite** set for robot E2R messages (comment in `vision/clad_src/CMakeLists.txt`).
- Lattice `xythetaPlanner` remains in tree; [`planner.md`](../docs/architecture/planner.md) says production no longer uses lattice A\* for main motion planning (grid A\* in engine instead) — library code retained.
- Neural nets default to TFLite; full TensorFlow and “offboard” backends still present.
- Face tracker compile-time enum supports FacioMetric/FaceSDK/OpenCV/OKAO/Test; **OKAO is selected**.
- Overlap with `lib/util` is acknowledged upstream; no merge in this tree.

## Open questions

- [UNKNOWN] Exact runtime inventory of which `cti_*_robot` symbols the robot supervisor actually calls beyond path following.
- [UNKNOWN] Whether any rebuild-specific patches exist under coretech vs stock Anki 1.6 (`CHANGES.md` does not call out coretech by name in the samples checked at L1).
- [UNKNOWN] Current production use of `INeuralNetMain` / separate neuralnets process vs pure in-process runner (docs say in-process; code still present).
- [UNKNOWN] Ownership boundary between `vision/shared` sprite/composite code and `animProcess` / `cannedAnimLib` for face rendering.
