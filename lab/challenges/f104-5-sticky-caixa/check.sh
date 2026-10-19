#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/caixa
c=$d/$P_nome
if [ ! -d "$c" ]; then fail "a pasta ~/lab/caixa/$P_nome não existe"; finish; exit; fi
case $P_outros in rwx) o=7 ;; wx) o=3 ;; esac
esperado="1$(printf '7%s%s' "$o" "$o")"
expect_eq "dono da pasta continua sendo aluno" "$(stat -c %U "$c")" "aluno"
modo=$(stat -c %a "$c")
if [ "$modo" = "$esperado" ]; then ok "permissões da pasta corretas: dono rwx, grupo e outros $P_outros, com sticky bit"
else fail "as permissões da pasta (modo $modo) não correspondem ao pedido: dono rwx, grupo e outros $P_outros, com sticky bit"; fi

# comportamento real
chmod o+x /home/aluno "$LAB_DIR" 2>/dev/null
rm -f "$c"/.chk-*
if su -s /bin/bash "$P_a" -c "echo carta > '$c/.chk-de-$P_a'" 2>/dev/null; then ok "$P_a consegue depositar um arquivo na caixa"; else fail "$P_a não consegue depositar um arquivo na caixa"; fi
su -s /bin/bash "$P_b" -c "rm -f '$c/.chk-de-$P_a'" 2>/dev/null
if [ -e "$c/.chk-de-$P_a" ]; then ok "$P_b NÃO consegue apagar o arquivo de $P_a (sticky bit funcionando)"; else fail "$P_b conseguiu apagar o arquivo de $P_a: falta o sticky bit"; fi
su -s /bin/bash "$P_b" -c "mv '$c/.chk-de-$P_a' '$c/.chk-roubado' 2>/dev/null"
if [ -e "$c/.chk-de-$P_a" ]; then ok "$P_b também não consegue renomear o arquivo de $P_a"; else fail "$P_b conseguiu renomear o arquivo de $P_a"; fi
if su -s /bin/bash "$P_b" -c "echo outra > '$c/.chk-de-$P_b' && rm -f '$c/.chk-de-$P_b' && [ ! -e '$c/.chk-de-$P_b' ]" 2>/dev/null; then ok "$P_b consegue criar e apagar o PRÓPRIO arquivo"; else fail "$P_b não consegue criar e apagar o próprio arquivo na caixa"; fi
if su -s /bin/bash "$P_a" -c "rm -f '$c/.chk-de-$P_a'" 2>/dev/null && [ ! -e "$c/.chk-de-$P_a" ]; then ok "$P_a (dono do arquivo) consegue apagá-lo"; else fail "$P_a não conseguiu apagar o próprio arquivo"; fi
if [ "$P_outros" = wx ]; then
  if su -s /bin/bash "$P_b" -c "ls '$c'" >/dev/null 2>&1; then fail "$P_b consegue listar a caixa, mas ela deveria ser só de depósito (sem leitura para outros)"; else ok "$P_b não consegue listar o conteúdo da caixa (só depositar)"; fi
fi
rm -f "$c"/.chk-*

# representação simbólica
if [ -f "$d/simbolico.txt" ]; then
  expect_eq "simbolico.txt traz as permissões como o ls -ld mostra" "$(awk 'NR == 1 { print $1 }' "$d/simbolico.txt")" "$(stat -c %A "$c")"
else fail "o arquivo ~/lab/caixa/simbolico.txt não existe"; fi
finish
