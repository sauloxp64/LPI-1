#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/achados
r=$LAB_DIR/respostas-achados
find "$d" -type f -name "*.$P_ext" -size +"${P_kb}k" > "$r/grandes.txt"
whereis -b "$P_cmd" > "$r/onde.txt"
chown aluno:aluno "$r"/*.txt
