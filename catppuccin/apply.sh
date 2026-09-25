#!/usr/bin/env bash
# Catppuccin Mocha for btop, bat, VS Code, delta, lazygit, yazi, eza, rofi, Qt, Chrome
# (fzf and the terminal/zsh prompt are in the zsh kit).
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

# delta (git pager; zsh kit sets GIT_PAGER=delta when installed)
if [ -f "$here/delta/delta.gitconfig" ]; then
  mkdir -p ~/.config/git
  install -m644 "$here/delta/delta.gitconfig" ~/.config/git/catppuccin-delta.gitconfig
  # Drop stale include from earlier revisions, then ensure the current one exists once
  git config --global --unset-all include.path '~/.config/git/delta/delta.gitconfig' 2>/dev/null || true
  git config --global --unset-all include.path "$HOME/.config/git/delta/delta.gitconfig" 2>/dev/null || true
  if ! git config --global --get-all include.path 2>/dev/null | grep -q catppuccin-delta; then
    git config --global --add include.path ~/.config/git/catppuccin-delta.gitconfig 2>/dev/null || true
  fi
fi

# lazygit
if [ -f "$here/lazygit/config.yml" ]; then
  mkdir -p ~/.config/lazygit
  [ -e ~/.config/lazygit/config.yml ] || install -m644 "$here/lazygit/config.yml" ~/.config/lazygit/config.yml
fi

# yazi
if [ -f "$here/yazi/theme.toml" ]; then
  mkdir -p ~/.config/yazi
  install -m644 "$here/yazi/theme.toml" ~/.config/yazi/theme.toml
fi

# rofi launcher theme
if [ -f "$here/rofi/catppuccin-mocha.rasi" ]; then
  mkdir -p ~/.config/rofi
  install -m644 "$here/rofi/catppuccin-mocha.rasi" ~/.config/rofi/
  install -m644 "$here/rofi/config.rasi" ~/.config/rofi/
fi

# Qt5ct palette (needs qt5ct + adwaita-qt; env set by gnome/apply.sh)
if [ -f "$here/qt/qt5ct.conf" ]; then
  mkdir -p ~/.config/qt5ct
  [ -e ~/.config/qt5ct/qt5ct.conf ] || install -m644 "$here/qt/qt5ct.conf" ~/.config/qt5ct/qt5ct.conf
fi

# VS Code: install the extension; the colour theme is NOT switched automatically
command -v code >/dev/null && code --install-extension Catppuccin.catppuccin-vsc --force >/dev/null 2>&1 || echo "skipped: VS Code extension"
echo "Catppuccin applied."
