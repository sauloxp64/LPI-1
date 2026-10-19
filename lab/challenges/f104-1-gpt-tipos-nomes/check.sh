#!/bin/bash
source /opt/lab/lib.sh
img=$LAB_DIR/particoes-gpt/$P_disco.img
MIB=2048
G_EFI=C12A7328-F81F-11D2-BA4B-00A0C93EC93B
G_LINUX=0FC63DAF-8483-4772-8E79-3D69D8477DE4
G_SWAP=0657FD6D-A4AB-43C4-84E5-0933C84B4F4F
G_HOME=933AC7E1-2EB4-4F13-B844-0E14E2AEF915
if [ ! -f "$img" ]; then fail "a imagem ~/lab/particoes-gpt/$P_disco.img não existe"; finish; exit; fi

expect_eq "a imagem tem $P_tam MiB" "$(stat -c %s "$img")" "$((P_tam * 1048576))"
saida=$(sfdisk -d "$img" 2>/dev/null)
lbl=$(echo "$saida" | awk '/^label:/ { print $2 }')
if [ "$lbl" != "gpt" ]; then fail "a tabela de partições deve ser GPT; encontrado: '${lbl:-nenhuma}'"; finish; exit; fi
ok "tabela de partições GPT"
lastlba=$(echo "$saida" | awk '/^last-lba:/ { print $2 }')

declare -A S Z T N
total=0
while IFS='|' read -r n s z t nome; do S[$n]=$s; Z[$n]=$z; T[$n]=${t^^}; N[$n]=$nome; total=$((total + 1)); done < <(
  echo "$saida" | sed -nE 's/^[^ ]*[^0-9[:space:]]([0-9]+) +: +start= *([0-9]+), +size= *([0-9]+), +type=([0-9A-Fa-f-]+)(, +uuid=[0-9A-Fa-f-]+)?(, +name="([^"]*)")?.*$/\1|\2|\3|\4|\7/p')
expect_eq "o disco tem 4 partições" "$total" "4"

perto() { local diff=$(( $1 - $2 * MIB )); [ "${diff#-}" -le "$MIB" ]; }
confere() {   # confere <num> <guid> <nome_tipo> <nome> <mib|resto>
  local i=$1 guid=$2 tn=$3 nome=$4 mib=$5 erros=""
  [ -n "${S[$i]}" ] || { fail "partição $i não existe"; return; }
  [ "${T[$i]}" = "$guid" ] || erros="$erros tipo errado (esperado '$tn');"
  [ "${N[$i]}" = "$nome" ] || erros="$erros nome errado (esperado '$nome', obtido '${N[$i]}');"
  [ $(( S[$i] % MIB )) -eq 0 ] || erros="$erros início não alinhado em 1 MiB;"
  if [ "$mib" = resto ]; then
    local falta=$(( lastlba - (S[$i] + Z[$i] - 1) ))
    [ "$falta" -ge 0 ] && [ "$falta" -le "$MIB" ] || erros="$erros deve ir até o último setor utilizável do disco;"
  else
    perto "${Z[$i]}" "$mib" || erros="$erros tamanho $(( Z[$i] / MIB )) MiB (esperado ~$mib MiB);"
  fi
  if [ -z "$erros" ]; then ok "partição $i: $tn, nome '$nome', $([ "$mib" = resto ] && echo 'até o fim do disco' || echo "~$mib MiB")"; else fail "partição $i:$erros"; fi
}
confere 1 "$G_EFI"   "EFI System"       "$P_n1" "$P_esp"
confere 2 "$G_LINUX" "Linux filesystem" "$P_n2" "$P_raiz"
confere 3 "$G_SWAP"  "Linux swap"       "$P_n3" "$P_sw"
confere 4 "$G_HOME"  "Linux home"       "$P_n4" resto

# a ordem física deve ser 1,2,3,4 sem sobreposição
ordem_ok=1
for i in 1 2 3; do j=$((i + 1)); [ -n "${S[$j]}" ] && [ -n "${S[$i]}" ] && [ $(( S[$i] + Z[$i] )) -le "${S[$j]}" ] || ordem_ok=0; done
if [ "$ordem_ok" -eq 1 ]; then ok "as partições estão em ordem e sem sobreposição"; else fail "as partições devem estar na ordem 1, 2, 3, 4 e sem sobreposição"; fi
if sgdisk --verify "$img" 2>&1 | grep -q 'No problems found'; then ok "sgdisk --verify não encontra problemas (cabeçalho GPT de backup íntegro)"
else fail "a verificação do GPT (sgdisk --verify) acusa problemas"; fi
finish
