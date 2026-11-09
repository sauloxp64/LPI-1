# E-01: dia do mês × dia da semana. Com os dois campos restritos (nenhum começa com '*') o cron do Debian combina
# com OU: "10 3 1-31 * 1" roda todo dia. Os conjuntos de valores sozinhos não revelam isso.
ID=f107-2-cron-aluno
P=(script_a=coleta-metricas.sh script_b=verifica-fila.sh dia=segunda hora=3 minuto=10 passo=15 h_ini=8 h_fim=18)
D=/home/aluno/lab/cronaluno
lab_setup
chmod +x $D/*.sh
crontab_caso() { printf '%s\n%s\n' "$1" "$2" | crontab -u aluno - 2>/dev/null; }   # (crontab recusa linhas inválidas e mantém o anterior)
A_CMD="$D/coleta-metricas.sh >> $D/agenda.log 2>&1"
B_CMD="$D/verifica-fila.sh >> $D/agenda.log 2>&1"
GOODA="10 3 * * 1 $A_CMD"
GOODB="*/15 8-18 * * 1-5 $B_CMD"
try() { crontab_caso "$3" "$4"; chk "$1" "$2"; }
try PASS "solução (10 3 * * 1)"                              "$GOODA" "$GOODB"
try PASS "dia da semana por nome (mon, mon-fri)"             "10 3 * * mon $A_CMD" "*/15 8-18 * * mon-fri $B_CMD"
try PASS "dias da semana em lista 1,2,3,4,5"                 "$GOODA" "*/15 8-18 * * 1,2,3,4,5 $B_CMD"
try PASS "dia do mês */1 (curinga com passo: E, só segunda)" "10 3 */1 * 1 $A_CMD" "$GOODB"
try PASS "mês 1-12, Mon e jan-dec/Mon-Fri com maiúsculas"    "10 3 * 1-12 Mon $A_CMD" "*/15 8-18 * jan-dec Mon-Fri $B_CMD"
try PASS "minutos em lista 0,15,30,45"                       "$GOODA" "0,15,30,45 8-18 * * 1-5 $B_CMD"
try PASS "ordem das linhas trocada"                          "$GOODB" "$GOODA"
try FAIL "ADVERSARIAL A: dia do mês 1-31 + segunda (OU: roda todo dia)"  "10 3 1-31 * 1 $A_CMD" "$GOODB"
try FAIL "ADVERSARIAL B: dia do mês 1-31 + seg-sex (OU: roda todo dia)"  "$GOODA" "*/15 8-18 1-31 * 1-5 $B_CMD"
try FAIL "A: dia da semana 0-6 (todo dia) em vez de segunda" "10 3 * * 0-6 $A_CMD" "$GOODB"
try FAIL "A: hora errada"                                    "10 4 * * 1 $A_CMD" "$GOODB"
try FAIL "B: sem dia da semana (todo dia)"                   "$GOODA" "*/15 8-18 * * * $B_CMD"
try FAIL "B: redirecionamento > (apaga o log)"               "$GOODA" "*/15 8-18 * * 1-5 $D/verifica-fila.sh > $D/agenda.log 2>&1"
crontab -u aluno -r 2>/dev/null
