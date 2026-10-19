#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-3-dd-setores"
cd "$d"
dd if=disco.img of=trecho.bin bs=512 skip="$P_setor" count="$P_qtd" status=none
dd if=/dev/zero of=vazio.img bs=1M count="$P_mib" status=none
printf '%s' "$P_tag" | dd of=disco.img bs=1 seek="$P_offset" conv=notrunc status=none
chown aluno:aluno trecho.bin vazio.img disco.img
