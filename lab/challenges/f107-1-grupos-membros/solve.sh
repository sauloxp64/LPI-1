#!/bin/bash
source /opt/lab/lib.sh
groupmod -n "$P_grupo" "$P_antigo"
groupmod -g "$P_gid" "$P_grupo"
gpasswd -d "$P_m4" "$P_grupo"
usermod -aG "$P_grupo" "$P_m1"
usermod -aG "$P_grupo" "$P_m2"
gpasswd -A "$P_m1" "$P_grupo"
