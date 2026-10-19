#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-4-xargs-copia
d="$LAB_DIR/f103-4-xargs-copia"

# originais intactos (cópia, não mover)
atual=$(cd "$d/$P_base" 2>/dev/null && find . -type f -print0 | sort -z | xargs -0 -r sha256sum)
if [ "$atual" = "$(cat "$ST/origem.sha")" ]; then ok "os arquivos originais em $P_base/ continuam nos seus lugares"
else fail "a árvore $P_base/ foi alterada: os arquivos devem ser COPIADOS (os originais ficam onde estão)"; fi

# destino
obt=$(cd "$d/destino" 2>/dev/null && find . -type f -printf '%P\n' | LC_ALL=C sort)
esp=$(awk '{ $1=""; sub(/^ +/, ""); print }' "$ST/esperado" | LC_ALL=C sort)
nesp=$(echo "$esp" | wc -l | tr -d ' ')
if [ "$obt" = "$esp" ]; then ok "destino/ contém exatamente os $nesp arquivos *.$P_ext (inclusive os de nome com espaço), sem subpastas"
else
  falta=$(comm -23 <(echo "$esp") <(echo "$obt") | wc -l | tr -d ' ')
  extra=$(comm -13 <(echo "$esp") <(echo "$obt") | wc -l | tr -d ' ')
  fail "destino/ não confere: $falta arquivo(s) faltando e $extra a mais (cópias planas, só nomes terminados em .$P_ext)"
fi
if [ "$obt" = "$esp" ]; then
  hobt=$(cd "$d/destino" && find . -type f -print0 | xargs -0 -r sha256sum | sed 's#  \./#  #' | LC_ALL=C sort -k2)
  expect_eq "o conteúdo dos arquivos copiados é igual ao original" "$hobt" "$(LC_ALL=C sort -k2 "$ST/esperado")"
fi

# soma de linhas
if [ ! -f "$d/linhas.txt" ]; then fail "o arquivo linhas.txt não existe em ~/lab/f103-4-xargs-copia"
else
  expect_eq "linhas.txt traz o total de linhas somando todos os *.$P_ext" "$(awk 'NR==1{print $1}' "$d/linhas.txt")" "$(cat "$ST/total")"
fi
finish
