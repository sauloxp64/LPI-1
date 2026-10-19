#!/bin/bash
source /opt/lab/lib.sh
# compara sem revelar o valor esperado (o valor é a resposta do exercício)
expect_val() { if [ "$2" = "$3" ]; then ok "$1"; else fail "$1 (valor encontrado: '${2:-vazio}')"; fi; }
u=$P_usuario
if ! id "$u" >/dev/null 2>&1; then fail "o usuário $u não existe"; finish; exit; fi
# login interativo (lê /etc/profile, ~/.profile e ~/.bashrc), ambiente limpo
envof() { env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin timeout 15 su -l -s /bin/bash "$1" -c 'bash -ilc env' 2>/dev/null; }
getv() { printf '%s\n' "$1" | grep -m1 "^$2=" | cut -d= -f2-; }
e=$(envof "$u")
expect_val "LANG de $u = $P_lang" "$(getv "$e" LANG)" "$P_lang"
expect_val "LC_TIME de $u = $P_lc_time" "$(getv "$e" LC_TIME)" "$P_lc_time"
expect_val "TZ de $u = $P_tz" "$(getv "$e" TZ)" "$P_tz"
lcall=$(getv "$e" LC_ALL)
if [ -z "$lcall" ]; then ok "LC_ALL não está definida no login de $u"; else fail "LC_ALL está definida ($lcall) e anularia LANG/LC_TIME"; fi
ea=$(envof aluno)
tza=$(getv "$ea" TZ)
if [ -z "$tza" ]; then ok "o login de aluno não foi afetado (TZ vazio)"; else fail "o TZ do usuário aluno também mudou ($tza): a mudança deveria ficar só no perfil de $u"; fi
# horas.txt
f=$LAB_DIR/locale/horas.txt
if [ -f "$f" ]; then
  want=$(printf '%s\n%s\n' "$(TZ=$P_tz date -d "@$P_epoch" '+%F %T %Z')" "$(TZ=$P_tz2 date -d "@$P_epoch" '+%F %T %Z')")
  got=$(sed -e 's/[[:space:]]*$//' -e '/^$/d' "$f")
  expect_val "linha 1 de horas.txt (hora em $P_tz)" "$(printf '%s\n' "$got" | sed -n 1p)" "$(printf '%s\n' "$want" | sed -n 1p)"
  expect_val "linha 2 de horas.txt (hora em $P_tz2)" "$(printf '%s\n' "$got" | sed -n 2p)" "$(printf '%s\n' "$want" | sed -n 2p)"
  expect_val "horas.txt tem exatamente 2 linhas" "$(printf '%s\n' "$got" | wc -l)" "2"
else
  fail "o arquivo ~/lab/locale/horas.txt ainda não existe"
fi
finish
