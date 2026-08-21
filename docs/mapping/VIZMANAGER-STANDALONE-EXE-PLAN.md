# Host VizManager — standalone Windows exe + Viz on/off

**Path:** `docs/mapping/VIZMANAGER-STANDALONE-EXE-PLAN.md`  
**Status:** implemented in tree (Windows freeze is operator-run; do not freeze on Linux)  
**Mapped:** 2026-08-20  
**Depends on:** [`VIZMANAGER-HOST-PLAN.md`](VIZMANAGER-HOST-PLAN.md), [`vizmanager-design/MASTER.md`](vizmanager-design/MASTER.md), `tools/vizmanager/` as it exists after the camera-splitter work.

**Goal:** A Windows **onedir** freeze (`VizManager.exe`) plus a **build script** next to `setup_windows.ps1`. Double-click opens the existing pygame chrome. Robot IP is typed there (already exists). If this PC has more than one LAN IPv4, chrome also asks which **host IP** the robot can ping. After RedirectViz handshake, the app **GET**s engine `consolevarset?key=Viz&value=true`. On Disconnect or window close it **GET**s `value=false`.

This is **not** a second GUI toolkit, **not** WebViz as the Viz stream, **not** `ImageRequest` as the enable/disable pair.

---

## Phase 0 — Allowed APIs (copy these; do not invent)

### Transport / chrome (already in tree)

| Fact | Source |
|---|---|
| Entry is `python -m vizmanager` → `vizmanager.app:main` | `tools/vizmanager/vizmanager/__main__.py`; **no** `[project.scripts]` |
| CLI: `--robot`, `--listen-only`, `--host-ip`, `--bind 0.0.0.0`, `--viz-port 5252`, `--ui-port 5200` | `app.py` `build_parser` |
| pygame chrome already has **robot IP field + one Connect CTA** | MASTER.md chrome ASCII; `app.py` `_chrome_widgets` / `_draw_chrome` |
| `host_ip` is CLI or `local_ipv4s()[0]` — **not in chrome** | `app.py` `VizApp.__init__`; `udp.py` `local_ipv4s` |
| Connect = register UI `:5103` + RedirectViz `0x6F` + ping keep-alive | `app.py` `Redirector.poll`; `connect.py` packers |
| Window X / `close()` only drops **host sockets**. Does **not** touch VisionMode::Viz | `app.py` `_run_pygame` `finally: close()` |
| Generated CLAD found via `codec._repo_root()` = three parents of `codec.py` | `codec.py` `_ensure_import_path` |
| Must ship entire `generated/cladPython/` + `msgbuffers` | `generate_clad.py` `MESSAGE_VIZ_REL`; `victor-clad/tools/message-buffers/support/python` |

### VisionMode::Viz enable / disable (engine HTTP, not UDP)

Copy the URL from README / `setup_windows.ps1`, the HTTP pattern from `tools/ai/playOnboarding.py`, the handler from `webService.cpp`.

| Fact | Source |
|---|---|
| Engine webserver **TCP `:8888`** | `docs/development/web-server.md`; `resources/webserver/webServerConfig_engine.json` |
| Path `/consolevarset` | `webServerProcess/src/webService.cpp:1013` |
| GET **or** POST; GET uses `query_string` when `content_length == 0` | `webService.cpp` `ConsoleVarSet` 334–350 |
| Query **`key=Viz&value=true`** / **`value=false`** (also `1`/`0`). Category is **not** in the key | README; `visionComponent.cpp` `SetupVisionModeConsoleVars` (`EnumToString(m)` → `"Viz"`) |
| Bool parse: `true`/`false` case-insensitive | `lib/util` `ConsoleVar<bool>::ParseText` |
| Copy-ready GET: `http://{robot}:8888/consolevarset?key=Viz&value=true` | README; `playOnboarding.py:67-68` (`requests.get` — **we use stdlib urllib instead**) |
| Success HTTP 200 + `true<br>` / `false<br>` | `webService.cpp` ProcessRequest |
| Engine may wait **10s** on its main thread | `webService.cpp` `kTimeoutDuration_s = 10` |
| **No auth** on current builds (`global_auth_file` commented VIC-1554) | `webService.cpp`; `web-server.md` “future shipping” anki/overdrive — **do not send Basic** |
| Console-var `false` **does** `EnableMode` **and** `DevOnly_SelfUnsubscribeVisionMode` | `visionComponent.cpp` `UpdateVisionModeConsoleVars` |

In-tree GET example to copy (swap `requests` for `urllib.request`):

```67:68:tools/ai/playOnboarding.py
    uri = 'http://' + robotIP + ':8888/consolevarset?key=DevMoveToStage&value=' + str(stageNum)
    res = requests.get(uri)
```

### ImageRequest exists but is the wrong pair

| Fact | Source |
|---|---|
| G2E `ImageRequest` tag **`0x70`**, payload `ImageSendMode` uint8 (`Stream=1`, `Off=0`) | generated `messageGameToEngine.py`; `imageTypes.clad` |
| Handler: `EnableImageSending(mode == Stream)` → **only** `EnableMode(Viz)` | `cozmoEngine.cpp:607-613`; `visionComponent.cpp:2886-2888` |
| Does **not** DevOnly-unsubscribe, does **not** flip the console bool | same |

**Do not** enable with curl and disable with `70 00` (or the reverse). Mixing leaves CAMERA on.

### Freeze tooling — NEW (not in tree)

Repo grep: **zero** `pyinstaller` / `cx_Freeze` / `py2exe` / `nuitka` / `*.spec`. SDK `.gitignore` mentions `dist/` only as a template. Allowed approach: add **PyInstaller** as extra `[exe]`, spec + `scripts/build_windows.ps1` beside `setup_windows.ps1`.

Copy setup script structure from `tools/vizmanager/scripts/setup_windows.ps1` (`Get-RepoRoot` = three hops from `scripts/`, `Get-PythonExe`, `Invoke-Py`).

### UI tokens (no hex outside `theme.py`)

Copy from `tools/vizmanager/vizmanager/theme.py` and MASTER: `BG_ELEVATED`, `BORDER`, `TEXT`, `TEXT_MUTED`, `ACCENT` 2px focus, `CONTROL_H=28`, hit ≥32px, `CHROME_H=36`. One primary CTA remains **Connect**. Disconnect stays muted text.

---

## Product decisions (lock before coding)

1. **One window.** Do **not** add Tkinter / WinForms / a pre-flight dialog with its own Launch/Connect. Robot IP stays the existing chrome field (`app.py` `_chrome_widgets["ip"]`).
2. **Host IP only when unsure.** If `local_ipv4s()` has exactly one non-loopback, non-link-local IPv4, keep using it silently. If **0 or ≥2**, show a **secondary** chrome combo (same 28px field, not a filled button). Hint: “this PC — pick the IPv4 the robot can ping (not VPN/Hyper-V/WSL)”.
3. **Viz HTTP after handshake, not before Connect.** Trigger when `Redirector.redirected` becomes True (RedirectViz just sent). Empty CAMERA until then is still correct.
4. **Viz HTTP false on both Disconnect and process exit** (`pygame.QUIT`, headless Ctrl-C, `VizApp.close`). Best-effort, short timeout; never block quit if `:8888` is down.
5. **Freeze is onedir** `dist/VizManager/VizManager.exe`. pygame + cv2 + vispy onefile is a follow-up, not v1. Console subsystem stays on (`--listen-only` pkt/s).
6. **stdlib `urllib.request`** only. Do not add `requests`. Do not use `fcntl`. Bind stays `0.0.0.0`.

---

## Anti-patterns (reviewer reject)

- Second primary CTA (“Launch”, “Enable camera”, “Apply”).
- Tkinter/WinForms dialog.
- Treating WebViz `:8888` as the **Viz UDP stream** (it is only the console-var switch).
- `ImageRequest` `0x70` as the enable/disable pair.
- `key=Vision.General.VisionModes.Viz` (lookup is id `"Viz"` only).
- Basic auth `anki:overdrive` unless `htpasswd` is actually enabled.
- `codec._repo_root()` left as three parents of `__file__` inside a freeze with no `sys.frozen` branch.
- Shipping only `messageViz.py` instead of the whole `generated/cladPython/` tree.
- Hex outside `theme.py`.
- Opening UDP 5252 on the robot.
- Calling `generate_clad.py` **from the frozen exe** (dev step, before freeze).
- `iptables --policy INPUT ACCEPT`.

---

## Phase 1 — VisionMode HTTP helper + quit hook

**What to implement**

New module `tools/vizmanager/vizmanager/vision_http.py`. Copy URL shape from README / `playOnboarding.py`; use stdlib urllib.

```python
CONSOLE_PORT = 8888
# GET http://{robot}:8888/consolevarset?key=Viz&value=true|false
def viz_console_url(robot_ip, enable): ...
def set_viz_mode(robot_ip, enable, timeout=12.0): ...
```

- Build URL with `urllib.parse.urlencode({"key": "Viz", "value": "true"|"false"})` so the query is unencoded `true`/`false` (handler does **not** URL-decode — keep values as literal `true`/`false`).
- `urllib.request.urlopen(url, timeout=timeout)` — timeout **12s** to outlast the engine’s 10s wait (`webService.cpp` `kTimeoutDuration_s`).
- Success: HTTP 200 and body does **not** contain `Variable not found`, `Timed out`, `Error setting`.
- Failures return a short string (for the chrome error line); never raise into the pygame loop.

Wire in `app.py` (copy hook points, do not invent new windows):

| When | Call | Where |
|---|---|---|
| RedirectViz just sent | `set_viz_mode(robot, True)` | `Redirector.poll` after successful `pack_redirect_viz` send (`app.py` `Redirector.poll`) |
| Disconnect button | `set_viz_mode(robot, False)` then `stop_connect()` | `_on_mouse_down` disconnect |
| `VizApp.close()` | `set_viz_mode` false if we previously set true | `app.py` `close` (pygame QUIT and headless Ctrl-C already call this) |

Keep a flag `_viz_http_enabled` so quit does not GET false if handshake never happened.

On HTTP failure after handshake: set `connect_error` to a **secondary** line (WORLD can still be live): `"VisionMode::Viz HTTP failed on :8888 — CAMERA stays empty. {reason}"`. Do not tear down RedirectViz.

**Docs to read while implementing:** `docs/development/web-server.md` L76–78; `webService.cpp` 334–350; `visionComponent.cpp` `UpdateVisionModeConsoleVars`; README step 4.

**Verify**

- Unit tests in `tools/vizmanager/tests/test_vision_http.py` with a fake `urlopen` (no robot):
  - `viz_console_url("192.168.50.155", True) == "http://192.168.50.155:8888/consolevarset?key=Viz&value=true"`
  - false → `value=false`
  - 200 + `true<br>` → ok
  - 200 + `Variable not found Viz` → error string
  - connection refused → error string, no exception
- `tests/test_app.py`: fake Redirector handshake sets `_viz_http_enabled`; `close()` calls false exactly once.
- Grep: no `ImageRequest`, no `requests`, no `consolevarset` to `:8889`.

**Anti-pattern guards:** no G2E `0x70`; no POST-only client; no auth header.

---

## Phase 2 — Host-IP picker in existing chrome

**What to implement**

1. Tighten `udp.local_ipv4s()` (and delete the stale duplicate in `connect.py` **or** make `connect.local_ipv4s` call `udp.local_ipv4s`): skip `127.*` **and** `169.254.*`. Keep hostname lookup + `8.8.8.8` route-trick. Optionally append other `getsockname` results if easy; do not invent Win32 IP Helper if stdlib is enough.
2. Chrome: if `len(local_ipv4s()) != 1` **or** `--host-ip` was passed, show a second 28px field to the right of robot IP (`BG_ELEVATED`, 2px `ACCENT` focus, digits+dots, max 15). Label/placeholder `"host IPv4"`. Default = `args.host_ip or local_ipv4s()[0]`.
3. `start_connect()` reads **that** field into `self.host_ip` (same `_valid_ipv4` as robot).
4. If many candidates, LOG line (not a second CTA): `"host IPv4 candidates: …"` copied from `setup_windows.ps1` wording.
5. Cycle candidates with **H** (optional, documented in README Keys). Do **not** add a filled “Pick NIC” button.

WORLD remains largest at 1600; do not steal chrome height (`CHROME_H` stays 36). If two fields do not fit, shrink pps column first, never Connect.

**Docs:** MASTER chrome / one CTA; `setup_windows.ps1` `Get-LanIpv4s` 93–109 for skip rules; `connect_error_message` still names 5103/5252/5200.

**Verify**

- `test_app.py`: layout still `CHROME_H==36`; Connect still the only `ACCENT_DIM` button.
- `local_ipv4s` unit: 169.254 filtered (inject fake list if needed).
- No hex in `app.py`.
- Keys table in README: host field + Viz auto on/off.

**Anti-pattern guards:** no second window; no second filled button; robot IP field remains the Connect target (Enter still Connects).

---

## Phase 3 — Frozen path + Windows build script

**What to implement**

### 3a. `codec._repo_root()` frozen branch (NEW, required)

Copy current function, add:

```python
def _repo_root():
    if getattr(sys, "frozen", False):
        return os.path.abspath(getattr(sys, "_MEIPASS", os.path.dirname(sys.executable)))
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
```

PyInstaller onedir datas layout (so existing `_ensure_import_path` keeps working):

```
_MEIPASS/
  generated/cladPython/          # entire tree
  victor-clad/tools/message-buffers/support/python/msgbuffers/
  vizmanager/                    # the package
```

### 3b. PyInstaller spec — NEW file

`tools/vizmanager/VizManager.spec` (committed). Analysis:

- Entry: `tools/vizmanager/vizmanager/__main__.py` or `python -m vizmanager` equivalent (`app.main`).
- `datas`: `(repo/generated/cladPython, generated/cladPython)`, `(…/support/python/msgbuffers, victor-clad/tools/message-buffers/support/python/msgbuffers)`.
- `hiddenimports`: `msgbuffers`, `clad`, `clad.vizInterface.messageViz`, `clad.types.visionModes`, `pygame`, `cv2`, `numpy`. vispy **optional**: collect if importable; freeze must still run if vispy GL backend missing (WORLD 2D fallback already exists).
- `console=True` (headless pkt/s). Name `VizManager`.
- `onedir` (`EXE` + `COLLECT`), not `onefile`.

Pin PyInstaller in `pyproject.toml` extra `[exe]`.

### 3c. `tools/vizmanager/scripts/build_windows.ps1`

Copy `Get-RepoRoot` / `Get-PythonExe` / `Invoke-Py` from `setup_windows.ps1`.

Order:

1. Fail if `generated/cladPython/clad/vizInterface/messageViz.py` missing → tell operator to run `setup_windows.ps1` or `generate_clad.py` first.
2. `pip install -e ".[exe]"` from `tools/vizmanager`.
3. `pyinstaller --noconfirm --clean VizManager.spec` with cwd `tools/vizmanager` (or repo root — pick one and document; spec paths must match).
4. Probe: `& dist\VizManager\VizManager.exe --help` (or `-c` import check) exits 0.
5. Print: run `VizManager.exe`, Windows still needs inbound UDP **5252,5200** (Defender will now prompt for **VizManager.exe**, not python.exe), robot still needs **5103**, `:8888` must already be reachable for Viz HTTP.

`.gitignore` (root or `tools/vizmanager/`): `dist/`, `build/`, `*.pyc` under spec workdirs. Do **not** gitignore `VizManager.spec`.

**Docs:** `codec.py` 16–32; `generate_clad.py` `MESSAGE_VIZ_REL`; `setup_windows.ps1` Python finder.

**Verify**

- `test_codec.py` / new `test_frozen_root.py`: monkeypatch `sys.frozen` + `_MEIPASS` temp dir with a stub `generated/cladPython` path; `_repo_root()` returns `_MEIPASS`.
- Spec file exists; `build_windows.ps1` references the same `MESSAGE_VIZ_REL`.
- Grep: no `onefile` in v1 spec.
- Linux CI does **not** have to run PyInstaller; unit tests stay OS-agnostic.

**Anti-pattern guards:** do not freeze `Python_emitter.py` / `.clad` sources; do not call `generate_clad.py` at exe runtime; do not rewrite UDP in C++ `UdpServer`.

---

## Phase 4 — Verification (orchestrator)

1. `cd tools/vizmanager && python -m pytest tests -q`
2. Grep rejects:
   - `ImageRequest` / `0x70` in `tools/vizmanager/vizmanager/`
   - `import requests`
   - `tkinter` / `Tk(` / `win32ui`
   - hex `#` outside `theme.py`
   - `consolevarset` to port **8889**
3. Manual Windows (operator):
   - `setup_windows.ps1` then `build_windows.ps1`
   - Launch `VizManager.exe`, enter robot IP, pick host IP if listed, Connect
   - CAMERA fills without a manual curl
   - Quit → `curl "http://ROBOT:8888/consolevarget?key=Viz"` is `false` (or CAMERA stays off after reconnect without re-enable)
4. README: Windows exe section under the existing Windows 10 walkthrough; Keys: auto Viz on handshake / off on quit; Defender allow **VizManager.exe**.

---

## File touch list (expected)

| File | Phase |
|---|---|
| `tools/vizmanager/vizmanager/vision_http.py` | 1 **new** |
| `tools/vizmanager/tests/test_vision_http.py` | 1 **new** |
| `tools/vizmanager/vizmanager/app.py` | 1–2 (hooks + host field) |
| `tools/vizmanager/vizmanager/udp.py` | 2 (`local_ipv4s` filter) |
| `tools/vizmanager/vizmanager/codec.py` | 3 (`sys.frozen`) |
| `tools/vizmanager/tests/test_app.py` | 1–2 |
| `tools/vizmanager/VizManager.spec` | 3 **new** |
| `tools/vizmanager/scripts/build_windows.ps1` | 3 **new** |
| `tools/vizmanager/pyproject.toml` | 3 `[exe]` extra |
| `.gitignore` or `tools/vizmanager/.gitignore` | 3 `dist/` `build/` |
| `tools/vizmanager/README.md` | 4 |

No firmware, no `docs/architecture/`, no `RedirectVizTo`.

---

## Out of scope (v1)

- onefile / UPX / code signing
- Bundling Fira `.ttf` (pygame already falls back to Segoe/Consolas)
- Auto `iptables` on the robot
- Enabling Viz before UI handshake
- Linux AppImage
