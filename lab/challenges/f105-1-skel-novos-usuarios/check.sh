#!/bin/bash
source /opt/lab/lib.sh
u=lab105b
drop_user "$u"
useradd -m -s /bin/bash "$u" 2>/dev/null
h=/home/$u
if [ ! -d "$h" ]; then fail "erro interno: não consegui criar a conta de teste"; finish; exit; fi
amostra=$(mktemp -d); chmod 755 "$amostra"
for i in 1 2 3; do head -c $((i * 900)) /dev/zero > "$amostra/arq$i.dat"; touch -d "2025-0$i-1$i 10:00" "$amostra/arq$i.dat"; done
chmod -R a+rX "$amostra"
interativo() {   # bash interativo novo (não de login) do usuário de teste
  local c; c=$(printf '%q' "$1")
  su -s /bin/bash "$u" -c "cd '$amostra' && env -i HOME=$h PATH=/usr/bin:/bin TERM=dumb bash -ic $c 2>/dev/null"
}

# 1) pasta no modelo
if [ -d "$h/$P_dir" ] && [ "$(stat -c %U "$h/$P_dir")" = "$u" ]; then ok "uma conta nova já nasce com a pasta ~/$P_dir (pertencendo ao novo usuário)"
else fail "uma conta nova (useradd -m) não recebeu a pasta ~/$P_dir"; fi
# 2) arquivo com conteúdo
if [ -f "$h/LEIA-ME.txt" ] && grep -qx "Equipe: $P_equipe" "$h/LEIA-ME.txt"; then ok "uma conta nova recebe ~/LEIA-ME.txt com a linha 'Equipe: $P_equipe'"
else fail "uma conta nova não recebeu ~/LEIA-ME.txt com a linha exata 'Equipe: $P_equipe'"; fi
# 3) alias no .bashrc modelo
esperado=$(cd "$amostra" && ls $P_opcao)
obtido=$(interativo "$P_apelido")
if [ -n "$obtido" ] && [ "$obtido" = "$esperado" ]; then ok "numa conta nova o alias '$P_apelido' funciona (executa 'ls $P_opcao')"
else fail "numa conta nova o alias '$P_apelido' não funciona em um bash interativo"; fi
# 4) umask nos logins
um=$(su -l "$u" -c umask 2>/dev/null)
if [ "$um" = "0$P_umask" ]; then ok "numa conta nova o shell de login já começa com umask $P_umask"
else fail "numa conta nova a umask do shell de login é '$um' (esperado: 0$P_umask)"; fi
# 5) o modelo original não foi destruído
if grep -q 'HISTSIZE=1000' "$h/.bashrc" && grep -q 'case \$- in' "$h/.bashrc" && grep -q 'bashrc' "$h/.profile"; then ok "os arquivos .bashrc e .profile originais continuam presentes no modelo (você acrescentou, não substituiu)"
else fail "o conteúdo original do .bashrc/.profile do modelo foi perdido: acrescente suas linhas em vez de substituir o arquivo"; fi
drop_user "$u"; rm -rf "$amostra"
finish
