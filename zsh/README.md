# Zsh kit

Oh My Zsh + Powerlevel10k (icons) + zsh-autosuggestions + zsh-autocomplete +
fast-syntax-highlighting + fzf / eza / bat / zoxide, with FiraCode Nerd Font.

## Use anywhere
Copy this folder to any Linux machine (needs `zsh git curl tar`), then:

    bash install.sh && exec zsh

Re-running is safe. No sudo needed. To make zsh your login shell: `chsh -s $(which zsh)`.

## Layout
- `install.sh`  installer (fonts, plugins, tools, ~/.zshrc, terminal font)
- `config/zshrc` main config; `config/p10k.zsh` prompt (run `p10k configure` to restyle)
- `fonts/`      FiraCode Nerd Font files
- `oh-my-zsh/`, `custom/`  downloaded by install.sh

## Handy keys
- `→` / `Ctrl+Space` accept grey suggestion   - `Tab` complete, `↓` enter menu
- `Ctrl+R` history search (fzf)   - `Ctrl+T` file picker   - `Alt+C` cd picker
- `z <dir>` jump   - `ll`, `lt` icon listings

Turn off the live completion popup: add `export ZSH_KIT_AUTOCOMPLETE=0` to the bottom of `~/.zshrc`.

## Desktop look (Cinnamon)
`desktop/install-desktop.sh` installs the WhiteSur dark theme + icons and a 40px panel (no sudo).
`desktop/restore-old-look.sh` returns to the previous Mint-Y look.
The terminal palette (Catppuccin-style) is set by hand in GNOME Terminal's profile.
Locale: the config forces a UTF-8 locale (system default `en_IN` isn't UTF-8, which breaks btop).

## Clipboard & screenshots
Moved to its own kit: `~/ai/clipsnip/` (Win+V history, Win+Shift+S snipping) — see its README.

## Terminal resize
`config/zshrc` defines `TRAPWINCH` to clear and redraw the prompt when the terminal is resized or maximised, because
the multi-line Powerlevel10k prompt otherwise leaves ghost copies. Remove that function if you don't want it.

## Prompt colours
`config/p10k.zsh` ends with a "Programmer palette (Catppuccin Mocha)" override block: pastel segments with dark
text, dark segments for Node/Python/Go/Rust/Java versions (shown only inside such projects), exec time, clock.
Don't run `p10k configure` unless you want to overwrite it. Don't `source ~/.bashrc` from zsh.

## Windows-style taskbar & tray
`desktop/taskbar.css` (applied by install-desktop.sh): 44px panel, grey underline = app running, blue underline +
lighter tile = focused window. Tray: status icons → drives → keyboard → network → sound → battery → two-line
clock → notifications → show-desktop. Icons: Win11 icon theme. Not available: Windows' "^" hidden-icons flyout.
Restart Chrome after theme changes so it re-reads the Windows-style window buttons.

## Shared drive shortcuts (this laptop only)
`config/local.zsh` (sourced by zshrc; edit the UUID on another machine): `$SHARED`, `cd ~shared`, `~/shared` symlink,
`shared` (mounts if needed, then cd; `shared -u` unmounts). Also a Nemo sidebar bookmark and mount-at-login autostart.
