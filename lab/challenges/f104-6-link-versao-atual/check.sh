#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/releases
a=$d/$P_app
if [ ! -d "$a/versoes" ]; then fail "a estrutura ~/lab/releases/$P_app/versoes foi apagada"; finish; exit; fi

# 1) link "atual"
if [ -L "$a/atual" ]; then
  alvo=$(readlink "$a/atual"); norm=${alvo#./}; norm=${norm%/}
  if [ "$norm" = "versoes/$P_nova" ]; then ok "'atual' é um link simbólico RELATIVO para versoes/$P_nova"
  elif [[ "$alvo" == /* ]] && [ "$(readlink -f "$a/atual")" = "$(readlink -f "$a/versoes/$P_nova")" ]; then fail "'atual' aponta para a versão nova, mas com caminho ABSOLUTO ($alvo); o enunciado pede relativo"
  else fail "'atual' aponta para '$alvo' (deveria apontar para a versão nova)"; fi
else fail "'atual' não é mais um link simbólico"; fi
n=$(find "$a/versoes" -type l | wc -l)
if [ "$n" -eq 0 ]; then ok "nenhum link foi criado por engano dentro das pastas de versões"; else fail "há $n link(s) perdido(s) dentro de versoes/ (provavelmente um 'ln' criou o link dentro da pasta apontada, em vez de trocar o 'atual')"; fi

# 2) link absoluto "comando"
c=$a/comando
if [ -L "$c" ]; then
  alvo=$(readlink "$c")
  if [[ "$alvo" == /* ]] && [[ "$alvo" == */atual/bin/$P_app ]] && [ "$(readlink -f "$c")" = "$(readlink -f "$a/versoes/$P_nova/bin/$P_app")" ]; then
    ok "'comando' é um link simbólico absoluto passando por 'atual' e chega ao executável da versão nova"
  else fail "'comando' aponta para '$alvo': deve ser um caminho absoluto até atual/bin/$P_app, resolvendo para a versão nova"; fi
  expect_eq "executar 'comando' mostra a versão nova" "$("$c" 2>/dev/null)" "$P_app versao $P_nova"
else fail "o link simbólico ~/lab/releases/$P_app/comando não existe"; fi

# 3) links quebrados removidos, válidos preservados
n=$(find "$a" -xtype l | wc -l)
if [ "$n" -eq 0 ]; then ok "não restam links quebrados em ~/lab/releases/$P_app"; else fail "ainda há $n link(s) simbólico(s) quebrado(s) na árvore"; fi
if [ -L "$a/docs/manual" ] && [ -e "$a/docs/manual" ]; then ok "o link válido docs/manual foi preservado"; else fail "o link válido docs/manual não deveria ter sido removido"; fi
finish
