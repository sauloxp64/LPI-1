#!/bin/bash
source /opt/lab/lib.sh
d=$(fresh_dir impressao)
printf 'conteudo de teste\n' > "$d/$P_arquivo"
j=$P_job
{
  echo "$P_impressora is ready and printing"
  printf '%-7s %-8s %-6s %-32s %s\n' Rank Owner Job "File(s)" "Total Size"
  printf '%-7s %-8s %-6s %-32s %s\n' active aluno $((j - 2)) relatorio-trimestral.pdf "$((RANDOM % 900 + 100))352 bytes"
  printf '%-7s %-8s %-6s %-32s %s\n' 1st marta $((j - 1)) planilha-custos.ods "$((RANDOM % 90 + 10))136 bytes"
  printf '%-7s %-8s %-6s %-32s %s\n' 2nd aluno "$j" "$P_documento" "$((RANDOM % 90 + 10))480 bytes"
  printf '%-7s %-8s %-6s %-32s %s\n' 3rd paulo $((j + 1)) ata-reuniao.txt "$((RANDOM % 9 + 1))024 bytes"
} > "$d/fila.txt"
chown -R aluno:aluno "$d"
echo "cenário pronto em $d"
