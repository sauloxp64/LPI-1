#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-1-path-alias"
{
  echo "export PATH=\"\$PATH:$d/bin\""
  echo "alias $P_alias='$P_cmd $P_flag'"
} >> /home/aluno/.bashrc
su -l aluno -c "bash -ic 'type $P_cmd; alias $P_alias' > $d/evidencia.txt" 2>/dev/null
