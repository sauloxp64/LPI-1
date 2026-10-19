#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/pacotes
pkg=$(dpkg -S "$P_arquivo" | head -1 | cut -d: -f1)
echo "$pkg" > "$d/pacote.txt"
dpkg-query -W -f='${Version}\n' "$pkg" > "$d/versao.txt"
dpkg -L "$pkg" > "$d/arquivos.txt"
