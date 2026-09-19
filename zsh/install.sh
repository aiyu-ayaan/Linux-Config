#!/usr/bin/env bash
# Zsh kit installer — Oh My Zsh + Powerlevel10k + autosuggestions + syntax
# highlighting + fzf/eza/bat/zoxide + FiraCode Nerd Font.
# Works without sudo. Safe to re-run. Copy this whole folder anywhere and run:
#     bash install.sh
set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HOME/.local/bin"
FONT_DIR="$HOME/.local/share/fonts"
CUSTOM="$KIT/custom"
mkdir -p "$BIN" "$FONT_DIR" "$CUSTOM/plugins" "$CUSTOM/themes"

say() { printf '\n\033[1;35m==>\033[0m \033[1m%s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# ── 0. prerequisites ────────────────────────────────────────────────────
for c in git curl tar zsh; do
  have "$c" || { echo "Missing '$c'. Install it first (e.g. sudo apt install $c)."; exit 1; }
done
case "$(uname -m)" in
  x86_64)  ARCH=x86_64;  FZF_ARCH=amd64 ;;
  aarch64|arm64) ARCH=aarch64; FZF_ARCH=arm64 ;;
  *) echo "Unsupported arch $(uname -m)"; exit 1 ;;
esac

clone() { # clone <url> <dir>
  if [[ -d "$2/.git" ]]; then git -C "$2" pull --ff-only -q || true
  else git clone --depth=1 -q "$1" "$2"; fi
}
latest_tag() { # latest_tag owner/repo
  curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$1/releases/latest" | sed 's#.*/tag/##'
}

# ── 1. fonts ────────────────────────────────────────────────────────────
say "Installing FiraCode Nerd Font"
if compgen -G "$KIT/fonts/*.ttf" >/dev/null; then
  cp -n "$KIT"/fonts/*.ttf "$FONT_DIR"/
else
  echo "No fonts in $KIT/fonts — downloading FiraCode Nerd Font"
  tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/ryanoasis/nerd-fonts/releases/latest/download/FiraCode.tar.xz" | tar -xJ -C "$tmp"
  mkdir -p "$KIT/fonts"; cp "$tmp"/*.ttf "$KIT/fonts/"; cp -n "$tmp"/*.ttf "$FONT_DIR"/; rm -rf "$tmp"
fi
have fc-cache && fc-cache -f "$FONT_DIR" >/dev/null

# ── 2. Oh My Zsh, theme, plugins ───────────────────────────────────────
say "Installing Oh My Zsh, Powerlevel10k and plugins"
clone https://github.com/ohmyzsh/ohmyzsh.git "$KIT/oh-my-zsh"
clone https://github.com/romkatv/powerlevel10k.git "$CUSTOM/themes/powerlevel10k"
clone https://github.com/zsh-users/zsh-autosuggestions.git "$CUSTOM/plugins/zsh-autosuggestions"
clone https://github.com/zsh-users/zsh-completions.git "$CUSTOM/plugins/zsh-completions"
clone https://github.com/zdharma-continuum/fast-syntax-highlighting.git "$CUSTOM/plugins/fast-syntax-highlighting"
clone https://github.com/marlonrichert/zsh-autocomplete.git "$CUSTOM/plugins/zsh-autocomplete"

# Powerlevel10k prompt config (Nerd-Font "rainbow" style) — keep user's own if present
[[ -f "$KIT/config/p10k.zsh" ]] || cp "$CUSTOM/themes/powerlevel10k/config/p10k-rainbow.zsh" "$KIT/config/p10k.zsh"

# ── 3. CLI tools (user-local binaries) ──────────────────────────────────
say "Installing CLI tools to $BIN"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

if ! have fzf; then
  v="$(latest_tag junegunn/fzf)"
  curl -fsSL "https://github.com/junegunn/fzf/releases/download/$v/fzf-${v#v}-linux_${FZF_ARCH}.tar.gz" | tar -xz -C "$BIN" fzf
fi
if ! have eza; then
  curl -fsSL "https://github.com/eza-community/eza/releases/latest/download/eza_${ARCH}-unknown-linux-gnu.tar.gz" | tar -xz -C "$BIN"
fi
if ! have bat && ! have batcat; then
  v="$(latest_tag sharkdp/bat)"
  curl -fsSL "https://github.com/sharkdp/bat/releases/download/$v/bat-$v-${ARCH}-unknown-linux-gnu.tar.gz" | tar -xz -C "$tmp"
  cp "$tmp"/bat-*/bat "$BIN/bat"
fi
if ! have zoxide; then
  v="$(latest_tag ajeetdsouza/zoxide)"
  curl -fsSL "https://github.com/ajeetdsouza/zoxide/releases/download/$v/zoxide-${v#v}-${ARCH}-unknown-linux-musl.tar.gz" | tar -xz -C "$BIN" zoxide
fi
chmod +x "$BIN"/* 2>/dev/null || true

# ── 4. wire up ~/.zshrc ─────────────────────────────────────────────────
say "Configuring ~/.zshrc"
if [[ -f "$HOME/.zshrc" ]] && ! grep -q 'ZSH_KIT' "$HOME/.zshrc"; then
  cp "$HOME/.zshrc" "$HOME/.zshrc.bak.$(date +%Y%m%d%H%M%S)"
fi
cat > "$HOME/.zshrc" <<EOF
# Managed by zsh kit (re-run $KIT/install.sh to regenerate)
export ZSH_KIT="$KIT"
source "\$ZSH_KIT/config/zshrc"
# Put personal tweaks below this line
EOF

# ── 5. terminal font (GNOME Terminal / Cinnamon) ────────────────────────
say "Setting terminal font"
if have gsettings && gsettings list-schemas | grep -qx org.gnome.Terminal.ProfilesList; then
  id="$(gsettings get org.gnome.Terminal.ProfilesList default | tr -d "'")"
  p="org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:$id/"
  gsettings set "$p" use-system-font false
  gsettings set "$p" font 'FiraCode Nerd Font 12'
  gsettings set "$p" use-custom-command true
  gsettings set "$p" custom-command "$(command -v zsh)"
  gsettings set org.gnome.Terminal.Legacy.Settings tab-policy 'always'
  echo "GNOME Terminal profile now uses 'FiraCode Nerd Font 12', starts zsh, and always shows the tab bar."
else
  echo "GNOME Terminal not found — set your terminal's font to 'FiraCode Nerd Font' manually."
fi

# ── 6. default shell ────────────────────────────────────────────────────
say "Done"
if [[ "$(basename "${SHELL:-}")" != zsh ]]; then
  echo "Your login shell is still $SHELL. To make zsh the default, run:"
  echo "    chsh -s \"$(command -v zsh)\""
  echo "then log out and back in."
fi
echo "Open a new terminal, or run: exec zsh"
