#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-7-sed-mascarar-ip"
cd "$d"
sed -E -e '/^#/d' -e '/^$/d' -e "s/([0-9]+\.[0-9]+\.[0-9]+)\.[0-9]+/\1.$P_ult/g" -e "s/$P_campo=[^ ]+/$P_campo=$P_mascara/g" acessos.log > anonimo.log
chown aluno:aluno anonimo.log
