#!/bin/bash
source /opt/lab/lib.sh
# --- limpa execuções anteriores (config do carregador + diretório do cenário) ---
for f in /etc/ld.so.conf.d/*.conf; do
  [ -e "$f" ] && grep -q "$LAB_DIR/bibliotecas" "$f" && rm -f "$f"
done
sed -i "\|$LAB_DIR/bibliotecas|d" /etc/ld.so.conf 2>/dev/null
d=$(fresh_dir bibliotecas)

# programa de origem e biblioteca que ele exige (o nome é trocado por uma variante "fictícia")
case $P_programa in
  bzip2) src=$(command -v bzip2); orig=libbz2.so.1.0; stem=libbz; resto=.so.1.0; sufixo=.4 ;;
  xz)    src=$(command -v xz);    orig=liblzma.so.5; stem=liblzm; resto=.so.5;   sufixo=.4.1 ;;
esac
libsrc=$(readlink -f "$(ldd "$src" | awk -v l="$orig" '$1 == l { print $3 }')")
novo="$stem$P_letra$resto"

# outras letras para as versões "isca" (nomes parecidos, mas diferentes do exigido)
outras=$(echo q k w x v j | tr ' ' '\n' | grep -vx "$P_letra" | shuf -n 2 | tr '\n' ' ')
set -- $outras; iscaA=$1; iscaB=$2

patch() {   # patch <entrada> <saída> <nome_antigo> <nome_novo>
  python3 - "$@" <<'PY'
import sys
ent, sai, antigo, novo = sys.argv[1:5]
dados = open(ent, 'rb').read()
a, n = antigo.encode() + b'\0', novo.encode() + b'\0'
assert len(a) == len(n) and a in dados, 'patch impossível'
open(sai, 'wb').write(dados.replace(a, n))
PY
}

mkdir -p "$d/bin" "$d/$P_pasta" "$d/legado" "$d/testes"
patch "$src"    "$d/bin/$P_apelido"                          "$orig" "$novo"
patch "$libsrc" "$d/$P_pasta/$novo$sufixo"                   "$orig" "$novo"
patch "$libsrc" "$d/legado/$stem$iscaA$resto$sufixo"         "$orig" "$stem$iscaA$resto"
patch "$libsrc" "$d/testes/$stem$iscaB$resto$sufixo"         "$orig" "$stem$iscaB$resto"
ln -s "$novo$sufixo" "$d/$P_pasta/$novo"       # link do soname -> arquivo versionado (como num pacote de verdade)
chmod 755 "$d/bin/$P_apelido" "$d"/*/lib*
chown -R aluno:aluno "$d"
ldconfig
echo "cenário pronto em $d"
