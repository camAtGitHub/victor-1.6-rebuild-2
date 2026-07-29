# syscon

**Path:** `robot/syscon/`
**Mapped:** 2026-07-28   **Depth:** L1 (deliberately shallow)   **Confidence:** high
**Upstream docs:** `docs/architecture/whats_in_victor.md` (STM32F0 system controller), `docs/architecture/arch_overview.md` §HAL

## What this is

**Syscon** (system controller) is the **body MCU firmware**: bare-metal code for the STM32F0 that owns motors, encoders, cliff/ToF opto, analog/battery, backpack lights, mics, touch, and power. It does **not** run on the application processor and is **not** part of the `vic-robot` CMake target. The AP robot process talks to syscon only through the **spine** UART protocol (`schema/messages.h` shared with `robot/hal/spine/`).

This map is **intentionally L1-only**. The tree is large relative to its role in the app-processor story (Keil projects, bootloader, crypto, mic assembly, board bring-up). Do not expand file-by-file unless a later task targets firmware work.

## Why it exists

The APQ8009 application processor cannot directly PWM the track motors or sample body sensors at the needed isolation/power domain. Syscon is the always-on / low-power body brain; Linux (`vic-robot`) is the high-level controller. Without syscon there is no physical motion or body sensing.

## Role vs `vic-robot` (app processor)

| | **syscon** (body MCU) | **vic-robot** (AP Linux process) |
|---|---|---|
| Hardware | STM32F0XX, OS-less | APQ8009 Cortex-A7, embedded Linux |
| Tick | Internal timer/WFI loop (`src/main.cpp`) | 5 ms control loop + spine I/O |
| Speaks | Spine frames `BodyToHead` / receives `HeadToBody` | Builds H2B from supervisor; parses B2H in HAL |
| Owns | Motor PWM, encoder decode, cliffs, ToF, mics, LEDs, charger/power cut | Path follow, docking, localization, CLAD to anim/engine |
| Build | Keil µVision (`.uvprojx`) + `tools/sign.py` | CMake `vic-robot` via `vbuild` |

Safety: motors disabled after spine sync loss (~25 ms) — enforced on body side; noted in supervisor `Destroy` comment.

## Contents (shallow)

| Entry | Type | What it is |
|---|---|---|
| `src/main.cpp` | file | Bare-metal entry: init power/encoders/mics/analog/comms/motors/touch/I2C/lights/timer; loop `Power::tick` + `__wfi`; `Main_Execution` ticks encoders/comms/motors/opto/analog/lights |
| `src/*.cpp` | files | Subsystems: `motors`, `encoders`, `comms` (spine), `opto` (cliff/ToF), `analog`, `lights`, `mics`, `touch`, `power`, `i2c`, `timer` |
| `boot/` | dir | Bootloader (separate Keil project `sysboot.uvprojx`) — DFU / app validate path |
| `common/` | dir | Shared hardware headers, flash helpers, STM32 register headers |
| `schema/messages.h` | file | **Canonical spine payload definitions** shared with AP HAL (`BodyToHead`, `HeadToBody`, payload IDs, sync words) |
| `crypto/` | dir | RSA-PSS / SHA / bignum used to **sign/verify firmware images** (boot path rejects bad cert — see `boot/comms.cpp` signature failure wipe) |
| `tools/sign.py`, `tools/cert.py` | files | Host-side image signing (PEM key, ELF→binary+cert); pairs with `crypto/` |
| `tools/make_clad.sh`, `export.py`, … | files | Firmware packaging / helper scripts |
| `syscon.uvprojx`, `sysboot.uvprojx`, `cozmo2.uvmpw` | files | Keil projects / multi-project workspace |
| `test/` | dir | Small node tests for board/CRC |
| `publickeygen.sh`, `winbuild.bat` | scripts | Keygen / Windows build helpers |

## Keil / crypto note

- Primary app image: `syscon.uvprojx` → sources under `src/`.
- Bootloader: `sysboot.uvprojx` → `boot/`.
- Signed images: `tools/sign.py` attaches version + RSA cert; bootloader validates (`NACK_CERT_FAILED` etc. in schema `Ack` enum). **Keys and PEMs under `tools/` are sensitive build material** — do not treat as public product secrets documentation, but note they exist for image authenticity.
- Repo-root `crypto/` is a **separate** small AES/HMAC tree for other Keil/rsync use; syscon signing crypto is **this** `syscon/crypto/` folder.

## Talks to

- Depends on: STM32F0 peripherals only (no Linux libs) [CONFIRMED by structure]
- Depended on by: `robot/hal` spine layer over UART (`/dev/ttyHS0`) [CONFIRMED]
- Schema headers included by HAL via CMake `robot/syscon` include path [CONFIRMED]
- DFU/update from AP helpers (`robot/hal/dfu`, `robot/dfu.sh`) [CONFIRMED existence; packaging [UNKNOWN]]

## Build

- **Not** in the main `vbuild` app-processor graph as a CMake executable.
- Built with Keil (or `winbuild.bat` / `vmake.sh` helpers at `robot/` level).
- Output is a DFU/binary for the body MCU, not a Linux process.

## Notable observations

- `Main_Execution` is driven from a lower-priority interrupt / timer path while `main` sleeps on `__wfi` — classic bare-metal split.
- Mic path: `mics.cpp` + `fastmic.s` feed audio into `BodyToHead.audio[]` when `MICDATA_ENABLED`.
- Temperature and battery flags in B2H drive supervisor shutdown policy on the AP.
- Upstream owner note in `robot/README.md`: syscon owned by Bryon Vandiver; **innocent changes can brick hardware**.

## Open questions

- [UNKNOWN] Exact control ISR rate on syscon vs assumed 200 Hz H2B (AP paces at 5 ms; body may run faster/slower internally).
- [UNKNOWN] How signed syscon images are staged into OTA / `resources/` in this rebuild.
- [UNKNOWN] Full DFU state machine (erase/validate/packet payload types are in schema; sequence not mapped).

## Deliberately not expanded

- Per-file driver walkthrough of `motors.cpp` / `opto.cpp` / mic DSP.
- Bootloader flash layout and certificate chain details beyond “RSA signed images.”
- Keil project option files (`.uvoptx`) and vector tables.
