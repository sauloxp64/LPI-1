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
# sondas nos OITO níveis da facility-alvo (0 emerg … 7 debug) e em outra facility. A regra pedida grava do nível 0
# até o piso ($P_prio), inclusive; os níveis abaixo do piso e as outras facilities continuam indo para o syslog.
niveis=(emerg alert crit err warning notice info debug)
piso=-1; for i in 0 1 2 3 4 5 6 7; do [ "${niveis[$i]}" = "$P_prio" ] && piso=$i; done
for i in 0 1 2 3 4 5 6 7; do logger -p "$P_fac.${niveis[$i]}" -t labchk "CHK-$t-N$i"; done
logger -p "$P_fac2.$P_prio" -t labchk "CHK-$t-O1"
logger -p "$P_fac2.alert" -t labchk "CHK-$t-O2"
has() { grep -q -F "$1" "$2" 2>/dev/null; }
# espera (prazo total ~12 s) até que todas as sondas apareçam em algum lugar: no arquivo da regra ou no syslog
for w in $(seq 1 24); do
  tudo=1
  for s in N0 N1 N2 N3 N4 N5 N6 N7 O1 O2; do
    has "CHK-$t-$s" "$L" || has "CHK-$t-$s" /var/log/syslog || { tudo=0; break; }
  done
  [ $tudo -eq 1 ] && break
  sleep 0.5
done
sleep 1
falt=""; extra=""
for i in 0 1 2 3 4 5 6 7; do
  if [ "$i" -le "$piso" ]; then has "CHK-$t-N$i" "$L" || falt="$falt $P_fac.${niveis[$i]}"
  else has "CHK-$t-N$i" "$L" && extra="$extra $P_fac.${niveis[$i]}"
  fi
done
if [ -z "$falt" ]; then ok "todas as mensagens de $P_fac.$P_prio e mais graves (emerg até $P_prio) chegaram em $L"; else fail "faltaram em $L:$falt (regra errada, rsyslogd não reiniciado depois de editar, ou a regra não cobre todos os níveis: a prioridade vale como piso, inclui $P_prio e todas as mais graves)"; fi
if [ -z "$extra" ]; then ok "as mensagens de $P_fac abaixo do piso ($P_prio) não foram gravadas no arquivo"; else fail "chegaram em $L, mas deveriam ficar de fora (menos graves que $P_prio):$extra"; fi
if has "CHK-$t-O1" "$L" || has "CHK-$t-O2" "$L"; then fail "mensagem de outra facility ($P_fac2) chegou em $L, mas deveria ficar de fora"; else ok "mensagens de outra facility ($P_fac2) não foram gravadas no arquivo"; fi
if [ -n "$falt" ]; then
  fail "sem a regra funcionando para todos os níveis não dá para avaliar o /var/log/syslog"
else
  dup=""; perd=""
  for i in 0 1 2 3 4 5 6 7; do
    if [ "$i" -le "$piso" ]; then has "CHK-$t-N$i" /var/log/syslog && dup="$dup $P_fac.${niveis[$i]}"
    else has "CHK-$t-N$i" "$L" || has "CHK-$t-N$i" /var/log/syslog || perd="$perd $P_fac.${niveis[$i]}"
    fi
  done
  for s in O1 O2; do has "CHK-$t-$s" "$L" || has "CHK-$t-$s" /var/log/syslog || perd="$perd $P_fac2"; done
  if [ -n "$dup" ]; then fail "as mensagens gravadas pela regra também apareceram em /var/log/syslog (faltou interromper o processamento):$dup"
  elif [ -n "$perd" ]; then fail "o /var/log/syslog deixou de receber as demais mensagens (a regra interrompeu mensagens demais?):$perd"
  else ok "as mensagens da regra não vão para /var/log/syslog, e as demais continuam indo"; fi
fi
# 4) mensagem do estudante, no formato de linha do rsyslog
if [ -f "$L" ] && grep -Eq "^[0-9T:.+-]+ [^ ]+ [^ ]+: teste-$P_tok\$" "$L"; then
  ok "a mensagem teste-$P_tok enviada com logger está em $L"
else
  fail "não achei a sua mensagem teste-$P_tok em $L (envie com logger depois de reiniciar o rsyslogd)"
fi
finish
