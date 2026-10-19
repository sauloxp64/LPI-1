#!/bin/bash
source /opt/lab/lib.sh
python3 - <<'PY'
import os, re, sys
env = os.environ
bad = 0
def ok(m): print("OK|" + m)
def fail(m):
    global bad
    bad += 1
    print("FALHA|" + m)
d = os.path.join(env['LAB_DIR'], 'rede')
host, dom, srv, ap = env['P_host'], env['P_dominio'], env['P_srv'], env['P_apelido']
fq = f"{host}.{dom}"
srvfq = f"{srv}.{dom}"
ipsrv = f"192.168.{env['P_o3']}.{env['P_o4']}"
def rd(n):
    p = os.path.join(d, n)
    if not os.path.isfile(p):
        fail(f"o arquivo ~/lab/rede/{n} não existe")
        return None
    return open(p, encoding='utf-8', errors='replace').read()
# hostname
t = rd('hostname')
if t is not None:
    lines = [l.strip() for l in t.splitlines() if l.strip()]
    (ok if lines == [host] else fail)(f"hostname contém só '{host}'" + ("" if lines == [host] else f" (hoje: {' / '.join(lines) or 'vazio'})"))
# hosts
t = rd('hosts')
if t is not None:
    ents = []
    for l in t.splitlines():
        l = l.split('#', 1)[0].strip()
        if l:
            p = l.split()
            ents.append((p[0], p[1:]))
    l127 = [e for e in ents if e[0] == '127.0.1.1']
    if len(l127) != 1:
        fail(f"deve haver exatamente uma linha 127.0.1.1 (há {len(l127)})")
    elif l127[0][1] == [fq, host]:
        ok(f"127.0.1.1 resolve {fq} (canônico) e {host}")
    else:
        fail(f"a linha 127.0.1.1 deve ter, nesta ordem, {fq} e {host} (hoje: {' '.join(l127[0][1])})")
    loc = [e for e in ents if e[0] == '127.0.0.1' and 'localhost' in e[1]]
    (ok if loc else fail)("127.0.0.1 continua com localhost" if loc else "a linha 127.0.0.1 localhost foi perdida")
    v6 = [e for e in ents if e[0] == '::1' and 'localhost' in e[1]] and any(e[0] == 'ff02::1' for e in ents) and any(e[0] == 'ff02::2' for e in ents)
    (ok if v6 else fail)("as linhas IPv6 foram preservadas" if v6 else "as linhas IPv6 originais foram alteradas ou removidas")
    ls = [e for e in ents if ipsrv == e[0]]
    if len(ls) != 1:
        fail(f"deve haver exatamente uma linha para {ipsrv} (há {len(ls)})")
    else:
        names = ls[0][1]
        if names and names[0] == srvfq and set(names[1:]) == {srv, ap}:
            ok(f"{ipsrv} resolve {srvfq} (canônico) com apelidos {srv} e {ap}")
        else:
            fail(f"a linha de {ipsrv} deve ter {srvfq} primeiro e os apelidos {srv} e {ap} (hoje: {' '.join(names)})")
    stale = sorted({e[0] for e in ents if e[0] != ipsrv and (set(e[1]) & {srv, srvfq, ap})})
    (ok if not stale else fail)("nenhuma entrada antiga associa esses nomes a outro IP" if not stale else f"ainda existe entrada associando esses nomes a outro IP ({', '.join(stale)}): a primeira que casa vence")
# nsswitch
t = rd('nsswitch.conf')
if t is not None:
    orig = """# /etc/nsswitch.conf (cópia de estudo)
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

netgroup:       nis""".splitlines()
    got = t.splitlines()
    hl = [l for l in got if re.match(r'^\s*hosts\s*:', l)]
    if len(hl) != 1:
        fail(f"deve haver uma única linha 'hosts:' (há {len(hl)})")
    else:
        srcs = re.sub(r'\[[^\]]*\]', '', hl[0].split(':', 1)[1].split('#', 1)[0]).split()
        (ok if srcs == ['files', 'dns'] else fail)("hosts: files dns (ordem correta, só essas fontes)" if srcs == ['files', 'dns'] else f"a linha hosts: deve ser 'files dns' (hoje: {' '.join(srcs)})")
    rest_o = [l.strip() for l in orig if not re.match(r'^\s*hosts\s*:', l) and l.strip()]
    rest_g = [l.strip() for l in got if not re.match(r'^\s*hosts\s*:', l) and l.strip()]
    (ok if rest_o == rest_g else fail)("as demais linhas do nsswitch.conf não foram alteradas" if rest_o == rest_g else "outras linhas do nsswitch.conf foram alteradas ou removidas")
sys.exit(1 if bad else 0)
PY
[ $? -ne 0 ] && _FAILS=$((_FAILS + 1))
finish
