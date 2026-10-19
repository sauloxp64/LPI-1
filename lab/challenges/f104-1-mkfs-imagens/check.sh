#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/sistemas-arquivos
sonda() { blkid -p -o export "$1" 2>/dev/null | grep "^$2=" | head -1 | cut -d= -f2-; }

# --- ext4 ---
f=$d/$P_ext.img
if [ ! -f "$f" ]; then fail "a imagem $P_ext.img não existe"; else
  expect_eq "$P_ext.img é ext4" "$(sonda "$f" TYPE)" "ext4"
  expect_eq "$P_ext.img: rótulo = $P_lbl_ext" "$(sonda "$f" LABEL)" "$P_lbl_ext"
  info=$(dumpe2fs -h "$f" 2>/dev/null)
  bs=$(echo "$info" | awk -F: '/^Block size:/ { gsub(/ /, "", $2); print $2 }')
  expect_eq "$P_ext.img: tamanho do bloco = $P_bloco" "$bs" "$P_bloco"
  tot=$(echo "$info" | awk -F: '/^Block count:/ { gsub(/ /, "", $2); print $2 }')
  res=$(echo "$info" | awk -F: '/^Reserved block count:/ { gsub(/ /, "", $2); print $2 }')
  if [ -n "$tot" ] && [ "$tot" -gt 0 ] && [ -n "$res" ]; then
    pct=$(( (res * 1000 + tot / 2) / tot ))   # em décimos de por cento
    if [ "$pct" -ge $(( P_reserva * 10 - 3 )) ] && [ "$pct" -le $(( P_reserva * 10 + 3 )) ]; then ok "$P_ext.img: blocos reservados = $P_reserva%"
    else fail "$P_ext.img: reserva de blocos = $((pct / 10)).$((pct % 10))% (esperado: $P_reserva%)"; fi
  else fail "$P_ext.img: não consegui ler a reserva de blocos (o sistema de arquivos existe?)"; fi
fi

# --- XFS ---
f=$d/$P_xfs.img
if [ ! -f "$f" ]; then fail "a imagem $P_xfs.img não existe"; else
  expect_eq "$P_xfs.img é XFS" "$(sonda "$f" TYPE)" "xfs"
  expect_eq "$P_xfs.img: rótulo = $P_lbl_xfs" "$(sonda "$f" LABEL)" "$P_lbl_xfs"
fi

# --- FAT32 ---
f=$d/$P_fat.img
if [ ! -f "$f" ]; then fail "a imagem $P_fat.img não existe"; else
  expect_eq "$P_fat.img é vfat" "$(sonda "$f" TYPE)" "vfat"
  expect_eq "$P_fat.img é FAT32" "$(sonda "$f" VERSION)" "FAT32"
  expect_eq "$P_fat.img: rótulo = $P_lbl_fat" "$(sonda "$f" LABEL)" "$P_lbl_fat"
fi

# --- swap ---
f=$d/$P_swap.img
if [ ! -f "$f" ]; then fail "a imagem $P_swap.img não existe"; else
  expect_eq "$P_swap.img é área de troca (swap)" "$(sonda "$f" TYPE)" "swap"
  expect_eq "$P_swap.img: rótulo = $P_lbl_swap" "$(sonda "$f" LABEL)" "$P_lbl_swap"
fi
finish
