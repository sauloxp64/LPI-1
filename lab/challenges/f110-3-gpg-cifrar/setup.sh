#!/bin/bash
source /opt/lab/lib.sh
# limpa o chaveiro do aluno
su -s /bin/bash aluno -c 'gpgconf --kill gpg-agent' >/dev/null 2>&1
rm -rf /home/aluno/.gnupg
S=/var/lib/lab-state/gpg-colega-f110
mkdir -p /var/lib/lab-state
GNUPGHOME=$S gpgconf --kill gpg-agent >/dev/null 2>&1
rm -rf "$S"; mkdir -m 700 "$S"
export GNUPGHOME=$S
uid="$P_colega <$P_colega@parceiro.example>"
gpg --batch --passphrase '' --quick-gen-key "$uid" ed25519 cert,sign never >/dev/null 2>&1
fpr=$(gpg --list-keys --with-colons | awk -F: '/^fpr/ {print $10; exit}')
gpg --batch --passphrase '' --quick-add-key "$fpr" cv25519 encr never >/dev/null 2>&1
d=$(fresh_dir gpg)
gpg --batch --yes --armor --export "$P_colega@parceiro.example" > "$d/colega.pub.asc"
# ata com conteúdo único
{
  echo "ATA DA REUNIAO $P_tok"
  echo "Pauta: $(shuf -n1 -e orcamento contratos prazos auditoria)"
  echo "Responsavel: $(shuf -n1 -e Silvana Ricardo Paula Mauro)"
} > "$d/ata.txt"
cp "$d/ata.txt" "$S/ata.original"
# relatório assinado pela colega (e adulterado depois, em metade dos casos)
{
  echo "RELATORIO $P_tok"
  echo "Total apurado: $((RANDOM % 9000 + 1000)) unidades"
} > "$d/relatorio.txt"
gpg --batch --yes --pinentry-mode loopback --passphrase '' -u "$P_colega@parceiro.example" --armor --detach-sign -o "$d/relatorio.txt.sig" "$d/relatorio.txt" >/dev/null 2>&1
if [ "$P_adulterado" = "sim" ]; then echo "Observacao: valores revisados depois da assinatura" >> "$d/relatorio.txt"; fi
# segredo cifrado com senha
echo "segredo-$P_tok" | gpg --batch --yes --pinentry-mode loopback --passphrase "$P_senha" --symmetric --cipher-algo AES256 -o "$d/segredo.txt.gpg" >/dev/null 2>&1
gpgconf --kill gpg-agent >/dev/null 2>&1
chown -R aluno:aluno "$d"
chmod 644 "$d"/*
echo "cenário pronto em $d"
