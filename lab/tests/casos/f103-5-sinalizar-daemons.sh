# E-07: os sinais recebidos vêm do registro privado dos handlers; forjar texto nos logs de ~/lab não vale.
ID=f103-5-sinalizar-daemons
P=(d1=coletor d2=sincronizad)
ST=/root/.lab-state/$ID
LOGS=/home/aluno/lab/$ID/logs
lab_setup;                     chk FAIL "estado inicial (cenário não nasce resolvido)"
lab_solve;                     chk PASS "solução (HUP no d1, TERM no d2)"
lab_setup
echo "00:00:00 SIGHUP recebido: configuracao recarregada" >> $LOGS/coletor.log
kill -KILL "$(cat $ST/pid.sincronizad)"; sleep 0.3
echo "00:00:00 SIGTERM recebido: encerrando com calma" >> $LOGS/sincronizad.log
chk FAIL "ADVERSARIAL: logs forjados, d2 morto com SIGKILL e d1 sem HUP"
lab_setup
pkill -HUP -x coletor; pkill -TERM -x sincronizad; sleep 1
chk PASS "pkill -x: HUP no d1 e TERM no d2"
lab_setup
kill -TERM "$(cat $ST/pid.sincronizad)"; sleep 0.5; kill -HUP "$(cat $ST/pid.coletor)"; sleep 1
chk PASS "ordem trocada (TERM no d2, depois HUP no d1)"
lab_setup
pkill -HUP coletor; pkill -TERM -x sincronizad; sleep 1
chk FAIL "pkill -HUP coletor sem -x (atinge também o -aux)"
lab_setup
kill -HUP "$(cat $ST/pid.coletor)"; kill -TERM "$(cat $ST/pid.coletor)"; kill -TERM "$(cat $ST/pid.sincronizad)"; sleep 1
chk FAIL "d1 recebe HUP e também TERM"
lab_setup
kill -HUP "$(cat $ST/pid.coletor)"; sleep 1
chk FAIL "só HUP no d1; d2 continua vivo"
lab_setup
kill -HUP "$(cat $ST/pid.coletor)"; kill -TERM "$(cat $ST/pid.sincronizad)"; sleep 1
echo "x SIGHUP recebido" >> $LOGS/coletor-aux.log
chk PASS "solução correta, mesmo com texto estranho no log do aux (o log não conta)"
lab_setup
