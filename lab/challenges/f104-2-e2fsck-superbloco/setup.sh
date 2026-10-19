#!/bin/bash
source /opt/lab/lib.sh
est=/var/lib/lab-state/f104-2-e2fsck-superbloco
rm -rf "$est"; mkdir -p "$est"
d=$(fresh_dir recuperacao)
img=$d/$P_img.img
case $P_bloco in 1024) tam=24M ;; 2048) tam=40M ;; *) tam=136M ;; esac
src=$(mktemp -d); mkdir "$src/anexos"
for f in contrato.txt tabela.dat anexos/foto1.bin anexos/foto2.bin; do
  head -c $(( (RANDOM % 60 + 10) * 1000 )) /dev/urandom > "$src/$f"
  echo "$f $(md5sum < "$src/$f" | cut -d' ' -f1)" >> "$est/sums"
done
mke2fs -q -t ext4 -b "$P_bloco" -L "$P_label" -d "$src" "$img" "$tam"
rm -rf "$src"
info=$(dumpe2fs "$img" 2>/dev/null)
echo "$info" | awk -F: '/^Filesystem UUID:/ { gsub(/ /, "", $2); print $2 }' > "$est/uuid"
echo "$info" | awk '/Backup superblock at/ { gsub(/,/, "", $4); print $4; exit }' > "$est/backup"
ic=$(echo "$info" | awk -F: '/^Inode count:/ { gsub(/ /, "", $2); print $2 }')
fi_=$(echo "$info" | awk -F: '/^Free inodes:/ { gsub(/ /, "", $2); print $2; exit }')
echo $(( ic - fi_ )) > "$est/inodes"
# estraga o superbloco principal (zera 1 KiB a partir do offset 1024)
dd if=/dev/zero of="$img" bs=1024 seek=1 count=1 conv=notrunc 2>/dev/null
chown aluno:aluno "$img"
echo "cenário pronto em $d"
