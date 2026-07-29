# victor-clad (mapping notes)

**Path:** `victor-clad`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:** `victor-clad/README.md`, `victor-clad/tools/message-buffers/README.md`, `docs/development/clad.md` (thin pointer), `docs/development/switchboard-pairing.md` (RTS protocol consumers)

## What this is

Home of the **CLAD** (C-Like Algebraic Data) toolchain and the **SDK-external** message definitions. CLAD is Anki's binary message IDL: `.clad` sources are parsed into an AST, then language emitters generate pack/unpack code. This tree supplies (1) the Python parser and multi-language emitters, (2) C++/Go/JS/Python runtime support, (3) Victor-specific helper emitters, and (4) the single external-comms clad file used for robot↔app/SDK pairing traffic.

It is **not** where most on-robot messages live. Internal engine/robot/gateway/cloud messages live under sibling `clad/` (and other `*/clad*` trees); those consumers import generators and support from here.

## Why it exists

Without this directory the monorepo cannot generate message code: root `CMakeLists.txt` sets `CLAD_BASE_DIR` / `CLAD_VICTOR_EMITTER_DIR` here and `add_subdirectory("victor-clad")` early. The SDK surface (`messageExternalComms.clad`) is deliberately kept small so apps and SDKs only depend on externally exposed types (pairing, Wi‑Fi, OTA, cloud session, etc.).

## Contents

| Entry | Type | What it is |
|---|---|---|
| `README.md` | file | Upstream: SDK clad purpose, CMake options, `configure.py` usage |
| `CMakeLists.txt` | file | Options `CLAD_VICTOR_EMIT_{CPP,PYTHON,CSHARP}`; pulls in message-buffers + `clad/` |
| `configure.py` | file | Standalone non-cmake path: metabuild → cmake/ninja under `_build/`, output under `generated/` |
| `cmake/generate_clad.cmake` | file | `generate_clad`, `generate_clad_cpp`, `_cpplite`, `_c`, `_py`, `_cs` helpers |
| `clad/` | dir | SDK-only message defs + their CMake generation |
| `clad/sdk/clad/externalInterface/messageExternalComms.clad` | file | Sole SDK `.clad` — RTS pairing protocol v1–v5, outer `ExternalComms` union (~520 lines) |
| `clad/BUILD.in` | file | Metabuild source list for `sdk_clad` (glob of `sdk/clad/**/*.clad`) |
| `victorEmitters/` | dir | 6 Cozmo/Vector helper emitters (`*_declarations`, `*_switch`, CPPLite send helpers) |
| `tools/message-buffers/` | dir | Core CLAD: parser (`clad/`), emitters, support libs, unit tests, LICENSE |
| `tools/message-buffers/emitters/` | dir | CPP, CPPLite, C, CSharp, Go, Python, JS, Fuzz, ASTHash, ASTDebug |
| `tools/message-buffers/support/` | dir | Runtime: `SafeMessageBuffer` (C++), Go `anki/clad`, JS `clad.js`, Python `msgbuffers` |
| `tools/message-buffers/clad/` | dir | Lexer/parser AST (PLY-based); shebang still python2 in places, build invokes `python3` |
| `tools/build/` | dir | Vendored Anki build-tools (metabuild, ankibuild); used by `configure.py`, largely not Victor-runtime |

## Key entry points

| Path | Why |
|---|---|
| `victor-clad/README.md` | Intended external consumers and emit flags |
| `tools/message-buffers/README.md` | Full CLAD language spec and architecture |
| `cmake/generate_clad.cmake` | How every consumer actually invokes emitters |
| `clad/sdk/.../messageExternalComms.clad` | External wire protocol (RtsConnection_1…_5, ExternalComms) |
| `tools/message-buffers/emitters/CPP_emitter.py` | Primary C++ code generator |
| `victorEmitters/cozmo_CPP_switch_emitter.py` | Generates handler switch stubs used by engine-style code |
| Root `CMakeLists.txt:148–150` | Wires `CLAD_BASE_DIR` and `add_subdirectory("victor-clad")` |

## Talks to

- **Depends on:** Python 3 at generate time (`generate_clad` runs `/usr/bin/env python3`); `jsoncpp` for the `clad` static lib [CONFIRMED in `tools/message-buffers/CMakeLists.txt`].
- **Depended on by (generators + `include(generate_clad)`):** `clad/`, `robot/clad/`, `coretech/common/clad_src/`, `coretech/vision/clad_src/`, `lib/util/source/anki/clad/` [CONFIRMED via CMakeLists greps].
- **Depended on by (SDK product):** `sdk_clad_cpp` linked into `engine_clad` (`clad/CMakeLists.txt`); switchboard RTS handlers and `test/switchboard/*` include generated `messageExternalComms.h` [CONFIRMED].
- **Sibling split:** `clad/` owns bulk internal `.clad` sources and drives multi-language emission using this toolchain; `victor-clad/clad/` is SDK-only [CONFIRMED by tree size and README policy].

## Build

1. Root CMake adds `victor-clad/cmake` to `CMAKE_MODULE_PATH` and `add_subdirectory("victor-clad")`.
2. `victor-clad/CMakeLists.txt` → `tools/message-buffers` (builds `libclad` / `SafeMessageBuffer`) → `clad/` (SDK emit).
3. Defaults: `CLAD_VICTOR_EMIT_CPP=ON`, Python/C# OFF; outputs under `generated/clad`, `generated/cladPython`, `generated/cladCSharp` (overridable).
4. Source lists come from `generated/cmake/sdk_clad.srcs.lst` (via metabuild from `BUILD.in` / repo-wide srclist pipeline).
5. Standalone: `./configure.py --cpp|--python|--csharp` runs metabuild + cmake/ninja with `CLAD_VICTOR_SKIP_LICENSE=ON`.

Generated artifacts are not checked into this folder; they land under repo-root `generated/`.

## Notable observations

- **Two roles in one tree:** (A) shared generator platform used monorepo-wide; (B) tiny SDK message surface. Most “what messages exist?” questions belong in sibling `clad/`, not here.
- **Historical separate-repo shape:** Upstream README still describes push to a `victor-clad` repo and pull into “chewie”; in this rebuild it is in-tree.
- **Versioned RTS protocol in one file:** `RtsConnection_1`…`_5` plus outer `ExternalComms` with fixed tags — matches `docs/development/switchboard-pairing.md` and switchboard handlers.
- **Victor emitters vs stock emitters:** Full languages live under `tools/message-buffers/emitters/`; `victorEmitters/` add process-handler helpers (declarations, switch, anim/robot send helpers) used especially by `robot/clad` (CPPLite path).
- **Python version drift:** Several scripts still say `#!/usr/bin/env python2`; CMake custom commands use `python3`.
- **Typos in CMake variable names** (`CLAD_EMITER_DIR`, `CLAD_EMMITER_DIR` in some clad CMakeLists) are present in sibling consumers; `victor-clad/clad/CMakeLists.txt` itself uses the correct `CLAD_EMITTER_DIR` for the emitters it actually runs [CONFIRMED for this tree only].
- **`tools/build/` is large and generic** — treat as vendored build plumbing for `configure.py`/metabuild, not as part of the message system design.

## Open questions

- [UNKNOWN] Whether `CLAD_VICTOR_EMIT_PYTHON` / `_CSHARP` are enabled in any production or SDK CI configuration of this rebuild.
- [UNKNOWN] Whether `messageExternalComms.clad` has rebuild-specific deltas vs stock Anki 1.6 (needs `CHANGES.md` / diff against upstream).
- [UNKNOWN] Relationship of this tree to any remaining separate `victor-clad` git history or submodule (here it is a plain directory).
- [INFERRED] Confluence link in upstream README is unreachable; treat `tools/message-buffers/README.md` as the language authority instead.
