#!/bin/bash
source /opt/lab/lib.sh
img=$LAB_DIR/particoes-gpt/$P_disco.img
truncate -s "${P_tam}M" "$img"
sgdisk -n "1:0:+${P_esp}M" -t 1:EF00 -c "1:$P_n1" \
       -n "2:0:+${P_raiz}M" -t 2:8300 -c "2:$P_n2" \
       -n "3:0:+${P_sw}M" -t 3:8200 -c "3:$P_n3" \
       -n 4:0:0 -t 4:8302 -c "4:$P_n4" "$img" >/dev/null
chown aluno:aluno "$img"
