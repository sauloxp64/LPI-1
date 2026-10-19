#!/bin/bash
# Inicia os serviços auxiliares do laboratório e o terminal web.
set -u
mkdir -p /home/aluno/lab && chown aluno:aluno /home/aluno/lab
grep -q 'LANG=pt_BR' /home/aluno/.profile 2>/dev/null || echo 'export LANG=pt_BR.UTF-8 LANGUAGE=pt_BR:pt' >> /home/aluno/.profile

# serviços usados nos exercícios (cron, at, rsyslog) — sem systemd
cron 2>/dev/null || true
atd 2>/dev/null || true
rsyslogd 2>/dev/null || true

# verificador dos desafios (só rede interna)
python3 /opt/lab/checker/server.py &

# terminal web: shell de login do usuário "aluno" (sudo sem senha).
# Só a rede interna do compose alcança a porta 7681: o app web faz o proxy em /terminal/ (checando Host e Origin).
# -O recusa WebSocket de outra origem; -b é o prefixo usado pelo proxy; -m limita as conexões simultâneas.
exec ttyd -p 7681 -W -O -b /terminal -m 3 \
  -t fontSize=15 -t cursorBlink=true -t 'titleFixed=Laboratório LPIC-1' \
  -t 'theme={"background":"#1a1f21","foreground":"#d3d7cf","cursor":"#7aa7d9","cursorAccent":"#1a1f21","selectionBackground":"#384144","black":"#2e3436","red":"#cc0000","green":"#4e9a06","yellow":"#c4a000","blue":"#5f8fc9","magenta":"#75507b","cyan":"#06989a","white":"#d3d7cf","brightBlack":"#555753","brightRed":"#ef2929","brightGreen":"#8ae234","brightYellow":"#fce94f","brightBlue":"#729fcf","brightMagenta":"#ad7fa8","brightCyan":"#34e2e2","brightWhite":"#eeeeec"}' \
  su -l aluno
