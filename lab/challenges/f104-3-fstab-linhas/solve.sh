#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/fstab
sonda() { blkid -p -o export "$1" 2>/dev/null | sed -n "s/^$2=//p" | head -1; }
{
  echo "# fstab de teste"
  echo "UUID=$(sonda "$d/$P_dados.img" UUID)  $P_pt_dados  ext4  defaults,$P_opt1  0  2"
  echo "LABEL=$P_lbl_usb  /media/$P_pt_usb  vfat  noauto,user,$P_opt2  0  0"
  echo "UUID=$(sonda "$d/$P_swp.img" UUID)  none  swap  sw  0  0"
} > "$d/fstab.novo"
chown aluno:aluno "$d/fstab.novo"
