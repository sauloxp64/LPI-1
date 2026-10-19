#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-7-conf-portas
d="$LAB_DIR/f103-7-conf-portas"
expect "servidor.conf continua o original" cmp -s "$d/servidor.conf" "$ST/servidor.conf"
trim() { sed -E 's/[[:space:]]+$//' "$1"; }

# ---- ativas.txt ----
if [ ! -f "$d/ativas.txt" ]; then fail "o arquivo ativas.txt não existe em ~/lab/f103-7-conf-portas"
else
  esp=$(trim "$ST/ativas"); obt=$(trim "$d/ativas.txt")
  if [ "$obt" = "$esp" ]; then ok "ativas.txt tem exatamente as linhas ativas (sem comentários e sem linhas em branco), inalteradas"
  else
    if grep -qE '^[[:space:]]*#' "$d/ativas.txt"; then fail "ativas.txt ainda tem linhas de comentário (inclusive as que começam com espaços ou tab antes do #)"
    elif grep -qE '^[[:space:]]*$' "$d/ativas.txt"; then fail "ativas.txt ainda tem linhas em branco ou só com espaços"
    else fail "ativas.txt não confere: as linhas ativas devem ficar exatamente como no original (incluindo comentários no fim da linha)"; fi
  fi
fi

# ---- portas.txt ----
if [ ! -f "$d/portas.txt" ]; then fail "o arquivo portas.txt não existe em ~/lab/f103-7-conf-portas"
else
  esp=$(cat "$ST/portas"); obt=$(trim "$d/portas.txt" | grep -v '^$')
  n=$(echo "$esp" | wc -l | tr -d ' ')
  if [ "$obt" = "$esp" ]; then ok "portas.txt tem os $n números de porta das diretivas $P_dir ativas, na ordem do arquivo"
  else
    if echo "$obt" | grep -vqE '^[0-9]+$'; then fail "portas.txt deve ter só o número da porta em cada linha (nada de $P_dir, endereço IP ou comentário)"
    else fail "portas.txt não confere: devem entrar só as diretivas $P_dir ativas (não as comentadas, nem outra diretiva de nome parecido), na ordem do arquivo; esperado $n portas"; fi
  fi
fi
finish
