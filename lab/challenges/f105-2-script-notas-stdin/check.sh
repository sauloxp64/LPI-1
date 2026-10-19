#!/bin/bash
source /opt/lab/lib.sh
s=$LAB_DIR/scripts-notas/$P_script
if [ ! -f "$s" ]; then fail "o script ~/lab/scripts-notas/$P_script não existe"; finish; exit; fi
if [ -x "$s" ]; then ok "o script é executável"; else fail "o script não tem permissão de execução (chmod +x)"; finish; exit; fi
if head -1 "$s" | grep -qE '^#!\s*(/bin/(ba)?sh|/usr/bin/env +(ba)?sh|/usr/bin/bash)'; then ok "a primeira linha é um shebang (#!) válido"
else fail "a primeira linha do script deve ser o shebang com o interpretador (#!/bin/bash)"; fi

t=$(mktemp -d /tmp/lab105-2b-XXXXXX); chmod 755 "$t"
nomes=(marcos julia pedro luana tiago bia caio vera nando dani leo sara)
gera() {   # gera <arquivo> [todos100]   -> CSV sorteado, com comentários e linhas em branco
  local f=$1 k=$(( RANDOM % 5 + 6 )) i n1 n2 n3
  { echo "# nome;n1;n2;n3"
    while read -r nome; do
      if [ "$2" = todos100 ]; then n1=100; n2=100; n3=$(( 99 + RANDOM % 2 )); else n1=$((RANDOM % 101)); n2=$((RANDOM % 101)); n3=$((RANDOM % 101)); fi
      echo "$nome;$n1;$n2;$n3"
      (( RANDOM % 4 == 0 )) && echo
      (( RANDOM % 5 == 0 )) && echo "# comentário $RANDOM"
    done < <(shuf -e "${nomes[@]}" | head -"$k")
  } > "$f"
  chmod 644 "$f"
}
# referência
ref() {   # ref <arquivo|-> <minimo>
  awk -F';' -v min="$2" -v ok="$P_ok_txt" -v bad="$P_bad_txt" '
    /^[[:space:]]*$/ { next } /^#/ { next }
    { m = int(($2 + $3 + $4) / 3); s = (m >= min) ? ok : bad; print $1 ": media=" m " situacao=" s; tot++; if (m >= min) a++; else r++ }
    END { print "total=" tot+0 " aprovados=" a+0 " reprovados=" r+0; exit (r > 0) }' "$1"
}
compara() {   # compara <desc> <esp_out> <esp_rc> <obt_out> <obt_rc>
  if [ "$2" = "$4" ] && [ "$3" = "$5" ]; then ok "$1: saída e código de saída ($3) corretos"
  elif [ "$2" != "$4" ]; then
    local df; df=$(diff <(echo "$2") <(echo "$4"))
    fail "$1: a saída difere. Primeira linha esperada: '$(echo "$df" | grep -m1 '^<' | cut -c3-)' / obtida: '$(echo "$df" | grep -m1 '^>' | cut -c3-)'"
  else fail "$1: código de saída $5, esperado $3"; fi
}
roda() { timeout 5 runuser -u aluno -- "$s" "$@" 2>/dev/null; }

gera "$t/a.csv"; min2=$(( RANDOM % 41 + 40 ))
esp=$(ref "$t/a.csv" "$P_min"); erc=$?
obt=$(cd "$t" && roda "$t/a.csv"); orc=$?
compara "arquivo com a média mínima padrão ($P_min)" "$esp" "$erc" "$obt" "$orc"

esp=$(ref "$t/a.csv" "$min2"); erc=$?
obt=$(cd "$t" && roda "$t/a.csv" "$min2"); orc=$?
compara "arquivo com média mínima informada ($min2)" "$esp" "$erc" "$obt" "$orc"

gera "$t/b.csv"
esp=$(ref "$t/b.csv" "$P_min"); erc=$?
obt=$(cd "$t" && timeout 5 runuser -u aluno -- bash -c '"$0" - < "$1"' "$s" "$t/b.csv" 2>/dev/null); orc=$?
compara "leitura da entrada padrão ('-') com a média mínima padrão" "$esp" "$erc" "$obt" "$orc"

esp=$(ref "$t/b.csv" "$min2"); erc=$?
obt=$(cd "$t" && timeout 5 runuser -u aluno -- bash -c 'cat "$1" | "$0" - "$2"' "$s" "$t/b.csv" "$min2" 2>/dev/null); orc=$?
compara "entrada padrão ('-') com média mínima informada ($min2)" "$esp" "$erc" "$obt" "$orc"

gera "$t/c.csv" todos100
esp=$(ref "$t/c.csv" "$P_min"); erc=$?
obt=$(cd "$t" && roda "$t/c.csv"); orc=$?
compara "todos aprovados (status 0)" "$esp" "$erc" "$obt" "$orc"

# erros
out=$(cd "$t" && timeout 5 runuser -u aluno -- "$s" "$t/nao-existe.csv" 2>/tmp/.lab105-2b-err); rc=$?
if [ -z "$out" ] && [ -s /tmp/.lab105-2b-err ] && [ "$rc" -eq "$P_err" ]; then ok "arquivo inexistente: mensagem só no stderr e código $P_err"
else fail "arquivo inexistente: deve escrever a mensagem somente na saída de erro, nada na saída padrão, e sair com código $P_err (obtido: código $rc, stdout '${out:0:40}')"; fi
out=$(cd "$t" && timeout 5 runuser -u aluno -- "$s" 2>/tmp/.lab105-2b-err); rc=$?
if [ -z "$out" ] && [ -s /tmp/.lab105-2b-err ] && [ "$rc" -eq "$P_err" ]; then ok "sem argumentos: uso no stderr e código $P_err"
else fail "sem argumentos: deve escrever 'uso: $P_script ARQUIVO [MINIMO]' somente no stderr e sair com código $P_err (obtido: código $rc)"; fi
rm -rf "$t" /tmp/.lab105-2b-err
finish
