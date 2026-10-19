#!/bin/bash
source /opt/lab/lib.sh
members() { getent group "$1" | cut -d: -f4 | tr ',' '\n' | sed '/^$/d' | sort | tr '\n' ' ' | sed 's/ $//'; }
if getent group "$P_antigo" >/dev/null; then fail "o grupo $P_antigo ainda existe (deveria ter sido renomeado)"; else ok "o grupo $P_antigo não existe mais"; fi
if ! getent group "$P_grupo" >/dev/null; then fail "o grupo $P_grupo ainda não existe"; finish; exit; fi
ok "o grupo $P_grupo existe"
expect_eq "GID de $P_grupo = $P_gid" "$(getent group "$P_grupo" | cut -d: -f3)" "$P_gid"
want=$(printf '%s\n' "$P_m1" "$P_m2" "$P_m3" | sort | tr '\n' ' ' | sed 's/ $//')
expect_eq "membros de $P_grupo = $want" "$(members "$P_grupo")" "$want"
for u in "$P_m1" "$P_m2" "$P_m3" "$P_m4"; do
  if id "$u" >/dev/null 2>&1; then :; else fail "a conta $u não existe mais (não era para removê-la)"; fi
done
ingrp() { id -nG "$1" 2>/dev/null | tr ' ' '\n' | grep -qx "$2"; }
expect "$P_m2 continua no grupo $P_ex1" ingrp "$P_m2" "$P_ex1"
expect "$P_m2 continua no grupo $P_ex2" ingrp "$P_m2" "$P_ex2"
expect "$P_m4 continua no grupo $P_ex2" ingrp "$P_m4" "$P_ex2"
adm=$(getent gshadow "$P_grupo" | cut -d: -f3)
expect_eq "administrador(es) de $P_grupo no gshadow = $P_m1" "$adm" "$P_m1"
finish
