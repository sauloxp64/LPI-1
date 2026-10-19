#!/bin/bash
source /opt/lab/lib.sh
# compara sem revelar o valor esperado (o valor é a resposta do exercício)
expect_val() { if [ "$2" = "$3" ]; then ok "$1"; else fail "$1 (valor encontrado: '${2:-vazio}')"; fi; }
a=$P_alias; fq=$P_alias.$P_dominio; ip=10.20.$P_o3.$P_o4
d=$LAB_DIR/dns
norm() { tr -s ' \t' ' ' | sed -e 's/^ //' -e 's/ $//'; }
# 1) /etc/hosts
bad_ips=$(awk -v a="$a" -v f="$fq" '{sub(/#.*/, "")} NF>1 { for (i = 2; i <= NF; i++) if ($i == a || $i == f) { print $1; break } }' /etc/hosts | sort -u | tr '\n' ' ' | sed 's/ $//')
expect_val "IP(s) associados a $a e $fq em /etc/hosts" "$bad_ips" "$ip"
both=$(awk -v a="$a" -v f="$fq" -v ip="$ip" '{sub(/#.*/, "")} $1 == ip { for (i = 2; i <= NF; i++) { if ($i == a) h1 = 1; if ($i == f) h2 = 1 } } END { print (h1 && h2) ? "sim" : "nao" }' /etc/hosts)
expect_val "uma linha com $ip contém os dois nomes ($fq e $a)" "$both" "sim"
orig=/var/lib/lab-state/f109-4-hosts.orig
if [ -f "$orig" ]; then
  miss=$(grep -vxFf /etc/hosts "$orig" | grep -c .)
  if [ "$miss" -eq 0 ]; then ok "as linhas originais do /etc/hosts continuam lá"; else fail "$miss linha(s) original(is) do /etc/hosts foram apagadas ou alteradas"; fi
fi
# 2) getent
expect_val "getent hosts $a devolve $ip" "$(getent hosts "$a" | awk '{print $1}' | head -1)" "$ip"
expect_val "getent hosts $fq devolve $ip" "$(getent hosts "$fq" | awk '{print $1}' | head -1)" "$ip"
# 3) getent.txt
if [ -f "$d/getent.txt" ]; then
  expect_val "getent.txt = saída de 'getent hosts $a'" "$(norm < "$d/getent.txt" | sed '/^$/d')" "$(getent hosts "$a" | norm)"
else
  fail "o arquivo ~/lab/dns/getent.txt ainda não existe"
fi
# 4) ordem.txt
srcs=$(grep -E '^[[:space:]]*hosts[[:space:]]*:' /etc/nsswitch.conf | head -1 | sed -e 's/#.*//' -e 's/^[^:]*://' -e 's/\[[^]]*\]//g' | tr -s ' \t' '\n' | sed '/^$/d' | tr '\n' ' ' | sed 's/ $//')
if [ -f "$d/ordem.txt" ]; then
  got=$(sed -e 's/[[:space:]]*$//' -e 's/^[[:space:]]*//' -e '/^$/d' "$d/ordem.txt" | tr '\n' ' ' | sed 's/ $//')
  expect_val "ordem.txt = fontes de hosts: em /etc/nsswitch.conf, em ordem" "$got" "$srcs"
else
  fail "o arquivo ~/lab/dns/ordem.txt ainda não existe"
fi
# 5) resolvem.txt
if [ -f "$d/resolvem.txt" ]; then
  got=$(sed -e 's/[[:space:]]*$//' -e 's/^[[:space:]]*//' -e '/^$/d' "$d/resolvem.txt" | tr 'A-Z' 'a-z' | sort -u | tr '\n' ' ' | sed 's/ $//')
  expect_val "resolvem.txt = comandos que usam o resolvedor do sistema" "$got" "getent ping"
else
  fail "o arquivo ~/lab/dns/resolvem.txt ainda não existe"
fi
finish
