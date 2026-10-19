#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-2-integridade-hash
d="$LAB_DIR/f103-2-integridade-hash"
f="$d/falhas.txt"
expect "a lista lista.$P_alg continua a original" cmp -s "$d/entrega/lista.$P_alg" "$ST/lista"
if [ ! -f "$f" ]; then fail "o arquivo falhas.txt não existe em ~/lab/f103-2-integridade-hash"; finish; exit; fi

norm() { sed -E 's/[[:space:]]+$//' "$1" | grep -v '^$' | LC_ALL=C sort; }
esperado=$(norm "$ST/esperado.txt")
obtido=$(norm "$f")
nesp=$(echo "$esperado" | wc -l | tr -d ' ')
nobt=$(echo -n "$obtido" | grep -c '')
if [ "$obtido" = "$esperado" ]; then ok "falhas.txt lista exatamente os $nesp arquivos que não conferem (alterados ou ausentes)"
else
  fail "falhas.txt não confere com o resultado da verificação de integridade (esperado $nesp nomes, um por linha, só o nome do arquivo; encontrado $nobt linhas)"
  if grep -qE ': (FAILED|FALHO|FALHA)' "$f"; then fail "dica de formato: grave apenas o nome do arquivo em cada linha, sem os dois-pontos nem a mensagem de resultado"; fi
fi
finish
