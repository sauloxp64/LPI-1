#!/bin/bash
source /opt/lab/lib.sh
s=$LAB_DIR/scripts/$P_script
cat > "$s" <<EOT
#!/bin/bash
if [ \$# -eq 0 ]; then
  echo "uso: $P_script caminho..." >&2
  exit $P_uso
fi
falta=0
for p in "\$@"; do
  if [ -d "\$p" ]; then
    echo "$P_r_dir \$p"
  elif [ -f "\$p" ] && [ -r "\$p" ]; then
    echo "$P_r_arq \$p \$(wc -l < "\$p")"
  else
    echo "$P_r_aus \$p"
    falta=\$((falta + 1))
  fi
done
exit \$falta
EOT
chmod 755 "$s"; chown aluno:aluno "$s"
