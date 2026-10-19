#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-5-matar-teimosos
d="$LAB_DIR/f103-5-matar-teimosos"
vivo() {   # vivo <pid> <nome>
  [ -r "/proc/$1/comm" ] || return 1
  [ "$(cat "/proc/$1/comm" 2>/dev/null)" = "$2" ] || return 1
  [ "$(awk '/^State:/{print $2}' "/proc/$1/status" 2>/dev/null)" != "Z" ]
}
pids_svc=$(for r in svc1 svc2 svc3; do cat "$ST/pid.$r"; done | sort -n)

# ---- pids.txt ----
f="$d/pids.txt"
if [ ! -f "$f" ]; then fail "o arquivo pids.txt não existe em ~/lab/f103-5-matar-teimosos"
else
  linhas=$(sed -E 's/[[:space:]]+$//; s/^[[:space:]]+//' "$f" | grep -v '^$')
  if echo "$linhas" | grep -vqE '^[0-9]+$'; then
    fail "pids.txt deve ter só números de PID, um por linha (sem cabeçalhos nem outras colunas)"
  else
    obt=$(echo "$linhas" | sort -n | uniq)
    if [ "$obt" = "$pids_svc" ]; then ok "pids.txt lista exatamente os 3 PIDs de $P_nome que pertencem a $P_svc"
    else
      n=$(echo "$obt" | grep -c '[0-9]')
      fail "pids.txt não confere: deve ter os PIDs dos processos $P_nome do usuário $P_svc (encontrei $n PID(s) que não batem com o esperado)"
    fi
  fi
fi

# ---- processos de svc encerrados ----
vivos=0
for r in svc1 svc2 svc3; do vivo "$(cat "$ST/pid.$r")" "$P_nome" && vivos=$((vivos + 1)); done
if [ "$vivos" -eq 0 ]; then ok "todos os processos $P_nome de $P_svc foram encerrados"
else fail "ainda há $vivos processo(s) $P_nome de $P_svc em execução (algum pode estar ignorando o pedido educado)"; fi

# ---- os demais precisam continuar ----
if vivo "$(cat "$ST/pid.aluno")" "$P_nome"; then ok "o processo $P_nome do usuário aluno continua em execução"
else fail "o processo $P_nome do usuário aluno foi encerrado, mas não era para ser (restrinja a seleção ao usuário $P_svc)"; fi
if vivo "$(cat "$ST/pid.guarda")" "$P_nome-ctl"; then ok "o processo $P_nome-ctl continua em execução"
else fail "o processo $P_nome-ctl foi encerrado, mas não era para ser (cuidado com padrões de nome que casam mais de um processo)"; fi
finish
