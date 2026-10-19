#!/bin/bash
source /opt/lab/lib.sh
cat > "/etc/logrotate.d/app-$P_app" <<X
/var/log/appsrv/$P_app.log {
    $P_freq
    rotate $P_n
    compress
    delaycompress
    missingok
    notifempty
    create $P_modo root adm
}
X
logrotate -d "/etc/logrotate.d/app-$P_app" >/dev/null 2>&1
