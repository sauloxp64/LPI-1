#!/bin/bash
source /opt/lab/lib.sh
chown -R "$P_usuario:$P_grupo" "$LAB_DIR/$P_pasta"
chmod -R o-rwx "$LAB_DIR/$P_pasta"
