#!/bin/bash
source /opt/lab/lib.sh
img=$LAB_DIR/particoes-mbr/$P_disco.img
MIB=2048   # setores de 512 bytes por MiB
if [ ! -f "$img" ]; then fail "a imagem ~/lab/particoes-mbr/$P_disco.img não existe"; finish; exit; fi

tam=$(stat -c %s "$img")
expect_eq "a imagem tem $P_tam MiB" "$tam" "$((P_tam * 1048576))"
saida=$(sfdisk -d "$img" 2>/dev/null)
lbl=$(echo "$saida" | awk '/^label:/ { print $2 }')
if [ "$lbl" != "dos" ]; then fail "a tabela de partições deve ser MBR (dos); encontrado: '${lbl:-nenhuma}'"; finish; exit; fi
ok "tabela de partições MBR (dos)"

declare -A S Z T B
total=0
while read -r n s z t b; do S[$n]=$s; Z[$n]=$z; T[$n]=$t; B[$n]=$b; total=$((total + 1)); done < <(
  echo "$saida" | sed -nE 's/^[^ ]*[^0-9[:space:]]([0-9]+) +: +start= *([0-9]+), +size= *([0-9]+), +type=([0-9A-Za-z]+)(.*)$/\1 \2 \3 \4 \5/p')

esperado=$((3 + P_n))
if [ "$total" -eq "$esperado" ]; then ok "total de partições correto (2 primárias, 1 estendida e $P_n lógicas)"; else fail "total de partições incorreto: há $total, deveria haver $esperado (2 primárias + a estendida + $P_n lógicas)"; fi

# tolerância de 1 MiB no tamanho
perto() { local obtido=$1 mib=$2 diff; diff=$(( obtido - mib * MIB )); [ "${diff#-}" -le "$MIB" ]; }
tipo_ok() { local t=${1,,}; shift; local x; for x in "$@"; do [ "$t" = "$x" ] && return 0; done; return 1; }

# partição 1
if [ -n "${S[1]}" ] && tipo_ok "${T[1]}" 83 && perto "${Z[1]}" "$P_p1" && [[ "${B[1]}" == *bootable* ]]; then
  ok "partição 1: primária Linux (83) de ~$P_p1 MiB, marcada como inicializável"
else fail "partição 1 incorreta (esperado: primária tipo 83, ~$P_p1 MiB, com a flag de boot; obtido: tipo=${T[1]:-?} tamanho=$(( ${Z[1]:-0} / MIB )) MiB boot=$([[ "${B[1]}" == *bootable* ]] && echo sim || echo não))"; fi
# partição 2
if [ -n "${S[2]}" ] && tipo_ok "${T[2]}" 82 && perto "${Z[2]}" "$P_p2"; then
  ok "partição 2: primária de swap (82) de ~$P_p2 MiB"
else fail "partição 2 incorreta (esperado: tipo 82 de ~$P_p2 MiB; obtido: tipo=${T[2]:-?} tamanho=$(( ${Z[2]:-0} / MIB )) MiB)"; fi
# partição 3 (estendida até o fim do disco)
fimdisco=$((tam / 512))
if [ -n "${S[3]}" ] && tipo_ok "${T[3]}" 5 f 85; then
  ok "partição 3 é uma partição estendida"
  falta=$(( fimdisco - (S[3] + Z[3]) ))
  if [ "$falta" -le "$MIB" ] && [ "${S[3]}" -ge $(( S[2] + Z[2] )) ]; then ok "a estendida ocupa todo o espaço restante, logo após a partição 2"
  else fail "a estendida deve começar após a partição 2 e ocupar o resto do disco (sobram $((falta / MIB)) MiB livres no fim)"; fi
else fail "a partição 3 deve ser a estendida (tipo 5/f); obtido: tipo=${T[3]:-?}"; fi
# lógicas
logicas_ok=1
for i in $(seq 5 $((4 + P_n))); do
  if [ -z "${S[$i]}" ] || ! tipo_ok "${T[$i]}" 83 || ! perto "${Z[$i]}" "$P_l" \
     || [ "${S[$i]}" -lt "${S[3]:-0}" ] || [ $(( S[$i] + Z[$i] )) -gt $(( ${S[3]:-0} + ${Z[3]:-0} )) ]; then
    logicas_ok=0; fail "partição lógica $i incorreta (esperado: tipo 83 de ~$P_l MiB dentro da estendida; obtido: tipo=${T[$i]:-?} tamanho=$(( ${Z[$i]:-0} / MIB )) MiB)"
  fi
done
[ "$logicas_ok" -eq 1 ] && ok "$P_n partições lógicas (5 a $((4 + P_n))) Linux de ~$P_l MiB dentro da estendida"
finish
