#!/bin/bash
source /opt/lab/lib.sh
F=/etc/logrotate.d/app-$P_app
L=/var/log/appsrv/$P_app.log
if [ ! -f "$F" ]; then fail "o arquivo $F ainda não existe"; finish; exit; fi
ok "o arquivo $F existe"
# 1) sintaxe: logrotate -d, sem linhas "error:"
dout=$(logrotate -d "$F" 2>&1); rc=$?
if printf '%s\n' "$dout" | grep -q '^error:' || [ "$rc" -ne 0 ]; then
  fail "logrotate -d reporta erro na configuração: $(printf '%s\n' "$dout" | grep -m1 -E '^error:|error' )"
  finish; exit
fi
ok "logrotate -d não acusa erro de sintaxe"
# 2) um único log, padrão exato, frequência e quantidade
nlogs=$(printf '%s\n' "$dout" | sed -n 's/^Handling \([0-9]*\) logs\{0,1\}.*/\1/p')
expect_eq "a configuração trata 1 log" "$nlogs" "1"
line=$(printf '%s\n' "$dout" | grep -m1 '^rotating pattern:')
pat=$(printf '%s\n' "$line" | sed -n 's/^rotating pattern: *\([^ ]*\) .*/\1/p')
expect_eq "padrão do log = $L" "$pat" "$L"
fr=$(printf '%s\n' "$line" | sed -n 's/^rotating pattern: *[^ ]* *\(.*\) ([0-9]* rotations).*/\1/p')
[ "$fr" = "after 1 days" ] && fr=daily
expect_eq "frequência = $P_freq" "$fr" "$P_freq"
cnt=$(printf '%s\n' "$line" | sed -n 's/.*(\([0-9]*\) rotations).*/\1/p')
expect_eq "quantidade de rotações = $P_n" "$cnt" "$P_n"
# 3) diretivas booleanas (lê o bloco do arquivo; último valor entre compress/nocompress vale)
dirs=$(sed -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' "$F" | awk 'NF')
has() { printf '%s\n' "$dirs" | grep -Eq "^$1\$"; }
last_of() { printf '%s\n' "$dirs" | grep -E "^($1)\$" | tail -1; }
[ "$(last_of 'compress|nocompress')" = "compress" ] && ok "diretiva compress presente" || fail "falta a diretiva compress"
[ "$(last_of 'delaycompress|nodelaycompress')" = "delaycompress" ] && ok "diretiva delaycompress presente" || fail "falta a diretiva delaycompress"
[ "$(last_of 'missingok|nomissingok')" = "missingok" ] && ok "diretiva missingok presente" || fail "falta a diretiva missingok"
[ "$(last_of 'notifempty|ifempty')" = "notifempty" ] && ok "diretiva notifempty presente" || fail "falta a diretiva notifempty"
# 4) rotação forçada simulada: como o novo log seria criado
fout=$(logrotate -d -f "$F" 2>&1)
adm_gid=$(getent group adm | cut -d: -f3)
want="creating new $L mode = $P_modo uid = 0 gid = $adm_gid"
if printf '%s\n' "$fout" | grep -qF "$want"; then ok "o novo log seria criado com modo $P_modo, dono root e grupo adm"; else fail "o log não seria recriado com modo $P_modo, dono root e grupo adm (diretiva create?)"; fi
finish
