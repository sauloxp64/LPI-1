#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/fstab
f=$d/fstab.novo
if [ ! -f "$f" ]; then fail "o arquivo ~/lab/fstab/fstab.novo não existe"; finish; exit; fi

# A análise é feita em Python: lê TODAS as entradas úteis (não só as 3 esperadas), exige 6 campos em cada uma,
# exige exatamente uma entrada por ponto de montagem/dispositivo e rejeita opções contraditórias (auto+noauto etc.).
export FSTAB_NOVO=$f FSTAB_DIR=$d
python3 -B - <<'PY'
import os, subprocess, sys
env = os.environ
d, f = env['FSTAB_DIR'], env['FSTAB_NOVO']
bad = 0
def ok(m): print("OK|" + m)
def fail(m):
    global bad
    bad += 1
    print("FALHA|" + m)

def sonda(img, chave):
    r = subprocess.run(['blkid', '-p', '-o', 'export', img], capture_output=True, text=True)
    for l in r.stdout.splitlines():
        if l.startswith(chave + '='):
            return l.split('=', 1)[1]
    return ''

uuid_ext = sonda(os.path.join(d, env['P_dados'] + '.img'), 'UUID')
uuid_swp = sonda(os.path.join(d, env['P_swp'] + '.img'), 'UUID')
if not uuid_ext or not uuid_swp:
    fail("não consegui ler o UUID das imagens de ext4/swap (as imagens ainda existem em ~/lab/fstab/?)")
    sys.exit(1)

# lê só as linhas úteis (sem comentários e linhas em branco)
entradas = []   # (nº da linha, campos)
for n, bruta in enumerate(open(f, encoding='utf-8', errors='replace'), 1):
    t = bruta.split('#', 1)[0].split()
    if t:
        entradas.append((n, t))
if not entradas:
    fail("esperava 3 entradas no fstab.novo (encontrei 0)")
    sys.exit(1)
if len(entradas) < 3:
    fail(f"esperava 3 entradas no fstab.novo (encontrei {len(entradas)})")
    sys.exit(1)

# toda linha útil precisa ter 6 campos, inclusive as que não são as três esperadas
ruins = [(n, len(t)) for n, t in entradas if len(t) != 6]
if ruins:
    fail("cada entrada do fstab precisa ter exatamente 6 campos: " + "; ".join(f"linha {n} tem {q}" for n, q in ruins[:5]))
else:
    ok("todas as entradas têm exatamente 6 campos")

def tira_aspas(v): return v.replace('"', '').replace("'", '')
def norm_pm(p): return p.rstrip('/') or '/'
def spec_ok(tipo, esp, spec):
    spec = tira_aspas(spec).lower(); esp = esp.lower()
    if tipo == 'UUID':
        return spec in ('uuid=' + esp, '/dev/disk/by-uuid/' + esp)
    return spec in ('label=' + esp, '/dev/disk/by-label/' + esp)

# grupos de opções mutuamente exclusivas: duas delas na mesma linha é contradição (sem depender da ordem)
EXCL = [{'auto', 'noauto'}, {'user', 'users', 'nouser'}, {'ro', 'rw'}, {'exec', 'noexec'}, {'suid', 'nosuid'},
        {'dev', 'nodev'}, {'sync', 'async'}, {'atime', 'noatime'}, {'diratime', 'nodiratime'}, {'relatime', 'norelatime'}]
def contradicao(opts):
    for g in EXCL:
        achadas = sorted({o for o in opts if o in g})
        if len(achadas) > 1:
            return achadas
    return None

def acha(pm, tipo, esp):
    """entradas que usam este ponto de montagem OU referenciam este dispositivo"""
    return [(n, t) for n, t in entradas if len(t) >= 2 and (norm_pm(t[1]) == norm_pm(pm) or spec_ok(tipo, esp, t[0]))]

def analisa(rot, pm, tipo, esp, fst, req, dump, pas, proibidas=()):
    achadas = acha(pm, tipo, esp)
    if not achadas:
        fail(f"{rot}: não encontrei a entrada para este ponto de montagem"); return
    if len(achadas) > 1:
        fail(f"{rot}: há {len(achadas)} entradas para este ponto de montagem/dispositivo (linhas {', '.join(str(n) for n, _ in achadas)}); deve haver uma só"); return
    n, t = achadas[0]
    if len(t) != 6:
        fail(f"{rot}: cada entrada do fstab precisa ter exatamente 6 campos (encontrei {len(t)})"); return
    erros = []
    if norm_pm(t[1]) != norm_pm(pm): erros.append("ponto de montagem")
    if not spec_ok(tipo, esp, t[0]): erros.append(f"dispositivo (deve identificar o sistema de arquivos por {tipo})")
    if t[2] != fst: erros.append("tipo de sistema de arquivos")
    opts = t[3].split(',')
    if any(o not in opts for o in req): erros.append("opções")
    c = contradicao(opts)
    if c: erros.append("opções contraditórias (" + " e ".join(c) + ")")
    for o in proibidas:
        if o in opts: erros.append(f"opção '{o}' não pedida")
    if t[4] != dump: erros.append("campo dump")
    if t[5] != pas: erros.append("campo pass (ordem do fsck)")
    if erros: fail(f"{rot}: confira — " + "; ".join(erros) + ";")
    else: ok(f"{rot}: entrada correta")

# 1) ext4 por UUID (montado no boot e gravável: 'noauto' e 'ro' desfariam isso)
analisa(f"ext4 em {env['P_pt_dados']}", env['P_pt_dados'], 'UUID', uuid_ext, 'ext4', ['defaults', env['P_opt1']], '0', '2', proibidas=('noauto', 'ro'))
# 2) vfat por LABEL, montável por usuário e não automático
usb_pm = '/media/' + env['P_pt_usb']
analisa(f"vfat em {usb_pm}", usb_pm, 'LABEL', env['P_lbl_usb'], 'vfat', ['noauto', 'user', env['P_opt2']], '0', '0')
for n, t in entradas:
    if len(t) >= 4 and norm_pm(t[1]) == norm_pm(usb_pm) and 'users' in t[3].split(','):
        fail("vfat: 'users' deixa qualquer usuário desmontar; o enunciado pede só 'user'")
# 3) swap por UUID
sw = acha('none', 'UUID', uuid_swp)
if sw and len(sw) == 1 and len(sw[0][1]) == 6:
    o = sw[0][1][3].split(',')
    if 'sw' in o or 'defaults' in o:
        analisa("swap", 'none', 'UUID', uuid_swp, 'swap', ['sw' if 'sw' in o else 'defaults'], '0', '0')
    else:
        fail("swap: a opção da área de troca está incorreta")
else:
    analisa("swap", 'none', 'UUID', uuid_swp, 'swap', ['sw'], '0', '0')
sys.exit(1 if bad else 0)
PY
[ $? -ne 0 ] && _FAILS=$((_FAILS + 1))
finish
