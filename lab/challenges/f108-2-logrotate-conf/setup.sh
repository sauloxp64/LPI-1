#!/bin/bash
source /opt/lab/lib.sh
rm -f /etc/logrotate.d/app-vendas /etc/logrotate.d/app-estoque /etc/logrotate.d/app-fiscal /etc/logrotate.d/app-pagamentos /etc/logrotate.d/app-cadastro
rm -rf /var/log/appsrv
mkdir -p /var/log/appsrv
for a in vendas estoque fiscal pagamentos cadastro; do
  : > "/var/log/appsrv/$a.log"
done
# log da aplicação sorteada, com conteúdo (não vazio) e dono/grupo/modo diferentes do pedido
for i in $(seq 1 120); do
  printf '2026-10-%02d %02d:%02d:%02d app=%s evento=%d status=%s\n' $((RANDOM % 28 + 1)) $((RANDOM % 24)) $((RANDOM % 60)) $((RANDOM % 60)) "$P_app" $((RANDOM % 5000)) "$(shuf -n1 -e ok ok ok aviso erro)"
done > "/var/log/appsrv/$P_app.log"
chown root:root /var/log/appsrv/*.log
chmod 644 /var/log/appsrv/*.log
echo "cenário pronto: /var/log/appsrv/$P_app.log (e logs de outras aplicações na mesma pasta)"
