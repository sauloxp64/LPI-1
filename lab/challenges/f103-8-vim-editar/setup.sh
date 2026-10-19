#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-8-vim-editar
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-8-vim-editar)
python3 - "$d/app.conf" "$ST" <<'PY'
import os, random, sys
out, st = sys.argv[1], sys.argv[2]
E = os.environ
sis, velho, novo = E['P_sistema'], E['P_host_antigo'], E['P_host_novo']
amb, ttl, rev = E['P_amb_novo'], E['P_ttl'], E['P_revisor']
orig = [
    '# Configuracao do servico %s' % sis,
    '# Gerado automaticamente - revisar antes de implantar',
    '',
    '[geral]',
    'nome = %s' % sis,
    'ambiente = homologacao',
    'debug = true',
    'idioma = pt_BR',
    '',
    '[banco]',
    'host = %s' % velho,
    'porta = %d' % random.choice([5432, 3306, 1521, 5433]),
    'usuario = app_%s' % sis[:4],
    'replica = %s' % velho,
    'timeout = %d' % random.choice([10, 15, 20, 30]),
    '',
    '[cache]',
    'host = %s' % velho,
    'porta = %d' % random.choice([6379, 11211, 6380]),
    'maximo = %d' % random.choice([128, 256, 512]),
    '',
    '[log]',
    'nivel = info',
    'arquivo = /var/log/%s.log' % sis,
    'rotacao = semanal',
    '# TODO remover quando a migracao terminar',
    'legado = ativo',
    '',
    '[fim]',
    'versao = %d.%d' % (random.randint(1, 4), random.randint(0, 9)),
]
open(out, 'w').write('\n'.join(orig) + '\n')
open(os.path.join(st, 'original'), 'w').write('\n'.join(orig) + '\n')
# resultado esperado
res = []
for l in orig:
    if l == 'debug = true' or l.startswith('# TODO') or l == 'legado = ativo':
        continue
    l = l.replace(velho, novo)
    if l == 'ambiente = homologacao':
        l = 'ambiente = %s' % amb
    res.append(l)
    if l == '[cache]':
        res.append('ttl = %s' % ttl)
res.append('# revisado por %s' % rev)
open(os.path.join(st, 'esperado'), 'w').write('\n'.join(res) + '\n')
PY
chown -R aluno:aluno "$d"
echo "cenário pronto em $d"
