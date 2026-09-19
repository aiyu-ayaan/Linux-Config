"""Cinnamon (muffin + cinnamon-settings-daemon). Only relevant if Cinnamon is still installed."""
import glob
from .common import *

NAME, STATUS = "cinnamon", "tested"
K = "org.cinnamon.desktop.keybindings"
CK = "/org/cinnamon/desktop/keybindings/custom-keybindings/"
M = f"{K}.media-keys"
MEDIA = {"snip_area_clip": "area-screenshot-clip", "snip_full_clip": "screenshot-clip",
         "snip_window_clip": "window-screenshot-clip", "snip_area_file": "area-screenshot",
         "snip_full_file": "screenshot", "snip_window_file": "window-screenshot"}


def matches(de):
    return "cinnamon" in de and schema_exists(K)


def _free_applet_conflicts(accels):
    """Applets (e.g. Sound: Shift+Super+S) own hotkeys that shadow ours: blank any that match."""
    ours, changed = {norm(a) for a in accels}, []
    for path in glob.glob(os.path.join(HOME, ".config/cinnamon/spices/*/*.json")):
        try:
            d = json.load(open(path))
        except Exception:
            continue
        dirty = False
        for k, v in d.items():
            if isinstance(v, dict) and v.get("type") == "keybinding" and isinstance(v.get("value"), str) \
                    and v["value"] and norm(v["value"]) in ours:
                v["value"] = ""; dirty = True; changed.append(f"{os.path.basename(os.path.dirname(path))}:{k}")
        if dirty:
            json.dump(d, open(path, "w"), indent=4)
    if changed:
        print("Disabled conflicting applet hotkeys:", ", ".join(changed))
        print("  -> log out/in (or Alt+F2, r, Enter) so Cinnamon releases them.")


def remove(sc):
    keep = [i for i in gs_list(K, "custom-list") if not is_ours(i)]
    for old in gs_list(K, "custom-list"):
        if is_ours(old):
            gs("reset-recursively", f"{K}.custom-keybinding:{CK}{old}/")
    gs("set", K, "custom-list", str(keep))
    for k in MEDIA.values():
        gs("reset", M, k)


def apply(sc):
    """<Super> combos are ignored by Cinnamon's media-keys handler, so they become normal custom keybindings."""
    keep = [i for i in gs_list(K, "custom-list") if not is_ours(i)]
    remove(sc)
    _free_applet_conflicts([a for v in sc.values() for a in v])
    custom = []
    for cid, name, cmd, accels in actions(sc):
        if cid == ID:
            custom.append((cid, name, cmd, accels))
            continue
        key = next(k for k, v in SNIPS.items() if f"clipsnip-{v[0]}" == cid)
        plain = [a for a in accels if "<Super>" not in a]
        gs("set", M, MEDIA[key], str(plain), check=True)
        sup = [a for a in accels if "<Super>" in a]
        if sup:
            custom.append((cid, name, cmd, sup))
    for cid, name, cmd, binding in custom:
        P = f"{K}.custom-keybinding:{CK}{cid}/"
        gs("set", P, "name", name); gs("set", P, "command", cmd); gs("set", P, "binding", str(binding))
    gs("set", K, "custom-list", str(keep))                      # force Cinnamon to re-read every binding
    import time; time.sleep(0.5)
    gs("set", K, "custom-list", str(keep + [c[0] for c in custom]))
