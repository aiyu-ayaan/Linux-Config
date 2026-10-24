# Performance kit

System-level tweaks for this laptop (ASUS TUF Gaming F15 FX506LHB: i5-10200H, GTX 1650 Mobile, 32 GB RAM,
WD SN570 NVMe, Linux Mint 22.3 / Ubuntu 24.04 base, kernel 7.0). Needs root. Nothing here turns off animations,
effects or desktop features.

    sudo bash perf/apply.sh                    # zram swap, earlyoom, 3 s GRUB menu
    sudo bash perf/apply.sh --no-mitigations   # same + CPU vulnerability mitigations off
    sudo bash perf/apply.sh --undo             # revert

Reboot after the first run (GRUB). zram and earlyoom take effect immediately.

## What it changes
| Change | Why | Files |
|---|---|---|
| zram swap, zstd, up to 16 GB (half of RAM) at priority 100 | There was no swap at all: a memory spike (many Chrome tabs, Docker, builds) had nowhere to go and froze the desktop. zram compresses idle pages in RAM (~3:1), never writes to the SSD | `/etc/systemd/zram-generator.conf` (`systemd-zram-generator`) |
| `vm.swappiness 180`, `page-cluster 0`, `watermark_boost_factor 0`, `watermark_scale_factor 125` | zram-tuned values (Fedora / Pop!_OS): swapping to RAM is cheaper than dropping file cache | `/etc/sysctl.d/99-zram-perf.conf` |
| earlyoom: kill the largest process when RAM and swap are both under 4 %, browsers / Electron / node first, never gnome-shell, Xorg, PipeWire | Out of memory then costs one tab instead of a minutes-long freeze; a desktop notification says what was killed | `/etc/default/earlyoom` |
| GRUB menu 3 s instead of 10 s | 7 s off every boot; the Windows entry is still selectable | `/etc/default/grub` (backup `grub.perf.bak`) |
| Optional `mitigations=off` | Spectre / Meltdown / MDS / etc. mitigations cost speed on syscalls and context switches (browsers, Docker, compilers, I/O heavy work), more on a 10th-gen Intel than newer CPUs. **Security trade-off**: it reopens those CPU side-channel attacks, e.g. from JavaScript in a malicious page or a hostile container. Only use it if you accept that | GRUB kernel command line |

## Already at maximum (checked 2026-10-25, nothing to change)
- CPU: `intel_pstate` active, turbo on, energy-performance preference `performance` on AC (set by
  power-profiles-daemon, switched by `gnome/bin/power-watch`). All cores reach 4.0-4.1 GHz.
- ASUS fan / thermal mode: Turbo (`/sys/devices/platform/asus-nb-wmi/throttle_thermal_policy` = 1,
  `platform_profile performance`), selected by the same power profile.
- CPU power limits: PL1 200 W / PL2 78 W from the BIOS, i.e. not power-capped; the CPU runs until it hits 100 °C.
- NVMe: I/O scheduler `none`, weekly TRIM (`fstrim.timer`). GPU: `prime-select nvidia`, no power or thermal slowdown
  reported by `nvidia-smi -q -d PERFORMANCE` (see `../docs/hybrid-gpu-monitors.md`).

## The real limit: heat
`/sys/devices/system/cpu/cpu0/thermal_throttle/package_throttle_total_time_ms` showed ~695 s of thermal throttling in
2 h of uptime: under load the CPU reaches 100 °C and drops its clocks. Software cannot raise that ceiling here:
- Undervolting (the usual fix, -80 to -120 mV often gives 10-15 °C) needs MSR writes, which kernel lockdown blocks
  while Secure Boot is on, and many 10th-gen ASUS BIOSes lock it as well (Plundervolt).
- What works: clean the fans and heatsink fins, replace the thermal paste (a 2020 TUF F15 usually gains 10+ °C), raise
  the back of the laptop or use a cooling pad. The CPU and GPU share heat pipes, so GPU load also heats the CPU.

Check throttling yourself:

    grep . /sys/devices/system/cpu/cpu0/thermal_throttle/*total_time_ms
    sensors | grep -E 'Package|Core'

## Undo
`sudo bash perf/apply.sh --undo` removes the zram and sysctl files, stops earlyoom and restores `/etc/default/grub`
from the backup (then runs `update-grub`). Reboot afterwards.
