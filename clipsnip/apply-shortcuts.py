#!/usr/bin/env python3
"""Apply (or --remove) the clipsnip shortcuts from ~/.config/clipsnip/config.json for the current desktop.

    apply-shortcuts.py                  detect the desktop and apply
    apply-shortcuts.py --remove         remove what was applied
    apply-shortcuts.py --desktop gnome  force a backend
    apply-shortcuts.py --list           show backends and which one is detected
Backends live in desktops/ — add a file there to support another desktop (see desktops/__init__.py).
"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from desktops import available, pick
from desktops.common import shortcuts


def main():
    args = sys.argv[1:]
    de = os.environ.get("XDG_CURRENT_DESKTOP", "").lower()
    forced = args[args.index("--desktop") + 1] if "--desktop" in args else None
    if "--list" in args:
        chosen = pick(de, forced)
        for m in available():
            print(f"{'*' if m is chosen else ' '} {m.NAME:10} {m.STATUS}")
        print(f"detected desktop: '{de or 'unknown'}'")
        return
    backend, remove = pick(de, forced), "--remove" in args
    sc = shortcuts()
    (backend.remove if remove else backend.apply)(sc)
    print(f"[{backend.NAME}] shortcuts", "removed." if remove else "applied.")


main()
