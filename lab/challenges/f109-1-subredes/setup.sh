#!/bin/bash
source /opt/lab/lib.sh
d=$(fresh_dir subredes)
cat > "$d/resposta.txt" <<X
rede=
mascara=
broadcast=
primeiro=
ultimo=
hosts=
privado=
X
chown aluno:aluno "$d/resposta.txt"
echo "cenário pronto em $d (modelo resposta.txt)"
