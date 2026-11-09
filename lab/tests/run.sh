#!/bin/bash
# Executa os casos de regressão dos checks do laboratório, DENTRO de um container do lab (como root).
# Normalmente chamado por scripts/lab-regressao.sh. Uso:
#   run.sh                    # todos os casos
#   run.sh f107-2-cron-aluno  # só os desafios indicados (ids separados por espaço)
# Saída: uma linha "ok"/"ERRO" por caso; código de saída != 0 se algum caso divergir do esperado.
dir=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
source "$dir/lib.sh"
for f in "$dir"/casos/*.sh; do
  id=$(basename "$f" .sh)
  if [ $# -gt 0 ] && [[ " $* " != *" $id "* ]]; then continue; fi
  echo "== $id"
  # shellcheck source=/dev/null
  source "$f"
done
echo
echo "casos: $LAB_TESTS_TOTAL, divergências: $LAB_TESTS_ERROS"
[ "$LAB_TESTS_ERROS" -eq 0 ]
