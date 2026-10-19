#!/bin/bash
source /opt/lab/lib.sh
f="$LAB_DIR/perm-equipe/$P_script"
if [ ! -f "$f" ]; then fail "o arquivo $P_script ainda existe em ~/lab/perm-equipe?"; finish; exit; fi
expect_eq "dono e grupo = $P_dono:$P_grupo" "$(stat -c '%U:%G' "$f")" "$P_dono:$P_grupo"
expect_eq "modo = 750" "$(stat -c '%a' "$f")" "750"
finish
