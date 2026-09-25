#!/usr/bin/env bash
# Give the login screen (GDM greeter) the same monitor layout and primary monitor as your session.
# Without it GDM has no layout of its own and puts the login box on the first output the
# driver lists (HDMI-0, the portrait monitor, on the NVIDIA X driver).
# Needs root (asks for sudo). Re-run after changing the layout in Settings > Displays.
# Undo: sudo rm /var/lib/gdm3/.config/monitors.xml
set -euo pipefail
src=${1:-$HOME/.config/monitors.xml}
[ -f "$src" ] || { echo "no $src: set up the displays in Settings > Displays first" >&2; exit 1; }
sudo install -D -o gdm -g gdm -m644 "$src" /var/lib/gdm3/.config/monitors.xml
echo "Login screen layout updated (takes effect at the next login screen)."
