#!/bin/bash
source /opt/lab/lib.sh
su -s /bin/bash aluno -c "echo '$LAB_DIR/atjob/$P_script' | at $P_hora:$P_minuto tomorrow" >/dev/null 2>&1
for j in $(atq | awk '{print $1}'); do
  if at -c "$j" | grep -q "obsoleto-$P_tag.sh"; then atrm "$j"; fi
done
