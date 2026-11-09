# E-01: o mesmo problema do OU entre dia do mês e dia da semana, no cron do sistema (/etc/cron.d).
ID=f107-2-cron-d-sistema
P=(robo=rob-relatorio script=fecha-caixa.sh d1=1 d2=15 hora=3 minuto=10 m1=2 m2=8)
F=/etc/cron.d/tarefa-rob-relatorio
lab_setup
C="rob-relatorio /usr/local/bin/fecha-caixa.sh"
try() { printf '%s\n' "$3" > $F; chmod 644 $F; chk "$1" "$2"; }
try PASS "solução (10 3 1,15 2-8 *)"                 "10 3 1,15 2-8 * $C"
try PASS "dia da semana */1 (curinga com passo)"     "10 3 1,15 2-8 */1 $C"
try PASS "meses por nome feb-aug"                    "10 3 1,15 feb-aug * $C"
try PASS "meses em lista"                            "10 3 15,1 2,3,4,5,6,7,8 * $C"
try FAIL "ADVERSARIAL: dia da semana 0-6 (OU: roda todo dia dos meses)"  "10 3 1,15 2-8 0-6 $C"
try FAIL "ADVERSARIAL: dia da semana 0-7"            "10 3 1,15 2-8 0-7 $C"
try FAIL "ADVERSARIAL: dia da semana sun-sat"        "10 3 1,15 2-8 sun-sat $C"
try FAIL "dia da semana só segunda"                  "10 3 1,15 2-8 1 $C"
try FAIL "mês final errado"                          "10 3 1,15 2-9 * $C"
try FAIL "usuário errado (root)"                     "10 3 1,15 2-8 * root /usr/local/bin/fecha-caixa.sh"
try FAIL "dia do mês errado"                         "10 3 1,16 2-8 * $C"
try FAIL "campo inválido (mês 13)"                   "10 3 1,15 2-13 * $C"
