# E-02: opções contraditórias (noauto,user,ro,auto,nouser,rw) e entradas extras/inválidas não podem passar.
ID=f104-3-fstab-linhas
D=/home/aluno/lab/fstab
P=(dados=financas usb=pendrive swp=swap-extra lbl_dados=dados-fin lbl_usb=PENDRIVE lbl_swap=swap-x pt_dados=/srv/dados pt_usb=usb opt1=noatime opt2=ro)
lab_setup
sonda() { blkid -p -o export "$1" 2>/dev/null | sed -n "s/^$2=//p" | head -1; }
UE=$(sonda $D/financas.img UUID); US=$(sonda $D/swap-extra.img UUID)
try() { printf '%b\n' "$3" > $D/fstab.novo; chk "$1" "$2"; }
L1="UUID=$UE /srv/dados ext4 defaults,noatime 0 2"
L2="LABEL=PENDRIVE /media/usb vfat noauto,user,ro 0 0"
L3="UUID=$US none swap sw 0 0"
try PASS "solução original, com comentário"            "# t\n$L1\n$L2\n$L3"
try PASS "ordem das linhas trocada"                    "$L3\n$L1\n$L2"
try PASS "opções reordenadas (noatime,defaults; ro,user,noauto)" "UUID=$UE /srv/dados ext4 noatime,defaults 0 2\nLABEL=PENDRIVE /media/usb vfat ro,user,noauto 0 0\n$L3"
try PASS "opções extras inofensivas"                   "UUID=$UE /srv/dados ext4 defaults,noatime,errors=remount-ro 0 2\nLABEL=PENDRIVE /media/usb vfat noauto,user,ro,utf8,umask=022 0 0\n$L3"
try PASS "tabs, comentário no fim da linha, barra final no ponto" "UUID=$UE\t/srv/dados/\text4\tdefaults,noatime\t0\t2 # dados\n$L2\n\n$L3"
try PASS "UUID por /dev/disk/by-uuid, LABEL por by-label, swap defaults" "/dev/disk/by-uuid/$UE /srv/dados ext4 defaults,noatime 0 2\n/dev/disk/by-label/PENDRIVE /media/usb vfat noauto,user,ro 0 0\nUUID=$US none swap defaults 0 0"
try PASS "UUID entre aspas"                            "UUID=\"$UE\" /srv/dados ext4 defaults,noatime 0 2\n$L2\n$L3"
try FAIL "ADVERSARIAL: opções FAT noauto,user,ro,auto,nouser,rw" "$L1\nLABEL=PENDRIVE /media/usb vfat noauto,user,ro,auto,nouser,rw 0 0\n$L3"
try FAIL "ADVERSARIAL: 4ª linha 'isto nao e fstab'"    "$L1\n$L2\n$L3\nisto nao e fstab"
try FAIL "4ª linha com 5 campos"                       "$L1\n$L2\n$L3\nproc /proc proc defaults 0"
try FAIL "4ª linha repetindo o ext4 em outro ponto"    "$L1\n$L2\n$L3\nUUID=$UE /mnt/outro ext4 defaults 0 2"
try FAIL "duas linhas para o mesmo ponto"              "$L1\n$L1\n$L2\n$L3"
try FAIL "ext4 com noauto"                             "UUID=$UE /srv/dados ext4 defaults,noatime,noauto 0 2\n$L2\n$L3"
try FAIL "ext4 com ro"                                 "UUID=$UE /srv/dados ext4 defaults,noatime,ro 0 2\n$L2\n$L3"
try FAIL "ext4 com ro e rw"                            "UUID=$UE /srv/dados ext4 defaults,noatime,ro,rw 0 2\n$L2\n$L3"
try FAIL "vfat com users (em vez de user)"             "$L1\nLABEL=PENDRIVE /media/usb vfat noauto,users,ro 0 0\n$L3"
try FAIL "vfat com user e users"                       "$L1\nLABEL=PENDRIVE /media/usb vfat noauto,user,users,ro 0 0\n$L3"
try FAIL "vfat sem noauto"                             "$L1\nLABEL=PENDRIVE /media/usb vfat user,ro 0 0\n$L3"
try FAIL "vfat com pass 2"                             "$L1\nLABEL=PENDRIVE /media/usb vfat noauto,user,ro 0 2\n$L3"
try FAIL "ext4 com dump 1"                             "UUID=$UE /srv/dados ext4 defaults,noatime 1 2\n$L2\n$L3"
try FAIL "swap sem a opção sw"                         "$L1\n$L2\nUUID=$US none swap noauto 0 0"
try FAIL "swap ausente"                                "$L1\n$L2\n$L2"
try FAIL "só duas linhas"                              "$L1\n$L2"
try FAIL "ponto de montagem do ext4 errado"            "UUID=$UE /srv/dado ext4 defaults,noatime 0 2\n$L2\n$L3"
try FAIL "ext4 por /dev/loop em vez de UUID"           "/dev/loop0 /srv/dados ext4 defaults,noatime 0 2\n$L2\n$L3"
# outras combinações de parâmetros: a solução tem de passar
for o1 in nodev nosuid; do
  for o2 in sync noexec; do
    P=(dados=financas usb=pendrive swp=swap-extra lbl_dados=dados-fin lbl_usb=PENDRIVE lbl_swap=swap-x pt_dados=/srv/dados pt_usb=usb opt1=$o1 opt2=$o2)
    lab_setup
    UE=$(sonda $D/financas.img UUID); US=$(sonda $D/swap-extra.img UUID)
    try PASS "solução com opt1=$o1 opt2=$o2" "UUID=$UE /srv/dados ext4 defaults,$o1 0 2\nLABEL=PENDRIVE /media/usb vfat noauto,user,$o2 0 0\nUUID=$US none swap sw 0 0"
    try FAIL "contradição exec/noexec e dev/nodev com opt1=$o1 opt2=$o2" "UUID=$UE /srv/dados ext4 defaults,$o1,dev,nodev 0 2\nLABEL=PENDRIVE /media/usb vfat noauto,user,$o2,exec,noexec 0 0\nUUID=$US none swap sw 0 0"
  done
done
