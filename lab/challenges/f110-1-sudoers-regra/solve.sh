#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/sudoers
cat > "$d/rascunho" <<X
%$P_grupo ALL=(root) NOPASSWD: $P_cmd_a
%$P_grupo ALL=(root) $P_cmd_b
X
chown aluno:aluno "$d/rascunho"
visudo -cf "$d/rascunho" >/dev/null || exit 1
install -m 440 -o root -g root "$d/rascunho" "/etc/sudoers.d/$P_grupo"
