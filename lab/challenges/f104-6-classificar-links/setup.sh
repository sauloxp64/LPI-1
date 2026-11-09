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
# gabarito e manifesto do material, em estado privado (fora de ~/lab): o check compara com isto, e não com a árvore
# atual, que o aluno poderia ter apagado ou alterado. Manifesto = tipo|caminho|(destino do symlink ou sha256).
ST=/root/.lab-state/f104-6-classificar-links
rm -rf "$ST"; mkdir -p "$ST"; chmod 700 /root/.lab-state "$ST"
(
  cd "$d" || exit 1
  find . -type f -samefile "$orig" ! -path "./$P_base.dat" | sed 's|^\./||' | sort > "$ST/duros"
  find . -type l | sed 's|^\./||' | sort > "$ST/simbolicos"
  find . -type f ! -samefile "$orig" -print0 | while IFS= read -r -d '' f; do cmp -s "$orig" "$f" && echo "${f#./}"; done | sort > "$ST/copias"
  find . \( -type f -o -type l \) | sed 's|^\./||' | sort | while IFS= read -r p; do
    if [ -L "$p" ]; then printf 'l|%s|%s\n' "$p" "$(readlink "$p")"; else printf 'f|%s|%s\n' "$p" "$(sha256sum < "$p" | cut -d' ' -f1)"; fi
  done > "$ST/manifesto"
)
chown -R -h aluno:aluno "$d"
echo "cenário pronto em $d"
