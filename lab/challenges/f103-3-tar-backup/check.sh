#!/bin/bash
source /opt/lab/lib.sh
ST=/root/.lab-state/f103-3-tar-backup
d="$LAB_DIR/f103-3-tar-backup"
bk="$d/backup-$P_proj.tar.gz"

# ---- parte 1: backup compactado ----
if [ ! -f "$bk" ]; then
  fail "o arquivo backup-$P_proj.tar.gz não existe em ~/lab/f103-3-tar-backup"
else
  if gzip -t "$bk" 2>/dev/null && tar -tzf "$bk" >/dev/null 2>&1; then
    ok "backup-$P_proj.tar.gz é um tar compactado com gzip e legível"
    lista=$(tar -tzf "$bk" 2>/dev/null)
    if echo "$lista" | grep -qE '^(/|\.\./|\./)' ; then fail "os caminhos dentro do arquivo não devem começar com / , ./ ou ../ (use caminhos relativos a partir de $P_proj/)"
    elif echo "$lista" | grep -vE "^$P_proj(/|$)" | grep -q .; then fail "o arquivo contém itens fora da pasta $P_proj/"
    else ok "os caminhos dentro do arquivo começam em $P_proj/"; fi
    tmp=$(mktemp -d)
    tar -xzf "$bk" -C "$tmp" 2>/dev/null
    obt=$(cd "$tmp" && find . -type f -printf '%P\n' | LC_ALL=C sort)
    esp=$(awk '{ $1=""; sub(/^ +/, ""); print }' "$ST/hashes" | LC_ALL=C sort)
    if [ "$obt" = "$esp" ]; then ok "o backup contém exatamente os arquivos esperados (sem *.tmp e sem logs/, com o arquivo oculto)"
    else
      extra=$(comm -13 <(echo "$esp") <(echo "$obt") | wc -l | tr -d ' ')
      falta=$(comm -23 <(echo "$esp") <(echo "$obt") | wc -l | tr -d ' ')
      fail "conteúdo do backup incorreto: $falta arquivo(s) faltando e $extra a mais (lembre: sem *.tmp, sem a pasta logs; e não esqueça os arquivos ocultos)"
    fi
    hobt=$(cd "$tmp" && find . -type f -print0 | xargs -0 -r sha256sum | sed 's#  \./#  #' | LC_ALL=C sort -k2)
    hesp=$(LC_ALL=C sort -k2 "$ST/hashes")
    [ "$obt" = "$esp" ] && expect_eq "o conteúdo dos arquivos do backup é o original" "$hobt" "$hesp"
    rm -rf "$tmp"
  else
    fail "backup-$P_proj.tar.gz não é um tar compactado com gzip válido (use a compactação gzip, .tar.gz)"
  fi
fi

# ---- parte 2: restaurar um único arquivo ----
r="$d/restaurado/site/conf/$P_arq"
if [ -f "$r" ]; then
  expect_eq "restaurado/site/conf/$P_arq extraído com o conteúdo correto" "$(sha256sum "$r" | cut -d' ' -f1)" "$(cat "$ST/restaurado.sha")"
else
  fail "restaurado/site/conf/$P_arq não existe (extraia mantendo o caminho do arquivo dentro do pacote)"
fi
n=$(find "$d/restaurado" -type f | wc -l | tr -d ' ')
expect_eq "só esse arquivo foi extraído em restaurado/" "$n" "1"
expect "legado.tar.$P_comp continua intacto" tar -tf "$d/legado.tar.$P_comp"
finish
