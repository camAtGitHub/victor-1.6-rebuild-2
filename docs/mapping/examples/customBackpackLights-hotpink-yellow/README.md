# Hot Pink × Hot Yellow — custom backpack light pack

**Theme name:** Hot Pink × Hot Yellow  
**Path:** `docs/mapping/examples/customBackpackLights-hotpink-yellow/`  
**Upload to robot:** `/data/data/customBackpackLights/`  
**Sibling theme:** [`../customBackpackLights/`](../customBackpackLights/) (cyan / magenta)

## Feel

Neon candy-shop energy on a premium robot: **hot pink** and **hot yellow** trade places in soft chases and breath patterns, with coral / peach / gold bridges so motion glows instead of hard-blinking. Day-to-day lights are fluid and show-offy; thermal/charger alerts stay plain **red** so “something’s wrong” still reads from across the room.

## Palette

| Role | Approx | RGBA floats |
|---|---|---|
| Hot pink | `#FF1A8C` | `[1.0, 0.10, 0.55, 1.0]` |
| Hot yellow | neon gold-yellow | `[1.0, 0.90, 0.06, 1.0]` |
| Bridges | coral / peach / gold | e.g. `[1.0, 0.38, 0.32, 1.0]`, `[1.0, 0.58, 0.28, 1.0]`, `[1.0, 0.76, 0.18, 1.0]` |
| Alerts | pure-ish red | `[1.0, 0.08–0.18, 0.0, 1.0]` |
| Soft modes | dim of on (~15–35%) | never pure black for breath/glow |

## Enable custom mode (sentinels)

Firmware requires **both** after copy:

- `off.json`
- `cubeSpinner/purple/spinner_purple_celebration.json`

Then restart anim/engine or reboot. CCIS shows **CUSTOM LIGHTS ON**.

This pack now includes `cpuOverheated.json` and `lowBatteryCpuOverheated.json` (CPU ≥ 90 °C / low-batt+CPU); a live custom overlay must include them too (full overlay, not a merge).

## Upload

```bash
# clear previous custom pack if swapping themes
ssh root@VECTOR_IP 'rm -rf /data/data/customBackpackLights/*'

scp -r docs/mapping/examples/customBackpackLights-hotpink-yellow/* \
  root@VECTOR_IP:/data/data/customBackpackLights/
```

Only one pack lives at `/data/data/customBackpackLights/` at a time; keep alternate themes under `docs/mapping/examples/` on the host.

## Signature moments

| File | Why it looks good |
|---|---|
| `charging.json` | Yellow → peach → pink **rising wave** front→back; long 550–650 ms fades |
| `petting.json` | Pink / yellow / pink **caress chase** — quick, smooth, reactive |
| `streaming.json` | Middle-first shimmer (listening), soft ping-pong sides |
| `idle_09.json` | Barely-there ember breath; asymmetric offsets so it never locks |
| `danceToTheBeat.json` | Musical pink/yellow alternate with short transitions (party, not strobe) |
| `meetVictor.json` | Intro flourish: pink → gold → yellow sweep |

Alerts (`badCharger*`, `*overheated*`) are intentionally boring red pulses/blinks.

## Cube spinner

Hold = solid family color. Select = anticipatory soft pulse. Celebration keeps the game’s color identity with **pink/yellow accents** on the chase (purple spinner still reads purple on LED 0).

## Format

Same stock schema — 3 LEDs (Front, Middle, Back), RGBA floats 0–1. See sibling README and `docs/mapping/IDEA-backpack-lights-flags.md`.
