#!/bin/bash
source /opt/lab/lib.sh
d=$(fresh_dir sistemas-arquivos)
# imagens "virgens" (arquivos esparsos de zeros) que fazem o papel de partições vazias
truncate -s 64M  "$d/$P_ext.img"
truncate -s 300M "$d/$P_xfs.img"
truncate -s 64M  "$d/$P_fat.img"
truncate -s 32M  "$d/$P_swap.img"
chown aluno:aluno "$d"/*.img
echo "cenário pronto em $d"
