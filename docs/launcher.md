# Ulauncher (Spotlight / PowerToys Run style)

- Hotkey: **Alt+Space** (window menu moved to Shift+Alt+Space; the GNOME overview shortcut `toggle-overview` was also on Alt+Space and
  opened the Activities screen instead, so it is now `Super+S`)
- Config: `~/.config/ulauncher/settings.json` (dark theme, 3 recent apps)
- Autostart: `~/.config/autostart/ulauncher.desktop` (`ulauncher --hide-window`)

## Built in
- Type an app name to launch it
- `~` or `/` to browse files and folders
- Web shortcuts: `g <q>` Google, `so <q>` Stack Overflow, `wiki <q>` Wikipedia

## Extensions (Preferences > Extensions > Add extension, paste URL)
Browse https://ext.ulauncher.io for calculator, unit converter, clipboard,
window switcher, and plocate file search.

## Undo
    sudo apt remove ulauncher
    sudo add-apt-repository --remove ppa:agornostal/ulauncher
    rm ~/.config/autostart/ulauncher.desktop
    gsettings reset org.gnome.desktop.wm.keybindings activate-window-menu
    gsettings reset org.gnome.shell.keybindings toggle-overview   # note: gives Alt+Space back to the overview
