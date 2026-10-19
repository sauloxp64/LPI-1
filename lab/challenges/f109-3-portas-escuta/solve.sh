#!/bin/bash
source /opt/lab/lib.sh
b=$P_base
d=$LAB_DIR/portas
pid=$(ps -C "$P_su" -o pid=,stat= | awk '$2 !~ /^Z/ {print $1; exit}')
{
  echo "$P_s1 $b"
  echo "$P_s2 $((b + 137))"
  echo "$P_s3 $((b + 291))"
} > "$d/tcp.txt"
echo "$((b + 404)) $pid" > "$d/udp.txt"
chown aluno:aluno "$d"/*.txt
pkill -x "$P_s2"
sleep 0.5
