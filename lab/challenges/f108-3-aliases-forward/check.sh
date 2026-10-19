#!/bin/bash
source /opt/lab/lib.sh
python3 - <<'PY'
import os, sys
bad = 0
def ok(m): print("OK|" + m)
def fail(m):
    global bad
    bad += 1
    print("FALHA|" + m)
env = os.environ
def parse_aliases(path):
    ents = {}
    cur = None
    for raw in open(path, encoding='utf-8', errors='replace'):
        line = raw.rstrip('\n')
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if line[0] in ' \t' and cur is not None:
            ents[cur][-1] += ' ' + line.strip()
            continue
        if ':' not in line:
            continue
        name, rest = line.split(':', 1)
        cur = name.strip().lower()
        ents.setdefault(cur, []).append(rest.strip())
    return ents
def dests(s):
    return {d.strip() for d in s.split(',') if d.strip()}
try:
    ents = parse_aliases('/etc/aliases')
except Exception:
    fail("não consegui ler /etc/aliases")
    sys.exit(1)
a = env['P_alias']
if a not in ents:
    fail(f"o alias {a} não está definido em /etc/aliases")
elif len(ents[a]) > 1:
    fail(f"o alias {a} está definido {len(ents[a])} vezes")
else:
    want = {env['P_u1'], env['P_u2'], env['P_ext']}
    got = dests(ents[a][0])
    if got == want:
        ok(f"{a} entrega para {env['P_u1']}, {env['P_u2']} e {env['P_ext']}")
    else:
        fail(f"os destinos de {a} não conferem com o pedido (obtido: {', '.join(sorted(got))})")
if 'postmaster' not in ents:
    fail("o alias postmaster foi removido")
elif len(ents['postmaster']) > 1:
    fail("postmaster está definido mais de uma vez (altere a linha existente)")
elif dests(ents['postmaster'][0]) == {env['P_u1']}:
    ok(f"postmaster aponta só para {env['P_u1']}")
else:
    fail("postmaster não aponta (somente) para o usuário pedido")
base = {'mailer-daemon': 'postmaster', 'nobody': 'root', 'hostmaster': 'root', 'usenet': 'root', 'news': 'root', 'webmaster': 'root', 'www': 'root', 'ftp': 'root', 'abuse': 'root', 'noc': 'root', 'security': 'root', 'root': 'aluno'}
miss = [k for k, v in base.items() if k not in ents or [dests(x) for x in ents[k]] != [{v}]]
if miss:
    fail("aliases padrão alterados ou removidos: " + ', '.join(sorted(miss)))
else:
    ok("os demais aliases padrão continuam intactos")
# .forward
d = env['P_dono']
p = f"/home/{d}/.forward"
if not os.path.isfile(p):
    fail(f"{p} não existe")
else:
    st = os.stat(p)
    import pwd
    owner = pwd.getpwuid(st.st_uid).pw_name
    (ok if owner == d else fail)(f".forward pertence a {d}" + ("" if owner == d else f" (hoje pertence a {owner})"))
    (ok if (st.st_mode & 0o022) == 0 else fail)(".forward não é gravável por grupo/outros" + ("" if (st.st_mode & 0o022) == 0 else " (modo " + oct(st.st_mode & 0o777)[2:] + ")"))
    toks = {t.strip() for t in open(p, encoding='utf-8', errors='replace').read().replace('\n', ',').split(',') if t.strip()}
    (ok if env['P_ext'] in toks else fail)(f".forward redireciona para {env['P_ext']}")
    (ok if ('\\' + d) in toks else fail)(f".forward mantém uma cópia local com \\{d} (barra invertida evita loop)")
    extra = toks - {env['P_ext'], '\\' + d}
    (ok if not extra else fail)(".forward não tem destinos além dos pedidos" + ("" if not extra else ": " + ', '.join(sorted(extra))))
# comando de reconstrução
f = os.path.join(env['LAB_DIR'], 'mta', 'recarregar.txt')
if os.path.isfile(f):
    cmd = ' '.join(open(f, encoding='utf-8', errors='replace').read().split())
    valid = {'newaliases', 'sendmail -bi', 'postalias /etc/aliases', 'sendmail -bi -oA/etc/aliases'}
    base_ok = cmd in valid or cmd in {'sudo ' + v for v in valid} or cmd.startswith('/usr/sbin/newaliases') or cmd.startswith('/usr/bin/newaliases')
    (ok if base_ok else fail)("recarregar.txt contém o comando que reconstrói o banco de aliases" + ("" if base_ok else " (comando incorreto)"))
else:
    fail("o arquivo ~/lab/mta/recarregar.txt ainda não existe")
sys.exit(1 if bad else 0)
PY
[ $? -ne 0 ] && _FAILS=$((_FAILS + 1))
finish
