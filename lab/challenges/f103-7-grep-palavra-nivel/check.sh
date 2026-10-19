#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-7-grep-palavra-nivel
d="$LAB_DIR/f103-7-grep-palavra-nivel"
f="$d/criticos.txt"
expect "app.log continua o mesmo" cmp -s "$d/app.log" "$ST/app.log"
if [ ! -f "$f" ]; then fail "o arquivo criticos.txt não existe em ~/lab/f103-7-grep-palavra-nivel"; finish; exit; fi

esp=$(cat "$ST/esperado.txt")
obt=$(sed -E 's/[[:space:]]+$//' "$f")
nesp=$(wc -l < "$ST/esperado.txt" | tr -d ' ')
nobt=$(grep -c '' "$f")
if [ "$obt" = "$esp" ]; then ok "criticos.txt tem as $nesp linhas certas, com o número da linha (N:linha)"
else
  fail "criticos.txt não confere (esperado $nesp linhas; encontrado $nobt)"
  # pistas de formato, sem entregar o comando
  if ! head -1 "$f" | grep -qE '^[0-9]+:'; then fail "cada linha deve começar com o número da linha no arquivo original, seguido de dois-pontos"
  elif [ "$nobt" -gt "$nesp" ]; then fail "há linhas a mais: veja se não entraram linhas em que $P_a ou $P_b aparece só como parte de outra palavra, ou se a busca não está ignorando maiúsculas/minúsculas sem querer"
  elif [ "$nobt" -lt "$nesp" ]; then fail "faltam linhas: confira se $P_a e $P_b foram buscadas juntas e em qualquer posição da linha"; fi
fi
finish
