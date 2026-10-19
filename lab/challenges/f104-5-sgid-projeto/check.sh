#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/projetos
p=$d/$P_proj
if [ ! -d "$p" ]; then fail "a pasta ~/lab/projetos/$P_proj não existe"; finish; exit; fi

# --- estado dos itens que já existiam ---
n=$(find "$p" ! -group "$P_grupo" | wc -l)
if [ "$n" -eq 0 ]; then ok "todo o conteúdo de $P_proj pertence ao grupo $P_grupo"; else fail "$n item(ns) dentro de $P_proj ainda não pertencem ao grupo $P_grupo"; fi
n=$(find "$p" -type d ! -perm 2770 | wc -l)
if [ "$n" -eq 0 ]; then ok "todas as pastas: dono e grupo com acesso total, outros nenhum, SGID ligado"; else fail "$n pasta(s) fora do padrão pedido (acesso de dono/grupo/outros e bit SGID): confira com ls -ld"; fi
n=$(find "$p" -type f \( -perm /7111 -o -perm /007 -o ! -perm -660 \) | wc -l)
if [ "$n" -eq 0 ]; then ok "os arquivos existentes: dono e grupo leem e escrevem, outros nada, sem bits de execução nem especiais"; else fail "$n arquivo(s) com permissões incorretas (esperado: dono e grupo rw, outros nada, sem bits de execução nem SUID/SGID)"; fi

# --- umask ---
if [ -f "$d/umask.txt" ]; then
  u=$(tr -d '[:space:]' < "$d/umask.txt")
  if [[ "$u" =~ ^0*07$ ]] || [ "$u" = "u=rwx,g=rwx,o=" ]; then ok "umask.txt: 007 (novos arquivos 660, novas pastas 770)"
  else fail "umask.txt = '$u': essa máscara não gera 660 em arquivos novos e 770 em pastas novas"; fi
else fail "o arquivo ~/lab/projetos/umask.txt não existe"; fi

# --- comportamento real: dois membros e um estranho ---
chmod o+x /home/aluno "$LAB_DIR" 2>/dev/null
t="$p/.chk-arquivo"; td="$p/.chk-pasta"
rm -rf "$t" "$td"
if su -s /bin/bash "$P_u1" -c "umask 007; echo teste > '$t' && mkdir '$td' && echo x > '$td/dentro'" 2>/dev/null; then
  ok "o membro $P_u1 consegue criar arquivos e pastas dentro do projeto"
  expect_eq "arquivo novo criado por $P_u1 nasce com o grupo $P_grupo (SGID herdado)" "$(stat -c %G "$t")" "$P_grupo"
  expect_eq "arquivo novo criado com umask 007 fica 660" "$(stat -c %a "$t")" "660"
  g=$(stat -c %G "$td"); m=$(stat -c %a "$td")
  if [ "$g" = "$P_grupo" ] && [ "$m" = "2770" ]; then ok "pasta nova herda o grupo e o bit SGID"; else fail "pasta nova criada por $P_u1 ficou com grupo $g e modo $m (esperado: grupo $P_grupo herdado e SGID ligado)"; fi
  if su -s /bin/bash "$P_u2" -c "echo mais >> '$t' && echo mais >> '$td/dentro'" 2>/dev/null; then ok "o membro $P_u2 consegue editar o que $P_u1 criou"; else fail "o membro $P_u2 não consegue editar o que $P_u1 criou"; fi
else
  fail "o membro $P_u1 não consegue criar arquivos/pastas no projeto (grupo e permissões da pasta estão corretos?)"
fi
rm -rf "$t" "$td"
if su -s /bin/bash "$P_u3" -c "ls '$p' >/dev/null 2>&1 || cat '$p/plano.txt' >/dev/null 2>&1" ; then
  fail "o usuário $P_u3, que não é do grupo, ainda consegue listar ou ler o projeto"
else ok "o usuário $P_u3 (fora do grupo) não acessa o projeto"; fi
finish
