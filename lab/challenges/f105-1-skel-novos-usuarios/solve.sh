#!/bin/bash
source /opt/lab/lib.sh
mkdir -p "/etc/skel/$P_dir"
echo "Equipe: $P_equipe" > /etc/skel/LEIA-ME.txt
printf '\nalias %s=%s\n' "$P_apelido" "'ls $P_opcao'" >> /etc/skel/.bashrc
printf '\numask %s\n' "$P_umask" >> /etc/skel/.profile
