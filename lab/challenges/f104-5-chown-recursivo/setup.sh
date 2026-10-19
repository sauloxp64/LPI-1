#!/bin/bash
source /opt/lab/lib.sh
est=/var/lib/lab-state/f104-5-chown-recursivo
rm -rf "$est"; mkdir -p "$est"
for u in valmir wanda xavier yara zeca; do drop_user "$u"; done
for g in contab juridico logistica comercial; do drop_group "$g"; done
groupadd "$P_grupo"
useradd -M -s /usr/sbin/nologin -g "$P_grupo" "$P_usuario"
d=$(fresh_dir "$P_pasta")
# árvore "restaurada de backup": tudo do root, com modos variados e aleatórios
subs=(docs planilhas scripts relatorios)
nomes=(balanco extrato contrato inventario folha pedidos cadastro previsao conciliacao fluxo)
mkdir -p "$d/${subs[0]}" "$d/${subs[1]}" "$d/${subs[2]}" "$d/${subs[3]}/arquivo-morto"
n=0
for sub in "${subs[@]}" "relatorios/arquivo-morto"; do
  for i in 1 2 3; do
    nome=$(shuf -n1 -e "${nomes[@]}")-$RANDOM
    if [ "$sub" = scripts ]; then ext=sh; else ext=$(shuf -n1 -e txt csv dat); fi
    f="$d/$sub/$nome.$ext"
    if [ "$ext" = sh ]; then printf '#!/bin/bash\necho "%s"\n' "$nome" > "$f"; else printf 'registro %s;%s;%s\n' "$nome" "$RANDOM" "$RANDOM" > "$f"; fi
    if [ "$ext" = sh ]; then modo=$(shuf -n1 -e 755 775 777 750); else modo=$(shuf -n1 -e 644 664 666 640 600 660); fi
    chmod "$modo" "$f"
  done
done
printf 'LEIA-ME %s\n' "$RANDOM" > "$d/LEIA-ME.txt"; chmod 644 "$d/LEIA-ME.txt"
for dd in "$d" "$d"/*/ "$d"/relatorios/arquivo-morto; do chmod "$(shuf -n1 -e 755 775 777 750)" "$dd"; done
chown -R root:root "$d"
chmod 755 "$LAB_DIR"
# guarda os modos originais (para conferir que dono/grupo não perdem permissões)
find "$d" -printf '%P|%m\n' > "$est/modos"
echo "cenário pronto em $d"
