#!/bin/bash
source /opt/lab/lib.sh
# remove jobs de execuções anteriores deste desafio
for j in $(atq | awk '{print $1}'); do
  if at -c "$j" 2>/dev/null | grep -q 'lab/atjob/'; then atrm "$j"; fi
done
d=$(fresh_dir atjob)
for s in "$P_script" "obsoleto-$P_tag.sh"; do
  printf '#!/bin/sh\necho "$(date +%%F-%%T) executou %s" >> %s/execucoes.log\n' "$s" "$d" > "$d/$s"
  chmod 755 "$d/$s"
done
chown -R aluno:aluno "$d"
# job antigo, para daqui a alguns dias
su -s /bin/bash aluno -c "echo '$d/obsoleto-$P_tag.sh' | at now + 3 days" >/dev/null 2>&1
# guarda a data do setup (para aceitar 'amanhã' relativo ao dia em que o desafio começou)
mkdir -p /var/lib/lab-state && date +%F > /var/lib/lab-state/f107-2-at-agendar.day
echo "cenário pronto: job antigo de obsoleto-$P_tag.sh na fila do aluno"
