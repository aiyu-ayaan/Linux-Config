#!/usr/bin/env bash
# Snipping tool: snip.sh {area|full|window} [--save]
#   default  -> image goes to the clipboard (paste anywhere, incl. Claude Code with Ctrl+V)
#   --save   -> also/instead saved to ~/Pictures/Screenshots (dir override: CLIPSNIP_SHOT_DIR)
# Backends (first found): gnome-screenshot, flameshot, maim, spectacle.
# Used automatically on desktops that lack a built-in screenshot-to-clipboard shortcut.
set -u
mode="${1:-area}"; save=0; [[ "${2:-}" == "--save" ]] && save=1
dir="${CLIPSNIP_SHOT_DIR:-$HOME/Pictures/Screenshots}"
tmp="$(mktemp --suffix=.png)"; trap 'rm -f "$tmp"' EXIT
export PATH="$HOME/.local/bin:$PATH"
have() { command -v "$1" >/dev/null 2>&1; }

if have gnome-screenshot; then
  case "$mode" in area) gnome-screenshot -a -f "$tmp";; window) gnome-screenshot -w -f "$tmp";; *) gnome-screenshot -f "$tmp";; esac
elif have flameshot; then
  case "$mode" in area) flameshot gui --raw >"$tmp";; *) flameshot full --raw >"$tmp";; esac
elif have maim; then
  case "$mode" in area) maim -s "$tmp";; window) maim -i "$(xdotool getactivewindow)" "$tmp";; *) maim "$tmp";; esac
elif have spectacle; then
  case "$mode" in area) spectacle -r -b -n -o "$tmp";; window) spectacle -a -b -n -o "$tmp";; *) spectacle -f -b -n -o "$tmp";; esac
else
  echo "snip.sh: install gnome-screenshot, flameshot, maim or spectacle" >&2; exit 1
fi
[[ -s "$tmp" ]] || exit 0   # cancelled

if (( save )); then
  mkdir -p "$dir"; out="$dir/Screenshot $(date '+%Y-%m-%d %H-%M-%S').png"; cp "$tmp" "$out"
  have notify-send && notify-send -t 2000 -i "$out" "Screenshot saved" "$out"
fi
# xclip/wl-copy stay alive as clipboard owner until something else is copied
if [[ "${XDG_SESSION_TYPE:-}" == wayland ]] && have wl-copy; then wl-copy --type image/png <"$tmp"
elif have xclip; then xclip -selection clipboard -t image/png -i "$tmp"
else echo "snip.sh: need xclip (X11) or wl-copy (Wayland) to copy" >&2; exit 1; fi
(( save )) || { have notify-send && notify-send -t 1500 -i camera-photo "Copied to clipboard"; }
exit 0
