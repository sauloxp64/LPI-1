

// 104.3 montagem, 104.6 links, 104.7 FHS e busca de arquivos.
import { mcq, multi, block, code, pad } from './util.mjs';
import { sq, uniq, tableGen, hex, L, ORDF } from './system.mjs';

const uuid4 = (rng) => `${hex(rng, 8)}-${hex(rng, 4)}-4${hex(rng, 3)}-${rng.pick(['8', '9', 'a', 'b'])}${hex(rng, 3)}-${hex(rng, 12)}`;

// ═════════════════════════════════════════════ 104.3 ═════════════════════════════════════════════
const MPOINTS = ['/home', '/var', '/data', '/srv/www', '/mnt/backup', '/opt', '/var/lib/mysql', '/mnt/externo', '/media/usb', '/tmp'];
const PLAIN = ['defaults', 'defaults,noatime', 'defaults,nofail', 'noatime', 'defaults,discard', 'rw,relatime'];
const SPECIAL = {
  noauto: { opt: () => 'noauto,user', q: 'Qual destes sistemas de arquivos **não** é montado automaticamente pelo `mount -a` (nem durante o boot)?', why: 'A opção `noauto` exclui a linha do `mount -a` e da montagem no boot; ela continua válida para montagem manual (`mount PONTO`). Aqui ela vem acompanhada de `user`, que permite a um usuário comum montá-la.' },
  user: { opt: () => 'user,noauto', q: 'Em qual destes pontos de montagem um **usuário comum** (sem ser root) pode executar `mount PONTO`?', why: 'A opção `user` permite que qualquer usuário monte o sistema de arquivos (somente quem montou pode desmontar; `users` permite que qualquer usuário desmonte). Sem `user`/`users`/`owner`/`group`, só o root monta. (`user` implica `noexec,nosuid,nodev`, a menos que sejam reativados.)' },
  ro: { opt: () => 'ro,noatime', q: 'Qual destes sistemas de arquivos é montado **somente para leitura**?', why: '`ro` monta somente leitura (`rw` é o oposto, e faz parte de `defaults`). Para mudar sem desmontar: `mount -o remount,rw PONTO`.' },
  noexec: { opt: () => 'noexec,nosuid,nodev', q: 'Em qual destes sistemas de arquivos **não é possível executar binários** (nem usar SUID/dispositivos)?', why: '`noexec` proíbe executar programas dali, `nosuid` ignora os bits SUID/SGID e `nodev` ignora arquivos de dispositivo — combinação típica para /tmp ou mídias externas.' },
  auto: { opt: () => 'defaults,x-systemd.automount', q: 'Qual destes sistemas de arquivos é montado **sob demanda**, apenas no primeiro acesso ao ponto de montagem, pelo systemd?', why: '`x-systemd.automount` faz o systemd-fstab-generator criar uma unidade `.automount`: o ponto de montagem só é realmente montado no primeiro acesso.' },
};
const fstabRead = {
  id: 'fstab-read', obj: '104.3', nivel: 2, peso: 3,
  make(rng) {
    const mps = rng.sample(MPOINTS, 4);
    const mk = (mp) => {
      const dsp = rng.pick(['uuid', 'uuid', 'label', 'dev']);
      const dev = dsp === 'uuid' ? `UUID=${uuid4(rng)}` : dsp === 'label' ? `LABEL=${mp.split('/').pop() || 'raiz'}` : `/dev/sd${L(rng.int(1, 3))}${rng.int(1, 4)}`;
      return { dev, mp, type: rng.pick(['ext4', 'ext4', 'xfs', 'btrfs']), opts: rng.pick(PLAIN), dump: rng.pick([0, 0, 0, 1]), pass: 2 };
    };
    const rows = []; const usedDev = new Set(['x']);
    for (const mp of mps) { let r = mk(mp); let g = 0; while (usedDev.has(r.dev) && g++ < 20) r = mk(mp); usedDev.add(r.dev); rows.push(r); }
    rows.unshift({ dev: `UUID=${uuid4(rng)}`, mp: '/', type: 'ext4', opts: 'errors=remount-ro', dump: 0, pass: 1 });
    rows.push({ dev: `UUID=${uuid4(rng)}`, mp: 'none', type: 'swap', opts: 'sw', dump: 0, pass: 0 });
    const fmtLine = (r) => `${r.dev.padEnd(42)} ${r.mp.padEnd(16)} ${r.type.padEnd(6)} ${r.opts.padEnd(22)} ${r.dump} ${r.pass}`;
    const fmt = rng.pick(['field', 'field', 'special', 'special', 'special']);
    if (fmt === 'field') {
      const cand = rows.filter((r) => r.type !== 'swap');
      const r = rng.pick(cand); const f = rng.pick([2, 3, 4, 5, 6]);
      const names = { 2: 'ponto de montagem', 3: 'tipo do sistema de arquivos', 4: 'opções de montagem', 5: 'campo dump', 6: 'campo pass' };
      const val = { 2: r.mp, 3: r.type, 4: r.opts, 5: String(r.dump), 6: String(r.pass) }[f];
      const all = uniq(rows.flatMap((x) => ({ 2: [x.mp], 3: [x.type], 4: [x.opts], 5: [String(x.dump)], 6: [String(x.pass)] }[f]))).filter((x) => x !== val);
      const extra = { 2: ['/mnt', '/boot', '/usr'], 3: ['ext3', 'vfat', 'ntfs'], 4: ['ro', 'defaults,ro', 'noauto'], 5: ['0', '1', '2', '3'], 6: ['0', '1', '2', '3'] }[f].filter((x) => x !== val);
      return {
        type: 'unica', text: `Arquivo \`/etc/fstab\`:\n\n${block(rows.map(fmtLine).join('\n'))}\n\nNa linha de \`${r.dev}\`, qual é o valor do **${f}º campo** (${names[f]})?`,
        options: mcq(rng, val, [...all, ...extra]),
        explanation: `Os seis campos do /etc/fstab, nesta ordem, são: 1 dispositivo (/dev/..., UUID= ou LABEL=), 2 ponto de montagem, 3 tipo, 4 opções, 5 dump (1 = incluído no backup do \`dump\`, 0 = ignorado) e 6 pass (ordem do fsck no boot: 1 para a raiz, 2 para os demais, 0 = não verificar). O ${f}º campo dessa linha é \`${val}\`.`,
        ref: ['101:p.486-488'],
        verify: { sh: `printf '%s\\n' ${sq(rows.map(fmtLine).join('\n'))} | awk -v d=${sq(r.dev)} '$1==d{print $${f}}'`, expect: val },
      };
    }
    const keys = Object.keys(SPECIAL);
    const k = rng.pick(keys); const sp = SPECIAL[k];
    const targets = rows.filter((r) => r.type !== 'swap' && r.mp !== '/');
    const t = rng.pick(targets);
    const rows2 = rows.map((r) => (r === t ? { ...r, opts: sp.opt() } : r));
    const others = rows2.filter((r) => r.type !== 'swap' && r !== rows2.find((x) => x.mp === t.mp)).map((r) => r.mp);
    return {
      type: 'unica', text: `Arquivo \`/etc/fstab\`:\n\n${block(rows2.map(fmtLine).join('\n'))}\n\n${sp.q}`,
      options: mcq(rng, t.mp, others),
      explanation: `${sp.why} A linha correta é a de \`${t.mp}\`, cujas opções são \`${sp.opt()}\`. As demais usam apenas opções comuns (\`defaults\`, \`noatime\`, \`nofail\`...). Lembre que \`defaults\` equivale a \`rw,suid,dev,exec,auto,nouser,async\`.`,
      ref: ['101:p.486-488'],
      verify: { sh: `printf '%s\\n' ${sq(rows2.map(fmtLine).join('\n'))} | awk '$4 ~ /(^|,)${k === 'auto' ? 'x-systemd.automount' : k === 'noauto' ? 'noauto' : k === 'user' ? 'user' : k}(,|$)/ {print $2}'`, expect: t.mp },
    };
  },
};

const blkidFstab = {
  id: 'blkid-fstab', obj: '104.3', nivel: 3, peso: 3,
  make(rng) {
    const labels = rng.sample(['dados', 'backup', 'fotos', 'web', 'projetos'], 3);
    const devs = rng.sample(['sdb1', 'sdc1', 'sdd1', 'sde1'], 3).sort();
    const types = rng.shuffle(['ext4', 'ext4', 'xfs']);
    const items = devs.map((d, i) => ({ dev: `/dev/${d}`, label: labels[i], uuid: uuid4(rng), type: types[i] }));
    const mp = rng.sample(['/mnt/dados', '/srv/arquivos', '/var/backups', '/data'], 3);
    const out = items.map((x) => `${x.dev}: LABEL="${x.label}" UUID="${x.uuid}" BLOCK_SIZE="${x.type === 'xfs' ? 512 : 4096}" TYPE="${x.type}"`).join('\n');
    const i = rng.int(0, 2); const t = items[i];
    const fmt = rng.int(1, 3);
    const mkImg = (x, j) => `truncate -s ${x.type === 'xfs' ? 320 : 64}M i${j}.img; ${x.type === 'xfs' ? `mkfs.xfs -q -f -L ${x.label} -m uuid=${x.uuid}` : `mkfs.ext4 -q -F -b 4096 -L ${x.label} -U ${x.uuid}`} i${j}.img >/dev/null 2>&1`;
    const ver = { sh: `d=$(mktemp -d); cd "$d"; ${mkImg(t, 0)}; blkid -o value -s LABEL -s UUID -s TYPE i0.img | tr '\\n' ' '`, expect: `${t.label} ${t.uuid} ${t.type}` };
    if (fmt === 1) {
      const ok = `UUID=${t.uuid} ${mp[i]} ${t.type} defaults 0 2`;
      const other = items[(i + 1) % 3];
      const pool = [`UUID=${other.uuid} ${mp[i]} ${t.type} defaults 0 2`, `UUID=${t.uuid} ${mp[i]} ${other.type === t.type ? (t.type === 'ext4' ? 'xfs' : 'ext4') : other.type} defaults 0 2`, `${mp[i]} UUID=${t.uuid} ${t.type} defaults 0 2`, `LABEL=${t.uuid} ${mp[i]} ${t.type} defaults 0 2`, `UUID=${t.label} ${mp[i]} ${t.type} defaults 0 2`];
      return { type: 'unica', text: `Saída de \`blkid\`:\n\n${block(out)}\n\nQual linha do /etc/fstab monta o sistema de arquivos de rótulo **${t.label}** em \`${mp[i]}\`, identificando-o pelo UUID e com as opções padrão (dump 0, fsck na ordem 2)?`, options: mcq(rng, ok, pool.filter((x) => x !== ok)), explanation: `Formato: \`dispositivo ponto tipo opções dump pass\`. O dispositivo pode ser \`UUID=...\` (estável mesmo que o nome /dev/sdX mude) ou \`LABEL=...\`; o UUID e o TYPE de \`${t.label}\` vêm da linha ${t.dev} do blkid: \`${t.uuid}\` e \`${t.type}\`. O tipo precisa ser o do sistema de arquivos (${t.type}), e o ponto de montagem vem no 2º campo.`, ref: ['101:p.486-490'], verify: ver };
    }
    if (fmt === 2) {
      const line = `UUID=${t.uuid} ${mp[i]} ${t.type} defaults 0 2`;
      return { type: 'unica', text: `Saída de \`blkid\`:\n\n${block(out)}\n\nQual dispositivo é montado pela linha abaixo do /etc/fstab?\n\n${block(line)}`, options: mcq(rng, t.dev, items.filter((x) => x !== t).map((x) => x.dev).concat(['/dev/sda1', '/dev/sdf1'])), explanation: `O campo \`UUID=${t.uuid}\` corresponde à linha de \`${t.dev}\` (rótulo \`${t.label}\`, tipo ${t.type}) na saída do blkid. Essa é a vantagem do UUID: a linha continua válida mesmo que o disco passe a ser detectado como outro /dev/sdX.`, ref: ['101:p.486-490'], verify: ver };
    }
    const cmd = `mount -t ${t.type} LABEL=${t.label} ${mp[i]}`;
    return { type: 'unica', text: `Saída de \`blkid\`:\n\n${block(out)}\n\nQual comando monta o sistema de arquivos de rótulo **${t.label}** em \`${mp[i]}\` (o diretório já existe), sem usar o nome /dev/sdX?`, options: mcq(rng, cmd, [`mount -t ${t.type} LABEL=${t.uuid} ${mp[i]}`, `mount -t ${t.type} UUID=${t.label} ${mp[i]}`, `mount -t ${t.type} ${mp[i]} LABEL=${t.label}`, `mount -L ${t.label} ${t.dev}`, `mount -t ${t.type} -o label=${t.label} ${mp[i]}`]), explanation: 'O `mount` aceita `LABEL=rótulo` ou `UUID=uuid` no lugar do dispositivo (também `-L rótulo` e `-U uuid`): `mount -t tipo LABEL=dados /ponto`. A ordem é sempre origem e depois destino. O `-t` é opcional (o mount detecta o tipo).', ref: ['101:p.488-490'], verify: ver };
  },
};

const mountCmd = {
  id: 'mount-cmd', obj: '104.3', nivel: 2, peso: 3,
  make(rng) {
    const dev = rng.pick(['/dev/sdb1', '/dev/sdc1', '/dev/vdb1']); const mp = rng.pick(['/mnt/dados', '/mnt/externo', '/media/backup', '/mnt/usb']);
    const type = rng.pick(['ext4', 'xfs', 'ntfs-3g', 'vfat']); const iso = rng.pick(['debian.iso', 'instalador.iso', 'cd.iso']);
    const hg = (cmd, pat) => ({ sh: `${cmd} 2>&1 | grep -c ${sq(pat)}`, expect: '1' });
    const rows = [
      { t: `Montar ${dev} (tipo ${type}) em \`${mp}\` somente para leitura`, ok: `mount -t ${type} -o ro ${dev} ${mp}`, bad: [`mount -t ${type} -o rw ${dev} ${mp}`, `mount -t ${type} -r ${dev},${mp}`, `mount -o ro ${mp} ${dev}`, `mount -ro ${type} ${dev} ${mp}`], w: '`-o ro` (ou `-r`/`--read-only`) monta somente leitura; a ordem é dispositivo e depois ponto de montagem. `-t` informa o tipo (opcional, pois o mount o detecta).', v: ['mount --help 2>&1 | grep -E -c "^ *-r, --read-only"', '1'] },
      { t: `Remontar a raiz \`/\` para leitura e escrita, sem desmontá-la`, ok: 'mount -o remount,rw /', bad: ['mount -o rw /', 'mount --remount /rw', 'mount -o remount /dev/sda1 rw', 'umount -o rw /'], w: '`remount` altera as opções de um sistema de arquivos já montado; basta informar o ponto de montagem (ou o dispositivo) e as novas opções, sem o tipo.' },
      { t: `Montar todos os sistemas de arquivos listados no /etc/fstab que não tenham a opção \`noauto\``, ok: 'mount -a', bad: ['mount --fstab', 'mount -f /etc/fstab', 'mount -A', 'fstab mount'], w: '`mount -a` percorre o /etc/fstab e monta o que ainda não está montado (ignorando `noauto`). Equivale ao que acontece no boot. As áreas de swap usam `swapon -a`.', v: ['mount --help 2>&1 | grep -E -c "^ *-a, --all"', '1'] },
      { t: `Desmontar o sistema de arquivos montado em \`${mp}\``, ok: `umount ${mp}`, bad: [`unmount ${mp}`, `umount -t ${mp}`, `mount -u ${mp}`, `umount ${mp} ${dev}`], w: 'O comando é `umount` (sem o "n"), e aceita o ponto de montagem ou o dispositivo. Falha com "target is busy" se algum processo estiver usando o sistema de arquivos.' },
      { t: `Desmontar ${mp} que mostra "target is busy": descobrir quais processos mantêm arquivos abertos lá`, ok: `lsof ${mp}`, bad: [`umount -l ${mp}`, `mount --busy ${mp}`, `lsblk ${mp}`, `blkid ${mp}`], w: '`lsof PONTO` (ou `fuser -vm PONTO`) lista os processos e arquivos abertos; depois feche-os e desmonte. `umount -l` (lazy) apenas adia a desmontagem real e não responde à pergunta.' },
      { t: `Desmontar ${mp} de forma "preguiçosa" (lazy), removendo-o da árvore de diretórios agora e limpando as referências quando deixar de estar em uso`, ok: `umount -l ${mp}`, bad: [`umount -f ${mp}`, `umount -r ${mp}`, `umount -a ${mp}`, `umount --later ${mp}`], w: '`-l` (lazy) desanexa imediatamente e limpa depois; `-f` força (útil para NFS inacessível); `-r` tenta remontar somente leitura se a desmontagem falhar.', v: ['umount --help 2>&1 | grep -E -c "^ *-l, --lazy"', '1'] },
      { t: `Montar a imagem ISO \`${iso}\` em \`${mp}\` usando um dispositivo de loopback`, ok: `mount -o loop ${iso} ${mp}`, bad: [`mount -t loop ${iso} ${mp}`, `mount -o iso ${iso} ${mp}`, `mount ${mp} ${iso}`, `mount -o bind ${iso} ${mp}`], w: '`-o loop` associa um arquivo a um dispositivo loop para montá-lo como se fosse um disco (o tipo iso9660 é detectado). `--bind` serve para espelhar um **diretório** em outro lugar.' },
      { t: `Tornar o diretório \`/srv/www\` visível também em \`${mp}\` (montagem de ligação, bind mount)`, ok: `mount --bind /srv/www ${mp}`, bad: [`mount -o loop /srv/www ${mp}`, `mount -t bind /srv/www ${mp}`, `ln --mount /srv/www ${mp}`, `mount --link ${mp} /srv/www`], w: '`mount --bind ORIGEM DESTINO` (ou `-o bind`) faz a mesma árvore aparecer em dois lugares. O `updatedb` pode ignorar essas montagens com `PRUNE_BIND_MOUNTS`.', v: ['mount --help 2>&1 | grep -E -c "^ *-B, --bind"', '1'] },
      { t: 'Listar apenas os sistemas de arquivos ext4 atualmente montados', ok: 'mount -t ext4', bad: ['mount -a ext4', 'mount --list ext4', 'mount -l ext4', 'mount | ext4'], w: 'Sem argumentos o `mount` lista tudo o que está montado; `-t tipo` filtra pelo tipo (vários separados por vírgula). `findmnt -t ext4` e `cat /proc/mounts` também servem.' },
      { t: `Mostrar tipo, rótulo e UUID de cada sistema de arquivos, em formato de árvore de dispositivos, com o ponto de montagem`, ok: 'lsblk -f', bad: ['lsblk -a', 'blkid -t', 'lsblk -m', 'df -f'], w: '`lsblk -f` (`--fs`) mostra NAME, FSTYPE, LABEL, UUID e MOUNTPOINT em árvore. `blkid` lista UUID/LABEL/TYPE em linhas; `df` mostra espaço de sistemas de arquivos montados.', v: ['lsblk --help 2>&1 | grep -E -c "^ *-f, --fs"', '1'] },
      { t: `Montar o sistema de arquivos de UUID \`3e0b34e2-949c-43f2-90b0-25454ac1595d\` em \`${mp}\``, ok: `mount UUID=3e0b34e2-949c-43f2-90b0-25454ac1595d ${mp}`, bad: [`mount LABEL=3e0b34e2-949c-43f2-90b0-25454ac1595d ${mp}`, `mount -o uuid=3e0b34e2-949c-43f2-90b0-25454ac1595d ${mp}`, `mount ${mp} UUID=3e0b34e2-949c-43f2-90b0-25454ac1595d`, `mount UUID ${mp} 3e0b34e2-949c-43f2-90b0-25454ac1595d`], w: 'A origem pode ser expressa como `UUID=...`, `LABEL=...` (ou `-U`/`-L`) — a mesma sintaxe vale na primeira coluna do /etc/fstab.' },
    ];
    const r = rng.pick(rows);
    const out = { type: 'unica', text: `Qual comando realiza a tarefa abaixo?\n\n${r.t}`, options: mcq(rng, r.ok, r.bad), explanation: `\`${r.ok}\`. ${r.w}`, ref: ['101:p.482-490'] };
    if (r.v) out.verify = { sh: r.v[0], expect: r.v[1] };
    return out;
  },
};

/** Nome da unidade systemd para um caminho (equivalente a `systemd-escape -p --suffix=...`). */
export function unitName(path, suffix = 'mount') {
  const p = path.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  if (p === '') return `-.${suffix}`;
  const esc = [...p].map((ch, i) => (ch === '/' ? '-' : /[A-Za-z0-9:_]/.test(ch) || (ch === '.' && i > 0) ? ch : `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)).join('');
  return `${esc}.${suffix}`;
}
const systemdMount = {
  id: 'systemd-mount', obj: '104.3', nivel: 3, peso: 2,
  make(rng) {
    const dash = rng.chance(0.4);
    const base = rng.pick(['externo', 'backup', 'dados', 'fotos', 'arquivo']);
    const dir = dash ? `${base}-${rng.pick(['2024', 'old', 'usb'])}` : base;
    const path = rng.pick([`/mnt/${dir}`, `/media/${dir}`, `/srv/${dir}`, `/var/lib/${dir}`]);
    const ok = unitName(path);
    const fmt = rng.int(1, 4);
    if (fmt === 1) {
      const naive = path.replace(/^\//, '').replace(/\//g, '-') + '.mount';
      const pool = uniq([naive, path.replace(/^\//, '').replace(/\//g, '_') + '.mount', path.replace(/^\//, '').replace(/\//g, '-') + '.service', `${path}.mount`.replace(/\//g, '-'), path.split('/').pop() + '.mount', path.replace(/^\//, '').replace(/\//g, '-') + '.automount']).filter((x) => x !== ok);
      return { type: 'unica', text: `Qual deve ser o nome do arquivo da unidade de montagem (em /etc/systemd/system/) para o ponto de montagem \`${path}\`?`, options: mcq(rng, ok, pool), explanation: `O nome da unidade \`.mount\` é o **caminho do ponto de montagem** sem a barra inicial, com cada \`/\` trocada por \`-\`${dash ? ' — e, como o próprio nome já contém um hífen, esse hífen é escrito como `\\x2d` para não ser confundido com separador de diretório (o `systemd-escape -p --suffix=mount ' + path + '` faz a conversão)' : ''}: \`${ok}\`. O campo \`Where=\` precisa coincidir com o caminho, senão a unidade não carrega.`, ref: ['101:p.490-493'] };
    }
    if (fmt === 2) {
      const uid = uuid4(rng);
      const unit = `[Unit]\nDescription=Disco ${dir}\n\n[Mount]\nWhat=/dev/disk/by-uuid/${uid}\nWhere=${path}\nType=ext4\nOptions=defaults\n\n[Install]\nWantedBy=multi-user.target`;
      return { type: 'unica', text: `Um administrador criou a unidade abaixo para montar um disco no boot:\n\n${block(unit)}\n\nCom qual nome de arquivo ela deve ser salva em /etc/systemd/system/ para funcionar?`, options: mcq(rng, ok, uniq([path.replace(/^\//, '').replace(/\//g, '-') + '.mount', `${dir}.mount`, `${dir}.service`, `disco-${dir}.mount`, path.replace(/^\//, '').replace(/\//g, '-') + '.conf']).filter((x) => x !== ok)), explanation: `Uma unidade de montagem precisa ter o nome derivado de \`Where=\`: \`${path}\` → \`${ok}\`. Depois: \`systemctl daemon-reload\` e \`systemctl start ${ok}\` (e \`systemctl enable ${ok}\` para montar no boot).`, ref: ['101:p.490-493'] };
    }
    if (fmt === 3) {
      const nm = unitName('/mnt/externo');
      const rows = [
        [`Depois de salvar ${nm} em /etc/systemd/system/, qual comando faz o systemd reler os arquivos de unidade?`, 'systemctl daemon-reload', ['systemctl reload mnt', 'systemctl restart systemd', 'systemd-reload', 'telinit q']],
        [`Qual comando monta agora o ponto descrito pela unidade ${nm}?`, `systemctl start ${nm}`, [`systemctl mount ${nm}`, `mount ${nm}`, `systemctl enable ${nm}`, `systemctl isolate ${nm}`]],
        [`Qual comando faz a unidade ${nm} ser montada automaticamente a cada boot (dado que ela tem [Install] WantedBy=multi-user.target)?`, `systemctl enable ${nm}`, [`systemctl start ${nm}`, `systemctl daemon-reload ${nm}`, `systemctl set-default ${nm}`, `systemctl mask ${nm}`]],
        [`Qual comando mostra se a unidade ${nm} está montada?`, `systemctl status ${nm}`, [`systemctl mounted ${nm}`, `systemctl list-mounts ${nm}`, `mount --status ${nm}`, `systemctl info ${nm}`]],
        ['Qual diretiva da seção [Mount] de uma unidade .mount informa o dispositivo (por exemplo, /dev/disk/by-uuid/...) a ser montado?', 'What=', ['Where=', 'Type=', 'Options=', 'Device=']],
        ['Qual seção de uma unidade .mount contém a diretiva WantedBy=multi-user.target?', '[Install]', ['[Mount]', '[Unit]', '[Service]', '[Target]']],
        ['Em /etc/fstab, qual opção faz o systemd montar o sistema de arquivos apenas no primeiro acesso ao ponto de montagem?', 'x-systemd.automount', ['systemd.lazy', 'automount=yes', 'noauto,lazy', 'x-systemd.onaccess']],
      ];
      const r = rng.pick(rows);
      return { type: 'unica', text: r[0], options: mcq(rng, r[1], r[2]), explanation: 'Uma unidade `.mount` tem `[Unit]` (descrição), `[Mount]` (`What=` dispositivo, `Where=` ponto, `Type=`, `Options=`) e `[Install]` (`WantedBy=multi-user.target`). O nome do arquivo deve corresponder a `Where=`. Fluxo: criar o arquivo em /etc/systemd/system/, `systemctl daemon-reload`, `systemctl start` e `systemctl enable`. As linhas do /etc/fstab também viram unidades mount automaticamente (systemd-fstab-generator).', ref: ['101:p.490-493'] };
    }
    const p2 = rng.pick(['/mnt/dados', '/media/fotos', '/srv/web']);
    const am = unitName(p2, 'automount');
    return { type: 'unica', text: `Para que \`${p2}\` seja montado apenas quando for acessado, o administrador cria uma unidade de montagem automática. Qual deve ser o nome do arquivo dela?`, options: mcq(rng, am, [unitName(p2, 'mount'), unitName(p2, 'service'), `${p2.split('/').pop()}.automount`, unitName(p2, 'auto')]), explanation: `A unidade \`.automount\` também recebe o nome derivado do caminho: \`${am}\`, com \`[Automount] Where=${p2}\` (e, opcionalmente, \`TimeoutIdleSec=\` para desmontar por inatividade). Ela exige a unidade \`${unitName(p2, 'mount')}\` correspondente, que é iniciada no primeiro acesso.`, ref: ['101:p.490-493'] };
  },
};

const mountConcepts = tableGen({
  id: 'mount-concepts', obj: '104.3', nivel: 2, peso: 2, ref: ['101:p.482-493'],
  rows: [
    { q: 'O que a opção `defaults` do /etc/fstab equivale?', ok: 'rw, suid, dev, exec, auto, nouser e async', bad: ['ro, nosuid, nodev, noexec, noauto, user e sync', 'rw, nosuid, nodev, noexec, auto, nouser e async', 'rw, suid, dev, exec, noauto, user e sync', 'ro, suid, dev, exec, auto, nouser e async'], why: '`defaults` = `rw,suid,dev,exec,auto,nouser,async`: leitura e escrita, SUID e dispositivos permitidos, execução permitida, montado por `mount -a`, só root monta, E/S assíncrona.', verify: { sh: 'man -P cat mount 2>/dev/null | tr -s " \\n" "  " | grep -c "rw, suid, dev, exec, auto, nouser, and async"', expect: '1' } },
    { q: 'Qual a diferença entre as opções `user` e `users` no /etc/fstab?', ok: 'Com user, qualquer usuário pode montar, mas só quem montou (ou o root) pode desmontar; com users, qualquer usuário pode montar e desmontar', bad: ['user permite apenas o root; users permite todos os usuários', 'user vale para o primeiro usuário cadastrado; users, para o grupo wheel', 'user monta somente leitura; users monta leitura e escrita', 'Não há diferença'], why: '`user` e `users` liberam a montagem por usuários comuns. `owner` libera para o dono do dispositivo e `group` para quem pertence ao grupo do dispositivo. `nouser` (padrão em `defaults`) restringe ao root.' },
    { q: 'Qual é a função do campo "pass" (6º campo) do /etc/fstab?', ok: 'Define a ordem em que o fsck verifica os sistemas de arquivos no boot: 1 para a raiz, 2 para os demais e 0 para não verificar', bad: ['Define a senha exigida para montar o sistema de arquivos', 'Define o número máximo de tentativas de montagem', 'Indica se o sistema de arquivos entra no backup do comando dump', 'Define a ordem em que os sistemas de arquivos são montados, de 0 a 9'], why: 'O 5º campo (dump) controla o backup pelo `dump`; o 6º (pass) controla o fsck. A raiz deve ter 1, os outros 2 (verificados depois, e possivelmente em paralelo se estiverem em discos diferentes) e 0 desativa a verificação.' },
    { q: 'Por que usar `UUID=` ou `LABEL=` em vez de `/dev/sdb1` no /etc/fstab de um disco externo?', ok: 'Porque o nome /dev/sdX pode mudar conforme a ordem de detecção (portas, outros pendrives); UUID e rótulo permanecem os mesmos', bad: ['Porque /dev/sdb1 não pode ser usado em fstab, apenas UUID', 'Porque o UUID é mais rápido de montar que o nome do dispositivo', 'Porque o rótulo muda a cada boot, garantindo exclusividade', 'Porque só o UUID funciona com XFS'], why: 'UUID e rótulo são gravados no sistema de arquivos na criação (`mkfs -L`, `-U`; `tune2fs -L/-U`, `xfs_admin -L/-U`) e não mudam com a porta ou a ordem de conexão. `blkid` e `lsblk -f` os mostram.' },
    { q: 'O que a opção `nofail` faz em uma linha do /etc/fstab?', ok: 'Impede que a ausência do dispositivo cause falha na inicialização (o boot segue mesmo que ele não esteja presente)', bad: ['Desativa a verificação com fsck no boot', 'Monta o sistema de arquivos mesmo que haja erros de leitura', 'Faz a montagem tentar novamente a cada 5 segundos', 'Impede que o sistema de arquivos seja desmontado'], why: 'Sem `nofail`, um disco externo ausente pode levar o boot ao modo de emergência. `nofail` (e `x-systemd.device-timeout=`) evita isso.' },
    { q: 'Qual a diferença entre `mount -o remount,ro /dados` e `umount /dados`?', ok: 'O remount muda as opções de um sistema de arquivos que continua montado; o umount o remove da árvore de diretórios', bad: ['O remount apaga o conteúdo; o umount apenas o oculta', 'O remount só funciona na raiz; o umount, em qualquer ponto', 'O remount precisa do dispositivo e do tipo; o umount, não', 'São equivalentes: ambos desmontam o sistema de arquivos'], why: '`remount` reaplica opções (por exemplo, passar de rw para ro para fazer um fsck seguro ou proteger dados) sem desmontar, o que não exige parar processos que usam o disco.' },
    { q: 'Onde as montagens ativas (a lista de sistemas de arquivos montados) podem ser lidas diretamente, sem usar o comando mount?', ok: '/proc/mounts (em muitos sistemas /etc/mtab é um link para ele)', bad: ['/etc/fstab', '/var/log/mounts', '/proc/partitions', '/sys/block/mounts'], why: '`/etc/fstab` descreve o que **deve** ser montado; `/proc/mounts` mostra o que **está** montado. `/proc/partitions` lista dispositivos de bloco, montados ou não.' },
    { q: 'Em qual diretório as áreas de montagem automática de mídias removíveis aparecem nos ambientes de desktop atuais e qual é a convenção para montagens manuais?', ok: '/media/USUÁRIO/RÓTULO e /mnt, respectivamente', bad: ['/mnt/USUÁRIO/RÓTULO e /media, respectivamente', '/dev/USUÁRIO/RÓTULO e /tmp, respectivamente', '/home/USUÁRIO/RÓTULO e /srv, respectivamente', '/run/RÓTULO e /var, respectivamente'], why: 'O `/media` ficou como destino de mídias removíveis (montadas pelo ambiente gráfico em `/media/USUÁRIO/RÓTULO`); o `/mnt` é para montagens manuais temporárias.' },
    { q: 'Como ativar todas as áreas de swap listadas no /etc/fstab?', ok: 'swapon -a', bad: ['mount -a -t swap', 'mkswap -a', 'swapon /etc/fstab', 'mount -s'], why: 'Linhas com tipo `swap` não são montadas por `mount -a`; elas são ativadas por `swapon -a` (feito no boot). `mkswap` apenas prepara a área.' },
    { q: 'O que significa o campo "dump" (5º campo) do /etc/fstab com valor 1?', ok: 'O sistema de arquivos (ext2/3/4) é considerado para backup pelo utilitário dump', bad: ['O sistema de arquivos é verificado primeiro pelo fsck', 'O sistema de arquivos é montado antes dos demais', 'O sistema de arquivos é montado somente leitura', 'Os logs do sistema de arquivos são despejados em /var/log'], why: 'O `dump` é uma ferramenta de backup de ext2/3/4; valor 0 (o mais comum) o ignora. Hoje é raro seu uso.' },
    { q: 'Ao tentar desmontar um pendrive, aparece "umount: /media/ana/PEN: target is busy". Qual é o procedimento recomendado?', ok: 'Descobrir com lsof ou fuser quais processos usam o ponto, encerrá-los (ou sair do diretório) e desmontar novamente', bad: ['Executar mount -o remount,rw para liberar o dispositivo', 'Usar fsck no dispositivo ainda montado', 'Remover o ponto de montagem com rmdir', 'Reiniciar o udev'], why: 'Um shell cujo diretório atual está no ponto de montagem também o mantém ocupado. `umount -l` (lazy) é uma saída quando não é possível encerrar os processos.' },
  ],
});

export const mountGens = [fstabRead, blkidFstab, mountCmd, systemdMount, mountConcepts];

// ═════════════════════════════════════════════ 104.6 ═════════════════════════════════════════════
const CONTENTS = ['alfa', 'beta', 'gama', 'delta', 'omega', 'sigma'];
const FILES = ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt', 'f.txt', 'g.txt'];
const SYMS = ['s1', 's2', 'link1', 'atalho', 'ref'];
/** Mini sistema de arquivos de um diretório (arquivos regulares + links simbólicos), com a semântica real de ln/rm/mv/cp. */
function linkScenario(rng, nOps = 5) {
  const ents = new Map(); let ino = 0; const freeF = rng.shuffle(FILES); const freeS = rng.shuffle(SYMS); const cmds = [];
  const files = () => [...ents].filter(([, e]) => e.kind === 'file').map(([n]) => n);
  const syms = () => [...ents].filter(([, e]) => e.kind === 'sym').map(([n]) => n);
  const first = freeF.pop(); const c0 = rng.pick(CONTENTS);
  ents.set(first, { kind: 'file', ino: ++ino, text: c0 }); cmds.push(`echo ${c0} > ${first}`);
  let guard = 0;
  while (cmds.length < nOps && guard++ < 60) {
    const op = rng.pick(['hl', 'hl', 'sl', 'sl', 'rm', 'mv', 'cp']);
    const fs = files();
    if (op === 'hl' && fs.length && freeF.length) { const src = rng.pick(fs); const dst = freeF.pop(); ents.set(dst, { ...ents.get(src) }); cmds.push(`ln ${src} ${dst}`); }
    else if (op === 'sl' && fs.length && freeS.length) { const src = rng.pick(fs); const dst = freeS.pop(); ents.set(dst, { kind: 'sym', target: src }); cmds.push(`ln -s ${src} ${dst}`); }
    else if (op === 'rm' && ents.size > 1) { const n = rng.pick([...ents.keys()]); ents.delete(n); cmds.push(`rm ${n}`); }
    else if (op === 'mv' && fs.length && freeF.length) { const src = rng.pick(fs); const dst = freeF.pop(); ents.set(dst, ents.get(src)); ents.delete(src); cmds.push(`mv ${src} ${dst}`); }
    else if (op === 'cp' && fs.length && freeF.length) { const src = rng.pick(fs); const dst = freeF.pop(); ents.set(dst, { kind: 'file', ino: ++ino, text: ents.get(src).text }); cmds.push(`cp ${src} ${dst}`); }
  }
  return { ents, cmds, files, syms };
}
const nlinks = (ents, name) => { const e = ents.get(name); return [...ents.values()].filter((x) => x.kind === 'file' && x.ino === e.ino).length; };
const catResult = (ents, name) => {
  let cur = name; let guard = 0;
  while (guard++ < 10) { const e = ents.get(cur); if (!e) return { err: `cat: ${name}: No such file or directory` }; if (e.kind === 'file') return { text: e.text }; cur = e.target; }
  return { err: `cat: ${name}: Too many levels of symbolic links` };
};

const linkCount = {
  id: 'link-count', obj: '104.6', nivel: 3, peso: 3,
  make(rng) {
    const sc = linkScenario(rng, rng.int(4, 6));
    const script = sc.cmds.join('\n');
    const prep = `d=$(mktemp -d); cd "$d"; ${sc.cmds.join('; ')}`;
    const cmdsTxt = `$ ${sc.cmds.join('\n$ ')}`;
    const syms = sc.syms(); const files = sc.files();
    const useCat = syms.length && (files.length === 0 || rng.chance(0.55));
    if (useCat) {
      const s = rng.pick(syms); const r = catResult(sc.ents, s);
      const ok = r.err ? `Erro: ${r.err.replace(/^cat: /, '')}` : `Mostra "${r.text}"`;
      const allText = uniq([...sc.ents.values()].filter((e) => e.kind === 'file').map((e) => e.text).concat(CONTENTS.slice(0, 3)));
      const pool = [...allText.filter((t) => !r.text || t !== r.text).map((t) => `Mostra "${t}"`), 'Erro: No such file or directory', `Erro: ${s}: Is a directory`, `Erro: ${s}: Permission denied`, 'Não mostra nada (arquivo vazio)'].filter((x) => x !== ok);
      return { type: 'unica', text: `Em um diretório vazio foram executados, em ordem:\n\n${block(cmdsTxt)}\n\nO que acontece com o comando \`cat ${s}\` em seguida?`, options: mcq(rng, r.err ? `Erro: ${s}: No such file or directory` : ok, pool.map((x) => (x === 'Erro: No such file or directory' ? `Erro: ${s}: No such file or directory` : x)).filter((x) => x !== (r.err ? `Erro: ${s}: No such file or directory` : ok))), explanation: `Um link simbólico guarda o **nome** do destino (${sc.ents.get(s).target}). Se o nome existir como arquivo, \`cat ${s}\` mostra o conteúdo dele; se o arquivo foi removido ou renomeado (\`rm\`/\`mv\`), o link fica **quebrado** (dangling) e o resultado é "No such file or directory". Hard links, ao contrário, apontam para o inode e continuam válidos. Resultado aqui: ${r.err ? 'link quebrado' : `"${r.text}"`}.`, ref: ['101:p.529-533'], verify: { sh: `${prep}; cat ${s} 2>&1 | sed 's/^cat: //'`, expect: r.err ? r.err.replace(/^cat: /, '') : r.text } };
    }
    const f = rng.pick(files); const n = nlinks(sc.ents, f);
    const others = files.filter((x) => x !== f).map((x) => nlinks(sc.ents, x));
    return { type: 'unica', text: `Em um diretório vazio foram executados, em ordem:\n\n${block(cmdsTxt)}\n\nQual é a contagem de links (segunda coluna de \`ls -l\`) do arquivo \`${f}\` no final?`, options: mcq(rng, String(n), uniq(['1', '2', '3', '4', '0', String(n + 1), ...others.map(String)]).filter((x) => x !== String(n))), explanation: `A contagem de links de um arquivo regular é o número de **nomes (hard links)** que apontam para o mesmo inode: \`ln\` aumenta, \`rm\` diminui, \`mv\` apenas troca o nome (mesmo inode) e \`cp\` cria um inode novo (contagem 1). Links simbólicos (\`ln -s\`) **não** aumentam a contagem do destino. No final, \`${f}\` tem ${n} link${n > 1 ? 's' : ''}: ${[...sc.ents].filter(([, e]) => e.kind === 'file' && e.ino === sc.ents.get(f).ino).map(([x]) => x).join(', ')}.`, ref: ['101:p.529-533'], verify: { sh: `${prep}; stat -c %h ${f}`, expect: String(n) } };
  },
};

const linkLsRead = {
  id: 'link-ls-read', obj: '104.6', nivel: 3, peso: 2,
  make(rng) {
    let sc; let tries = 0;
    do { sc = linkScenario(rng, rng.int(5, 7)); tries++; } while (tries < 30 && (sc.syms().length === 0 || sc.files().length < 2));
    const names = [...sc.ents.keys()].sort((a, b) => (a < b ? -1 : 1));
    const base = rng.int(140000, 900000); const inoMap = new Map();
    const inoOf = (e, name) => { const key = e.kind === 'file' ? `f${e.ino}` : `s${name}`; if (!inoMap.has(key)) inoMap.set(key, base + inoMap.size * rng.int(3, 11)); return inoMap.get(key); };
    const size = (e) => (e.kind === 'file' ? e.text.length + 1 : e.target.length);
    const lines = names.map((n) => { const e = sc.ents.get(n); const links = e.kind === 'file' ? nlinks(sc.ents, n) : 1; return `${inoOf(e, n)} ${e.kind === 'file' ? '-rw-r--r--' : 'lrwxrwxrwx'} ${links} aluno aluno ${String(size(e)).padStart(2)} mar  4 10:15 ${n}${e.kind === 'sym' ? ` -> ${e.target}` : ''}`; });
    const idxMap = new Map(); let k = 0;
    const norm = names.map((n) => { const e = sc.ents.get(n); const key = e.kind === 'file' ? `f${e.ino}` : `s${n}`; if (!idxMap.has(key)) idxMap.set(key, ++k); return `${idxMap.get(key)} ${e.kind === 'file' ? '-rw-r--r--' : 'lrwxrwxrwx'} ${e.kind === 'file' ? nlinks(sc.ents, n) : 1} ${size(e)} ${n}${e.kind === 'sym' ? ` -> ${e.target}` : ''}`; }).join('\n');
    const prep = `d=$(mktemp -d); cd "$d"; ${sc.cmds.join('; ')}`;
    const ver = { sh: `${prep}; for n in $(ls); do printf '%s %s ' "$(stat -c '%i %A %h %s' "$n")" "$n"; if [ -L "$n" ]; then printf -- '-> %s' "$(readlink "$n")"; fi; echo; done | awk '{ if (!($1 in m)) m[$1] = ++k; $1 = m[$1]; print }'`, expect: norm };
    const listing = `$ ls -li\n${lines.join('\n')}`;
    const intro = `Saída de \`ls -li\` em um diretório (a primeira coluna é o número do inode):\n\n${block(listing)}\n\n`;
    const syms = sc.syms(); const files = sc.files();
    const fmt = rng.int(1, 3);
    if (fmt === 1) {
      const groups = new Map();
      for (const n of files) { const e = sc.ents.get(n); if (!groups.has(e.ino)) groups.set(e.ino, []); groups.get(e.ino).push(n); }
      const multi_ = [...groups.values()].filter((g) => g.length >= 2);
      if (multi_.length) {
        const g = rng.pick(multi_); const pick = rng.pick(g); const corr = g.filter((x) => x !== pick);
        const wrong = names.filter((n) => !g.includes(n));
        if (corr.length >= 1 && wrong.length >= 3) {
          return { type: corr.length >= 2 ? 'multipla' : 'unica', text: `${intro}Quais nomes são **hard links** do mesmo arquivo que \`${pick}\` (além do próprio \`${pick}\`)?`, options: corr.length >= 2 ? multi(rng, corr.slice(0, 3), wrong, Math.min(3, wrong.length)) : mcq(rng, corr[0], wrong), explanation: `Hard links compartilham o **mesmo número de inode** (primeira coluna do \`ls -i\`) e por isso mostram a mesma contagem de links. Aqui o inode de \`${pick}\` é ${inoOf(sc.ents.get(pick), pick)}, compartilhado por: ${g.join(', ')}. Links simbólicos têm inode próprio e começam com \`l\`.`, ref: ['101:p.529-534'], verify: ver };
        }
      }
    }
    if (fmt === 2 && syms.length) {
      const s = rng.pick(syms); const t = sc.ents.get(s).target;
      return { type: 'unica', text: `${intro}Para qual nome aponta o link simbólico \`${s}\`?`, options: mcq(rng, t, names.filter((x) => x !== t && x !== s).concat(['/etc/' + t, '../' + t])), explanation: `Em \`ls -l\`, um link simbólico aparece com \`l\` no início das permissões e a notação \`nome -> destino\`. O tamanho do link (${t.length}) é o número de caracteres do caminho de destino ("${t}"). Se o destino não existir mais no diretório, o link está quebrado.`, ref: ['101:p.529-534'], verify: ver };
    }
    if (syms.length) {
      const s = rng.pick(syms); const t = sc.ents.get(s).target;
      return { type: 'unica', text: `${intro}Por que o link simbólico \`${s}\` mostra o tamanho ${t.length}?`, options: mcq(rng, `Porque o tamanho de um link simbólico é o comprimento do caminho de destino (“${t}” tem ${t.length} caracteres)`, [`Porque ${s} tem ${t.length} blocos de dados`, `Porque ${t.length} é o número de hard links do destino`, `Porque ${t.length} é o número do inode do destino`, `Porque ${s} é uma cópia do arquivo de destino compactada`]), explanation: 'Um link simbólico é um arquivo especial cujo conteúdo é o **caminho do destino**; por isso o tamanho mostrado por `ls -l` é o comprimento desse texto, independentemente do tamanho do arquivo apontado.', ref: ['101:p.529-534'], verify: ver };
    }
    const nInodes = new Set(files.map((n) => sc.ents.get(n).ino)).size;
    return { type: 'unica', text: `${intro}Quantos arquivos regulares **distintos** (inodes diferentes) existem nesse diretório?`, options: mcq(rng, String(nInodes), uniq([String(files.length), String(names.length), String(nInodes + 1), String(Math.max(1, nInodes - 1)), '1']).filter((x) => x !== String(nInodes))), explanation: `Hard links são nomes diferentes para o mesmo inode: ${files.length} nomes de arquivos regulares, ${nInodes} inodes distintos.`, ref: ['101:p.529-534'], verify: ver };
  },
};

const linkConcepts = tableGen({
  id: 'link-concepts', obj: '104.6', nivel: 2, peso: 3, ref: ['101:p.529-534'],
  rows: [
    (rng) => {
      const nm = rng.pick(['relatorio_final.txt', 'configuracao.ini', 'backup.tar.gz', 'a.txt', 'dados_2024_completos.csv']);
      return { q: `Um link simbólico criado com \`ln -s ${nm} atalho\` aparece em \`ls -l\` com qual tamanho (em bytes)?`, ok: String(nm.length), bad: uniq([String(nm.length + 1), String(nm.length - 1), '4096', '0', '1', String(nm.length * 2)]).filter((x) => x !== String(nm.length)), why: `O conteúdo de um link simbólico é o texto do caminho de destino; "${nm}" tem ${nm.length} caracteres, e esse é o tamanho mostrado (o arquivo apontado pode ter qualquer tamanho).`, verify: { sh: `d=$(mktemp -d); cd "$d"; touch ${nm}; ln -s ${nm} atalho; stat -c %s atalho`, expect: String(nm.length) } };
    },
    { q: 'O arquivo original `dados.txt` tem um hard link `copia.txt` e um link simbólico `atalho.txt` apontando para ele. Depois de `rm dados.txt`, o que acontece com `cat copia.txt` e `cat atalho.txt`?', ok: 'copia.txt continua mostrando o conteúdo; atalho.txt falha com "No such file or directory"', bad: ['Ambos continuam mostrando o conteúdo', 'Ambos falham, pois o original foi apagado', 'copia.txt falha e atalho.txt continua mostrando o conteúdo', 'Ambos mostram o conteúdo, mas atalho.txt fica somente leitura'], why: 'O `rm` remove um nome. Os dados só são liberados quando a contagem de hard links chega a zero; o hard link `copia.txt` ainda mantém o inode. O link simbólico guarda o **nome** `dados.txt`, que deixou de existir: fica quebrado.', verify: { sh: 'd=$(mktemp -d); cd "$d"; echo conteudo > dados.txt; ln dados.txt copia.txt; ln -s dados.txt atalho.txt; rm dados.txt; cat copia.txt; cat atalho.txt 2>&1 | sed "s/^cat: //"', expect: 'conteudo\natalho.txt: No such file or directory' } },
    { q: 'Qual mensagem o `ln` exibe ao tentar criar um **hard link para um diretório** (`ln pasta atalho`)?', ok: 'ln: pasta: hard link not allowed for directory', bad: ['ln: pasta: Permission denied', 'ln: pasta: Is a directory', 'ln: pasta: Too many links', 'Nenhuma: o link é criado normalmente'], why: 'Hard links para diretórios são proibidos (evitam ciclos na árvore). Para atalhos de diretórios use link simbólico: `ln -s pasta atalho`.', verify: { sh: 'd=$(mktemp -d); cd "$d"; mkdir pasta; ln pasta atalho 2>&1', expect: 'ln: pasta: hard link not allowed for directory' } },
    { q: 'Por que um hard link entre `/tmp/arquivo` e `/dev/shm/arquivo` (outro sistema de arquivos) falha com "Invalid cross-device link"?', ok: 'Porque um hard link é outro nome para o mesmo inode, e números de inode só têm significado dentro de um único sistema de arquivos', bad: ['Porque /dev/shm não permite criar arquivos', 'Porque hard links só podem apontar para diretórios', 'Porque o usuário precisa ser root para criar hard links entre diretórios', 'Porque o ln -s é obrigatório em /dev'], why: 'Hard links só existem dentro do mesmo sistema de arquivos. Links simbólicos guardam um caminho e por isso podem apontar para qualquer lugar, inclusive outro sistema de arquivos ou um caminho inexistente.', verify: { sh: 'd=$(mktemp -d); cd "$d"; touch f; ln f /dev/shm/hl_$$ 2>&1 | sed "s/.*: //"', expect: 'Invalid cross-device link' } },
    { q: 'Qual destes comandos cria um **link simbólico** chamado `atalho` apontando para `/var/log/syslog`?', ok: 'ln -s /var/log/syslog atalho', bad: ['ln /var/log/syslog atalho', 'ln -s atalho /var/log/syslog', 'ln -h /var/log/syslog atalho', 'link -s /var/log/syslog atalho'], why: 'A sintaxe é `ln -s DESTINO NOME-DO-LINK`. Sem `-s` o `ln` cria um hard link; invertendo os argumentos criaria `/var/log/syslog` apontando para `atalho` (ou falharia, pois o nome já existe).' },
    { q: 'O que `ln -s ../config/app.conf link` faz quando executado dentro de /srv/app/bin, e onde o caminho relativo é interpretado?', ok: 'Cria /srv/app/bin/link apontando para ../config/app.conf, interpretado a partir do diretório do próprio link (/srv/app/config/app.conf)', bad: ['O caminho relativo é interpretado a partir do diretório atual de quem lê o link, que pode variar', 'O caminho relativo é interpretado a partir de / (raiz)', 'O link só é válido se estiver no mesmo diretório que o destino', 'O ln converte automaticamente o caminho em absoluto'], why: 'O destino de um link simbólico relativo é resolvido a partir do **diretório onde o link está**, e não do diretório atual de quem o usa. Se o link for movido para outra pasta, ele pode quebrar.', verify: { sh: 'd=$(mktemp -d); cd "$d"; mkdir -p config bin; echo ok > config/app.conf; (cd bin && ln -s ../config/app.conf link); cat bin/link; mv bin/link .; cat link 2>&1 | sed "s/^cat: //"', expect: 'ok\nlink: No such file or directory' } },
    { q: 'Já existe um link simbólico `atalho` apontando para `a.txt`. Qual comando o redefine para apontar para `b.txt`?', ok: 'ln -sf b.txt atalho', bad: ['ln -s b.txt atalho', 'ln -r b.txt atalho', 'ln b.txt atalho', 'ln -s atalho b.txt'], why: 'Sem `-f`, `ln -s b.txt atalho` falha com "File exists". `-f` (force) remove o destino existente antes de criar o link. (`ln -sfn` é usado quando o destino do link é um diretório.)', verify: { sh: 'd=$(mktemp -d); cd "$d"; touch a.txt b.txt; ln -s a.txt atalho; ln -s b.txt atalho 2>&1 | sed "s/.*: //"; ln -sf b.txt atalho; readlink atalho', expect: 'File exists\nb.txt' } },
    { q: 'Qual comando mostra o número do inode de cada arquivo (útil para identificar hard links do mesmo arquivo)?', ok: 'ls -i', bad: ['ls -n', 'ls -l', 'ls -h', 'ls -L'], why: '`ls -i` imprime o inode antes do nome; `ls -li` junta com a listagem longa. Nomes que partilham o inode são hard links. `find / -samefile arquivo` ou `find / -inum NÚMERO` os procuram no sistema de arquivos.' },
    { q: 'Qual comando exibe diretamente o destino de um link simbólico (apenas o texto do alvo)?', ok: 'readlink atalho', bad: ['cat atalho', 'ls -i atalho', 'stat -f atalho', 'ln -t atalho'], why: '`readlink atalho` imprime o conteúdo do link; `readlink -f` resolve todos os níveis e devolve o caminho absoluto canônico. `cat atalho` mostraria o conteúdo do arquivo **apontado**.', verify: { sh: 'd=$(mktemp -d); cd "$d"; ln -s /etc/hostname atalho; readlink atalho', expect: '/etc/hostname' } },
    { q: 'Qual a diferença prática entre `cp a.txt b.txt` e `ln a.txt b.txt`?', ok: 'cp cria um arquivo novo e independente (outro inode, contagem de links 1); ln cria outro nome para o mesmo arquivo (mesmo inode, contagem de links 2)', bad: ['cp cria outro nome para o mesmo inode; ln duplica os dados', 'Ambos criam cópias independentes, mas o ln é mais rápido', 'ln só funciona para arquivos vazios', 'cp preserva a contagem de links do original; ln a reinicia'], why: 'Depois de `cp`, editar `b.txt` não afeta `a.txt`. Depois de `ln`, os dois nomes são o mesmo arquivo: qualquer alteração aparece em ambos e os dados só somem quando o último nome é removido.', verify: { sh: 'd=$(mktemp -d); cd "$d"; echo x > a.txt; cp a.txt c.txt; ln a.txt b.txt; echo "$(stat -c %h a.txt) $(stat -c %h c.txt) $([ a.txt -ef b.txt ] && echo igual) $([ a.txt -ef c.txt ] && echo igual || echo diferente)"', expect: '2 1 igual diferente' } },
    { q: 'Qual comando lista todos os caminhos (dentro do sistema de arquivos atual) que são hard links do arquivo `/srv/dados.bin`?', ok: 'find / -xdev -samefile /srv/dados.bin', bad: ['find / -type l -name dados.bin', 'find / -xdev -links /srv/dados.bin', 'ls -R / | grep /srv/dados.bin', 'find / -xdev -lname /srv/dados.bin'], why: '`-samefile` compara inode e dispositivo (`-inum` usa só o número do inode). `-lname` procura links simbólicos pelo destino; `-links N` filtra pela contagem de links.' },
    { q: 'Em `ls -l`, como se distingue um link simbólico de um arquivo regular e de um hard link?', ok: 'O link simbólico começa com "l" nas permissões e mostra "nome -> destino"; um hard link é indistinguível de um arquivo regular, a não ser pela contagem de links maior que 1', bad: ['O hard link mostra "->" e o link simbólico não', 'Hard links começam com "h" nas permissões', 'O link simbólico sempre tem permissões 777 e tamanho zero', 'Não há como distinguir links simbólicos em ls -l'], why: 'Hard link = outro nome do mesmo arquivo: nada o marca como link além da contagem (2ª coluna). Link simbólico = tipo `l`, permissões `lrwxrwxrwx` (as reais são as do destino) e `-> destino`.' },
  ],
});

export const linkGens = [linkCount, linkLsRead, linkConcepts];


// ═════════════════════════════════════════════ 104.7 ═════════════════════════════════════════════
const FHS = [
  { d: '/bin', g: 'bin', sc: 'comandos essenciais, disponíveis a todos os usuários, necessários até com o sistema em modo de manutenção (ls, cp, cat...)', why: 'Binários essenciais para todos os usuários. Em distribuições com *usrmerge* é apenas um link para /usr/bin.' },
  { d: '/sbin', g: 'bin', sc: 'binários de administração do sistema essenciais ao boot e à recuperação (fdisk, fsck, ip...)', why: 'Binários de sistema (administração), tradicionalmente usados pelo root.' },
  { d: '/usr/bin', g: 'bin', sc: 'a maior parte dos comandos de usuário instalados pela distribuição (não essenciais ao boot)', why: 'Comandos de usuário não essenciais ao boot; em sistemas com *usrmerge* abriga também o conteúdo de /bin.' },
  { d: '/usr/sbin', g: 'bin', sc: 'comandos de administração não essenciais ao boot (daemons e ferramentas de rede, por exemplo)', why: 'Binários de sistema não essenciais ao boot.' },
  { d: '/usr/local', g: 'opt', sc: 'programas compilados e instalados localmente pelo administrador (fora do gerenciador de pacotes)', why: '/usr/local é a hierarquia para software instalado localmente, com bin, lib, share etc., sem conflitar com os pacotes da distribuição.' },
  { d: '/opt', g: 'opt', sc: 'pacotes de software opcionais ou de terceiros, que trazem seu próprio diretório de binários e bibliotecas', why: '/opt guarda software opcional autocontido (cada aplicativo em /opt/nome).' },
  { d: '/srv', g: 'opt', sc: 'dados servidos pelo sistema, como páginas de um servidor web ou arquivos de um servidor FTP', why: '/srv contém dados de serviços fornecidos pelo sistema (por exemplo, /srv/www).' },
  { d: '/etc', g: 'etc', sc: 'arquivos de configuração específicos da máquina', why: '/etc guarda a configuração do host (texto), sem binários.' },
  { d: '/home', g: 'home', sc: 'arquivos pessoais e preferências dos usuários comuns', why: 'Cada usuário comum tem um diretório inicial em /home/nome.' },
  { d: '/root', g: 'home', sc: 'o diretório inicial do superusuário', why: 'O diretório pessoal do root fica em /root (fora de /home, para estar disponível mesmo que /home esteja em outra partição).' },
  { d: '/boot', g: 'boot', sc: 'o kernel, o initrd e os arquivos do carregador de inicialização', why: '/boot reúne kernels, imagens initrd/initramfs e arquivos do GRUB.' },
  { d: '/boot/efi', g: 'boot', sc: 'ponto de montagem da partição de sistema EFI (ESP)', why: 'A ESP (FAT) é montada em /boot/efi em sistemas UEFI.' },
  { d: '/dev', g: 'virt', sc: 'arquivos de dispositivos (discos, terminais, /dev/null...)', why: '/dev contém os nós de dispositivos, criados dinamicamente pelo udev.' },
  { d: '/proc', g: 'virt', sc: 'um pseudo-sistema de arquivos com informações de processos e do kernel', why: '/proc é virtual (procfs): processos em /proc/PID e informações como /proc/cpuinfo.' },
  { d: '/sys', g: 'virt', sc: 'um pseudo-sistema de arquivos (sysfs) com o modelo de dispositivos e informações do kernel ligadas ao hardware', why: '/sys expõe dispositivos, drivers e barramentos.' },
  { d: '/run', g: 'tmp', sc: 'dados voláteis de execução, como arquivos .pid e sockets, limpos a cada boot', why: '/run é um tmpfs recriado a cada boot; substituiu /var/run (que costuma ser um link para ele).', chk: 'readlink -f /var/run' },
  { d: '/tmp', g: 'tmp', sc: 'arquivos temporários que não precisam sobreviver à execução do programa e que podem ser apagados na inicialização', why: 'Arquivos em /tmp não devem ser preservados entre execuções; a recomendação é limpá-lo no boot.' },
  { d: '/var/tmp', g: 'tmp', sc: 'arquivos temporários que devem **persistir** entre reinicializações do sistema', why: '/var/tmp não é limpo no boot, ao contrário de /tmp e /run.' },
  { d: '/var/log', g: 'var', sc: 'os arquivos de log do sistema e dos serviços', why: '/var/log guarda os logs (syslog, auth.log, journal persistente...).' },
  { d: '/var/spool', g: 'var', sc: 'filas de tarefas aguardando processamento, como impressão, e-mail e cron', why: '/var/spool guarda filas (cups, mail, cron...).' },
  { d: '/var/cache', g: 'var', sc: 'dados de cache de aplicativos, que podem ser regenerados', why: '/var/cache guarda caches (por exemplo, pacotes baixados pelo apt) que podem ser apagados.' },
  { d: '/var/lib', g: 'var', sc: 'dados de estado dos programas, como bancos de dados e a base do gerenciador de pacotes', why: '/var/lib guarda o estado persistente (por exemplo, /var/lib/dpkg, /var/lib/mysql).' },
  { d: '/mnt', g: 'mnt', sc: 'ponto de montagem para sistemas de arquivos montados manualmente e de forma temporária', why: '/mnt é o ponto tradicional para montagens temporárias feitas pelo administrador.' },
  { d: '/media', g: 'mnt', sc: 'pontos de montagem de mídias removíveis (pendrives, DVDs), normalmente em /media/usuário/rótulo', why: 'Os ambientes de desktop montam as mídias removíveis em /media.' },
  { d: '/lib', g: 'lib', sc: 'bibliotecas compartilhadas necessárias para o boot e para os binários de /bin e /sbin', why: '/lib reúne as bibliotecas essenciais (em muitas distribuições é link para /usr/lib).' },
  { d: '/usr/share', g: 'lib', sc: 'dados independentes de arquitetura, como páginas de manual e documentação', why: '/usr/share guarda man pages (/usr/share/man), documentação e dados compartilhados.' },
  { d: '/usr/include', g: 'lib', sc: 'arquivos de cabeçalho (.h) usados na compilação de programas', why: '/usr/include contém os cabeçalhos da linguagem C e de bibliotecas.' },
];
const fhsDir = {
  id: 'fhs-dir', obj: '104.7', nivel: 2, peso: 3,
  make(rng) {
    const e = rng.pick(FHS);
    const sameG = FHS.filter((x) => x.d !== e.d && x.g === e.g).map((x) => x);
    const others = FHS.filter((x) => x.d !== e.d && x.g !== e.g);
    const poolE = [...sameG, ...rng.shuffle(others)].slice(0, 8);
    const chk = (d) => ({ sh: d.chk ?? `test -d ${d.d} && echo ok`, expect: d.chk ? '/run' : 'ok' });
    const verify = e.d === '/boot/efi' ? null : chk(e);
    const cap = (x) => x[0].toUpperCase() + x.slice(1);
    if (rng.chance(0.6)) {
      const pool = poolE.map((x) => x.d);
      return { type: 'unica', text: `Segundo o FHS, qual diretório é o local adequado para ${e.sc}?`, options: mcq(rng, e.d, pool), explanation: `\`${e.d}\`: ${e.why}`, ref: ['101:p.545-548'], ...(verify ? { verify } : {}) };
    }
    return { type: 'unica', text: `Segundo o FHS, qual é a finalidade do diretório \`${e.d}\`?`, options: mcq(rng, cap(e.sc), poolE.map((x) => cap(x.sc))), explanation: `\`${e.d}\`: ${e.why}`, ref: ['101:p.545-548'], verify };
  },
};

// ───────── find: avaliador de um subconjunto de testes, conferido contra o find real ─────────
const FDIRS = ['', 'docs/', 'logs/', 'docs/antigo/'];
const FBASE = ['relatorio', 'notas', 'backup', 'config', 'sistema', 'acesso', 'erro', 'dados'];
const FEXT = ['.txt', '.log', '.conf', '.tar.gz', '.csv', '.md'];
const FSIZES = [0, 512, 2048, 10240, 51200, 204800, 3145728];
const FMODES = [0o644, 0o600, 0o755, 0o664, 0o640];
const FAGES = [0, 1, 3, 8, 20, 45];
const unitSize = (bytes, u) => Math.ceil(bytes / ({ c: 1, k: 1024, M: 1024 * 1024 }[u]));
const sizeLabel = (b) => (b === 0 ? '0' : b < 1024 ? `${b} B` : b < 1048576 ? `${b / 1024} KiB` : `${b / 1048576} MiB`);
function globToRe(p, ci) {
  let s = '^';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') s += '.*'; else if (c === '?') s += '.'; else if (c === '[') { const j = p.indexOf(']', i); s += p.slice(i, j + 1); i = j; } else s += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`${s}$`, ci ? 'i' : '');
}
const findEval = {
  id: 'find-eval', obj: '104.7', nivel: 3, peso: 3,
  make(rng) {
    for (let attempt = 0; attempt < 800; attempt++) {
      const n = rng.int(7, 9); const files = []; const used = new Set();
      while (files.length < n) {
        const dir = rng.pick(FDIRS); const name = `${rng.pick(FBASE)}${rng.chance(0.3) ? rng.int(1, 9) : ''}${rng.pick(FEXT)}`;
        const path = `./${dir}${name}`; if (used.has(path)) continue; used.add(path);
        files.push({ path, name, depth: dir.split('/').filter(Boolean).length + 1, size: rng.pick(FSIZES), mode: rng.pick(FMODES), age: rng.pick(FAGES) });
      }
      const tests = [];
      const cand = [
        () => { const p = rng.pick(['*.txt', '*.log', '*.conf', 'rel*', '*[0-9]*', '*.tar.gz', 'b*', '?????.*', '*o*.csv']); const ci = rng.chance(0.2); return { t: `-${ci ? 'i' : ''}name '${ci ? p.toUpperCase().replace(/\[0-9\]/, '[0-9]') : p}'`, f: (x) => globToRe(ci ? p.toUpperCase().replace(/\[0-9\]/, '[0-9]') : p, ci).test(x.name) }; },
        () => { const op = rng.pick(['+', '-']); const u = rng.pick(['k', 'k', 'M']); const v = u === 'k' ? rng.pick([1, 4, 10, 100]) : rng.pick([1, 2]); return { t: `-size ${op}${v}${u}`, f: (x) => (op === '+' ? unitSize(x.size, u) > v : unitSize(x.size, u) < v) }; },
        () => { const op = rng.pick(['+', '-', '']); const v = rng.pick([2, 4, 7, 10]); return { t: `-mtime ${op}${v}`, f: (x) => (op === '+' ? x.age > v : op === '-' ? x.age < v : x.age === v) }; },
        () => { const m = rng.pick([0o644, 0o755, 0o600]); const atLeast = rng.chance(0.5); return { t: `-perm ${atLeast ? '-' : ''}${m.toString(8)}`, f: (x) => (atLeast ? (x.mode & m) === m : x.mode === m) }; },
        () => { const d = rng.int(1, 2); return { t: `-maxdepth ${d}`, f: (x) => x.depth <= d, global: true }; },
      ];
      const k = rng.int(2, 3);
      for (const c of rng.sample(cand, k)) tests.push(c());
      const globals = tests.filter((t) => t.global); const normal = tests.filter((t) => !t.global);
      if (globals.length > 1) continue;
      const matched = files.filter((x) => tests.every((t) => t.f(x)));
      const rest = files.filter((x) => !matched.includes(x));
      if (matched.length < 2 || matched.length > 3 || rest.length < 3) continue;
      const cmd = `find . ${globals.map((g) => g.t).join(' ')}${globals.length ? ' ' : ''}-type f ${normal.map((t) => t.t).join(' ')}`.replace(/ +/g, ' ').trim();
      const table = ['caminho                          tamanho    modo  idade (dias)', ...files.map((x) => `${x.path.padEnd(32)} ${sizeLabel(x.size).padEnd(10)} ${x.mode.toString(8)}  ${x.age} d + 12 h`)].join('\n');
      const mk = [`d=$(mktemp -d); cd "$d"`, ...files.map((x) => `mkdir -p "$(dirname ${sq(x.path)})"; head -c ${x.size} /dev/zero > ${sq(x.path)}; chmod ${x.mode.toString(8)} ${sq(x.path)}; touch -d "${x.age * 24 + 12} hours ago" ${sq(x.path)}`)].join('\n');
      const sorted = matched.map((x) => x.path).sort();
      const why = `Os testes são combinados com **E**: cada arquivo precisa satisfazer todos. ${tests.map((t) => `\`${t.t}\``).join(', ')}. Detalhes: \`-name\` diferencia maiúsculas de minúsculas (\`-iname\` não) e casa só com o nome base; \`-size +Nk\` compara o tamanho **arredondado para cima** em unidades de N (um arquivo de 512 bytes ocupa 1k); \`-mtime +N\` usa dias inteiros (24 h) truncados — um arquivo de 3 dias e 12 h tem idade 3: casa com \`-mtime 3\`, \`-mtime +2\` e \`-mtime -4\`; \`-perm 644\` exige modo exato e \`-perm -644\` exige pelo menos esses bits; \`-maxdepth N\` limita a profundidade (os arquivos do diretório inicial estão no nível 1). Resultado: ${sorted.join(', ')}.`;
      return {
        type: 'multipla',
        text: `Em um diretório existem os arquivos regulares abaixo (idade = tempo desde a última modificação):\n\n${block(table)}\n\nQuais arquivos são exibidos pelo comando abaixo, executado nesse diretório?\n\n${block(cmd)}`,
        options: multi(rng, sorted, rest.map((x) => x.path), matched.length === 2 ? 3 : 3),
        explanation: why, ref: ['101:p.548-552'],
        verify: { sh: `${mk}\n${cmd} | sort | tr '\\n' ' '`, expect: sorted.join(' ') },
      };
    }
    throw new Error('find-eval: não achou combinação');
  },
};

const findTools = tableGen({
  id: 'find-tools', obj: '104.7', nivel: 2, peso: 3, ref: ['101:p.548-556'],
  rows: [
    { q: 'Qual é a diferença entre `find` e `locate`?', ok: 'O find percorre o sistema de arquivos em tempo real; o locate consulta um banco de dados criado pelo updatedb (rápido, mas pode estar desatualizado)', bad: ['O find consulta um banco de dados; o locate percorre o sistema de arquivos', 'O locate só acha arquivos criados hoje; o find, os antigos', 'O find só procura por nome; o locate só procura por tamanho', 'São o mesmo programa com nomes diferentes'], why: '`find` examina o disco a cada execução (lento, mas exato e com muitos filtros: tamanho, dono, permissões, datas). `locate` usa o banco gerado pelo `updatedb` (normalmente por cron/timer) e por isso é rápido, porém só conhece o que existia na última atualização.' },
    { q: 'Um arquivo criado há 5 minutos não aparece em `locate relatorio`. Qual comando resolve (como root)?', ok: 'updatedb', bad: ['locate --refresh', 'find / -update', 'ldconfig', 'mandb'], why: '`updatedb` reconstrói o banco do locate (mlocate/plocate). `ldconfig` atualiza o cache de bibliotecas e `mandb`, o índice das páginas de manual.' },
    { q: 'O `locate` ainda mostra um arquivo que já foi apagado. Qual opção faz o locate mostrar apenas arquivos que existem de fato?', ok: 'locate -e', bad: ['locate -c', 'locate -i', 'locate -A', 'locate -r'], why: '`-e` (existing) verifica se cada arquivo ainda existe antes de imprimir. `-c` conta, `-i` ignora maiúsculas/minúsculas e `-A` exige que todos os padrões casem.' },
    { q: 'Qual opção do `locate` faz a busca ignorar a diferença entre maiúsculas e minúsculas?', ok: 'locate -i padrão', bad: ['locate -I padrão', 'locate -n padrão', 'locate -u padrão', 'locate -s padrão'], why: 'Por padrão o `locate` diferencia maiúsculas de minúsculas; `-i` (ignore-case) desativa isso. Ele procura o padrão em qualquer parte do caminho (não só na extensão).' },
    { q: 'Qual arquivo de configuração controla o que o `updatedb` indexa ou ignora?', ok: '/etc/updatedb.conf', bad: ['/etc/locate.conf', '/var/lib/mlocate/updatedb.cfg', '/etc/cron.daily/locate', '/etc/mlocate.rc'], why: 'O /etc/updatedb.conf define `PRUNEFS` (tipos de sistema de arquivos ignorados), `PRUNENAMES` (nomes de diretório ignorados), `PRUNEPATHS` (caminhos ignorados) e `PRUNE_BIND_MOUNTS`.' },
    (rng) => {
      const fs = rng.pick(['ntfs', 'nfs', 'iso9660', 'tmpfs', 'vfat']);
      return { q: `Qual linha do /etc/updatedb.conf impede o updatedb de indexar sistemas de arquivos do tipo ${fs}?`, ok: `PRUNEFS="${fs}"`, bad: [`PRUNEPATHS="${fs}"`, `PRUNENAMES="${fs}"`, `PRUNE_BIND_MOUNTS="${fs}"`, `SKIPFS="${fs}"`], why: `\`PRUNEFS\` lista os **tipos** de sistema de arquivos a ignorar (separados por espaço, sem diferenciar maiúsculas). Os valores ficam entre aspas. \`PRUNEPATHS\` lista caminhos (ex.: \`/var/spool /media\`), \`PRUNENAMES\` nomes de diretório (ex.: \`.git\`), e \`PRUNE_BIND_MOUNTS="yes"\` ignora montagens bind.` };
    },
    (rng) => {
      const p = rng.pick(['/var/spool', '/media', '/mnt', '/tmp', '/proc']);
      return { q: `Qual linha do /etc/updatedb.conf faz o updatedb ignorar o caminho \`${p}\`?`, ok: `PRUNEPATHS="${p}"`, bad: [`PRUNEFS="${p}"`, `PRUNENAMES="${p}"`, `PRUNE_BIND_MOUNTS="${p}"`, `IGNORE="${p}"`], why: '`PRUNEPATHS` recebe caminhos completos (separados por espaço); `PRUNENAMES` recebe nomes de diretório em qualquer nível; `PRUNEFS` recebe tipos de sistema de arquivos.' };
    },
    { q: 'Qual a diferença entre `which`, `type` e `whereis`?', ok: 'which e type mostram o que será executado (type também reconhece aliases, funções e comandos internos do shell); whereis procura binários, páginas de manual e código-fonte', bad: ['which procura arquivos em todo o disco; whereis só no PATH', 'type só funciona para arquivos regulares; which reconhece aliases e funções', 'whereis consulta o banco do updatedb; which consulta o /etc/fstab', 'Os três fazem exatamente a mesma coisa'], why: '`which` busca executáveis no PATH (`-a` mostra todos). `type` é um comando do shell: informa se o nome é alias, função, builtin, palavra-chave ou arquivo (`-t` imprime só o tipo; `-a` todas as ocorrências). `whereis` mostra binário, manual e fonte (`-b`, `-m`, `-s` filtram).' },
    { q: 'Qual comando mostra apenas a localização da página de manual do comando `ls`?', ok: 'whereis -m ls', bad: ['whereis -b ls', 'which -m ls', 'type -m ls', 'locate -m ls'], why: '`whereis -b` limita a binários, `-m` a páginas de manual e `-s` a código-fonte. `which` e `type` não tratam de páginas de manual.' },
    { q: 'Qual comando lista todas as ocorrências de um executável chamado `python3` encontradas nos diretórios do PATH (não só a primeira)?', ok: 'which -a python3', bad: ['which -l python3', 'whereis -a python3', 'locate -a python3', 'type -p python3 --all'], why: '`which -a` (e `type -a`) mostram todas as ocorrências no PATH, na ordem de busca; sem `-a`, só a primeira.' },
    { q: 'Qual comando encontra, a partir do diretório atual, arquivos terminados em `.log` modificados nas últimas 24 horas?', ok: "find . -name '*.log' -mtime -1", bad: ["find . -name '*.log' -mtime +1", "find . -name *.log -mtime 24", "find . -iname '.log' -mtime -24", "find . -name '*.log' -atime 1"], why: '`-mtime -1` = modificado há menos de 1 período de 24 h; `+1` seria mais de 24 h; `-mtime 24` seria exatamente 24 dias. Coloque o padrão entre aspas para o shell não expandi-lo.' },
    { q: 'Qual comando encontra arquivos regulares **vazios** abaixo do diretório atual?', ok: 'find . -type f -empty', bad: ['find . -type f -size 1', 'find . -type f -null', 'find . -type f -zero', 'find . -type f -size +0'], why: '`-empty` casa arquivos regulares de tamanho zero e diretórios sem entradas. `-size +0` faz o contrário: arquivos com pelo menos 1 byte.' },
    { q: 'Qual comando lista os arquivos que pertencem ao usuário `ana` abaixo de /srv?', ok: 'find /srv -user ana', bad: ['find /srv -owner ana', 'find /srv -u ana', 'find /srv -name ana', 'find /srv -group ana'], why: '`-user` filtra pelo dono e `-group` pelo grupo. Não existe `-owner` em GNU find.' },
    { q: 'Qual comando encontra, abaixo de /var/log, arquivos maiores que 100 MiB?', ok: 'find /var/log -type f -size +100M', bad: ['find /var/log -type f -size 100M', 'find /var/log -type f -size +100m', 'find /var/log -type f -size -100M', 'find /var/log -type f -bigger 100M'], why: '`+100M` = maior que 100 MiB (o sufixo é `M` maiúsculo; `m` não existe); sem sinal seria exatamente 100 unidades arredondadas; `-100M` = menor.' },
    { q: 'Qual comando executa `ls -l` para cada arquivo `.conf` encontrado abaixo de /etc?', ok: "find /etc -name '*.conf' -exec ls -l {} \\;", bad: ["find /etc -name '*.conf' | ls -l", "find /etc -name '*.conf' -exec ls -l", "find /etc -name '*.conf' -run ls -l {}", "find /etc -name '*.conf' -exec ls -l {} |"], why: '`-exec comando {} \\;` executa o comando para cada resultado (`{}` é o arquivo); termina com `\\;` (ou `+` para agrupar vários arquivos por execução). Um pipe `| ls -l` ignora a lista de arquivos, pois o `ls` não lê nomes da entrada padrão.' },
  ],
});

const TYPE_ROWS = [['cd', 'builtin'], ['pwd', 'builtin'], ['echo', 'builtin'], ['if', 'keyword'], ['for', 'keyword'], ['[[', 'keyword'], ['ls', 'file'], ['grep', 'file'], ['mkdir', 'file'], ['type', 'builtin'], ['source', 'builtin'], ['exit', 'builtin']];
const typeCmd = {
  id: 'type-cmd', obj: '104.7', nivel: 2, peso: 2,
  make(rng) {
    const defAlias = rng.pick([['ll', "alias ll='ls -l'"], ['la', "alias la='ls -A'"], ['gs', "alias gs='git status'"]]);
    const defFn = rng.pick([['backup', 'backup() { tar czf "$1.tgz" "$1"; }'], ['hello', 'hello() { echo oi; }'], ['mkcd', 'mkcd() { mkdir -p "$1" && cd "$1"; }']]);
    const items = [...TYPE_ROWS.map(([n, t]) => ({ n, t, def: '' })), { n: defAlias[0], t: 'alias', def: defAlias[1] }, { n: defFn[0], t: 'function', def: defFn[1] }];
    const e = rng.pick(items);
    const TYPES = ['alias', 'keyword', 'function', 'builtin', 'file'];
    const setup = e.def ? `\`\`\`\n$ ${e.def}\n\`\`\`\n\n` : '';
    const verify = { sh: `shopt -s expand_aliases; ${e.def ? e.def + '; ' : ''}type -t ${sq(e.n)}`, expect: e.t };
    const explain = { alias: 'um apelido definido com `alias`', keyword: 'uma palavra reservada da sintaxe do shell', function: 'uma função definida no shell', builtin: 'um comando interno do shell', file: 'um arquivo executável encontrado no PATH' }[e.t];
    return { type: 'unica', text: `${setup}Qual é a saída de \`type -t ${e.n}\` no bash?`, options: mcq(rng, e.t, TYPES.filter((x) => x !== e.t)), explanation: `\`type -t\` imprime uma única palavra: \`alias\`, \`keyword\`, \`function\`, \`builtin\` ou \`file\`. \`${e.n}\` é ${explain}. Por isso \`which ${e.n}\` pode não achar nada (só procura arquivos no PATH), enquanto \`type\` conhece todas as categorias.`, ref: ['101:p.554-556'], verify };
  },
};

export const findGens = [fhsDir, findEval, findTools, typeCmd];

export const generators = [...mountGens, ...linkGens, ...findGens];
