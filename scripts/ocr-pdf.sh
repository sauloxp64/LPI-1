#!/usr/bin/env bash
# OCR de um PDF escaneado (só imagem) para torná-lo pesquisável na aba Material.
# Roda tudo dentro de um container Docker descartável (poppler + tesseract em português): nada é instalado no seu computador.
#   scripts/ocr-pdf.sh "Meu Livro.pdf"
# Gera "Meu Livro.ocr.txt" ao lado do PDF (páginas separadas por \f). O app usa esse arquivo automaticamente na busca.
# O texto gerado é derivado de material de terceiros: não é versionado (veja .gitignore).
set -euo pipefail
pdf="${1:?uso: scripts/ocr-pdf.sh arquivo.pdf}"
[ -f "$pdf" ] || { echo "arquivo não encontrado: $pdf" >&2; exit 1; }
dir="$(cd "$(dirname "$pdf")" && pwd)"
file="$(basename "$pdf")"
hostdir="$dir"
if command -v cygpath >/dev/null 2>&1; then hostdir="$(cygpath -m "$dir")"; fi   # Git Bash/Windows: caminho no formato C:/...
out="${file%.pdf}.ocr.txt"
echo "OCR de '$file' (pode levar alguns minutos)..."
MSYS_NO_PATHCONV=1 docker run --rm -v "$hostdir:/work" -e FILE="$file" -e OUT="$out" debian:bookworm-slim bash -c '
  set -e
  apt-get update -qq >/dev/null
  apt-get install -y -qq --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-por >/dev/null
  mkdir /tmp/pg && cd /tmp/pg
  pdftoppm -r 200 -gray "/work/$FILE" pg
  : > "/work/$OUT"
  for f in pg-*.pgm; do
    tesseract "$f" stdout -l por --psm 1 2>/dev/null >> "/work/$OUT" || true
    printf "\f" >> "/work/$OUT"
  done
'
echo "pronto: $dir/$out ($(grep -c . "$dir/$out") linhas de texto)"
