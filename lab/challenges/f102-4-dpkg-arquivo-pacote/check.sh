#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/pacotes
pkg=$(dpkg-query -S "$P_arquivo" 2>/dev/null | head -1 | sed 's/: .*//; s/:amd64$//')
if [ -z "$pkg" ]; then fail "erro interno: $P_arquivo não pertence a nenhum pacote"; finish; exit; fi

# 1) pacote dono do arquivo
if [ -f "$d/pacote.txt" ]; then
  got=$(tr -d '[:space:]' < "$d/pacote.txt" | sed 's/:amd64$//')
  expect_eq "pacote.txt traz o pacote dono de $P_arquivo" "$got" "$pkg"
else fail "o arquivo ~/lab/pacotes/pacote.txt não existe"; fi

# 2) versão instalada
ver=$(dpkg-query -W -f='${Version}' "$pkg" 2>/dev/null)
if [ -f "$d/versao.txt" ]; then
  got=$(tr -d '[:space:]' < "$d/versao.txt")
  expect_eq "versao.txt traz a versão instalada do pacote" "$got" "$ver"
else fail "o arquivo ~/lab/pacotes/versao.txt não existe"; fi

# 3) lista de arquivos do pacote (aceita a saída do dpkg -L, com ou sem os diretórios)
if [ -f "$d/arquivos.txt" ]; then
  dpkg-query -L "$pkg" 2>/dev/null | grep -v '^/\.$' | sort -u > /tmp/.lab-f102-4-todos
  while IFS= read -r p; do { [ -d "$p" ] && [ ! -L "$p" ]; } || echo "$p"; done < /tmp/.lab-f102-4-todos | sort -u > /tmp/.lab-f102-4-arqs
  sed 's/[[:space:]]*$//; /^$/d; /^\/\.$/d' "$d/arquivos.txt" | sort -u > /tmp/.lab-f102-4-aluno
  faltam=$(comm -23 /tmp/.lab-f102-4-arqs /tmp/.lab-f102-4-aluno | wc -l)
  sobram=$(comm -13 /tmp/.lab-f102-4-todos /tmp/.lab-f102-4-aluno | wc -l)
  if [ "$faltam" -eq 0 ]; then ok "arquivos.txt lista todos os arquivos do pacote"; else fail "arquivos.txt está incompleto: faltam $faltam arquivo(s) do pacote"; fi
  if [ "$sobram" -eq 0 ]; then ok "arquivos.txt não lista nada que não seja do pacote"; else fail "arquivos.txt tem $sobram linha(s) que não pertencem ao pacote"; fi
  rm -f /tmp/.lab-f102-4-*
else fail "o arquivo ~/lab/pacotes/arquivos.txt não existe"; fi
finish
