#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-7-sed-mascarar-ip
d="$LAB_DIR/f103-7-sed-mascarar-ip"
f="$d/anonimo.log"
expect "acessos.log continua o original" cmp -s "$d/acessos.log" "$ST/acessos.log"
if [ ! -f "$f" ]; then fail "o arquivo anonimo.log não existe em ~/lab/f103-7-sed-mascarar-ip"; finish; exit; fi

norm() { sed -E 's/[[:space:]]+$//' "$1" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'; }
esp=$(norm "$ST/esperado.txt"); obt=$(norm "$f")
if [ "$obt" = "$esp" ]; then ok "anonimo.log está correto: IPs mascarados, $P_campo trocado, sem comentários nem linhas em branco"
else
  # diagnóstico por requisito, sem entregar a solução
  if grep -qE '^#|^$' "$f"; then fail "anonimo.log ainda tem linhas de comentário (#) ou linhas em branco"; else ok "sem comentários nem linhas em branco"; fi
  if grep -qE "$P_campo=" "$f" && grep -E "$P_campo=" "$f" | grep -vqE "$P_campo=$P_mascara( |\$)"; then fail "nem todos os valores de $P_campo foram trocados por $P_mascara"; else ok "valores de $P_campo trocados por $P_mascara"; fi
  if grep -qE '([0-9]+\.){3}[0-9]+' "$f" && grep -oE '([0-9]+\.){3}[0-9]+' "$f" | grep -vqE "\.$P_ult\$"; then fail "há IPs cujo último octeto não virou $P_ult (confira se a troca vale para todos os IPs de cada linha)"; else ok "último octeto dos IPs trocado por $P_ult"; fi
  fail "anonimo.log não confere exatamente com o esperado (confira que nada além do pedido foi alterado, como versao=1.2.3 e tempo=)"
fi
finish
