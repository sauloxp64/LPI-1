#!/bin/bash
source /opt/lab/lib.sh
python3 - <<'PY'
import ipaddress as ip, os, sys
env = os.environ
bad = 0
def ok(m): print("OK|" + m)
def fail(m):
    global bad
    bad += 1
    print("FALHA|" + m)
d = os.path.join(env['LAB_DIR'], 'subredes')
net = ip.ip_interface(f"{env['P_ip']}/{env['P_cidr']}").network
rfc1918 = any(ip.ip_address(env['P_ip']) in ip.ip_network(n) for n in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'))
exp = {
    'rede': str(net.network_address),
    'mascara': str(net.netmask),
    'broadcast': str(net.broadcast_address),
    'primeiro': str(net.network_address + 1),
    'ultimo': str(net.broadcast_address - 1),
    'hosts': str(net.num_addresses - 2),
    'privado': 'sim' if rfc1918 else 'nao',
}
got = {}
p = os.path.join(d, 'resposta.txt')
if not os.path.isfile(p):
    fail("o arquivo ~/lab/subredes/resposta.txt não existe")
else:
    for line in open(p, encoding='utf-8', errors='replace'):
        if '=' in line:
            k, v = line.split('=', 1)
            got[k.strip().lower()] = v.strip().lower().replace('não', 'nao')
    for k, v in exp.items():
        g = got.get(k, '')
        if g == v:
            ok(f"{k} correto")
        elif not g:
            fail(f"{k} está em branco ou ausente")
        else:
            fail(f"{k} incorreto (você escreveu '{g}')")
# sub-redes
blk = ip.ip_network(env['P_bloco'])
want = [str(s) for s in blk.subnets(prefixlen_diff=int(env['P_extra']))]
q = os.path.join(d, 'subredes.txt')
if not os.path.isfile(q):
    fail("o arquivo ~/lab/subredes/subredes.txt não existe")
else:
    lines = [l.strip() for l in open(q, encoding='utf-8', errors='replace') if l.strip()]
    if lines == want:
        ok(f"as {len(want)} sub-redes de {env['P_bloco']} estão corretas e em ordem crescente")
    elif sorted(lines) == sorted(want):
        fail("as sub-redes estão certas, mas fora de ordem crescente")
    elif len(lines) != len(want):
        fail(f"quantidade de sub-redes incorreta (esperava {len(want)} linhas, há {len(lines)})")
    else:
        fail("alguma sub-rede está incorreta (confira o prefixo e os endereços de rede)")
sys.exit(1 if bad else 0)
PY
[ $? -ne 0 ] && _FAILS=$((_FAILS + 1))
finish
