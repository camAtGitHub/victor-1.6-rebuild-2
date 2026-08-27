# VizManager Owner's Manual

VizManager is a desktop window that shows a live debug view of a Vector robot: the camera picture, a map of the room, the behavior stack, and robot sensors. It is for operators who need to watch what the robot is doing while it runs.

This manual describes the running program. It assumes the VizManager window is already open.

---

## Interface Overview

The window title is **VizManager**. It opens at 1680 × 900 pixels and can be resized; it will not shrink below 1280 × 720.

A black console window may appear beside the main window. Leave it open while you work. Closing the console or the VizManager window exits the program.

The main window has six regions:

| Region | Where | What it shows |
|---|---|---|
| **Chrome bar** | Top strip | Connection status, robot address, packet rate, Overlays, Disconnect, Connect |
| **CAMERA** | Left | Live camera picture from the robot |
| **WORLD** | Center | Room drawing. Tabs: **3D**, **2D**, **Map** |
| **STACK** | Upper right | Behavior stack — which behaviors are active |
| **STATE** | Lower right | Pose, motors, battery, cliffs, animation, and other sensors |
| **Log strip** | Bottom | Packet counts, a few vision-mode names, and the last error |

Between CAMERA and WORLD is a thin vertical **splitter**. Drag it to widen or narrow the camera pane.

---

## Chrome Bar and Controls

The chrome bar is the command strip. There is no File / Edit menu.

### Status pip and word

A small circle sits at the far left, with a status word beside it.

| Status | Meaning |
|---|---|
| **LIVE** | The robot is sending data, packets are recent, and a camera frame has arrived. |
| **DEGRADED** | A connection exists, but the camera is missing, packets have gone quiet for more than about two seconds, or the stream is incomplete. WORLD, STACK, and STATE can still fill while CAMERA stays empty. |
| **DISCONNECTED** | No handshake and no recent packets. WORLD shows *No Viz stream — not connected. Use Connect.* |

Status is always written as a word as well as a color. Do not rely on the pip alone.

### Robot IPv4 field

Click the field (placeholder **robot IPv4**) and type the robot’s address on your network, for example `192.168.50.155`. Only digits and dots are accepted, up to 15 characters.

While the field is focused, a blinking caret shows where the next digit will go, and the pointer becomes an I-beam over the field. The field also draws a blue focus ring.

If you have connected to robots before, a small triangle appears at the right of the field. While the field is focused, a list of those **recent addresses** (most recent first, up to eight) opens under it. Click a row to fill the field. **Up** / **Down** move a highlight in the list; **Enter** uses the highlighted address and Connects.

The last address you used with Connect is filled in automatically the next time you open VizManager (unless you started with a robot address already set). Recent addresses are remembered on this computer.

Click the field again to edit. Press **Enter** to connect. Press **Esc** to leave the field without connecting (the list closes with it).

### Host IPv4 field

This second field appears only when this computer has more than one usable network address, or none. Placeholder: **host IPv4**.

Type the address **the robot can ping** — the ordinary LAN address of this PC, not a VPN, Hyper-V, or WSL address. Press **H** to cycle through the addresses VizManager found. Candidates are also listed in the log strip when the field is shown.

While the field is focused, a blinking caret and a blue focus ring match the robot field. This field does not keep a recent-address list; **H** is the way to step through candidates.

If the field is hidden, VizManager already chose the only usable address.

### Packet rate

`N pps` is packets received in the last second. When rendering is paused it reads `N pps  PAUSED` in a warning color.

### Overlays

Muted label **Overlays**, to the left of Disconnect. Opens or closes the overlay panel on the WORLD view. It is not a second Connect button. Same action as **O**.

### Disconnect

Appears only after a connection has been established (not while **Connecting…** is showing). Click it to stop talking to the robot as a UI and to turn the robot’s Viz camera mode off. The window stays open.

### Connect

The primary action, at the far right.

| Label | Meaning |
|---|---|
| **Connect** | Idle. Click to start (or press **Enter** while an address field is focused). |
| **Connecting…** | In progress. The button is disabled until the robot registers or about **8 seconds** pass. |

Connect first stops any existing session, then starts a new one with the addresses currently in the fields.

### Connection error banner

If Connect fails, a red-bordered message appears under the robot address field. Typical causes are a closed port on the robot or a blocked inbound port on this PC. Press **Esc** to dismiss the banner (it will not reappear for that same timed-out attempt). The same text is also shown in the log strip.

---

## CAMERA Pane

The left pane shows the robot’s camera image, letterboxed so the picture keeps its shape. Until a frame arrives, the pane reads:

**No ImageChunk (enable VisionMode::Viz)**

WORLD, STACK, and STATE can already be live while CAMERA is still blank. That is expected: the camera feed is a separate switch on the robot (see *Turn on the camera picture* below).

When a picture is present, the robot may also draw boxes, lines, ovals, and labels on it. Timestamp, exposure, and white-balance text can appear in the corners. All of those marks can be hidden with **Protocol overlays** in the overlay panel.

### Splitter

- Drag the CAMERA \| WORLD edge left or right. The camera pane stays at least 320 pixels wide; WORLD also stays at least 320 pixels.
- Double-click the splitter to restore the default camera width (640 pixels).
- The cursor becomes a left-right resize arrow while over the seam.

---

## WORLD Pane

WORLD is the center pane. Three tabs sit on its top edge:

| Tab | Key | What you see |
|---|---|---|
| **3D** | **1** | Perspective wire drawing: robot body / head / lift, cubes, charger, paths, ground grid, and a red / green / blue axis triad at the origin |
| **2D** | **2** | Top-down plan: the robot as a triangle, objects as outlines, paths, and a grid |
| **Map** | **3** | Occupancy tiles from the robot’s memory map (1 millimetre = 1 pixel), plus the robot triangle |

Click a tab or press **1**, **2**, or **3** (including the numeric keypad).

### Empty messages

| Message | When |
|---|---|
| *No Viz stream — not connected. Use Connect.* | Status is DISCONNECTED and no robot pose has arrived |
| *No Viz stream — waiting for packets (ANKI_DEV_CHEATS).* | A handshake happened but no drawing data is arriving |
| *No MemoryMap tiles* / *Open WebViz NavMap to activate.* / *Once tiles activate press 'F' to centre on robot* | Map tab with no tiles yet |

### 3D view

- **Left-drag** to orbit (look around the look-at point). After you release, the view coasts briefly and then slows to a stop.
- **Right-drag**, **middle-drag**, or **Shift + left-drag** to pan.
- **Scroll wheel** (pointer over WORLD) to zoom. Clamped so you cannot zoom through the scene or infinitely far away.
- **F** frames the robot (look-at moves to the robot).

### 2D view

By default the view **follows** the robot so it stays centred.

- **Drag** to pan. Follow turns off.
- **Scroll wheel** to zoom (20–800 pixels per metre).
- **F** centres on the robot and turns follow back on.

### Map view

- **Drag** to pan the tile field.
- There is **no** scroll-wheel zoom on Map.
- **F** centres the map on the robot. If there is no robot pose, pan returns to the origin.

### Overlay panel

A floating **OVERLAYS** panel sits at the top-right of the WORLD view (not a separate layout pane). Title hint: **Esc / O**.

Open it with **O** or by clicking **Overlays** in the chrome bar. Close it with **Esc**, **O** again, **Overlays** again, or by clicking on WORLD outside the panel.

Every box defaults **on**. Changes last only for this session; they are not saved.

| Section | Checkbox | Effect |
|---|---|---|
| STATE | **Cliffs** | Show or hide the cliff-sensor line in STATE |
| STATE | **White** | Show or hide the white-detection line in STATE |
| STATE | **ToF** | Show or hide the time-of-flight distance line in STATE |
| STATE | **Path segment** | Show or hide the PathSeg line in STATE |
| WORLD | **Cliff sensors** | Draw four small squares at the robot’s cliff sensors (green = clear, red = cliff) |
| WORLD | **ToF ray** | Draw the forward distance ray (green = valid range, yellow = other status; hidden when there is no update) |
| WORLD | **Active path** | Highlight the path segment the robot currently reports |
| CAMERA | **Protocol overlays** | Show or hide boxes, lines, ovals, labels, timestamp, and exposure / white-balance text on the camera picture |

Click a row to toggle it. While the panel is open, **Up** / **Down** move the highlight; **Space** or **Enter** toggles the highlighted row. The scroll wheel is ignored while the pointer is over the panel.

---

## STACK Pane

STACK lists the robot’s current **behavior stack** — the nested activities the robot is running.

- Each line is one behavior name, as sent by the robot.
- The first line is the **bottom** of the stack (the oldest / outermost behavior). Do not mentally reverse the list.
- Until the first update arrives: **No BehaviorStackDebug yet**.

This pane is read-only. There is no click or scroll control.

---

## STATE Pane

STATE is a live sensor and pose readout. Until the first update: **No RobotStateMessage yet**. Extra text labels from the robot, if any, appear after the numbered block.

Some lines use color as a hint (the text is still readable without it):

- Cliff line: green when no cliff is detected, red when any cliff flag is set.
- Distance (ToF) line: green when range is valid, yellow otherwise.
- Off-treads line: green when OnTreads, red for any other posture.
- White line: full brightness when white is detected, muted when not.

### Lines (when the matching overlay is on)

| Line | Contents |
|---|---|
| Pose | X, Y, heading angle, pose frame id, origin id |
| Head / Lift | Head angle in degrees; lift height in millimetres |
| Pitch | Body pitch and IMU-plus-head pitch |
| Roll | Body roll |
| Acc | Accelerometer (mm/s²) and IMU temperature |
| Gyro | Gyroscope (deg/s) |
| Cliff | Raw readings and thresholds for FL, FR, BL, BR |
| Dist | Time-of-flight distance (mm), signal strength, ambient, range status |
| Speed | Left and right wheel speed (mm/s) |
| OffTreadsState | Current posture (OnTreads, InAir, OnBack, OnLeftSide, OnRightSide, OnFace, Falling) and, if different, the next confirmed state |
| Touch | Backpack touch-sensor raw value |
| Batt | Battery volts and temperature. `H` = overheated, `D` = disconnected |
| Anim | Current animation name and tag; procedural face keyframe count |
| Locked / InUse | Animation tracks: **L** lift, **H** head, **B** body |
| Video / Proc | Camera and image-processing rates in hertz |
| Status | Flags that are on, including CARRY, PAP (pick-and-place), PICKUP, HELD, FALL, CHARGING, ON_CHARGER, PWR_BTN, CALM, PATH, LIFTING, HEADING, MOVING |
| White | Front-left, front-right, back-left, back-right white-surface flags |
| PathSeg | Current path-segment index, or `-` if none |

If the robot sends a docking-error signal, an extra line appears at the bottom of STATE, of the form `ErrSig x:… y:… z:… a:…`.

Cliffs, White, ToF, and Path segment can be hidden from the overlay panel without affecting WORLD drawings (those have their own WORLD checkboxes).

---

## Log Strip

The bottom strip is always visible and is not expandable. It shows, in order:

1. Packet rate, total packets, and handshake count (`N pkt/s   packets=… handshakes=…`).
2. Up to four vision-schedule names from the robot, if any.
3. The last error or connection-failure text, in red.

---

## Keyboard Shortcuts

Shortcuts below apply when an address field is **not** focused, except as noted.

### Connection and chrome

| Key | Action |
|---|---|
| **Enter** | While an address field is focused: leave the field and Connect. If a recent robot address is highlighted, that address is used |
| **Esc** | If the overlay panel is open, close it. Else if an address field is focused, unfocus it (and close the recent list). Else dismiss the connection error banner |
| **H** | When the host IPv4 field is shown: cycle to the next candidate address |
| **O** | Open or close the overlay panel |
| **Up** / **Down** | While the robot IPv4 field is focused and recents are listed: move the highlight |

### WORLD tabs and camera

| Key | Action |
|---|---|
| **1** | WORLD tab **3D** |
| **2** | WORLD tab **2D** |
| **3** | WORLD tab **Map** |
| **F** | Frame / centre on the robot (3D look-at, 2D follow on, Map pan) |
| **Space** | If the overlay panel is open, toggle the highlighted checkbox. Otherwise pause or resume drawing |

### Overlay panel (only while open)

| Key | Action |
|---|---|
| **Up** / **Down** | Move the highlight |
| **Space** or **Enter** | Toggle the highlighted checkbox |
| **Esc** or **O** | Close the panel |

Numeric keypad **1** / **2** / **3** match the tab keys. Backspace deletes in an address field. Those are the only keys VizManager defines.

---

## Mouse Actions

| Action | Where | Result |
|---|---|---|
| Left-click | **Connect** | Start connecting (ignored while Connecting…) |
| Left-click | **Disconnect** | Drop the UI session |
| Left-click | **Overlays** | Toggle the overlay panel |
| Left-click | Address field | Focus for typing (robot field also opens recents if any) |
| Left-click | Recent-address row | Fill the robot IPv4 field with that address |
| Drag | CAMERA \| WORLD splitter | Resize CAMERA |
| Double-click | Splitter | Restore default CAMERA width |
| Left-click | WORLD tab | Switch 3D / 2D / Map |
| Left-drag | 3D WORLD | Orbit; view coasts after release |
| Right-, middle-, or Shift+left-drag | 3D WORLD | Pan |
| Scroll wheel | 3D or 2D WORLD | Zoom |
| Drag | 2D or Map WORLD | Pan (2D also turns off follow) |
| Left-click | Overlay checkbox | Toggle that overlay |
| Left-click | WORLD outside the overlay panel | Close the panel |

---

## Working with the Software

### Connect to a robot

1. Confirm the robot and this computer are on the same local network.
2. Click the **robot IPv4** field and type the robot’s address, or click a recent address in the list if one appears.
3. If a **host IPv4** field is visible, choose the address the robot can ping (use **H** to cycle, or type it).
4. Click **Connect**, or press **Enter** while an address field is focused.
5. Wait until the button leaves **Connecting…**.
6. Success: status becomes **LIVE** or **DEGRADED**, `pps` is greater than 0, and STACK, STATE, and WORLD begin to fill.

**DEGRADED** with a filling WORLD is a successful connection. An empty CAMERA is a separate step, not a failed Connect.

### Turn on the camera picture

After a successful Connect, VizManager asks the robot to enable its Viz camera mode. If that succeeds, CAMERA shows JPEG frames.

If CAMERA stays on **No ImageChunk (enable VisionMode::Viz)** and a red error appears:

1. Open the robot’s on-device console page in a web browser: `http://ROBOT_IP:8888/consolevars` (replace `ROBOT_IP` with the same address you typed in VizManager).
2. Find **Vision.General.VisionModes**.
3. Turn **Viz** on.

The camera mode does not survive a restart of the robot’s engine process. Connect again after a restart, or repeat the console-page step.

Disconnect, or closing VizManager, turns Viz camera mode off.

### Watch freeplay in WORLD and STACK

1. Connect until WORLD is drawing.
2. Leave the **3D** tab (key **1**) to see the robot body, cubes, charger, and paths in perspective.
3. Switch to **2D** (key **2**) for a top-down plan that follows the robot.
4. Watch **STACK** for which behavior is running (first line is the stack bottom).
5. Watch **STATE** for motion flags (`MOVING`, `PATH`, `CARRY`, and so on) and the current animation name.

### Inspect cliffs, distance, and the driven path

1. Press **O** to open **OVERLAYS**.
2. Leave **Cliff sensors**, **ToF ray**, and **Active path** on in the WORLD section.
3. In 2D or 3D, confirm four squares at the robot’s corners (red = that cliff triggered) and a ray in front of the robot.
4. When the robot is following a path, the current segment is drawn in the accent color.
5. Matching lines in STATE (**Cliffs**, **Dist**, **PathSeg**) can be hidden independently under the STATE section of the same panel.

The path-segment index in STATE can disagree with the highlighted drawing when the robot is doing an in-place turn. The drawing does not receive those turns.

### Use the Map tab

1. Click **Map** or press **3**.
2. If the pane says **No MemoryMap tiles**, open the robot’s NavMap view in WebViz so the robot starts sending tiles, then return to VizManager.
3. Press **F** once tiles and a robot pose are present, to centre on the robot.
4. Drag to pan. There is no wheel zoom on this tab.

### Pause the picture without dropping the robot

1. Press **Space** (overlay panel must be closed).
2. CAMERA and WORLD freeze on the last frame. The chrome shows **PAUSED**.
3. The connection stays up; the robot is still being kept alive as a UI.
4. Press **Space** again to resume.

### Disconnect without quitting

1. Click **Disconnect** (visible only after a session exists).
2. Status returns toward **DISCONNECTED** as packets stop.
3. The Viz camera mode on the robot is turned off.
4. The window remains open so you can edit the address and Connect again.

### Quit

Close the VizManager window (window close control), or close the companion console window. Either one ends the program and turns Viz camera mode off if it was on.

---

## Tips for New Users

- **Connect success is WORLD and STACK filling, not CAMERA.** An empty camera with **DEGRADED** is common until Viz camera mode is on.
- **Overlays is not Connect.** It only opens the checkbox panel.
- **Host IPv4 must be pingable from the robot.** If this PC has several addresses, the wrong one (VPN, virtual switch, WSL) is the usual Connect failure.
- **Overlay choices reset when you quit.** They are not stored.
- **2D follow stops as soon as you drag.** Press **F** to snap back to the robot and follow again.
- **Space has two jobs.** With the overlay panel open it toggles a checkbox; with the panel closed it pauses drawing.
- **Esc is layered.** It closes the overlay panel first, then unfocuses an address field, then hides the error banner. It does not quit.
- **The splitter only resizes CAMERA and WORLD.** STACK and STATE keep a fixed width, wide enough for the longer sensor lines.
- **Recent robot addresses are remembered on this computer.** They are not shared with other PCs. Overlay choices still reset when you quit.
- **Map has no zoom.** Pan and **F** are the only navigation.
- **PathSeg versus the drawn path.** In-place turns on the robot are not drawn, so the highlighted segment can look “ahead” or “behind” the wheels.

---

## Troubleshooting

All of the following are operator checks. They do not require rebuilding the program.

### Connect stays on Connecting… then shows a red banner

The banner tells you the robot did not register this computer as a UI. Work top to bottom:

1. Confirm the robot IPv4 is correct and the robot is on.
2. If the host IPv4 field is shown, pick an address the robot can ping (not VPN / Hyper-V / WSL). From the robot, ping that address.
3. On **this Windows PC**, allow inbound UDP ports **5252** and **5200** for VizManager. If Windows Defender asked, choose Allow. An administrator PowerShell command the program itself cites:

   `New-NetFirewallRule -DisplayName 'Vector Viz' -Direction Inbound -Protocol UDP -LocalPort 5252,5200 -Action Allow`

4. On the **robot**, allow this PC to register (until the robot reboots). Use the host IPv4 from step 2:

   `iptables -I INPUT -p udp --dport 5103 -s YOUR_LAN_IP -j ACCEPT`

   Do **not** open port 5252 on the robot. The picture stream comes **to this PC**, not to the robot.

5. Press **Esc** to hide the banner, correct the address if needed, and click **Connect** again.

### Status is DISCONNECTED and WORLD says not connected

You have not completed Connect, or the session was disconnected. Enter the robot IPv4 and click **Connect**.

### Status is DEGRADED, WORLD is drawing, CAMERA is empty

Connect worked. The camera feed is off or failed to enable.

1. Read the red error under the address field or in the log strip. If it mentions VisionMode or `:8888`, the robot’s web console was not reachable.
2. Follow *Turn on the camera picture* above.
3. After an engine restart on the robot, enable Viz again (Connect, or the console page).

### WORLD says waiting for packets (ANKI_DEV_CHEATS)

The handshake happened but the robot is not sending drawing data. The robot must be running with debug visualization enabled. This is a robot setting, not a VizManager control.

### Map says No MemoryMap tiles

The Map tab only fills after the robot sends occupancy tiles. Open WebViz **NavMap** on the robot so tiles start, then press **F** in VizManager.

### pps is 0 after a working session

Packets have stopped. Check that the robot is still on, that this PC did not change networks, and that **Disconnect** was not clicked. Click **Connect** again.

### Could not bind UDP …

Another program is already using port 5252 or 5200 on this PC, or the program is not allowed to listen. Close a second VizManager, then retry. If the Windows firewall blocked the listen, allow VizManager and Connect again.

### Enter a robot IPv4 / Enter a host IPv4

The field is empty or not four numbers 0–255 separated by dots. Correct the text and Connect again.

### Overlay checkboxes seem to do nothing

Confirm you are looking at the matching pane: STATE checkboxes only hide STATE lines; WORLD checkboxes only change 2D / 3D / Map drawings; **Protocol overlays** only changes CAMERA. All default on.

### Drawing is frozen but pps still moves

**PAUSED** is on in the chrome. Press **Space** (with the overlay panel closed) to resume.

### 3D view keeps spinning after you let go

That is orbit coast. It slows on its own. A small drag in the opposite direction stops it sooner. Right-drag pans without adding spin.

---

## Glossary

| Term | Meaning in this window |
|---|---|
| **Behavior stack** | Nested list of behaviors the robot is running. STACK draws it with the bottom (outer) behavior on the first line. |
| **Cliff sensors** | Four downward sensors (front-left, front-right, back-left, back-right) that detect a drop-off. |
| **Handshake** | First successful contact that starts the debug stream. Counted in the log strip. |
| **Host IPv4** | This computer’s address as the robot should see it. |
| **LIVE / DEGRADED / DISCONNECTED** | Connection quality. See *Status pip and word*. |
| **Memory map / Map tab** | Occupancy tiles of the floor (explored vs unknown), not the same drawing as 2D. |
| **Overlay** | Optional drawing or STATE line (cliffs, ToF ray, path highlight, camera marks). |
| **pps / pkt/s** | Packets received in the last second. |
| **ToF** | Time-of-flight distance sensor on the robot’s face; drawn as a ray and listed as Dist in STATE. |
| **Viz camera mode** | Robot setting that sends the CAMERA JPEG stream. VizManager tries to turn it on after Connect. |
| **WebViz** | The robot’s browser debug pages (including NavMap). Separate from this desktop window. |
| **WORLD** | The large centre pane: 3D, 2D, or Map. |
