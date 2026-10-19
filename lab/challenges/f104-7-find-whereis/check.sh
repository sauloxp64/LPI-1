#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/achados
r=$LAB_DIR/respostas-achados

# 1) arquivos grandes com a extensão procurada
esperado=$(find "$d" -type f -name "*.$P_ext" -size +"${P_kb}k" | sort)
if [ -f "$r/grandes.txt" ]; then
  obtido=$(sed 's/[[:space:]]*$//; /^$/d' "$r/grandes.txt" | sort -u)
  if [ "$obtido" = "$esperado" ]; then ok "grandes.txt lista exatamente os arquivos *.$P_ext com mais de $P_kb KiB"
  else
    faltam=$(comm -23 <(echo "$esperado") <(echo "$obtido") | grep -c .); sobram=$(comm -13 <(echo "$esperado") <(echo "$obtido") | grep -c .)
    fail "grandes.txt não confere (faltam $faltam, sobram $sobram) — use caminhos absolutos, só arquivos comuns, um por linha"
  fi
else fail "o arquivo ~/lab/respostas-achados/grandes.txt não existe"; fi

# 2) onde fica o comando de administração
if [ -f "$r/onde.txt" ]; then
  if tr -s '[:space:]' '\n' < "$r/onde.txt" | grep -qxE "/usr/sbin/$P_cmd|/sbin/$P_cmd"; then ok "onde.txt traz o caminho do executável $P_cmd"
  else fail "onde.txt não traz o caminho absoluto do executável de $P_cmd"; fi
else fail "o arquivo ~/lab/respostas-achados/onde.txt não existe"; fi
finish
