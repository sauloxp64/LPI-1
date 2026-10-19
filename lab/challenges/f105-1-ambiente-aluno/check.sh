#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/ambiente
amostra=$d/amostra
# bash interativo novo, NÃO de login (como abrir outro terminal/subshell): lê só o ~/.bashrc
interativo() {
  local c; c=$(printf '%q' "$1")
  su -s /bin/bash aluno -c "cd '$amostra' && env -i HOME=/home/aluno PATH=/usr/bin:/bin TERM=dumb bash -ic $c 2>/dev/null"
}
# shell de LOGIN (como 'su -l aluno'): lê /etc/profile e ~/.profile (ou ~/.bash_profile)
login() { su -l aluno -c "$1" 2>/dev/null; }

# 1) alias
esperado=$(cd "$amostra" && ls $P_opcao)
obtido=$(interativo "$P_apelido")
if [ -n "$obtido" ] && [ "$obtido" = "$esperado" ]; then ok "o alias '$P_apelido' existe em novos shells interativos e executa 'ls $P_opcao'"
else
  if interativo "type -t $P_apelido" | grep -qx alias; then fail "o alias '$P_apelido' existe, mas a saída não é a de 'ls $P_opcao'"
  else fail "o alias '$P_apelido' não existe em um novo bash interativo (o arquivo certo foi editado? lido por shells que não são de login?)"; fi
fi

# 2) função
base="/tmp/lab105-teste $RANDOM"
obtido=$(interativo "$P_funcao \"$base/sub dir/final\" && pwd")
if [ "$obtido" = "$base/sub dir/final" ] && [ -d "$base/sub dir/final" ]; then ok "a função '$P_funcao' cria a pasta (com pais, mesmo com espaços no nome) e entra nela"
else
  if interativo "type -t $P_funcao" | grep -qx function; then fail "a função '$P_funcao' existe, mas não cria o diretório com pais e entra nele (cuidado com aspas em \"\$1\" e com o -p)"
  else fail "a função '$P_funcao' não existe em um novo bash interativo"; fi
fi
rm -rf "$base"

# 3) PATH em shell de login
achou=$(login "command -v $P_ferramenta")
if [ "$achou" = "$d/bin/$P_ferramenta" ]; then ok "'$P_ferramenta' é encontrada pelo PATH de um shell de login"
else fail "'$P_ferramenta' não é encontrada pelo PATH de um shell de login do aluno (su -l aluno)"; fi
if [ "$(login 'command -v ls')" = "/usr/bin/ls" ] || [ "$(login 'command -v ls')" = "/bin/ls" ]; then ok "o PATH original foi mantido (comandos como ls continuam sendo achados)"
else fail "o PATH original foi perdido: o ls não é mais encontrado em um shell de login (o PATH foi sobrescrito em vez de estendido?)"; fi

# 4) variável exportada em shell de login
v=$(login "printenv $P_variavel")
if [ "$v" = "$P_valor" ]; then ok "$P_variavel=$P_valor está exportada em shells de login"
else
  if [ -z "$v" ]; then fail "a variável $P_variavel não aparece no ambiente de um shell de login (faltou 'export', ou ela está num arquivo que só shells interativos leem?)"
  else fail "$P_variavel tem o valor '$v' (esperado: $P_valor)"; fi
fi
finish
