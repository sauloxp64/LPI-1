#!/bin/bash
source /opt/lab/lib.sh
for u in otavio paula rafael sofia tiago vera; do drop_user "$u"; done
chmod o+x /home/aluno "$LAB_DIR" 2>/dev/null
useradd -M -s /bin/bash "$P_a"
useradd -M -s /bin/bash "$P_b"
d=$(fresh_dir caixa)
mkdir "$d/$P_nome"
chown aluno:aluno "$d/$P_nome"
chmod 0777 "$d/$P_nome"
echo "cenário pronto em $d/$P_nome"
