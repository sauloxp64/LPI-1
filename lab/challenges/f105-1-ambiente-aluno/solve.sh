#!/bin/bash
source /opt/lab/lib.sh
cat >> /home/aluno/.bashrc <<EOT

# --- personalização do aluno ---
alias $P_apelido='ls $P_opcao'
$P_funcao() { mkdir -p "\$1" && cd "\$1"; }
EOT
cat >> /home/aluno/.profile <<EOT

# --- personalização do aluno ---
PATH="\$PATH:$LAB_DIR/ambiente/bin"
export PATH
export $P_variavel=$P_valor
EOT
chown aluno:aluno /home/aluno/.bashrc /home/aluno/.profile
