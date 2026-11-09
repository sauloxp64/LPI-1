#!/usr/bin/env bash
# OCR de um PDF escaneado (só imagem) para torná-lo pesquisável na aba Material.
# Roda tudo dentro de um container Docker descartável (poppler + tesseract em português): nada é instalado no seu computador.
#   scripts/ocr-pdf.sh "Meu Livro.pdf"
# Gera "Meu Livro.ocr.txt" ao lado do PDF (páginas separadas por \f). O app usa esse arquivo automaticamente na busca.
# O texto gerado é derivado de material de terceiros: não é versionado (veja .gitignore).
# O resultado só substitui um "Meu Livro.ocr.txt" anterior depois que TODAS as páginas passaram pelo OCR; se alguma
# página falhar, o script termina com erro e o arquivo anterior fica intacto.
set -euo pipefail
pdf="${1:?uso: scripts/ocr-pdf.sh arquivo.pdf}"
[ -f "$pdf" ] || { echo "arquivo não encontrado: $pdf" >&2; exit 1; }
dir="$(cd "$(dirname "$pdf")" && pwd)"
file="$(basename "$pdf")"
hostdir="$dir"
if command -v cygpath >/dev/null 2>&1; then hostdir="$(cygpath -m "$dir")"; fi   # Git Bash/Windows: caminho no formato C:/...
base="$(printf '%s' "$file" | sed -E 's/\.[pP][dD][fF]$//')"   # tira .pdf/.PDF (o índice do app usa a mesma regra, sem diferenciar caixa)
out="${base}.ocr.txt"
parcial=".ocr-parcial.${out}"   # temporário no mesmo diretório do destino (o rename final é atômico); termina em .ocr.txt, então o .gitignore o cobre
trap 'rm -f "$dir/$parcial"' EXIT
echo "OCR de '$file' (pode levar alguns minutos)..."
MSYS_NO_PATHCONV=1 docker run --rm -v "$hostdir:/work" -e FILE="$file" -e OUT="$out" -e PARCIAL="$parcial" debian:bookworm-slim bash -c '
  set -euo pipefail
  apt-get update -qq >/dev/null
  apt-get install -y -qq --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-por >/dev/null
  tmp=$(mktemp -d)
  trap "rm -rf \"$tmp\" \"/work/$PARCIAL\"" EXIT
  cd "$tmp"
  pdftoppm -r 200 -gray "/work/$FILE" pg
  ls pg-*.pgm >/dev/null 2>&1 || { echo "erro: o pdftoppm não gerou nenhuma página" >&2; exit 1; }
  : > "/work/$PARCIAL"
  for f in pg-*.pgm; do
    n=${f#pg-}; n=$((10#${n%.pgm}))
    # cada página vai para um arquivo próprio e só entra no resultado se o tesseract terminar bem
    # (se o modo com detecção de orientação falhar, tenta mais uma vez sem ela)
    if ! tesseract "$f" stdout -l por --psm 1 >"$tmp/txt" 2>"$tmp/erro"; then
      if ! tesseract "$f" stdout -l por --psm 3 >"$tmp/txt" 2>>"$tmp/erro"; then
        echo "erro: o tesseract falhou na página $n:" >&2
        tail -n 5 "$tmp/erro" >&2
        exit 1
      fi
    fi
    cat "$tmp/txt" >> "/work/$PARCIAL"
    printf "\f" >> "/work/$PARCIAL"
  done
  mv -f "/work/$PARCIAL" "/work/$OUT"
' || { echo "OCR falhou: o resultado parcial foi descartado e o '$out' anterior (se havia) foi preservado." >&2; exit 1; }
echo "pronto: $dir/$out ($(grep -c . "$dir/$out" || true) linhas de texto)"
