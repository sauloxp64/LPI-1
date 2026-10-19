#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/caixa
case $P_outros in rwx) chmod 1777 "$d/$P_nome" ;; wx) chmod 1733 "$d/$P_nome" ;; esac
ls -ld "$d/$P_nome" | awk '{ print $1 }' > "$d/simbolico.txt"
chown aluno:aluno "$d/simbolico.txt"
