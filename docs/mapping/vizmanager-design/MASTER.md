# Host VizManager — locked design system

**Path:** `docs/mapping/vizmanager-design/MASTER.md`  
**Status:** locked 2026-08-19  
**Source:** UI/UX Pro Max `--design-system` + style/color/ux/chart/threejs searches, then **overridden** for this product.

All implementers and reviewers **must** read this file and the Design Spec in `docs/mapping/VIZMANAGER-HOST-PLAN.md` before writing UI.

Page-level overrides (if any) live in `docs/mapping/vizmanager-design/pages/`. If a page file exists, it wins for that surface only.

---

## Product (locked)

| | |
|---|---|
| **Type** | Internal engineering diagnostic / real-time operations console |
| **User** | Firmware developer at a desk, 1–3 hour debug sessions |
| **Job** | See the engine’s spatial/sensor world while WebViz handles policy |
| **Platform** | Windows + Linux **desktop** (not mobile, not a marketing site) |
| **Primary view** | 3D world + live camera + stack/state HUD |

This is **not** a landing page, SaaS marketing site, or consumer app. Ignore “hero / CTA / trial” pattern language from the generator.

---

## Style (locked)

**Name:** Dark operations console (OLED-adjacent + financial-dashboard discipline)

Taken from Pro Max: *Dark Mode (OLED)* surfaces + *Financial Dashboard* status colors + *Real-Time / Operations* density.

**Rejected (do not implement):**

| Generator suggestion | Why rejected |
|---|---|
| Exaggerated Minimalism + oversized type | Fashion/portfolio; hides data |
| Light teal palette (`#F0FDFA`) | Generator’s own anti-pattern: “Light mode default” |
| Cyberpunk neon / scanlines / glitch | Decorative, poor contrast, fights geometry |
| Cinema glassmorphism + ambient blobs | Slow, not a debug tool |
| Custom cursor / magnetic hover | Breaks precision picking in 3D |

**Mode:** Dark only. No light theme in v1.

**Keywords implementers may use:** dark, dense, high contrast, hairline panels, tabular data, live status, no chrome theater.

---

## Color tokens (locked)

Copy into `tools/vizmanager/vizmanager/theme.py`. **No raw hex in view/HUD/app code.**

| Token | Hex | Use |
|---|---|---|
| `bg_void` | `#0B0D10` | Window / 3D clear (not pure `#000000`) |
| `bg_base` | `#12151A` | App chrome |
| `bg_panel` | `#161B22` | Side panels |
| `bg_elevated` | `#1A1F27` | Inputs, selected rows |
| `border` | `#2A3340` | 1px hairlines |
| `text` | `#E8EDF2` | Primary text (≥ 4.5:1 on `bg_panel`) |
| `text_muted` | `#8B96A5` | Secondary labels (≥ 3:1) |
| `accent` | `#3D9CF0` | Focus ring, selected tab, links |
| `accent_dim` | `#1B4F7A` | Focus ring fill / live glow |
| `live` | `#3DDC97` | Connected / receiving |
| `warn` | `#E6B450` | Degraded (no images, UI only) |
| `danger` | `#F07178` | Disconnected / error |
| `path` | `#5B8DEF` | Default planned path if color missing |
| `grid` | `#1E2530` | 2D/3D ground grid |

**Protocol colors win in the world:** `Object` / `Quad` / `LineSegment` / path `color` from CLAD (`0xRRGGBBAA`) override tokens. HUD and chrome never use protocol colors for buttons.

**Status is never color-only:** pair `live`/`warn`/`danger` with the words LIVE / DEGRADED / DISCONNECTED (and a non-color mark: filled / half / empty pip).

**Do not use** `#00FF00` Matrix green or `#00FFFF` neon cyan.

---

## Typography (locked)

From Pro Max pairing **Fira Code + Fira Sans** (dashboard / code / precise).

| Role | Face | Size | Weight | Notes |
|---|---|---|---|---|
| Chrome title | Fira Sans | 14px | 600 | “VizManager” |
| Chrome body | Fira Sans | 13px | 400 | Buttons, fields |
| HUD label | Fira Sans | 11px | 500 | Uppercase + 0.04em tracking optional |
| HUD value | Fira Code | 12px | 400 | Tabular figures |
| Stack lines | Fira Code | 12px | 400 | One behavior per line |
| Overlay text | Fira Code | 12px | 500 | Drawn on camera |
| Log | Fira Code | 11px | 400 | Tag dump |

Minimum HUD text **11px** (desktop tool; denser than 16px marketing body). Contrast still ≥ 4.5:1 for values, ≥ 3:1 for labels.

If a font file is missing, fall back to `Consolas` / `DejaVu Sans Mono` (code) and system UI sans. Never mix a third family.

---

## Density & spacing (locked)

Dial **9/10 dense**. 4px base.

| Token | px |
|---|---|
| `space_1` | 4 |
| `space_2` | 8 |
| `space_3` | 12 |
| `space_4` | 16 |
| `space_6` | 24 |

- Panel padding: **8px**
- Gap between panels: **1px** border, no 24px marketing gutters
- Control height: **28px** visual, hit target **≥ 32px** (desktop; 44px only for the primary Connect button)
- Stack line height: **16px** (Webots used 10px/8px Lucida — too small; we keep density without 8px type)

---

## Motion (locked)

Dial **2/10 subtle**. Real-time pose/image updates are **data**, not animation.

- Chrome transitions ≤ **150ms**, opacity/color only
- No count-up, no page fade, no scanlines, no blob, no path-draw animation
- Camera orbit: user-driven, damped; no auto-spin
- `prefers-reduced-motion`: disable damping/easing; **do not** freeze the robot (that hides the bug)

---

## Layout (locked) — desktop first

Minimum window **1280×720**. Default **1600×900**. Not mobile-first (override of the generic checklist).

```
┌──────────────────────────────────────────────────────────────────┐
│ CHROME  36px  [pip+STATE] IP pps Overlays Disconnect [Connect]   │
├────────────────┬────────────────────────────────┬────────────────┤
│ CAMERA         │ WORLD                          │ STACK          │
│ 640 default    │ 3D default · tab: 2D · tab: Map│ Fira Code list │
│ drag splitter  │ orbit / pan / frame            │ newest top? NO │
│ keep aspect    │ grid + axes                    │ bottom-to-top  │
│ 12px overlays  │                                │ as engine sent │
│ on letterbox   │                                │                │
│                │                                ├────────────────┤
│                │                                │ STATE          │
│                │                                │ pose head lift │
│                │                                │ batt cliffs    │
│                │                                │ anim           │
├────────────────┴────────────────────────────────┴────────────────┤
│ LOG  72px collapsed default · tag rate · last error              │
└──────────────────────────────────────────────────────────────────┘
```

- **WORLD is the primary pane** (widest at the 1600 default). Camera starts at **640px**; drag the CAMERA|WORLD seam to resize. HUD is a satellite. Overlay labels are 12px HUD type on the letterboxed view, not baked into the JPEG.
- Stack order is **engine order** (bottom of list = bottom of stack / first in `debugStrings`). Do not reverse.
- 3D / 2D / Map are **tabs on WORLD**, not three always-on 3D contexts.
- One primary CTA: **Connect**. Disconnect is secondary (text button). Overlays is the same muted text treatment — not a second filled CTA.
- Overlay panel is a WORLD satellite, not a fourth primary pane (not a `layout_rects` key).
- No hamburger. No marketing hero.

**Empty WORLD:** muted grid + “No Viz stream” + why (not connected / no packets / cheats off) + Connect if disconnected.

**Empty CAMERA:** charcoal panel + “No ImageChunk (enable VisionMode::Viz)” — not a broken-image icon.

**Empty STACK:** “No BehaviorStackDebug yet” — not a fake placeholder tree.

---

## Interaction (locked)

| Input | Action |
|---|---|
| **Connect** | Disable + “Connecting…” until UI handshake or 8s timeout; then error with recovery (firewall 5103 / 5252 / 5200) |
| **1** | WORLD tab 3D |
| **2** | WORLD tab 2D |
| **3** | WORLD tab Map |
| **F** | Frame robot in 3D/2D |
| **O** | Toggle overlay panel |
| **Space** | Pause *rendering* (stream still received; badge PAUSED). Does not drop UI ping. While overlay panel open: flip focused checkbox |
| **Esc** | If overlay panel open → close it; else existing blur / dismiss error |
| Orbit | LMB drag 3D (OrbitControls equivalent) |
| Pan | MMB or Shift+LMB |
| Zoom | Wheel; update camera aspect on resize |
| **Drag CAMERA\|WORLD** | Resize camera pane (default **640px**, min 320). Double-click seam to reset |

Overlay panel is a WORLD satellite, not a fourth primary pane; not a second filled CTA. Drawn last, clipped to WORLD view. Open with **O** or muted chrome **Overlays** (left of Disconnect). While open: Up/Down move checkbox focus, Space/Enter flips the focused row (2px `accent` ring). Click outside the panel on WORLD closes it.

Focus rings: 2px `accent` on IP field, Connect, and the overlay-panel focused/hovered row. Never `outline: none` without a replacement.

Connect while in-flight: button disabled (loading). Error text **under** the IP field, cause + fix (“Robot did not register UI — allow UDP 5103 on the robot”).

---

## 3D / 2D view rules (locked)

From threejs stack + Webots consumer:

- Explicit camera pose + look-at before first frame (do not leave camera at origin)
- Update projection aspect on every pane resize
- Orbit for exploration (not a scripted camera path)
- Ground grid in `grid` token; +X red, +Y green, +Z blue axes, 100 mm
- Protocol mesh colors; default path `path` token
- Keep draw work ≤ 16ms; throttle 3D mesh rebuilds (Webots used 0.25s `drawObjectsRate_sec` — copy that idea)
- Fog optional and subtle; never neon bloom

Camera overlay: JPEG is the background; `Camera*` primitives draw in **image pixel space**, then the panel letterboxes. Do not stretch.

---

## Icons

Lucide-equivalent **stroke 1.5**, 16px, `text` / `text_muted`. No emoji. Status pip is a 8px circle, not a traffic-light emoji.

---

## Reviewer reject list

Reject a PR if it:

- Uses light backgrounds or teal `#0F766E` / `#F0FDFA`
- Hardcodes hex outside `theme.py`
- Uses emoji as chrome
- Animates the robot path or stack for decoration
- Reverses behavior stack order
- Makes camera or HUD larger than WORLD by default
- Adds a second primary CTA
- Implements a light theme “for later”
