#!/bin/bash
source /opt/lab/lib.sh
d=$(fresh_dir releases)
a=$d/$P_app
for v in "$P_antiga" "$P_nova"; do
  mkdir -p "$a/versoes/$v/bin"
  printf '#!/bin/bash\necho "%s versao %s"\n' "$P_app" "$v" > "$a/versoes/$v/bin/$P_app"
  chmod 755 "$a/versoes/$v/bin/$P_app"
  echo "Manual da versao $v" > "$a/versoes/$v/README"
done
mkdir -p "$a/config" "$a/docs"
ln -s "versoes/$P_antiga" "$a/atual"                                # link relativo, aponta para a versão antiga
ln -s "../versoes/0.9.9/etc/app.conf" "$a/config/legado.conf"       # QUEBRADO (versão 0.9.9 foi removida)
ln -s "$a/versoes/0.9.9" "$a/docs/antigo"                           # QUEBRADO (absoluto)
ln -s "../versoes/$P_nova/README" "$a/docs/manual"                  # válido: não pode ser removido
chown -R -h aluno:aluno "$d"
echo "cenário pronto em $a"
