#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-2-top-ips"
cd "$d"
awk -v c="$P_codigo" '$9 == c {print $1}' acesso.log | sort | uniq -c | sort -rn | head -n "$P_n" > topips.txt
chown aluno:aluno topips.txt
