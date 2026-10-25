# Big dev folders on the U_U drive

Set up on 2026-10-25 to free the 180 GB root partition (82 % full -> 39 %). Anaconda, Android virtual devices, the
Android SDK and the Gradle home live on the 1 TB NTFS drive **U_U** (WD SN570) under `/media/aiyu/U_U/LinuxFiles`.
The old paths are symlinks, so tools and project settings keep working.

| What | Real location | How the old path points there |
|---|---|---|
| Anaconda | `LinuxFiles/anaconda3` | `~/anaconda3` symlink |
| Android virtual devices | `LinuxFiles/android-avd` | `~/.android/avd` symlink |
| Android SDK | `LinuxFiles/Android` | `~/Android` symlink (`~/Android/Sdk` still works for `ANDROID_HOME`, `local.properties`, `~/.local/bin/android17`) |
| Gradle home / caches | `LinuxFiles/gradle` | `GRADLE_USER_HOME` in `~/.config/environment.d/20-gradle-home.conf` (read at login) |

Copies were made with `rsync -rlt --no-perms --no-owner --no-group`, file and symlink counts compared, and the
originals deleted afterwards. The drive is NTFS (`ntfs3`), so everything shows as owned by `aiyu` with open permissions
and these folders are slower than on ext4.

## The drive has to be mounted
If `U_U` is not mounted the symlinks dangle: `conda`, the emulator and Gradle fail (`.../emulator: No such file or
directory`). NVMe device names are not stable (`nvme0n1` and `nvme1n1` swapped after one reboot), so the drive is mounted
by UUID in `/etc/fstab`:

    UUID=F24C61954C61557F /media/aiyu/U_U ntfs3 uid=1000,gid=1000,nofail,x-gvfs-show 0 0

`nofail` keeps boot working without the drive. Backup of the previous file: `/etc/fstab.bak`. udisks deletes an empty
mount point when a drive is unmounted; after a manual `umount` run `sudo mkdir -p /media/aiyu/U_U && sudo mount /media/aiyu/U_U`.
Check with `ls /media/aiyu/U_U/LinuxFiles`.

## Conda channels
conda 26 ships with no channels (`NoChannelsConfiguredError`). `~/.condarc` sets `conda-forge` with strict priority:

    conda config --add channels conda-forge && conda config --set channel_priority strict

## Other cleanup done the same day (not scripted)
Cleared regenerable caches (uv, pip, pnpm, npm, Go build, Docker build cache) and deleted `~/.rustup` and `~/.npm`
(`cargo` needs `rustup default stable` again). Old kernels and apt cache: see the one-line `pkexec` clean-up in the
session notes; it is not part of any kit.

## Undo
Stop using the drive: copy a folder back (`rsync -a /media/aiyu/U_U/LinuxFiles/anaconda3/ ~/anaconda3.new/`), remove the
symlink and rename the copy. For Gradle delete `~/.config/environment.d/20-gradle-home.conf` and log in again.
