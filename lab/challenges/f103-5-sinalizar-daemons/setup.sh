#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-5-sinalizar-daemons
BIN=/usr/local/lib/lab-f103-5a
# limpa processos e arquivos de uma execução anterior
pkill -KILL -f "$BIN/" 2>/dev/null
sleep 0.3
rm -rf "$ST" "$BIN"; mkdir -p "$ST" "$BIN"
d=$(fresh_dir f103-5-sinalizar-daemons)
mkdir -p "$d/logs"

lanca() {   # lanca <nome>: cria o "daemon" e o inicia em segundo plano, separado do terminal
  local n=$1
  cat > "$BIN/$n" <<SCRIPT
#!/bin/bash
log="$d/logs/$n.log"
echo \$\$ > "$ST/pid.$n"
echo "\$(date +%H:%M:%S) $n iniciado (pid \$\$)" >> "\$log"
trap 'echo "\$(date +%H:%M:%S) SIGHUP recebido: configuracao recarregada" >> "\$log"' HUP
trap 'echo "\$(date +%H:%M:%S) SIGTERM recebido: encerrando com calma" >> "\$log"; exit 0' TERM
while true; do sleep 1 & wait \$!; done
SCRIPT
  chmod 755 "$BIN/$n"
  # sem nohup: o nohup deixaria o SIGHUP ignorado, e o daemon não poderia tratá-lo
  setsid "$BIN/$n" </dev/null >/dev/null 2>&1 &
}
for n in "$P_d1" "$P_d2" "$P_d1-aux"; do lanca "$n"; done
# espera os três subirem (cada daemon grava o próprio PID em $ST/pid.<nome>)
for n in "$P_d1" "$P_d2" "$P_d1-aux"; do
  for i in $(seq 1 50); do
    [ -s "$ST/pid.$n" ] && [ -s "$d/logs/$n.log" ] && break
    sleep 0.1
  done
  [ -s "$ST/pid.$n" ] || { echo "falha ao iniciar $n"; exit 1; }
done
chown -R aluno:aluno "$d"
echo "cenário pronto: daemons $P_d1, $P_d1-aux e $P_d2 em execução"
