#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-5-matar-teimosos"
ps -u "$P_svc" -o pid=,stat=,comm= | awk -v n="$P_nome" '$3 == n && $2 !~ /^Z/ {print $1}' | sort -n > "$d/pids.txt"
chown aluno:aluno "$d/pids.txt"
pkill -TERM -u "$P_svc" -x "$P_nome"
sleep 1
pkill -KILL -u "$P_svc" -x "$P_nome"
sleep 0.5
