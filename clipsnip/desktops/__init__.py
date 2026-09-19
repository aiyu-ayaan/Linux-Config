"""Per-desktop shortcut backends. Every module in this folder (except common) is auto-discovered and must define:

    NAME     short id, e.g. "gnome"
    STATUS   "tested" | "untested"
    matches(de: str) -> bool        de = lowercased XDG_CURRENT_DESKTOP (may hold several, e.g. "ubuntu:gnome")
    apply(sc)  /  remove(sc)        sc = the "shortcuts" dict from config.json

To support a new desktop, copy generic.py to <name>.py and fill those in. "generic" is always the last fallback.
"""
import importlib, pkgutil


def _load():
    mods = []
    for m in pkgutil.iter_modules(__path__):
        if m.name != "common":
            mods.append(importlib.import_module(f"{__name__}.{m.name}"))
    return sorted(mods, key=lambda x: (x.NAME == "generic", x.NAME))


def available():
    return _load()


def pick(de, forced=None):
    for m in _load():
        if forced and m.NAME == forced:
            return m
        if not forced and m.matches(de):
            return m
    raise SystemExit(f"unknown desktop backend: {forced}")
