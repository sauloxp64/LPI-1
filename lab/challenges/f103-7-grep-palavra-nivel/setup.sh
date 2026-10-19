#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-7-grep-palavra-nivel
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-7-grep-palavra-nivel)
python3 - "$d/app.log" "$ST/esperado.txt" <<'PY'
import os, random, re, sys
out, exp = sys.argv[1], sys.argv[2]
a, b = os.environ['P_a'], os.environ['P_b']
mods = ['pagamento', 'estoque', 'sessao', 'fila', 'cache', 'auth', 'relatorio', 'envio', 'resolver', 'banco']
msgs_ok = ['requisicao concluida em %d ms', 'usuario %d autenticado', 'cache atualizado: %d chaves', 'job %d iniciado',
           'conexao reaproveitada (pool=%d)', 'pagina %d servida', 'fila com %d itens', 'checkpoint %d gravado']
quentes = ['timeout ao falar com o banco (tentativa %d)', 'falha ao gravar o pedido %d', 'disco quase cheio: %d%% usado',
           'processo %d terminou de forma inesperada', 'certificado expira em %d dias', 'indice %d corrompido']
linhas = []
def stamp(i):
    s = i * random.randint(2, 9)
    return '2026-03-14 %02d:%02d:%02d' % (8 + s // 3600 % 10, s // 60 % 60, s % 60)
n = random.randint(100, 140)
for i in range(n):
    r = random.random()
    mod = random.choice(mods)
    v = random.randint(2, 9000)
    if r < 0.58:
        linhas.append('%s [%s] %s: %s' % (stamp(i), random.choice(['INFO', 'DEBUG']), mod, random.choice(msgs_ok) % v))
    elif r < 0.78:
        linhas.append('%s [WARN] %s: %s' % (stamp(i), mod, random.choice(quentes) % v))
    elif r < 0.90:
        w = random.choice([a, b])
        linhas.append('%s [%s] %s: %s' % (stamp(i), w, mod, random.choice(quentes) % v))
    else:
        # iscas: contêm a palavra como parte de outra palavra ou em minúsculas
        w = random.choice([a, b])
        modelo = random.choice(['NO%s para exemplo.com.br', '%sS=0 total=%d', '%s_COUNT=0 limite=%d', 'contador de %s zerado',
                                'categoria %sFUL ignorada', 'x%s7 apenas rotulo'])
        if 'contador' in modelo:
            txt = modelo % w.lower()
        elif '%d' in modelo:
            txt = modelo % (w, v)
        else:
            txt = modelo % w
        linhas.append('%s [%s] %s: %s' % (stamp(i), random.choice(['INFO', 'DEBUG']), mod, txt))
# garante um número razoável de acertos reais, incluindo a palavra no meio da mensagem
for k in range(random.randint(2, 4)):
    pos = random.randrange(len(linhas))
    w = random.choice([a, b])
    linhas[pos] = '%s [WARN] %s: falha anterior classificada como %s (%d)' % (stamp(pos), random.choice(mods), w, random.randint(2, 900))
rx = re.compile(r'(?<![A-Za-z0-9_])(%s|%s)(?![A-Za-z0-9_])' % (re.escape(a), re.escape(b)))
open(out, 'w').write('\n'.join(linhas) + '\n')
open(exp, 'w').write(''.join('%d:%s\n' % (i + 1, l) for i, l in enumerate(linhas) if rx.search(l)))
PY
chown -R aluno:aluno "$d"
cp "$d/app.log" "$ST/app.log"
echo "cenário pronto em $d"
