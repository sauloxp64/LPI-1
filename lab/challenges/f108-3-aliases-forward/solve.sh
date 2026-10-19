#!/bin/bash
source /opt/lab/lib.sh
sed -i 's/^postmaster:.*/postmaster: '"$P_u1"'/' /etc/aliases
echo "$P_alias: $P_u1, $P_u2, $P_ext" >> /etc/aliases
printf '\\%s, %s\n' "$P_dono" "$P_ext" > "/home/$P_dono/.forward"
chown "$P_dono:$P_dono" "/home/$P_dono/.forward"
chmod 644 "/home/$P_dono/.forward"
echo newaliases > "$LAB_DIR/mta/recarregar.txt"
chown aluno:aluno "$LAB_DIR/mta/recarregar.txt"
