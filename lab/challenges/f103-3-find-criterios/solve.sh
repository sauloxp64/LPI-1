#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-3-find-criterios"
cd "$d/projeto"
find . -type f -name "*.$P_ext" -size +"${P_kb}k" -mtime +"$P_dias" > ../lista.txt
wc -l < ../lista.txt > ../quantos.txt
chown aluno:aluno ../lista.txt ../quantos.txt
