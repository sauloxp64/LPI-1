#!/bin/bash
source /opt/lab/lib.sh
est=/var/lib/lab-state/f104-2-e2fsck-superbloco
d=$LAB_DIR/recuperacao
img=$d/$P_img.img
if [ ! -f "$img" ]; then fail "a imagem $P_img.img não existe em ~/lab/recuperacao/"; finish; exit; fi
info=$(dumpe2fs -h "$img" 2>/dev/null)
if [ -z "$info" ]; then fail "o superbloco principal ainda está inválido (dumpe2fs não reconhece o sistema de arquivos)"; finish; exit; fi
ok "o superbloco principal voltou a ser válido (dumpe2fs lê o sistema de arquivos)"
campo() { echo "$info" | awk -F: -v c="$1" '$1 == c { sub(/^ +/, "", $2); print $2 }' | head -1; }

if e2fsck -fn "$img" >/dev/null 2>&1; then ok "e2fsck -fn não encontra mais erros"; else fail "o e2fsck ainda encontra erros no sistema de arquivos"; fi
expect_eq "o rótulo original ($P_label) foi preservado" "$(campo 'Filesystem volume name')" "$P_label"
expect_eq "o UUID original foi preservado (o sistema de arquivos não foi recriado)" "$(campo 'Filesystem UUID')" "$(cat "$est/uuid")"
perdidos=0
while read -r f soma; do
  [ "$(debugfs -R "cat /$f" "$img" 2>/dev/null | md5sum | cut -d' ' -f1)" = "$soma" ] || perdidos=$((perdidos + 1))
done < "$est/sums"
if [ "$perdidos" -eq 0 ]; then ok "os arquivos dentro da imagem foram recuperados intactos"; else fail "$perdidos arquivo(s) da imagem estão ausentes ou alterados"; fi

if [ -f "$d/backup-sb.txt" ]; then
  expect_eq "backup-sb.txt: número do primeiro superbloco de backup" "$(tr -d '[:space:]' < "$d/backup-sb.txt")" "$(cat "$est/backup")"
else fail "o arquivo ~/lab/recuperacao/backup-sb.txt não existe"; fi
if [ -f "$d/inodes-usados.txt" ]; then
  expect_eq "inodes-usados.txt: quantidade de inodes em uso" "$(tr -d '[:space:]' < "$d/inodes-usados.txt")" "$(cat "$est/inodes")"
else fail "o arquivo ~/lab/recuperacao/inodes-usados.txt não existe"; fi
finish
