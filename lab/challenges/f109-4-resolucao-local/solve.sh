#!/bin/bash
source /opt/lab/lib.sh
a=$P_alias; fq=$P_alias.$P_dominio
tmp=$(mktemp)
grep -vE "^10\.77\.$P_o3\.$P_o4[[:space:]]" /etc/hosts > "$tmp"
cat "$tmp" > /etc/hosts
printf '10.20.%s.%s\t%s %s\n' "$P_o3" "$P_o4" "$fq" "$a" >> /etc/hosts
rm -f "$tmp"
d=$LAB_DIR/dns
getent hosts "$a" > "$d/getent.txt"
grep -E '^[[:space:]]*hosts[[:space:]]*:' /etc/nsswitch.conf | head -1 | sed -e 's/#.*//' -e 's/^[^:]*://' -e 's/\[[^]]*\]//g' | tr -s ' \t' '\n' | sed '/^$/d' > "$d/ordem.txt"
printf 'getent\nping\n' > "$d/resolvem.txt"
chown -R aluno:aluno "$d"
