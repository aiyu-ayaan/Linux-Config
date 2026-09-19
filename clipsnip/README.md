# clipsnip — clipboard history + snipping tool

Windows-style **Win+V** clipboard history and **Win+Shift+S** snipping for Linux (X11). No root needed.

## Install (any machine)
Copy this folder anywhere, then:

    bash install.sh

Needs `python3` + GTK3 bindings (`sudo apt install python3-gi gir1.2-gtk-3.0`). It fetches `xclip`/`xdotool`
into `~/.local` if missing, sets autostart, and applies the shortcuts.
`bash install.sh --uninstall` removes it (history kept) · `--purge` also deletes history + config · `--shortcuts` re-applies shortcuts only.

## Shortcuts (edit in `~/.config/clipsnip/config.json`, then `bash install.sh --shortcuts`)
| Keys | Action |
|---|---|
| Win+V | clipboard history popup |
| Win+Shift+S / Shift+PrtSc | snip an area → clipboard |
| PrtSc / Alt+PrtSc | full screen / window → clipboard |
| Ctrl+PrtSc / Ctrl+Shift+PrtSc / Ctrl+Alt+PrtSc | full / area / window → file (`~/Pictures`) |

## Folder layout
    clipsnip/
      install.sh              installer / uninstaller
      apply-shortcuts.py      detects the desktop and calls the matching backend
      desktops/
        common.py             shared helpers + the list of actions
        gnome.py              GNOME (tested)
        cinnamon.py           Cinnamon (tested)
        xfce.py               Xfce (untested)
        generic.py            fallback: prints what to bind by hand
      clipboard-history.py    the popup + daemon
      snip.sh                 screenshot helper (gnome-screenshot, flameshot, maim or spectacle)

    python3 apply-shortcuts.py --list           show backends + the detected one
    python3 apply-shortcuts.py --desktop gnome  force a backend
    python3 apply-shortcuts.py --remove         remove the shortcuts

**Add another desktop:** copy `desktops/generic.py` to `desktops/<name>.py`, set `NAME`/`STATUS`, and write
`matches(de)`, `apply(sc)`, `remove(sc)`. It is picked up automatically. `common.actions(sc)` gives every
shortcut as `(id, label, command, accelerators)`.

**GNOME notes:** Win+V is freed from the notification list (Win+M still opens it). Screenshot keys use GNOME's own
screenshot UI. **Cinnamon:** if a shortcut does nothing after reinstalling, restart it (`Alt+F2`, `r`, Enter).

## Popup
Type to search · ↑/↓ · Enter paste · Alt+1–9 quick paste · **Ctrl+P pin** (★ stays on top, never expires) ·
Del remove · Esc clears search / closes · header buttons: **⏸ Pause**, Clear all (keeps pins).
Pause from a shortcut/terminal: `python3 clipboard-history.py --toggle-pause`.

## Privacy (config → `clipboard` section)
- History files are private (`0700`/`0600`) in `~/.local/share/clipsnip`.
- **Not recorded:** copies from password managers (KeePassXC hint, or `ignore_apps` matching the focused
  window), and text matching `ignore_patterns` (private keys, AWS/GitHub/OpenAI/Slack keys, JWTs,
  `password=`/`api_key=` lines). Skipped items still work on the normal clipboard, they just aren't kept.
- Unpinned items auto-delete after `expire_hours` (default 48; `0` = never). Also `max_items`, `keep_images`.
- Restart to apply config changes: `bash install.sh`.

## Files
`install.sh` · `clipboard-history.py` (daemon + popup) · `snip.sh` (screenshot → clipboard) ·
`apply-shortcuts.py` (Cinnamon/GNOME keybindings) · `config.default.json`

Pasting images into Claude Code with Ctrl+V needs `xclip` (installed by this kit).
