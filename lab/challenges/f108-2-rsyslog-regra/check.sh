#!/bin/bash
source /opt/lab/lib.sh
L=/var/log/app-$P_arquivo.log
# 1) configuração em /etc/rsyslog.d/*.conf
confs=$(grep -l -F "$L" /etc/rsyslog.d/*.conf 2>/dev/null)
if [ -n "$confs" ]; then
  ok "há um .conf em /etc/rsyslog.d/ mencionando $L"
else
  fail "nenhum arquivo .conf em /etc/rsyslog.d/ menciona $L"
fi
if rsyslogd -N1 >/dev/null 2>&1; then ok "a configuração do rsyslog é válida (rsyslogd -N1)"; else fail "rsyslogd -N1 reporta erro de sintaxe na configuração"; fi
# 2) rsyslogd rodando?
p=$(cat /var/run/rsyslogd.pid 2>/dev/null)
if [ -n "$p" ] && [ -d "/proc/$p" ] && ! grep -q '^State:.*Z' "/proc/$p/status" 2>/dev/null; then
  ok "o rsyslogd está em execução"
else
  fail "o rsyslogd não está em execução (reinicie-o)"; finish; exit
fi
# 3) teste funcional com o rsyslogd em execução (sem reiniciar nada aqui)
t=$RANDOM$RANDOM
logger -p "$P_fac.$P_prio" -t labchk "CHK-$t-piso"
logger -p "$P_fac.alert" -t labchk "CHK-$t-alta"
logger -p "$P_fac.debug" -t labchk "CHK-$t-baixa"
logger -p "$P_fac2.$P_prio" -t labchk "CHK-$t-outra"
for i in $(seq 1 12); do
  if grep -q "CHK-$t-alta" "$L" 2>/dev/null && grep -q "CHK-$t-piso" "$L" 2>/dev/null; then break; fi
  sleep 0.5
done
sleep 1
has() { grep -q "$1" "$2" 2>/dev/null; }
if has "CHK-$t-piso" "$L"; then ok "mensagem $P_fac.$P_prio chegou em $L"; else fail "mensagem $P_fac.$P_prio NÃO chegou em $L (regra errada ou rsyslogd não reiniciado depois de editar?)"; fi
if has "CHK-$t-alta" "$L"; then ok "mensagem $P_fac.alert (mais grave) também chegou"; else fail "mensagem $P_fac.alert não chegou em $L: a prioridade vale como piso (a regra deve incluir as mais graves)"; fi
if has "CHK-$t-baixa" "$L"; then fail "mensagem $P_fac.debug chegou em $L, mas deveria ficar de fora"; else ok "mensagem $P_fac.debug (abaixo do piso) não foi gravada no arquivo"; fi
if has "CHK-$t-outra" "$L"; then fail "mensagem de outra facility ($P_fac2) chegou em $L, mas deveria ficar de fora"; else ok "mensagem de outra facility ($P_fac2) não foi gravada no arquivo"; fi
if ! has "CHK-$t-piso" "$L"; then
  fail "sem a regra funcionando não dá para avaliar o /var/log/syslog"
elif has "CHK-$t-piso" /var/log/syslog || has "CHK-$t-alta" /var/log/syslog; then
  fail "as mensagens gravadas pela regra também apareceram em /var/log/syslog (faltou interromper o processamento)"
else
  if has "CHK-$t-baixa" /var/log/syslog && has "CHK-$t-outra" /var/log/syslog; then ok "as mensagens da regra não vão para /var/log/syslog, e as demais continuam indo"; else fail "o /var/log/syslog deixou de receber as demais mensagens (a regra interrompeu mensagens demais?)"; fi
fi
# 4) mensagem do estudante, no formato de linha do rsyslog
if [ -f "$L" ] && grep -Eq "^[0-9T:.+-]+ [^ ]+ [^ ]+: teste-$P_tok\$" "$L"; then
  ok "a mensagem teste-$P_tok enviada com logger está em $L"
else
  fail "não achei a sua mensagem teste-$P_tok em $L (envie com logger depois de reiniciar o rsyslogd)"
fi
finish
