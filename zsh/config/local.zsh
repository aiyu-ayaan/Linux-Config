# Machine-specific shortcuts (not portable) — dual-boot shared NTFS drive (nvme1n1p6, 116 GB)
export SHARED_UUID=550E85595197DBEC
export SHARED="/media/$USER/$SHARED_UUID"
hash -d shared="$SHARED"                 # cd ~shared   (works like ~ for home)
# `shared` = mount it if needed, then cd into it   (`shared -u` unmounts)
shared() {
  if [[ "$1" == -u ]]; then cd ~ && udisksctl unmount -b "/dev/disk/by-uuid/$SHARED_UUID"; return; fi
  mountpoint -q "$SHARED" || udisksctl mount -b "/dev/disk/by-uuid/$SHARED_UUID" >/dev/null || return 1
  cd "$SHARED"
}
