# Biblioteca dos testes de regressão dos checks do laboratório. Roda DENTRO de um container do lab (veja
# scripts/lab-regressao.sh), como root, e é lida com `source` por run.sh e pelos casos/<id-do-desafio>.sh.
#
# Cada caso monta um estado (adversarial ou legítimo) e chama `chk PASS|FAIL "descrição"`:
#   FAIL = o check TEM de reprovar (estado incorreto/adversarial descrito nos achados da auditoria);
#   PASS = o check TEM de aprovar (a solução e variações legítimas: falso negativo é tão grave quanto falso positivo).

LAB_TESTS_TOTAL=0
LAB_TESTS_ERROS=0

# lr AÇÃO DESAFIO K=V...  -> roda setup/check/solve como o checker/server.py (ambiente limpo, cwd /root, P_<k>=<v>).
# CH_ROOT aponta para outra árvore de desafios (para comparar com uma versão antiga).
lr() {
  local act=$1 ch=$2; shift 2
  local args=() kv
  for kv in "$@"; do args+=("P_$kv"); done
  ( cd /root && exec env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C HOME=/root \
      LAB_DIR=/home/aluno/lab CHALLENGE="$ch" "${args[@]}" timeout 60 bash "${CH_ROOT:-/opt/lab/challenges}/$ch/$act.sh" )
}

# chk PASS|FAIL "descrição"   (usa as variáveis $ID e o array P do caso)
# "passou" segue a regra do checker: retorno 0, ao menos uma linha OK| e nenhuma FALHA|.
chk() {
  local want=$1 name=$2 out rc got
  out=$(lr check "$ID" "${P[@]}"); rc=$?
  if [ $rc -eq 0 ] && printf '%s\n' "$out" | grep -q '^OK|' && ! printf '%s\n' "$out" | grep -q '^FALHA|'; then got=PASS; else got=FAIL; fi
  LAB_TESTS_TOTAL=$((LAB_TESTS_TOTAL + 1))
  if [ "$got" = "$want" ]; then
    echo "ok   [$ID] esperado=$want: $name"
  else
    LAB_TESTS_ERROS=$((LAB_TESTS_ERROS + 1))
    echo "ERRO [$ID] esperado=$want obtido=$got: $name"
    printf '%s\n' "$out" | grep '^FALHA|' | sed 's/^/       /'
  fi
  return 0
}

# setup/solve do desafio atual ($ID, P)
lab_setup() { lr setup "$ID" "${P[@]}" >/dev/null 2>&1; }
lab_solve() { lr solve "$ID" "${P[@]}" >/dev/null 2>&1; }

# reinicia o rsyslogd (sem systemd): encerra o processo e sobe de novo
reiniciar_rsyslog() {
  local p i; p=$(cat /var/run/rsyslogd.pid 2>/dev/null)
  [ -n "$p" ] && kill "$p" 2>/dev/null
  for i in $(seq 1 25); do
    if [ -z "$p" ] || [ ! -d "/proc/$p" ] || grep -q '^State:.*Z' "/proc/$p/status" 2>/dev/null; then break; fi
    sleep 0.2
  done
  rsyslogd >/dev/null 2>&1
  sleep 1
}
