#!/bin/bash
source /opt/lab/lib.sh
f=$LAB_DIR/diagrede/$P_arquivo
gw=$(ip -4 route show default | awk '/^default/ {print $3; exit}')
dev=$(ip -4 route show default | awk '/^default/ {for (i = 1; i <= NF; i++) if ($i == "dev") {print $(i + 1); exit}}')
cidr=$(ip -4 -o addr show dev "$dev" scope global | awk '{print $4; exit}')
mtu=$(ip -o link show "$dev" | sed -n 's/.* mtu \([0-9]*\).*/\1/p' | head -1)
rede=$(ip -4 route show dev "$dev" proto kernel scope link | awk '{print $1; exit}')
cat > "$f" <<X
interface=$dev
ip=${cidr%/*}
prefixo=${cidr#*/}
gateway=$gw
rede=$rede
mtu=$mtu
X
chown aluno:aluno "$f"
(setsid nohup su -s /bin/sh aluno -c "nc -k -l $P_porta" >/dev/null 2>&1 < /dev/null &)
sleep 1
