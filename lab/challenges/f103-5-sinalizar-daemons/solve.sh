#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-5-sinalizar-daemons
kill -HUP "$(cat "$ST/pid.$P_d1")"
kill -TERM "$(cat "$ST/pid.$P_d2")"
sleep 1
