"""Helpers shared by every desktop backend."""
import ast, json, os, re, subprocess, sys

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME = os.path.expanduser("~")
CONF = os.path.join(HOME, ".config/clipsnip/config.json")
DEFAULT = os.path.join(KIT, "config.default.json")
ID, OLD_IDS = "clipsnip-clipboard", ["clipboard-history"]
POPUP_CMD = f"env PATH={HOME}/.local/bin:/usr/bin:/bin python3 {KIT}/clipboard-history.py"

# config key -> (id suffix, label, snip.sh mode, extra args). Screenshot actions run snip.sh.
SNIPS = {
    "snip_area_clip":   ("snip-area-clip",   "Snip area to clipboard",   "area",   ""),
    "snip_full_clip":   ("snip-full-clip",   "Snip screen to clipboard", "full",   ""),
    "snip_window_clip": ("snip-window-clip", "Snip window to clipboard", "window", ""),
    "snip_area_file":   ("snip-area-file",   "Snip area to file",        "area",   " --save"),
    "snip_full_file":   ("snip-full-file",   "Snip screen to file",      "full",   " --save"),
    "snip_window_file": ("snip-window-file", "Snip window to file",      "window", " --save"),
}


def snip_cmd(key):
    _, _, mode, extra = SNIPS[key]
    return f"{KIT}/snip.sh {mode}{extra}"


def actions(sc):
    """Every shortcut as (id, label, command, [accelerators]) — for backends that just bind commands."""
    out = [(ID, "Clipboard history", POPUP_CMD, sc["clipboard_popup"])]
    for key, (suffix, label, _, _) in SNIPS.items():
        out.append((f"clipsnip-{suffix}", label, snip_cmd(key), sc[key]))
    return out


def is_ours(i):
    return i == ID or i in OLD_IDS or i.startswith("clipsnip-")


def shortcuts():
    for p in (CONF, DEFAULT):
        try:
            return json.load(open(p))["shortcuts"]
        except Exception:
            continue
    sys.exit("no config found")


def run(*cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, r.stdout.strip(), r.stderr.strip()


def gs(*a, check=False):
    code, out, err = run("gsettings", *a)
    if check and code:
        print("gsettings", *a, "->", err, file=sys.stderr)
    return out


def gs_list(schema, key):
    v = gs("get", schema, key).replace("@as ", "")
    try:
        return list(ast.literal_eval(v))
    except Exception:
        return []


def schema_exists(name):
    return name in gs("list-schemas").split()


def norm(accel):
    """Order-insensitive form of an accelerator: '<Shift><Super>s' == '<Super><Shift>s'."""
    mods = sorted(m.lower() for m in re.findall(r"<[^>]+>", accel))
    return "".join(mods) + re.sub(r"<[^>]+>", "", accel).lower()
