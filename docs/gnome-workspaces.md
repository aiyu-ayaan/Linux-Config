# GNOME workspaces & Fedora-style setup

Applied with `gsettings` on 2026-09-20 (GNOME on X11, Linux Mint 22.3).

## Workspace shortcuts
| Keys | Action |
|---|---|
| Super+1 … Super+4 | Go to workspace 1–4 |
| Super+0 | Go to last workspace |
| Ctrl+Alt+Left / Right, Super+PageUp / PageDown | Previous / next workspace |
| Super+Shift+1 … 4 | Move window to workspace 1–4 |
| Ctrl+Alt+Shift+Left / Right, Super+Shift+PageUp / PageDown | Move window to prev / next workspace |
| Super+Left / Right | Tile window left / right (window management) |
| Super (alone) | Activities overview |

Workspaces are fixed at 4 (dynamic workspaces off).
Super+1..9 no longer launch dock apps (`switch-to-application-N` cleared).

## Fedora-style tweaks
- Adwaita GTK + icon theme
- Minimize / maximize / close buttons in title bars
- Hot corner on, edge tiling on, battery percentage shown

## Undo
    gsettings reset-recursively org.gnome.desktop.wm.keybindings
    gsettings reset-recursively org.gnome.shell.keybindings
    gsettings reset org.gnome.mutter dynamic-workspaces
    gsettings reset org.gnome.desktop.wm.preferences button-layout

## Add / close workspaces
| Keys | Action |
|---|---|
| Super+Ctrl+N | Add a workspace (max 10) and switch to it |
| Super+Ctrl+W | Close the last workspace (min 1); its windows move to the previous one |

Scripts: `~/.local/bin/ws-add`, `~/.local/bin/ws-close` (they change `num-workspaces`).
`Super+1..4` only cover the first four; use `Ctrl+Alt+←/→` for the rest.

## Files / theme
- Super+E opens the file manager (GNOME Files); `media-keys home`.
- Dark mode: `color-scheme prefer-dark` + `gtk-theme Adwaita-dark` (GTK3 apps such as Nemo ignore color-scheme and need the dark GTK theme).
