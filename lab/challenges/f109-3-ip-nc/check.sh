#!/bin/bash
source /opt/lab/lib.sh
# compara sem revelar o valor esperado (o valor é a resposta do exercício)
expect_val() { if [ "$2" = "$3" ]; then ok "$1"; else fail "$1 (valor encontrado: '${2:-vazio}')"; fi; }
f=$LAB_DIR/diagrede/$P_arquivo
# valores reais
gw=$(ip -4 route show default | awk '/^default/ {print $3; exit}')
dev=$(ip -4 route show default | awk '/^default/ {for (i = 1; i <= NF; i++) if ($i == "dev") {print $(i + 1); exit}}')
cidr=$(ip -4 -o addr show dev "$dev" scope global | awk '{print $4; exit}')
ipaddr=${cidr%/*}; pref=${cidr#*/}
mtu=$(ip -o link show "$dev" | sed -n 's/.* mtu \([0-9]*\).*/\1/p' | head -1)
rede=$(python3 -c "import ipaddress,sys; print(ipaddress.ip_interface(sys.argv[1]).network)" "$cidr")
if [ ! -f "$f" ]; then
  fail "o arquivo ~/lab/diagrede/$P_arquivo ainda não existe"
else
  getk() { grep -m1 -iE "^[[:space:]]*$1[[:space:]]*=" "$f" | cut -d= -f2- | tr -d '[:space:]'; }
  expect_val "interface (rota padrão)" "$(getk interface)" "$dev"
  expect_val "ip da interface" "$(getk ip)" "$ipaddr"
  expect_val "prefixo" "$(getk prefixo)" "$pref"
  expect_val "gateway" "$(getk gateway)" "$gw"
  expect_val "rede em CIDR" "$(getk rede)" "$rede"
  expect_val "mtu" "$(getk mtu)" "$mtu"
fi
# listener nc
alive_nc() { ps -eo pid=,stat=,comm=,args= | awk -v p="$P_porta" '$2 !~ /^Z/ && ($3=="nc" || $3=="ncat" || $3=="netcat" || $3=="nc.openbsd") && $0 ~ ("(^| )-[a-zA-Z]*l" ) && index($0, p) {print $1; exit}'; }
npid=$(alive_nc)
listening=$(ss -ltnH | awk -v p=":$P_porta" '$4 ~ (p "$") && ($4 ~ /^(0\.0\.0\.0|\*|\[::\]|::)/) {print $4; exit}')
if [ -n "$listening" ]; then ok "há um socket TCP em LISTEN na porta $P_porta em todas as interfaces"; else fail "nada escutando em TCP na porta $P_porta em todas as interfaces (ss -ltn)"; fi
if [ -n "$npid" ]; then ok "o processo que escuta é o nc (PID $npid)"; else fail "não encontrei um processo nc com -l na porta $P_porta"; fi
if [ -n "$listening" ]; then
  timeout 5 nc -z -w2 127.0.0.1 "$P_porta" >/dev/null 2>&1; r1=$?
  sleep 0.5
  timeout 5 nc -z -w2 127.0.0.1 "$P_porta" >/dev/null 2>&1; r2=$?
  if [ "$r1" -eq 0 ] && [ "$r2" -eq 0 ]; then ok "o listener atendeu duas conexões seguidas"; else fail "o listener não atendeu duas conexões seguidas (ele encerra após a primeira? veja a opção -k)"; fi
fi
finish
