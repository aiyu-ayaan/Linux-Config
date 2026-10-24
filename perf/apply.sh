#!/usr/bin/env bash
# System performance tweaks (root). Safe to re-run. See perf/README.md.
#   sudo bash perf/apply.sh                    zram swap, earlyoom, faster GRUB
#   sudo bash perf/apply.sh --no-mitigations   also turn off CPU vulnerability mitigations (security trade-off)
#   sudo bash perf/apply.sh --undo             revert everything
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }

zram_conf=/etc/systemd/zram-generator.conf
sysctl_conf=/etc/sysctl.d/99-zram-perf.conf
earlyoom_conf=/etc/default/earlyoom
grub=/etc/default/grub

if [ "${1:-}" = --undo ]; then
  swapoff /dev/zram0 2>/dev/null || true
  rm -f "$zram_conf" "$sysctl_conf"
  systemctl disable --now earlyoom 2>/dev/null || true
  [ -f "$grub.perf.bak" ] && mv "$grub.perf.bak" "$grub" && update-grub
  sysctl --system >/dev/null
  echo "reverted (packages systemd-zram-generator and earlyoom are left installed)"
  exit 0
fi

apt-get install -y systemd-zram-generator earlyoom

# 1. Compressed RAM swap (zstd, ~3:1). Pages that sit idle get squeezed in RAM instead of
#    the system having nowhere to go when memory runs out. Never touches the SSD.
cat > "$zram_conf" <<'CONF'
[zram0]
zram-size = min(ram / 2, 16384)
compression-algorithm = zstd
swap-priority = 100
CONF
# zram-tuned VM settings (same values as Fedora / Pop!_OS): swapping to zram is cheap,
# so prefer it over dropping file cache; read one page at a time (no seek cost in RAM).
cat > "$sysctl_conf" <<'CONF'
vm.swappiness = 180
vm.page-cluster = 0
vm.watermark_boost_factor = 0
vm.watermark_scale_factor = 125
CONF
systemctl daemon-reload
systemctl start systemd-zram-setup@zram0.service
sysctl --system >/dev/null

# 2. earlyoom: when free RAM and swap both drop under 4 %, kill the largest process
#    (browser tabs / renderers first) instead of letting the desktop freeze for minutes.
#    No quotes or spaces inside the regexes: systemd splits EARLYOOM_ARGS at whitespace.
cat > "$earlyoom_conf" <<'CONF'
EARLYOOM_ARGS="-m 4 -s 4 -r 3600 -n --prefer ^(chrome|chromium|electron|code|node|java) --avoid ^(gnome-shell|Xorg|Xwayland|systemd|gdm|sshd|pipewire|wireplumber)"
CONF
systemctl enable --now earlyoom
systemctl restart earlyoom

# 3. GRUB: 3 s menu instead of 10 s (Windows entry still selectable)
[ -f "$grub.perf.bak" ] || cp "$grub" "$grub.perf.bak"
sed -i 's/^GRUB_TIMEOUT=.*/GRUB_TIMEOUT=3/' "$grub"

# 4. Optional: CPU vulnerability mitigations off (faster syscalls / context switches)
if [ "${1:-}" = --no-mitigations ] && ! grep -q 'mitigations=off' "$grub"; then
  sed -i 's/^GRUB_CMDLINE_LINUX_DEFAULT="\(.*\)"/GRUB_CMDLINE_LINUX_DEFAULT="\1 mitigations=off"/' "$grub"
fi
update-grub

echo; swapon --show; systemctl is-active earlyoom
grep -E '^GRUB_TIMEOUT=|^GRUB_CMDLINE_LINUX_DEFAULT' "$grub"
echo "done. Reboot for GRUB changes."
