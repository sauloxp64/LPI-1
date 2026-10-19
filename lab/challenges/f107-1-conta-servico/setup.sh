#!/bin/bash
source /opt/lab/lib.sh
drop_user "$P_servico"; drop_group "$P_servico"
rm -rf "/var/lib/$P_servico"
other=$(getent passwd "$P_uid" | cut -d: -f1)
[ -n "$other" ] && drop_user "$other"
og=$(getent group "$P_uid" | cut -d: -f1)
[ -n "$og" ] && drop_group "$og"
echo "cenário limpo: a conta $P_servico ainda não existe"
