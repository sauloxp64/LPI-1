#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/subredes
python3 - "$d" <<'PY'
import ipaddress as ip, os, sys
env = os.environ
d = sys.argv[1]
net = ip.ip_interface(f"{env['P_ip']}/{env['P_cidr']}").network
priv = any(ip.ip_address(env['P_ip']) in ip.ip_network(n) for n in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'))
open(os.path.join(d, 'resposta.txt'), 'w').write(
    f"rede={net.network_address}\nmascara={net.netmask}\nbroadcast={net.broadcast_address}\nprimeiro={net.network_address + 1}\nultimo={net.broadcast_address - 1}\nhosts={net.num_addresses - 2}\nprivado={'sim' if priv else 'nao'}\n")
open(os.path.join(d, 'subredes.txt'), 'w').write(
    '\n'.join(str(s) for s in ip.ip_network(env['P_bloco']).subnets(prefixlen_diff=int(env['P_extra']))) + '\n')
PY
chown -R aluno:aluno "$d"
