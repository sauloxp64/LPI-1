#!/bin/bash
source /opt/lab/lib.sh
aqui=$(dirname "$(readlink -f "$0")")
# estado inicial dos arquivos de configuração do aluno (cópias do original do laboratório)
install -o aluno -g aluno -m 644 "$aqui/golden/bashrc"  /home/aluno/.bashrc
install -o aluno -g aluno -m 644 "$aqui/golden/profile" /home/aluno/.profile
rm -f /home/aluno/.bash_profile /home/aluno/.bash_login /home/aluno/.bash_aliases /home/aluno/.bash_logout.lab
d=$(fresh_dir ambiente)
mkdir -p "$d/bin" "$d/amostra"
# ferramenta que o aluno quer chamar de qualquer lugar
printf '#!/bin/bash\necho "ferramenta %s executada"\n' "$P_ferramenta" > "$d/bin/$P_ferramenta"
chmod 755 "$d/bin/$P_ferramenta"
# pasta de amostra com tamanhos e datas diferentes (para comparar a saída do ls)
i=0
for n in notas.txt balanco.csv fotos.tar ata.md .oculto; do
  i=$((i + 1))
  head -c $(( (RANDOM % 9 + 1) * 700 + i * 300 )) /dev/zero > "$d/amostra/$n"
  touch -d "2025-0$i-1$i 1$i:30" "$d/amostra/$n"
done
mkdir "$d/amostra/pasta-vazia"; touch -d "2025-06-20 09:00" "$d/amostra/pasta-vazia"
chown -R aluno:aluno "$d"
echo "cenário pronto em $d"
