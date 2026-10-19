#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-2-trecho-linhas
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-2-trecho-linhas)
python3 - "$d/servico.log" <<'PY'
import random, sys
out = sys.argv[1]
hosts = ['srv-app01', 'srv-app02', 'srv-db01', 'srv-cache1']
procs = [('nginx', 'upstream respondeu em {n} ms'), ('sshd', 'conexao aceita de 10.0.{a}.{b}'),
         ('cron', 'tarefa horaria concluida em {n}s'), ('postgres', 'checkpoint concluido: {n} buffers'),
         ('kernel', 'fila de rede com {n} pacotes pendentes'), ('backup', 'copiou {n} arquivos para o destino'),
         ('app', 'sessao {n} renovada para usuario{a}'), ('logrotate', 'rotacao de {n} arquivos finalizada')]
n_lin = random.randint(90, 150)
mins = random.randint(0, 20)
sec = 0
lines = []
for i in range(n_lin):
    sec += random.randint(1, 40)
    if sec >= 60:
        mins += sec // 60
        sec %= 60
    h = 8 + mins // 60
    p, msg = random.choice(procs)
    msg = msg.format(n=random.randint(3, 9000), a=random.randint(1, 250), b=random.randint(1, 250))
    lines.append('Mar 14 %02d:%02d:%02d %s %s[%d]: %s' % (h % 24, mins % 60, sec, random.choice(hosts), p, random.randint(300, 9000), msg))
open(out, 'w').write('\n'.join(lines) + '\n')
PY
chown -R aluno:aluno "$d"
cp "$d/servico.log" "$ST/servico.log"
echo "cenário pronto em $d"
