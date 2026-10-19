#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-6-nice-renice
# como o aluno: o container não tem CAP_SYS_NICE, então nem o root reprioriza processos de outro usuário
as_aluno_nice() { setpriv --reuid=aluno --regid=aluno --clear-groups "$@"; }
as_aluno_nice renice -n "$P_n1" -p "$(cat "$ST/pid")" >/dev/null
cd "$LAB_DIR/f103-6-nice-renice"
setsid setpriv --reuid=aluno --regid=aluno --clear-groups nice -n "$P_n2" "./lote-$P_job.sh" </dev/null >/dev/null 2>&1 &
sleep 0.5
