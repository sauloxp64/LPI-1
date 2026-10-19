#!/bin/bash
source /opt/lab/lib.sh
# remove só as linhas deste desafio do crontab do aluno (outros desafios podem usar o crontab)
if crontab -u aluno -l >/dev/null 2>&1; then
  crontab -u aluno -l | grep -v '/lab/cronaluno/' | crontab -u aluno -
fi
d=$(fresh_dir cronaluno)
for s in "$P_script_a" "$P_script_b"; do
  cat > "$d/$s" <<SCR
#!/bin/sh
echo "[$s] concluido"
echo "[$s] aviso: rotina sem pendencias" >&2
SCR
  chmod 644 "$d/$s"
done
echo "# registro das rotinas agendadas" > "$d/agenda.log"
chown -R aluno:aluno "$d"
echo "cenário pronto em $d (scripts sem permissão de execução)"
