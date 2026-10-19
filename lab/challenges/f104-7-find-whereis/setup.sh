#!/bin/bash
source /opt/lab/lib.sh
d=$(fresh_dir achados)
r=$(fresh_dir respostas-achados)
exts=(log txt conf csv tmp)
nomes=(acesso erro auditoria saldo ponto vendas sessao rotina boletim cadastro)
for sub in logs/app logs/sistema dados/2024 dados/2025 tmp cache/velho .ocultos; do
  mkdir -p "$d/$sub"
  for i in $(seq $(( RANDOM % 3 + 3 ))); do
    # metade dos arquivos usa a extensão procurada
    if (( RANDOM % 2 )); then ext=$P_ext; else ext=${exts[RANDOM % ${#exts[@]}]}; fi
    f="$d/$sub/${nomes[RANDOM % ${#nomes[@]}]}-$RANDOM.$ext"
    if (( RANDOM % 2 )); then bytes=$(( (P_kb + 3 + RANDOM % 8) * 1024 + RANDOM % 1000 ))        # bem acima do limite
    else bytes=$(( RANDOM % ((P_kb - 3) * 1024 - 1) + 1 )); fi                                      # bem abaixo do limite
    head -c "$bytes" /dev/zero > "$f"
  done
done
# armadilhas: uma PASTA e um LINK com o nome terminando na extensão procurada
mkdir -p "$d/dados/inventario.$P_ext"; head -c $(( (P_kb + 5) * 1024 )) /dev/zero > "$d/dados/inventario.$P_ext/parte1.bin"
big=$(find "$d" -type f -size +"${P_kb}k" | head -1)
[ -n "$big" ] && ln -s "$big" "$d/tmp/atalho.$P_ext"
# garante pelo menos 2 arquivos que atendem ao critério
for k in 1 2; do head -c $(( (P_kb + 4 + RANDOM % 6) * 1024 )) /dev/zero > "$d/logs/app/garantido$k-$RANDOM.$P_ext"; done
chown -R -h aluno:aluno "$d" "$r"
echo "cenário pronto em $d (respostas em $r)"
