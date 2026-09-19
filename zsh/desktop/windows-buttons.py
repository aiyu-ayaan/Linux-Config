#!/usr/bin/env python3
"""Replace WhiteSur's macOS-style traffic-light buttons with Windows-style ones
(minimize –, maximize □, restore ❐, close ✕ with red hover). Run after installing WhiteSur."""
import cairo, os, sys

THEME = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/.themes/WhiteSur-Dark")

def draw(kind, state, dark, scale):
    S = 16 * scale
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, S, S)
    c = cairo.Context(surf); c.scale(scale, scale)
    fg = (0.90, 0.90, 0.90) if dark else (0.19, 0.19, 0.19)
    hov = (1, 1, 1, .14) if dark else (0, 0, 0, .10)
    act = (1, 1, 1, .24) if dark else (0, 0, 0, .18)
    alpha = 1.0
    bg = None
    if "backdrop" in state: alpha = .45
    if "active" in state: bg = (0.94, .44, .48, 1) if kind == "close" else act
    elif "hover" in state: bg = (0.91, .07, .14, 1) if kind == "close" else hov
    if bg:
        c.set_source_rgba(*bg[:3], bg[3] * (alpha if "backdrop" in state else 1))
        r = 3; x = y = .5; w = h = 15
        c.new_sub_path()
        for cx, cy, a0 in ((x+w-r, y+r, -90), (x+w-r, y+h-r, 0), (x+r, y+h-r, 90), (x+r, y+r, 180)):
            c.arc(cx, cy, r, a0 * 3.14159 / 180, (a0 + 90) * 3.14159 / 180)
        c.close_path(); c.fill()
        if kind == "close": fg = (1, 1, 1)
    c.set_source_rgba(*fg, alpha); c.set_line_width(1.0)
    c.set_line_cap(cairo.LINE_CAP_SQUARE)
    if kind == "close":
        c.move_to(4.5, 4.5); c.line_to(11.5, 11.5); c.move_to(11.5, 4.5); c.line_to(4.5, 11.5); c.stroke()
    elif kind == "minimize":
        c.move_to(4, 8.5); c.line_to(12, 8.5); c.stroke()
    elif kind == "maximize":
        c.rectangle(4.5, 4.5, 7, 7); c.stroke()
    elif kind == "restore":
        c.rectangle(4.5, 6.5, 5, 5); c.stroke()
        c.move_to(6.5, 6.5); c.line_to(6.5, 4.5); c.line_to(11.5, 4.5); c.line_to(11.5, 9.5); c.line_to(9.5, 9.5); c.stroke()
    return surf

count = 0
for gtk in ("gtk-3.0", "gtk-4.0"):
    d = os.path.join(THEME, gtk, "windows-assets")
    if not os.path.isdir(d): continue
    for kind in ("close", "maximize", "minimize", "restore"):
        for state in ("", "-hover", "-active", "-backdrop", "-backdrop-hover", "-backdrop-active"):
            for dark in (True, False):
                for scale, sfx in ((1, ""), (2, "@2")):
                    name = f"titlebutton-{kind}{state}{'-dark' if dark else ''}{sfx}.png"
                    if os.path.exists(os.path.join(d, name)) or True:
                        draw(kind, state, dark, scale).write_to_png(os.path.join(d, name)); count += 1
print("wrote", count, "button images")
