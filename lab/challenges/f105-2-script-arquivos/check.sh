#!/bin/bash
source /opt/lab/lib.sh
s=$LAB_DIR/scripts/$P_script
if [ ! -f "$s" ]; then fail "o script ~/lab/scripts/$P_script não existe"; finish; exit; fi
if [ -x "$s" ]; then ok "o script é executável"; else fail "o script não tem permissão de execução (chmod +x)"; finish; exit; fi
if head -1 "$s" | grep -qE '^#!\s*(/bin/(ba)?sh|/usr/bin/env +(ba)?sh|/usr/bin/bash)'; then ok "a primeira linha é um shebang (#!) válido para o interpretador"
else fail "a primeira linha do script deve ser o shebang com o interpretador (#!/bin/bash)"; fi

# área de testes sorteada a cada verificação (legível pelo aluno)
t=$(mktemp -d /tmp/lab105-2-XXXXXX); chmod 755 "$t"
nomes=(relatorio notas "lista de compras" ata "backup final" dados saldo "meu arquivo")
mapfile -t usar < <(shuf -e "${nomes[@]}" | head -5)
n=0
for nome in "${usar[@]}"; do
  linhas=$(( RANDOM % 9 ))                    # 0 a 8 linhas (inclui arquivo vazio)
  : > "$t/$nome.txt"
  for i in $(seq "$linhas"); do echo "linha $i $RANDOM" >> "$t/$nome.txt"; done
  [ $((RANDOM % 3)) -eq 0 ] && printf 'sem quebra final' >> "$t/$nome.txt"      # última linha sem \n: wc -l não conta
  n=$((n + 1))
done
mkdir "$t/pasta com espaco" "$t/outra"
echo secreto > "$t/privado.txt"; chown root:root "$t/privado.txt"; chmod 600 "$t/privado.txt"   # existe, mas o aluno não lê
chmod -R a+rX "$t"; chmod 600 "$t/privado.txt"

# implementação de referência (executada como aluno para ver as mesmas permissões)
cat > "$t/.ref.sh" <<'REF'
#!/bin/bash
falta=0
for p in "$@"; do
  if [ -d "$p" ]; then echo "@DIR@ $p"
  elif [ -f "$p" ] && [ -r "$p" ]; then echo "@ARQ@ $p $(wc -l < "$p")"
  else echo "@AUS@ $p"; falta=$((falta + 1)); fi
done
exit $falta
REF
sed -i "s/@DIR@/$P_r_dir/; s/@ARQ@/$P_r_arq/; s/@AUS@/$P_r_aus/" "$t/.ref.sh"; chmod 755 "$t/.ref.sh"

compara() {   # compara <descricao> -- args...
  local desc=$1; shift 2
  local esp obt rc_esp rc_obt err
  esp=$(cd "$t" && timeout 5 runuser -u aluno -- "$t/.ref.sh" "$@" 2>/dev/null); rc_esp=$?
  obt=$(cd "$t" && timeout 5 runuser -u aluno -- "$s" "$@" 2>/tmp/.lab105-2-err); rc_obt=$?
  if [ "$obt" = "$esp" ] && [ "$rc_obt" = "$rc_esp" ]; then ok "$desc: saída e código de saída ($rc_esp) corretos"
  elif [ "$obt" != "$esp" ]; then
    local df; df=$(diff <(echo "$esp") <(echo "$obt"))
    fail "$desc: a saída difere. Primeira linha esperada: '$(echo "$df" | grep -m1 '^<' | cut -c3-)' / obtida: '$(echo "$df" | grep -m1 '^>' | cut -c3-)'"
  else fail "$desc: código de saída $rc_obt, esperado $rc_esp"; fi
}
cd "$t"
a1="${usar[0]}.txt"; a2="${usar[1]}.txt"; a3="${usar[2]}.txt"; a4="${usar[3]}.txt"
compara "todos existem" -- "$a1" "$a2" "$a3" "pasta com espaco"
compara "mistura de arquivos, pasta, ausentes e ilegível" -- "$a4" "nao existe.txt" "outra" "$a1" "privado.txt" "fantasma" "$a2"
compara "um único caminho (inclusive com espaços no nome)" -- "$t/$a3"
# sem argumentos
out=$(cd "$t" && timeout 5 runuser -u aluno -- "$s" 2>/tmp/.lab105-2-err); rc=$?
if [ -z "$out" ] && [ -s /tmp/.lab105-2-err ] && [ "$rc" -eq "$P_uso" ]; then ok "sem argumentos: mensagem de uso só na saída de erro e código $P_uso"
else fail "sem argumentos: deve imprimir 'uso: $P_script caminho...' somente na saída de erro (stderr), nada na saída padrão, e sair com código $P_uso (obtido: código $rc, stdout '${out:0:40}')"; fi
rm -rf "$t" /tmp/.lab105-2-err
finish
