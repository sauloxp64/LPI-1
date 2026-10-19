#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/bibliotecas
case $P_programa in
  bzip2) novo="libbz$P_letra.so.1.0" ;;
  xz)    novo="liblzm$P_letra.so.5" ;;
esac
echo "$novo" > "$d/faltando.txt"
echo "$d/$P_pasta" > /etc/ld.so.conf.d/lab-bibliotecas.conf
ldconfig
