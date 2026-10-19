#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-7-grep-palavra-nivel"
cd "$d"
grep -nwE "$P_a|$P_b" app.log > criticos.txt
chown aluno:aluno criticos.txt
