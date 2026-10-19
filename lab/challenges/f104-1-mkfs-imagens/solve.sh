#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/sistemas-arquivos
mkfs.ext4 -q -L "$P_lbl_ext" -b "$P_bloco" -m "$P_reserva" "$d/$P_ext.img"
mkfs.xfs -q -L "$P_lbl_xfs" "$d/$P_xfs.img"
mkfs.vfat -F 32 -n "$P_lbl_fat" "$d/$P_fat.img" >/dev/null
mkswap -L "$P_lbl_swap" "$d/$P_swap.img" >/dev/null 2>&1
