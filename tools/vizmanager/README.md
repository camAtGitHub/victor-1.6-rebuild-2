# Host VizManager

Windows + Linux desktop client for Vector’s **UDP Viz** protocol (not WebViz `:8888`).
This host is the UDP **server** on port **5252**. The engine is the client.

```bash
cd tools/vizmanager
pip install -e ".[test]"
python -m vizmanager --robot 192.168.50.155
python -m vizmanager --listen-only
```

- `--robot` uses stock G2E **`RedirectViz`** (`connect.py`) — not `RedirectVizTo`.
- `--listen-only` binds viz UDP only (no UI `:5200`, no robot `:5103`).
- Bind **`0.0.0.0`**. No `fcntl` (stdlib `socket` only).
- pygame chrome + 2D + camera. vispy 3D is optional (WORLD tab 3D falls back to projected wires / 2D).
- If pygame/vispy are missing, `--listen-only` and `--robot` still run and print **pkt/s**.

Layout (1280×720 min, 1600×900 default): WORLD is the largest pane. One CTA: **Connect**.

Empty CAMERA: `No ImageChunk (enable VisionMode::Viz)`. Images also need engine `_sendImages` (RedirectViz sets that) **and** `VisionMode::Viz` (console / `ImageRequest` Stream).

## Firewall

Do **not** open UDP 5252 on the robot. Inbound holes are on **this host**.

| Direction | Proto | Port | Who opens it |
|---|---|---|---|
| Robot → this host | UDP | **5252** | **This machine** — Viz stream |
| Robot → this host | UDP | **5200** | **This machine** — engine connects as UI (`--robot`) |
| This host → robot | UDP | **5103** | **Robot INPUT** — advertisement registration (`--robot`) |
| Robot inbound 5252 | — | — | **Not used** |

### Windows (Defender Firewall)

Allow UDP **5252** and **5200** inbound:

```powershell
New-NetFirewallRule -Protocol UDP -LocalPort 5252,5200
```

(Add `-DisplayName 'Vector Viz' -Direction Inbound -Action Allow` if the cmdlet requires them.)

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

### Robot (UDP 5103)

Default Vector INPUT is tight. For `--robot` / `RedirectViz` only (lasts until reboot):

```bash
iptables -I INPUT -p udp --dport 5103 -s YOUR_HOST_LAN_IP -j ACCEPT
```

Do **not** run `iptables --policy INPUT ACCEPT` for this. The robot does not need inbound 5252.

Prove the viz hole (host listener running):

```bash
echo -n ANKICONN | nc -u -w1 HOST_LAN_IP 5252
```

## Keys

| Key | Action |
|---|---|
| 1 / 2 / 3 | WORLD 3D / 2D / Map |
| F | Frame robot |
| Space | Pause render only (UI pings keep going) |
| Esc | Dismiss connect error / blur IP field |

Connect: button disables and shows **Connecting…** until UI handshake or 8 s. Errors under the IP field include the 5103 / 5252 / 5200 fix.

## Generate CLAD Python

Unpack needs generated `MessageViz` (gitignored):

```bash
# from repo root
tools/vizmanager/scripts/generate_clad.sh
```

That wraps `victor-clad/tools/message-buffers/emitters/Python_emitter.py` with the same includes as `clad/CMakeLists.txt` (plus util). Output: `generated/cladPython/clad/vizInterface/messageViz.py`.

Runtime import path (also set by `vizmanager.codec`):

- `generated/cladPython/`
- `victor-clad/tools/message-buffers/support/python` (`msgbuffers`)

Audit tags (51 `BehaviorStackDebug`, 22 `RobotStateMessage`, 19 `ImageChunk`, 39 `SetRobot`):

```bash
python3 tools/vizmanager/scripts/dump_viz_tags.py
```

## Tests

```bash
cd tools/vizmanager
python3 -m pytest tests -q
```

Pack tests (`test_connect_pack.py`) use hardcoded G2E layouts already in `connect.py`. Generated unpack tests skip if CLAD Python is missing.
