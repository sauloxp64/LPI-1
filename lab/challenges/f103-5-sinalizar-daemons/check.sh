#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-5-sinalizar-daemons
d="$LAB_DIR/f103-5-sinalizar-daemons"
# vivo <pid> <nome>: o processo existe, ainda é o daemon e não é zumbi
vivo() {
  [ -r "/proc/$1/comm" ] || return 1
  [ "$(cat "/proc/$1/comm" 2>/dev/null)" = "$2" ] || return 1
  [ "$(awk '/^State:/{print $2}' "/proc/$1/status" 2>/dev/null)" != "Z" ]
}
rec()  { grep -c 'SIGHUP recebido' "$d/logs/$1.log" 2>/dev/null; }
term() { grep -c 'SIGTERM recebido' "$d/logs/$1.log" 2>/dev/null; }

n1=$P_d1; n2=$P_d2; n3="$P_d1-aux"
p1=$(cat "$ST/pid.$n1"); p2=$(cat "$ST/pid.$n2"); p3=$(cat "$ST/pid.$n3")

# d1: recarregou e continua vivo
if vivo "$p1" "$n1"; then ok "$n1 continua em execução (mesmo PID $p1)"; else fail "$n1 não está mais em execução: era para recarregar a configuração SEM encerrá-lo"; fi
if [ "$(rec "$n1")" -ge 1 ]; then ok "$n1 recebeu o sinal de recarga (SIGHUP)"; else fail "$n1 ainda não recarregou a configuração (nenhum SIGHUP registrado no log dele)"; fi

# d2: encerrado com SIGTERM
if vivo "$p2" "$n2"; then fail "$n2 ainda está em execução"
else
  if [ "$(term "$n2")" -ge 1 ]; then ok "$n2 foi encerrado com o pedido educado (SIGTERM) e deu tempo de limpar"
  else fail "$n2 morreu, mas sem receber SIGTERM (um encerramento forçado não dá chance de fechar com calma)"; fi
fi

# auxiliar de d1: não pode ser tocado
if vivo "$p3" "$n3"; then ok "$n3 continua em execução"; else fail "$n3 foi encerrado, mas não era para mexer nele"; fi
if [ "$(rec "$n3")" = "0" ] && [ "$(term "$n3")" = "0" ]; then ok "$n3 não recebeu nenhum sinal"
else fail "$n3 recebeu sinal(is) indevido(s): o alvo era só o processo $n1 (cuidado com padrões de nome que casam mais de um processo)"; fi

# d1 não deve ter sido terminado nem reiniciado
if [ "$(term "$n1")" = "0" ]; then ok "$n1 não recebeu SIGTERM"; else fail "$n1 recebeu SIGTERM; ele deveria apenas recarregar a configuração"; fi
finish
