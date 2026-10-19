#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-3-dd-setores
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-3-dd-setores)
head -c 131072 /dev/urandom > "$d/disco.img"          # 256 setores de 512 bytes
cp "$d/disco.img" "$ST/original.img"
# resultado esperado do trecho (qtd setores a partir do setor 'setor') e da imagem com a marca gravada
dd if="$ST/original.img" of="$ST/trecho.esperado" bs=512 skip="$P_setor" count="$P_qtd" status=none
cp "$ST/original.img" "$ST/disco.esperado"
printf '%s' "$P_tag" | dd of="$ST/disco.esperado" bs=1 seek="$P_offset" conv=notrunc status=none
chown -R aluno:aluno "$d"
echo "cenário pronto em $d"
