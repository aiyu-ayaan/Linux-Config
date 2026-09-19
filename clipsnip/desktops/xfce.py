"""Xfce (xfconf). Binds every action as a plain command shortcut."""
from .common import *

NAME, STATUS = "xfce", "untested"
CH = "xfce4-keyboard-shortcuts"


def matches(de):
    return "xfce" in de and run("which", "xfconf-query")[0] == 0


def _accel(a):
    return a.replace("<Control>", "<Primary>")


def _prop(a):
    return f"/commands/custom/{_accel(a)}"


def apply(sc):
    for _, _, cmd, accels in actions(sc):
        for a in accels:
            run("xfconf-query", "-c", CH, "-n", "-t", "string", "-p", _prop(a), "-s", cmd)


def remove(sc):
    for _, _, _, accels in actions(sc):
        for a in accels:
            run("xfconf-query", "-c", CH, "-r", "-p", _prop(a))
