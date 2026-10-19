#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/bibliotecas
bin=$d/bin/$P_apelido
case $P_programa in
  bzip2) novo="libbz$P_letra.so.1.0" ;;
  xz)    novo="liblzm$P_letra.so.5" ;;
esac
dirlib=$(readlink -f "$d/$P_pasta")

# 1) nome da biblioteca que faltava
if [ -f "$d/faltando.txt" ]; then
  got=$(tr -d '[:space:]' < "$d/faltando.txt")
  expect_eq "faltando.txt contém o nome exato da biblioteca ausente" "$got" "$novo"
else
  fail "o arquivo ~/lab/bibliotecas/faltando.txt não existe"
fi

# 2) diretório registrado na configuração do carregador (permanente)
registrado=$(cat /etc/ld.so.conf /etc/ld.so.conf.d/*.conf 2>/dev/null | sed 's/#.*//' | awk 'NF && $1 != "include" { print $1 }' | while read -r x; do readlink -f "$x" 2>/dev/null; done | grep -Fxc "$dirlib")
if [ "$registrado" -ge 1 ]; then ok "o diretório da biblioteca está em /etc/ld.so.conf ou /etc/ld.so.conf.d/*.conf"
else fail "o diretório que contém $novo não consta em /etc/ld.so.conf nem em /etc/ld.so.conf.d/*.conf"; fi

# 3) cache do ldconfig atualizado
linha=$(ldconfig -p | grep -F "$novo " | head -1)
if echo "$linha" | grep -qF "=> $dirlib/"; then ok "o cache do ldconfig (ldconfig -p) aponta $novo para o diretório certo"
else fail "o cache do ldconfig ainda não conhece $novo no diretório certo (o cache foi atualizado?)"; fi

# 4) ldd limpo, sem variáveis de ambiente do estudante
if env -i /usr/bin/ldd "$bin" 2>&1 | grep -q 'not found'; then
  fail "o ldd ainda acusa 'not found' para $P_apelido em um shell limpo (LD_LIBRARY_PATH não conta)"
else ok "ldd não acusa mais bibliotecas ausentes para $P_apelido"; fi

# 5) o programa executa de verdade
if su -s /bin/bash aluno -c "env -i '$bin' --version" >/dev/null 2>&1; then ok "$P_apelido executa normalmente para o usuário aluno"
else fail "$P_apelido ainda não executa (erro ao carregar a biblioteca?)"; fi
finish
