#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-4-redir-tee
d="$LAB_DIR/f103-4-redir-tee"

if sha256sum -c --status "$ST/shas" 2>/dev/null; then ok "coleta.sh e servidores.txt não foram alterados"
else fail "coleta.sh ou servidores.txt foram modificados (reinicie o desafio; a ideia é só redirecionar a saída)"; fi

# ---- parte 1: saída normal e erros em arquivos separados ----
if [ ! -f "$d/saida.txt" ]; then fail "o arquivo saida.txt não existe em ~/lab/f103-4-redir-tee"
elif cmp -s "$d/saida.txt" "$ST/saida"; then ok "saida.txt tem só a saída padrão do script"
else
  if grep -q '^ERRO:' "$d/saida.txt"; then fail "saida.txt contém mensagens de ERRO: elas saem pelo erro padrão e devem ir só para erros.txt"
  else fail "saida.txt não confere com a saída padrão do script (rode ./coleta.sh e redirecione apenas o fluxo 1)"; fi
fi
if [ ! -f "$d/erros.txt" ]; then fail "o arquivo erros.txt não existe em ~/lab/f103-4-redir-tee"
elif cmp -s "$d/erros.txt" "$ST/erros"; then ok "erros.txt tem só o erro padrão do script"
else
  if grep -q '^OK:' "$d/erros.txt"; then fail "erros.txt contém linhas OK: apenas o erro padrão deve ir para ele"
  else fail "erros.txt não confere com o erro padrão do script (rode ./coleta.sh e redirecione apenas o fluxo 2)"; fi
fi

# ---- parte 2: acrescentar a saída combinada ao histórico ----
h="$d/historico.txt"
if [ ! -f "$h" ]; then fail "historico.txt desapareceu"; finish; exit; fi
norig=$(wc -l < "$ST/historico.orig" | tr -d ' ')
if ! head -n "$norig" "$h" | cmp -s - "$ST/historico.orig"; then
  fail "as $norig linhas originais de historico.txt foram perdidas ou alteradas (acrescente ao arquivo, não o sobrescreva)"
  finish; exit
fi
ok "as linhas anteriores de historico.txt continuam no topo"
resto=$(tail -n +"$((norig + 1))" "$h")
esp=$(cat "$ST/ambos")
if [ -z "$resto" ]; then fail "nada foi acrescentado a historico.txt depois das linhas originais"
else
  achou=0; blk=""
  for k in 1 2 3 4; do
    blk="${blk:+$blk
}$esp"
    [ "$resto" = "$blk" ] && { achou=$k; break; }
  done
  if [ "$achou" -ge 1 ]; then ok "historico.txt recebeu a saída combinada (padrão + erro, na ordem em que aconteceram)"
  else
    if ! echo "$resto" | grep -q '^ERRO:'; then fail "o que foi acrescentado ao histórico não tem as mensagens de ERRO: inclua também o erro padrão"
    else fail "o que foi acrescentado ao histórico não confere: saída normal e erros devem aparecer juntos, na ordem em que o script os produz"; fi
  fi
fi
finish
