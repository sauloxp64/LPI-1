#!/bin/bash
source /opt/lab/lib.sh
h=/home/aluno
rm -rf "$h/.ssh"
mkdir -p "$h/.ssh"
# chave antiga (precisa ser mantida no authorized_keys) e uma chave privada velha com permissão aberta
ssh-keygen -q -t ed25519 -N "" -C "chave-antiga@legado" -f "$h/.ssh/id_velha" >/dev/null
cp "$h/.ssh/id_velha.pub" "$h/.ssh/authorized_keys"
# identidade original da chave antiga (tipo + blob) em estado privado, fora do alcance de edição do aluno:
# o check compara com isto, não com id_velha.pub (que o aluno pode alterar)
ST=/root/.lab-state/f110-3-ssh-chaves
rm -rf "$ST"; mkdir -p "$ST"; chmod 700 /root/.lab-state "$ST"
awk '{print $1 " " $2}' "$h/.ssh/id_velha.pub" > "$ST/chave-antiga"
chown -R aluno:aluno "$h/.ssh"
chmod 777 "$h/.ssh"
chmod 666 "$h/.ssh/authorized_keys"
chmod 644 "$h/.ssh/id_velha"
d=$(fresh_dir ssh)
echo "cenário pronto: ~/.ssh com permissões abertas e uma chave antiga no authorized_keys"
