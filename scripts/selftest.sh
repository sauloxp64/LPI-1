#!/usr/bin/env bash
# Bateria completa de verificações (rode no Git Bash / WSL / Linux, a partir da raiz do repositório).
#   scripts/selftest.sh            # tudo
#   scripts/selftest.sh rapido     # sem Docker (lint do banco + testes unitários)
set -u
cd "$(dirname "$0")/.."
export NODE_NO_WARNINGS=1
fail=0
step() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
run()  { "$@" || { fail=1; printf '\033[31mFALHOU: %s\033[0m\n' "$*"; }; }

step "Banco de questões (formato, gabaritos, referências de página)"
run node app/tools/lint-questions.mjs --quiet --cobertura

step "Testes unitários"
(cd app && run node --test)

if [ "${1:-}" != "rapido" ]; then
  step "Geradores paramétricos × ferramentas reais (Docker)"
  run node app/tools/verify-generators.mjs --n=120

  step "Desafios do laboratório (setup → falha → solve → passa)"
  if docker compose ps --status running --services 2>/dev/null | grep -q '^lab$'; then
    LAB_ALLOW_SOLVE=1 docker compose up -d lab >/dev/null 2>&1   # garante o endpoint de solução (só para este teste)
    sleep 4
    run docker compose exec -T web node --disable-warning=ExperimentalWarning tools/selftest-lab.mjs --n=4
    docker compose up -d lab >/dev/null 2>&1                     # volta ao modo normal (sem /solve)
  else
    echo "lab fora do ar — rode antes: docker compose up -d --build"; fail=1
  fi
fi
echo
[ $fail -eq 0 ] && printf '\033[1;32m✓ tudo certo\033[0m\n' || printf '\033[1;31m✗ há falhas acima\033[0m\n'
exit $fail
