# cloud

**Path:** `cloud/`
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high
**Upstream docs:** none dedicated; mentions in `docs/development/profiling.md` (vic-cloud / vic-gateway), `docs/development/crash-reports.md` (no Go breakpad), `docs/architecture/whats_in_victor.md`. Existing product README: [`cloud/README.md`](README.md) (Vector-cloud build notes).

## What this is

On-robot Go service that bridges Vector to remote cloud endpoints (voice/Chipper, tokens, jdocs) and exposes the SDK/app **external interface** over TLS gRPC (plus grpc-gateway HTTP/JSON). The shipped binary is **`vic-cloud`** (`anki_build_go` target in `cloud/CMakeLists.txt`). The former separate **vic-gateway** process is merged into this binary: `main()` launches `mainGateway()` in a goroutine, then runs cloud subprocesses (`cloud/cloud/main.go`).

Go module: `github.com/digital-dream-labs/vector-cloud` (`go.mod`, Go 1.23).

## Why it exists

Without it the robot cannot stream mic audio to a speech/intent server, refresh cloud auth, sync jdocs, or accept app/SDK RPCs that control behaviors, motors, cubes, face enrollment, etc. Other processes (engine, anim, switchboard) talk to it over domain sockets; clients talk to it on TCP **443** (on-robot Linux config).

## Contents

| Entry | Type | What it is |
|---|---|---|
| `cloud/` | dir | `package main` — entrypoint, gateway server, RPC handlers, IPC managers |
| `internal/` | dir | Libraries used by the binary (voice, token, jdocs, ipc, proto, clad, …) |
| `CMakeLists.txt` | file | Root cloud CMake: `vic-cloud` Go build, protobuf generation, libopus copy |
| `BUILD.in` | file | Lists gateway/vision protobuf src globs for the build system |
| `go.mod` / `go.sum` | file | Module deps (grpc, grpc-gateway, chipper API clients, aws-sdk, jwt, …) |
| `Makefile` | file | Standalone cross-compile path (`make vic-cloud`); `vic-gateway` target commented out |
| `vic-cloud.service` | file | systemd unit for on-robot launch |
| `protoc-wrapper.sh` | file | Adds `cloud/go/bin` to PATH when running protoc plugins |
| `README.md` | file | Upstream-style “Vector-cloud” build/customize notes (DDL-era) |
| `CREDITS.md` | file | Contributor list |
| `LICENSE` | file | License text |

### `cloud/cloud/` (main package)

| Entry | Type | What it is |
|---|---|---|
| `main.go` | file | Process entry: wirepod cert load, mic/ai sockets, `cloudproc.Run`, starts gateway goroutine |
| `gateway.go` | file | `mainGateway()` — TLS gRPC + grpc-gateway mux, rate limiters, listen on `Port` |
| `message_handler.go` | file | Large `rpcService` implementing `ExternalInterface` RPCs; Proto↔CLAD converters |
| `ipc_manager.go` | file | Domain-socket managers to engine (CLAD + protobuf), switchboard (CLAD) |
| `switchboard_proxy.go` | file | `BLEProxy` — switchboard SDK proxy requests → HTTP/gRPC gateway |
| `tokens.go` | file | Client token hashes / jdocs socket for gateway auth |
| `platform_vicos.go` | file | `// +build vicos` — factory cloud data check, require voice token |
| `config_linux.go` | file | On-robot: `Port=443`, `SocketPath=/dev/socket/`, `IsOnRobot=true`, Bearer auth |
| `config_mac.go` | file | Dev Mac: `Port=8443`, `IsOnRobot=false` |
| `config_dev.go`, `cert_error_dev.go`, `verbose_logging.go`, `multilimiter.go` | files | Dev/logging/rate-limit helpers |

### `cloud/internal/` packages

| Entry | Type | What it is |
|---|---|---|
| `cloudproc/` | dir | Orchestrator: starts token (sync first), then voice, jdocs, logcollector, offboard_vision |
| `voice/` + `voice/stream/` | dir | Mic IPC → Chipper stream (`api-clients/chipper`); intent replies back over IPC |
| `token/` + `token/identity/` | dir | Token server for other processes; JWT/cert identity storage |
| `jdocs/` | dir | Cloud jdocs client/server path (settings/documents) |
| `logcollector/` | dir | S3 log upload service — **wired off** in `main.go` (commented options) |
| `offboard_vision/` | dir | Offboard vision service (dev vs shipping build tags) |
| `ipc/` | dir | Unix/UDP/datagram IPC helpers; VICOS paths under `/dev/socket/` |
| `proto/external_interface/` | dir | Generated Go protobuf + gRPC + grpc-gateway stubs |
| `proto/vision/` | dir | Generated vision protobuf |
| `clad/` | dir | Checked-in Go CLAD message types (`cloud/`, `gateway/`, `vision/`) |
| `config/` | dir | Loads `server_config.json` URL set (jdocs, tms, chipper, …) |
| `robot/` | dir | ESN, gateway cert paths, crash reporter / loguploader CGO glue |
| `log/` | dir | Logging + DAS C++/Go bridge pieces |
| `util/` | dir | gRPC/util helpers |
| `testing/` | dir | Test helpers (s3, time) |

## Key entry points

| What | Where | Why |
|---|---|---|
| Process start | `cloud/cloud/main.go` `main()` | Starts gateway goroutine, opens `mic_sock` / `ai_sock`, configures `cloudproc` |
| Cloud subprocesses | `internal/cloudproc/cloudproc.go` `Run()` | Token → voice / jdocs / logcollector / offboard_vision |
| Gateway / SDK surface | `cloud/cloud/gateway.go` `mainGateway()` | Registers `ExternalInterface`, TLS listen, grpc-gateway |
| RPC implementations | `cloud/cloud/message_handler.go` `rpcService` | DriveWheels, PlayAnimation, EventStream, BehaviorControl, cubes, faces, … |
| Proto ↔ engine CLAD | same file + `ipc_manager.go` | Converts external protobuf requests to engine CLAD/proto IPC |
| Server URL config | `internal/config/urls.go` | Default Anki-dev URLs; prefers `/data/data/server_config.json` if present |
| systemd | `vic-cloud.service` | `ExecStart=/usr/bin/logwrapper /anki/bin/vic-cloud` |

## Talks to

- **Depends on (on-robot IPC):**
  - `vic-engine` — domain sockets `_engine_gateway_server_` (CLAD, deprecating) and `_engine_gateway_proto_server_` (protobuf); engine handlers noted in `ipc_manager.go` comments (`UiMessageHandler`, `ProtoMessageHandler`). [CONFIRMED]
  - `vic-switchboard` — `_switchboard_gateway_server_` CLAD for auth / external connection / BLE SDK proxy. [CONFIRMED]
  - Animation / mic pipeline — unixgram `mic_sock` (audio in) and `ai_sock` (intent out) in `main.go`. [CONFIRMED]
  - Token/jdocs sockets among cloud-internal services (`tokens.go` jdocs domain socket). [CONFIRMED]
- **Depends on (remote / files):**
  - Chipper / token / jdocs endpoints from `server_config.json` (`internal/config/urls.go`). [CONFIRMED]
  - Gateway TLS material: `/data/vic-gateway/gateway.cert`, `/data/etc/robot.pem` (`robot/gateway_cert_vicos.go`). [CONFIRMED]
  - Optional wirepod CA: `/anki/etc/wirepod-cert.crt` or `/data/data/wirepod-cert.crt` (`main.go`). [CONFIRMED]
- **Depended on by:**
  - App/SDK clients over TLS gRPC/JSON on port 443. [CONFIRMED]
  - Other robot processes for tokens / voice results. [CONFIRMED]
  - Root build: `CMakeLists.txt` `add_subdirectory("cloud")`. [CONFIRMED]
- **Proto sources (outside this tree):** `tools/protobuf/gateway/public/*.proto` — generated into `internal/proto/external_interface/` and also C++ under `generated/proto/…` for engine. [CONFIRMED]

## Build

- **In-tree CMake** (`cloud/CMakeLists.txt`):
  - `anki_build_go(NAME vic-cloud DIR cloud/ SRC_DIRS cloud … BUILD_TAGS "vicos nolibopusfile")`
  - Custom target `proto_gen` runs `protoc-wrapper.sh` → `.pb.go`, `_grpc.pb.go`, `.pb.gw.go` into `cloud/internal/proto/external_interface/`
  - Separate `vic-gateway` `anki_build_go` block is **commented out** (merge into `vic-cloud`)
  - Copies `libopus.so.0` from `EXTERNALS/deps/opus` next to outputs; links Opus for voice
- **Standalone Makefile**: cross-compile arm with vicos SDK tags; UPX pack; gateway target commented
- **Not expanded here:** exact install path wiring of `vic-cloud.service` into the image [UNKNOWN without install scripts]

## Protobuf vs CLAD

| Layer | Format | Role |
|---|---|---|
| External SDK/app API | **Protobuf + gRPC** (+ grpc-gateway JSON) | `ExternalInterface` service; stubs in `internal/proto/external_interface/` |
| Gateway ↔ engine (new path) | **Protobuf** over domain socket | `EngineProtoIpcManager` / `GatewayWrapper` |
| Gateway ↔ engine (legacy) | **CLAD** over domain socket | `EngineCladIpcManager`; commented as temporary/deprecating |
| Gateway ↔ switchboard | **CLAD** | Auth, connection id, BLE SDK proxy |
| Cloud voice / token / mic path | **CLAD** (`internal/clad/cloud`) | Pack/unpack on unixgram sockets |
| CLAD Go sources in this folder | Checked-in under `internal/clad/` | Not regenerated by `cloud/CMakeLists.txt` (unlike protobuf). [INFERRED] source of truth lives in `clad/` / `victor-clad/` elsewhere |

## systemd unit

`vic-cloud.service`:

- `PartOf` / `WantedBy` `anki-robot.target`
- `After` / `Wants` `vic-engine.service`
- User `cloud`, group `anki`
- Env file `/anki/etc/vic-cloud.env`, opts `$VIC_CLOUD_OPTS`
- `AmbientCapabilities=CAP_DAC_READ_SEARCH` (factory cloud dir permissions — comment VIC-1951)
- `Restart=no`; stop post `vic-on-exit`

## Notable observations

- **Rebuild / WireOS deltas visible in-tree** (also summarized in root `CHANGES.md`):
  - Gateway merged into `vic-cloud` (single binary; separate gateway build disabled).
  - Wirepod custom CA load and preference for `/data/data/server_config.json` over stock `/anki/data/assets/cozmo_resources/config/server_config.json`.
  - Log collector explicitly disabled in `main.go` (“disable the STUPID log collector”).
  - `UploadDebugLogs` body in `message_handler.go` partially stubbed/disabled (“disabling so we can build the gateway”).
- Module path still `digital-dream-labs/vector-cloud`; chipper client is `github.com/digital-dream-labs/api-clients/chipper`.
- Crash reporting: CGO `robot.InstallCrashReporter` exists; upstream doc said Go breakpad was unfinished — verify against this tree’s reporter implementation if needed.
- `message_handler.go` is the dominant surface area (thousands of lines of RPC methods and converters).

## Open questions

- [UNKNOWN] Full install packaging path that places `vic-cloud` under `/anki/bin` and installs the unit (likely under `project/` or image scripts — not read this pass).
- [UNKNOWN] Whether `internal/clad/*.go` are hand-synced or produced by a generator step outside `cloud/CMakeLists.txt`.
- [UNKNOWN] Runtime interaction details with wire-pod vs “public server” beyond cert + `server_config.json` URL loading (no further wire-pod protocol code audited here).
- [UNKNOWN] Whether offboard_vision is enabled in shipping robot builds by default (has `_dev` / `_shipping` / `_vicos` variants).
