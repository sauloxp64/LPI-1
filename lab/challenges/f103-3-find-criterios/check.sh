#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-3-find-criterios
d="$LAB_DIR/f103-3-find-criterios"
snap_atual=$(find "$d/projeto" -printf '%P %s %T@\n' | sort)
if [ "$snap_atual" = "$(cat "$ST/snapshot")" ]; then ok "a árvore projeto/ não foi alterada (arquivos, tamanhos e datas)"
else fail "a árvore projeto/ foi modificada (arquivos apagados, movidos ou datas mudadas): reinicie o desafio e só consulte, não altere"; fi

# normaliza caminhos: aceita absoluto, relativo a ~/lab/f103-3-find-criterios ou a projeto/
norm() { sed -E 's#^\./##; s#^.*/projeto/##; s#^projeto/##; s#[[:space:]]+$##' "$1" | grep -v '^$' | LC_ALL=C sort -u; }
esperado=$(norm "$ST/esperado.txt")
n=$(echo "$esperado" | wc -l | tr -d ' ')

if [ ! -f "$d/lista.txt" ]; then fail "o arquivo lista.txt não existe em ~/lab/f103-3-find-criterios"
else
  obtido=$(norm "$d/lista.txt")
  if [ "$obtido" = "$esperado" ]; then ok "lista.txt traz exatamente os $n arquivos que atendem a todos os critérios"
  else
    falt=$(comm -23 <(echo "$esperado") <(echo "$obtido") | wc -l | tr -d ' ')
    sobr=$(comm -13 <(echo "$esperado") <(echo "$obtido") | wc -l | tr -d ' ')
    fail "lista.txt não confere: faltam $falt arquivo(s) e há $sobr a mais (revise tipo, extensão, tamanho e data)"
  fi
fi

if [ ! -f "$d/quantos.txt" ]; then fail "o arquivo quantos.txt não existe em ~/lab/f103-3-find-criterios"
else
  obtido=$(awk 'NR==1{print $1}' "$d/quantos.txt")
  expect_eq "quantos.txt informa a quantidade de arquivos encontrados" "$obtido" "$n"
fi
finish
