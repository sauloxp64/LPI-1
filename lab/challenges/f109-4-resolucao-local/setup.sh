#!/bin/bash
source /opt/lab/lib.sh
# /etc/hosts é um arquivo montado pelo Docker: reescreve no lugar (sem rename)
tmp=$(mktemp)
grep -vE '(^|[[:space:]])(wiki|intranet|backup|painel)(\.interno\.lab|\.corp\.lab)?([[:space:]]|$)' /etc/hosts > "$tmp"
cat "$tmp" > /etc/hosts
mkdir -p /var/lib/lab-state
cp /etc/hosts /var/lib/lab-state/f109-4-hosts.orig
# entrada antiga (errada) do apelido curto
printf '10.77.%s.%s\t%s\n' "$P_o3" "$P_o4" "$P_alias" >> /etc/hosts
rm -f "$tmp"
d=$(fresh_dir dns)
echo "cenário pronto: /etc/hosts tem uma entrada antiga e errada para $P_alias"
