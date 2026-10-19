#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-6-nice-renice
BIN=/usr/local/lib/lab-f103-6
# ---- limpeza de execuções anteriores ----
pkill -KILL -f "$BIN/" 2>/dev/null
for j in fecha relato varre limpa; do pkill -KILL -f "lote-$j.sh" 2>/dev/null; done
sleep 0.3
rm -rf "$ST" "$BIN"; mkdir -p "$ST" "$BIN/run"; chmod 1777 "$BIN/run"
d=$(fresh_dir f103-6-nice-renice)

# ---- o processo pesado, rodando com a prioridade normal (nice 0) ----
cat > "$BIN/$P_nome" <<'SCRIPT'
#!/bin/bash
echo $$ > "$1"
while true; do sleep 1 & wait $!; done
SCRIPT
chmod 755 "$BIN" "$BIN/$P_nome"
setsid setpriv --reuid=aluno --regid=aluno --clear-groups "$BIN/$P_nome" "$BIN/run/pid" </dev/null >/dev/null 2>&1 &
for i in $(seq 1 50); do [ -s "$BIN/run/pid" ] && break; sleep 0.1; done
[ -s "$BIN/run/pid" ] || { echo "falha ao iniciar $P_nome"; exit 1; }
cp "$BIN/run/pid" "$ST/pid"

# ---- o lote que o aluno vai iniciar com prioridade reduzida ----
cat > "$d/lote-$P_job.sh" <<'SCRIPT'
#!/bin/bash
# tarefa em lote de longa duração (simulada)
while true; do sleep 1; done
SCRIPT
chmod 755 "$d/lote-$P_job.sh"
chown -R aluno:aluno "$d"
echo "cenário pronto: $P_nome rodando com nice 0 (PID $(cat "$ST/pid"))"
