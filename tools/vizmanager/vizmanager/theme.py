# tools/vizmanager/vizmanager/theme.py  — source of truth; no hex in other files
BG_VOID = (0x0B, 0x0D, 0x10)
BG_BASE = (0x12, 0x15, 0x1A)
BG_PANEL = (0x16, 0x1B, 0x22)
BG_ELEVATED = (0x1A, 0x1F, 0x27)
BORDER = (0x2A, 0x33, 0x40)
TEXT = (0xE8, 0xED, 0xF2)
TEXT_MUTED = (0x8B, 0x96, 0xA5)
ACCENT = (0x3D, 0x9C, 0xF0)
ACCENT_DIM = (0x1B, 0x4F, 0x7A)
LIVE = (0x3D, 0xDC, 0x97)
WARN = (0xE6, 0xB4, 0x50)
DANGER = (0xF0, 0x71, 0x78)
PATH = (0x5B, 0x8D, 0xEF)
GRID = (0x1E, 0x25, 0x30)
SPACE = (4, 8, 12, 16, 24)  # 4px scale
FONT_UI = "Fira Sans"
FONT_MONO = "Fira Code"
FONT_HUD_PX = 12
FONT_LABEL_PX = 11
FONT_CHROME_PX = 13
CONTROL_H = 28
CONNECT_H = 36
PANEL_PAD = 8
CHROME_H = 36
LOG_H_COLLAPSED = 72
MOTION_MS = 150


def rgb(token):
    """Return an (r, g, b) tuple from a theme token."""
    return token


def hex_str(token):
    """CSS hex derived from a theme token. Do not hardcode hex elsewhere."""
    r, g, b = token
    return "#{0:02x}{1:02x}{2:02x}".format(r, g, b)
