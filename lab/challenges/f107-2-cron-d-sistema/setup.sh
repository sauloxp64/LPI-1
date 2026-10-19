#!/bin/bash
source /opt/lab/lib.sh
# limpa execuções anteriores: arquivos de cron.d que mencionam qualquer script deste desafio
for s in fecha-caixa.sh concilia-faturas.sh confere-estoque.sh gera-balancete.sh; do
  grep -l "/usr/local/bin/$s" /etc/cron.d/* 2>/dev/null | xargs -r rm -f
  rm -f "/usr/local/bin/$s"
done
for r in rob-relatorio rob-faturas rob-conciliacao rob-estoque; do drop_user "$r"; drop_group "$r"; rm -rf "/var/lib/$r"; done
useradd -r -M -d "/var/lib/$P_robo" -s /usr/sbin/nologin "$P_robo"
mkdir -p "/var/lib/$P_robo"; chown "$P_robo:$P_robo" "/var/lib/$P_robo"; chmod 750 "/var/lib/$P_robo"
cat > "/usr/local/bin/$P_script" <<SCR
#!/bin/sh
# rotina agendada: grava quem executou
echo "usuario=\$(id -un)" > /var/lib/$P_robo/ultima-execucao.txt
SCR
chmod 755 "/usr/local/bin/$P_script"; chown root:root "/usr/local/bin/$P_script"
echo "cenário pronto: script /usr/local/bin/$P_script e usuário $P_robo"
