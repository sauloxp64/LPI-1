#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/auditoria
orig=$d/$P_base.dat
cd "$d" || exit 1
find . -type f -samefile "$orig" ! -path "./$P_base.dat" | sed 's|^\./||' > duros.txt
find . -type l | sed 's|^\./||' > simbolicos.txt
find . -type f ! -samefile "$orig" -print0 | while IFS= read -r -d '' f; do cmp -s "$orig" "$f" && echo "${f#./}"; done > copias.txt
chown aluno:aluno duros.txt simbolicos.txt copias.txt
