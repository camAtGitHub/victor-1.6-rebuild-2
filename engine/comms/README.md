# comms

**Path:** `engine/comms`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:** none dedicated; engine↔robot IPC also via `engine/robotInterface/`

## What this is

**Engine ↔ robot-process** connection plumbing for `vic-engine`. Owns UDP client state, connection lifecycle, and inbound message queues for the low-level robot link. Distinct from `engine/cozmoAPI/comms/` (UI/gateway external sockets).

## Why it exists

`vic-engine` and `vic-robot` are separate processes. This folder implements the engine-side socket client and buffering so `RobotInterface::MessageHandler` can send/receive EngineToRobot / RobotToEngine CLAD.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `robotConnectionManager.h` / `.cpp` | file | Connect/disconnect, `SendData`/`PopData`, `Update`/`ProcessArrivedMessages`; `LocalUdpClient` |
| `robotConnectionData.h` / `.cpp` | file | Per-connection state machine (`Disconnected`/`Waiting`/`Connected`), mutexed inbound queue, `INetTransportDataReceiver` |
| `robotConnectionMessageData.h` | file | Message envelope type for arrived packets |

## Key entry points

- **`RobotConnectionManager`** — constructed with `RobotManager*`; `Connect(robotID)` opens local UDP to robot process; `SendData` / `PopData` for bytes; optional socket buffer histograms (`ANKI_PROFILE_ENGINE_SOCKET_BUFFER_STATS`).
- **`RobotConnectionData`** — thread-safe `PushArrivedMessage` / `PopNextMessage`; used when transport callbacks deliver data off the engine tick.
- Higher-level CLAD routing: **`engine/robotInterface/messageHandler.h`** (`SendMessage(EngineToRobot)`, `ProcessMessages`, subscribe `RobotToEngineTag`) uses this connection manager [CONFIRMED friend/include relationship via manager + message handler designs].

## Talks to

- Depends on: `coretech/messaging/shared/LocalUdpClient.h`, util transport types [CONFIRMED]
- Depends on: `RobotManager` (owner/callback context) [CONFIRMED]
- Depended on by: `RobotInterface::MessageHandler`, connection path from `CozmoEngine::ConnectToRobotProcess` → robot manager msg handler `AddRobotConnection` [CONFIRMED engine connect path]

## Build

Part of `cozmo_engine`.

## Notable observations

- Small, focused directory (5 files) — pure transport, not application protocol.
- Do not confuse with `cozmoAPI/comms` (external app/UI) or `cubeBleClient` (cube BLE).

## Open questions

- [UNKNOWN] Exact local socket path names used in `Connect` (see `robotConnectionManager.cpp` for domain path construction).
