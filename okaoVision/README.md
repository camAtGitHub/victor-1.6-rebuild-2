# okaoVision

**Path:** `okaoVision/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:** `docs/architecture/visionSystem.md` (face/pet modes — no deep OKAO API walkthrough); glossary: `docs/mapping/GLOSSARY.md` (**Okao**); `okaoVision/README.txt` (Omron NDA notice)

## What this is

Vendored **Omron OKAO Vision SDK** drop for the robot: C headers under `include/` and prebuilt static libraries (`.a`) for **VICOS/Android armeabi-v7a** and **MacOSX**. No Anki application source lives here — it is the commercial third-party binary + API surface that `cti_vision` links for face (and related) tracking.

## Why it exists

Production face detection / parts / recognition / expression / smile / gaze-blink, plus pet detection, are provided by OKAO rather than pure OpenCV. CMake selects these libs when building `cti_vision` with `FACE_TRACKER_PROVIDER=FACE_TRACKER_OKAO` (`coretech/vision/CMakeLists.txt`).

## Contents

| Entry | Type | What it is |
|---|---|---|
| `README.txt` | file | Omron confidential SDK notice (2016); NDA / no reverse-engineering |
| `include/` | dir | Public C APIs (`OkaoAPI.h`, per-module `Okao*API.h`, defs, detection info) |
| `include/OkaoAPI.h` | file | Common OKAO: version, work memory, color conversions |
| `include/OkaoDtAPI.h` | file | Face **D**e**t**ection |
| `include/OkaoPtAPI.h` | file | Face **P**ar**t**s |
| `include/OkaoFrAPI.h` | file | Face **R**ecognition |
| `include/OkaoExAPI.h` | file | Facial **Ex**pression |
| `include/OkaoSmAPI.h` | file | **Sm**ile estimation |
| `include/OkaoGbAPI.h` | file | **G**aze & **B**link |
| `include/OkaoPcAPI.h` | file | Property estimation (wired in cmake for smile/gaze/blink path) |
| `include/OkaoCoAPI.h`, `OkaoCoDef.h`, `OkaoCoStatus.h` | files | OKAO common types/status |
| `include/OmcvPdAPI.h` | file | **P**et **d**etection (OMCV) |
| `include/OkaoEdAPI.h`, `OkaoTime.h`, … | files | Additional SDK surfaces (age/etc. as named) |
| `lib/Android/armeabi-v7a/` | dir | `libeOkao*.a`, `libeOmcvPd.a` for robot (VICOS) |
| `lib/MacOSX/` | dir | Same set for host/sim Mac builds |

## Key entry points

| Path | Why |
|---|---|
| `cmake/okao.cmake` | Maps `OKAO_VISION_DIR` → imported static targets + include path |
| Root `CMakeLists.txt` | `set(OKAO_VISION_DIR …/okaoVision)` and `include(okao)` |
| `coretech/vision/CMakeLists.txt` | Links `${OKAO_LIBS}`; defines `FACE_TRACKER_PROVIDER=FACE_TRACKER_OKAO` |
| `coretech/vision` face-tracker impl (e.g. `faceTrackerImpl_okao.cpp`) | [CONFIRMED elsewhere in mapping] Anki glue that calls these APIs |
| `engine/vision/` | Engine-side vision modes that consume face/pet results |

## Talks to

- Depends on: nothing else in-repo (closed binary SDK) — [CONFIRMED]
- Depended on by: `cti_vision` (`coretech/vision`) — [CONFIRMED] CMake link + face tracker define
- Depended on by: engine/vision stack transitively via `cti_vision` — [CONFIRMED]
- Platforms: **VICOS** → Android `armeabi-v7a` libs; **MACOSX** → Mac libs; other platforms **FATAL_ERROR** in `okao.cmake` — [CONFIRMED]

## Build

- Not built from source. `cmake/okao.cmake` creates `STATIC IMPORTED` targets named `Okao`, `OkaoCo`, `OkaoPc`, `OkaoDt`, `OkaoPt`, `OkaoEx`, `OkaoFr`, `OmcvPd`, `OkaoSm`, `OkaoGb` pointing at `libe${LIB}.a`.
- Licensed as **Commercial** via `anki_build_target_license`.
- VICOS uses `--whole-archive` bracketing for a subset of libs.

## Notable observations

- Folder is glue + binaries only; algorithm/integration code is under `coretech/vision`, not here.
- `README.txt` is vendor legal text, not project documentation.
- Alternate face tracker providers are defined in CMake (`FACIOMETRIC`, `FACESDK`, `OPENCV`, `TEST`) but provider is hard-set to **OKAO** for this tree.
- No Linux-host OKAO path in `okao.cmake` — pure Linux host builds that need faces would hit the fatal branch unless platform flags differ [CONFIRMED cmake logic].

## Open questions

- [UNKNOWN] Exact SDK version string available only via `OKAO_GetVersion` at runtime; tree has no separate VERSION file.
- [UNKNOWN] Whether all listed modules are still exercised on 1.6 production schedules or only a subset.
