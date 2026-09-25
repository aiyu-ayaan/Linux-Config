#!/usr/bin/env python3
"""Clipboard history for Linux/X11 (Windows-style Win+V).

  clipboard-history.py --daemon         run in background (records text + images)
  clipboard-history.py                  toggle the popup (bind to Super+V)
  clipboard-history.py --pause|--resume|--toggle-pause

Popup keys: type to search · ↑/↓ move · Enter paste · Alt+1-9 quick paste
            Ctrl+P pin/unpin · Delete remove · Esc clear search / close
Config: ~/.config/clipsnip/config.json ("clipboard" section). Data: ~/.local/share/clipsnip (private, 0600).
Needs python3-gi + GTK3. Auto-paste uses xdotool when present.
"""
import os
# GTK on a Wayland session cannot watch the clipboard from the background or position windows; XWayland can.
os.environ["GDK_BACKEND"] = "x11"
import ast, gi, sys, re, json, hashlib, time, shutil, subprocess

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import Gtk, Gdk, GdkX11, GLib, Gio, GdkPixbuf

APP_ID = "dev.clipsnip.History"
CONF = os.path.expanduser(os.environ.get("CLIPSNIP_CONFIG", "~/.config/clipsnip/config.json"))
DATA = os.path.expanduser("~/.local/share/clipsnip")
IMG_DIR = os.path.join(DATA, "img")
DB = os.path.join(DATA, "history.json")
PAUSE_FLAG = os.path.join(DATA, "paused")
TERMINALS = ("gnome-terminal", "xterm", "kitty", "alacritty", "tilix", "konsole", "xfce4-terminal",
             "terminator", "wezterm", "foot", "mate-terminal", "lxterminal", "st-256color")
PASSWORD_HINTS = {"x-kde-passwordmanagerhint"}

DEFAULTS = {"max_items": 50, "max_text_chars": 200000, "keep_images": True, "expire_hours": 1,
            "popup_width": 420, "popup_position": "bottom-right", "popup_margin": 16, "ignore_apps": [], "ignore_patterns": []}


def load_config():
    cfg = dict(DEFAULTS)
    try:
        with open(CONF) as f:
            cfg.update(json.load(f).get("clipboard", {}))
    except Exception:
        pass
    pats = []
    for p in cfg["ignore_patterns"]:
        try:
            pats.append(re.compile(p))
        except re.error:
            print("clipsnip: bad ignore pattern", p, file=sys.stderr)
    cfg["_patterns"] = pats
    cfg["ignore_apps"] = [a.lower() for a in cfg["ignore_apps"]]
    return cfg


CSS = b"""
window { background: transparent; }
.card { background: #1e1e2e; border: 1px solid #45475a; border-radius: 14px; }
.title { color: #cdd6f4; font-weight: bold; font-size: 11pt; }
.hint { color: #6c7086; font-size: 8pt; }
.flat { color: #a6adc8; background: transparent; border: none; box-shadow: none; padding: 2px 8px; min-height: 0; }
.flat:hover { background: #313244; color: #cdd6f4; }
.danger { color: #f38ba8; }
.banner { color: #1e1e2e; background: #f9e2af; border-radius: 6px; padding: 3px 8px; font-size: 9pt; }
entry { background: #181825; color: #cdd6f4; border: 1px solid #45475a; border-radius: 8px; padding: 6px 8px; min-height: 0; }
entry:focus { border-color: #89b4fa; }
list { background: transparent; }
row { background: #181825; border-radius: 8px; margin: 2px 0; padding: 2px; }
row:hover { background: #313244; }
row:selected { background: #313244; border-left: 3px solid #89b4fa; }
.pinnedrow { border-left: 3px solid #f9e2af; }
.item { color: #cdd6f4; }
.num { color: #6c7086; font-size: 8pt; }
.meta { color: #a6adc8; font-size: 8pt; }
.ago { color: #6c7086; font-size: 8pt; }
.pin { color: #6c7086; background: transparent; border: none; box-shadow: none; padding: 0 4px; min-height: 0; }
.pin:hover { color: #f9e2af; }
.pin.on { color: #f9e2af; }
.del { color: #6c7086; background: transparent; border: none; box-shadow: none; padding: 0 6px; min-height: 0; }
.del:hover { color: #f38ba8; }
.empty { color: #6c7086; padding: 30px; }
scrolledwindow { background: transparent; }
"""


def private_dir(path):
    os.makedirs(path, exist_ok=True)
    os.chmod(path, 0o700)


def xdotool_path():
    p = os.path.expanduser("~/.local/bin/xdotool")
    return p if os.path.exists(p) else shutil.which("xdotool")


WAYLAND = os.environ.get("XDG_SESSION_TYPE") == "wayland"


def bridge(method, *args):
    """Call the session-bridge GNOME Shell extension (Wayland stand-in for xdotool)."""
    return subprocess.run(["gdbus", "call", "--session", "--dest", "org.aiyu.SessionBridge",
                           "--object-path", "/org/aiyu/SessionBridge",
                           "--method", "org.aiyu.SessionBridge." + method, *map(str, args)],
                          capture_output=True, text=True, timeout=1).stdout


def active_window_info():
    """(class, title) of the focused window, lowercased; ('', '') if unknown."""
    if WAYLAND:  # xdotool only sees XWayland windows
        try:
            cls, title = ast.literal_eval(bridge("ActiveWindow"))
            return cls.lower(), title.lower()
        except Exception:
            return "", ""
    xd = xdotool_path()
    if not xd:
        return "", ""
    try:
        cls = subprocess.run([xd, "getactivewindow", "getwindowclassname"], capture_output=True,
                             text=True, timeout=1).stdout.strip().lower()
        name = subprocess.run([xd, "getactivewindow", "getwindowname"], capture_output=True,
                              text=True, timeout=1).stdout.strip().lower()
        return cls, name
    except Exception:
        return "", ""


def ago(ts):
    d = max(0, time.time() - ts)
    if d < 60: return "now"
    if d < 3600: return f"{int(d // 60)}m"
    if d < 86400: return f"{int(d // 3600)}h"
    return f"{int(d // 86400)}d"


class History:
    def __init__(self, cfg):
        self.cfg = cfg
        private_dir(DATA)
        private_dir(IMG_DIR)
        try:
            with open(DB) as f:
                self.items = json.load(f)
        except Exception:
            self.items = []
        # Only pinned items survive a restart; everything else is session-only.
        self.items = [i for i in self.items if i.get("pinned")
                      and (i["type"] == "text" or os.path.exists(i.get("file", "")))]
        keep = {i.get("file") for i in self.items if i["type"] == "image"}
        for f in os.listdir(IMG_DIR):
            if os.path.join(IMG_DIR, f) not in keep:
                try:
                    os.remove(os.path.join(IMG_DIR, f))
                except OSError:
                    pass
        self.save()
        self.expire()

    def save(self):
        tmp = DB + ".tmp"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump([i for i in self.items if i.get("pinned")], f)
        os.replace(tmp, DB)

    def _drop_file(self, item):
        if item["type"] == "image":
            try:
                os.remove(item["file"])
            except OSError:
                pass

    def ordered(self):
        """Pinned first, then newest first."""
        return [i for i in self.items if i.get("pinned")] + [i for i in self.items if not i.get("pinned")]

    def expire(self):
        hours = self.cfg["expire_hours"]
        changed = False
        if hours:
            cutoff = time.time() - hours * 3600
            for i in list(self.items):
                if not i.get("pinned") and i["ts"] < cutoff:
                    self.items.remove(i); self._drop_file(i); changed = True
        unpinned = [i for i in self.items if not i.get("pinned")]
        for i in unpinned[self.cfg["max_items"]:]:
            self.items.remove(i); self._drop_file(i); changed = True
        if changed:
            self.save()

    def add(self, item):
        for old in self.items:
            if old["key"] == item["key"]:
                item["pinned"] = old.get("pinned", False)
                self.items.remove(old)
                break
        self.items.insert(0, item)
        self.expire()
        self.save()

    def remove(self, item):
        if item in self.items:
            self.items.remove(item)
            self._drop_file(item)
            self.save()

    def clear(self):
        """Remove everything except pinned items."""
        for i in list(self.items):
            if not i.get("pinned"):
                self.items.remove(i); self._drop_file(i)
        self.save()

    def toggle_pin(self, item):
        item["pinned"] = not item.get("pinned", False)
        self.save()


class App(Gtk.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.HANDLES_COMMAND_LINE)
        self.popup = None

    # --- lifecycle -------------------------------------------------------
    def do_startup(self):
        Gtk.Application.do_startup(self)
        self.hold()
        self.cfg = load_config()
        self.hist = History(self.cfg)
        self.clip = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
        self.clip.connect("owner-change", lambda c, e: GLib.timeout_add(80, self.capture))
        prov = Gtk.CssProvider()
        prov.load_from_data(CSS)
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), prov,
                                                 Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        GLib.timeout_add_seconds(60, lambda: (self.hist.expire(), True)[1])
        GLib.idle_add(self.capture)

    def do_command_line(self, cmd):
        args = cmd.get_arguments()[1:]
        try:
            if "--pause" in args:
                self.set_paused(True)
            elif "--resume" in args:
                self.set_paused(False)
            elif "--toggle-pause" in args:
                self.set_paused(not self.paused)
            elif "--daemon" not in args:
                self.toggle()
        except Exception as e:  # never wedge the daemon or the caller
            print("clipsnip error:", e, file=sys.stderr)
            self.popup = None
        return 0

    @property
    def paused(self):
        return os.path.exists(PAUSE_FLAG)

    def set_paused(self, on):
        if on:
            open(PAUSE_FLAG, "w").close()
        elif self.paused:
            os.remove(PAUSE_FLAG)
        subprocess.Popen(["notify-send", "-t", "1500", "-i", "edit-paste", "Clipboard history",
                          "Recording paused" if on else "Recording resumed"],
                         stderr=subprocess.DEVNULL) if shutil.which("notify-send") else None

    # --- recording -------------------------------------------------------
    def capture(self):
        if self.paused:
            return False
        clip = self.clip
        try:
            ok, atoms = clip.wait_for_targets()
            if ok and PASSWORD_HINTS & {a.name().lower() for a in atoms}:
                return False  # password manager asked not to be recorded
        except Exception:
            pass
        if self.cfg["ignore_apps"]:
            cls, title = active_window_info()
            if any(a in cls or a in title for a in self.cfg["ignore_apps"]):
                return False
        if clip.wait_is_text_available():
            clip.request_text(self.got_text)
        elif self.cfg["keep_images"] and clip.wait_is_image_available():
            clip.request_image(self.got_image)
        return False

    def got_text(self, clip, text):
        if not text or not text.strip() or len(text) > self.cfg["max_text_chars"]:
            return
        if any(p.search(text) for p in self.cfg["_patterns"]):
            return  # looks like a secret: not recorded (still on the system clipboard)
        key = "t:" + hashlib.md5(text.encode("utf-8", "ignore")).hexdigest()
        self.hist.add({"type": "text", "text": text, "key": key, "ts": time.time()})

    def got_image(self, clip, pixbuf):
        if pixbuf is None:
            return
        h = hashlib.md5(pixbuf.get_pixels()).hexdigest()[:20]
        path = os.path.join(IMG_DIR, h + ".png")
        if not os.path.exists(path):
            pixbuf.savev(path, "png", [], [])
            os.chmod(path, 0o600)
        self.hist.add({"type": "image", "file": path, "key": "i:" + h, "ts": time.time(),
                       "w": pixbuf.get_width(), "h": pixbuf.get_height()})

    # --- popup -----------------------------------------------------------
    def toggle(self):
        self.close_popup() if self.popup is not None else self.open_popup()

    def close_popup(self):
        if self.popup is not None:
            p, self.popup = self.popup, None
            p.destroy()

    def open_popup(self, keep_query=""):
        self.hist.expire()
        win = Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
        self.popup = win
        win.set_decorated(False)
        win.set_resizable(False)
        win.set_keep_above(True)
        win.set_skip_taskbar_hint(True)
        win.set_skip_pager_hint(True)
        win.set_type_hint(Gdk.WindowTypeHint.DIALOG)
        win.set_title("Clipboard history")
        win.set_app_paintable(True)
        vis = win.get_screen().get_rgba_visual()
        if vis:
            win.set_visual(vis)
        win.set_size_request(self.cfg["popup_width"], -1)

        card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        card.get_style_context().add_class("card")
        card.set_border_width(10)
        win.add(card)

        head = Gtk.Box(spacing=4)
        title = Gtk.Label(label="Clipboard")
        title.get_style_context().add_class("title")
        head.pack_start(title, False, False, 4)
        clear = Gtk.Button(label="Clear all")
        for c in ("flat", "danger"):
            clear.get_style_context().add_class(c)
        clear.set_tooltip_text("Clear everything except pinned items")
        clear.connect("clicked", lambda *_: self.clear_all())
        head.pack_end(clear, False, False, 0)
        pause = Gtk.Button(label="▶ Resume" if self.paused else "⏸ Pause")
        pause.get_style_context().add_class("flat")
        pause.set_tooltip_text("Stop/start recording new copies")
        pause.connect("clicked", lambda *_: (self.set_paused(not self.paused), self.close_popup()))
        head.pack_end(pause, False, False, 0)
        card.pack_start(head, False, False, 0)

        if self.paused:
            b = Gtk.Label(label="Recording is paused — new copies are not saved")
            b.get_style_context().add_class("banner")
            card.pack_start(b, False, False, 0)

        self.entry = Gtk.SearchEntry()
        self.entry.set_placeholder_text("Type to search…")
        self.entry.set_text(keep_query)
        card.pack_start(self.entry, False, False, 0)

        self.items = self.hist.ordered()
        self.rows = {}
        self.lb = None
        if not self.items:
            e = Gtk.Label(label="Nothing copied yet")
            e.get_style_context().add_class("empty")
            card.pack_start(e, False, False, 0)
        else:
            lb = Gtk.ListBox()
            lb.set_selection_mode(Gtk.SelectionMode.BROWSE)
            lb.set_activate_on_single_click(True)
            for n, it in enumerate(self.items):
                row = self.make_row(n, it)
                lb.add(row)
                self.rows[row] = it
            lb.set_filter_func(self.row_visible)
            lb.connect("row-activated", lambda lb, row: self.choose(self.rows[row]))
            sw = Gtk.ScrolledWindow()
            sw.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
            sw.set_min_content_height(min(62 * len(self.items), 380))
            sw.set_max_content_height(380)
            sw.set_propagate_natural_height(True)
            lb.set_adjustment(sw.get_vadjustment())
            sw.add(lb)
            card.pack_start(sw, True, True, 0)
            self.lb = lb
            self.entry.connect("search-changed", self.on_search)

        hint = Gtk.Label(label="Enter paste · Alt+1-9 quick · Ctrl+P pin · Del remove · Esc close")
        hint.get_style_context().add_class("hint")
        card.pack_start(hint, False, False, 2)

        win.connect("key-press-event", self.on_key)
        self.had_focus = False
        win.connect("focus-in-event", lambda *_: setattr(self, "had_focus", True) or False)
        win.connect("focus-out-event", lambda *_: (GLib.timeout_add(150, self.focus_lost), False)[1])
        win.connect("destroy", lambda *_: setattr(self, "popup", None) if self.popup is win else None)

        win.show_all()
        self.place(win)
        ts = GdkX11.x11_get_server_time(win.get_window())
        win.present_with_time(ts)
        win.get_window().focus(ts)
        if WAYLAND:  # mutter may refuse X11 focus requests from a background app
            try:
                bridge("ActivatePid", os.getpid())
            except Exception:
                pass
        self.entry.grab_focus_without_selecting()
        if self.lb:
            self.lb.invalidate_filter()
            self.select_first()

    def clear_all(self):
        self.hist.clear()
        self.close_popup()
        try:
            self.clip.clear()
        except Exception:
            pass

    def focus_lost(self):
        if self.popup is not None and self.had_focus and not self.popup.is_active():
            self.close_popup()
        return False

    def place(self, win):
        """Fixed spot on the primary monitor (like Windows), independent of the mouse."""
        disp = Gdk.Display.get_default()
        mon = (disp.get_primary_monitor() or disp.get_monitor(0)).get_workarea()
        w, h = win.get_size()
        m = int(self.cfg["popup_margin"])
        pos = self.cfg["popup_position"]
        x = mon.x + (mon.width - w) // 2 if "center" in pos else (
            mon.x + m if "left" in pos else mon.x + mon.width - w - m)
        y = mon.y + m if pos.startswith("top") else (
            mon.y + (mon.height - h) // 2 if pos == "center" else mon.y + mon.height - h - m)
        win.move(max(mon.x, x), max(mon.y, y))

    # --- rows / search ---------------------------------------------------
    def make_row(self, n, it):
        row = Gtk.ListBoxRow()
        if it.get("pinned"):
            row.get_style_context().add_class("pinnedrow")
        box = Gtk.Box(spacing=8)
        box.set_border_width(6)
        num = Gtk.Label(label=str(n + 1) if n < 9 else "")
        num.get_style_context().add_class("num")
        num.set_size_request(12, -1)
        box.pack_start(num, False, False, 0)
        if it["type"] == "text":
            txt = it["text"].strip()
            lab = Gtk.Label(label=txt[:400])
            lab.set_xalign(0)
            lab.set_line_wrap(True)
            lab.set_lines(2)
            lab.set_ellipsize(3)  # END
            lab.set_max_width_chars(40)
            lab.get_style_context().add_class("item")
            v = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
            v.pack_start(lab, False, False, 0)
            if "\n" in txt or len(txt) > 90:
                meta = Gtk.Label(label=f"{len(txt.splitlines())} lines · {len(txt)} chars")
                meta.set_xalign(0)
                meta.get_style_context().add_class("meta")
                v.pack_start(meta, False, False, 0)
            box.pack_start(v, True, True, 0)
        else:
            try:
                pb = GdkPixbuf.Pixbuf.new_from_file_at_scale(it["file"], 280, 70, True)
                box.pack_start(Gtk.Image.new_from_pixbuf(pb), False, False, 0)
            except Exception:
                pass
            meta = Gtk.Label(label=f"Image {it.get('w', '?')}×{it.get('h', '?')}")
            meta.get_style_context().add_class("meta")
            box.pack_start(meta, True, True, 0)
        d = Gtk.Button(label="✕")
        d.get_style_context().add_class("del")
        d.set_relief(Gtk.ReliefStyle.NONE)
        d.set_focus_on_click(False)
        d.set_tooltip_text("Remove")
        d.connect("clicked", lambda *_: self.delete_item(it))
        box.pack_end(d, False, False, 0)
        p = Gtk.Button(label="★" if it.get("pinned") else "☆")
        p.get_style_context().add_class("pin")
        if it.get("pinned"):
            p.get_style_context().add_class("on")
        p.set_relief(Gtk.ReliefStyle.NONE)
        p.set_focus_on_click(False)
        p.set_tooltip_text("Pin (keeps it at the top, never expires)")
        p.connect("clicked", lambda *_: self.pin_item(it))
        box.pack_end(p, False, False, 0)
        t = Gtk.Label(label=ago(it["ts"]))
        t.get_style_context().add_class("ago")
        box.pack_end(t, False, False, 2)
        row.add(box)
        return row

    def row_visible(self, row):
        q = self.entry.get_text().strip().lower()
        if not q:
            return True
        it = self.rows.get(row)
        if it is None:
            return True
        hay = it["text"].lower() if it["type"] == "text" else "image screenshot png"
        return all(w in hay for w in q.split())

    def visible_rows(self):
        return [r for r in self.lb.get_children() if r.get_child_visible()] if self.lb else []

    def select_first(self):
        vis = self.visible_rows()
        if vis:
            self.lb.select_row(vis[0])
        return False

    def on_search(self, *_):
        self.lb.invalidate_filter()
        self.select_first()

    def move(self, delta):
        vis = self.visible_rows()
        if not vis:
            return
        cur = self.lb.get_selected_row()
        i = vis.index(cur) if cur in vis else -1
        row = vis[max(0, min(len(vis) - 1, i + delta))]
        self.lb.select_row(row)
        row.grab_focus()  # scrolls it into view
        self.entry.grab_focus_without_selecting()

    def reopen(self):
        q = self.entry.get_text() if self.popup is not None else ""
        self.close_popup()
        self.open_popup(q)

    def delete_item(self, it):
        self.hist.remove(it)
        self.reopen()

    def pin_item(self, it):
        self.hist.toggle_pin(it)
        self.reopen()

    def on_key(self, win, ev):
        k = Gdk.keyval_name(ev.keyval) or ""
        ctrl = ev.state & Gdk.ModifierType.CONTROL_MASK
        alt = ev.state & Gdk.ModifierType.MOD1_MASK
        sel = self.lb.get_selected_row() if self.lb else None
        if k == "Escape":
            if self.entry.get_text():
                self.entry.set_text("")
            else:
                self.close_popup()
            return True
        if k == "Down":
            self.move(1); return True
        if k == "Up":
            self.move(-1); return True
        if k in ("Return", "KP_Enter") and sel:
            self.choose(self.rows[sel]); return True
        if k == "Delete" and sel and not self.entry.get_text():
            self.delete_item(self.rows[sel]); return True
        if ctrl and k in ("p", "P") and sel:
            self.pin_item(self.rows[sel]); return True
        if alt and k.isdigit() and k != "0":
            i = int(k) - 1
            vis = self.visible_rows()
            if i < len(vis):
                self.choose(self.rows[vis[i]])
            return True
        return False

    # --- paste -----------------------------------------------------------
    def choose(self, it):
        self.close_popup()
        if it["type"] == "text":
            self.clip.set_text(it["text"], -1)
        else:
            try:
                self.clip.set_image(GdkPixbuf.Pixbuf.new_from_file(it["file"]))
            except Exception:
                return
        self.hist.add(dict(it, ts=time.time()))
        GLib.timeout_add(180, self.autopaste, it["type"])

    def autopaste(self, kind):
        if WAYLAND:
            is_term = any(t in active_window_info()[0] for t in TERMINALS)
            try:
                bridge("Paste", "true" if (is_term and kind == "text") else "false")
            except Exception:
                pass
            return False
        xd = xdotool_path()
        if not xd:
            return False
        cls, _ = active_window_info()
        is_term = any(t in cls for t in TERMINALS)
        combo = "ctrl+shift+v" if (is_term and kind == "text") else "ctrl+v"
        subprocess.Popen([xd, "key", "--clearmodifiers", combo])
        return False


if __name__ == "__main__":
    sys.exit(App().run(sys.argv))
