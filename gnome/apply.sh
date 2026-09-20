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
gs org.gnome.desktop.interface icon-theme Papirus-Dark   # falls back to Adwaita if not installed
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
#   3193 Blur my Shell: blur behind the top bar, overview, terminal and Ulauncher
#   3843 Just Perfection: compact top bar, centred clock, fewer icons
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
ext_set() { # uuid schema key value  (extension schemas are not on the default schema path)
  GSETTINGS_SCHEMA_DIR="$ext_dir/$1/schemas" gsettings set "$2" "$3" "$4" 2>/dev/null || echo "skipped: $2 $3"
}
if command -v gnome-extensions >/dev/null; then
  gs org.gnome.shell disable-user-extensions false
  lamp=compiz-alike-magic-lamp-effect@hermes83.github.com; blur=blur-my-shell@aunetx; jp=just-perfection-desktop@just-perfection
  install_ext 3740 $lamp; install_ext 3193 $blur; install_ext 3843 $jp
  for e in $lamp $blur $jp; do [ -d "$ext_dir/$e" ] && enable_ext $e; done

  if [ -d "$ext_dir/$jp" ]; then
    j() { ext_set $jp org.gnome.shell.extensions.just-perfection "$@"; }
    j panel-size 30                  # compact top bar (default 32)
    j panel-button-padding-size 6
    j panel-indicator-padding-size 4
    j clock-menu-position 0          # clock in the centre
    j world-clock false; j weather false; j events-button false
    j accessibility-menu false; j keyboard-layout false
    j panel-notification-icon false  # no separate notification dot
  fi
  if [ -d "$ext_dir/$blur" ]; then
    b() { ext_set $blur org.gnome.shell.extensions.blur-my-shell"$1" "${@:2}"; }
    b .panel blur true;            b .panel sigma 25;   b .panel brightness 0.7
    b .panel static-blur true
    b .overview blur true;         b .overview sigma 30
    b .applications blur true;     b .applications enable-all false
    b .applications whitelist "['Gnome-terminal', 'ulauncher', 'Ulauncher']"
    b .applications sigma 25;      b .applications opacity 215
  fi
fi

# Libadwaita (GTK4) apps: Files, Settings... The WhiteSur symlinks from the Cinnamon makeover are kept as *.whitesur.bak
mkdir -p ~/.config/gtk-4.0
for f in gtk.css gtk-dark.css; do
  t=~/.config/gtk-4.0/$f
  if [ -L "$t" ]; then mv "$t" "$t.whitesur.bak"
  elif [ -e "$t" ] && ! grep -q "Catppuccin Mocha for libadwaita" "$t"; then cp "$t" "$t.bak"; fi
  install -m644 "$here/gtk4.css" "$t"
done

# Power: switch profile on plug/unplug + low-battery notifications (bin/power-watch, started at login)
install -m755 "$here/bin/power-watch" ~/.local/bin/
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/power-watch.desktop <<DESK
[Desktop Entry]
Type=Application
Name=Power profile watcher
Exec=$HOME/.local/bin/power-watch
X-GNOME-Autostart-enabled=true
DESK
pgrep -f "$HOME/.local/bin/power-watch" >/dev/null || (setsid "$HOME/.local/bin/power-watch" >/dev/null 2>&1 &)

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
