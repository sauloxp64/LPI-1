#!/bin/bash
source /opt/lab/lib.sh
# remove restos: arquivos de sudoers.d que mencionam os grupos deste desafio
for g in noc-lab suporte-lab plantao-lab; do
  grep -l -F "%$g" /etc/sudoers.d/* 2>/dev/null | xargs -r rm -f
done
for u in op-lara op-igor op-sofia op-davi op-rita; do drop_user "$u"; drop_group "$u"; done
for g in noc-lab suporte-lab plantao-lab; do drop_group "$g"; done
groupadd "$P_grupo"
for u in "$P_m1" "$P_m2"; do useradd -M -s /usr/sbin/nologin -G "$P_grupo" "$u"; done
useradd -M -s /usr/sbin/nologin "$P_fora"
d=$(fresh_dir sudoers)
echo "cenário pronto: grupo $P_grupo com $P_m1 e $P_m2; $P_fora fora do grupo"
