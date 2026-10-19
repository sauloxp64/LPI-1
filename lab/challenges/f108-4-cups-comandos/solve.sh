#!/bin/bash
source /opt/lab/lib.sh
case "$P_opcao" in
  duplex) o=sides=two-sided-long-edge;;
  a4) o=media=A4;;
  paisagem) o=landscape;;
  ajustar) o=fit-to-page;;
esac
cat > "$LAB_DIR/impressao/comandos.txt" <<X
lp -d $P_impressora -n $P_copias -o $o ~/lab/impressao/$P_arquivo
lprm -P $P_impressora $P_job
lpq -P $P_impressora
lpoptions -d $P_impressora
X
chown aluno:aluno "$LAB_DIR/impressao/comandos.txt"
