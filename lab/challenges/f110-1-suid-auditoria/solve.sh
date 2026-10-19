#!/bin/bash
source /opt/lab/lib.sh
t=$LAB_DIR/suid/arvore
find "$t" -type f -perm -4000 > "$LAB_DIR/suid/lista-suid.txt"
find "$t" -type f -perm -2000 > "$LAB_DIR/suid/lista-sgid.txt"
chown aluno:aluno "$LAB_DIR/suid/"lista-*.txt
chmod u-s,g-s "$(find "$t" -type f -name "$P_alvo")"
