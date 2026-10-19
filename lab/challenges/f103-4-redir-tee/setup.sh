#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-4-redir-tee
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-4-redir-tee)
python3 - "$d/servidores.txt" <<'PY'
import random, sys
hosts = ['gw-matriz', 'sw-core1', 'sw-core2', 'fw-borda', 'srv-ldap', 'srv-dns1', 'srv-dns2', 'srv-nfs', 'srv-mail',
         'ap-andar1', 'ap-andar2', 'nas-backup', 'imp-rh', 'cam-portaria', 'srv-web1']
esc = random.sample(hosts, random.randint(7, 9))
n_falha = random.randint(2, 3)
falhas = set(random.sample(esc, n_falha))
with open(sys.argv[1], 'w') as f:
    for h in esc:
        f.write('%s %s %d\n' % (h, 'falha' if h in falhas else 'ok', random.randint(1, 180)))
PY
cat > "$d/coleta.sh" <<SCRIPT
#!/bin/bash
# coleta.sh - verifica a lista de equipamentos de $P_rotulo
cd "\$(dirname "\$0")"
echo "== coleta de $P_rotulo =="
total=0
while read -r host estado ms; do
  total=\$((total + 1))
  if [ "\$estado" = ok ]; then
    echo "OK: \$host respondeu em \${ms}ms"
  else
    echo "ERRO: \$host sem resposta" >&2
  fi
done < servidores.txt
echo "== fim: \$total equipamentos verificados =="
SCRIPT
chmod 755 "$d/coleta.sh"
cat > "$d/historico.txt" <<HIST
# historico de coletas de $P_rotulo
2026-03-10 coleta anterior: $((RANDOM % 4 + 5)) ok, $((RANDOM % 3)) erro
2026-03-11 coleta anterior: $((RANDOM % 4 + 5)) ok, $((RANDOM % 3)) erro
HIST
chown -R aluno:aluno "$d"
# estado esperado
bash "$d/coleta.sh" > "$ST/saida" 2> "$ST/erros"
bash "$d/coleta.sh" > "$ST/ambos" 2>&1
cp "$d/historico.txt" "$ST/historico.orig"
sha256sum "$d/coleta.sh" "$d/servidores.txt" > "$ST/shas"
echo "cenário pronto em $d"
