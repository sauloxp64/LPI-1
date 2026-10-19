#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/projetos
p=$d/$P_proj
chgrp -R "$P_grupo" "$p"
find "$p" -type d -exec chmod 2770 {} +
find "$p" -type f -exec chmod 660 {} +
echo 007 > "$d/umask.txt"
chown aluno:aluno "$d/umask.txt"
