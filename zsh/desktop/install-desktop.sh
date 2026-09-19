#!/usr/bin/env bash
# Cinnamon desktop makeover: WhiteSur dark GTK/Cinnamon theme + WhiteSur icons + 40px panel.
# No sudo needed. Undo with:  bash restore-old-look.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$HERE/src" ~/.local/bin ~/.local/lib/pylibsass
export PATH="$HOME/.local/bin:$PATH"

# sassc replacement (libsass wheel) — themes need a Sass compiler and we have no sudo
if ! command -v sassc >/dev/null; then
  url="$(curl -fsS https://pypi.org/pypi/libsass/json | python3 -c "
import json,sys
for f in json.load(sys.stdin)['urls']:
    if f['filename'].endswith('cp38-abi3-manylinux_2_5_x86_64.manylinux1_x86_64.whl'): print(f['url'])")"
  curl -fsSL "$url" -o /tmp/libsass.whl && unzip -qo /tmp/libsass.whl -d ~/.local/lib/pylibsass
  cat > ~/.local/bin/sassc <<'PY'
#!/usr/bin/env python3
import sys, os
sys.path.insert(0, os.path.expanduser("~/.local/lib/pylibsass"))
import sass
style, incs, files, a, i = "expanded", [], [], sys.argv[1:], 0
while i < len(a):
    x = a[i]
    if x in ("-t", "--style"): style = a[i+1]; i += 1
    elif x in ("-I", "--load-path"): incs.append(a[i+1]); i += 1
    elif not x.startswith("-"): files.append(x)
    i += 1
out = sass.compile(filename=files[0], output_style=style, include_paths=incs)
open(files[1], "w").write(out) if len(files) > 1 else sys.stdout.write(out)
PY
  chmod +x ~/.local/bin/sassc
fi

clone() { [[ -d "$2/.git" ]] || git clone --depth=1 -q "$1" "$2"; }
clone https://github.com/vinceliuice/WhiteSur-gtk-theme.git "$HERE/src/WhiteSur"
clone https://github.com/vinceliuice/WhiteSur-icon-theme.git "$HERE/src/WhiteSur-icons"
clone https://github.com/yeyushengfan258/Win11-icon-theme.git "$HERE/src/Win11-icon-theme"
(cd "$HERE/src/WhiteSur" && ./install.sh -c dark -o normal -t default -N glassy </dev/null)
(cd "$HERE/src/WhiteSur-icons" && ./install.sh -d ~/.local/share/icons -t default -a </dev/null)
(cd "$HERE/src/Win11-icon-theme" && ./install.sh -d ~/.local/share/icons -t default -a </dev/null)

# Windows-style taskbar (running/focused underlines)
T=~/.themes/WhiteSur-Dark/cinnamon/cinnamon.css
python3 - "$T" "$HERE/taskbar.css" <<'PY'
import sys; t=open(sys.argv[1]).read(); i=t.find('\n/* ===== Windows-style taskbar')
open(sys.argv[1],'w').write((t[:i] if i>=0 else t)+open(sys.argv[2]).read())
PY

# GTK4 / libadwaita apps
mkdir -p ~/.config/gtk-4.0
for f in gtk.css gtk-dark.css; do ln -sf ~/.themes/WhiteSur-Dark/gtk-4.0/$f ~/.config/gtk-4.0/$f; done
ln -sfn ~/.themes/WhiteSur-Dark/gtk-4.0/assets ~/.config/gtk-4.0/assets
ln -sfn ~/.themes/WhiteSur-Dark/gtk-4.0/windows-assets ~/.config/gtk-4.0/windows-assets

# Windows-style window buttons instead of macOS traffic lights
python3 "$HERE/windows-buttons.py"

gsettings set org.cinnamon.desktop.interface gtk-theme 'WhiteSur-Dark'
gsettings set org.cinnamon.theme name 'WhiteSur-Dark'
gsettings set org.cinnamon.desktop.wm.preferences theme 'Mint-Y-Dark'
gsettings set org.cinnamon.desktop.interface icon-theme 'Win11-dark'
gsettings set org.cinnamon panels-height "['1:44']"
# Windows-like tray: drives, keyboard, network, sound, battery, clock, notifications, show-desktop
gsettings set org.cinnamon enabled-applets "['panel1:left:0:menu@cinnamon.org:0', 'panel1:left:1:separator@cinnamon.org:1', 'panel1:left:2:grouped-window-list@cinnamon.org:2', 'panel1:right:0:xapp-status@cinnamon.org:15', 'panel1:right:1:systray@cinnamon.org:3', 'panel1:right:2:removable-drives@cinnamon.org:7', 'panel1:right:3:keyboard@cinnamon.org:8', 'panel1:right:4:network@cinnamon.org:10', 'panel1:right:5:sound@cinnamon.org:11', 'panel1:right:6:power@cinnamon.org:12', 'panel1:right:7:calendar@cinnamon.org:13', 'panel1:right:8:notifications@cinnamon.org:5', 'panel1:right:9:cornerbar@cinnamon.org:14']"
# two-line clock (time over date)
python3 - <<'PY'
import json,os
p=os.path.expanduser("~/.config/cinnamon/spices/calendar@cinnamon.org/13.json")
if os.path.exists(p):
    d=json.load(open(p)); d['use-custom-format']['value']=True
    d['custom-format']['value']='%I:%M %p%n%d-%m-%Y'; d['custom-tooltip-format']['value']='%A, %d %B %Y'
    json.dump(d,open(p,'w'),indent=4)
PY
gsettings set org.cinnamon.desktop.wm.preferences button-layout ':minimize,maximize,close'
echo "Done. If the panel looks unchanged, press Alt+F2, type r, Enter."
