#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-2-trecho-linhas"
cd "$d"
tail -n +"$P_ini" servico.log | head -n "$P_qtd" > trecho.txt
wc -l < servico.log > total.txt
chown aluno:aluno trecho.txt total.txt
