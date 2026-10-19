#!/bin/bash
source /opt/lab/lib.sh
h=/home/aluno
case "$P_modelo" in
  ed25519)   args="-t ed25519";;
  rsa-3072)  args="-t rsa -b 3072";;
  rsa-4096)  args="-t rsa -b 4096";;
  ecdsa-384) args="-t ecdsa -b 384";;
  ecdsa-521) args="-t ecdsa -b 521";;
esac
su -s /bin/bash aluno -c "ssh-keygen -q $args -C '$P_comentario' -f $h/.ssh/$P_arquivo -N ''"
cat "$h/.ssh/$P_arquivo.pub" >> "$h/.ssh/authorized_keys"
chmod 700 "$h/.ssh"
chmod 600 "$h/.ssh/$P_arquivo" "$h/.ssh/id_velha" "$h/.ssh/authorized_keys"
ssh-keygen -lf "$h/.ssh/$P_arquivo.pub" | awk '{print $2}' > "$LAB_DIR/ssh/impressao-digital.txt"
chown -R aluno:aluno "$h/.ssh" "$LAB_DIR/ssh"
