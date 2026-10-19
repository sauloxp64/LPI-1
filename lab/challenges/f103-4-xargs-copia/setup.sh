#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-4-xargs-copia
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-4-xargs-copia)
mkdir -p "$d/destino"
python3 - "$d" "$ST" <<'PY'
import hashlib, os, random, sys
d, st = sys.argv[1], sys.argv[2]
ext = os.environ['P_ext']; base = os.environ['P_base']
raiz = os.path.join(d, base)
subs = ['norte/redes', 'norte/web', 'sul/redes', 'sul/banco', 'sul/web/publico', 'leste', 'oeste/backup', 'oeste/filas']
nomes = ['proxy', 'balanceador', 'regras de envio', 'cache', 'limites de uso', 'dns-interno', 'agendador', 'certificados',
         'fila de pedidos', 'monitor', 'rotas', 'autenticacao', 'replica', 'painel admin']
random.shuffle(nomes)
alvos = nomes[:random.randint(9, 11)]
total = 0
exp = {}
for n in alvos:
    sub = random.choice(subs)
    os.makedirs(os.path.join(raiz, sub), exist_ok=True)
    linhas = ['# %s' % n] + ['%s_%d = %d' % (random.choice(['porta', 'limite', 'tempo', 'tentativas', 'peso']), i, random.randint(1, 9999)) for i in range(random.randint(3, 12))]
    dados = ('\n'.join(linhas) + '\n').encode()
    rel = os.path.join(sub, n + '.' + ext)
    open(os.path.join(raiz, rel), 'wb').write(dados)
    total += len(linhas)
    exp[n + '.' + ext] = hashlib.sha256(dados).hexdigest()
# iscas: parecidos, mas que não terminam em .ext
for sub, nome in [('norte/web', 'proxy.' + ext + '.bak'), ('sul/banco', 'esquema.' + ext + 'x'), ('leste', 'leiame.txt'),
                  ('oeste/backup', 'antigo.' + ext + '~'), ('sul/redes', 'notas-' + ext + '.md'), ('sul/web/publico', 'indice.html')]:
    os.makedirs(os.path.join(raiz, sub), exist_ok=True)
    open(os.path.join(raiz, sub, nome), 'w').write('conteudo de apoio\nsegunda linha\nterceira linha\n')
open(os.path.join(st, 'esperado'), 'w').write(''.join('%s  %s\n' % (h, n) for n, h in sorted(exp.items())))
open(os.path.join(st, 'total'), 'w').write(str(total) + '\n')
PY
chown -R aluno:aluno "$d"
(cd "$d/$P_base" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$ST/origem.sha"
echo "cenário pronto em $d"
