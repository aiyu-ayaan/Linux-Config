#!/usr/bin/env bash
# Apply the GNOME desktop customisation (gsettings only, no root). Safe to re-run.
# Undo: see gnome/README.md. Wallpaper and the shared-drive mount are machine-specific and not set here.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
gs() { gsettings set "$@" || echo "skipped: $*"; }

# Helper scripts (Super+Ctrl+N / Super+Ctrl+W)
mkdir -p ~/.local/bin
install -m755 "$here"/bin/ws-add "$here"/bin/ws-close ~/.local/bin/

# Look
gs org.gnome.desktop.interface color-scheme prefer-dark
gs org.gnome.desktop.interface gtk-theme Adwaita-dark   # GTK3 apps (Nemo etc.) ignore color-scheme
gs org.gnome.desktop.interface icon-theme Adwaita
gs org.gnome.desktop.interface cursor-theme Bibata-Modern-Classic
gs org.gnome.desktop.interface show-battery-percentage true
gs org.gnome.desktop.interface enable-hot-corners true
gs org.gnome.desktop.wm.preferences button-layout 'appmenu:minimize,maximize,close'

# Workspaces: fixed count (ws-add / ws-close change it), only on primary monitor
gs org.gnome.mutter dynamic-workspaces false
gs org.gnome.mutter workspaces-only-on-primary true
gs org.gnome.mutter edge-tiling true
for i in 1 2 3 4; do
  gs org.gnome.desktop.wm.keybindings switch-to-workspace-$i "['<Super>$i']"
  gs org.gnome.desktop.wm.keybindings move-to-workspace-$i "['<Super><Shift>$i']"
  gs org.gnome.shell.keybindings switch-to-application-$i '[]'   # free Super+1..4 from dock apps
done
for i in 5 6 7 8 9; do gs org.gnome.shell.keybindings switch-to-application-$i '[]'; done
gs org.gnome.desktop.wm.keybindings switch-to-workspace-last "['<Super>0']"
gs org.gnome.desktop.wm.keybindings switch-to-workspace-left  "['<Control><Alt>Left','<Super>Page_Up']"
gs org.gnome.desktop.wm.keybindings switch-to-workspace-right "['<Control><Alt>Right','<Super>Page_Down']"
gs org.gnome.desktop.wm.keybindings move-to-workspace-left  "['<Control><Alt><Shift>Left','<Super><Shift>Page_Up']"
gs org.gnome.desktop.wm.keybindings move-to-workspace-right "['<Control><Alt><Shift>Right','<Super><Shift>Page_Down']"
gs org.gnome.desktop.wm.keybindings move-to-monitor-left  "['<Super><Shift>Left']"
gs org.gnome.desktop.wm.keybindings move-to-monitor-right "['<Super><Shift>Right']"
gs org.gnome.mutter.keybindings toggle-tiled-left  "['<Super>Left']"
gs org.gnome.mutter.keybindings toggle-tiled-right "['<Super>Right']"

# Launcher / file manager keys. Alt+Space belongs to Ulauncher, so the window menu moves.
gs org.gnome.desktop.wm.keybindings activate-window-menu "['<Shift><Alt>space']"
gs org.gnome.settings-daemon.plugins.media-keys home "['<Super>e']"

# Touchpad / power
gs org.gnome.desktop.peripherals.touchpad tap-to-click true
gs org.gnome.settings-daemon.plugins.power sleep-inactive-ac-timeout 6000
gs org.gnome.settings-daemon.plugins.power sleep-inactive-battery-timeout 1200

# Custom shortcuts for ws-add / ws-close (clipsnip registers its own; append, don't overwrite)
base=/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings
schema=org.gnome.settings-daemon.plugins.media-keys.custom-keybinding
add_key() { # id name command binding
  local path="$base/$1/" cur
  gsettings set "$schema:$path" name "$2"
  gsettings set "$schema:$path" command "$3"
  gsettings set "$schema:$path" binding "$4"
  cur=$(gsettings get org.gnome.settings-daemon.plugins.media-keys custom-keybindings)
  case $cur in *"'$path'"*) ;; *)
    cur=${cur/@as /}; cur=${cur%]}; [ "$cur" = "[" ] || cur="$cur, "
    gsettings set org.gnome.settings-daemon.plugins.media-keys custom-keybindings "$cur'$path']";;
  esac
}
add_key ws-add   'New workspace'         "$HOME/.local/bin/ws-add"   '<Super><Control>n'
add_key ws-close 'Close last workspace'  "$HOME/.local/bin/ws-close" '<Super><Control>w'
# Header bar / tab styling for GTK3 apps (GNOME Terminal)
mkdir -p ~/.config/gtk-3.0
if [ -e ~/.config/gtk-3.0/gtk.css ] && ! grep -q "Catppuccin Mocha polish" ~/.config/gtk-3.0/gtk.css; then
  cp ~/.config/gtk-3.0/gtk.css ~/.config/gtk-3.0/gtk.css.bak
fi
install -m644 "$here/gtk3.css" ~/.config/gtk-3.0/gtk.css

# GNOME Shell extensions (need internet once; the shell must be restarted to load them: Alt+F2, r, Enter on X11)
#   3740 Compiz alike magic lamp effect: Mac-style genie minimise / restore
#    307 Dash to Dock: bottom dock that hides while a window is maximised and reappears at the bottom edge
ext_dir=~/.local/share/gnome-shell/extensions
install_ext() { # pk uuid
  [ -d "$ext_dir/$2" ] && return 0
  local tmp ver url; tmp=$(mktemp -d); ver=$(gnome-shell --version | grep -o '[0-9]*' | head -1)
  url=$(curl -fsS "https://extensions.gnome.org/extension-info/?pk=$1&shell_version=$ver" | python3 -c 'import sys,json;print(json.load(sys.stdin)["download_url"])') &&
    curl -fsSL "https://extensions.gnome.org$url" -o "$tmp/e.zip" &&
    gnome-extensions install --force "$tmp/e.zip" || echo "skipped: could not install $2"
  rm -rf "$tmp"
}
enable_ext() {
  local cur; cur=$(gsettings get org.gnome.shell enabled-extensions)
  case $cur in *"$1"*) ;; *)
    cur=${cur/@as /}; cur=${cur%]}; [ "$cur" = "[" ] || cur="$cur, "
    gsettings set org.gnome.shell enabled-extensions "$cur'$1']";;
  esac
}
if command -v gnome-extensions >/dev/null; then
  gs org.gnome.shell disable-user-extensions false
  lamp=compiz-alike-magic-lamp-effect@hermes83.github.com
  dock=dash-to-dock@micxgx.gmail.com
  install_ext 3740 $lamp; install_ext 307 $dock
  [ -d "$ext_dir/$lamp" ] && enable_ext $lamp
  if [ -d "$ext_dir/$dock" ]; then
    enable_ext $dock
    d() { GSETTINGS_SCHEMA_DIR="$ext_dir/$dock/schemas" gsettings set org.gnome.shell.extensions.dash-to-dock "$@"; }
    d dock-position BOTTOM
    d dock-fixed false            # floating dock, not a full-width panel
    d extend-height false
    d intellihide true
    d intellihide-mode MAXIMIZED_WINDOWS   # hide only while a window is maximised
    d autohide true
    d require-pressure-to-show false       # touching the bottom edge is enough
    d show-delay 0.1
    d hide-delay 0.2
    d animation-time 0.25
    d transparency-mode DYNAMIC
    d click-action minimize                # click a running app's icon to minimise / restore it
    d show-mounts false
    d hot-keys false                       # keep Super+1..4 for workspaces
  fi
fi

# Touchpad gestures (touchegg). Restart the user client so it reloads the config.
if command -v touchegg >/dev/null; then
  mkdir -p ~/.config/touchegg
  if ! cmp -s "$here/touchegg.conf" ~/.config/touchegg/touchegg.conf; then
    install -m644 "$here/touchegg.conf" ~/.config/touchegg/touchegg.conf
    pkill -x -u "$USER" touchegg 2>/dev/null || true   # the --daemon runs as root and is left alone
    (setsid touchegg >/dev/null 2>&1 &)
  fi
fi
echo "GNOME settings applied."
