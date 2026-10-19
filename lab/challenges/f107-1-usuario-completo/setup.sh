#!/bin/bash
source /opt/lab/lib.sh
drop_user "$P_usuario"
rm -rf "$P_base/$P_usuario"
# garante que o UID sorteado esteja livre
other=$(getent passwd "$P_uid" | cut -d: -f1)
[ -n "$other" ] && [ "$other" != "$P_usuario" ] && drop_user "$other"
drop_group "$P_gp"; drop_group "$P_ge"
groupadd "$P_gp"; groupadd "$P_ge"
mkdir -p "$P_base"
echo "cenário pronto: grupos $P_gp e $P_ge criados; a conta $P_usuario ainda não existe"
