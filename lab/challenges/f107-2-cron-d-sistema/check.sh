#!/bin/bash
source /opt/lab/lib.sh
S=/usr/local/bin/$P_script
tmp=$(mktemp -d); chmod 755 "$tmp"; export TMPD=$tmp
# arquivos de /etc/cron.d que mencionam o script
cand=$(grep -l -F "$S" /etc/cron.d/* 2>/dev/null)
if [ -z "$cand" ]; then
  fail "nenhum arquivo em /etc/cron.d/ agenda $S"
  rm -rf "$tmp"; finish; exit
fi
valid=""
for f in $cand; do
  b=$(basename "$f")
  if printf '%s' "$b" | grep -Eq '^[A-Za-z0-9_-]+$'; then valid=$f; break; fi
done
if [ -z "$valid" ]; then
  fail "o(s) arquivo(s) $(for f in $cand; do basename $f; done | tr '\n' ' ') têm nome que o cron do Debian ignora (só letras, números, _ e -)"
  rm -rf "$tmp"; finish; exit
fi
f=$valid
ok "o arquivo /etc/cron.d/$(basename "$f") tem um nome aceito pelo cron"
expect_eq "dono do arquivo = root" "$(stat -c %U "$f")" "root"
mode=$(stat -c %a "$f")
if [ $(( 0$mode & 022 )) -eq 0 ]; then ok "o arquivo não é gravável por grupo/outros (modo $mode)"; else fail "o arquivo é gravável por grupo/outros (modo $mode): o cron o ignoraria"; fi
export CRONF="$f"
python3 - <<'PY'
import os, re, sys
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
DOW = {d: i for i, d in enumerate("sun mon tue wed thu fri sat".split())}
bad = 0
def ok(m): print("OK|" + m)
def fail(m):
    global bad
    bad += 1
    print("FALHA|" + m)
def conv(x, names):
    x = x.lower()
    return names[x] if x in names else int(x)
def expand(field, lo, hi, names=None):
    names = names or {}
    out = set()
    for part in field.split(','):
        step = 1
        if '/' in part:
            part, s = part.split('/', 1)
            step = int(s)
        if part == '*': a, b = lo, hi
        elif '-' in part:
            x, y = part.split('-', 1)
            a, b = conv(x, names), conv(y, names)
        else:
            a = b = conv(part, names)
        out |= set(range(a, b + 1, step))
    return out
env = os.environ
script = '/usr/local/bin/' + env['P_script']
lines = [l.strip() for l in open(env['CRONF'], encoding='utf-8', errors='replace') if l.strip() and not l.strip().startswith('#')]
lines = [l for l in lines if not re.match(r'^[A-Za-z_][A-Za-z0-9_]*\s*=', l)]
mine = [l for l in lines if script in l]
if not mine:
    fail("a linha que agenda o script não foi encontrada")
    sys.exit(1)
if len(mine) > 1:
    fail("o script aparece em mais de uma linha do arquivo")
p = mine[0].split(None, 6)
if len(p) < 7:
    fail("a linha precisa de 5 campos de tempo + usuário + comando (formato do /etc/crontab)")
    sys.exit(1)
try:
    mi = expand(p[0], 0, 59); ho = expand(p[1], 0, 23); dm = expand(p[2], 1, 31)
    mo = expand(p[3], 1, 12, MON); dw = {0 if v == 7 else v for v in expand(p[4], 0, 7, DOW)}
except Exception:
    fail("algum campo de tempo da linha é inválido")
    sys.exit(1)
c = lambda cond, m: ok(m) if cond else fail(m + " (não confere com o pedido)")
c(mi == {int(env['P_minuto'])}, "campo dos minutos")
c(ho == {int(env['P_hora'])}, "campo das horas")
c(dm == {int(env['P_d1']), int(env['P_d2'])}, "campo dos dias do mês")
c(mo == set(range(int(env['P_m1']), int(env['P_m2']) + 1)), "campo dos meses")
c(dw == set(range(0, 7)), "campo do dia da semana (qualquer dia)")
c(p[5] == env['P_robo'], "6º campo: usuário que executa a tarefa")
open(os.path.join(env['TMPD'], 'cmd'), 'w').write(p[6])
open(os.path.join(env['TMPD'], 'user'), 'w').write(p[5])
sys.exit(1 if bad else 0)
PY
[ $? -ne 0 ] && _FAILS=$((_FAILS + 1))
# simulação: executa o comando como o usuário do 6º campo, com o ambiente mínimo do cron
if [ -f "$tmp/cmd" ] && [ -f "$tmp/user" ]; then
  u=$(cat "$tmp/user")
  m=/var/lib/$P_robo/ultima-execucao.txt
  rm -f "$m"
  if id "$u" >/dev/null 2>&1; then
    timeout 15 su -s /bin/sh "$u" -c "cd / && env -i HOME=/ LOGNAME=$u USER=$u SHELL=/bin/sh PATH=/usr/bin:/bin /bin/sh -c \"\$(cat $tmp/cmd)\"" >/dev/null 2>&1
  fi
  expect_eq "o comando, executado como '$u', grava o marcador do usuário $P_robo" "$(cat "$m" 2>/dev/null)" "usuario=$P_robo"
fi
rm -rf "$tmp"
finish
