# VizManager - ship this folder, not the repo

The Windows freeze is **onedir**. Recipients need the **entire** `VizManager` directory (`VizManager.exe` **and** `_internal/`). They do **not** need Python, this git tree, or `generated/cladPython` on disk.

```
VizManager/
  VizManager.exe
  _internal/          <- CLAD, pygame, OpenCV, vispy, DLLs. Keep beside the exe.
  README.txt          <- this file, copied by build_windows.ps1
  OWNERS-MANUAL.md    <- how to use the window (copied by build_windows.ps1)
```

Zip that folder and send the zip. Do not send only the `.exe`.

## Recipients (no repo)

1. Unzip on the Windows 10 PC that will talk to the robot.
2. Allow **VizManager.exe** inbound UDP **5252** and **5200** (Defender may prompt). Admin:

   ```powershell
   New-NetFirewallRule -DisplayName 'Vector Viz' -Direction Inbound -Protocol UDP -LocalPort 5252,5200 -Action Allow
   ```

3. On the robot (root, until reboot), allow this PC to register as UI:

   ```bash
   iptables -I INPUT -p udp --dport 5103 -s YOUR_LAN_IP -j ACCEPT
   ```

   `YOUR_LAN_IP` is the address **the robot can ping** (not VPN / Hyper-V / WSL). Do not open 5252 on the robot.

4. Double-click `VizManager.exe`. Enter the robot IPv4. If this PC has several LAN addresses, also pick **host IPv4**. Connect.

After RedirectViz handshake the app GETs `http://ROBOT:8888/consolevarset?key=Viz&value=true` (engine console, not the UDP stream). Disconnect or closing the window GETs `value=false`. Engine `:8888` must already be reachable (same as the browser console page).

## Builders (this repo, Windows)

Do not freeze on Linux. From repo root:

```powershell
powershell -ExecutionPolicy Bypass -File tools\vizmanager\scripts\setup_windows.ps1
powershell -ExecutionPolicy Bypass -File tools\vizmanager\scripts\build_windows.ps1
```

Output: `tools/vizmanager/dist/VizManager/`. Zip that directory.

If pip dies with `WinError 2` / `.deleteme` on `C:\Python311\Scripts\pyi-archive_viewer.exe`, that is Windows locking the new console-script exe (Defender is the usual culprit). `build_windows.ps1` retries and skips pip when `import PyInstaller` already works. Re-run is enough; `-SkipPip` if PyInstaller is installed; `-ForcePip` to reinstall. Optional: exclude `C:\Python311\Scripts` from real-time scanning.
