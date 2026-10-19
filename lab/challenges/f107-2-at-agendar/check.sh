#!/bin/bash
source /opt/lab/lib.sh
setup_day=$(cat /var/lib/lab-state/f107-2-at-agendar.day 2>/dev/null)
[ -n "$setup_day" ] || setup_day=$(date +%F)
want1=$(date -d "$setup_day + 1 day $P_hora:$P_minuto:00" +%s)
want2=$(date -d "tomorrow $P_hora:$P_minuto:00" +%s)
found=0; old=0; when=""
while read -r id _ _ _ _ _ _ user; do
  [ -n "$id" ] || continue
  [ "$user" = "aluno" ] || continue
  body=$(at -c "$id" 2>/dev/null)
  if printf '%s\n' "$body" | grep -q -e "obsoleto-$P_tag.sh"; then old=$((old + 1)); fi
  if printf '%s\n' "$body" | grep -q -e "lab/atjob/$P_script" -e "executou $P_script"; then
    found=$((found + 1))
    when=$(atq | awk -v i="$id" '$1==i {print $2,$3,$4,$5,$6}')
  fi
done < <(atq)
if [ "$found" -eq 0 ]; then
  fail "não há job do aluno na fila executando ~/lab/atjob/$P_script"
elif [ "$found" -gt 1 ]; then
  fail "há $found jobs agendando $P_script (deveria ser só um)"
else
  ok "há um job do aluno executando ~/lab/atjob/$P_script"
  t=$(date -d "$when" +%s 2>/dev/null)
  if [ "$t" = "$want1" ] || [ "$t" = "$want2" ]; then ok "o job está marcado para amanhã às $P_hora:$P_minuto"; else fail "o horário do job ($when) não é amanhã às $P_hora:$P_minuto"; fi
fi
if [ "$old" -eq 0 ]; then ok "o job de obsoleto-$P_tag.sh foi removido da fila"; else fail "o job antigo de obsoleto-$P_tag.sh ainda está na fila"; fi
finish
