#!/bin/bash
source /opt/lab/lib.sh
est=/var/lib/lab-state/f104-2-tune2fs-ajustes
rm -rf "$est"; mkdir -p "$est"
d=$(fresh_dir manutencao)
src=$(mktemp -d)
for i in 1 2 3 4; do head -c $(( (RANDOM % 40 + 5) * 1000 )) /dev/urandom > "$src/relatorio$i.dat"; done
bs=$(shuf -n1 -e 1024 2048 4096)
ratio=$(shuf -n1 -e 4096 8192 16384)
# ext2 antigo, SEM journal, rótulo "antigo", sem verificação periódica
mke2fs -q -t ext2 -b "$bs" -i "$ratio" -L antigo -d "$src" "$d/$P_img.img" 32M
tune2fs -c -1 -i 0 "$d/$P_img.img" >/dev/null 2>&1
dumpe2fs -h "$d/$P_img.img" 2>/dev/null | awk -F: '/^Filesystem UUID:/ { gsub(/ /, "", $2); print $2 }' > "$est/uuid"
for i in 1 2 3 4; do md5sum < "$src/relatorio$i.dat" | cut -d' ' -f1 > "$est/relatorio$i.md5"; done
rm -rf "$src"
chown aluno:aluno "$d/$P_img.img"
echo "cenário pronto em $d"
