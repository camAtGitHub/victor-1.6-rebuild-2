"""Engine console var VisionMode::Viz via HTTP GET on :8888.

Copy URL from tools/vizmanager/README.md and tools/ai/playOnboarding.py
(stdlib urllib, not requests). Handler: webService.cpp ConsoleVarSet.
Key is id "Viz" only — not Vision.General.VisionModes.Viz.
"""

from __future__ import annotations

import urllib.error
import urllib.parse
import urllib.request

CONSOLE_PORT = 8888
CONSOLE_KEY = "Viz"
# Engine may wait 10s on its main thread (webService.cpp kTimeoutDuration_s).
ENABLE_TIMEOUT = 12.0
# Window close must not hang if :8888 is down.
DISABLE_TIMEOUT = 2.0

_FAIL_SNIPPETS = (
    "variable not found",
    "timed out",
    "error setting",
)


def viz_console_url(robot_ip, enable):
    """GET http://{robot}:8888/consolevarset?key=Viz&value=true|false."""
    query = urllib.parse.urlencode(
        {"key": CONSOLE_KEY, "value": "true" if enable else "false"}
    )
    return "http://{0}:{1}/consolevarset?{2}".format(
        robot_ip, CONSOLE_PORT, query
    )


def set_viz_mode(robot_ip, enable, timeout=None, urlopen=None):
    """Set console var Viz. Return None on success, or an error string.

    Never raises into the pygame loop. No Basic auth (engine has none).
    """
    if not robot_ip:
        return "no robot IP"
    if timeout is None:
        timeout = ENABLE_TIMEOUT if enable else DISABLE_TIMEOUT
    if urlopen is None:
        urlopen = urllib.request.urlopen
    url = viz_console_url(robot_ip, enable)
    try:
        with urlopen(url, timeout=timeout) as resp:
            status = getattr(resp, "status", None)
            if status is None:
                status = resp.getcode()
            body = resp.read()
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError) as exc:
        return str(exc.reason) if getattr(exc, "reason", None) else str(exc)
    except Exception as exc:
        return str(exc)
    if isinstance(body, (bytes, bytearray)):
        text = body.decode("utf-8", "replace")
    else:
        text = str(body)
    if int(status) != 200:
        return "HTTP {0} {1}".format(status, text.strip())
    lower = text.lower()
    for snippet in _FAIL_SNIPPETS:
        if snippet in lower:
            return text.strip()
    return None
