#!/bin/bash
source /opt/lab/lib.sh
# limpeza de execuções anteriores (usuários/grupos sorteados deste desafio)
for u in heitor iara jonas kaua lara mateus nara; do drop_user "$u"; done
for g in equipe-alfa equipe-beta equipe-gama equipe-delta; do drop_group "$g"; done
chmod o+x /home/aluno "$LAB_DIR" 2>/dev/null
groupadd "$P_grupo"
useradd -M -s /bin/bash -G "$P_grupo" "$P_u1"
useradd -M -s /bin/bash -G "$P_grupo" "$P_u2"
useradd -M -s /bin/bash "$P_u3"
d=$(fresh_dir projetos)
p=$d/$P_proj
mkdir -p "$p/docs/anexos"
for f in plano.txt docs/notas.txt docs/ata.txt docs/anexos/dados.csv; do
  for i in $(seq $(( RANDOM % 4 + 2 ))); do echo "linha $i do projeto $P_proj ($RANDOM)"; done > "$p/$f"
done
chown -R aluno:aluno "$d"
find "$p" -type d -exec chmod 755 {} +
find "$p" -type f -exec chmod 644 {} +
echo "cenário pronto em $p"
