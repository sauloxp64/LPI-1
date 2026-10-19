#!/bin/bash
source /opt/lab/lib.sh
for u in viajante-ana viajante-bia viajante-caio viajante-dora; do drop_user "$u"; drop_group "$u"; done
useradd -m -s /bin/bash "$P_usuario"
d=$(fresh_dir locale)
echo "cenário pronto: usuário $P_usuario (home /home/$P_usuario) e pasta $d"
