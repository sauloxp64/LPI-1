#!/bin/bash
source /opt/lab/lib.sh
d=$(fresh_dir rede)
echo "debian-clone" > "$d/hostname"
cat > "$d/hosts" <<X
127.0.0.1	localhost
127.0.1.1	debian-clone
10.9.$P_o3.$P_o4	$P_srv.$P_dominio $P_srv
# The following lines are desirable for IPv6 capable hosts
::1     localhost ip6-localhost ip6-loopback
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
X
cat > "$d/nsswitch.conf" <<'X'
# /etc/nsswitch.conf (cópia de estudo)
passwd:         files systemd
group:          files systemd
shadow:         files
gshadow:        files

hosts:          dns files
networks:       files

protocols:      db files
services:       db files
ethers:         db files
rpc:            db files

netgroup:       nis
X
chown -R aluno:aluno "$d"
echo "cenário pronto: cópias em $d"
