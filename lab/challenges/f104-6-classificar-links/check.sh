#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/auditoria
orig=$d/$P_base.dat
if [ ! -f "$orig" ]; then fail "o original $P_base.dat não está mais em ~/lab/auditoria"; finish; exit; fi
cd "$d" || exit 1
ST=/root/.lab-state/f104-6-classificar-links
if [ -s "$ST/manifesto" ]; then
  # gabarito e manifesto gravados pelo setup, em estado privado: recalcular sobre a árvore atual aprovaria quem
  # apagou o material e entregou listas vazias
  esperado_duros=$(cat "$ST/duros"); esperado_simb=$(cat "$ST/simbolicos"); esperado_cop=$(cat "$ST/copias")
  perdas=""
  while IFS='|' read -r tipo p alvo; do
    case $tipo in
      l) { [ -L "$p" ] && [ "$(readlink "$p")" = "$alvo" ]; } || perdas="$perdas $p" ;;
      f) { [ -f "$p" ] && [ ! -L "$p" ] && [ "$(sha256sum < "$p" | cut -d' ' -f1)" = "$alvo" ]; } || perdas="$perdas $p" ;;
    esac
  done < "$ST/manifesto"
  # identidade dos hardlinks: os duros continuam sendo o mesmo inode do original; as cópias, inode próprio
  while IFS= read -r p; do [ -z "$p" ] || [ "$p" -ef "$orig" ] || perdas="$perdas $p"; done < "$ST/duros"
  while IFS= read -r p; do [ -z "$p" ] || [ ! "$p" -ef "$orig" ] || perdas="$perdas $p"; done < "$ST/copias"
  if [ -z "$perdas" ]; then ok "o material de ~/lab/auditoria está intacto (nada foi apagado, movido, trocado ou modificado)"
  else fail "o material de ~/lab/auditoria foi alterado (era para só classificar): $(echo $perdas | tr ' ' '\n' | sort -u | head -5 | tr '\n' ' ')"; fi
else   # sem estado privado (cenário criado por um setup antigo): gabarito calculado sobre a árvore atual
  esperado_duros=$(find . -type f -samefile "$orig" ! -path "./$P_base.dat" | sed 's|^\./||' | sort)
  esperado_simb=$(find . -type l | sed 's|^\./||' | sort)
  esperado_cop=$(find . -type f ! -samefile "$orig" -print0 | while IFS= read -r -d '' f; do cmp -s "$orig" "$f" && echo "${f#./}"; done | sort)
fi
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
