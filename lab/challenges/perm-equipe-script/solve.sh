#!/bin/bash
source /opt/lab/lib.sh
f="$LAB_DIR/perm-equipe/$P_script"
chown "$P_dono:$P_grupo" "$f"
chmod 750 "$f"
