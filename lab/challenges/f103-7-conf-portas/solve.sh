#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-7-conf-portas"
cd "$d"
grep -Ev '^[[:space:]]*(#|$)' servidor.conf > ativas.txt
sed -nE "s/^[[:space:]]*$P_dir[[:space:]]+([0-9.]+:)?([0-9]+).*/\2/p" servidor.conf > portas.txt
chown aluno:aluno ativas.txt portas.txt
