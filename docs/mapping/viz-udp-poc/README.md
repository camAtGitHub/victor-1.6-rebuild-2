# Viz UDP connectivity POC

**Path:** `docs/mapping/viz-udp-poc/`  
**Status:** connectivity notes for the host Viz client (`tools/vizmanager/`)  
**Related:** `engine/viz/vizManager.cpp`, `clad/vizSrc/clad/vizInterface/messageViz.clad`

Engine is a **UDP client**. This host is the **server** on port **5252**. Nothing arrives until the engine calls `VizManager::Connect(this_host, 5252)`.

Listen/redirect scripts from the original POC are **not** in this tree. Use the packaged client (`udp.py` + `connect.py`):

```bash
cd tools/vizmanager
python -m vizmanager --listen-only
python -m vizmanager --robot 192.168.50.155
```

See `tools/vizmanager/README.md` (Windows Defender, robot 5103, `VisionMode::Viz`, CLAD generate).

`--listen-only` binds viz UDP only (no UI `:5200`). `--robot` uses stock G2E **`RedirectViz`** (not `RedirectVizTo`):

1. Listens for Viz on **UDP 5252**
2. Listens as a fake UI on **UDP 5200**
3. Registers as UI device **1** on the robot’s **UDP 5103**
4. Sends `RedirectViz` once the engine connects
5. Answers UI pings so Viz is not torn down after 5 s

Success: UI handshake, then Viz `ANKICONN`, then a packet stream (HUD in VizManager). Headless mode prints `pkt/s` and `handshakes=`.

If you stall with no UI connect: the **robot** is almost certainly dropping **UDP 5103**. On the robot (root, lasts until reboot):

```bash
iptables -I INPUT -p udp --dport 5103 -s YOUR_HOST_LAN_IP -j ACCEPT
```

Do not use `iptables --policy INPUT ACCEPT` unless you mean to.

Optional later: deploy this tree and use `RedirectVizTo` via `:8888` instead of the UI dance. Stock VizManager does **not** use `RedirectVizTo`.

## Firewall

`--robot` needs **three** holes. Do not open 5252 on the robot. Bind **`0.0.0.0`**. No `fcntl`.

| Direction | Proto | Port | Who opens it |
|---|---|---|---|
| Robot → this host | UDP | **5252** | **This machine** — Viz stream |
| Robot → this host | UDP | **5200** | **This machine** — engine connects as UI (`--robot`) |
| This host → robot | UDP | **5103** | **Robot INPUT** — advertisement registration (`--robot`) |
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
sudo ufw allow from ROBOT_LAN_IP to any port 5252 proto udp comment 'vector-viz'
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

Open to the whole LAN only if you must (`192.168.0.0/16` etc.). Temporary rules vanish on reboot; that is fine.

### Robot

Default Vector INPUT policy is tight. For **`--robot` only**, allow advertisement registration from this host (lasts until reboot):

```bash
iptables -I INPUT -p udp --dport 5103 -s YOUR_HOST_LAN_IP -j ACCEPT
```

Do **not** run `iptables --policy INPUT ACCEPT`. The robot does not need inbound 5252.

### Prove the hole before blaming firmware

On the host, with `python -m vizmanager --listen-only` running, from any other machine on the LAN (or the robot if you have a shell):

```bash
echo -n ANKICONN | nc -u -w1 HOST_LAN_IP 5252
```

The listener should increment handshakes / print pkt/s. If it does not, the packet never arrived — host firewall, bind address, or wrong IP. Firmware is not involved yet.

---

## What this does *not* do

- WebViz (`:8888` HTTP/WS) is a different path
- Does not survive a `vic-engine` restart (Connect / `RedirectViz` again)
- Stock path is `RedirectViz`, not `RedirectVizTo`
