#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-2-top-ips
d="$LAB_DIR/f103-2-top-ips"
f="$d/topips.txt"
norm() { sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/[[:space:]]+/ /g' "$1" | grep -v '^$'; }

expect "acesso.log continua o mesmo" cmp -s "$d/acesso.log" "$ST/acesso.log"
if [ ! -f "$f" ]; then fail "o arquivo topips.txt não existe em ~/lab/f103-2-top-ips"; finish; exit; fi

nlin=$(norm "$f" | wc -l | tr -d ' ')
expect_eq "topips.txt tem $P_n linhas (uma por IP)" "$nlin" "$P_n"
esperado=$(norm "$ST/esperado.txt")
obtido=$(norm "$f")
if [ "$obtido" = "$esperado" ]; then ok "os $P_n IPs com mais respostas $P_codigo, com as contagens, do maior para o menor"
else
  fail "o conteúdo de topips.txt não confere: contagem + IP, só das linhas com status $P_codigo, em ordem decrescente"
  # pistas sem entregar a resposta
  if [ "$(echo "$obtido" | LC_ALL=C sort)" = "$(echo "$esperado" | LC_ALL=C sort)" ]; then
    fail "as linhas estão certas, mas a ordem não: deve ir da MAIOR contagem para a menor (numericamente)"
  else
    primeiro=$(echo "$obtido" | head -1)
    esp1=$(echo "$esperado" | head -1)
    [ "${primeiro%% *}" != "${esp1%% *}" ] && fail "a primeira linha está diferente do esperado (confira se só entraram respostas com o status pedido: buscar o número solto pode pegar linhas demais)"
  fi
fi
finish
