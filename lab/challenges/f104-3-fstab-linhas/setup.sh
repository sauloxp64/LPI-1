#!/bin/bash
source /opt/lab/lib.sh
d=$(fresh_dir fstab)
novo_uuid() { cat /proc/sys/kernel/random/uuid; }
# 1) ext4 de dados (UUID aleatório)
mke2fs -q -t ext4 -L "$P_lbl_dados" -U "$(novo_uuid)" "$d/$P_dados.img" 64M
# 2) pendrive FAT (volume ID aleatório => UUID no formato XXXX-XXXX)
truncate -s 64M "$d/$P_usb.img"
mkfs.vfat -n "$P_lbl_usb" -i "$(printf '%08X' $(( (RANDOM << 15) | RANDOM )))" "$d/$P_usb.img" >/dev/null
# 3) área de troca (UUID aleatório)
truncate -s 32M "$d/$P_swp.img"
mkswap -L "$P_lbl_swap" -U "$(novo_uuid)" "$d/$P_swp.img" >/dev/null 2>&1
chown aluno:aluno "$d"/*.img
echo "cenário pronto em $d"
