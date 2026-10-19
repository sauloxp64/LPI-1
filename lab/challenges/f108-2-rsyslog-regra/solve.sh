#!/bin/bash
source /opt/lab/lib.sh
printf '%s.%s\t/var/log/app-%s.log\n& stop\n' "$P_fac" "$P_prio" "$P_arquivo" > "/etc/rsyslog.d/40-app-$P_arquivo.conf"
p=$(cat /var/run/rsyslogd.pid 2>/dev/null)
[ -n "$p" ] && kill "$p" 2>/dev/null
for i in $(seq 1 25); do
  if [ ! -d "/proc/$p" ] || grep -q '^State:.*Z' "/proc/$p/status" 2>/dev/null; then break; fi
  sleep 0.2
done
rsyslogd >/dev/null 2>&1
sleep 1
logger -p "$P_fac.$P_prio" -t lab "teste-$P_tok"
sleep 1
