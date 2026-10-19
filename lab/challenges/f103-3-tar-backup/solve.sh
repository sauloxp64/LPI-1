#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-3-tar-backup"
cd "$d"
tar -czf "backup-$P_proj.tar.gz" --exclude='*.tmp' --exclude="$P_proj/logs" "$P_proj"
tar -xf "legado.tar.$P_comp" -C restaurado "site/conf/$P_arq"
chown -R aluno:aluno "$d"
