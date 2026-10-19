#!/bin/bash
source /opt/lab/lib.sh
img=$LAB_DIR/particoes-mbr/$P_disco.img
truncate -s "${P_tam}M" "$img"
{
  echo "label: dos"
  echo ",${P_p1}M,L,*"
  echo ",${P_p2}M,S"
  echo ",,E"
  for i in $(seq "$P_n"); do echo ",${P_l}M,L"; done
} | sfdisk -q "$img"
chown aluno:aluno "$img"
