#!/bin/bash
source /opt/lab/lib.sh
for u in rafael simone tadeu ursula valter wilson xavier yara zilda; do drop_user "$u"; drop_group "$u"; done
for u in "$P_u1" "$P_u2" "$P_dono"; do useradd -m -s /usr/sbin/nologin "$u"; done
cat > /etc/aliases <<'X'
# /etc/aliases - aliases do MTA (laboratório)
# Depois de editar este arquivo, o banco de aliases precisa ser reconstruído.
mailer-daemon: postmaster
postmaster: root
nobody: root
hostmaster: root
usenet: root
news: root
webmaster: root
www: root
ftp: root
abuse: root
noc: root
security: root
root: aluno
X
chmod 644 /etc/aliases
d=$(fresh_dir mta)
echo "cenário pronto: /etc/aliases padrão e usuários $P_u1, $P_u2, $P_dono"
