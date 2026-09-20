# GNOME desktop kit

Everything customised on this machine's GNOME (X11, Linux Mint 22.3) that is not the Zsh kit, clipsnip or the Cinnamon
makeover in `zsh/desktop/`. `bash apply.sh` reapplies the `gsettings` parts (no root, safe to re-run).
Deeper detail: [`../docs/gnome-workspaces.md`](../docs/gnome-workspaces.md), [`../docs/launcher.md`](../docs/launcher.md).

## What is configured
| Area | Setting | Where it lives |
|---|---|---|
| Theme | Dark mode (`color-scheme prefer-dark`, `Adwaita-dark` for GTK3 apps), Adwaita icons | `org.gnome.desktop.interface` |
| Cursor | Bibata-Modern-Classic, size 24 | `org.gnome.desktop.interface` (theme in `~/.icons`) |
| Fonts | UI `Ubuntu 10`, title bars `Ubuntu Medium 10`; FiraCode Nerd Font + JetBrains Mono in `~/.fonts` | interface / wm prefs; fonts installed by the zsh kit |
| Title bars | Minimise / maximise / close on the right | `wm.preferences button-layout` |
| Workspaces | Fixed (not dynamic), primary monitor only, `Super+1..4`, `Super+0`, `Ctrl+Alt+Arrows`, `Super+PgUp/PgDn`; move-window variants with Shift | `wm.keybindings`, `mutter` |
| Add / close workspace | `Super+Ctrl+N` / `Super+Ctrl+W` (max 10, min 1) | `bin/ws-add`, `bin/ws-close` → `~/.local/bin`, custom keybindings |
| Tiling | Edge tiling on, `Super+Left/Right` tile | `mutter` |
| Shell | Hot corner on, battery % shown, `Super+1..9` no longer launch dock apps | interface, `shell.keybindings` |
| Launcher | Ulauncher on `Alt+Space` (window menu moved to `Shift+Alt+Space`) | `~/.config/ulauncher`, see docs/launcher.md |
| Files | `Super+E` opens Files | `media-keys home` |
| Touchpad | Tap to click (natural scroll already default-on) | `peripherals.touchpad` |
| Power | Suspend after 100 min on AC, 20 min on battery | `plugins.power` |
| Clipboard / snipping | `Win+V`, `Win+Shift+S` | [`../clipsnip/`](../clipsnip/README.md) |
| Terminal | Zsh + Powerlevel10k, palette set in the GNOME Terminal profile | [`../zsh/`](../zsh/README.md) |

## Autostart (`~/.config/autostart`)
| Entry | Purpose |
|---|---|
| `clipsnip.desktop` | clipboard history daemon (installed by clipsnip) |
| `ulauncher.desktop` | `ulauncher --hide-window` |
| `mount-shared.desktop` | mounts the shared NTFS drive (UUID `550E85595197DBEC`) with `udisksctl` at login. Machine-specific: change the UUID or delete on other machines |
| `touchegg` (system service) | gesture daemon, running but `~/.config/touchegg/` is empty, so it uses the package defaults |

## Not scripted (machine-specific)
- Wallpaper / lock screen image: `~/.local/share/backgrounds/`, set via `org.gnome.desktop.background picture-uri(-dark)`.
- No GNOME Shell extensions are enabled (`enabled-extensions` is empty); Extension Manager and Tweaks are installed.
- Dock favourites: Files, Chrome, Terminal, VS Code.

## Undo
    gsettings reset-recursively org.gnome.desktop.wm.keybindings
    gsettings reset-recursively org.gnome.shell.keybindings
    gsettings reset-recursively org.gnome.mutter
    gsettings reset org.gnome.desktop.wm.preferences button-layout
    gsettings reset org.gnome.desktop.interface cursor-theme
    gsettings reset org.gnome.desktop.interface gtk-theme
    gsettings reset org.gnome.desktop.interface color-scheme
    dconf reset -f /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/ws-add/
    dconf reset -f /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/ws-close/
    rm ~/.local/bin/ws-add ~/.local/bin/ws-close
