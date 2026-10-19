#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/cronaluno
chmod +x "$d"/*.sh
case "$P_dia" in segunda) dn=1;; terca) dn=2;; quarta) dn=3;; quinta) dn=4;; sexta) dn=5;; sabado) dn=6;; domingo) dn=0;; esac
{ crontab -u aluno -l 2>/dev/null
  echo "$P_minuto $P_hora * * $dn $d/$P_script_a >> $d/agenda.log 2>&1"
  echo "*/$P_passo $P_h_ini-$P_h_fim * * 1-5 $d/$P_script_b >> $d/agenda.log 2>&1"
} | crontab -u aluno -
