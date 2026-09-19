"""GNOME Shell (mutter + gnome-settings-daemon)."""
from .common import *

NAME, STATUS = "gnome", "tested"
B = "org.gnome.settings-daemon.plugins.media-keys"
BASE = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/"
S = "org.gnome.shell.keybindings"


def matches(de):
    return "gnome" in de and schema_exists(B)


def _others():
    return [p for p in gs_list(B, "custom-keybindings") if not is_ours(p.rstrip("/").rsplit("/", 1)[-1])]


def _free(key, accel):
    """Drop one accelerator from a shell keybinding, keeping any others on it (e.g. Super+M)."""
    if schema_exists(S):
        left = [a for a in gs_list(S, key) if norm(a) != norm(accel)]
        gs("set", S, key, str(left))


def apply(sc):
    """Everything is a custom command (snip.sh). GNOME's own screenshot UI is not used: it always saves a file,
    whereas snip.sh copies to the clipboard only (files are saved just for the *_file shortcuts)."""
    remove(sc)
    ids = []
    for cid, name, cmd, accels in actions(sc):
        for n, accel in enumerate(accels):
            uid = cid if n == 0 else f"{cid}-{n + 1}"
            P = f"{B}.custom-keybinding:{BASE}{uid}/"
            gs("set", P, "name", name)
            gs("set", P, "command", cmd)
            gs("set", P, "binding", accel)
            ids.append(f"{BASE}{uid}/")
    gs("set", B, "custom-keybindings", str(_others() + ids))
    if schema_exists(S):
        for a in sc["clipboard_popup"]:
            _free("toggle-message-tray", a)  # GNOME binds Super+V to the notification list
        for key in ("show-screenshot-ui", "screenshot", "screenshot-window"):
            for accel in [a for k in SNIPS for a in sc[k]]:
                _free(key, accel)             # hand Print / Shift+Print etc. to snip.sh


def remove(sc):
    for old in gs_list(B, "custom-keybindings"):
        if is_ours(old.rstrip("/").rsplit("/", 1)[-1]):
            gs("reset-recursively", f"{B}.custom-keybinding:{old}")
    gs("set", B, "custom-keybindings", str(_others()))
    if schema_exists(S):
        for key in ("show-screenshot-ui", "screenshot", "screenshot-window"):
            gs("reset", S, key)               # back to GNOME defaults
