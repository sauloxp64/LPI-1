#!/bin/bash
source /opt/lab/lib.sh
h=/home/aluno
rm -rf "$h/.ssh"
mkdir -p "$h/.ssh"
# chave antiga (precisa ser mantida no authorized_keys) e uma chave privada velha com permissão aberta
ssh-keygen -q -t ed25519 -N "" -C "chave-antiga@legado" -f "$h/.ssh/id_velha" >/dev/null
cp "$h/.ssh/id_velha.pub" "$h/.ssh/authorized_keys"
chown -R aluno:aluno "$h/.ssh"
chmod 777 "$h/.ssh"
chmod 666 "$h/.ssh/authorized_keys"
chmod 644 "$h/.ssh/id_velha"
d=$(fresh_dir ssh)
echo "cenário pronto: ~/.ssh com permissões abertas e uma chave antiga no authorized_keys"
