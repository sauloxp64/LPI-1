#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-2-trecho-linhas
d="$LAB_DIR/f103-2-trecho-linhas"
fim=$((P_ini + P_qtd - 1))

if [ ! -f "$d/trecho.txt" ]; then fail "o arquivo trecho.txt não existe em ~/lab/f103-2-trecho-linhas"
else
  esperado=$(sed -n "${P_ini},${fim}p" "$ST/servico.log")
  obtido=$(cat "$d/trecho.txt")
  nl=$(wc -l < "$d/trecho.txt" | tr -d ' ')
  if [ "$obtido" = "$esperado" ]; then ok "trecho.txt tem as $P_qtd linhas certas (da $P_ini à $fim)"
  else fail "trecho.txt não tem exatamente as $P_qtd linhas a partir da linha $P_ini (tem $nl linhas)"; fi
fi

if [ ! -f "$d/total.txt" ]; then fail "o arquivo total.txt não existe em ~/lab/f103-2-trecho-linhas"
else
  esperado=$(wc -l < "$ST/servico.log" | tr -d ' ')
  obtido=$(awk 'NR==1{print $1}' "$d/total.txt")
  expect_eq "total.txt informa o total de linhas de servico.log" "$obtido" "$esperado"
fi
expect "servico.log continua o mesmo" cmp -s "$d/servico.log" "$ST/servico.log"
finish
