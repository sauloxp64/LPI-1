#!/bin/bash
source /opt/lab/lib.sh
# encerra restos de execuções anteriores
for n in lpx-relay lpx-fila lpx-cache lpx-sync lpx-api lpx-feed lpx-radar lpx-hub lpx-coleta lpx-medidor lpx-tick lpx-eco; do pkill -x "$n" 2>/dev/null; done
sleep 0.5
rm -rf /opt/lab-portas
mkdir -p /opt/lab-portas
nc_bin=$(readlink -f /usr/bin/nc)
b=$P_base
p1=$b; p2=$((b + 137)); p3=$((b + 291)); pu=$((b + 404))
for n in "$P_s1" "$P_s2" "$P_s3" "$P_su"; do cp "$nc_bin" "/opt/lab-portas/$n"; done
(setsid nohup "/opt/lab-portas/$P_s1" -k -l "$p1" >/dev/null 2>&1 < /dev/null &)
(setsid nohup "/opt/lab-portas/$P_s2" -k -l "$p2" >/dev/null 2>&1 < /dev/null &)
(setsid nohup "/opt/lab-portas/$P_s3" -k -l "$p3" >/dev/null 2>&1 < /dev/null &)
(setsid nohup "/opt/lab-portas/$P_su" -u -k -l "$pu" >/dev/null 2>&1 < /dev/null &)
for i in $(seq 1 20); do
  n=$(ss -lntu | grep -cE ":($p1|$p2|$p3|$pu)\b")
  [ "$n" -ge 4 ] && break
  sleep 0.3
done
d=$(fresh_dir portas)
echo "cenário pronto: 3 serviços TCP e 1 UDP escutando (pasta $d)"
