#!/usr/bin/env bash
# Regressões dos checks do laboratório, nos dois sentidos: estados adversariais/incorretos (achados E-01..E-08 da
# auditoria) têm de REPROVAR e a solução correta (e variações legítimas) tem de APROVAR.
# Usa um container DESCARTÁVEL da imagem do lab (sem rede, sem portas, sem volumes do host): não toca na stack real.
#   scripts/lab-regressao.sh                       # todos os casos (alguns minutos: o rsyslog reinicia a cada caso)
#   scripts/lab-regressao.sh f107-2-cron-aluno     # só os desafios indicados
# Requer a imagem `lpic1-lab` (docker compose build lab). Os desafios e a lib.sh testados são os do SEU working tree.
set -u
cd "$(dirname "$0")/.."
img=${LAB_IMAGE:-lpic1-lab:latest}
docker image inspect "$img" >/dev/null 2>&1 || { echo "imagem $img não encontrada: rode 'docker compose build lab'" >&2; exit 2; }
nome="${LAB_REGRESSAO_NOME:-lpic1-regressao-lab-$$}"
trap 'docker rm -f "$nome" >/dev/null 2>&1' EXIT
export MSYS_NO_PATHCONV=1   # Git Bash: não converter os caminhos do container
docker run -d --rm --name "$nome" --network none --entrypoint sleep "$img" infinity >/dev/null || exit 2
docker cp lab/challenges/. "$nome:/opt/lab/challenges/" || exit 2
docker cp lab/lib.sh "$nome:/opt/lab/lib.sh" || exit 2
docker cp lab/tests "$nome:/opt/lab-tests" || exit 2
# serviços que o entrypoint normal sobe e que alguns desafios usam
docker exec "$nome" bash -c 'cron 2>/dev/null; atd 2>/dev/null; rsyslogd 2>/dev/null; sleep 1; true' >/dev/null 2>&1
docker exec "$nome" bash /opt/lab-tests/run.sh "$@"
