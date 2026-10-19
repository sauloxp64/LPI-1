#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-2-top-ips
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-2-top-ips)
python3 - "$d/acesso.log" "$ST/esperado.txt" <<'PY'
import os, random, sys
out, exp = sys.argv[1], sys.argv[2]
n = int(os.environ['P_n']); code = os.environ['P_codigo']
ips = set()
while len(ips) < 14:
    base = random.choice(['203.0.113.', '198.51.100.', '192.0.2.', '45.33.12.', '177.71.9.'])
    ips.add(base + str(random.randint(2, 250)))
ips = sorted(ips); random.shuffle(ips)
# contagens do código-alvo: estritamente decrescentes nos n+1 primeiros IPs
cont = {}
c = random.randint(26, 34)
for i in range(n + 1):
    cont[ips[i]] = c
    c -= random.randint(3, 6)
for ip in ips[n + 1:]:
    cont[ip] = random.randint(0, max(1, c))
outros = ['200', '200', '200', '200', '304', '301', '401', '403', '404', '500', '502']
outros = [x for x in outros if x != code]
paths = ['/', '/login', '/produtos', '/carrinho', '/api/v1/pedidos', '/static/app.js', '/static/site.css', '/contato', '/busca?q=oferta', '/api/v1/clientes']
meses = 'Mar'
linhas = []
def linha(ip, status, path=None, nbytes=None):
    p = path or random.choice(paths)
    b = nbytes if nbytes is not None else random.randint(120, 52000)
    t = '14/Mar/2026:%02d:%02d:%02d -0300' % (random.randint(8, 17), random.randint(0, 59), random.randint(0, 59))
    return '%s - - [%s] "GET %s HTTP/1.1" %s %d' % (ip, t, p, status, b)
for ip, k in cont.items():
    for _ in range(k):
        linhas.append(linha(ip, code))
for ip in ips:
    for _ in range(random.randint(12, 45)):
        linhas.append(linha(ip, random.choice(outros)))
# armadilhas para quem usa grep sem delimitar o campo: caminhos e tamanhos iguais ao código
for _ in range(14):
    linhas.append(linha(random.choice(ips), random.choice(outros), path='/produto/%s' % code))
for _ in range(14):
    linhas.append(linha(random.choice(ips), random.choice(outros), nbytes=int(code)))
random.shuffle(linhas)
open(out, 'w').write('\n'.join(linhas) + '\n')
ordem = sorted(cont.items(), key=lambda kv: -kv[1])[:n]
open(exp, 'w').write(''.join('%d %s\n' % (v, k) for k, v in ordem))
PY
chown -R aluno:aluno "$d"
cp "$d/acesso.log" "$ST/acesso.log"
echo "cenário pronto em $d"
