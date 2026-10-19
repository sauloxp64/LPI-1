#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-6-nice-renice
vivo() {   # vivo <pid> <nome>
  [ -r "/proc/$1/comm" ] || return 1
  [ "$(cat "/proc/$1/comm" 2>/dev/null)" = "$2" ] || return 1
  [ "$(awk '/^State:/{print $2}' "/proc/$1/status" 2>/dev/null)" != "Z" ]
}
pid=$(cat "$ST/pid")
alvo=$P_n1

# ---- processo crítico: reprioridade sem reiniciar ----
if ! vivo "$pid" "$P_nome"; then
  fail "o processo $P_nome (PID $pid) não está mais em execução: era para mudar a prioridade dele, não encerrá-lo (e o nice de um processo só pode ser aumentado, não desfeito: se errou o valor, reinicie o desafio)"
else
  ok "o processo $P_nome continua em execução (mesmo PID $pid)"
  ni=$(ps -o ni= -p "$pid" | tr -d ' ')
  if [ "$ni" = "$alvo" ]; then ok "$P_nome está com nice $alvo"
  else fail "$P_nome está com nice $ni (o pedido era nice $alvo; conferir com ps -o pid,ni,comm -p $pid)"; fi
fi

# ---- lote iniciado com nice reduzido ----
nome_lote="lote-$P_job.sh"
achou=0; certo=0
# aceita ./lote-x.sh (nome do processo = nome do script) e também bash lote-x.sh (procura na linha de comando)
for p in $(pgrep -f "lote-$P_job\.sh" 2>/dev/null); do
  [ "$p" = "$$" ] && continue
  [ -r "/proc/$p/status" ] || continue
  [ "$(awk '/^State:/{print $2}' "/proc/$p/status" 2>/dev/null)" = "Z" ] && continue
  case "$(cat "/proc/$p/comm" 2>/dev/null)" in "$nome_lote"|bash|sh|dash) ;; *) continue;; esac
  achou=1
  [ "$(ps -o ni= -p "$p" | tr -d ' ')" = "$P_n2" ] && certo=1
done
if [ "$achou" = 0 ]; then fail "não há nenhum $nome_lote em execução em segundo plano"
else
  ok "$nome_lote está em execução"
  if [ "$certo" = 1 ]; then ok "$nome_lote foi iniciado com nice $P_n2"
  else fail "$nome_lote está rodando, mas não com nice $P_n2 (confira com ps -o pid,ni,comm -C $nome_lote)"; fi
fi
finish
