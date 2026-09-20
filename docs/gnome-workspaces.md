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

## Full workspace isolation
Goal: each workspace behaves like its own desktop. Chrome running on workspace 1 must not pull you back
to workspace 1 when you open it from workspace 3.

| Layer | How |
|---|---|
| Alt+Tab | `org.gnome.shell.app-switcher current-workspace-only true` lists only windows of the current workspace |
| Dash click / Enter | Extension `workspace-isolation@aiyu.local` (`gnome/extensions/`): if the app runs, but has no window on the current workspace, it opens a **new window here** (`app.open_new_window`) instead of activating the one on another workspace. If it has a window here, it is focused as usual |
| Running dots | The dot under a dash icon shows only when the app has a window on the current workspace |
| Windows | Sticky ("always on all workspaces") windows count as present everywhere |

Notes
- Apps without a "new window" action (`can_open_new_window()` false, e.g. single-instance apps) fall back to the stock behaviour and jump to their workspace.
- Whether the new window is a real separate window depends on the app: Chrome, Terminal, Files and VS Code open one.
- Install: `gnome/apply.sh` copies the extension to `~/.local/share/gnome-shell/extensions/` and enables it. On X11 restart the shell once
  (`Alt+F2`, `r`, Enter) or log out and in so the new extension is detected.
- Undo: `gnome-extensions disable workspace-isolation@aiyu.local` and
  `gsettings reset org.gnome.shell.app-switcher current-workspace-only`.
- Debug: `journalctl -f -o cat /usr/bin/gnome-shell` or Looking Glass (`Alt+F2`, `lg`).
