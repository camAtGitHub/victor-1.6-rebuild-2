# Host VizManager

Windows + Linux desktop client for Vector’s **UDP Viz** protocol (not WebViz `:8888`).
This host is the UDP **server** on port **5252**. The engine is the client.

`--robot` uses stock G2E **`RedirectViz`** (`connect.py`) — not `RedirectVizTo`.
`--listen-only` binds viz UDP only (no UI `:5200`, no robot `:5103`).
Bind is **`0.0.0.0`**. pygame = chrome + 2D + camera; vispy 3D is optional
(WORLD 3D falls back to projected wires). Missing pygame still prints **pkt/s**.

Layout: WORLD is the largest pane. One CTA: **Connect**.

---

## Windows 10 — all features

Needs **Python 3.10+** (python.org; tick “Add python.exe to PATH”).
PowerShell 5.1 is enough. Git Bash is optional.

Paths this tree actually uses (do not invent a second output dir):

```
<repo>/tools/vizmanager/vizmanager/codec.py
<repo>/tools/vizmanager/scripts/generate_clad.py
<repo>/tools/vizmanager/scripts/setup_windows.ps1
<repo>/victor-clad/tools/message-buffers/emitters/Python_emitter.py
<repo>/generated/cladPython/clad/vizInterface/messageViz.py   ← gitignored; codec imports this
```

`<repo>` is the folder that contains `tools/vizmanager/` and `victor-clad/`.

### Standalone Windows exe (no repo on the target PC)

Build **on Windows** (not in this Linux checkout). Recipients unzip one folder; they do not need Python or this git tree.

```powershell
powershell -ExecutionPolicy Bypass -File tools\vizmanager\scripts\setup_windows.ps1
powershell -ExecutionPolicy Bypass -File tools\vizmanager\scripts\build_windows.ps1
```

Output: `tools/vizmanager/dist/VizManager/` (`VizManager.exe` + `_internal/`). Zip **that whole directory**. Details: `tools/vizmanager/SHIPPING.md`.

`pip` on Windows often fails once with `WinError 2` renaming `Scripts\pyi-*.exe` to `.deleteme` (Defender file lock). The build script retries; if PyInstaller already imports it skips pip (`-SkipPip` / `-ForcePip`).

Do not ship the `.exe` alone. CLAD and DLLs live in `_internal/` (`codec._repo_root()` uses PyInstaller `_MEIPASS`).

### 1. One-shot setup (PowerShell)

From the **repo root** (or any cwd; the script finds the repo from its own path):

```powershell
powershell -ExecutionPolicy Bypass -File tools\vizmanager\scripts\setup_windows.ps1 -Robot 192.168.50.155
```

That will:

1. Find Python 3.10+ (`py -3`, then `python`, then `python3`)
2. `pip install -e tools/vizmanager` → pygame, vispy, opencv-python, numpy
3. Run `generate_clad.py` → `generated/cladPython/`
4. `import MessageViz` / pygame / cv2
5. Try inbound firewall UDP **5252,5200** (needs Administrator; otherwise prints the cmdlet)
6. Print `--host-ip` LAN candidates and the exact run command

Flags: `-SkipPip`, `-SkipGenerate`, `-SkipFirewall`, `-HostIp 192.168.50.10`, `-Python python`.

Git Bash instead of the `.ps1` (from **repo root**):

```bash
pip install -e "tools/vizmanager[test]"
python tools/vizmanager/scripts/generate_clad.py
# same emitter: tools/vizmanager/scripts/generate_clad.sh
```

### 2. Robot hole (once per boot)

On the robot as root. `YOUR_LAN_IP` = the `--host-ip` the script printed (the IPv4 **the robot can ping**, not a VPN/Hyper-V/WSL adapter):

```bash
iptables -I INPUT -p udp --dport 5103 -s YOUR_LAN_IP -j ACCEPT
```

Do **not** open 5252 on the robot. Do **not** `iptables --policy INPUT ACCEPT`.

### 3. Run

```powershell
cd tools\vizmanager
python -m vizmanager --robot 192.168.50.155 --host-ip YOUR_LAN_IP
```

Window: 1680×900 chrome. Type the robot IP if needed, **Connect**.
Allow **python.exe** if Defender pops a dialog.

Success looks like: status **LIVE** (or **DEGRADED**), pkt/s > 0, STACK / STATE / WORLD filling in.
That is RedirectViz working. CAMERA can still be empty — that is the next step, not a failed connect.

`--listen-only` is for proving UDP 5252 inbound with no robot UI dance.

### 4. Camera (`VisionMode::Viz`)

After RedirectViz handshake the app GETs `http://ROBOT:8888/consolevarset?key=Viz&value=true`. Disconnect or quit GETs `value=false`. Engine `:8888` must already be reachable.

If HTTP fails, CAMERA stays on `No ImageChunk (enable VisionMode::Viz)` while WORLD can still be live. Fallback:

- Browser: `http://ROBOT_IP:8888/consolevars` → **Vision.General.VisionModes** → tick **Viz**
- Or: `curl "http://ROBOT_IP:8888/consolevarset?key=Viz&value=true"`

Does not survive `vic-engine` restart.

### If Connect times out

| Check | What |
|---|---|
| Windows inbound | `New-NetFirewallRule -DisplayName 'Vector Viz' -Direction Inbound -Protocol UDP -LocalPort 5252,5200 -Action Allow` (Admin PowerShell) |
| `--host-ip` | Must be pingable from the robot. Pass it explicitly if setup listed several NICs |
| Robot 5103 | The `iptables -I INPUT … 5103` line above |
| Bind | Default `0.0.0.0` is correct. Do not bind `127.0.0.1` |

Prove 5252 while VizManager is running:

```powershell
echo ANKICONN | ncat -u -w1 YOUR_LAN_IP 5252
```

Handshake / pkt/s should bump. If not, the packet never arrived (firewall / wrong IP). Firmware is not involved yet.

---

## Firewall (all platforms)

Do **not** open UDP 5252 on the robot. Inbound holes are on **this host**.

| Direction | Proto | Port | Who opens it |
|---|---|---|---|
| Robot → this host | UDP | **5252** | **This machine** — Viz stream |
| Robot → this host | UDP | **5200** | **This machine** — engine connects as UI (`--robot`) |
| This host → robot | UDP | **5103** | **Robot INPUT** — advertisement registration (`--robot`) |
| Robot inbound 5252 | — | — | **Not used** |

### Linux (this host)

**ufw**

```bash
sudo ufw allow from ROBOT_LAN_IP to any port 5252 proto udp
sudo ufw allow from ROBOT_LAN_IP to any port 5200 proto udp
```

**firewalld**

```bash
sudo firewall-cmd --add-rich-rule='rule family=ipv4 source address=ROBOT_LAN_IP port port=5252 protocol=udp accept'
sudo firewall-cmd --add-rich-rule='rule family=ipv4 source address=ROBOT_LAN_IP port port=5200 protocol=udp accept'
```

**iptables**

```bash
sudo iptables -I INPUT -p udp --dport 5252 -s ROBOT_LAN_IP -j ACCEPT
sudo iptables -I INPUT -p udp --dport 5200 -s ROBOT_LAN_IP -j ACCEPT
```

---

## Keys

| Key | Action |
|---|---|
| 1 / 2 / 3 | WORLD 3D / 2D / Map |
| F | Frame robot |
| Space | Pause render only (UI pings keep going) |
| Esc | Dismiss connect error / blur IP field |
| Drag CAMERA\|WORLD edge | Resize the camera pane (default 640px, double-click to reset) |
| H | Cycle host IPv4 candidates when the host field is shown |

Connect: button disables and shows **Connecting…** until UI handshake or 8 s. Errors under the IP field include the 5103 / 5252 / 5200 fix.

## Generate CLAD Python

Unpack needs generated `MessageViz` (gitignored). Same command on Windows and Linux:

```bash
# from repo root
python tools/vizmanager/scripts/generate_clad.py
python tools/vizmanager/scripts/generate_clad.py --check
```

Emitter: `victor-clad/tools/message-buffers/emitters/Python_emitter.py`.
Includes match `clad/CMakeLists.txt` plus util. Output:
`generated/cladPython/clad/vizInterface/messageViz.py`.

Runtime import path (set by `vizmanager.codec`):

- `generated/cladPython/`
- `victor-clad/tools/message-buffers/support/python` (`msgbuffers`)

Audit tags (51 `BehaviorStackDebug`, 22 `RobotStateMessage`, 19 `ImageChunk`, 39 `SetRobot`):

```bash
python tools/vizmanager/scripts/dump_viz_tags.py
```

## Tests

```bash
cd tools/vizmanager
python -m pytest tests -q
```

Pack tests (`test_connect_pack.py`) use hardcoded G2E layouts already in `connect.py`. Generated unpack tests skip if CLAD Python is missing.
