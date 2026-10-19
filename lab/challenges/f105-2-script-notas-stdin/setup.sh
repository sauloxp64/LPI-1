#!/bin/bash
source /opt/lab/lib.sh
d=$(fresh_dir scripts-notas)
# arquivo de exemplo para o estudante testar à mão (o verificador usa dados próprios)
cat > "$d/exemplo.csv" <<EOT
# nome;n1;n2;n3
ana;80;70;90

bruno;40;55;60
carla;100;95;99
# desligado
diego;30;20;45
EOT
chown -R aluno:aluno "$d"
echo "cenário pronto em $d"
