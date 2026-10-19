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
  -t fontSize=16 -t cursorBlink=true -t 'titleFixed=Laboratório LPIC-1' \
  -t 'theme={"background":"#0b0f17","foreground":"#e6ebf5","cursor":"#34d399","selectionBackground":"#243049"}' \
  su -l aluno
