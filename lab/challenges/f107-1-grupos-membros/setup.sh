#!/bin/bash
source /opt/lab/lib.sh
for u in "$P_m1" "$P_m2" "$P_m3" "$P_m4"; do drop_user "$u"; done
for g in "$P_grupo" "$P_antigo" "$P_ex1" "$P_ex2"; do drop_group "$g"; done
other=$(getent group "$P_gid" | cut -d: -f1); [ -n "$other" ] && drop_group "$other"
groupadd "$P_ex1"; groupadd "$P_ex2"
groupadd -g $((P_gid + 1000)) "$P_antigo"
for u in "$P_m1" "$P_m2" "$P_m3" "$P_m4"; do useradd -M -s /usr/sbin/nologin "$u"; done
usermod -aG "$P_ex1,$P_ex2" "$P_m2"
usermod -aG "$P_antigo" "$P_m3"
usermod -aG "$P_antigo,$P_ex2" "$P_m4"
echo "cenário pronto: grupo $P_antigo com membros $P_m3 e $P_m4"
