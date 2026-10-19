#!/bin/bash
source /opt/lab/lib.sh
RANDOM=$P_semente
d=$(fresh_dir suid)
t=$d/arvore
mkdir -p "$t"
names=(rotaciona-log varre-tmp copia-segura fecha-turno envia-alerta atualiza-cache gera-chave limpa-fila testa-disco abre-porta lista-sessao conecta-banco empacota agenda-job mede-rede verifica-sha revisa-grupo troca-senha ajusta-hora exporta-csv)
# embaralha (Fisher-Yates com a semente)
for ((i = ${#names[@]} - 1; i > 0; i--)); do j=$((RANDOM % (i + 1))); tmp=${names[i]}; names[i]=${names[j]}; names[j]=$tmp; done
sel=("${names[@]:0:14}")
modes=(4755 4755 4750 2755 2755 2750 6755 755 755 755 755 644 644 640)
for ((i = ${#modes[@]} - 1; i > 0; i--)); do j=$((RANDOM % (i + 1))); tmp=${modes[i]}; modes[i]=${modes[j]}; modes[j]=$tmp; done
dirs=(bin sbin opt/tools usr/local/sbin)
owners=(root:root aluno:aluno root:root aluno:aluno root:root)
orig=/var/lib/lab-state/f110-1-suid.orig
mkdir -p /var/lib/lab-state; : > "$orig"
make() { # nome modo
  local sub=${dirs[RANDOM % ${#dirs[@]}]} own=${owners[RANDOM % ${#owners[@]}]}
  mkdir -p "$t/$sub"
  printf '#!/bin/sh\necho "%s"\n' "$1" > "$t/$sub/$1"
  chown "$own" "$t/$sub/$1"
  chmod "$2" "$t/$sub/$1"
  printf '%04d %s\n' "$2" "$sub/$1" >> "$orig"
}
for ((i = 0; i < ${#sel[@]}; i++)); do make "${sel[i]}" "${modes[i]}"; done
alvo_mode=(6755 6750); make "$P_alvo" "${alvo_mode[RANDOM % 2]}"
# diretórios com SGID e sticky (não entram nas listas)
mkdir -p "$t/dados-grupo" "$t/tmp-compartilhado"
chown aluno:aluno "$t/dados-grupo" "$t/tmp-compartilhado"
chmod 2775 "$t/dados-grupo"; chmod 1777 "$t/tmp-compartilhado"
chown aluno:aluno "$d" "$t"
# diretórios intermediários também do aluno (para ele listar)
find "$t" -type d -exec chown aluno:aluno {} +
echo "cenário pronto: árvore em $t"
