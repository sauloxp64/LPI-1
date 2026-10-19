#!/bin/bash
source /opt/lab/lib.sh
# compara sem revelar o valor esperado (o valor é a resposta do exercício)
expect_val() { if [ "$2" = "$3" ]; then ok "$1"; else fail "$1 (valor encontrado: '${2:-vazio}')"; fi; }
# processos zumbis (já encerrados, ainda não colhidos) não contam como vivos
alive_pid() { ps -C "$1" -o pid=,stat= | awk '$2 !~ /^Z/ {print $1; exit}'; }
b=$P_base
p1=$b; p2=$((b + 137)); p3=$((b + 291)); pu=$((b + 404))
d=$LAB_DIR/portas
# tcp.txt
tcp=$d/tcp.txt
if [ ! -f "$tcp" ]; then
  fail "o arquivo ~/lab/portas/tcp.txt ainda não existe"
else
  for pair in "$P_s1:$p1" "$P_s2:$p2" "$P_s3:$p3"; do
    n=${pair%%:*}; p=${pair##*:}
    got=$(grep -E "^[[:space:]]*$n([[:space:]:=]+)[0-9]+[[:space:]]*\$" "$tcp" | head -1 | sed -E 's/.*[^0-9]([0-9]+)[[:space:]]*$/\1/')
    expect_val "porta TCP de $n em tcp.txt" "${got:-ausente}" "$p"
  done
  nl=$(grep -c . "$tcp")
  if [ "$nl" -eq 3 ]; then ok "tcp.txt tem exatamente 3 linhas"; else fail "tcp.txt deveria ter 3 linhas (tem $nl)"; fi
fi
# udp.txt: porta e PID reais
udp=$d/udp.txt
pid=$(alive_pid "$P_su")
if [ ! -f "$udp" ]; then
  fail "o arquivo ~/lab/portas/udp.txt ainda não existe"
elif [ -z "$pid" ]; then
  fail "o processo $P_su não está mais rodando (ele deveria continuar)"
else
  line=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]+[0-9]+[[:space:]]*$' "$udp" | head -1)
  gp=$(echo "$line" | awk '{print $1}'); gpid=$(echo "$line" | awk '{print $2}')
  expect_val "porta UDP de $P_su em udp.txt" "${gp:-ausente}" "$pu"
  expect_val "PID de $P_su em udp.txt" "${gpid:-ausente}" "$pid"
fi
# estados dos processos
if [ -n "$(alive_pid "$P_s2")" ]; then fail "o serviço $P_s2 ainda está rodando"; else ok "o serviço $P_s2 foi encerrado"; fi
for n in "$P_s1" "$P_s3" "$P_su"; do
  if [ -n "$(alive_pid "$n")" ]; then ok "$n continua rodando"; else fail "$n foi encerrado, mas deveria continuar rodando"; fi
done
finish
