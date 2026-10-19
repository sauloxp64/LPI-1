#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-8-vim-editar"
cd "$d"
vim -u NONE -N -es app.conf <<EOF
%s/$P_host_antigo/$P_host_novo/ge
%s/^ambiente = homologacao\$/ambiente = $P_amb_novo/e
g/^debug = true\$/d
g/^# TODO/.,+1d
/^\[cache\]/a
ttl = $P_ttl
.
\$a
# revisado por $P_revisor
.
wq
EOF
chown aluno:aluno app.conf
