#!/bin/bash
source /opt/lab/lib.sh
d=$(fresh_dir auditoria)
mkdir "$d/sub"
orig=$d/$P_base.dat
for i in $(seq 8 14); do echo "registro $i $RANDOM $RANDOM"; done > "$orig"

# sorteia nomes únicos e distribui entre a pasta e a subpasta
mapfile -t nomes < <(shuf -e copia-a relatorio-q1 relatorio-q2 backup-0 atalho-1 espelho historico base-velha extrato resumo anexo-3 saldo ficha lote-7 diario)
pos() { if (( RANDOM % 2 )); then echo "$d"; else echo "$d/sub"; fi; }
rel() { realpath -m --relative-to="$1" "$2"; }
idx=0
nh=$(( RANDOM % 2 + 2 ));  ns=$(( RANDOM % 2 + 2 ));  nc=$(( RANDOM % 2 + 1 ))
for i in $(seq "$nh"); do dir=$(pos); ln "$orig" "$dir/${nomes[idx]}.dat"; idx=$((idx + 1)); done
for i in $(seq "$ns"); do
  dir=$(pos); l="$dir/${nomes[idx]}.lnk"; idx=$((idx + 1))
  if (( RANDOM % 2 )); then ln -s "$(rel "$dir" "$orig")" "$l"; else ln -s "$orig" "$l"; fi
done
dir=$(pos); ln -s "$(rel "$dir" "$d/sub/removido-$RANDOM.dat")" "$dir/${nomes[idx]}.lnk"; idx=$((idx + 1))     # link quebrado
for i in $(seq "$nc"); do dir=$(pos); cp "$orig" "$dir/${nomes[idx]}.dat"; idx=$((idx + 1)); done                  # cópias (mesmo conteúdo, inode próprio)
dir=$(pos); { cat "$orig"; echo "linha extra $RANDOM"; } > "$dir/${nomes[idx]}.dat"                              # isca: parecido, mas diferente
chown -R -h aluno:aluno "$d"
echo "cenário pronto em $d"
