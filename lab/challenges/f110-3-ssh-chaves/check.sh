#!/bin/bash
source /opt/lab/lib.sh
h=/home/aluno
k=$h/.ssh/$P_arquivo
case "$P_modelo" in
  ed25519)   want_type=ED25519; want_bits=256;;
  rsa-3072)  want_type=RSA;     want_bits=3072;;
  rsa-4096)  want_type=RSA;     want_bits=4096;;
  ecdsa-384) want_type=ECDSA;   want_bits=384;;
  ecdsa-521) want_type=ECDSA;   want_bits=521;;
esac
if [ ! -f "$k" ] || [ ! -f "$k.pub" ]; then
  fail "faltam ~/.ssh/$P_arquivo e/ou ~/.ssh/$P_arquivo.pub"
else
  ok "o par de chaves ~/.ssh/$P_arquivo e $P_arquivo.pub existe"
  info=$(ssh-keygen -lf "$k.pub" 2>/dev/null)
  got_bits=$(echo "$info" | awk '{print $1}')
  got_type=$(echo "$info" | sed -n 's/.*(\([A-Z0-9]*\))$/\1/p')
  got_fp=$(echo "$info" | awk '{print $2}')
  got_comment=$(awk '{print $3}' "$k.pub")
  expect_eq "tipo da chave = $want_type" "$got_type" "$want_type"
  expect_eq "tamanho da chave = $want_bits bits" "$got_bits" "$want_bits"
  expect_eq "comentário = $P_comentario" "$got_comment" "$P_comentario"
  # privada corresponde à pública e não tem passphrase
  derived=$(ssh-keygen -y -P "" -f "$k" 2>/dev/null | awk '{print $1" "$2}')
  mine=$(awk '{print $1" "$2}' "$k.pub")
  if [ -n "$derived" ] && [ "$derived" = "$mine" ]; then ok "a chave privada corresponde à pública e não tem passphrase"; else fail "a chave privada não abre sem passphrase ou não corresponde à pública"; fi
  # authorized_keys
  ak=$h/.ssh/authorized_keys
  blob=$(awk '{print $2}' "$k.pub")
  n=$(grep -c -F "$blob" "$ak" 2>/dev/null)
  expect_eq "a chave nova aparece 1 vez no authorized_keys" "$n" "1"
  oldblob=$(awk '{print $2}' "$h/.ssh/id_velha.pub" 2>/dev/null)
  if [ -n "$oldblob" ] && grep -q -F "$oldblob" "$ak" 2>/dev/null; then ok "a chave antiga continua no authorized_keys"; else fail "a chave antiga foi apagada do authorized_keys (use >> para acrescentar)"; fi
  # fingerprint
  f=$LAB_DIR/ssh/impressao-digital.txt
  if [ -f "$f" ]; then
    if grep -q -F "$got_fp" "$f"; then ok "impressao-digital.txt contém o fingerprint da chave nova"; else fail "impressao-digital.txt não contém o fingerprint SHA256 da chave nova"; fi
  else
    fail "o arquivo ~/lab/ssh/impressao-digital.txt ainda não existe"
  fi
fi
# permissões e donos
expect_eq "modo de ~/.ssh = 700" "$(stat -c %a "$h/.ssh")" "700"
[ -f "$k" ] && expect_eq "modo de ~/.ssh/$P_arquivo = 600" "$(stat -c %a "$k")" "600"
[ -f "$h/.ssh/id_velha" ] && expect_eq "modo de ~/.ssh/id_velha = 600" "$(stat -c %a "$h/.ssh/id_velha")" "600"
if [ -f "$h/.ssh/authorized_keys" ]; then
  m=$(stat -c %a "$h/.ssh/authorized_keys")
  if [ $(( 8#$m & 8#022 )) -eq 0 ]; then ok "authorized_keys não é gravável por grupo/outros (modo $m)"; else fail "authorized_keys é gravável por grupo/outros (modo $m)"; fi
else
  fail "authorized_keys não existe"
fi
bad=$(find "$h/.ssh" ! -user aluno 2>/dev/null | wc -l)
expect_eq "tudo em ~/.ssh pertence ao aluno" "$bad" "0"
finish
