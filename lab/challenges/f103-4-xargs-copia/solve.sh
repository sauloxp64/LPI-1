#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-4-xargs-copia"
cd "$d"
find "$P_base" -type f -name "*.$P_ext" -print0 | xargs -0 cp -t destino
find "$P_base" -type f -name "*.$P_ext" -print0 | xargs -0 cat | wc -l > linhas.txt
chown -R aluno:aluno destino linhas.txt
