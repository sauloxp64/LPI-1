#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-3-dd-setores
d="$LAB_DIR/f103-3-dd-setores"
tam() { stat -c %s "$1" 2>/dev/null; }

# 1) trecho.bin
if [ ! -f "$d/trecho.bin" ]; then fail "o arquivo trecho.bin não existe em ~/lab/f103-3-dd-setores"
else
  esp=$((P_qtd * 512))
  if [ "$(tam "$d/trecho.bin")" != "$esp" ]; then fail "trecho.bin deve ter $P_qtd setores de 512 bytes ($esp bytes); tem $(tam "$d/trecho.bin") bytes"
  elif cmp -s "$d/trecho.bin" "$ST/trecho.esperado"; then ok "trecho.bin = $P_qtd setores a partir do setor $P_setor de disco.img"
  else fail "trecho.bin tem o tamanho certo, mas o conteúdo não é o dos setores pedidos (lembre que o primeiro setor é o 0)"; fi
fi

# 2) vazio.img
if [ ! -f "$d/vazio.img" ]; then fail "o arquivo vazio.img não existe em ~/lab/f103-3-dd-setores"
else
  esp=$((P_mib * 1048576))
  if [ "$(tam "$d/vazio.img")" != "$esp" ]; then fail "vazio.img deve ter exatamente $P_mib MiB ($esp bytes); tem $(tam "$d/vazio.img") bytes"
  elif cmp -s -n "$esp" "$d/vazio.img" /dev/zero; then ok "vazio.img tem $P_mib MiB preenchidos com zeros"
  else fail "vazio.img tem o tamanho certo, mas não é só zeros"; fi
fi

# 3) disco.img com a marca gravada no deslocamento
if [ ! -f "$d/disco.img" ]; then fail "disco.img desapareceu"
else
  if [ "$(tam "$d/disco.img")" != "131072" ]; then
    fail "disco.img agora tem $(tam "$d/disco.img") bytes; deveria continuar com 131072 (a gravação não pode truncar nem estender a imagem)"
  else
    marca=$(dd if="$d/disco.img" bs=1 skip="$P_offset" count=${#P_tag} status=none | tr -cd '[:alnum:]')
    if [ "$marca" != "$P_tag" ]; then fail "no byte $P_offset de disco.img não está a marca $P_tag (confira o deslocamento: a contagem de bytes começa em 0)"
    elif cmp -s "$d/disco.img" "$ST/disco.esperado"; then ok "disco.img recebeu '$P_tag' no byte $P_offset e o resto da imagem ficou intacto"
    else fail "a marca está no lugar certo, mas o restante de disco.img foi alterado"; fi
  fi
fi
finish
