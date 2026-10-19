#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-4-redir-tee"
cd "$d"
./coleta.sh > saida.txt 2> erros.txt
./coleta.sh 2>&1 | tee -a historico.txt > /dev/null
chown aluno:aluno saida.txt erros.txt historico.txt
