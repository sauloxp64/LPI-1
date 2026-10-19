#!/bin/bash
source /opt/lab/lib.sh
# encerra listeners nc de execuções anteriores
pkill -u aluno -x nc 2>/dev/null
d=$(fresh_dir diagrede)
echo "cenário pronto: pasta $d"
