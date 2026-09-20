# GNOME desktop kit

Everything customised on this machine's GNOME (X11, Linux Mint 22.3) that is not the Zsh kit, clipsnip or the Cinnamon
makeover in `zsh/desktop/`. `bash apply.sh` reapplies the `gsettings` parts (no root, safe to re-run).
Deeper detail: [`../docs/gnome-workspaces.md`](../docs/gnome-workspaces.md).

## What is configured
| Area | Setting | Where it lives |
|---|---|---|
| Theme | Dark mode (`color-scheme prefer-dark`, `Adwaita-dark` for GTK3 apps), Papirus-Dark icons (system package) | `org.gnome.desktop.interface` |
| Cursor | Bibata-Modern-Classic, size 24 | `org.gnome.desktop.interface` (theme in `~/.icons`) |
| Fonts | UI `Ubuntu 10`, title bars `Ubuntu Medium 10`; FiraCode Nerd Font + JetBrains Mono in `~/.fonts` | interface / wm prefs; fonts installed by the zsh kit |
| Title bars | Minimise / maximise / close on the right | `wm.preferences button-layout` |
| Workspaces | Fixed (not dynamic), primary monitor only, `Super+1..4`, `Super+0`, `Ctrl+Alt+Arrows`, `Super+PgUp/PgDn`; move-window variants with Shift | `wm.keybindings`, `mutter` |
| Add / close workspace | `Super+Ctrl+N` / `Super+Ctrl+W` (max 10, min 1) | `bin/ws-add`, `bin/ws-close` → `~/.local/bin`, custom keybindings |
| Tiling | Edge tiling on, `Super+Left/Right` tile | `mutter` |
| Shell | Hot corner on, battery % shown, `Super+1..9` no longer launch dock apps | interface, `shell.keybindings` |
| Launcher | None. Ulauncher was tried and removed; `Super` (or `Super+S`) opens the GNOME overview / search, `Alt+Space` is the window menu | `wm.keybindings`, `shell.keybindings` |
| Files | `Super+E` opens Files | `media-keys home` |
| Touchpad | Tap to click (natural scroll already default-on) | `peripherals.touchpad` |
| Power | Suspend after 100 min on AC, 20 min on battery | `plugins.power` |
| Clipboard / snipping | `Win+V`, `Win+Shift+S` | [`../clipsnip/`](../clipsnip/README.md) |
| Terminal | Zsh + Powerlevel10k, palette set in the GNOME Terminal profile | [`../zsh/`](../zsh/README.md) |

## Header bar / tab style (`gtk3.css`)
`apply.sh` installs `gtk3.css` as `~/.config/gtk-3.0/gtk.css` (an existing file is saved as `gtk.css.bak`). It restyles GTK3
header bars and tabs to match the Catppuccin Mocha terminal profile: flat dark bar with a thin divider, pill-shaped
buttons that light up mauve on hover, round window buttons (close turns red), tabs with a mauve underline on the active one,
rounded window corners. It applies to every GTK3 app with a header bar (GNOME Terminal, and others), not just the terminal.
Tweak the `@define-color` values at the top. Undo: `rm ~/.config/gtk-3.0/gtk.css` (or restore the `.bak`) and reopen the app.

## Top bar and blur (Just Perfection + Blur my Shell)
`apply.sh` installs and configures two more extensions (both need the shell restart: `Alt+F2`, `r`, Enter).
- **Just Perfection** (#3843): top bar 30 px high, tighter button padding, clock centred, and the world clock, weather,
  events, accessibility, keyboard-layout and notification-dot items hidden. Keys are in `apply.sh`; open its
  preferences in Extension Manager for more (e.g. hide the Activities button).
- **Blur my Shell** (#3193): blurred top bar and overview, and blurred background for GNOME Terminal
  (application whitelist `Gnome-terminal`). Blur strength is `sigma` (25 to 30), window opacity 215/255.
  Add more apps to the whitelist under the extension's "Applications" page, or `enable-all` to blur every window.
- Undo: `gnome-extensions disable blur-my-shell@aunetx just-perfection-desktop@just-perfection`
  (disable one at a time if the command only takes one uuid).

## GTK4 / libadwaita apps (`gtk4.css`)
Files, Settings and other libadwaita apps read `~/.config/gtk-4.0/gtk.css` and `gtk-dark.css`. Those were symlinks to the
WhiteSur theme from the Cinnamon makeover; `apply.sh` renames them to `*.whitesur.bak` and installs `gtk4.css`, which
overrides libadwaita's named colours with Catppuccin Mocha (mauve accent, `#1e1e2e` windows, `#181825` header bars and
sidebars). Reopen an app to see it. Undo: `cd ~/.config/gtk-4.0 && for f in gtk gtk-dark; do rm $f.css; mv $f.css.whitesur.bak $f.css; done`.

## Icons and cursor
Icon theme is **Papirus-Dark** (installed system-wide already, `sudo apt install papirus-icon-theme` elsewhere), cursor is
Bibata-Modern-Classic. Undo: `gsettings reset org.gnome.desktop.interface icon-theme`.

## Battery and power (`bin/power-watch`)
A small background script started at login (`~/.config/autostart/power-watch.desktop`, installed by `apply.sh`), only on
machines with a battery.
- Plug in: profile `performance` and a "Charger connected" notification. Unplug: profile `balanced` and "On battery".
  Override with `POWER_AC_PROFILE` / `POWER_BAT_PROFILE` (`power-saver`, `balanced`, `performance`).
- Notifications at 20% ("Battery low") and 10% (critical), once per discharge.
- GNOME's own `power-saver-profile-on-low-battery` still switches to power-saver at its low threshold.
- Stop it: `pkill -f power-watch` and `rm ~/.config/autostart/power-watch.desktop`.

## Window animations (Mac-style genie)
`apply.sh` installs and enables the GNOME extension **Compiz alike magic lamp effect** (extensions.gnome.org #3740, needs
internet once). Minimising a window now sucks it into the dock/taskbar like the macOS genie, and restoring pulls it back out.
**Restart the shell once to load it: `Alt+F2`, type `r`, Enter** (X11 keeps your windows open).
Speed and style: open the extension's settings (Extension Manager > Compiz alike magic lamp effect > gear, or
`gnome-extensions prefs compiz-alike-magic-lamp-effect@hermes83.github.com`). Default duration is 400 ms.
Open / close / maximise keep GNOME's built-in zoom-and-fade animations (`enable-animations true`), which already resemble macOS.
Undo: `gnome-extensions disable compiz-alike-magic-lamp-effect@hermes83.github.com`.

## Gestures (touchegg)
`touchegg.conf` is copied to `~/.config/touchegg/` by `apply.sh`, which also restarts the client. Needs `sudo apt install touchegg` (X11 only).
| Gesture | Action |
|---|---|
| 3-finger swipe left / right | Next / previous workspace |
| 3-finger swipe up | Activities overview |
| 3-finger swipe down | Show desktop |
| 4-finger swipe left / right | Tile window left / right |
| 4-finger swipe up / down | Maximise-restore / minimise window |
| 4-finger pinch in / out | Overview / app grid |
| 2-finger tap / 3-finger tap | Right click / middle click |
| 2-finger pinch in browsers | Zoom page |

These differ from the package defaults (which use 3-finger swipes for maximise/tile and 4-finger for workspaces, and
3-finger pinch to close a window; I dropped that one because it closes windows by accident). Edit the file and re-run
`apply.sh` to change them. Undo: `rm ~/.config/touchegg/touchegg.conf && pkill -x touchegg; touchegg &`.

## Autostart (`~/.config/autostart`)
| Entry | Purpose |
|---|---|
| `clipsnip.desktop` | clipboard history daemon (installed by clipsnip) |
| `mount-shared.desktop` | mounts the shared NTFS drive (UUID `550E85595197DBEC`) with `udisksctl` at login. Machine-specific: change the UUID or delete on other machines |
| `touchegg` (system service + `/etc/xdg/autostart` client) | gesture daemon; config in `touchegg.conf`, see Gestures below |

## Not scripted (machine-specific)
- Wallpaper / lock screen image: `~/.local/share/backgrounds/`, set via `org.gnome.desktop.background picture-uri(-dark)`.
- GNOME Shell extensions enabled: magic lamp effect, Blur my Shell and Just Perfection; Extension Manager and Tweaks are installed.
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
