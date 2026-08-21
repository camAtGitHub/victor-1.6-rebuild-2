VizManager is a Windows/Linux desktop client for Vector’s UDP Viz debug stream (not WebViz :8888). This PC is the UDP server on port 5252; the robot engine is the client.

What it does
• Listens for Viz packets (handshake ANKICONN, then CLAD MessageViz)
• With --robot, registers as a fake UI, sends stock RedirectViz, and keeps UI pings alive
• Reassembles JPEG ImageChunks and draws 2D/3D world meshes from the same stream
• One Connect button; inbound holes are on this host (UDP 5252 + 5200), not the robot

What it shows
• CAMERA — live JPEG + overlays (empty until VisionMode::Viz is on)
• WORLD — largest pane; tabs 3D / 2D / Map (robot, cubes, paths, nav)
• STACK — behavior stack (BehaviorStackDebug)
• STATE — pose, head/lift, battery, cliffs, animation
• Chrome — LIVE / DEGRADED / DISCONNECTED, robot IP, pkt/s, Connect

