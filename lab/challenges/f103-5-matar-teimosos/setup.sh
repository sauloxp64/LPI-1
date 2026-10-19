#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-5-matar-teimosos
BIN=/usr/local/lib/lab-f103-5b
# ---- limpeza de execuções anteriores ----
pkill -KILL -f "$BIN/" 2>/dev/null
for u in lab5-fila lab5-mail lab5-etl lab5-web; do
  id "$u" >/dev/null 2>&1 && pkill -KILL -u "$u" 2>/dev/null
done
sleep 0.3
for u in lab5-fila lab5-mail lab5-etl lab5-web; do drop_user "$u"; drop_group "$u"; done
rm -rf "$ST" "$BIN"; mkdir -p "$ST" "$BIN/obediente" "$BIN/teimoso" "$BIN/guarda"
d=$(fresh_dir f103-5-matar-teimosos)

# ---- usuário de serviço e "programas" ----
useradd -M -s /usr/sbin/nologin "$P_svc"
cat > "$BIN/obediente/$P_nome" <<'SCRIPT'
#!/bin/bash
echo $$ > "$1"
while true; do sleep 1 & wait $!; done
SCRIPT
cat > "$BIN/teimoso/$P_nome" <<'SCRIPT'
#!/bin/bash
# ignora os sinais "educados": só o SIGKILL derruba
trap '' TERM INT HUP QUIT
echo $$ > "$1"
while true; do sleep 1 & wait $!; done
SCRIPT
cp "$BIN/obediente/$P_nome" "$BIN/guarda/$P_nome-ctl"
chmod -R 755 "$BIN"
mkdir -p "$BIN/run"; chmod 1777 "$BIN/run"

sobe() {   # sobe <usuario> <script> <rotulo>
  local u=$1 s=$2 r=$3
  setsid setpriv --reuid="$u" --regid="$u" --clear-groups "$s" "$BIN/run/$r" </dev/null >/dev/null 2>&1 &
}
sobe "$P_svc" "$BIN/obediente/$P_nome" svc1
sobe "$P_svc" "$BIN/obediente/$P_nome" svc2
sobe "$P_svc" "$BIN/teimoso/$P_nome"   svc3
sobe aluno    "$BIN/obediente/$P_nome" aluno
sobe root     "$BIN/guarda/$P_nome-ctl" guarda
for r in svc1 svc2 svc3 aluno guarda; do
  for i in $(seq 1 50); do [ -s "$BIN/run/$r" ] && break; sleep 0.1; done
  [ -s "$BIN/run/$r" ] || { echo "falha ao iniciar $r"; exit 1; }
  cp "$BIN/run/$r" "$ST/pid.$r"
done
chown -R aluno:aluno "$d"
echo "cenário pronto: processos $P_nome em execução (do usuário $P_svc e do aluno)"
