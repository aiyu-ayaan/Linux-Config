# Catppuccin Mocha kit

One palette across the terminal tools. `bash apply.sh` (no root, safe to re-run) installs everything below.
Palette: base `#1e1e2e`, surface `#313244`, text `#cdd6f4`, mauve `#cba6f7`, pink `#f5c2e7`, red `#f38ba8`.

| Tool | What is set | Where |
|---|---|---|
| GNOME Terminal + zsh prompt | colour palette, Powerlevel10k segments | terminal profile, [`../zsh/`](../zsh/README.md) |
| Header bars and tabs (GTK3) | matching flat dark style | [`../gnome/gtk3.css`](../gnome/README.md) |
| Files, Settings (GTK4) | libadwaita colour overrides | [`../gnome/gtk4.css`](../gnome/README.md) |
| fzf | full Mocha colour set, rounded border | `zsh/config/zshrc` (`FZF_DEFAULT_OPTS`) |
| bat | `Catppuccin Mocha` syntax theme | `bat/` → `~/.config/bat/themes`, `BAT_THEME` in `zsh/config/zshrc` |
| btop | `catppuccin_mocha` | `btop/` → `~/.config/btop/themes`, `color_theme` in `btop.conf` |
| Ulauncher | custom theme (rounded window, mauve selection bar) | `ulauncher-theme/` → `~/.config/ulauncher/user-themes/catppuccin-mocha`, `theme-name` in `settings.json` |
| VS Code | `Catppuccin.catppuccin-vsc` extension installed | colour theme **not** switched, see below |

## VS Code
Your current theme is `Neon Cyberpunk`, so it is left alone. To try Catppuccin: `Ctrl+K Ctrl+T` and pick
"Catppuccin Mocha", or set `"workbench.colorTheme": "Catppuccin Mocha"` in `settings.json`.

## After applying
- Ulauncher: `pkill ulauncher; ulauncher --hide-window &` to load the new theme.
- New terminals pick up `BAT_THEME` and the fzf colours (or `exec zsh`).

## Undo
    sed -i 's|^color_theme = .*|color_theme = "Default"|' ~/.config/btop/btop.conf
    sed -i 's|"theme-name": *"[^"]*"|"theme-name": "dark"|' ~/.config/ulauncher/settings.json
    rm -r ~/.config/ulauncher/user-themes/catppuccin-mocha "$(bat --config-dir)/themes/Catppuccin Mocha.tmTheme"
    # then remove the BAT_THEME line from zsh/config/zshrc, and: code --uninstall-extension Catppuccin.catppuccin-vsc

Themes are from the official Catppuccin repos (MIT): catppuccin/btop and catppuccin/bat.
