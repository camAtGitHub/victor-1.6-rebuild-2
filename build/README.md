# build/

**Path:** `build/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:** root `README.md` (Docker / bare-metal build instructions)

## What this is

A small **Docker-oriented convenience layer** for building and deploying this rebuild fork. Four tracked files: image definition, interactive Docker shell helper, “build release (maybe in Docker)” wrapper, and “deploy+start (maybe in Docker)” wrapper. Not the CMake build tree (that is `_build/`) and not Anki’s old `project/buildServer/`.

## Why it exists

Gives Linux hosts a repeatable Debian Bookworm builder image (`vic-standalone-builder-8`) with ninja/clang/ccache/cmake so developers can build without installing the full toolchain on the host. macOS and `NO_DOCKER=1` paths call the same `project/victor/scripts/*` scripts bare-metal.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `Dockerfile` | file | `debian:bookworm-20250630-slim` + build packages; non-root user matching host UID/GID |
| `docker.sh` | file | Build/reuse image `vic-standalone-builder-8`, mount repo + caches, drop into interactive bash |
| `build-v.sh` | file | Build wrapper: mac/`NO_DOCKER` → `victor_build_release.sh`; else Docker run of same script |
| `deploy-v.sh` | file | Ensure `robot_ip.txt` + `robot_sshkey`, then `victor_deploy.sh -c Release -b` + `victor_start.sh` (host or Docker) |

## Key entry points

1. **`./build/build-v.sh`** (from repo root)  
   - Rejects root.  
   - Darwin or `NO_DOCKER=1`: runs `./project/victor/scripts/victor_build_release.sh "$@"`.  
   - Else: ensures `anki-deps/`, `build/cache/{ccache,go,user}`, builds image from `build/` if missing, `docker run` with volume mounts, executes `victor_build_release.sh` inside the container.

2. **`./build/docker.sh`**  
   Same image/cache setup as build-v, but leaves an interactive shell in the container (auto-build of the release script is commented out). Writes `.username` with `$HOME`.

3. **`./build/deploy-v.sh`**  
   Prompts for robot IP into `robot_ip.txt` if absent; requires root-level `robot_sshkey` (credential file — do not open/print). Then SSH-agent + deploy + start, on host or via the same Docker image.

## Talks to

- Depends on: `project/victor/scripts/victor_build_release.sh`, `victor_deploy.sh`, `victor_start.sh` [CONFIRMED]; Docker CLI [CONFIRMED]; host `robot_ip.txt` / `robot_sshkey` for deploy [CONFIRMED].
- Depended on by: rebuild-oriented docs / workflows that prefer `./build/build-v.sh` over `source setenv.sh && vbuild` [INFERRED from root README patterns].

## Build

Does not produce firmware by itself; only invokes the real build under `project/victor/`. Runtime artifacts created on disk (often gitignored): `build/cache/*`, host `anki-deps/`, Docker image tag `vic-standalone-builder-8`.

## Notable observations

- Image name is hard-coded `vic-standalone-builder-8` in both build and docker scripts.
- `build-v.sh` cleans legacy `build/cache/0` layout if present.
- Deploy script mounts host `~/.ssh` into the container on Linux Docker path; still uses repo-root `robot_sshkey` via `ssh-add`.
- Parallel to, not a replacement for, `setenv.sh` aliases (`vbuild` / `vdeploy`) — same underlying scripts, different UX.

## Open questions

- [UNKNOWN] Whether root `README.md` currently recommends `build-v.sh` as the primary path for all platforms.
- [UNKNOWN] Image rebuild policy when `Dockerfile` changes but the named image already exists (script reuses image without rebuild).
