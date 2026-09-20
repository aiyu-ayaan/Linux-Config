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
echo "GNOME settings applied."
