#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/cronaluno
log=$d/agenda.log
case "$P_dia" in segunda) dn=1;; terca) dn=2;; quarta) dn=3;; quinta) dn=4;; sexta) dn=5;; sabado) dn=6;; domingo) dn=0;; esac
export CT="$(crontab -u aluno -l 2>/dev/null)" P_dn=$dn
tmp=$(mktemp -d); chmod 755 "$tmp"; export TMPD=$tmp
SHARED=$(cd "$(dirname "${BASH_SOURCE[0]}")/../_shared" && pwd); export SHARED
# 1) análise dos campos de tempo (o python imprime OK| / FALHA| e guarda os comandos para a simulação)
python3 -B - <<'PY'
import os, re, sys
sys.path.insert(0, os.environ['SHARED'])
import cronparse as cp   # analisador compartilhado (dia do mês × dia da semana: E/OU do cron Debian)
bad = 0
def ok(m): print("OK|" + m)
def fail(m):
    global bad
    bad += 1
    print("FALHA|" + m)
def fields(line):
    p = line.split(None, 5)
    if len(p) < 6: return None
    try:
        t = cp.parse_tempo(p[:5])
    except cp.CronErro:
        return 'erro'
    return t, p[5]
env = os.environ
home = "/home/aluno"
alldays = set(range(1, 32)); allmon = set(range(1, 13))
jobs = [
    ("A", env['P_script_a'], {int(env['P_minuto'])}, {int(env['P_hora'])}, {int(env['P_dn'])}),
    ("B", env['P_script_b'], set(range(0, 60, int(env['P_passo']))), set(range(int(env['P_h_ini']), int(env['P_h_fim']) + 1)), {1, 2, 3, 4, 5}),
]
lines = [l.strip() for l in env['CT'].splitlines() if l.strip() and not l.strip().startswith('#')]
lines = [l for l in lines if not re.match(r'^[A-Za-z_][A-Za-z0-9_]*\s*=', l)]
for tag, script, emi, eho, edw in jobs:
    mine = [l for l in lines if script in l]
    if not mine:
        fail(f"{tag}: nenhuma linha do crontab de aluno agenda {script}")
        continue
    if len(mine) > 1:
        fail(f"{tag}: {script} aparece em {len(mine)} linhas do crontab (deveria ser uma só)")
    f = fields(mine[0])
    if f is None or f == 'erro':
        fail(f"{tag}: a linha de {script} não tem 5 campos de tempo válidos seguidos do comando")
        continue
    t, cmd = f
    mi, ho, dm, mo, dw = t.mi, t.ho, t.dm, t.mo, t.dw
    ok(f"{tag}: a linha de {script} está no crontab de aluno")
    (ok if mi == emi else fail)(f"{tag}: campo dos minutos de {script}" + ("" if mi == emi else " não confere com o pedido"))
    (ok if ho == eho else fail)(f"{tag}: campo das horas de {script}" + ("" if ho == eho else " não confere com o pedido"))
    good = dm == alldays and mo == allmon
    (ok if good else fail)(f"{tag}: dia do mês e mês de {script}" + ("" if good else " não conferem: deveria valer para qualquer dia do mês e qualquer mês"))
    (ok if dw == edw else fail)(f"{tag}: campo do dia da semana de {script}" + ("" if dw == edw else " não confere com o pedido"))
    if good and dw == edw:
        # os conjuntos batem, mas o cron combina dia do mês e dia da semana com OU quando NENHUM dos dois começa com '*'
        # (ex.: "1-31 * 1" roda todo dia); o calendário efetivo precisa ser o pedido
        esperado = cp.tempo_esperado(emi, eho, alldays, allmon, edw, True, False)
        same = cp.mesmo_calendario(t, esperado)
        (ok if same else fail)(f"{tag}: dias em que {script} realmente roda" + ("" if same else " não conferem: quando dia do mês e dia da semana são ambos restritos (não começam com '*'), o cron usa OU e roda em mais dias; use '*' no dia do mês"))
    cmd = re.sub(r'(^|\s)~/', lambda m: m.group(1) + home + '/', cmd).replace('$HOME', home).replace('${HOME}', home)
    open(os.path.join(env['TMPD'], tag + '.cmd'), 'w').write(cmd)
sys.exit(1 if bad else 0)
PY
[ $? -ne 0 ] && _FAILS=$((_FAILS + 1))
# 2) simulação do cron: /bin/sh -c "<comando>" como aluno, ambiente mínimo, cwd = home
sim() { # tag script
  local f="$tmp/$1.cmd"
  [ -f "$f" ] || return 0
  chmod 644 "$f"
  local before after
  before=$(grep -c "^\[$2\]" "$log" 2>/dev/null); before=${before:-0}
  timeout 15 su -s /bin/sh aluno -c "cd /home/aluno && env -i HOME=/home/aluno LOGNAME=aluno USER=aluno SHELL=/bin/sh PATH=/usr/bin:/bin /bin/sh -c \"\$(cat $f)\"" >/dev/null 2>&1
  after=$(grep -c "^\[$2\]" "$log" 2>/dev/null); after=${after:-0}
  if [ "$((after - before))" -ge 2 ] && grep -q "^\[$2\] concluido" "$log" && grep -q "^\[$2\] aviso" "$log"; then
    ok "$1: o comando de $2, rodando como no cron, grava a saída e o erro no agenda.log"
  else
    fail "$1: ao executar o comando de $2 como o cron faria, a saída e o erro não chegaram ao agenda.log (caminho absoluto? permissão de execução? redirecionamento?)"
  fi
  if [ "$(head -1 "$log" 2>/dev/null)" != "# registro das rotinas agendadas" ]; then fail "$1: o agenda.log perdeu o conteúdo anterior (era para anexar)"; fi
}
sim A "$P_script_a"
sim B "$P_script_b"
rm -rf "$tmp"
finish
