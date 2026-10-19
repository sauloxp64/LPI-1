#!/bin/bash
source /opt/lab/lib.sh
python3 - <<'PY'
import os, shlex, sys
env = os.environ
bad = 0
def ok(m): print("OK|" + m)
def fail(m):
    global bad
    bad += 1
    print("FALHA|" + m)
f = os.path.join(env['LAB_DIR'], 'impressao', 'comandos.txt')
if not os.path.isfile(f):
    fail("o arquivo ~/lab/impressao/comandos.txt ainda não existe")
    sys.exit(1)
lines = [l.strip() for l in open(f, encoding='utf-8', errors='replace') if l.strip() and not l.strip().startswith('#')]
if len(lines) != 4:
    fail(f"comandos.txt deveria ter 4 linhas de comando (tem {len(lines)})")
lines += [''] * (4 - len(lines))
imp = env['P_impressora']; arq = env['P_arquivo']; cop = env['P_copias']; job = env['P_job']
home = '/home/aluno'
OPT = {'duplex': ['sides=two-sided-long-edge'], 'a4': ['media=A4', 'media=a4'], 'paisagem': ['landscape', 'orientation-requested=4'], 'ajustar': ['fit-to-page', 'fitplot', 'fitplot=true']}
def toks(line):
    try:
        t = shlex.split(line)
    except ValueError:
        return []
    if t and t[0] == 'sudo':
        t = t[1:]
    return t
def getopts(t, withargs):
    """devolve (comando, lista de (flag, valor), argumentos posicionais)."""
    cmd = t[0] if t else ''
    opts, pos = [], []
    i = 1
    while i < len(t):
        a = t[i]
        if a.startswith('-') and len(a) > 1:
            fl = a[1]
            if fl in withargs:
                if len(a) > 2:
                    opts.append((fl, a[2:]))
                elif i + 1 < len(t):
                    opts.append((fl, t[i + 1])); i += 1
                else:
                    opts.append((fl, ''))
            else:
                opts.append((fl, None))
        else:
            pos.append(a)
        i += 1
    return cmd, opts, pos
def base(p):
    return os.path.basename(p.replace('~', home).replace('$HOME', home))
# ---- 1) impressão
t = toks(lines[0])
good = False; why = ''
if t and t[0] in ('lp', 'lpr'):
    cmd, opts, pos = getopts(t, set('dnoPqtHUih') if t[0] == 'lp' else set('PoCJTU#n'))
    if cmd == 'lp':
        dest = [v for k, v in opts if k == 'd']
        copies = [v for k, v in opts if k == 'n']
    else:
        dest = [v for k, v in opts if k == 'P']
        copies = [v for k, v in opts if k in ('#', 'n')]
    oo = [v for k, v in opts if k == 'o']
    flat = []
    for v in oo:
        flat += v.split()
    for v in list(flat):
        if v.startswith('copies='):
            copies.append(v.split('=', 1)[1])
    if dest != [imp]:
        why = 'destino (impressora) errado ou ausente'
    elif cop not in copies:
        why = 'número de cópias errado ou ausente'
    elif not any(x in flat for x in OPT[env['P_opcao']]):
        why = 'opção de impressão (-o) errada ou ausente'
    elif [base(p) for p in pos] != [arq]:
        why = 'arquivo errado ou ausente'
    else:
        good = True
else:
    why = 'use lp ou lpr'
(ok if good else fail)("linha 1: impressão do arquivo" + ("" if good else f" ({why})"))
# ---- 2) cancelar
t = toks(lines[1])
good = False; why = ''
if t and t[0] in ('lprm', 'cancel'):
    cmd, opts, pos = getopts(t, set('PUh'))
    dest = [v for k, v in opts if k == 'P']
    others = [k for k, v in opts if k not in ('P', 'U', 'h')]
    jobs = []
    for p in pos:
        if p == '-' or p == 'all':
            jobs.append(p)
        else:
            jobs.append(p.split('-')[-1] if p.startswith(imp + '-') else p)
    dd = [p for p in pos if p == imp]
    if cmd == 'lprm':
        okdest = (not dest) or dest == [imp]
    else:
        okdest = True
    jj = [x for x in jobs if x != imp]
    if others:
        why = 'opções que cancelam mais de um trabalho (como -a ou -)'
    elif jj != [job]:
        why = 'número do trabalho errado (cancele só o trabalho pedido)'
    elif not okdest:
        why = 'impressora errada'
    else:
        good = True
else:
    why = 'use lprm ou cancel'
(ok if good else fail)("linha 2: cancelamento do trabalho" + ("" if good else f" ({why})"))
# ---- 3) listar a fila
t = toks(lines[2])
good = False; why = ''
if t and t[0] == 'lpq':
    cmd, opts, pos = getopts(t, set('PU'))
    good = [v for k, v in opts if k == 'P'] == [imp]
    why = 'falta -P com a impressora'
elif t and t[0] == 'lpstat':
    cmd, opts, pos = getopts(t, set('opuvhU'))
    os_ = [v for k, v in opts if k == 'o']
    allv = [v for k, v in opts if v] + pos
    good = any(k == 'o' for k, v in opts) and imp in allv
    why = 'use lpstat -o com a impressora'
else:
    why = 'use lpq ou lpstat'
(ok if good else fail)("linha 3: listagem da fila" + ("" if good else f" ({why})"))
# ---- 4) impressora padrão
t = toks(lines[3])
good = False; why = ''
if t and t[0] in ('lpoptions', 'lpadmin'):
    cmd, opts, pos = getopts(t, set('dpoxPEh'))
    good = [v for k, v in opts if k == 'd'] == [imp] and not [1 for k, v in opts if k in ('x',)]
    why = 'use a opção -d com a impressora'
else:
    why = 'use lpoptions -d ou lpadmin -d'
(ok if good else fail)("linha 4: impressora padrão" + ("" if good else f" ({why})"))
sys.exit(1 if bad else 0)
PY
[ $? -ne 0 ] && _FAILS=$((_FAILS + 1))
finish
