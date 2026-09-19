#!/usr/bin/env bash
# clipsnip installer — clipboard history (Win+V) + snipping tool shortcuts. No root needed.
#   bash install.sh              install / update everything
#   bash install.sh --shortcuts  only re-apply shortcuts from ~/.config/clipsnip/config.json
#   bash install.sh --uninstall  remove autostart + shortcuts (keeps your history/config)
#   bash install.sh --purge      uninstall and delete history + config
set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HOME/.local/bin"; ROOT="$HOME/.local/pkgroot"
CONF_DIR="$HOME/.config/clipsnip"; DATA_DIR="$HOME/.local/share/clipsnip"
AUTOSTART="$HOME/.config/autostart/clipsnip.desktop"

say() { printf '\n\033[1;35m==>\033[0m \033[1m%s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
stop_daemon() { pkill -f "^python3 .*clipboard-history\.py" 2>/dev/null || true; sleep 0.5; }

case "${1:-}" in
  --shortcuts) python3 "$KIT/apply-shortcuts.py"; exit 0 ;;
  --uninstall|--purge)
    say "Removing clipsnip"
    python3 "$KIT/apply-shortcuts.py" --remove || true
    stop_daemon; rm -f "$AUTOSTART" "$HOME/.config/autostart/clipboard-history.desktop"
    if [[ "$1" == --purge ]]; then rm -rf "$CONF_DIR" "$DATA_DIR"; echo "History and config deleted."; fi
    echo "Done. (xclip/xdotool in ~/.local/bin were left in place.)"; exit 0 ;;
  "") ;;
  *) echo "Unknown option $1"; exit 1 ;;
esac

# ── 0. sanity ───────────────────────────────────────────────────────────
have python3 || { echo "python3 is required"; exit 1; }
if ! python3 -c "import gi; gi.require_version('Gtk','3.0'); gi.require_version('GdkX11','3.0'); from gi.repository import Gtk, GdkX11, GdkPixbuf" 2>/dev/null; then
  echo "Missing GTK3 Python bindings. Install:  sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-gdkpixbuf-2.0"
  exit 1
fi
if [[ "${XDG_SESSION_TYPE:-x11}" == wayland ]]; then
  echo "NOTE: you are on Wayland. The popup and auto-paste need X11 (xclip/xdotool); log in with an X11 session for full function."
fi

# ── 1. xclip (image paste into terminals/Claude Code) + xdotool (auto-paste) ──
say "Checking xclip / xdotool"
mkdir -p "$BIN" "$ROOT"
if ! have xclip || ! have xdotool; then
  if have apt-get && sudo -n true 2>/dev/null; then
    sudo -n apt-get install -y xclip xdotool
  elif have apt-get; then
    tmp="$(mktemp -d)"
    (cd "$tmp" && apt-get download xclip xdotool libxdo3 >/dev/null 2>&1) || echo "Could not download packages."
    for d in "$tmp"/*.deb; do [[ -e "$d" ]] && dpkg -x "$d" "$ROOT"; done; rm -rf "$tmp"
    have xclip || { [[ -x "$ROOT/usr/bin/xclip" ]] && ln -sf "$ROOT/usr/bin/xclip" "$BIN/xclip"; }
    if ! have xdotool && [[ -x "$ROOT/usr/bin/xdotool" ]]; then
      cat > "$BIN/xdotool" <<X
#!/bin/sh
LD_LIBRARY_PATH="$ROOT/usr/lib/x86_64-linux-gnu:$ROOT/usr/lib/aarch64-linux-gnu\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}" exec "$ROOT/usr/bin/xdotool" "\$@"
X
      chmod +x "$BIN/xdotool"
    fi
  else
    echo "Install xclip and xdotool with your package manager (e.g. dnf/pacman)."
  fi
fi
export PATH="$BIN:$PATH"
have xclip    && echo "xclip:   ok" || echo "xclip:   MISSING (image paste into terminals won't work)"
have xdotool  && echo "xdotool: ok" || echo "xdotool: MISSING (popup will copy but you must press Ctrl+V yourself)"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "Add $BIN to your PATH (e.g. in ~/.profile)";; esac

# ── 2. config + data (private) ──────────────────────────────────────────
say "Config and data"
mkdir -p "$CONF_DIR"; [[ -f "$CONF_DIR/config.json" ]] || cp "$KIT/config.default.json" "$CONF_DIR/config.json"
if [[ -d "$HOME/.local/share/clipboard-history" && ! -d "$DATA_DIR" ]]; then   # migrate older version
  mv "$HOME/.local/share/clipboard-history" "$DATA_DIR"; echo "Migrated old history."
fi
mkdir -p "$DATA_DIR/img"; chmod 700 "$DATA_DIR" "$DATA_DIR/img"
chmod +x "$KIT/clipboard-history.py" "$KIT/snip.sh" "$KIT/apply-shortcuts.py"
echo "Config: $CONF_DIR/config.json"

# ── 3. autostart + run now ──────────────────────────────────────────────
say "Autostart"
mkdir -p "$(dirname "$AUTOSTART")"; rm -f "$HOME/.config/autostart/clipboard-history.desktop"
cat > "$AUTOSTART" <<D
[Desktop Entry]
Type=Application
Name=Clipboard History (clipsnip)
Exec=env PATH=$BIN:/usr/bin:/bin python3 $KIT/clipboard-history.py --daemon
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=3
D
stop_daemon
(setsid nohup env PATH="$BIN:$PATH" python3 "$KIT/clipboard-history.py" --daemon >/dev/null 2>&1 </dev/null &)

# ── 4. shortcuts ────────────────────────────────────────────────────────
say "Keyboard shortcuts"
python3 "$KIT/apply-shortcuts.py"

say "Done"
echo "If a shortcut does nothing right after installing, log out/in once (Cinnamon: Alt+F2, r, Enter)."
echo "Backend used: python3 $KIT/apply-shortcuts.py --list"
echo "Win+V  clipboard history      Win+Shift+S / Shift+PrtSc  snip area → clipboard"
echo "Edit $CONF_DIR/config.json then run:  bash $KIT/install.sh --shortcuts   (shortcuts)"
echo "Other settings (limits, ignore rules): edit the file, then re-run  bash $KIT/install.sh"
