# crypto

**Path:** `crypto/`  
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** medium  
**Upstream docs:** none found

## What this is

A small standalone C/C++ library of cryptographic and checksum helpers: AES-128 (ECB + CFB), HMAC built on MD5, MD5, SHA-1, CRC-32, and a higher-level AES+HMAC message encode/decode path. Header guard on the message API is `__BLE_PACKET_H` (`packet.h`), which suggests a BLE packet framing role [INFERRED].

## Why it exists

Provides self-contained crypto primitives (public-domain / third-party implementations plus thin wrappers) for firmware that does not use the main robot CMake graph. The only in-tree build hook observed is rsync into a Keil VM next to `robot/` for cube/syscon firmware builds.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `aes.h` / `aes.cpp` | file | AES-128 ECB encrypt/decrypt; CFB encode/decode; block padding |
| `hmac.h` / `hmac.cpp` | file | 16-byte HMAC (`create_hmac` / `test_hmac`) over MD5 + nonce pad |
| `md5.h` / `md5.cpp` | file | OpenSSL-compatible public-domain MD5 (Solar Designer); optional OpenSSL |
| `sha1.h` / `sha1.cpp` | file | SHA-1 (Brad Conte) |
| `crc32.h` / `crc32.cpp` | file | `calc_crc32` (poly `0xedb88320`) |
| `packet.h` / `packet.cpp` | file | `aes_message_encode` / `aes_message_decode` — pad, HMAC, CFB wrap |
| `random.h` / `random.cpp` | file | `gen_random` — **stub only** (`#error` until arch impl) |

## Key entry points

- `packet.h` — `aes_message_encode` / `aes_message_decode` (compose AES + HMAC)
- `aes.h` — `AES128_ECB_*`, `aes_cfb_encode` / `aes_cfb_decode`, `aes_fix_block`
- `hmac.h` — `create_hmac` / `test_hmac` (`HMAC_LENGTH = 16`)
- `random.h` — required by AES CFB path; not implemented in this tree

## Talks to

- Depends on: none external in-tree (stdlib only; MD5 may use OpenSSL if `HAVE_OPENSSL`) — [CONFIRMED] sources
- Depended on by (build path): `robot/vmake.sh` rsyncs `../crypto` to `anki-vm-keil` alongside `robot/` for cube/syscon Keil builds — [CONFIRMED]
- Depended on by (CMake / app processor): **not** linked from root `CMakeLists.txt` or platform/engine — [CONFIRMED] no `add_subdirectory` / no includes outside this dir
- Not the same as: `robot/syscon/crypto/` (RSA-PSS, SHA-256/512, bignum for syscon boot signing) — [CONFIRMED]

## Build

- **No** `CMakeLists.txt` or `BUILD.in` in this folder.
- Not part of `vbuild` / root CMake.
- Consumed (when used) via Keil workflow: `robot/vmake.sh` lines rsync `crypto` then build cube or syscon on a remote Windows/Keil host.

## Notable observations

- `random.cpp` is intentionally incomplete: `#error "IMPLEMENTATION NEEDED FOR GEN_RANDOM FOR THIS ARCHITECTURE"`. Any path that needs CFB encode needs an arch-specific `gen_random`.
- `packet.h` include guard `__BLE_PACKET_H` + AES/HMAC message layout strongly suggest cube/BLE-era use, but no in-tree `.c/.cpp` under `robot/cube_firmware/` currently `#include`s these headers [CONFIRMED grep] — consumers may live only in Keil project file lists not grepped as source, or code may be dead/orphaned [UNKNOWN].
- MD5 and SHA-1 are legacy algorithms; switchboard pairing on the app processor uses **libsodium** instead (see `docs/development/switchboard-pairing.md`) — different stack [CONFIRMED] docs vs this tree.

## Open questions

- [UNKNOWN] Exact Keil project source-file list that compiles `crypto/*.cpp` (cube vs syscon vs both).
- [UNKNOWN] Whether app-side code ever shared this API historically (Cozmo BLE) and was removed.
- [UNKNOWN] Host/arch-specific `gen_random` implementation location (if any, outside this repo).
