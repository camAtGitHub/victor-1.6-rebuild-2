# Plan 02 — Universal dark / light theme (system + selectable)

**Status:** implemented (Phases 1–7 static verify pass) — browser smoke still recommended on robot  
**Constraint:** **resources only** — CSS/JS/HTML under `resources/webserver/`; scp + hard-refresh (HTML restart only if template cached)  
**First test page:** `resources/webserver/webViz.beta.html`  
**Also design for:** eventual `consolevarsui.html` (Path A) and shared `--wv-*` chrome  
**Authority:** `resources/webserver/AGENTS.md` §3 (theme), `webviz/README.md` (light module host)

### Implementation status (2026-08-02)

| Phase | Status | Notes |
|---|---|---|
| 1 Tokens + light block | done | `tokens.css` + `cv-tokens.css` light mirrors |
| 2 theme.js + FOUC | done | `webviz/js/theme.js`; FOUC in `webViz.html` / `webViz.beta.html` |
| 3 Theme select UI | done | `#themeSel` + `app.js` wireChrome |
| 4 Shell light cleanup | done | shell uses tokens; content host invariant |
| 5 Module gate / docs | done | README Theme + smoke list; no module rewrites |
| 6 Consolevars readiness | done | cv light block confirmed; AGENTS Color scheme; **no** consolevars theme UI (optional skipped) |
| 7 Final verification | pending | Human/browser smoke on robot or static open |

---

## Goal

Add **selectable** color scheme with three user preferences:

| Preference | Behavior |
|---|---|
| **System** (default) | Follow `prefers-color-scheme` |
| **Dark** | Force dark chrome (today’s palette, minimally changed) |
| **Light** | Force light chrome using the **same** `--wv-*` token names |

Themes are **universal for new webserver design**: one token surface for WebViz shell and Path A console vars (`cv-tokens.css` keeps parity). Dark theme is **not** redesigned — only small fixes that unblock light mode (e.g. promote hardcoded shell rgba into tokens).

**Out of scope for this plan (unless a later phase explicitly opens them):**

- Rewriting every `webVizModules/*` chart/canvas to dual-theme (see **module strategy** below)
- Migrating `consolevars-explorer.html` `--cv-*` fork
- Changing CivetWeb / C++ routes
- Restyling stock `index.html` / demos / legacy `webViz.legacy.html`

---

## Product decisions (locked for implementers)

### D1 — Single token namespace

- Canonical file: `webviz/css/tokens.css`
- Deploy duplicate: `cv-tokens.css` (must stay in sync — Path A scp independence)
- **Do not** invent `--cv-*` or a second palette for light mode
- Light = **reassign the same names** under a theme selector

### D2 — How theme is applied

| Concept | Mechanism |
|---|---|
| Stored preference | `localStorage` key `webviz.colorScheme` ∈ `"system"` \| `"dark"` \| `"light"` |
| Resolved effective theme | `"dark"` \| `"light"` |
| DOM signal | `document.documentElement.setAttribute("data-theme", effective)` where effective is `dark` or `light` only |
| CSS | Dark values remain on `:root` (current). Light overrides: `html[data-theme="light"] { … }` |
| Browser chrome | `color-scheme: dark` / `light` on `html` to match form controls / scrollbars |
| FOUC guard | Tiny **inline** `<script>` in `<head>` **before** stylesheets set `data-theme` from storage + `matchMedia` |

### D3 — Module content strategy (compatibility)

**Option A — keep module hosts light in both shell themes** (required).

Evidence: every `webVizModules/*.js` hardcodes light-friendly colors; **zero** use of `var(--wv-*)` or `getComputedStyle` for theme. Canvas/Flot/D3/p5 assume a light (or self-painted dark viz) surface.

| Surface | Dark shell | Light shell |
|---|---|---|
| Chrome (top, nav, status, overview cards) | Current dark tokens | New light tokens |
| `.module-host` (non-overview) | Keep light `--wv-content-*` | Keep light content well (optionally slightly whiter / bordered so it still reads as a “paper” on light chrome) |
| `#surface-overview .module-host` | Shell tokens (dark) | Shell tokens (light) |
| `navMap` p5 map | Remains intentional dark viz island | Same |

**Do not** darken `.module-host` in dark mode further, and **do not** invert module canvas colors in this plan. That is a separate hardening effort.

### D4 — Dark palette changes

**Minimal.** Only:

1. Promote a few hardcoded shell colors (toast error bg `#1a1418`, active-border rgba) into tokens if light mode would otherwise leave dead hex.
2. Do not redesign accent/status hues for dark.

### D5 — Light palette principles (for consolevars + WebViz)

Design light values so **full-chrome pages** (consolevars has no light content well) remain readable:

- Cool neutral grays (not pure white walls) — e.g. page bg ≈ `#f4f6f9`, elev ≈ `#ffffff`, panel ≈ `#eef1f6`
- Text dark on light (`--wv-text` ≈ `#1a1d24`, dim/faint greys)
- Keep accent blues / good / warn / bad **hues**; deepen slightly if contrast fails WCAG-ish checks on white
- Shadows: softer, lower opacity (replace `rgba(0,0,0,0.4)` with ~`0.08–0.12`)
- `--wv-content-*` stays a distinct paper well (`#fff` / `#f0f2f5` range) so modules still sit on a defined surface under light chrome

### D6 — First page wiring

Implement + verify on **`webViz.beta.html`** only first. Mirror the same FOUC + CSS links onto `webViz.html` in the same phase if they remain duplicates (they currently share the same shell stack). Consolevars gets **token parity** early; **theme UI on consolevars** is a later optional phase.

---

## Phase 0 — Documentation discovery (complete — re-read before coding)

### Sources (required reading)

| Source | What to extract |
|---|---|
| `resources/webserver/AGENTS.md` §3 | Canonical tokens, content exception, no second palette, scp rules |
| `resources/webserver/webviz/css/tokens.css` | Full `:root` dark token set (SoT) |
| `resources/webserver/webviz/css/shell.css` | Token consumers; `.module-host`; overview exception; hardcoded rgba |
| `resources/webserver/cv-tokens.css` | Must mirror tokens.css |
| `resources/webserver/cv-chrome.css` | Path A full-dark chrome via `var(--wv-*)` only |
| `resources/webserver/consolevarsui.html` | Load order: jquery-ui → style → cv-tokens → cv-chrome |
| `resources/webserver/webViz.beta.html` | Inter + tokens + shell; `.top-actions` slot |
| `resources/webserver/webviz/js/config.js` ~186–265 | **Copy** localStorage try/catch pattern (`webviz.feedHost`) |
| `resources/webserver/webviz/js/app.js` ~283–288 | **Copy** chrome wire pattern (`btnNavToggle` + classList) |
| `resources/webserver/webviz/README.md` | Why module host is light |
| `resources/webserver/webVizModules/*.js` | Hardcoded canvas/Flot/D3 colors (compatibility) |
| This plan § Product decisions | Locked D1–D6 |

### Allowed mechanisms (only these)

| Mechanism | Notes |
|---|---|
| CSS custom properties `--wv-*` | Already used by shell + cv-chrome |
| `html[data-theme="light"|"dark"]` | Theme switch surface |
| `localStorage` key `webviz.colorScheme` | Preference persistence |
| `window.matchMedia("(prefers-color-scheme: dark)")` | System detect + change listener |
| `document.documentElement` attributes / `color-scheme` | Effective theme + UA chrome |
| Static files under `resources/webserver/` | CSS/JS/HTML only |
| Optional shared snippet | e.g. `webviz/js/theme.js` or root `wv-theme.js` (name must **not** start with `consolevars`) |

### Anti-patterns (do not)

- Invent new token prefixes (`--theme-*`, new `--cv-*` for light)
- Darken `.module-host` or rewrite all module canvases “for consistency”
- Depend on C++ / new HTTP routes for theme
- Edit `jquery-ui.css` ThemeRoller instead of tokens + chrome overrides
- Store preference without try/catch (private mode)
- Set `data-theme` only after body paint with no FOUC script (flash of wrong theme)
- Break Path A template markers in `consolevarsui.html`
- Put catalog/theme assets under `/consolevars/*` URL path (CivetWeb steals)

### Phase 0 verification

- [x] No existing theme toggle / `data-theme` / `prefers-color-scheme` palette (only reduced-motion)
- [x] Shell almost fully tokenized; modules not tokenized
- [x] `cv-tokens.css` ≡ `webviz/css/tokens.css`
- [x] localStorage pattern exists for `webviz.feed*`

---

## Phase 1 — Token architecture + light palette (CSS)

### What to implement

1. **Extend** `webviz/css/tokens.css` (copy structure from existing `:root` block at L5–73):
   - Keep current dark values on `:root` as the **default** (and as `html[data-theme="dark"]` optional explicit duplicate if useful for clarity — prefer single source: default = dark).
   - Add block:

     ```css
     html[data-theme="light"] {
       /* reassign surface / line / text / accent-dim / shadow / content tokens */
     }
     ```

   - Leave geometry, type stacks, z-index, motion **unchanged** in both themes.
   - Add semantic tokens only if shell hardcodes force them (e.g. `--wv-toast-error-bg`). Prefer minimal new names; document any addition in AGENTS.md §3.

2. **Set** on both themes:

   ```css
   :root, html[data-theme="dark"] { color-scheme: dark; }
   html[data-theme="light"] { color-scheme: light; }
   ```

   (If default is dark without attribute, FOUC script must set attribute before paint — Phase 2.)

3. **Light palette** — fill concrete hex following D5. Implementers must paste values into both token files. Suggested starting point (tune in browser on beta):

   | Token | Light suggestion (starting) |
   |---|---|
   | `--wv-bg` | `#f0f2f6` |
   | `--wv-bg-elev` | `#ffffff` |
   | `--wv-bg-panel` | `#e8ecf2` |
   | `--wv-bg-hover` | `#dde3ec` |
   | `--wv-bg-active` | `#d0d8e4` |
   | `--wv-bg-input` | `#ffffff` |
   | `--wv-line` | `#c5ccd8` |
   | `--wv-line-soft` | `#d8dee8` |
   | `--wv-line-strong` | `#9aa6b8` |
   | `--wv-text` | `#1a1d24` |
   | `--wv-text-dim` | `#5c667a` |
   | `--wv-text-faint` | `#8b95a8` |
   | `--wv-text-inv` | `#ffffff` |
   | Accents / status base hues | Keep close to dark (`#5b9fd4`, good/warn/bad); bump `*-dim` alphas if washes out |
   | `--wv-content-bg` | `#ffffff` or `#f7f8fa` |
   | `--wv-content-text` | `#1a1d24` |
   | `--wv-content-line` | `#c5cad3` |
   | Shadows | Soft light-mode shadows |

4. **Mirror** the entire change into `cv-tokens.css` (same file comment: keep in sync).

5. **Do not** rewrite `shell.css` or `cv-chrome.css` layout in this phase except if a hardcoded color must become `var(--token)` for light correctness (small surgical edits only — prefer Phase 4).

### Copy / pattern references

- Full dark token block: `webviz/css/tokens.css:5-73`
- Reduced-motion media (copy adjacency style): `tokens.css:75-80`
- Frame language: `AGENTS.md` §3 “Frames”
- Module content exception: `AGENTS.md` §3 “WebViz content exception”; `shell.css:531-549`

### Verification

- [ ] `diff -u <(grep '^\s*--wv-' webviz/css/tokens.css) <(grep '^\s*--wv-' cv-tokens.css)` — property names match; light blocks present in both
- [ ] Manually set `<html data-theme="light">` in DevTools on a static open of beta HTML → chrome flips without JS
- [ ] With `data-theme="dark"` or default → visual match to pre-change dark (screenshot / side-by-side)
- [ ] Grep light block: no leftover pure `#0c0f14` page bg under light selector
- [ ] Geometry tokens not redefined differently per theme

### Anti-pattern guards

- Do not rename existing tokens
- Do not put light values only in `shell.css` (breaks consolevars / universal rule)
- Do not darken `--wv-content-*` under `data-theme="dark"` in a way that breaks modules

---

## Phase 2 — Theme controller (JS) + FOUC

### What to implement

1. **New module** (preferred): `resources/webserver/webviz/js/theme.js`  
   - Self-contained IIFE attached to `window.WebVizTheme` (or `window.WVTheme`).  
   - **API surface (implement exactly; do not invent extra frameworks):**

   | Function | Behavior |
   |---|---|
   | `getPreference()` | Read `localStorage` → `"system"` \| `"dark"` \| `"light"`; default `"system"` |
   | `setPreference(pref)` | Validate, write storage, `apply()` |
   | `resolve(pref)` | If system → `matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"`; else pref |
   | `apply(pref?)` | Resolve → `document.documentElement.setAttribute("data-theme", effective)` |
   | `init()` | `apply()` + listen to `matchMedia(...).addEventListener("change", …)` when pref is system |
   | `LS_KEY` | `"webviz.colorScheme"` |

2. **Copy** storage try/catch from `config.js` `readStoredFeedHost` / `writeStoredFeed` (`config.js:234-265`).

3. **FOUC inline script** in `webViz.beta.html` `<head>` **before** CSS links (or immediately before `tokens.css`). Keep it short (~15 lines): same key + resolve logic duplicated inline OR call nothing and set attribute only (duplicate minimal logic to avoid blocking on external JS). Pattern:

   ```html
   <script>
   (function () {
     try {
       var p = localStorage.getItem("webviz.colorScheme") || "system";
       var dark = p === "dark" || (p !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
       /* default system: if no prefers support, prefer dark to match historic UI */
       if (p === "system" && !window.matchMedia) dark = true;
       document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
     } catch (e) {
       document.documentElement.setAttribute("data-theme", "dark");
     }
   })();
   </script>
   ```

   Refine so `p === "light"` forces light even if OS is dark.

4. Load `webviz/js/theme.js` **before** `app.js` (after `config.js` is fine). Call `WebVizTheme.init()` from `app.js` bootstrap (or self-init at end of theme.js).

5. Optionally export helpers on `WebVizConfig` only if needed; prefer dedicated `WebVizTheme` to avoid bloating config.

### Copy / pattern references

- localStorage: `webviz/js/config.js:186-188`, `234-265`
- Script order today: `webViz.beta.html:129-134`
- Nav class toggle analogy: `app.js:284-288`

### Verification

- [ ] Cold load with empty storage: theme matches OS; `data-theme` present before first paint (check “Disable cache” + slow 3G in DevTools — no flash of opposite theme)
- [ ] `localStorage.setItem("webviz.colorScheme","light"); location.reload()` → light
- [ ] `"dark"` → dark regardless of OS
- [ ] `"system"` + toggle OS appearance (or emulate in DevTools Rendering) → updates without reload
- [ ] Private / blocked storage → falls back to dark (or system media) without throw

### Anti-pattern guards

- Do not require a build step / bundler
- Do not use `sessionStorage` only (preference should persist)
- Do not put theme logic only in CSS `@media (prefers-color-scheme)` without a way to **force** dark/light (selectable requirement)

---

## Phase 3 — Theme control UI on WebViz beta

### What to implement

1. In `webViz.beta.html` `.top-actions` (after nav toggle or before Reconnect), add a compact control:

   **Preferred:** `<select id="themeSel" class="…" title="Color scheme" aria-label="Color scheme">` with options System / Dark / Light  

   **Alt:** cycle button `id="btnTheme"` that advances system → dark → light → system and updates `title`/`aria-label`.

   Prefer **select** for discoverability on a dense ops UI.

2. Wire in `app.js` `wireChrome()` (same function as `btnNavToggle` ~L283):
   - On change → `WebVizTheme.setPreference(value)`
   - On init → set select value from `getPreference()`

3. Optional: short status toast “Theme: Light” — not required.

4. If `webViz.html` is still an identical shell entry, **mirror** the same markup + script tags so both entry points stay consistent (README still cites `webViz.html`).

5. Style the select with existing `.nav-foot select` / search input tokens — **no new hex**. Add a small rule in `shell.css` only if needed (e.g. `.top-actions select` width).

### Copy / pattern references

- Top actions markup: `webViz.beta.html:56-60`
- Port select (select styling exists): `webViz.beta.html:95-98` + shell nav-foot select rules
- `wireChrome`: `app.js:283+`

### Verification

- [ ] Changing select updates `data-theme` immediately (no full reload required)
- [ ] Reload preserves preference
- [ ] Keyboard accessible; `aria-label` present
- [ ] Layout: top bar does not wrap badly at 820px breakpoint (`shell.css` responsive rules)

### Anti-pattern guards

- Do not use emoji-only control without text/title
- Do not store theme in URL query (optional later; not required)

---

## Phase 4 — Shell polish for light mode

### What to implement

1. Grep `shell.css` for hardcoded colors not using `var(--wv-*)`:

   | Approx | Issue |
   |---|---|
   | L356, L518, L523 | rgba borders tied to dark accent/good/bad |
   | L686–693 | toast error/warn/ok borders + error bg `#1a1418` |

   Replace with tokens (new or existing `*-dim` / line tokens) so light mode toasts/nav active states look correct.

2. Confirm **overview** (`#surface-overview .module-host`) uses shell tokens (already does) — readable in light.

3. Confirm **module host** under light shell: content paper still visible (border if needed: `1px solid var(--wv-content-line)` only if flat white-on-white).

4. DataTables CDN CSS remains light — acceptable inside light module host; do not globally override DataTables in this phase unless overview breaks.

### Copy / pattern references

- Module host: `shell.css:531-549`
- Toast block: `shell.css` ~662–728
- Token promotion pattern: keep names in `tokens.css` only

### Verification

- [ ] Light mode: toasts (trigger via existing UI toast helpers if any, or temporary console call to `UI.toast`) readable
- [ ] Light mode: active nav item, connection pill, status bar contrast OK
- [ ] Dark mode: pixel-near-identical to pre-plan chrome
- [ ] Grep `shell.css` for `#` hex — only unavoidable leftovers documented

### Anti-pattern guards

- No large layout rewrite of shell grid
- No freeplay-demo chrome

---

## Phase 5 — Module / graph compatibility gate

### What to implement

**No mass module rewrites.** Perform an explicit smoke matrix and document results in this plan file or `webviz/README.md` “Theme” subsection.

1. **Invariant** to document in `webviz/README.md`:

   > Shell theme (dark/light) recolors chrome only. `.module-host` remains a light content surface so stock Flot/D3/canvas modules stay readable. `navMap` keeps its own dark canvas.

2. Smoke on Engine profile modules (port 8888) and Anim if available — at least:

   | Module | Why |
   |---|---|
   | Overview | Shell light/dark |
   | behaviors | D3 Gantt light SVG |
   | mood | Flot |
   | cpu / cpuprofile | Flot |
   | micData or micDataEngine | Canvas clock |
   | visionScheduleMediator | Canvas grid |
   | navMap | Intentional dark p5 island |
   | features / cloud | DOM hardcodes |

3. If a module is **broken by light chrome only** (unlikely): fix shell, not module.  
   If a module is broken because someone changed `--wv-content-*` to dark: **revert** content tokens; do not patch all canvases in this plan.

4. Optional micro-fix (only if smoke finds CSS inheritance bugs): replace `background-color:#ededed` in `behaviorConditions.js` `getStyles` with `var(--wv-content-bg)` — single-line, loader-scoped CSS supports variables. **Do not** expand into canvas `getComputedStyle` work here.

### Copy / pattern references

- Loader scoping: `webviz/js/loader.js` `createScopedStyles`
- Worst offenders inventory: this plan’s discovery notes + modules listed above
- Hardcoded examples: `behaviors.js` ~1078+, `micData.js` ~122+, `navMap.js` background 0

### Verification

- [ ] Smoke matrix checked on light + dark shell *(manual / robot — agents cannot drive browser)*
- [x] README invariant written (`webviz/README.md` Theme)
- [x] No requirement that modules call `WebVizTheme`
- [x] Manual smoke list documented (overview, behaviors, mood, micData, navMap)

### Anti-pattern guards

- Do not rewrite Flot series colors “to match light theme”
- Do not force navMap to a white map background

---

## Phase 6 — Consolevars readiness (tokens only; UI optional)

### What to implement

1. Ensure Phase 1 already mirrored light tokens into `cv-tokens.css`.

2. **Manual check** (no UI yet): open `/consolevars` after scp, DevTools set `document.documentElement.setAttribute('data-theme','light')` → Path A chrome should flip because `cv-chrome.css` uses only `var(--wv-*)`.

3. Fix any Path A light leaks found (jQuery UI residual) **only** via `cv-chrome.css` overrides using tokens — same pattern as comment at `cv-chrome.css:505` (“Neutralize default jQuery UI fills…”).

4. **Optional stretch** (same PR only if Phase 1–5 green):  
   - FOUC snippet + `theme.js` (or shared root `wv-theme.js`) on `consolevarsui.html`  
   - Small System/Dark/Light control in the Path A header  
   - Prefer shared localStorage key `webviz.colorScheme` so WebViz and consolevars stay in sync across tabs

5. **Do not** touch template markers:

   - `/* -- generated style -- */`
   - `// -- generated script --`
   - `<!-- generated html -->`

6. Update `AGENTS.md` §3 with a short “Color scheme” subsection: preference key, `data-theme`, light content host invariant, dual-file sync.

### Copy / pattern references

- `consolevarsui.html` CSS order L15–18
- `cv-chrome.css` body base L6–19
- AGENTS deploy notes §4

### Verification

- [ ] `data-theme=light` on consolevars: body/panels/tabs/sliders readable; controls still POST `consolevarset` *(manual)*
- [x] Template markers intact (not edited; grep still finds all three in `consolevarsui.html`)
- [ ] Dark consolevars still matches pre-change Path A look *(manual)*
- [x] AGENTS.md documents the scheme (§3 Color scheme + Quick answers)
- [x] Light block present in `cv-tokens.css` (parity with `tokens.css`); theme UI on consolevars **skipped** (optional)

### Anti-pattern guards

- Do not require explorer route
- Do not edit `jquery-ui.css`
- Do not invent `--cv-*` light tokens

---

## Phase 7 — Final verification

### Checklist

- [ ] Preference: system / dark / light all work on `webViz.beta.html`
- [ ] System follows OS; live update on `change` event
- [ ] Persistence: `webviz.colorScheme` in localStorage
- [ ] FOUC: no wrong-theme flash on hard reload
- [ ] Dark chrome: not heavily modified (visual regression OK)
- [ ] Light chrome: top, nav, stage chrome, status, toasts, overview
- [ ] Module hosts remain light; sample modules (Phase 5) OK
- [ ] `tokens.css` and `cv-tokens.css` in sync for all `--wv-*` names + light block
- [ ] `shell.css` / `cv-chrome.css` introduce no parallel hex palette
- [ ] No new HTTP endpoints; no C++ edits
- [ ] scp-friendly: CSS/JS hard-refresh; HTML may need webserver process restart if template-cached
- [ ] Grep anti-patterns:

  ```bash
  # No theme code writing random hex in JS
  rg -n 'colorScheme|data-theme|WebVizTheme' resources/webserver/webviz/
  # Token files both have light selector
  rg -n 'data-theme="light"' resources/webserver/webviz/css/tokens.css resources/webserver/cv-tokens.css
  # Modules still not required to import theme
  rg -n 'WebVizTheme|colorScheme' resources/webserver/webVizModules/ || true
  ```

### Acceptance criteria (user-facing)

1. On WebViz beta, user can choose System / Dark / Light.  
2. Default System tracks OS.  
3. Dark looks like today’s WebViz.  
4. Light is a coherent ops UI, not an inverted accident.  
5. Charts/modules in the content well still work.  
6. Light token set is usable later on consolevars without a second design system.

---

## Suggested execution order / agents

| Step | Phase | Notes |
|---|---|---|
| 1 | Phase 1 | One agent: tokens + cv-tokens light block |
| 2 | Phase 2 | One agent: theme.js + FOUC |
| 3 | Phase 3 | One agent: beta HTML + wireChrome |
| 4 | Phase 4 | One agent: shell hardcoded cleanup |
| 5 | Phase 5 | Human or agent smoke + README |
| 6 | Phase 6 | Tokens already done; optional UI; AGENTS.md |
| 7 | Phase 7 | Full verification |

Phases 1–3 are the **minimum shippable** for WebViz beta. Phase 4–5 are required for quality. Phase 6 optional UI, required token parity + AGENTS note.

---

## File touch list (expected)

| Path | Action |
|---|---|
| `resources/webserver/webviz/css/tokens.css` | Light block + optional new toast tokens + `color-scheme` |
| `resources/webserver/cv-tokens.css` | Mirror |
| `resources/webserver/webviz/js/theme.js` | **Create** |
| `resources/webserver/webViz.beta.html` | FOUC script, theme select, script tag |
| `resources/webserver/webViz.html` | Mirror if still twin entry |
| `resources/webserver/webviz/js/app.js` | `wireChrome` + init |
| `resources/webserver/webviz/css/shell.css` | Small fixes for light; select in top bar |
| `resources/webserver/cv-chrome.css` | Only if light leak fixes for Path A |
| `resources/webserver/consolevarsui.html` | Optional FOUC + control (Phase 6) |
| `resources/webserver/webviz/README.md` | Theme + module host invariant |
| `resources/webserver/AGENTS.md` | §3 color scheme subsection |
| `resources/webserver/webVizModules/*` | Avoid; optional one-line CSS var only if smoke requires |

---

## Open questions (resolved defaults — override only if user says)

| Q | Default in this plan |
|---|---|
| Default preference when no storage? | **System** |
| If system + media API missing? | **Dark** (historic WebViz) |
| Shared storage key with consolevars? | **Yes** `webviz.colorScheme` |
| Theme UI on consolevars in v1? | **No** — tokens ready; UI optional Phase 6 |
| Darken modules in dark mode? | **No** |
| Explore dual content themes later? | Separate plan; needs canvas `getComputedStyle` work |

---

## Discovery appendix (evidence summary)

### Architecture today

```
Dark ops chrome (:root --wv-*)     ← shell.css, cv-chrome.css
Light module host (--wv-content-*) ← .module-host for stock modules
No data-theme / no theme JS
```

### localStorage already used

- `webviz.feedHost`, `webviz.feedPort` — **do not collide**; new key `webviz.colorScheme`

### High-risk modules if content host ever goes dark

`behaviors.js` (D3), `micData.js` / `micDataEngine.js` (canvas), `visionScheduleMediator.js` (canvas), Flot modules (`mood`, `cpu`, `cpuprofile`). **navMap** is intentionally dark.

### Canonical policy quotes

- Tokens SoT: `webviz/css/tokens.css`; Path A copy `cv-tokens.css`  
- “New chrome must use `--wv-*` tokens. Do not invent a second palette.” (`AGENTS.md` §3)  
- Module host light by design (`webviz/README.md`)
