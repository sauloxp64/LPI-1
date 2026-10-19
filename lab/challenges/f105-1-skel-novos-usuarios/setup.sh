#!/bin/bash
source /opt/lab/lib.sh
aqui=$(dirname "$(readlink -f "$0")")
drop_user lab105b
# volta o /etc/skel ao conteúdo original do Debian (e remove o que sobrou de execuções anteriores)
find /etc/skel -mindepth 1 -delete
install -m 644 "$aqui/golden/bashrc"      /etc/skel/.bashrc
install -m 644 "$aqui/golden/profile"     /etc/skel/.profile
install -m 644 "$aqui/golden/bash_logout" /etc/skel/.bash_logout
echo "cenário pronto: /etc/skel restaurado"
