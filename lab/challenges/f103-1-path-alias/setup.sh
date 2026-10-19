#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-1-path-alias
rm -rf "$ST"; mkdir -p "$ST"
# limpa o que uma execução anterior possa ter deixado nos arquivos de inicialização do aluno
for f in .bashrc .profile .bash_profile .bash_login .bash_aliases; do
  [ -f "/home/aluno/$f" ] && sed -i -E '/f103-1-path-alias/d; /^[[:space:]]*alias[[:space:]]+(labhoje|labpainel|labrapido|labatalho|labresumo)=/d' "/home/aluno/$f"
done
[ -f /home/aluno/.bash_aliases ] && [ ! -s /home/aluno/.bash_aliases ] && rm -f /home/aluno/.bash_aliases
d=$(fresh_dir f103-1-path-alias)
mkdir -p "$d/bin"
cat > "$d/bin/$P_cmd" <<SCRIPT
#!/bin/bash
echo "$P_cmd: executado com argumentos: \$*"
SCRIPT
chmod 755 "$d/bin/$P_cmd"
chown -R aluno:aluno "$d"
echo "cenário pronto em $d"
