#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-8-vim-editar
d="$LAB_DIR/f103-8-vim-editar"
f="$d/app.conf"
if [ ! -f "$f" ]; then fail "o arquivo app.conf não existe em ~/lab/f103-8-vim-editar"; finish; exit; fi
trim() { sed -E 's/[[:space:]]+$//' "$1" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'; }

# 1) troca global do host
if grep -qF -- "$P_host_antigo" "$f"; then fail "ainda há ocorrências de $P_host_antigo no arquivo (são mais de uma: troque todas)"
else
  n=$(grep -cF -- "$P_host_novo" "$f")
  exp=$(grep -cF -- "$P_host_novo" "$ST/esperado")
  if [ "$n" = "$exp" ]; then ok "todas as $exp ocorrências de $P_host_antigo viraram $P_host_novo"
  else fail "$P_host_novo aparece em $n linha(s); o esperado são $exp (as ocorrências de $P_host_antigo devem ser trocadas, não apagadas)"; fi
fi
# 2) valor do ambiente
if [ "$(grep -c '^ambiente = ' "$f")" = 1 ] && grep -qx "ambiente = $P_amb_novo" "$f"; then ok "ambiente = $P_amb_novo"
else fail "a linha do ambiente deve ficar exatamente como: ambiente = $P_amb_novo (uma única vez)"; fi
# 3) linhas removidas
if grep -qE '^debug = ' "$f"; then fail "a linha 'debug = true' ainda existe"; else ok "linha 'debug = true' removida"; fi
if grep -qE 'TODO|^legado = ' "$f"; then fail "o par de linhas do bloco legado ('# TODO ...' e 'legado = ativo') ainda não foi removido por inteiro"; else ok "bloco legado removido (comentário TODO e linha legado)"; fi
# 4) linha inserida depois de [cache]
prox=$(grep -A1 -Fx '[cache]' "$f" | sed -n 2p | sed -E 's/[[:space:]]+$//')
if [ "$prox" = "ttl = $P_ttl" ]; then ok "ttl = $P_ttl está logo depois de [cache]"
else fail "a linha 'ttl = $P_ttl' deve estar imediatamente abaixo de [cache]"; fi
# 5) última linha
ultima=$(trim "$f" | tail -1)
if [ "$ultima" = "# revisado por $P_revisor" ]; then ok "última linha: # revisado por $P_revisor"
else fail "a última linha do arquivo deve ser: # revisado por $P_revisor"; fi
# 6) nada mais mudou
if [ "$(trim "$f")" = "$(trim "$ST/esperado")" ]; then ok "o restante do arquivo ficou como estava"
else fail "o arquivo final não é exatamente o esperado: confira se algo além do pedido foi alterado (ou se faltou salvar com :w)"; fi
finish
