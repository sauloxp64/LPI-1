#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/auditoria
orig=$d/$P_base.dat
if [ ! -f "$orig" ]; then fail "o original $P_base.dat não está mais em ~/lab/auditoria"; finish; exit; fi
cd "$d" || exit 1
esperado_duros=$(find . -type f -samefile "$orig" ! -path "./$P_base.dat" | sed 's|^\./||' | sort)
esperado_simb=$(find . -type l | sed 's|^\./||' | sort)
esperado_cop=$(find . -type f ! -samefile "$orig" -print0 | while IFS= read -r -d '' f; do cmp -s "$orig" "$f" && echo "${f#./}"; done | sort)
aluno_lista() { [ -f "$d/$1" ] && sed 's/[[:space:]]*$//; s|^\./||; /^$/d' "$d/$1" | sort -u; }
confere() {   # confere <arquivo> <esperado> <descricao>
  if [ ! -f "$d/$1" ]; then fail "o arquivo ~/lab/auditoria/$1 não existe"; return; fi
  local obt; obt=$(aluno_lista "$1")
  if [ "$obt" = "$2" ]; then ok "$1 lista exatamente $3"
  else
    local faltam sobram
    faltam=$(comm -23 <(echo "$2") <(echo "$obt") | grep -c .); sobram=$(comm -13 <(echo "$2") <(echo "$obt") | grep -c .)
    fail "$1 não confere com $3 (faltam $faltam, sobram $sobram)"
  fi
}
confere duros.txt "$esperado_duros" "os hardlinks do original (nomes que compartilham o inode)"
confere simbolicos.txt "$esperado_simb" "os links simbólicos (inclusive os quebrados)"
confere copias.txt "$esperado_cop" "as cópias independentes (mesmo conteúdo, inode diferente)"
finish
