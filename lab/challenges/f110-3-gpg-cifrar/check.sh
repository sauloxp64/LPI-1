#!/bin/bash
source /opt/lab/lib.sh
S=/var/lib/lab-state/gpg-colega-f110
d=$LAB_DIR/gpg
uid="$P_pessoa <$P_pessoa@lab.example>"
asal() { su -s /bin/bash aluno -c "export LC_ALL=C; $*" 2>/dev/null; }
# 1) chave do aluno
colons=$(asal "gpg --list-keys --with-colons")
keyid=$(printf '%s\n' "$colons" | UID_WANT="$uid" python3 -c '
import sys, os
uid = os.environ["UID_WANT"]
cur = None
for line in sys.stdin:
    f = line.rstrip("\n").split(":")
    if f[0] == "pub":
        cur = f
    elif f[0] == "uid" and cur is not None and f[9] == uid:
        print(cur[4], cur[5], cur[6]); break
')
if [ -z "$keyid" ]; then
  fail "o chaveiro do aluno não tem uma chave com a identidade '$uid'"
else
  ok "existe a chave com a identidade '$uid'"
  read -r kid created expires <<<"$keyid"
  if asal "gpg --list-secret-keys --with-colons" | grep -q "^sec:.*:$kid:"; then ok "a chave secreta correspondente existe"; else fail "não há chave secreta para a chave $kid"; fi
  if [ -n "$expires" ]; then
    days=$(( (expires - created) / 86400 ))
    case "$P_expira" in 6m) lo=170; hi=195;; 1y) lo=360; hi=370;; 2y) lo=725; hi=735;; esac
    if [ "$days" -ge "$lo" ] && [ "$days" -le "$hi" ]; then ok "a validade da chave corresponde a $P_expira"; else fail "a validade da chave não corresponde a $P_expira"; fi
  else
    fail "a chave não tem data de validade (esperado: $P_expira)"
  fi
  if echo teste | asal "gpg --batch --pinentry-mode error -u $kid --clearsign" >/dev/null 2>&1; then ok "a chave não exige passphrase (geração sem interação)"; else fail "a chave exige passphrase ou não pôde assinar em lote"; fi
fi
# 2) arquivo cifrado para a colega
enc=""
for c in "$d/ata.txt.gpg" "$d/ata.txt.asc" "$d/ata.txt.pgp"; do [ -s "$c" ] && enc=$c && break; done
if [ -z "$enc" ]; then
  fail "não encontrei ata.txt.gpg nem ata.txt.asc em ~/lab/gpg"
else
  dec=$(GNUPGHOME=$S gpg --batch --pinentry-mode loopback --passphrase '' --decrypt "$enc" 2>/dev/null)
  if [ -n "$dec" ] && [ "$dec" = "$(cat "$S/ata.original")" ]; then ok "a colega consegue decifrar $(basename "$enc") e o conteúdo é o da ata original"; else fail "$(basename "$enc") não é decifrável pela colega com o conteúdo original da ata"; fi
  subkid=$(GNUPGHOME=$S gpg --list-keys --with-colons 2>/dev/null | awk -F: '$1=="sub" {print $5; exit}')
  recips=$(GNUPGHOME=$S gpg --list-packets "$enc" 2>/dev/null | sed -n 's/^:pubkey enc packet:.*keyid \([0-9A-F]*\).*/\1/p' | sort -u)
  nrec=$(printf '%s\n' "$recips" | grep -c .)
  if [ "$nrec" -eq 1 ] && [ "$recips" = "$subkid" ]; then ok "o arquivo foi cifrado somente para a colega"; else fail "o arquivo deve ser cifrado somente para a colega (destinatários encontrados: $nrec)"; fi
fi
GNUPGHOME=$S gpgconf --kill gpg-agent >/dev/null 2>&1
# 3) verificação
v=$d/verificacao.txt
if [ -f "$v" ]; then
  [ "$P_adulterado" = "sim" ] && want=invalida || want=valida
  got=$(tr 'A-Z' 'a-z' < "$v" | sed -e 's/á/a/g' -e 's/í/i/g' | tr -d '[:space:]')
  if [ "$got" = "$want" ]; then ok "verificacao.txt informa o resultado correto da verificação"; else fail "verificacao.txt não informa o resultado correto da verificação (valor encontrado: '${got:-vazio}')"; fi
else
  fail "o arquivo ~/lab/gpg/verificacao.txt ainda não existe"
fi
# 4) segredo
s=$d/segredo.txt
if [ -f "$s" ]; then
  if [ "$(sed -e 's/[[:space:]]*$//' "$s" | sed '/^$/d')" = "segredo-$P_tok" ]; then ok "segredo.txt contém o texto decifrado"; else fail "segredo.txt não contém o texto decifrado de segredo.txt.gpg"; fi
else
  fail "o arquivo ~/lab/gpg/segredo.txt ainda não existe"
fi
asal "gpgconf --kill gpg-agent" >/dev/null 2>&1
finish
