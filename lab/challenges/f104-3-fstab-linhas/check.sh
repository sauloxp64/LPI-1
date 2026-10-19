#!/bin/bash
source /opt/lab/lib.sh
d=$LAB_DIR/fstab
f=$d/fstab.novo
if [ ! -f "$f" ]; then fail "o arquivo ~/lab/fstab/fstab.novo não existe"; finish; exit; fi

sonda() { blkid -p -o export "$1" 2>/dev/null | sed -n "s/^$2=//p" | head -1; }
uuid_ext=$(sonda "$d/$P_dados.img" UUID)
uuid_swp=$(sonda "$d/$P_swp.img" UUID)

# lê só as linhas úteis (sem comentários e linhas em branco)
mapfile -t linhas < <(sed 's/#.*//' "$f" | awk 'NF')
[ "${#linhas[@]}" -ge 3 ] || { fail "esperava 3 entradas no fstab.novo (encontrei ${#linhas[@]})"; finish; exit; }

# acha a linha pelo ponto de montagem (2º campo)
acha() { local l; for l in "${linhas[@]}"; do set -- $l; [ "$2" = "$PM" ] && { echo "$l"; return; }; done; }
tira_aspas() { local v=${1//\"/}; echo "${v//\'/}"; }
# spec_ok <TIPO UUID|LABEL> <valor_esperado> <spec_do_fstab>
spec_ok() {
  local tipo=$1 esp=${2,,} spec; spec=$(tira_aspas "$3"); spec=${spec,,}
  case $tipo in
    UUID)  [ "$spec" = "uuid=$esp" ] || [ "$spec" = "/dev/disk/by-uuid/$esp" ] ;;
    LABEL) [ "$spec" = "label=$esp" ] || [ "$spec" = "/dev/disk/by-label/$esp" ] ;;
  esac
}
tem_opcoes() {   # tem_opcoes "lista,de,opcoes" req1 req2...   (todas devem estar presentes)
  local lista=",$1,"; shift; local o; for o in "$@"; do [[ "$lista" == *",$o,"* ]] || return 1; done
}
analisa() {   # analisa <rotulo> <linha> <tipo_spec> <valor_spec> <fstype> <opcoes_obrigatorias> <dump> <pass> [ou_defaults]
  local rot=$1 linha=$2 ts=$3 vs=$4 fst=$5 opts=$6 dump=$7 pas=$8 erros=""
  if [ -z "$linha" ]; then fail "$rot: não encontrei a entrada para este ponto de montagem"; return; fi
  set -- $linha
  [ $# -eq 6 ] || { fail "$rot: cada entrada do fstab precisa ter exatamente 6 campos (encontrei $#)"; return; }
  spec_ok "$ts" "$vs" "$1" || erros="$erros dispositivo (deve identificar o sistema de arquivos por $ts);"
  [ "$3" = "$fst" ] || erros="$erros tipo de sistema de arquivos;"
  tem_opcoes "$4" ${opts//,/ } || erros="$erros opções;"
  [ "$5" = "$dump" ] || erros="$erros campo dump;"
  [ "$6" = "$pas" ] || erros="$erros campo pass (ordem do fsck);"
  if [ -z "$erros" ]; then ok "$rot: entrada correta"; else fail "$rot: confira —$erros"; fi
}

# 1) ext4 por UUID
PM=$P_pt_dados; l1=$(acha)
analisa "ext4 em $P_pt_dados" "$l1" UUID "$uuid_ext" ext4 "defaults,$P_opt1" 0 2
# 2) vfat por LABEL, montável por usuário e não automático
PM=/media/$P_pt_usb; l2=$(acha)
analisa "vfat em /media/$P_pt_usb" "$l2" LABEL "$P_lbl_usb" vfat "noauto,user,$P_opt2" 0 0
if [ -n "$l2" ]; then set -- $l2; if [[ ",$4," == *",users,"* ]]; then fail "vfat: 'users' deixa qualquer usuário desmontar; o enunciado pede só 'user'"; fi; fi
# 3) swap por UUID
PM=none; l3=$(acha)
if [ -n "$l3" ]; then
  set -- $l3
  if [[ ",$4," == *",sw,"* ]] || [[ ",$4," == *",defaults,"* ]]; then analisa "swap" "$l3" UUID "$uuid_swp" swap "$(tem_opcoes "$4" sw && echo sw || echo defaults)" 0 0
  else fail "swap: a opção da área de troca está incorreta"; fi
else fail "swap: não encontrei a entrada (ponto de montagem 'none')"; fi
finish
