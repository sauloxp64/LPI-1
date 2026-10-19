#!/bin/bash
source /opt/lab/lib.sh
# remove restos: confs do rsyslog.d que apontam para /var/log/app-*.log deste desafio e os logs
grep -l '/var/log/app-' /etc/rsyslog.d/* 2>/dev/null | xargs -r rm -f
rm -f /var/log/app-vendas.log /var/log/app-estoque.log /var/log/app-fiscal.log /var/log/app-pagamentos.log
# reinicia o rsyslogd para voltar à configuração limpa
p=$(cat /var/run/rsyslogd.pid 2>/dev/null)
if [ -n "$p" ] && [ -d "/proc/$p" ] && ! grep -q '^State:.*Z' "/proc/$p/status" 2>/dev/null; then
  kill "$p" 2>/dev/null
  for i in $(seq 1 25); do
    if [ ! -d "/proc/$p" ] || grep -q '^State:.*Z' "/proc/$p/status" 2>/dev/null; then break; fi
    sleep 0.2
  done
fi
rsyslogd >/dev/null 2>&1
sleep 1
echo "cenário pronto: rsyslogd reiniciado sem a regra de app-$P_arquivo"
