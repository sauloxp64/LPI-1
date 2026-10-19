#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-2-integridade-hash"
cd "$d/entrega"
"${P_alg}sum" -c --quiet "lista.$P_alg" 2>/dev/null | sed 's/: .*$//' > "$d/falhas.txt"
chown aluno:aluno "$d/falhas.txt"
