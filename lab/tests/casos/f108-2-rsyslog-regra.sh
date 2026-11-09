# E-08: o check testa os OITO níveis da facility-alvo (emerg..debug): grava do nível 0 até o piso pedido, inclusive,
# e nada abaixo dele nem de outra facility; as mensagens gravadas não vão para o /var/log/syslog.
ID=f108-2-rsyslog-regra
C=/etc/rsyslog.d/40-app-vendas.conf
A=/var/log/app-vendas.log
# rsys <piso> <esperado> <nome> <conteudo do .conf>
rsys() {
  P=(fac=local0 fac2=local6 prio=$1 arquivo=vendas tok=1234)
  lab_setup
  printf '%b\n' "$4" > $C
  reiniciar_rsyslog
  logger -p "local0.$1" -t lab "teste-1234"; sleep 1
  chk "$2" "[$1] $3"
}
for prio in notice warning err; do
  case $prio in notice) n=5;; warning) n=4;; err) n=3;; esac
  rsys $prio PASS "solução clássica (seletor + & stop)" "local0.$prio\t$A\n& stop"
  rsys $prio FAIL "ADVERSARIAL: só severidade $n ou 1 (RainerScript seletivo)" "if \$syslogfacility-text == 'local0' and (\$syslogseverity == $n or \$syslogseverity == 1) then {\n  action(type=\"omfile\" file=\"$A\")\n  stop\n}"
  rsys $prio FAIL "faltando um nível no meio (crit)" "if \$syslogfacility-text == 'local0' and \$syslogseverity <= $n and \$syslogseverity != 2 then {\n  action(type=\"omfile\" file=\"$A\")\n  stop\n}"
  # as demais variações só para o primeiro piso (cada caso reinicia o rsyslogd; economiza tempo)
  [ "$prio" = notice ] || continue
  rsys $prio PASS "RainerScript com severity <= $n" "if \$syslogfacility-text == 'local0' and \$syslogseverity <= $n then {\n  action(type=\"omfile\" file=\"$A\")\n  stop\n}"
  rsys $prio PASS "seletor com action() + & stop" "local0.$prio action(type=\"omfile\" file=\"$A\")\n& stop"
  rsys $prio PASS "comentários e linhas em branco" "# regra\nlocal0.$prio\t$A\n\n# parar\n& stop"
  rsys $prio FAIL "sem & stop (também vai para o syslog)" "local0.$prio\t$A"
  rsys $prio FAIL "só a prioridade exata (.=$prio)" "local0.=$prio\t$A\n& stop"
  rsys $prio FAIL "piso alto demais (local0.emerg)" "local0.emerg\t$A\n& stop"
  rsys $prio FAIL "local0.* (inclui debug)" "local0.*\t$A\n& stop"
  rsys $prio FAIL "*.$prio (inclui outras facilities)" "*.$prio\t$A\n& stop"
done
# deixa o rsyslogd sem a regra de teste
P=(fac=local0 fac2=local6 prio=notice arquivo=vendas tok=1234); lab_setup
