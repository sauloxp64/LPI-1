#!/bin/bash
source /opt/lab/lib.sh
d=$(fresh_dir scripts)
# material de teste manual para o estudante
mkdir -p "$d/amostra/pasta"
printf 'primeira\nsegunda\nterceira\n' > "$d/amostra/a.txt"
printf 'um\ndois\n' > "$d/amostra/b.txt"
: > "$d/amostra/vazio.txt"
chown -R aluno:aluno "$d"
echo "cenário pronto em $d"
