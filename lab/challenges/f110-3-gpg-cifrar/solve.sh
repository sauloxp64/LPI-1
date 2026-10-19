#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/gpg
if [ "$P_adulterado" = "sim" ]; then res=invalida; else res=valida; fi
su -s /bin/bash aluno -c "
export LC_ALL=C
cd $d
gpg --batch --passphrase '' --quick-gen-key '$P_pessoa <$P_pessoa@lab.example>' default default $P_expira >/dev/null 2>&1
gpg --import colega.pub.asc >/dev/null 2>&1
gpg --batch --trust-model always --recipient $P_colega@parceiro.example --output ata.txt.gpg --encrypt ata.txt
gpg --batch --pinentry-mode loopback --passphrase '$P_senha' --decrypt segredo.txt.gpg > segredo.txt 2>/dev/null
echo $res > verificacao.txt
gpgconf --kill gpg-agent
"
