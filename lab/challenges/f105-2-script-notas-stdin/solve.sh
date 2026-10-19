#!/bin/bash
source /opt/lab/lib.sh
s=$LAB_DIR/scripts-notas/$P_script
cat > "$s" <<EOT
#!/bin/bash
if [ \$# -lt 1 ]; then
  echo "uso: $P_script ARQUIVO [MINIMO]" >&2
  exit $P_err
fi
arq=\$1
min=\${2:-$P_min}
if [ "\$arq" != "-" ] && [ ! -r "\$arq" ]; then
  echo "erro: não consigo ler '\$arq'" >&2
  exit $P_err
fi
[ "\$arq" = "-" ] && arq=/dev/stdin
total=0; ap=0; rp=0
while IFS=';' read -r nome n1 n2 n3; do
  case "\$nome" in ''|'#'*) continue ;; esac
  media=\$(( (n1 + n2 + n3) / 3 ))
  if [ "\$media" -ge "\$min" ]; then sit=$P_ok_txt; ap=\$((ap + 1)); else sit=$P_bad_txt; rp=\$((rp + 1)); fi
  total=\$((total + 1))
  echo "\$nome: media=\$media situacao=\$sit"
done < "\$arq"
echo "total=\$total aprovados=\$ap reprovados=\$rp"
[ "\$rp" -eq 0 ]
EOT
chmod 755 "$s"; chown aluno:aluno "$s"
