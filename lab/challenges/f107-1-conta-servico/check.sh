#!/bin/bash
source /opt/lab/lib.sh
u=$P_servico
if ! getent passwd "$u" >/dev/null; then fail "a conta $u ainda não existe"; finish; exit; fi
ok "a conta $u existe"
IFS=: read -r _ _ uid gid _ home shell < <(getent passwd "$u")
expect_eq "UID = $P_uid" "$uid" "$P_uid"
if [ "$uid" -lt 1000 ] && [ "$uid" -ge 100 ]; then ok "UID na faixa de contas de sistema (100-999)"; else fail "UID fora da faixa de sistema (100-999): $uid"; fi
gname=$(getent group "$gid" | cut -d: -f1)
expect_eq "grupo primário se chama $u" "$gname" "$u"
if [ "$gid" -lt 1000 ] && [ "$gid" -ge 100 ]; then ok "o grupo primário é um grupo de sistema (GID $gid)"; else fail "o grupo primário não é de sistema (GID $gid): use a opção de conta de sistema"; fi
case "$shell" in
  /usr/sbin/nologin|/sbin/nologin|/bin/false|/usr/bin/false) ok "shell sem login ($shell)";;
  *) fail "o shell $shell ainda permite login interativo";;
esac
expect_eq "diretório pessoal = /var/lib/$u" "$home" "/var/lib/$u"
d=/var/lib/$u
if [ -d "$d" ]; then
  ok "o diretório $d existe"
  expect_eq "dono:grupo de $d = $u:$u" "$(stat -c %U:%G "$d")" "$u:$u"
  m=$(stat -c %a "$d"); want=$P_modo
  expect_eq "modo de $d = $P_modo" "$m" "$want"
  n=$(find "$d" -mindepth 1 | wc -l)
  if [ "$n" -eq 0 ]; then ok "o diretório do serviço não recebeu o conteúdo do skel"; else fail "o diretório do serviço contém $n arquivo(s) copiados (do /etc/skel): a conta de serviço não deve ter isso"; fi
else
  fail "o diretório $d não existe"
fi
pw=$(getent shadow "$u" | cut -d: -f2)
case "$pw" in
  '!'*|'*'*) ok "senha bloqueada/inexistente no shadow";;
  *) fail "a conta tem uma senha utilizável no shadow";;
esac
finish
