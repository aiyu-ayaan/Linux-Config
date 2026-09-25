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
| Workspace isolation | Alt+Tab limited to the current workspace; dash click opens a new window on the current workspace instead of jumping to where the app runs; running dots per workspace | `app-switcher current-workspace-only`, `extensions/workspace-isolation@aiyu.local` (see `../docs/gnome-workspaces.md`) |
| Add / close workspace | `Super+Ctrl+N` / `Super+Ctrl+W` (max 10, min 1) | `bin/ws-add`, `bin/ws-close` → `~/.local/bin`, custom keybindings |
| Tiling | Edge tiling on, `Super+Left/Right` tile | `mutter` |
| Shell | Hot corner on, battery % shown, `Super+1..9` no longer launch dock apps | interface, `shell.keybindings` |
| Show desktop | `Super+D` minimises all windows on the current workspace only (genie animation per window); press again to restore them with focus — Windows Win+D | `bin/toggle-desktop` → `~/.local/bin`, custom keybinding (native `show-desktop` left unbound: it hides without minimising and skips the animation) |
| Overview / search | `Alt+Space`, `Super+S` and `Super` alone open the GNOME overview. `Super+Space` opens rofi drun (if rofi installed). Window menu is on `Shift+Alt+Space`. Ulauncher was tried and removed | `wm.keybindings`, `shell.keybindings` |
| Files | `Super+E` opens Files; Nautilus uses location entry, always thumbnails/counts, Mocha sidebar (`gtk4.css`) | `media-keys home`, `org.gnome.nautilus.preferences` |
| Qt apps | `adwaita-dark` + qt5ct Mocha palette (`catppuccin/qt/qt5ct.conf`), needs `sudo apt install qt5ct adwaita-qt` | `~/.config/environment.d/10-qt-mocha.conf` |
| Chrome | dark WebUI + GTK4 (`~/.config/chrome-flags.conf`, relaunch to apply) | `gnome/apply.sh` |
| Notifications / OSD | banners on, lock-screen banners off; banner position via extension | `org.gnome.desktop.notifications`, `notification-position@drugo.dev` |
| Top bar monitor | Vitals: CPU / mem / net / system in panel | `Vitals@CoreCoding.com` (#1460) |
| Media controls | MPRIS controls + track slider in panel | `mediacontrols@cliffniff.github.com` (#4470) |
| Sound menu | Volume slider + mute, and every output port (speakers, headphones, USB, HDMI) with a check on the active one | `extensions/audio-output-switcher@aiyu.local` (see below) |
| Brightness menu | One slider per display (laptop panel + DDC/CI monitors), "All displays" slider, `Ctrl+Brightness keys` for all monitors | `extensions/display-brightness@aiyu.local` (see below) |
| Multi-monitor | Launched apps open on the primary monitor, not the one under the mouse (Windows 11 style); login screen uses the session's layout and primary monitor | `extensions/open-on-primary@aiyu.local`, `login-monitors.sh` (root, run by hand). See [`../docs/hybrid-gpu-monitors.md`](../docs/hybrid-gpu-monitors.md), which also covers the NVIDIA / Intel GPU setup |
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

## Top bar, monitor, media and blur (Just Perfection + Blur my Shell + Vitals + Media Controls)
`apply.sh` installs and configures five more extensions (shell restart needed: `Alt+F2`, `r`, Enter).
- **Just Perfection** (#3843): top bar 30 px high, tighter button padding, clock centred, and the world clock, weather,
  events, accessibility, keyboard-layout and notification-dot items hidden. Keys are in `apply.sh`; open its
  preferences in Extension Manager for more (e.g. hide the Activities button).
- **Blur my Shell** (#3193): blurred top bar and overview, and blurred background for GNOME Terminal
  (application whitelist `Gnome-terminal`). Blur strength is `sigma` (25 to 30), window opacity 215/255.
  Add more apps to the whitelist under the extension's "Applications" page, or `enable-all` to blur every window.
- **Vitals** (#1460): CPU / memory / network / system monitor in the top bar. Configured with
  `show-processor/memory/system/network true`, temp/voltage off, 2s refresh.
- **Media Controls** / MPRIS (#4470): player icon + label + prev/play/next + track slider in the top bar.
- **Notification Banner Position** (#4105): banner OSD position (`position 1`).
- **Rofi launcher**: Catppuccin Mocha theme from `../catppuccin/rofi/` (`~/.config/rofi/`), bound to
  `Super+Space` when `rofi` is installed (`sudo apt install rofi`). Ulauncher remains removed.
- Undo: `gnome-extensions disable blur-my-shell@aunetx just-perfection-desktop@just-perfection`
  (disable one at a time if the command only takes one uuid).

## Sound and brightness menus (local extensions)
Both live in `extensions/` and are copied into `~/.local/share/gnome-shell/extensions/` by `apply.sh`. They were rewritten
from scratch on 2026-09-25 because the old versions did not work: the sound menu rebuilt itself on every volume change
(clicks landed on destroyed items), and the upstream ddcutil brightness extension fired overlapping `ddcutil` writes
with ~450 ms DDC sleeps, so the slider lagged and jumped. **On Wayland, log out and back in to load a changed extension**
(`Alt+F2`, `r` only works on X11).

**`audio-output-switcher@aiyu.local`** (speaker / USB / HDMI icon in the top bar)
- Volume slider, mute button and percentage for the current output. It uses the shell's own mixer (Gvc), the same one
  GNOME's quick-settings slider uses, so dragging is instant. Scroll on the icon to change volume (5% steps, OSD shown).
- Output list from `pactl -f json list sinks`: one row per port, the active one ticked. Ports PipeWire marks
  "not available" are still listed ("not detected"), because the laptop speakers hide behind a misdetected headphone
  jack. Picking one runs `pactl set-sink-port` then `pactl set-default-sink`.
- The list refreshes on mixer events (device added/removed, default output changed) and when the menu opens. An open
  menu is only rebuilt when the set of outputs really changed; otherwise just the tick moves.
- Needs `pactl` (`sudo apt install pulseaudio-utils`).

**`display-brightness@aiyu.local`** (sun icon in the top bar)
- Built-in panel: `org.gnome.SettingsDaemon.Power.Screen` over D-Bus (the path GNOME's own slider uses), synced with
  the Fn keys.
- External monitors: found with `ddcutil detect --brief`, brightness is VCP `10`. Each monitor has one writer: while a
  `setvcp` runs, new slider positions only replace the pending value, and the next write sends the latest one. Writes
  use `--noverify --sleep-multiplier 0.1` (~70 ms here instead of ~450 ms). If a fast write fails the monitor falls
  back to normal DDC timing. Monitors that answer no brightness read are left out.
- "All displays" slider when there is more than one display (shows the average). Scroll on the icon, or
  `Ctrl+XF86MonBrightnessUp/Down`, moves every display by 5% and shows the OSD. Values are re-read each time the menu
  opens (not while you drag). Monitor hotplug triggers a new detection after 3 s; "Detect displays again" in the menu
  does it by hand.
- Settings (no prefs window): `GSETTINGS_SCHEMA_DIR=~/.local/share/gnome-shell/extensions/display-brightness@aiyu.local/schemas
  gsettings set org.gnome.shell.extensions.display-brightness-aiyu step 2` (also `increase-shortcut`, `decrease-shortcut`).
- Needs `ddcutil` and access to `/dev/i2c-*`: `sudo apt install ddcutil && sudo usermod -aG i2c $USER` (log in again).
  The laptop panel shows as an "Invalid display" in `ddcutil detect`; that is expected, it is handled by the backlight.
- Replaces `display-brightness-ddcutil@themightydeity.github.com`, which `apply.sh` disables (it was uninstalled here).
- Check logs: `journalctl --user -b | grep -E 'display-brightness|audio-output-switcher'`.
- Undo: `gnome-extensions disable display-brightness@aiyu.local` (or `audio-output-switcher@aiyu.local`).

## Multi-monitor placement (local extension + login screen)
**`open-on-primary@aiyu.local`**: a new window moves to the primary monitor when it is the app's first window or the app
was just launched from the dash, dock, overview or search. Dialogs and windows an open app creates itself (`Ctrl+N`, a
tab dragged out) keep mutter's placement. Undo: `gnome-extensions disable open-on-primary@aiyu.local`.

**`login-monitors.sh`**: copies `~/.config/monitors.xml` to `/var/lib/gdm3/.config/` (sudo) so the login screen shows on
the primary monitor with the right rotation. Re-run after changing the layout. Undo: `sudo rm /var/lib/gdm3/.config/monitors.xml`.
Details and the GPU setup (`prime-select nvidia` on X11): [`../docs/hybrid-gpu-monitors.md`](../docs/hybrid-gpu-monitors.md).

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
`Super+D` (show desktop, `bin/toggle-desktop`) minimises window-by-window precisely so this genie animation plays;
GNOME's native show-desktop is left unbound because it hides windows without minimising and would skip the effect.
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
- GNOME Shell extensions enabled: magic lamp effect, Blur my Shell and Just Perfection, plus the local sound and brightness menus and open-on-primary; Extension Manager and Tweaks are installed.
- Dock favourites: Files, Chrome, Terminal, VS Code.

## Undo
    gsettings reset-recursively org.gnome.desktop.wm.keybindings
    gsettings reset org.gnome.desktop.wm.keybindings show-desktop
    gsettings reset-recursively org.gnome.shell.keybindings
    gsettings reset-recursively org.gnome.mutter
    gsettings reset org.gnome.desktop.wm.preferences button-layout
    gsettings reset org.gnome.desktop.interface cursor-theme
    gsettings reset org.gnome.desktop.interface gtk-theme
    gsettings reset org.gnome.desktop.interface color-scheme
    dconf reset -f /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/ws-add/
    dconf reset -f /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/ws-close/
    dconf reset -f /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/toggle-desktop/
    rm ~/.local/bin/ws-add ~/.local/bin/ws-close ~/.local/bin/toggle-desktop
