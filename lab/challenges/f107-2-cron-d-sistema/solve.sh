#!/bin/bash
source /opt/lab/lib.sh
echo "$P_minuto $P_hora $P_d1,$P_d2 $P_m1-$P_m2 * $P_robo /usr/local/bin/$P_script" > "/etc/cron.d/tarefa-$P_robo"
chmod 644 "/etc/cron.d/tarefa-$P_robo"
