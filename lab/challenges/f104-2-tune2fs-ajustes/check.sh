#!/bin/bash
source /opt/lab/lib.sh
est=/var/lib/lab-state/f104-2-tune2fs-ajustes
d=$LAB_DIR/manutencao
img=$d/$P_img.img
if [ ! -f "$img" ]; then fail "a imagem $P_img.img não existe em ~/lab/manutencao/"; finish; exit; fi
info=$(dumpe2fs -h "$img" 2>/dev/null)
campo() { echo "$info" | awk -F: -v c="$1" '$1 == c { sub(/^ +/, "", $2); print $2 }' | head -1; }
if [ -z "$info" ]; then fail "não consegui ler o sistema de arquivos da imagem (ela foi apagada ou corrompida?)"; finish; exit; fi

# o FS original precisa ter sido preservado (nada de mke2fs de novo)
expect_eq "o sistema de arquivos original foi preservado (mesmo UUID)" "$(campo 'Filesystem UUID')" "$(cat "$est/uuid")"
perdidos=0
for i in 1 2 3 4; do
  [ "$(debugfs -R "cat /relatorio$i.dat" "$img" 2>/dev/null | md5sum | cut -d' ' -f1)" = "$(cat "$est/relatorio$i.md5")" ] || perdidos=$((perdidos + 1))
done
if [ "$perdidos" -eq 0 ]; then ok "os arquivos gravados na imagem continuam íntegros"; else fail "$perdidos arquivo(s) da imagem foram perdidos ou alterados"; fi

# 1) journal => ext3
if echo "$(campo 'Filesystem features')" | grep -qw has_journal; then ok "o sistema de arquivos agora tem journal (ext3)"; else fail "o sistema de arquivos ainda não tem journal (continua ext2)"; fi
expect_eq "tipo detectado pelo blkid = ext3" "$(blkid -p -o export "$img" 2>/dev/null | sed -n 's/^TYPE=//p')" "ext3"
# 2) rótulo
expect_eq "rótulo = $P_label" "$(campo 'Filesystem volume name')" "$P_label"
# 3) reserva de blocos
tot=$(campo 'Block count'); res=$(campo 'Reserved block count')
if [ -n "$tot" ] && [ "$tot" -gt 0 ]; then
  pct=$(( (res * 1000 + tot / 2) / tot ))
  if [ "$pct" -ge $(( P_reserva * 10 - 3 )) ] && [ "$pct" -le $(( P_reserva * 10 + 3 )) ]; then ok "blocos reservados = $P_reserva%"
  else fail "blocos reservados = $((pct / 10)).$((pct % 10))% (esperado: $P_reserva%)"; fi
fi
# 4) contagem máxima de montagens e intervalo
expect_eq "contagem máxima de montagens = $P_montagens" "$(campo 'Maximum mount count')" "$P_montagens"
intervalo=$(campo 'Check interval' | awk '{ print $1 }')
expect_eq "intervalo entre verificações = $P_dias dias" "$intervalo" "$((P_dias * 86400))"
# 5) info.txt
if [ -f "$d/info.txt" ]; then
  b=$(sed -nE 's/^ *bloco *= *([0-9]+) *$/\1/p' "$d/info.txt" | head -1)
  n=$(sed -nE 's/^ *inodes *= *([0-9]+) *$/\1/p' "$d/info.txt" | head -1)
  expect_eq "info.txt: bloco = tamanho do bloco do sistema de arquivos" "$b" "$(campo 'Block size')"
  expect_eq "info.txt: inodes = total de inodes do sistema de arquivos" "$n" "$(campo 'Inode count')"
else fail "o arquivo ~/lab/manutencao/info.txt não existe"; fi
# 6) integridade final
if e2fsck -fn "$img" >/dev/null 2>&1; then ok "e2fsck -fn não encontra erros"; else fail "o e2fsck encontra erros no sistema de arquivos"; fi
finish
