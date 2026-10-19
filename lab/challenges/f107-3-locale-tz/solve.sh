#!/bin/bash
source /opt/lab/lib.sh
cat >> "/home/$P_usuario/.profile" <<X
export LANG=$P_lang
export LC_TIME=$P_lc_time
export TZ=$P_tz
X
f=$LAB_DIR/locale/horas.txt
{ TZ=$P_tz date -d "@$P_epoch" '+%F %T %Z'; TZ=$P_tz2 date -d "@$P_epoch" '+%F %T %Z'; } > "$f"
chown aluno:aluno "$f"
