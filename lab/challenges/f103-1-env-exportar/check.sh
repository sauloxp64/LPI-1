#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-1-env-exportar
d="$LAB_DIR/f103-1-env-exportar"
out="$d/saida.txt"

if sha256sum -c --status "$ST/script.sha" 2>/dev/null; then ok "o script mostra.sh não foi alterado"
else fail "o script mostra.sh foi modificado ou apagado (o objetivo é não mexer nele; reinicie o desafio se precisar)"; fi

if [ ! -f "$out" ]; then fail "o arquivo saida.txt não existe em ~/lab/f103-1-env-exportar"; finish; exit; fi

esperado=$(cd "$d" && env "$P_var=$P_valor" "$P_varporta=$P_porta" ./mostra.sh 2>&1)
obtido=$(cat "$out")
if [ -z "$obtido" ]; then fail "saida.txt está vazio: o script rodou com as variáveis no ambiente dele? (a mensagem de erro vai para o erro padrão, não para o arquivo)"
else expect_eq "conteúdo de saida.txt = saída do script com $P_var=$P_valor e $P_varporta=$P_porta" "$obtido" "$esperado"; fi
finish
