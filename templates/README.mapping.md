# templates (mapping notes)

**Path:** `templates/`  
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high  
**Upstream docs:** `docs/development/vscode.md` (vscode bootstrap); version generation via `cmake/gen-version.cmake`  
**Note:** Upstream [`README.md`](README.md) exists (“Victor Template Files”) — this file is mapping detail only.

## What this is

Small set of **input templates** for (1) CMake-generated version/revision files shipped under the build tree’s `etc/`, and (2) VS Code workspace JSON to copy into `.vscode/`. Not runtime robot code.

## Why it exists

- Build needs a single place to format `version`, `revision`, and `victor-compat-version` strings from `VERSION` / env / git / `VICTOR_COMPAT_VERSION`.
- Developers need a known-good VS Code task/include bootstrap (documented in `docs/development/vscode.md`).

## Contents

| Entry | Type | What it is |
|---|---|---|
| `README.md` | file | Upstream one-liner: “template files for use with victor” |
| `cmake/` | dir | `configure_file` inputs for version metadata |
| `cmake/version.in` | file | `@BASE_VERSION@.@ANKI_BUILD_VERSION@@ANKI_BUILD_TYPE@@ANKI_BUILD_TAG@` |
| `cmake/revision.in` | file | `@ANKI_BUILD_VICTOR_REV@` (git short HEAD or env) |
| `cmake/victor-compat-version.in` | file | `@VICTOR_COMPAT_VERSION@` |
| `vscode/` | dir | Copy-to-`.vscode` bootstrap; see `vscode/README.md` |
| `vscode/c_cpp_properties.json` | file | Include paths / `MACOSX`+`SIMULATOR` defines (host/Webots-era) |
| `vscode/tasks.json` | file | Tasks: `build:debug` → `project/victor/build-victor.sh`, deploy, lldb |
| `vscode/launch.json` | file | Debugger launch config |
| `vscode/settings.json` | file | Workspace editor settings |
| `vscode/README.md` | file | Instructs copy into `[repo]/.vscode` |

## Key entry points

- `cmake/gen-version.cmake` — `configure_file` of the three `.in` files → `${CMAKE_BINARY_DIR}/etc/{version,revision,victor-compat-version}`
- Root `CMakeLists.txt` — `include(gen-version)` (~L208)
- `docs/development/vscode.md` — `cp templates/vscode/*.json .vscode`

## Talks to

- Depends on: root `VERSION`, `VICTOR_COMPAT_VERSION`; env `ANKI_BUILD_VERSION` / `ANKI_BUILD_TAG` / `ANKI_BUILD_VICTOR_REV`; optional `git rev-parse` — [CONFIRMED] `cmake/gen-version.cmake`
- Depended on by: CMake build (`gen-version.cmake`) — [CONFIRMED]
- Depended on by: human setup for VS Code (not automated by CMake) — [CONFIRMED] `vscode.md`
- VS Code tasks invoke: `project/victor/build-victor.sh`, `project/victor/scripts/deploy.sh`, `start-lldb.sh` — [CONFIRMED] `tasks.json`

## Build

Templates themselves are not compiled. CMake substitutes `@…@` placeholders into `_build`/`CMAKE_BINARY_DIR` `etc/` outputs. VS Code JSON is manual copy only.

## Notable observations

- `vscode/c_cpp_properties.json` is skewed toward **Mac + simulator** include roots (Webots, Xcode SDK, Wwise paths); VICOS/cross paths may need local edits [CONFIRMED] file contents.
- Upstream `README.md` is intentionally minimal; keep mapping notes here so that file stays untouched.

## Open questions

- [UNKNOWN] Whether CI or other tools consume `templates/` beyond gen-version and documented vscode copy.
