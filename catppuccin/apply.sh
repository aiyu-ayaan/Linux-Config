#!/usr/bin/env bash
# Catppuccin Mocha for btop, bat and VS Code (fzf and the terminal/zsh prompt are in the zsh kit).
# No root needed. Safe to re-run. Undo: see README.md.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)

# btop
mkdir -p ~/.config/btop/themes
install -m644 "$here/btop/catppuccin_mocha.theme" ~/.config/btop/themes/
if [ -f ~/.config/btop/btop.conf ]; then
  sed -i 's|^color_theme = .*|color_theme = "catppuccin_mocha"|' ~/.config/btop/btop.conf
fi

# bat (the zsh kit exports BAT_THEME="Catppuccin Mocha")
if command -v bat >/dev/null; then
  mkdir -p "$(bat --config-dir)/themes"
  install -m644 "$here/bat/Catppuccin Mocha.tmTheme" "$(bat --config-dir)/themes/"
  bat cache --build >/dev/null
fi

# VS Code: install the extension; the colour theme is NOT switched automatically
command -v code >/dev/null && code --install-extension Catppuccin.catppuccin-vsc --force >/dev/null 2>&1 || echo "skipped: VS Code extension"
echo "Catppuccin applied."
