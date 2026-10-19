#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/rede
echo "$P_host" > "$d/hostname"
cat > "$d/hosts" <<X
127.0.0.1	localhost
127.0.1.1	$P_host.$P_dominio $P_host
192.168.$P_o3.$P_o4	$P_srv.$P_dominio $P_srv $P_apelido
# The following lines are desirable for IPv6 capable hosts
::1     localhost ip6-localhost ip6-loopback
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
X
sed -i 's/^hosts:.*/hosts:          files dns/' "$d/nsswitch.conf"
chown -R aluno:aluno "$d"
