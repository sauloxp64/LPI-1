#!/bin/bash
source /opt/lab/lib.sh
useradd -r -u "$P_uid" -M -d "/var/lib/$P_servico" -s /usr/sbin/nologin "$P_servico"
mkdir -p "/var/lib/$P_servico"
chown "$P_servico:$P_servico" "/var/lib/$P_servico"
chmod "$P_modo" "/var/lib/$P_servico"
