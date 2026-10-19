#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/recuperacao
img=$d/$P_img.img
e2fsck -fy "$img" >/dev/null 2>&1
dumpe2fs "$img" 2>/dev/null | awk '/Backup superblock at/ { gsub(/,/, "", $4); print $4; exit }' > "$d/backup-sb.txt"
dumpe2fs -h "$img" 2>/dev/null | awk -F: '/^Inode count:/ { gsub(/ /, "", $2); ic=$2 } /^Free inodes:/ { gsub(/ /, "", $2); fi_=$2 } END { print ic - fi_ }' > "$d/inodes-usados.txt"
chown aluno:aluno "$d"/*.txt
