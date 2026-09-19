"""Fallback for desktops without a backend: print what to bind by hand. Copy this file to add a new desktop."""
from .common import *

NAME, STATUS = "generic", "manual"


def matches(de):
    return True


def apply(sc):
    print(f"No automatic backend for this desktop. Bind these in your keyboard settings:")
    for _, label, cmd, accels in actions(sc):
        print(f"  {accels}  ->  {cmd}    # {label}")


def remove(sc):
    print("Generic backend: nothing was registered automatically, so nothing to remove.")
