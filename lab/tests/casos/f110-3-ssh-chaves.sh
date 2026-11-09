# E-04: só contam as linhas ATIVAS do authorized_keys; a chave antiga é a registrada pelo setup em estado privado.
ID=f110-3-ssh-chaves
P=(modelo=ed25519 arquivo=id_deploy comentario=deploy@ci-lab)
AK=/home/aluno/.ssh/authorized_keys
S=/home/aluno/.ssh
lab_setup; chk FAIL "estado inicial (cenário não nasce resolvido)"
lab_solve; chk PASS "solução (solve.sh)"
cp $AK /tmp/ak.good
sed -i 's/^/# /' $AK; chk FAIL "ADVERSARIAL: todas as linhas do authorized_keys comentadas"
{ sed -n 1p /tmp/ak.good; sed -n 2p /tmp/ak.good | sed 's/^/# /'; } > $AK; chk FAIL "chave nova comentada, antiga ativa"
{ sed -n 1p /tmp/ak.good | sed 's/^/# /'; sed -n 2p /tmp/ak.good; } > $AK; chk FAIL "chave antiga comentada, nova ativa"
# trocar id_velha.pub e a entrada antiga por outra chave
lab_setup; lab_solve
ssh-keygen -q -t ed25519 -N "" -C "outra@x" -f /tmp/outra >/dev/null
cp /tmp/outra.pub $S/id_velha.pub
{ cat /tmp/outra.pub; sed -n 2p $AK; } > /tmp/ak.swapped; cp /tmp/ak.swapped $AK; chown aluno:aluno $AK; chmod 600 $AK
chk FAIL "ADVERSARIAL: id_velha.pub e a entrada antiga trocadas por outra chave"
rm -f /tmp/outra /tmp/outra.pub
# entradas ativas com opções, comentários e linhas em branco continuam valendo
lab_setup; lab_solve
cp $AK /tmp/ak.good; OLD=$(sed -n 1p /tmp/ak.good); NEW=$(sed -n 2p /tmp/ak.good)
{ echo "# chaves do servidor"; echo; echo "from=\"10.0.0.1,*.example.com\",no-pty $OLD"; echo "command=\"/bin/echo a b\",no-agent-forwarding $NEW"; } > $AK
chk PASS "opções (com aspas e espaços) antes das chaves + comentário + linha em branco"
{ echo "   # recuado"; echo "  $OLD  "; printf '\t%s\n' "$NEW"; } > $AK; chk PASS "espaços e tab ao redor das linhas"
{ echo "$NEW"; echo "$OLD"; } > $AK; chk PASS "ordem invertida"
{ echo "$OLD"; echo "# $NEW"; echo "$NEW"; } > $AK; chk PASS "cópia comentada da chave nova + linha ativa (conta uma só)"
{ echo "$OLD"; echo "$NEW"; echo "$NEW"; } > $AK; chk FAIL "chave nova duplicada"
{ echo "$NEW"; } > $AK; chk FAIL "chave antiga apagada"
# todos os tipos de chave sorteáveis
for m in rsa-3072 ecdsa-384 ecdsa-521 rsa-4096; do
  P=(modelo=$m arquivo=id_lab comentario=aluno@estacao-lab)
  lab_setup; lab_solve; chk PASS "solução com $m"
done
