# Linux Config

Personal Linux setup kits and notes (Linux Mint / Cinnamon / GNOME on X11). Each kit is self-contained:
copy the folder to another machine and run its installer. No root needed unless noted.

## Contents

| Path | What it is |
|---|---|
| [`zsh/`](zsh/README.md) | Zsh kit: Oh My Zsh, Powerlevel10k, autosuggestions, autocomplete, fast-syntax-highlighting, fzf / eza / bat / zoxide, FiraCode Nerd Font. Also the WhiteSur dark theme, Win11 icons and a Windows-style taskbar (`zsh/desktop/`). |
| [`clipsnip/`](clipsnip/README.md) | Windows-style clipboard history (**Win+V**) and snipping (**Win+Shift+S**) for X11. Shortcut backends for GNOME, Cinnamon and Xfce. |
| [`catppuccin/`](catppuccin/README.md) | Catppuccin Mocha theme for btop, bat and VS Code (fzf and the terminal are in the zsh kit). `catppuccin/apply.sh` installs it. |
| [`gnome/`](gnome/README.md) | GNOME kit: dark theme, Papirus icons, cursor, title buttons, compact blurred top bar, GTK3/GTK4 Catppuccin styling, workspaces (`ws-add` / `ws-close`) with per-workspace app isolation (local extension `workspace-isolation`), top-bar sound menu (volume + output switcher) and brightness menu for the laptop panel and DDC/CI monitors (local extensions), tiling, genie minimise animation, touchpad gestures (touchegg), power-profile switching and low-battery warnings, autostart entries. `gnome/apply.sh` reapplies it. |
| [`docs/gnome-workspaces.md`](docs/gnome-workspaces.md) | GNOME workspace shortcuts and Fedora-style tweaks applied with `gsettings`, plus undo commands. |

## Quick start

    # Shell (needs zsh git curl tar)
    bash zsh/install.sh && exec zsh

    # Clipboard history + snipping (needs python3-gi gir1.2-gtk-3.0)
    bash clipsnip/install.sh

    # Optional: desktop theme, icons and taskbar (Cinnamon)
    bash zsh/desktop/install-desktop.sh

    # Catppuccin theme for btop, bat, VS Code
    bash catppuccin/apply.sh

    # GNOME settings: dark theme, workspaces, shortcuts
    bash gnome/apply.sh

Installers are safe to re-run. See each kit's README for options such as `--uninstall`, `--purge` and `--shortcuts`
(clipsnip), and for restoring the previous look (`zsh/desktop/restore-old-look.sh`).

## Notes

- `zsh/oh-my-zsh/`, `zsh/custom/` and `zsh/desktop/src/` hold third-party projects (Oh My Zsh, plugins,
  Powerlevel10k, WhiteSur) that the installers download or use. They keep their own licenses.
- `zsh/config/local.zsh` is machine-specific (shared drive UUID); edit it on other machines.
- The `mount-shared` autostart entry and the wallpaper are machine-specific too (see `gnome/README.md`).
