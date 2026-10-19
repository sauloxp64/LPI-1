#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-2-integridade-hash
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-2-integridade-hash)
mkdir -p "$d/entrega"
python3 - "$d/entrega" "$ST/esperado.txt" <<'PY'
import hashlib, os, random, sys
dest, exp = sys.argv[1], sys.argv[2]
alg = os.environ['P_alg']
pool = ['relatorio-q1.pdf', 'ata da reuniao.txt', 'planilha-custos.csv', 'dump-clientes.sql', 'logo-novo.png',
        'manual-usuario.pdf', 'contrato final.odt', 'inventario.csv', 'backup-etc.tar', 'chaves-publicas.txt',
        'fotos-evento.zip', 'script-deploy.sh', 'notas-versao.md', 'orcamento-2026.ods']
nomes = random.sample(pool, random.randint(8, 10))
h = getattr(hashlib, alg)
conteudo = {}
for n in nomes:
    conteudo[n] = os.urandom(random.randint(200, 3000))
    open(os.path.join(dest, n), 'wb').write(conteudo[n])
# lista oficial de hashes (formato do md5sum/sha256sum/sha512sum: "hash  nome")
ordem = sorted(nomes)
with open(os.path.join(dest, 'lista.' + alg), 'w') as f:
    for n in ordem:
        f.write('%s  %s\n' % (h(conteudo[n]).hexdigest(), n))
# depois da lista pronta: alguns arquivos são adulterados e um some
ruins = random.sample(nomes, random.randint(3, 4))
adulterados = ruins[:-1]
sumido = ruins[-1]
for n in adulterados:
    b = bytearray(conteudo[n]); b[random.randrange(len(b))] ^= 0x55
    open(os.path.join(dest, n), 'wb').write(bytes(b))
os.remove(os.path.join(dest, sumido))
open(os.path.join(dest, 'rascunho-nao-listado.txt'), 'w').write('arquivo extra que não está na lista\n')
open(exp, 'w').write(''.join(n + '\n' for n in sorted(ruins)))
PY
chown -R aluno:aluno "$d"
cp "$d/entrega/lista.$P_alg" "$ST/lista"
echo "cenário pronto em $d"
