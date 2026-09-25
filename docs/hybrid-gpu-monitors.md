# Hybrid GPU and multi-monitor setup (Intel + NVIDIA)

Set up on 2026-09-26 (GNOME 46 on X11, Linux Mint 22.3, kernel 7.0, NVIDIA 580-open driver, Secure Boot on).

## Hardware
| Screen | Connector (X11 / Wayland) | Wired to | Mode |
|---|---|---|---|
| SKG 27I200Q (primary) | `DP-0` / `DP-1` | NVIDIA GTX 1650 | 2560x1440 @ 200 Hz |
| Acer EK240Y P6 (portrait, left) | `HDMI-0` / `HDMI-1` | NVIDIA GTX 1650 | 1920x1080 @ 144 Hz, rotated left |
| Laptop panel | `eDP-1-1` / `eDP-1` | Intel UHD 610 | 1920x1080 @ 144 Hz |

Both external ports are wired to the NVIDIA GPU; only the laptop panel is on Intel. That is what decides how the
desktop has to be set up.

## GPU mode: `prime-select nvidia` (X11)
In `on-demand` mode the Intel GPU is the X server's primary GPU. On X11 that means the UHD 610 (the weakest Comet Lake
iGPU) renders the whole 1440p@200 + 2x1080p@144 desktop and copies every frame to the NVIDIA GPU just to reach the DP and
HDMI ports ("reverse PRIME"). The X log showed `glamor ... on Mesa Intel UHD Graphics`, NVIDIA as a secondary `G0` screen
and `your system is too slow`: the desktop lagged.

    sudo prime-select nvidia     # then reboot and pick "GNOME on Xorg" (gear icon on the login screen)

NVIDIA then renders everything and drives the external monitors directly; the laptop panel is fed through the Intel GPU
as a PRIME output sink (`xrandr --listproviders` shows `NVIDIA-0` source, `modesetting` sink). `nvidia_drm modeset=1`
(set by the driver package in `/etc/modprobe.d/`) gives PRIME Sync, so the laptop panel does not tear.

- Cost: the NVIDIA GPU stays powered. With the external monitors plugged in it is on anyway (~15 W in P0), so docked there
  is no real loss. On battery without monitors: `sudo prime-select on-demand` and reboot.
- X11 syncs the compositor to one monitor, so the 144 Hz screens can look slightly less smooth next to the 200 Hz one.
- After switching, the connectors are renamed (`DP-1` → `DP-0`, `eDP-1` → `eDP-1-1`), so set the layout once in
  Settings > Displays. `~/.config/monitors.xml` keeps one entry per connector set.
- Undo: `sudo prime-select on-demand`, reboot, pick "GNOME" (Wayland) at login.

### Wayland alternative (kept installed)
On Wayland, mutter handles two GPUs itself and can pick the NVIDIA GPU as its primary. Two system files (not in this repo,
made 2026-09-24) do this only when an external monitor is plugged into the NVIDIA ports at boot:

`/etc/udev/rules.d/61-mutter-auto-primary-gpu.rules`

    SUBSYSTEM=="drm", ENV{DEVTYPE}=="drm_minor", ENV{DEVNAME}=="/dev/dri/card[0-9]*", SUBSYSTEMS=="pci", ATTRS{vendor}=="0x10de", ATTRS{device}=="0x1f99", PROGRAM="/usr/local/bin/nvidia-external-connected %k", TAG+="mutter-device-preferred-primary"

`/usr/local/bin/nvidia-external-connected` exits 0 when any non-eDP connector of that card reads `connected`.
Check with `journalctl --user -b | grep 'selected primary'`. The rule is read at boot, so plug the monitors in before
booting. Wayland limits screen sharing to what the portal offers (whole screen or one window via the GNOME picker, with
`chrome://flags/#enable-webrtc-pipewire-capturer`), which is why the X11 setup above is the main one.

## Login screen on the primary monitor (`gnome/login-monitors.sh`)
GDM runs its own X11 session as user `gdm` and has no `monitors.xml`, so it does not know which screen is primary. The
NVIDIA X driver then lists `HDMI-0` first and the login box lands on the portrait monitor, unrotated.

    bash gnome/login-monitors.sh     # copies ~/.config/monitors.xml to /var/lib/gdm3/.config/ (asks for sudo)

Re-run it after changing the layout in Settings > Displays. The file holds both the X11 and the Wayland connector names,
so it works for either greeter. Undo: `sudo rm /var/lib/gdm3/.config/monitors.xml`.

The lock screen (`Super+L`, idle lock) is drawn by the session's GNOME Shell on its primary monitor, so it follows
Settings > Displays. It was on the portrait monitor only during the first X11 login, before the layout was saved and
`HDMI-0` was still the default primary.

## Apps open on the primary monitor (`open-on-primary@aiyu.local`)
Mutter places a new window on the monitor under the mouse. With the pointer resting on the portrait monitor, launched
apps opened there. The local extension (installed by `gnome/apply.sh`) moves a new window to the primary monitor when:

- it is the app's first window (fresh launch from anywhere: dash, dock, overview, rofi, terminal, autostart), or
- the app was launched from the shell (dash, dock, overview, search) in the last 10 s, even if it already had windows.

It leaves alone dialogs and other transient windows (they stay with their parent) and new windows an open app makes
by itself (`Ctrl+N`, a browser tab dragged out), which stay where mutter puts them, like on Windows 11. Splash screens
move with the app. The move happens on `map`, after mutter's placement and before the first frame, so nothing jumps.

- Load after installing or changing it: `Alt+F2`, `r`, Enter (X11). On Wayland, log out and in.
- Logs: `journalctl --user -b | grep open-on-primary`.
- Undo: `gnome-extensions disable open-on-primary@aiyu.local`.
