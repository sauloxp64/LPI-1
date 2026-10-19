#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/manutencao
img=$d/$P_img.img
tune2fs -j "$img" >/dev/null 2>&1
tune2fs -L "$P_label" -m "$P_reserva" -c "$P_montagens" -i "${P_dias}d" "$img" >/dev/null
{
  echo "bloco=$(dumpe2fs -h "$img" 2>/dev/null | awk -F: '/^Block size:/ { gsub(/ /, "", $2); print $2 }')"
  echo "inodes=$(dumpe2fs -h "$img" 2>/dev/null | awk -F: '/^Inode count:/ { gsub(/ /, "", $2); print $2 }')"
} > "$d/info.txt"
chown aluno:aluno "$d/info.txt"
