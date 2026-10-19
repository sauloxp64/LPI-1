#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-3-find-criterios
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-3-find-criterios)
python3 - "$d/projeto" "$ST/esperado.txt" <<'PY'
import os, random, sys, time
raiz, exp = sys.argv[1], sys.argv[2]
ext = os.environ['P_ext']; kb = int(os.environ['P_kb']); dias = int(os.environ['P_dias'])
dirs = ['src', 'src/modulos', 'logs', 'logs/2025', 'logs/2026', 'build', 'cache', 'docs', 'config', 'dados']
for sub in dirs:
    os.makedirs(os.path.join(raiz, sub), exist_ok=True)
palavras = ['acesso', 'erro', 'auditoria', 'vendas', 'estoque', 'cliente', 'fatura', 'sessao', 'fila', 'envio', 'rotina',
            'sincro', 'relato', 'entrada', 'saida', 'cobranca', 'agenda', 'catalogo', 'pedido', 'compra', 'indice',
            'carga', 'migracao', 'usuarios', 'metricas', 'alertas', 'importa', 'exporta', 'limpeza', 'diario', 'semanal',
            'mensal', 'proxy', 'cache', 'balanco', 'rascunho', 'resumo', 'teste', 'depuracao', 'trafego']
random.shuffle(palavras)
agora = time.time()
dia = 86400
usados = set()
def novo(stem_ext, sub=None):
    sub = sub or random.choice(dirs)
    stem = palavras.pop()
    return os.path.join(sub, stem + stem_ext)
def cria(rel, tamanho, idade_dias):
    p = os.path.join(raiz, rel)
    with open(p, 'wb') as f:
        f.write(os.urandom(tamanho) if tamanho < 4096 else (b'dados do laboratorio\n' * (tamanho // 21 + 1))[:tamanho])
    t = agora - idade_dias * dia - random.randint(0, 40000)
    os.utime(p, (t, t))
    return p
grande = lambda: int(kb * 1024 * random.uniform(1.6, 3.0))
pequeno = lambda: int(kb * 1024 * random.uniform(0.15, 0.6))
velho = lambda: dias + random.randint(4, 50)
novo_d = lambda: random.randint(1, dias - 4)
alvos = []
for _ in range(random.randint(5, 7)):
    rel = novo('.' + ext); cria(rel, grande(), velho()); alvos.append(rel)
for _ in range(3): cria(novo('.' + ext), grande(), novo_d())      # grande, mas recente
for _ in range(3): cria(novo('.' + ext), pequeno(), velho())      # antigo, mas pequeno
for _ in range(2): cria(novo('.' + ext), pequeno(), novo_d())     # nem uma coisa nem outra
# grandes e antigos, mas de outro tipo/extensão
cria(novo('.' + ext + '.gz'), grande(), velho())
cria(novo('.' + ext.upper()), grande(), velho())
cria(novo('.txt'), grande(), velho())
cria(novo('.csv'), grande(), velho())
cria(novo('.' + ext + '.old'), grande(), velho())
# diretórios cujo nome termina na extensão (não são arquivos regulares)
dir_antigos = []
for _ in range(2):
    rel = novo('.' + ext)
    os.makedirs(os.path.join(raiz, rel), exist_ok=True)
    cria(os.path.join(rel, 'leiame.txt'), 300, velho())
    dir_antigos.append(rel)
# um link simbólico com a extensão, apontando para um alvo verdadeiro
lnk = novo('.' + ext)
os.symlink(os.path.join(raiz, alvos[0]), os.path.join(raiz, lnk))
# alguns arquivos de ruído
for _ in range(6): cria(novo(random.choice(['.py', '.conf', '.md', '.sh'])), pequeno(), random.randint(1, 80))
for rel in dir_antigos:
    t = agora - velho() * dia
    os.utime(os.path.join(raiz, rel), (t, t))
open(exp, 'w').write(''.join(a + '\n' for a in sorted(alvos)))
PY
chown -R aluno:aluno "$d"
find "$d/projeto" -printf '%P %s %T@\n' | sort > "$ST/snapshot"
echo "cenário pronto em $d"
