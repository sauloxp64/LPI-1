#!/bin/bash
source /opt/lab/lib.sh
drop_user "$P_dono"; drop_group "$P_grupo"
groupadd "$P_grupo"
useradd -M -s /usr/sbin/nologin -g "$P_grupo" "$P_dono"
d=$(fresh_dir perm-equipe)
printf '#!/bin/bash\necho "rotina %s executada"\n' "$P_script" > "$d/$P_script"
chown root:root "$d/$P_script"
chmod 644 "$d/$P_script"
echo "cenário pronto em $d"
