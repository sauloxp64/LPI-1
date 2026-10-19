#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-7-sed-mascarar-ip
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-7-sed-mascarar-ip)
python3 - "$d/acessos.log" "$ST/esperado.txt" <<'PY'
import os, random, re, sys
out, exp = sys.argv[1], sys.argv[2]
campo, mascara, ult = os.environ['P_campo'], os.environ['P_mascara'], os.environ['P_ult']
nomes = ['maria', 'joao7', 'ana', 'pedro22', 'luiza', 'carlos', 'bia', 'tiago9', 'renata', 'caio', 'paula', 'diego3', 'vera', 'otavio']
acoes = ['login', 'logout', 'download', 'upload', 'consulta', 'exclusao', 'login-falho']
def ip():
    return '%d.%d.%d.%d' % (random.choice([10, 172, 192, 187, 201, 45]), random.randint(0, 255), random.randint(0, 255), random.randint(1, 254))
linhas = ['# exportado do sistema de auditoria - uso interno', '# formato: data hora %s origem [destino] acao' % campo, '']
for i in range(random.randint(45, 70)):
    if random.random() < 0.08:
        linhas.append('')
    if random.random() < 0.06:
        linhas.append('# manutencao programada: %s' % random.choice(['rede', 'banco', 'storage']))
    t = '2026-05-11 %02d:%02d:%02d' % (8 + i // 20, (i * 7) % 60, (i * 13) % 60)
    partes = [t, '%s=%s' % (campo, random.choice(nomes)), 'origem=%s' % ip()]
    if random.random() < 0.5:
        partes.append('destino=%s' % ip())
    partes.append('acao=%s' % random.choice(acoes))
    if random.random() < 0.3:
        partes.append('versao=%d.%d.%d' % (random.randint(1, 4), random.randint(0, 9), random.randint(0, 9)))
    if random.random() < 0.3:
        partes.append('tempo=%d.%02ds' % (random.randint(0, 3), random.randint(0, 99)))
    linhas.append(' '.join(partes))
open(out, 'w').write('\n'.join(linhas) + '\n')
res = []
for l in linhas:
    if l == '' or l.startswith('#'):
        continue
    l = re.sub(r'(\d+\.\d+\.\d+)\.\d+', lambda m: m.group(1) + '.' + ult, l)
    l = re.sub(re.escape(campo) + r'=\S+', campo + '=' + mascara, l)
    res.append(l)
open(exp, 'w').write('\n'.join(res) + '\n')
PY
chown -R aluno:aluno "$d"
cp "$d/acessos.log" "$ST/acessos.log"
echo "cenário pronto em $d"
