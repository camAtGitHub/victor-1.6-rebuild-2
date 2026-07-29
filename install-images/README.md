# install-images

**Path:** `install-images/`  
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high  
**Upstream docs:** none (rebuild-specific assets for root `ABOUT.md`)

## What this is

Screenshot / photo assets used only by the root end-user install guide [`ABOUT.md`](../ABOUT.md). They illustrate froggitti websetup (custom firmware stack, pair, pin) and on-robot steps to open CCIS and run **REONBOARD** for custom-server setup. Not OTA payloads, not installer binaries.

## Why it exists

`ABOUT.md` embeds these images so readers can match web UI and robot face/menu states while installing 1.6-rebuild and connecting to the custom server environment.

## Contents

| Entry | Type | What it is (as used in `ABOUT.md`) |
|---|---|---|
| `stack.png` | image | Websetup “Select the stack” — **CUSTOM FIRMWARE** |
| `pair.png` | image | Websetup pair instructions + **PAIR WITH VECTOR** |
| `pairing.png` | image | Robot-id selection list during pairing |
| `pin.png` | image | Enter PIN from Vector’s screen |
| `charger.jpg` | image | Vector on charger (server-connect steps) |
| `backbutton.jpg` | image | Backpack button / key-icon step |
| `lift.jpg` | image | Lift up/down to enter CCIS |
| `ccis.jpg` | image | Robot face showing CCIS / status menu |
| `data.jpg` | image | DATA / DATA OPTIONS menu entry |
| `reonboard.jpg` | image | REONBOARD option |
| `reonboardconfirm.jpg` | image | CONFIRM reonboard |
| *(all 11 files)* | — | Entire directory is image assets; no code |

## Key entry points

- Consumer: root [`ABOUT.md`](../ABOUT.md) markdown image links (`![…](install-images/…)`).
- No other references found under the repo (grep of common config/docs) — [CONFIRMED].

## Talks to

- Depends on: nothing at build time — [CONFIRMED]
- Depended on by: `ABOUT.md` only (rendered on GitHub / local markdown) — [CONFIRMED]
- Not used by: installers, `platform/update-engine`, `resources/`, or OTA packages — [CONFIRMED] no code refs

## Build

Not part of the firmware build. Static documentation media at repo root.

## Notable observations

- Rebuild-specific documentation assets (websetup.froggitti.net / anki2.ca flow described in `ABOUT.md`), not stock Anki 1.6 engineering docs.
- Filenames match the install narrative; do not invent extra install steps beyond `ABOUT.md`.

## Open questions

- [UNKNOWN] Whether any external site hosts copies; in-repo only consumer is `ABOUT.md`.
