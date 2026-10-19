#!/bin/bash
source /opt/lab/lib.sh
d="$LAB_DIR/f103-1-path-alias"
bindir="$d/bin"
# novas sessões do aluno: login + shell interativo (lê .profile/.bash_profile e .bashrc)
sessao() { su -l aluno -c "bash -ic '$1'" 2>/dev/null; }

alvo=$(sessao "command -v $P_cmd")
expect_eq "numa sessão nova, o comando $P_cmd é achado pelo PATH em $bindir" "$alvo" "$bindir/$P_cmd"

tipo=$(sessao "type -t $P_alias")
expect_eq "numa sessão nova, '$P_alias' é um alias" "$tipo" "alias"

esp_exec="$P_cmd: executado com argumentos: $P_flag"
obt_exec=$(sessao "$P_alias")
expect_eq "o alias $P_alias executa '$P_cmd $P_flag'" "$obt_exec" "$esp_exec"

ev="$d/evidencia.txt"
if [ ! -f "$ev" ]; then fail "o arquivo evidencia.txt não existe em ~/lab/f103-1-path-alias"; finish; exit; fi
linha_alias=$(sessao "alias $P_alias")
n_path=$(grep -nF -- "$bindir/$P_cmd" "$ev" | head -1 | cut -d: -f1)
n_alias=$(grep -nxF -- "$linha_alias" "$ev" | head -1 | cut -d: -f1)
if [ -n "$n_path" ]; then ok "evidencia.txt mostra de onde vem o comando $P_cmd (saída de type)"
else fail "evidencia.txt não contém o caminho completo de $P_cmd (grave a saída de type $P_cmd)"; fi
if [ -n "$n_alias" ]; then ok "evidencia.txt mostra a definição do alias $P_alias"
else fail "evidencia.txt não contém a definição do alias $P_alias (saída de alias $P_alias)"; fi
if [ -n "$n_path" ] && [ -n "$n_alias" ]; then
  if [ "$n_path" -lt "$n_alias" ]; then ok "a saída de type vem antes da saída de alias"; else fail "a saída de type $P_cmd deve vir antes da de alias $P_alias"; fi
fi
finish
