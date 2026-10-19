#!/bin/bash
source /opt/lab/lib.sh
t=$LAB_DIR/suid/arvore
orig=/var/lib/lab-state/f110-1-suid.orig
d=$LAB_DIR/suid
if [ ! -f "$orig" ]; then fail "estado do cenário ausente: reinicie o desafio"; finish; exit; fi
# normaliza uma linha de caminho para relativo à árvore
relp() { local p=$1; p=${p#./}; p=${p#"$t"/}; p=${p#arvore/}; p=${p#"~/lab/suid/arvore"/}; printf '%s' "$p"; }
list_expected() { # bit
  while read -r mode path; do
    if [ $(( 8#$mode & $1 )) -ne 0 ]; then echo "$path"; fi
  done < "$orig" | sort
}
check_list() { # arquivo bit rótulo
  local f=$d/$1
  if [ ! -f "$f" ]; then fail "o arquivo ~/lab/suid/$1 ainda não existe"; return; fi
  local got want extra missing
  got=$(sed -e 's/[[:space:]]*$//' -e '/^$/d' "$f" | while IFS= read -r l; do relp "$l"; echo; done | sed '/^$/d' | sort -u)
  want=$(list_expected "$2")
  if [ "$got" = "$want" ]; then ok "$1 tem exatamente os $3 originais ($(printf '%s\n' "$want" | grep -c .) arquivos)"; return; fi
  missing=$(comm -13 <(printf '%s\n' "$got") <(printf '%s\n' "$want") | grep -c .)
  extra=$(comm -23 <(printf '%s\n' "$got") <(printf '%s\n' "$want") | grep -c .)
  if printf '%s\n' "$got" | grep -qE '(dados-grupo|tmp-compartilhado)$'; then
    fail "$1 inclui diretórios (use -type f)"
  else
    fail "$1 não confere: faltam $missing arquivo(s) e há $extra a mais (lembre: a lista é do estado ORIGINAL, só arquivos regulares)"
  fi
}
check_list lista-suid.txt $((8#4000)) "arquivos SUID"
check_list lista-sgid.txt $((8#2000)) "arquivos SGID"
# alvo e demais
bad=0; alvo_ok=0
while read -r mode path; do
  cur=$(stat -c %a "$t/$path" 2>/dev/null)
  if [ "$(basename "$path")" = "$P_alvo" ]; then
    want=$(printf '%o' $(( 8#$mode & 8#0777 )))
    if [ "$cur" = "$want" ]; then ok "$P_alvo perdeu SUID/SGID e manteve as outras permissões (modo $cur)"; else fail "$P_alvo está com modo $cur (esperado $want: sem SUID/SGID e com as demais permissões originais)"; fi
  else
    orig_oct=$(printf '%o' $(( 8#$mode )))
    if [ "$cur" != "$orig_oct" ]; then bad=$((bad + 1)); fi
  fi
done < "$orig"
if [ "$bad" -eq 0 ]; then ok "os demais arquivos não foram alterados"; else fail "$bad outro(s) arquivo(s) da árvore tiveram o modo alterado"; fi
finish
