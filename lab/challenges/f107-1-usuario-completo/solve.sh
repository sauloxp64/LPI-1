#!/bin/bash
source /opt/lab/lib.sh
useradd -m -u "$P_uid" -g "$P_gp" -G "$P_ge" -s "$P_shell" -d "$P_base/$P_usuario" -c "$P_comentario" "$P_usuario"
chage -E "$P_expira" -M "$P_maxdias" -W "$P_aviso" "$P_usuario"
