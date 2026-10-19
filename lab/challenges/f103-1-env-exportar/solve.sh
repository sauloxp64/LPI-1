#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-1-env-exportar"
cd "$d" && env "$P_var=$P_valor" "$P_varporta=$P_porta" ./mostra.sh > saida.txt
chown aluno:aluno saida.txt
