#!/bin/bash
source /opt/lab/lib.sh
python3 -B - <<'PY'
import os, re, shlex, sys
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
SUDO = [False]
def toks(line):
    SUDO[0] = False
    try:
        t = shlex.split(line)
    except ValueError:
        return []
    if t and t[0] == 'sudo':
        SUDO[0] = True
        t = t[1:]
    return t
def getopts(t, withargs):
    """devolve (comando, lista ORDENADA de (flag, valor), argumentos posicionais)."""
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
def caminhos(p):
    """Caminhos absolutos possíveis de um argumento: ~, ~aluno e $HOME viram a home; um caminho relativo vale
    a partir de ~/lab/impressao (diretório de trabalho declarado no enunciado) ou da home."""
    q = p
    for pre in ('~aluno', '~', '${HOME}', '$HOME'):
        if q == pre or q.startswith(pre + '/'):
            q = home + q[len(pre):]
            break
    q = re.sub(r'/+', '/', q)
    if q.startswith('/'):
        return {os.path.normpath(q)}
    return {os.path.normpath(home + '/lab/impressao/' + q), os.path.normpath(home + '/' + q)}
def inteiro(v):
    return str(int(v)) if re.fullmatch(r'[0-9]+', v or '') else v
BOOLEANAS = ('landscape', 'fit-to-page', 'fitplot')
def opcoes_o(valores):
    """Interpreta os argumentos de -o: {chave: conjunto de valores}. Opção repetida com valores diferentes
    fica com mais de um valor (conflito), em vez de valer só a primeira ou a última ocorrência."""
    d = {}
    for v in valores:
        for item in v.split():
            k, eq, val = item.partition('=')
            if not eq:
                if k.startswith('no') and k[2:] in BOOLEANAS:
                    k, val = k[2:], 'false'
                else:
                    val = 'true'
            elif k in BOOLEANAS:
                val = 'false' if val.lower() in ('false', 'no', 'off', '0') else 'true'
            d.setdefault(k, set()).add(val)
    return d
def so(d, k, aceitos):
    """a opção k foi dada e TODAS as suas ocorrências estão em 'aceitos'"""
    return k in d and d[k] <= set(aceitos)
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
    od = opcoes_o([v for k, v in opts if k == 'o'])
    copies += list(od.get('copies', []))
    alvo = os.path.normpath(env['LAB_DIR'] + '/impressao/' + arq)
    o = env['P_opcao']
    if not dest or set(dest) != {imp}:
        why = 'destino (impressora) errado, ausente ou contraditório'
    elif not copies or {inteiro(c) for c in copies} != {cop}:
        why = 'número de cópias errado, ausente ou contraditório (opções repetidas com valores diferentes)'
    elif not (
        (o == 'duplex' and so(od, 'sides', ['two-sided-long-edge']))
        or (o == 'a4' and so(od, 'media', ['a4', 'A4', 'iso_a4_210x297mm']))
        or (o == 'paisagem' and ((so(od, 'landscape', ['true']) and od.get('orientation-requested', {'4'}) == {'4'})
                                 or (so(od, 'orientation-requested', ['4']) and od.get('landscape', {'true'}) == {'true'})))
        or (o == 'ajustar' and ((so(od, 'fit-to-page', ['true']) and od.get('fitplot', {'true'}) == {'true'})
                                or (so(od, 'fitplot', ['true']) and od.get('fit-to-page', {'true'}) == {'true'})))
    ):
        why = 'opção de impressão (-o) errada, ausente ou contraditória'
    elif len(pos) != 1 or alvo not in caminhos(pos[0]):
        why = 'arquivo errado ou ausente (use o caminho de ~/lab/impressao/' + arq + ')'
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
def lpstat_o(t):
    """Destinos dados a -o do lpstat (None se não houve -o). O argumento de -o é opcional: vale o texto colado
    (-olaser-rh) ou a palavra seguinte, se ela não começar com '-'."""
    dests = None
    i = 1
    while i < len(t):
        a = t[i]
        if a.startswith('-') and len(a) > 1:
            j = 1
            while j < len(a):
                ch = a[j]
                if ch in 'acopuv':   # argumento opcional
                    if j + 1 < len(a):
                        val = a[j + 1:]
                    elif i + 1 < len(t) and not t[i + 1].startswith('-'):
                        val = t[i + 1]; i += 1
                    else:
                        val = ''
                    if ch == 'o':
                        dests = (dests or []) + [x for x in re.split(r'[,\s]+', val) if x]
                    break
                if ch in 'hUW':   # argumento obrigatório
                    if j + 1 >= len(a):
                        i += 1
                    break
                j += 1
        i += 1
    return dests
t = toks(lines[2])
good = False; why = ''
if t and t[0] == 'lpq':
    cmd, opts, pos = getopts(t, set('PU'))
    ps = {v for k, v in opts if k == 'P'}
    good = ps == {imp}
    why = 'falta -P com a impressora (ou há -P com outra fila)'
elif t and t[0] == 'lpstat':
    dests = lpstat_o(t)
    good = bool(dests) and set(dests) == {imp}
    why = 'use lpstat -o seguido da impressora (o argumento de -o é que escolhe a fila)'
else:
    why = 'use lpq ou lpstat'
(ok if good else fail)("linha 3: listagem da fila" + ("" if good else f" ({why})"))
# ---- 4) impressora padrão do USUÁRIO (lpoptions -d grava em ~/.cups/lpoptions;
# lpadmin -d, ou lpoptions com sudo, mudam o padrão do SISTEMA)
t = toks(lines[3])
good = False; why = ''
if t and t[0] == 'lpoptions':
    cmd, opts, pos = getopts(t, set('dpoxPEh'))
    good = [v for k, v in opts if k == 'd'] == [imp] and not [1 for k, v in opts if k in ('x',)] and not SUDO[0]
    why = 'use lpoptions -d com a impressora, sem sudo (com sudo o padrão seria o do sistema)' if SUDO[0] else 'use a opção -d com a impressora'
elif t and t[0] == 'lpadmin':
    why = 'lpadmin -d define o padrão do SISTEMA (root); o enunciado pede o padrão do usuário: use lpoptions -d'
else:
    why = 'use lpoptions -d'
(ok if good else fail)("linha 4: impressora padrão" + ("" if good else f" ({why})"))
sys.exit(1 if bad else 0)
PY
[ $? -ne 0 ] && _FAILS=$((_FAILS + 1))
finish
