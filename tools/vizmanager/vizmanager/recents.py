"""Recent robot IPv4s for the chrome combo field.

Stored next to the user config dir (not next to the exe). Override the file
with VIZMANAGER_RECENTS for tests.
"""

from __future__ import annotations

import json
import os

MAX_RECENT = 8


def recents_file():
    override = os.environ.get("VIZMANAGER_RECENTS")
    if override:
        return override
    if os.name == "nt":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        return os.path.join(base, "VizManager", "recent_robots.json")
    xdg = os.environ.get("XDG_CONFIG_HOME") or os.path.join(
        os.path.expanduser("~"), ".config"
    )
    return os.path.join(xdg, "vizmanager", "recent_robots.json")


def _is_ipv4(text):
    parts = text.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(0 <= int(p) <= 255 for p in parts)
    except ValueError:
        return False


def load_recent_robots(path=None):
    path = path or recents_file()
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return []
    robots = data.get("robots") if isinstance(data, dict) else data
    if not isinstance(robots, list):
        return []
    out = []
    for item in robots:
        if not isinstance(item, str):
            continue
        ip = item.strip()
        if _is_ipv4(ip) and ip not in out:
            out.append(ip)
        if len(out) >= MAX_RECENT:
            break
    return out


def save_recent_robots(ips, path=None):
    path = path or recents_file()
    parent = os.path.dirname(path)
    try:
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump({"robots": list(ips)[:MAX_RECENT]}, handle)
    except OSError:
        return False
    return True


def remember_recent_robot(ip, current):
    ip = (ip or "").strip()
    if not _is_ipv4(ip):
        return list(current)
    rest = [item for item in current if item != ip]
    return [ip] + rest[: MAX_RECENT - 1]
