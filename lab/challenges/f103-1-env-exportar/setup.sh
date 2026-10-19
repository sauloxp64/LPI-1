#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-1-env-exportar
rm -rf "$ST"; mkdir -p "$ST"
d=$(fresh_dir f103-1-env-exportar)
cat > "$d/mostra.sh" <<SCRIPT
#!/bin/bash
# mostra.sh - confere o ambiente antes de subir o serviço $P_serv
for v in $P_var $P_varporta; do
  if [ -z "\${!v}" ]; then
    echo "ERRO: a variável \$v não está definida no ambiente deste processo" >&2
    exit 1
  fi
done
echo "Serviço: $P_serv"
echo "Modo de operação: \$$P_var"
echo "Escutando na porta \$$P_varporta"
SCRIPT
chmod 755 "$d/mostra.sh"
chown aluno:aluno "$d/mostra.sh"
sha256sum "$d/mostra.sh" > "$ST/script.sha"
echo "cenário pronto em $d"
