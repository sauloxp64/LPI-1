#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-3-tar-backup
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-3-tar-backup)
python3 - "$d" "$ST" <<'PY'
import hashlib, os, random, subprocess, sys, tempfile
d, st = sys.argv[1], sys.argv[2]
proj = os.environ['P_proj']; comp = os.environ['P_comp']; arq = os.environ['P_arq']
def grava(base, rel, dados=None):
    p = os.path.join(base, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'wb').write(dados if dados is not None else (('# %s\n' % rel).encode() + os.urandom(random.randint(40, 400)).hex().encode() + b'\n'))
    return p
# 1) projeto a ser salvo
raiz = os.path.join(d, proj)
nomes_src = random.sample(['main', 'rotas', 'modelos', 'util', 'auth', 'filas', 'mail', 'relatorios'], 4)
nomes_conf = random.sample(['app', 'banco', 'rotas', 'smtp', 'cache', 'log'], 3)
nomes_csv = random.sample(['clientes', 'produtos', 'pedidos', 'estoque'], 3)
manter = []
for n in nomes_src: manter.append('%s/src/%s.py' % (proj, n))
for n in nomes_conf: manter.append('%s/config/%s.conf' % (proj, n))
for n in nomes_csv: manter.append('%s/data/%s.csv' % (proj, n))
manter += ['%s/README.txt' % proj, '%s/.env.exemplo' % proj, '%s/src/modulos/extra.py' % proj]
excluir = ['%s/logs/%s.log' % (proj, x) for x in ('acesso', 'erro', 'debug')] + \
          ['%s/cache/%s.tmp' % (proj, x) for x in ('a1', 'b2', 'c3')] + \
          ['%s/data/importacao-%d.tmp' % (proj, random.randint(1, 99)), '%s/src/editor.tmp' % proj]
for rel in manter + excluir: grava(d, rel)
hashes = []
for rel in sorted(manter):
    hashes.append('%s  %s\n' % (hashlib.sha256(open(os.path.join(d, rel), 'rb').read()).hexdigest(), rel))
open(os.path.join(st, 'hashes'), 'w').writelines(hashes)
# 2) arquivo legado, com compressão sorteada (bz2 ou xz)
tmp = tempfile.mkdtemp()
site = ['site/conf/' + arq, 'site/conf/outro.conf', 'site/conf/ssl.conf', 'site/www/index.html', 'site/www/sobre.html', 'site/www/css/estilo.css']
for rel in site: grava(tmp, rel)
flag = {'bz2': '-cjf', 'xz': '-cJf'}[comp]
subprocess.check_call(['tar', '-C', tmp, flag, os.path.join(d, 'legado.tar.' + comp), 'site'])
open(os.path.join(st, 'restaurado.sha'), 'w').write(hashlib.sha256(open(os.path.join(tmp, 'site/conf/' + arq), 'rb').read()).hexdigest() + '\n')
os.makedirs(os.path.join(d, 'restaurado'), exist_ok=True)
PY
chown -R aluno:aluno "$d"
echo "cenário pronto em $d"
