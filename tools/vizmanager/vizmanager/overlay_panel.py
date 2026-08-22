"""WORLD-satellite overlay panel.

Not a layout_rects pane. Drawn last, clipped to world_view. Keyboard: caller
maps O / Esc / Up / Down / Space / Enter onto toggle_open, close, move_focus,
toggle_index.
"""

from __future__ import annotations

from vizmanager import theme

PANEL_W = 240
CHECK_SIZE = 12
ROW_H = 32
TITLE_H = 28
SECTION_H = 22
FOCUS_W = 2
TITLE = "OVERLAYS"
TITLE_HINT = "Esc / O"

# (section header, ((OverlaySettings field, label), ...))
SECTIONS = (
    (
        "STATE",
        (
            ("cliff_hud", "Cliffs"),
            ("white_hud", "White"),
            ("tof_hud", "ToF"),
            ("path_seg_hud", "Path segment"),
        ),
    ),
    (
        "WORLD",
        (
            ("cliff_dots", "Cliff sensors"),
            ("tof_ray", "ToF ray"),
            ("path_highlight", "Active path"),
        ),
    ),
    (
        "CAMERA",
        (("camera_overlays", "Protocol overlays"),),
    ),
)

CHECKBOX_FIELDS = tuple(field for _sec, rows in SECTIONS for field, _label in rows)


def _pygame():
    try:
        import pygame
    except ImportError:
        return None
    return pygame


def _hit(rect, pos):
    x, y, w, h = rect
    return x <= pos[0] < x + w and y <= pos[1] < y + h


def panel_height():
    n_sections = len(SECTIONS)
    n_rows = len(CHECKBOX_FIELDS)
    return theme.PANEL_PAD * 2 + TITLE_H + n_sections * SECTION_H + n_rows * ROW_H


def panel_rect(world_view):
    """Top-right of WORLD view, clipped to world_view. Width 240px."""
    vx, vy, vw, vh = world_view
    pad = theme.PANEL_PAD
    w = min(PANEL_W, max(1, int(vw) - pad * 2))
    h = min(panel_height(), max(1, int(vh) - pad * 2))
    x = vx + max(pad, int(vw) - w - pad)
    y = vy + pad
    x = max(vx, min(x, vx + vw - 1))
    y = max(vy, min(y, vy + vh - 1))
    w = min(w, vx + vw - x)
    h = min(h, vy + vh - y)
    return (int(x), int(y), int(max(1, w)), int(max(1, h)))


def iter_rows(world_view):
    """Yield (field, label, rect, index) for checkbox rows. Hit height is ROW_H."""
    px, py, pw, _ph = panel_rect(world_view)
    pad = theme.PANEL_PAD
    y = py + pad + TITLE_H
    index = 0
    for _section, rows in SECTIONS:
        y += SECTION_H
        for field, label in rows:
            rect = (px, y, pw, ROW_H)
            yield field, label, rect, index
            y += ROW_H
            index += 1


def hit_panel(pos, world_view):
    return _hit(panel_rect(world_view), pos)


def hit_checkbox(pos, world_view):
    """Return OverlaySettings field name under pos, or None."""
    if not hit_panel(pos, world_view):
        return None
    for field, _label, rect, _index in iter_rows(world_view):
        if _hit(rect, pos):
            return field
    return None


def row_index_at(pos, world_view):
    if not hit_panel(pos, world_view):
        return None
    for _field, _label, rect, index in iter_rows(world_view):
        if _hit(rect, pos):
            return index
    return None


def toggle_field(settings, field):
    setattr(settings, field, not getattr(settings, field))
    return getattr(settings, field)


def toggle_index(settings, index):
    field = CHECKBOX_FIELDS[index]
    toggle_field(settings, field)
    return field


def toggle_open(settings):
    settings.panel_open = not settings.panel_open
    return settings.panel_open


def close_if_open(settings):
    if settings.panel_open:
        settings.panel_open = False
        return True
    return False


def move_focus(index, delta):
    n = len(CHECKBOX_FIELDS)
    return (index + delta) % n


def draw(screen, ui_font, label_font, settings, world_view, focus_index):
    """Paint the panel. No-op without pygame or when closed."""
    pg = _pygame()
    if pg is None or not settings.panel_open:
        return
    old_clip = screen.get_clip()
    screen.set_clip(pg.Rect(world_view))
    try:
        _draw_body(pg, screen, ui_font, label_font, settings, world_view, focus_index)
    finally:
        screen.set_clip(old_clip)


def _draw_body(pg, screen, ui_font, label_font, settings, world_view, focus_index):
    pad = theme.PANEL_PAD
    pr = pg.Rect(panel_rect(world_view))
    pg.draw.rect(screen, theme.BG_PANEL, pr)
    pg.draw.rect(screen, theme.BORDER, pr, 1)

    title = ui_font.render(TITLE, True, theme.TEXT)
    hint = ui_font.render(TITLE_HINT, True, theme.TEXT_MUTED)
    title_y = pr.y + pad + (TITLE_H - title.get_height()) // 2
    screen.blit(title, (pr.x + pad, title_y))
    screen.blit(
        hint,
        (pr.x + pr.w - pad - hint.get_width(), pr.y + pad + (TITLE_H - hint.get_height()) // 2),
    )

    y = pr.y + pad + TITLE_H
    row_i = 0
    for section, rows in SECTIONS:
        hdr = label_font.render(section, True, theme.TEXT_MUTED)
        screen.blit(
            hdr,
            (pr.x + pad, y + (SECTION_H - hdr.get_height()) // 2),
        )
        y += SECTION_H
        for field, label in rows:
            row = pg.Rect(pr.x, y, pr.w, ROW_H)
            if row_i == focus_index:
                pg.draw.rect(screen, theme.ACCENT, row, FOCUS_W)
            on = bool(getattr(settings, field))
            cy = y + (ROW_H - CHECK_SIZE) // 2
            box = pg.Rect(pr.x + pad, cy, CHECK_SIZE, CHECK_SIZE)
            if on:
                pg.draw.rect(screen, theme.LIVE, box)
            pg.draw.rect(screen, theme.BORDER, box, 1)
            lab = label_font.render(label, True, theme.TEXT)
            screen.blit(
                lab,
                (
                    box.x + CHECK_SIZE + pad,
                    y + (ROW_H - lab.get_height()) // 2,
                ),
            )
            y += ROW_H
            row_i += 1
