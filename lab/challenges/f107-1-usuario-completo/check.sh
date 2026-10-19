#!/bin/bash
source /opt/lab/lib.sh
u=$P_usuario
if ! getent passwd "$u" >/dev/null; then fail "o usuário $u ainda não existe"; finish; exit; fi
ok "o usuário $u existe"
IFS=: read -r _ _ uid gid gecos home shell < <(getent passwd "$u")
expect_eq "UID = $P_uid" "$uid" "$P_uid"
gpid=$(getent group "$P_gp" | cut -d: -f3)
expect_eq "grupo primário = $P_gp" "$gid" "$gpid"
expect_eq "shell = $P_shell" "$shell" "$P_shell"
expect_eq "diretório pessoal = $P_base/$u" "$home" "$P_base/$u"
expect_eq "comentário (GECOS) = $P_comentario" "${gecos%%,*}" "$P_comentario"
# grupos suplementares: exatamente o P_ge
supl=$(id -nG "$u" 2>/dev/null | tr ' ' '\n' | grep -vx "$P_gp" | sort | tr '\n' ' ' | sed 's/ $//')
expect_eq "único grupo suplementar = $P_ge" "$supl" "$P_ge"
# home criado, do usuário, com skel
if [ -d "$P_base/$u" ]; then
  expect_eq "dono do diretório pessoal = $u" "$(stat -c %U "$P_base/$u")" "$u"
  if [ -f "$P_base/$u/.bashrc" ] && [ -f "$P_base/$u/.profile" ]; then ok "o diretório pessoal foi populado com o /etc/skel"; else fail "o diretório pessoal não contém os arquivos do /etc/skel (faltou -m?)"; fi
else
  fail "o diretório $P_base/$u não existe (faltou criar o home?)"
fi
# shadow: campos 5 (max), 6 (warn), 8 (expire)
sh=$(getent shadow "$u")
IFS=: read -r _ _ _ _ max warn _ expire _ <<<"$sh"
expect_eq "validade máxima da senha = $P_maxdias dias" "$max" "$P_maxdias"
expect_eq "aviso = $P_aviso dias" "$warn" "$P_aviso"
got=""; [ -n "$expire" ] && got=$(date -u -d "@$((expire * 86400))" +%F)
expect_eq "conta expira em $P_expira" "${got:-nunca}" "$P_expira"
finish
