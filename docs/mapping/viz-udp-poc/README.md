# Viz UDP connectivity POC

**Path:** `docs/mapping/viz-udp-poc/`  
**Status:** crude listen-only POC (host client is now `tools/vizmanager/`)  
**Related:** `engine/viz/vizManager.cpp`, `clad/vizSrc/clad/vizInterface/messageViz.clad`

Engine is a **UDP client**. This host is the **server** on port **5252**. Nothing arrives until the engine calls `VizManager::Connect(this_host, 5252)`.

The packaged client:

```bash
python -m vizmanager --robot 192.168.50.155
python -m vizmanager --listen-only
```

See `tools/vizmanager/README.md` (Windows Defender, robot 5103, `VisionMode::Viz`, CLAD generate). These scripts remain the connectivity proof.

## 1. Prove the listener (no robot)

```bash
python3 docs/mapping/viz-udp-poc/listen.py --selftest
```

Expect `selftest OK`. That only checks bind + `ANKICONN` recognition on this machine.

## 2. Listen for a real robot

```bash
python3 docs/mapping/viz-udp-poc/listen.py
```

It prints guessed LAN IPs. Inbound **UDP 5252** must be open on **this host** (see firewall below). Bind **`0.0.0.0`**. No `fcntl`.

## 3. Point the robot at you (no firmware rebuild)

Stock engine only aims Viz after a Game-to-Engine **`RedirectViz`**. `RedirectVizTo` is a new console hook and is **not** on a robot that has not been redeployed (`consolefunclist?key=R` will not list it).

Use the stock UI advertising path instead:

```bash
python3 docs/mapping/viz-udp-poc/redirect.py 192.168.50.155
```

(or `python -m vizmanager --robot 192.168.50.155`)

That path:

1. Listens for Viz on **UDP 5252**
2. Listens as a fake UI on **UDP 5200**
3. Registers as UI device **1** on the robot’s **UDP 5103**
4. Sends `RedirectViz` once the engine connects
5. Answers UI pings so Viz is not torn down after 5 s

Success looks like:

```
UI HANDSHAKE from <robot>
sent RedirectViz → <your LAN IP>
VIZ HANDSHAKE  ANKICONN from <robot>
```

then a stream of `VIZ … tag=…` lines (or the VizManager HUD).

If you stall on “still no UI connect”: the **robot** is almost certainly dropping **UDP 5103**. On the robot (root, lasts until reboot):

```bash
iptables -I INPUT -p udp --dport 5103 -s YOUR_HOST_LAN_IP -j ACCEPT
```

Do not use `iptables --policy INPUT ACCEPT` unless you mean to.

Optional later: deploy this tree and use `RedirectVizTo` via `:8888` instead of the UI dance. Stock VizManager does **not** use `RedirectVizTo`.

## Firewall

`redirect.py` / `python -m vizmanager --robot` need **three** holes. Do not open 5252 on the robot.

| Direction | Proto | Port | Who opens it |
|---|---|---|---|
| Robot → this host | UDP | **5252** | **This machine** — Viz stream |
| Robot → this host | UDP | **5200** | **This machine** — engine connects as UI |
| This host → robot | UDP | **5103** | **Robot INPUT** — advertisement registration |
| This host → robot | TCP | **8888** | WebViz / console (already working if `consolefunclist` loads) |
| Robot inbound 5252 | — | — | **Not used** |

### Windows (this host)

Allow UDP **5252** and **5200** inbound in Windows Defender Firewall:

```powershell
New-NetFirewallRule -Protocol UDP -LocalPort 5252,5200
```

### Linux (this host)

**ufw**

```bash
sudo ufw allow from ROBOT_LAN_IP to any port 5252 proto udp comment 'vector-viz-poc'
sudo ufw allow from ROBOT_LAN_IP to any port 5200 proto udp comment 'vector-viz-ui'
sudo ufw status | grep -E '5252|5200'
```

**firewalld**

```bash
sudo firewall-cmd --add-rich-rule='rule family=ipv4 source address=ROBOT_LAN_IP port port=5252 protocol=udp accept'
sudo firewall-cmd --add-rich-rule='rule family=ipv4 source address=ROBOT_LAN_IP port port=5200 protocol=udp accept'
```

**nftables** (add to the input chain you actually use)

```bash
sudo nft add rule inet filter input ip saddr ROBOT_LAN_IP udp dport 5252 accept
sudo nft add rule inet filter input ip saddr ROBOT_LAN_IP udp dport 5200 accept
```

**iptables**

```bash
sudo iptables -I INPUT -p udp --dport 5252 -s ROBOT_LAN_IP -j ACCEPT
sudo iptables -I INPUT -p udp --dport 5200 -s ROBOT_LAN_IP -j ACCEPT
```

Open to the whole LAN only if you must (`192.168.0.0/16` etc.). Temporary rules vanish on reboot; that is fine for a POC.

### Robot

Default Vector INPUT policy is tight. For **`redirect.py` / `--robot` only**, allow advertisement registration from this host (lasts until reboot):

```bash
iptables -I INPUT -p udp --dport 5103 -s YOUR_HOST_LAN_IP -j ACCEPT
```

Do **not** run `iptables --policy INPUT ACCEPT` for this POC. The robot does not need inbound 5252.

### Prove the hole before blaming firmware

On the host, with `listen.py` or `python -m vizmanager --listen-only` running, from any other machine on the LAN (or the robot if you have a shell):

```bash
echo -n ANKICONN | nc -u -w1 HOST_LAN_IP 5252
```

The listener should print a handshake / increment handshakes. If it does not, the packet never arrived — host firewall, bind address, or wrong IP. Firmware is not involved yet.

---

## What the POC scripts do *not* do

- No CLAD unpack, no camera JPEG reassembly, no 3D draw (use `tools/vizmanager`)
- No WebViz (that is `:8888` HTTP/WS, a different path)
- Does not survive a `vic-engine` restart (send `RedirectViz` again)
