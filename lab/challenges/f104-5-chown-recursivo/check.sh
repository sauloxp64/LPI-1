#!/bin/bash
source /opt/lab/lib.sh
est=/var/lib/lab-state/f104-5-chown-recursivo
d=$LAB_DIR/$P_pasta
if [ ! -d "$d" ]; then fail "a pasta ~/lab/$P_pasta não existe"; finish; exit; fi
total=$(find "$d" | wc -l)
n=$(find "$d" \( ! -user "$P_usuario" -o ! -group "$P_grupo" \) | wc -l)
if [ "$n" -eq 0 ]; then ok "todos os $total itens pertencem a $P_usuario:$P_grupo (pasta, subpastas e arquivos)"; else fail "$n de $total itens ainda não pertencem a $P_usuario:$P_grupo"; fi
n=$(find "$d" -perm /007 | wc -l)
if [ "$n" -eq 0 ]; then ok "nenhum item dá qualquer permissão aos outros usuários"; else fail "$n item(ns) ainda têm alguma permissão para 'outros'"; fi
alterados=0; sumiu=0
while IFS='|' read -r rel modo; do
  alvo="$d/$rel"; [ -z "$rel" ] && alvo="$d"
  if [ ! -e "$alvo" ]; then sumiu=$((sumiu + 1)); continue; fi
  atual=$(stat -c %a "$alvo")
  [ $(( 8#$atual & 8#770 )) -eq $(( 8#$modo & 8#770 )) ] || alterados=$((alterados + 1))
done < "$est/modos"
if [ "$sumiu" -eq 0 ]; then ok "nenhum arquivo foi apagado ou movido"; else fail "$sumiu item(ns) da árvore original sumiram"; fi
if [ "$alterados" -eq 0 ]; then ok "as permissões de dono e grupo foram mantidas como estavam (só os 'outros' foram zerados)"; else fail "$alterados item(ns) tiveram as permissões de dono/grupo alteradas — o enunciado pede para preservá-las"; fi
finish
