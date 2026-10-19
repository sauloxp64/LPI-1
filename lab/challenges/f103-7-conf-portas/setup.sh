#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-7-conf-portas
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-7-conf-portas)
python3 - "$d/servidor.conf" "$ST" <<'PY'
import os, random, re, sys
out, st = sys.argv[1], sys.argv[2]
D = os.environ['P_dir']; srv = os.environ['P_servico']
def porta(): return random.choice([80, 443, 8080, 8081, 8443, 9000, 9090, 3000, 5000, 8888, 10443])
def ipv4(): return '10.%d.%d.%d' % (random.randint(0, 9), random.randint(0, 9), random.randint(1, 250))
usadas = random.sample([80, 443, 8080, 8443, 9000, 9090, 3000, 5000, 8888, 10443], 8)
L = []
L.append('# ' + srv + ' - configuracao principal')
L.append('# NAO edite as linhas marcadas com #')
L.append('')
L.append('ServerName %s.exemplo.com.br' % srv)
L.append('Timeout 30')
L.append('')
L.append('# --- portas de escuta ---')
blocos = [
    '%s %d' % (D, usadas[0]),                                   # simples
    '#%s %d' % (D, usadas[1]),                                  # comentada, sem espaço
    '   # %s %d' % (D, usadas[2]),                              # comentada e indentada
    '%s %s:%d' % (D, ipv4(), usadas[3]),                        # com endereço IP
    '%s %d # alternativa interna' % (D, usadas[4]),             # comentário no fim da linha
    '%s%s 511' % (D, 'Backlog'),                                # outra diretiva que começa igual
    '\t%s   %d' % (D, usadas[5]),                               # tab e espaços extras
    '\t# %s %s:%d' % (D, ipv4(), usadas[6]),                    # comentada com tab
    '%s %s:%d # so rede local' % (D, ipv4(), usadas[7]),        # IP e comentário no fim
]
random.shuffle(blocos)
meio = [
    'MaxClients %d' % random.choice([100, 150, 250]),
    '   ',                                                      # linha só com espaços
    'DocumentRoot /srv/%s/www' % srv,
    '# Include conf.d/extra.conf',
    'KeepAlive On',
    '',
    'LogLevel warn',
]
for i, b in enumerate(blocos):
    L.append(b)
    if i < len(meio):
        L.append(meio[i])
L += meio[len(blocos):]
L.append('')
L.append('#fim do arquivo')
open(out, 'w').write('\n'.join(L) + '\n')
ativas = [l for l in L if l.strip() and not l.lstrip().startswith('#')]
portas = []
for l in ativas:
    m = re.match(r'^\s*' + re.escape(D) + r'\s+(?:[0-9.]+:)?([0-9]+)', l)
    if m: portas.append(m.group(1))
open(os.path.join(st, 'ativas'), 'w').write('\n'.join(ativas) + '\n')
open(os.path.join(st, 'portas'), 'w').write('\n'.join(portas) + '\n')
PY
chown -R aluno:aluno "$d"
cp "$d/servidor.conf" "$ST/servidor.conf"
echo "cenário pronto em $d"
