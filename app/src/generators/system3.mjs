

// 104.1 partições e sistemas de arquivos, 104.2 integridade, ambos verificados com imagens de disco (arquivos) dentro do container.
import { mcq, multi, block, code, pad } from './util.mjs';
import { sq, uniq, tableGen, hex, L, ORDF } from './system.mjs';

// ═════════════════════════════════════════════ 104.1 ═════════════════════════════════════════════
const EN_ENTER = '<Enter>';
function fdiskScript(rng) {
  const label = rng.pick(['dos', 'gpt', 'dos']);
  const n = rng.int(2, 3);
  const sizes = rng.sample([20, 30, 40, 50, 60, 64, 80, 100], n);
  const parts = sizes.map((s) => ({ size: s, type: '83' }));
  const keys = [label === 'dos' ? 'o' : 'g'];
  parts.forEach((p, i) => {
    if (label === 'dos') keys.push('n', 'p', String(i + 1), '', `+${p.size}M`);
    else keys.push('n', '', '', `+${p.size}M`);
  });
  let boot = null;
  if (label === 'dos') {
    const nt = rng.int(0, 2);
    const idx = rng.sample([...parts.keys()], nt);
    for (const i of idx) { const t = rng.pick(['82', '8e', 'ef', 'fd']); parts[i].type = t; keys.push('t', String(i + 1), t); }
    if (rng.chance(0.6)) { boot = rng.int(0, n - 1); keys.push('a', String(boot + 1)); }
  }
  keys.push('w');
  return { label, parts, keys, boot };
}
const TYPE_NAME = { 83: 'Linux', 82: 'Linux swap / Solaris', '8e': 'Linux LVM', ef: 'EFI (FAT-12/16/32)', fd: 'Linux raid autodetect' };

const fdiskSession = {
  id: 'fdisk-session', obj: '104.1', nivel: 3, peso: 3,
  make(rng) {
    const s = fdiskScript(rng);
    const shown = s.keys.map((k) => (k === '' ? EN_ENTER : k)).join('\n');
    const run = `d=$(mktemp -d); cd "$d"; truncate -s 400M disk.img; printf '%s\\n' ${s.keys.map((k) => sq(k)).join(' ')} | fdisk disk.img >/dev/null 2>&1`;
    const intro = `Um administrador executou \`fdisk /dev/sdb\` (disco novo e vazio) e digitou, linha por linha, as teclas abaixo (\`${EN_ENTER}\` = tecla Enter, aceitando o valor padrão):\n\n${block(shown)}\n\n`;
    const fmts = ['label', 'count', 'size'];
    if (s.label === 'dos') fmts.push('type', 'type');
    if (s.boot !== null) fmts.push('boot');
    const f = rng.pick(fmts);
    const why0 = 'No fdisk: `o` cria uma tabela DOS (MBR) vazia e `g` uma GPT; `n` adiciona partição (em MBR pergunta tipo p/e, número, setor inicial e final; em GPT pergunta número, início e fim; `+50M` define o tamanho); `t` altera o tipo; `a` alterna o flag de inicialização; **`w` grava** e sai — sem `w` nada é gravado (`q` descarta tudo).';
    if (f === 'label') {
      return { type: 'unica', text: `${intro}Que tipo de tabela de partições o disco tem depois dessas teclas?`, options: mcq(rng, s.label === 'dos' ? 'MBR (DOS/msdos)' : 'GPT', [s.label === 'dos' ? 'GPT' : 'MBR (DOS/msdos)', 'BSD disklabel', 'Sun disklabel', 'LVM (volume group)']), explanation: `${why0} A primeira tecla foi \`${s.keys[0]}\`: ${s.label === 'dos' ? 'tabela DOS/MBR' : 'tabela GPT'}.`, ref: ['101:p.424-431'], verify: { sh: `${run}; fdisk -l disk.img | awk -F': ' '/Disklabel type/{print $2}'`, expect: s.label } };
    }
    if (f === 'count') {
      return { type: 'unica', text: `${intro}Quantas partições existem no disco depois da gravação?`, options: mcq(rng, String(s.parts.length), ['1', '2', '3', '4', '5', '0'].filter((x) => x !== String(s.parts.length))), explanation: `${why0} Cada bloco \`n\` cria uma partição: ${s.parts.length}.`, ref: ['101:p.424-431'], verify: { sh: `${run}; sfdisk -d disk.img | grep -c ' : start='`, expect: String(s.parts.length) } };
    }
    if (f === 'size') {
      const i = rng.int(0, s.parts.length - 1); const sz = s.parts[i].size;
      return { type: 'unica', text: `${intro}Qual é o tamanho da partição ${i + 1}, em MiB?`, options: mcq(rng, String(sz), uniq(s.parts.filter((_, j) => j !== i).map((p) => String(p.size)).concat([String(sz + 1), String(sz * 2), String(Math.round(sz / 2))])).filter((x) => x !== String(sz))), explanation: `${why0} Na ${ORDF[i]} criação o último setor foi \`+${sz}M\`, ou seja, ${sz} MiB a partir do primeiro setor livre (alinhado em 2048 setores = 1 MiB).`, ref: ['101:p.424-431'], verify: { sh: `${run}; sz=$(sfdisk -d disk.img | grep "disk.img${i + 1} :" | sed 's/.*size= *\\([0-9]*\\).*/\\1/'); echo $((sz / 2048))`, expect: String(sz) } };
    }
    if (f === 'type') {
      const i = rng.int(0, s.parts.length - 1); const t = s.parts[i].type;
      return { type: 'unica', text: `${intro}Qual é o Id (tipo, em hexadecimal) da partição ${i + 1} no final?`, options: mcq(rng, t, ['83', '82', '8e', 'ef', 'fd', '07', '0c'].filter((x) => x !== t)), explanation: `${why0} Sem \`t\`, o tipo padrão é \`83\` (Linux). Os mais comuns: \`83\` Linux, \`82\` swap, \`8e\` LVM, \`fd\` RAID autodetect, \`ef\` ESP (EFI), \`07\` NTFS/exFAT, \`0c\` FAT32. Neste roteiro a partição ${i + 1} é \`${t}\` (${TYPE_NAME[t]}).`, ref: ['101:p.424-431'], verify: { sh: `${run}; sfdisk --part-type disk.img ${i + 1}`, expect: t } };
    }
    return { type: 'unica', text: `${intro}Qual partição fica marcada como inicializável (coluna \`Boot\` com \`*\`) depois da gravação?`, options: mcq(rng, String(s.boot + 1), s.parts.map((_, j) => String(j + 1)).filter((x) => x !== String(s.boot + 1)).concat(['nenhuma', '4'])), explanation: `${why0} O comando \`a\` alterna o flag de inicialização da partição indicada (aqui, a ${s.boot + 1}).`, ref: ['101:p.424-431'], verify: { sh: `${run}; fdisk -l disk.img | awk '$2=="*"{print $1}' | sed 's/.*img//'`, expect: String(s.boot + 1) } };
  },
};

const FKEYS = [
  ['n', 'adicionar uma nova partição', 'add a new partition'], ['d', 'excluir uma partição', 'delete a partition'], ['p', 'imprimir (mostrar) a tabela de partições', 'print the partition table'],
  ['t', 'alterar o tipo de uma partição', 'change a partition type'], ['a', 'alternar o flag de inicialização (bootable)', 'toggle a bootable flag'], ['l', 'listar os tipos de partição conhecidos', 'list known partition types'],
  ['w', 'gravar a tabela no disco e sair', 'write table to disk and exit'], ['q', 'sair sem salvar as alterações', 'quit without saving changes'], ['o', 'criar uma nova tabela de partições DOS (MBR) vazia', 'create a new empty MBR (DOS) partition table'],
  ['g', 'criar uma nova tabela de partições GPT vazia', 'create a new empty GPT partition table'], ['m', 'exibir o menu de ajuda', 'print this menu'], ['v', 'verificar a tabela de partições', 'verify the partition table'],
];
const fdiskKeys = {
  id: 'fdisk-keys', obj: '104.1', nivel: 1, peso: 2,
  make(rng) {
    const [k, pt, en] = rng.pick(FKEYS);
    const verify = { sh: `d=$(mktemp -d); cd "$d"; truncate -s 10M a.img; printf 'm\\nq\\n' | fdisk a.img 2>&1 | grep -E '^ +${k} ' | sed 's/^ *//; s/  */ /g'`, expect: `${k} ${en}` };
    const cap = (x) => x[0].toUpperCase() + x.slice(1);
    const why = 'Comandos do menu interativo do fdisk: `n` nova, `d` excluir, `p` imprimir, `t` tipo, `a` boot, `l` tipos conhecidos, `o` nova tabela DOS/MBR, `g` nova tabela GPT, `v` verificar, `m` ajuda, **`w` grava e sai** e **`q` sai sem gravar**. Nada é alterado no disco até o `w`.';
    if (rng.chance(0.5)) {
      return { type: 'unica', text: `No menu interativo do \`fdisk\`, o que faz a tecla \`${k}\`?`, options: mcq(rng, cap(pt), FKEYS.filter((x) => x[0] !== k).map((x) => cap(x[1]))), explanation: `\`${k}\`: ${pt}. ${why}`, ref: ['101:p.424-431'], verify };
    }
    return { type: 'unica', text: `No menu interativo do \`fdisk\`, qual tecla serve para ${pt}?`, options: mcq(rng, k, FKEYS.filter((x) => x[0] !== k).map((x) => x[0])), explanation: `\`${k}\`: ${pt}. ${why}`, ref: ['101:p.424-431'], verify };
  },
};

const partedCmd = {
  id: 'parted-cmd', obj: '104.1', nivel: 2, peso: 2,
  make(rng) {
    const dev = '/dev/sdb';
    const a = rng.int(1, 20); const b = a + rng.int(10, 60);
    const label = rng.pick(['gpt', 'msdos']);
    const img = (cmd) => cmd.replace(dev, '"$d/p.img"');
    const pre = 'd=$(mktemp -d); cd "$d"; truncate -s 100M p.img; ';
    const lblSh = (l) => `parted -s p.img mklabel ${l} 2>/dev/null; `;
    const rows = [
      { t: `Criar uma tabela de partições **GPT** no disco ${dev}`, ok: `parted ${dev} mklabel gpt`, bad: [`parted ${dev} mklabel mbr`, `parted ${dev} mkpart gpt`, `parted ${dev} set gpt on`, `parted ${dev} mkfs gpt`], v: [`${pre}parted -s p.img mklabel gpt 2>/dev/null; parted -s p.img print 2>/dev/null | grep 'Partition Table'`, 'Partition Table: gpt'], w: '`mklabel TIPO` (ou `mktable`) cria a tabela de partições: `gpt` ou `msdos` (MBR). Não existe tipo "mbr" nem "dos": o nome correto é `msdos`.' },
      { t: `Criar uma tabela de partições **MBR** no disco ${dev}`, ok: `parted ${dev} mklabel msdos`, bad: [`parted ${dev} mklabel mbr`, `parted ${dev} mklabel dos`, `parted ${dev} mkpart msdos`, `parted ${dev} mklabel mbr-gpt`], v: [`${pre}parted -s p.img mklabel msdos 2>/dev/null; parted -s p.img print 2>/dev/null | grep 'Partition Table'`, 'Partition Table: msdos'], w: 'No parted a tabela MBR chama-se `msdos`: `parted /dev/sdb mklabel msdos`.' },
      { t: `Criar uma partição **primária** com sistema de arquivos ext4 de ${a}MiB até ${b}MiB em ${dev} (disco com tabela MBR)`, ok: `parted ${dev} mkpart primary ext4 ${a}MiB ${b}MiB`, bad: [`parted ${dev} mkpart primary ext4 ${a}MiB +${b - a}MiB`, `parted ${dev} mkpart ext4 ${a}MiB ${b}MiB primary`, `parted ${dev} mkpart primary ${a}MiB ${b}MiB ext4`, `parted ${dev} mkfs primary ext4 ${a}MiB ${b}MiB`], v: [`${pre}${lblSh('msdos')}parted -s p.img mkpart primary ext4 ${a}MiB ${b}MiB 2>/dev/null; parted -s p.img print 2>/dev/null | grep -c '^ 1'`, '1'], w: 'Sintaxe: `mkpart TIPO-OU-NOME [SISTEMA-DE-ARQUIVOS] INÍCIO FIM`. **FIM é uma posição** (não um tamanho): `' + `${a}MiB ${b}MiB` + '` cria uma partição de ' + `${b - a}` + ' MiB. O sistema de arquivos informado é só um rótulo de tipo: o `mkfs` ainda precisa ser executado.' },
      { t: `Qual será o tamanho da partição criada por \`parted ${dev} mkpart primary ext4 ${a}MiB ${b}MiB\`?`, ok: `${b - a} MiB`, bad: [`${b} MiB`, `${a} MiB`, `${b + a} MiB`, `${b - a + 1} MiB`], full: true, v: [`${pre}${lblSh('msdos')}parted -s p.img mkpart primary ext4 ${a}MiB ${b}MiB 2>/dev/null; parted -s p.img unit MiB print 2>/dev/null | awk '$1==1{print $4}'`, `${b - a}.0MiB`], w: 'No `mkpart` os dois últimos argumentos são **início e fim** (posições no disco). O tamanho é fim − início: ' + `${b} − ${a} = ${b - a} MiB.` },
      { t: `Remover a partição número 2 de ${dev}`, ok: `parted ${dev} rm 2`, bad: [`parted ${dev} delete 2`, `parted ${dev} rmpart 2`, `parted ${dev} rm ${dev}2`, `parted ${dev} mkpart 2 remove`], v: [`${pre}${lblSh('gpt')}parted -s p.img mkpart a ext4 1MiB 20MiB mkpart b ext4 20MiB 40MiB rm 2 2>/dev/null; parted -s p.img print 2>/dev/null | grep -c '^ [0-9]'`, '1'], w: '`rm NÚMERO` remove a partição pelo número. Como o parted grava na hora, a remoção é imediata e irreversível.' },
      { t: label === 'gpt' ? `Marcar a partição 1 de ${dev} (tabela GPT) como partição de sistema EFI (ESP)` : `Marcar a partição 1 de ${dev} (tabela MBR) como inicializável (boot)`, ok: label === 'gpt' ? `parted ${dev} set 1 esp on` : `parted ${dev} set 1 boot on`, bad: label === 'gpt' ? [`parted ${dev} set 1 efi on`, `parted ${dev} flag 1 esp`, `parted ${dev} mkpart esp 1`, `parted ${dev} set esp 1 on`] : [`parted ${dev} set boot 1 on`, `parted ${dev} flag 1 boot`, `parted ${dev} mkpart boot 1`, `parted ${dev} set 1 active on`], v: [`${pre}${lblSh(label)}parted -s p.img mkpart primary ext4 1MiB 40MiB set 1 ${label === 'gpt' ? 'esp' : 'boot'} on 2>/dev/null; parted -s p.img print 2>/dev/null | grep -c '${label === 'gpt' ? 'esp' : 'boot'}'`, '1'], w: '`set NÚMERO FLAG on|off`: o número da partição vem antes do nome do flag. Em GPT o flag da partição EFI é `esp` (ou `boot`); em MBR, `boot` marca a partição ativa.' },
      { t: `Listar a tabela de partições de **todos** os discos que o parted encontrar, sem entrar no modo interativo`, ok: 'parted -l', bad: ['parted print all', 'parted --all', 'parted -a', 'parted list'], v: ['parted --help | grep -c -- "-l, --list"', '1'], w: '`parted -l` (`--list`) mostra os discos e suas tabelas de partições; `parted DISCO print` mostra apenas um disco.' },
      { t: `Depois de executar \`parted ${dev} mkpart primary ext4 1MiB 40MiB\`, a partição já foi gravada no disco ou é preciso um comando de gravação (como o \`w\` do fdisk)?`, ok: 'Já foi gravada: o parted aplica cada comando imediatamente', bad: ['Só será gravada depois do comando write', 'Só será gravada depois de parted /dev/sdb commit', 'Só será gravada depois do próximo reboot', 'Só será gravada depois de mkfs.ext4 na partição'], full: true, v: [`${pre}${lblSh('msdos')}parted -s p.img mkpart primary ext4 1MiB 40MiB 2>/dev/null; parted -s p.img print 2>/dev/null | grep -c '^ 1'`, '1'], w: 'Diferente do `fdisk`/`gdisk`, o `parted` altera a tabela de partições imediatamente a cada comando, sem etapa de confirmação — cuidado com o disco informado. Em seguida é preciso criar o sistema de arquivos com `mkfs`.' },
    ];
    const r = rng.pick(rows);
    const lead = r.full ? '' : 'Qual comando do GNU Parted realiza a tarefa a seguir?\n\n';
    const out = { type: 'unica', text: `${lead}${r.t}`, options: mcq(rng, r.ok, r.bad), explanation: `${r.full ? '' : `\`${r.ok}\`. `}${r.w}`, ref: ['101:p.442-449'] };
    if (r.v) out.verify = { sh: r.v[0], expect: r.v[1] };
    return out;
  },
};

const mkfsCmd = {
  id: 'mkfs-cmd', obj: '104.1', nivel: 2, peso: 3,
  make(rng) {
    const dev = rng.pick(['/dev/sdb1', '/dev/sdc1', '/dev/vdb1', '/dev/nvme0n1p3']);
    const lab = rng.pick(['DADOS', 'BACKUP', 'FOTOS', 'WEB', 'PROJETOS', 'ARQUIVO']);
    const labl = lab.toLowerCase();
    const mk = (size, cmd, expect) => ({ sh: `d=$(mktemp -d); cd "$d"; truncate -s ${size}M f.img; ${cmd.split(dev).join('f.img')} >/dev/null 2>&1; chmod 600 f.img; blkid -o value -s LABEL -s TYPE f.img | tr '\\n' ' '`, expect });
    const ext4 = rng.pick([`mkfs.ext4 -L ${labl} ${dev}`, `mkfs -t ext4 -L ${labl} ${dev}`]);
    const ext4Alt = ext4.startsWith('mkfs.') ? `mkfs -t ext4 -L ${labl} ${dev}` : `mkfs.ext4 -L ${labl} ${dev}`;
    const ext3 = rng.pick([`mkfs.ext3 ${dev}`, `mke2fs -j ${dev}`, `mkfs -t ext3 ${dev}`]);
    const ext3All = [`mkfs.ext3 ${dev}`, `mke2fs -j ${dev}`, `mkfs -t ext3 ${dev}`, `mke2fs -t ext3 ${dev}`];
    const rows = [
      { t: `Criar um sistema de arquivos **ext4** com o rótulo \`${labl}\` em ${dev}`, ok: ext4, bad: [`mkfs.ext4 -l ${labl} ${dev}`, `mkfs.ext4 -n ${labl} ${dev}`, `mkfs.ext4 -t ${labl} ${dev}`, `mkfs.ext4 ${labl} ${dev}`, `mkfs -t ext4 -l ${labl} ${dev}`].filter((x) => x !== ext4Alt), v: mk(64, ext4, `${labl} ext4`), w: 'O rótulo no mke2fs/mkfs.ext4 é `-L` (maiúsculo). `-l` lê uma lista de blocos defeituosos de um arquivo. `mkfs -t ext4 ...` é equivalente a `mkfs.ext4 ...`, pois o `mkfs` apenas chama o `mkfs.<tipo>`.' },
      { t: `Criar um sistema de arquivos **ext3** (ext2 com journal) em ${dev}`, ok: ext3, bad: [`mkfs.ext4 -j ${dev}`, `mkfs.ext2 -j ${dev}`.replace('mkfs.ext2 -j', 'mkfs.ext2 -t ext4'), `mkfs.jfs ${dev}`, `mkfs.xfs -j ${dev}`, `mkfs.ext2 ${dev}`].filter((x) => !ext3All.includes(x)), v: mk(64, ext3, 'ext3'), w: 'O ext3 é o ext2 acrescido de journal: `mkfs.ext3`, `mkfs -t ext3` ou `mke2fs -j`. O ext4 acrescenta extents e outros recursos; o `mkfs.ext2` cria sem journal.' },
      { t: `Criar um sistema de arquivos **XFS** com o rótulo \`${labl.slice(0, 8)}\` em ${dev}`, ok: `mkfs.xfs -L ${labl.slice(0, 8)} ${dev}`, bad: [`mkfs.xfs -l ${labl.slice(0, 8)} ${dev}`, `mkfs.xfs -n ${labl.slice(0, 8)} ${dev}`, `mkfs.xfs --label ${labl.slice(0, 8)} ${dev}`, `mkxfs -L ${labl.slice(0, 8)} ${dev}`], v: mk(320, `mkfs.xfs -L ${labl.slice(0, 8)} ${dev}`, `${labl.slice(0, 8)} xfs`), w: '`mkfs.xfs -L RÓTULO DISPOSITIVO` (o rótulo do XFS tem no máximo 12 caracteres). O XFS exige um dispositivo grande (mínimo de 300 MB nas versões atuais). `-l` configura o log (journal).' },
      { t: `Criar um sistema de arquivos **FAT32** (vfat) com o rótulo \`${lab}\` em ${dev}`, ok: `mkfs.vfat -F 32 -n ${lab} ${dev}`, bad: [`mkfs.vfat -F 32 -L ${lab} ${dev}`, `mkfs.vfat -32 -n ${lab} ${dev}`, `mkfs.fat -f 32 -n ${lab} ${dev}`.replace('mkfs.fat', 'mkfs.vfat'), `mkfs.fat32 -n ${lab} ${dev}`], v: mk(64, `mkfs.vfat -F 32 -n ${lab} ${dev}`, `${lab} vfat`), w: 'No `mkfs.vfat` (`mkfs.fat`) `-F` escolhe o tamanho da FAT (12, 16 ou 32) e o rótulo é `-n`. O vfat é usado na ESP e em pendrives compatíveis com Windows.' },
      { t: `Criar um sistema de arquivos **exFAT** com o rótulo \`${lab}\` em ${dev}`, ok: `mkfs.exfat -L ${lab} ${dev}`, bad: [`mkfs.exfat -l ${lab} ${dev}`, `mkfs.exfat -F ${lab} ${dev}`, `mkfs.vfat -t exfat -L ${lab} ${dev}`, `mkfs.exfat32 -L ${lab} ${dev}`], v: mk(64, `mkfs.exfat -L ${lab} ${dev}`, `${lab} exfat`), w: 'O exFAT (`mkfs.exfat`, do pacote exfatprogs) remove o limite de 4 GiB por arquivo do FAT32 e é compatível com Windows e macOS, por isso é comum em pendrives e cartões grandes.' },
      { t: `Criar um sistema de arquivos **Btrfs** com o rótulo \`${labl}\` em ${dev}`, ok: `mkfs.btrfs -L ${labl} ${dev}`, bad: [`mkfs.btrfs -l ${labl} ${dev}`, `mkfs.btrfs --name ${labl} ${dev}`, `mkfs.btrfs -n ${labl} ${dev}`, `btrfs mkfs -L ${labl} ${dev}`], v: mk(128, `mkfs.btrfs -L ${labl} ${dev}`, `${labl} btrfs`), w: '`mkfs.btrfs -L RÓTULO DISPOSITIVO...` aceita vários dispositivos (por exemplo, `-d raid1 -m raid1 /dev/sdb /dev/sdc`). `-n` define o tamanho dos nós.' },
      { t: `Preparar ${dev} como área de **swap** com o rótulo \`${labl}\``, ok: `mkswap -L ${labl} ${dev}`, bad: [`mkfs.swap -L ${labl} ${dev}`, `mkswap -n ${labl} ${dev}`, `swapon -L ${labl} ${dev}`, `mkfs -t swap ${dev} -L ${labl}`], v: mk(32, `mkswap -L ${labl} ${dev}`, `${labl} swap`), w: '`mkswap` grava a assinatura de swap (com `-L` para o rótulo). Depois, `swapon DISPOSITIVO` ativa a área; `swapon --show` (ou `cat /proc/swaps`) lista as áreas ativas e `swapoff` desativa.' },
      { t: 'Qual é a sequência correta para criar e ativar um **arquivo de swap** de 1 GiB em /swapfile?', ok: 'dd if=/dev/zero of=/swapfile bs=1M count=1024 → chmod 600 /swapfile → mkswap /swapfile → swapon /swapfile', bad: ['mkswap /swapfile → dd if=/dev/zero of=/swapfile bs=1M count=1024 → swapon /swapfile → chmod 600 /swapfile', 'dd if=/dev/zero of=/swapfile bs=1M count=1024 → swapon /swapfile → mkswap /swapfile → chmod 600 /swapfile', 'mkfs.ext4 /swapfile → mount /swapfile /swap → swapon /swap', 'truncate -s 1G /swapfile → mkswap -f /dev/zero → swapon /swapfile'], full: true, w: 'O arquivo precisa existir com o tamanho final (`dd` ou `fallocate`), ter permissão restrita (600), receber a assinatura de swap (`mkswap`) e só então ser ativado (`swapon`). Para ser permanente, acrescenta-se uma linha `/swapfile none swap sw 0 0` ao /etc/fstab.' },
    ];
    const r = rng.pick(rows);
    const out = { type: 'unica', text: r.full ? r.t : `Qual comando realiza a tarefa abaixo?\n\n${r.t}`, options: mcq(rng, r.ok, r.bad), explanation: `${r.full ? '' : `\`${r.ok}\`. `}${r.w}`, ref: ['101:p.431-441', '101:p.449-450'] };
    if (r.v) out.verify = r.v;
    return out;
  },
};

const fsCompare = tableGen({
  id: 'fs-compare', obj: '104.1', nivel: 2, peso: 2, ref: ['101:p.431-441'],
  rows: [
    { q: 'Qual é a limitação do FAT32 que o exFAT resolve, tornando-o comum em pendrives e cartões de memória grandes?', ok: 'O FAT32 não aceita arquivos maiores que 4 GiB; o exFAT remove esse limite e é compatível com Windows e macOS', bad: ['O FAT32 não aceita nomes de arquivo com letras maiúsculas', 'O FAT32 só pode ser montado em Linux; o exFAT, em qualquer sistema', 'O FAT32 não aceita mais que 32 arquivos por diretório', 'O FAT32 exige journal; o exFAT dispensa'], why: 'O limite de 4 GiB por arquivo do FAT32 é um problema para vídeos e imagens de disco. O exFAT (`mkfs.exfat`) tem limites enormes e dispensa o journal.' },
    { q: 'Qual afirmação sobre redimensionamento está correta?', ok: 'O XFS pode ser aumentado (xfs_growfs) com o sistema montado, mas não pode ser reduzido; o ext4 pode ser aumentado e reduzido', bad: ['O XFS pode ser reduzido com xfs_shrinkfs, mas o ext4 não pode ser alterado', 'Nenhum dos dois pode ser aumentado depois de criado', 'O ext4 só pode ser reduzido com o sistema montado', 'O XFS só pode ser aumentado se estiver desmontado'], why: 'ext2/3/4: `resize2fs` aumenta (inclusive montado) e reduz (desmontado). XFS: `xfs_growfs` apenas aumenta. Em LVM, depois do `lvextend` aplica-se o utilitário correspondente ao sistema de arquivos.' },
    { q: 'Qual é a diferença entre ext2 e ext3?', ok: 'O ext3 é o ext2 com journal (registro de transações), o que acelera a recuperação após quedas de energia', bad: ['O ext3 aceita arquivos maiores que 16 TiB; o ext2, não', 'O ext3 usa extents e o ext2 usa blocos indiretos', 'O ext3 é um sistema de arquivos de rede', 'O ext2 é o único que aceita rótulo e UUID'], why: 'O journal grava as alterações de metadados antes de aplicá-las; após uma falha o `fsck` demora segundos. O ext4 acrescenta extents, alocação atrasada, limites maiores e checksums de metadados. `tune2fs -j` converte ext2 em ext3.' },
    { q: 'Qual destes recursos é característico do Btrfs?', ok: 'Subvolumes, snapshots, compressão transparente e múltiplos dispositivos (RAID) no mesmo sistema de arquivos', bad: ['Quotas de usuário exclusivas e journal externo obrigatório', 'Compatibilidade nativa com Windows e macOS', 'Limite de 4 GiB por arquivo', 'Impossibilidade de aumentar o sistema de arquivos depois de criado'], why: 'O Btrfs é copy-on-write: permite `btrfs subvolume create`, `btrfs subvolume snapshot`, compressão por opção de montagem (`compress=zstd`/`lzo`/`zlib`) e vários dispositivos (`mkfs.btrfs -d raid1 -m raid1 /dev/sdb /dev/sdc`).' },
    { q: 'Como habilitar a compressão transparente (zstd) ao montar um sistema de arquivos Btrfs?', ok: 'mount -o compress=zstd /dev/sdb1 /mnt', bad: ['mount -t btrfs -o zstd /dev/sdb1 /mnt', 'mount --compress zstd /dev/sdb1 /mnt', 'mkfs.btrfs --compress zstd /dev/sdb1', 'btrfs compress /dev/sdb1 zstd'], why: 'A compressão do Btrfs é uma opção de montagem (`compress=zlib|lzo|zstd`, ou `compress-force=`), que também pode constar no campo de opções do /etc/fstab.' },
    { q: 'Qual comando cria um subvolume dentro de um Btrfs já montado em /mnt/dados?', ok: 'btrfs subvolume create /mnt/dados/vol1', bad: ['mkfs.btrfs --subvolume /mnt/dados/vol1', 'mkdir -t btrfs /mnt/dados/vol1', 'btrfs create subvolume vol1', 'mount -o subvol=create /mnt/dados/vol1'], why: '`btrfs subvolume create CAMINHO` cria o subvolume; `btrfs subvolume list` lista; `btrfs subvolume snapshot ORIGEM DESTINO` cria um snapshot.' },
    { q: 'Qual é a relação entre os comandos `mkfs -t ext4 /dev/sdb1` e `mkfs.ext4 /dev/sdb1`?', ok: 'São equivalentes: o mkfs é apenas um front-end que chama o mkfs.<tipo>', bad: ['O primeiro cria ext4 e o segundo, ext2', 'O mkfs.ext4 não aceita rótulo; o mkfs -t aceita', 'Só o primeiro funciona sem privilégios de root', 'O mkfs -t ext4 formata a tabela de partições; o mkfs.ext4, o sistema de arquivos'], why: '`mkfs -t TIPO` executa `mkfs.TIPO` com os argumentos restantes. `mkfs.ext2/ext3/ext4` são, na prática, o `mke2fs` com o tipo correspondente.' },
    { q: 'Qual tipo de sistema de arquivos costuma ser usado na partição de sistema EFI (ESP)?', ok: 'FAT (vfat), geralmente FAT32', bad: ['ext4', 'XFS', 'Btrfs', 'exFAT'], why: 'A especificação UEFI exige que o firmware consiga ler a ESP, formatada em FAT (`mkfs.vfat -F 32`). Em MBR a partição tem tipo `ef`; em GPT, o GUID C12A7328-F81F-11D2-BA4B-00A0C93EC93B.' },
    { q: 'Qual é o ID de tipo (em MBR) de uma partição Linux swap e de uma partição Linux LVM, respectivamente?', ok: '82 e 8e', bad: ['83 e 8e', '82 e 83', '8e e 82', '07 e 82'], why: 'No fdisk (`t` + código hexadecimal): `82` swap, `83` Linux, `8e` Linux LVM, `fd` RAID autodetect, `ef` ESP.', verify: { sh: "sfdisk --list-types --label dos | grep -E '^ *(82|8e) ' | sed 's/^ *//' | tr -s ' ' | tr '\\n' ';'", expect: '82 Linux swap / Solaris;8e Linux LVM;' } },
    { q: 'Qual comando ativa uma área de swap já preparada e qual mostra as áreas ativas?', ok: 'swapon /dev/sdb2 e swapon --show', bad: ['mount /dev/sdb2 swap e mount -t swap', 'mkswap /dev/sdb2 e mkswap --show', 'swapon -s /dev/sdb2 e swapoff --show', 'swap on /dev/sdb2 e cat /etc/swaps'], why: '`swapon DISPOSITIVO` ativa, `swapoff` desativa e `swapon --show` (ou `swapon -s`, ou `cat /proc/swaps`) lista; `mkswap` apenas prepara a área. A swap não é montada em um diretório.' },
  ],
});

const mbrGpt = {
  id: 'mbr-gpt', obj: '104.1', nivel: 2, peso: 3,
  make(rng) {
    const fmt = rng.int(1, 7);
    const T = (x) => x;
    if (fmt === 1) {
      const sec = rng.pick([512, 4096]);
      const tib = (2 ** 32 * sec) / 1024 ** 4;
      return { type: 'unica', text: `O MBR usa endereços de setor (LBA) de 32 bits. Qual é o tamanho máximo de disco que ele consegue endereçar com setores de ${sec} bytes?`, options: mcq(rng, `${tib} TiB`, [`${tib * 8} TiB`, `${tib / 2} TiB`, `${tib * 1024} TiB`, `${tib * 4} TiB`, '4 TiB'].filter((x) => x !== `${tib} TiB`)), explanation: `2³² setores × ${sec} bytes = ${2 ** 32 * sec} bytes = ${tib} TiB. Com setores de 512 bytes o limite clássico do MBR é 2 TiB; o GPT usa LBA de 64 bits (≈ 9,4 ZB com setores de 512 bytes).`, ref: ['101:p.424-427'], verify: { sh: `echo $((2**32 * ${sec} / 1024**4))`, expect: String(tib) } };
    }
    if (fmt === 2) {
      return { type: 'unica', text: 'Quantas entradas de partição uma tabela GPT recém-criada comporta por padrão?', options: mcq(rng, '128', ['4', '16', '64', '256', '1024']), explanation: 'O GPT reserva, por padrão, espaço para 128 entradas de partição (o `gdisk`/`sgdisk` mostram "Partition table holds up to 128 entries"). No MBR são 4 entradas primárias (ou 3 primárias + 1 estendida com partições lógicas).', ref: ['101:p.424-431'], verify: { sh: 'd=$(mktemp -d); cd "$d"; truncate -s 50M g.img; sgdisk -o g.img >/dev/null 2>&1; sgdisk -p g.img 2>&1 | grep "Partition table holds"', expect: 'Partition table holds up to 128 entries' } };
    }
    if (fmt === 3) {
      const n = rng.int(5, 9);
      return { type: 'unica', text: `Um disco MBR já tem 3 partições primárias e o administrador precisa de mais ${n - 3} partições, sem usar LVM. Qual é a solução?`, options: mcq(rng, 'Transformar a 4ª entrada em partição estendida e criar partições lógicas dentro dela (numeradas a partir de 5)', ['Criar mais partições primárias: o MBR aceita até 128', 'Reduzir o setor de boot para liberar entradas na tabela', 'Usar partições com número 0 a partir da 5ª, que dispensam entrada na tabela', 'Não há solução: o disco precisa ser convertido em ext4']), explanation: 'O MBR tem só 4 entradas. A solução clássica é usar até 3 primárias + 1 **estendida**, que funciona como contêiner de partições **lógicas** (numeradas a partir de 5: sda5, sda6...). Migrar para GPT (128 entradas) é outra saída.', ref: ['101:p.424-427'] };
    }
    if (fmt === 4) {
      return { type: 'unica', text: 'O primeiro setor (512 bytes) de um disco MBR se divide em três partes. Quais são elas, em bytes?', options: mcq(rng, '446 de código de boot + 64 da tabela de partições (4 × 16) + 2 de assinatura (0x55AA)', ['432 de código de boot + 64 da tabela + 16 de UUID', '446 de código de boot + 128 da tabela (4 × 32) + 2 de assinatura', '512 de código de boot, com a tabela de partições no setor 2', '64 de código de boot + 446 da tabela + 2 de assinatura']), explanation: 'MBR = código do bootstrap (446 bytes) + 4 entradas de 16 bytes (64) + assinatura 0x55AA (2) = 512 bytes. O GPT mantém um "MBR de proteção" no setor 0 e coloca o cabeçalho no setor 1 (mais uma cópia no fim do disco).', ref: ['101:p.424-427'], verify: { sh: 'echo $((446 + 4*16 + 2))', expect: '512' } };
    }
    if (fmt === 5) {
      const rows = [
        ['Qual esquema de particionamento faz parte do padrão UEFI e identifica partições por GUID?', 'GPT (GUID Partition Table)', ['MBR (msdos)', 'BSD disklabel', 'LVM2']],
        ['Em um disco GPT usado em um computador com BIOS tradicional (não UEFI), o que o GRUB precisa para guardar sua segunda etapa?', 'De uma pequena partição especial "BIOS boot" (sem sistema de arquivos)', ['De uma ESP formatada em ext4', 'Do espaço entre o MBR e a primeira partição, como em discos MBR', 'De um arquivo /boot/grub/core.img dentro de /home', 'De uma partição swap com flag boot']],
        ['Onde o GPT guarda a cópia de segurança da sua tabela de partições?', 'No final do disco', ['No setor 0, junto com o MBR', 'Em /boot/grub', 'No início da primeira partição', 'Em /etc/partitions.bak']],
        ['Qual ferramenta é voltada especificamente a tabelas GPT, com interface semelhante à do fdisk?', 'gdisk', ['mkfs.gpt', 'lsblk', 'blkid', 'tune2fs']],
        ['As partições lógicas de um disco MBR (sda) começam a ser numeradas a partir de qual número?', '5', ['4', '1', '0', '8']],
        ['Quais destas ferramentas conseguem criar tabelas de partições GPT?', 'gdisk, parted e fdisk (versões atuais)', ['somente gdisk', 'mkfs e blkid', 'somente parted', 'lsblk e df']],
      ];
      const r = rng.pick(rows);
      return { type: 'unica', text: r[0], options: mcq(rng, r[1], r[2]), explanation: 'GPT (parte do padrão UEFI): LBA de 64 bits, 128 entradas por padrão, GUIDs, cabeçalho duplicado no fim do disco e "MBR de proteção" no setor 0. MBR: 4 entradas primárias, limite de 2 TiB (setores de 512 B), partições lógicas numeradas de 5 em diante. Discos GPT funcionam com BIOS (com partição BIOS boot) ou UEFI (com ESP).', ref: ['101:p.424-431'] };
    }
    const g = rng.int(1, 3);
    if (fmt === 6) {
      return { type: 'multipla', text: 'Quais afirmações sobre MBR e GPT estão corretas?', options: multi(rng, ['O MBR comporta no máximo 4 partições primárias (ou 3 primárias + 1 estendida)', 'O GPT usa endereçamento de setores de 64 bits e suporta discos de vários TiB'], ['O GPT só funciona em computadores com UEFI e nunca em BIOS', 'O MBR identifica as partições por GUID', 'O MBR suporta discos de até 2 ZiB', 'No GPT as partições lógicas começam em sda5'], 3), explanation: 'GPT = 64 bits, GUIDs, 128 entradas, funciona com BIOS (partição BIOS boot) ou UEFI. MBR = 32 bits (2 TiB com setores de 512 B), 4 entradas, lógicas dentro de estendida.', ref: ['101:p.424-431'] };
    }
    return { type: 'unica', text: g === 1 ? 'Um disco de 4 TiB precisa ser usado como um único volume em um servidor. Qual esquema de particionamento é necessário?' : g === 2 ? 'O que acontece se uma partição passa do limite de 2 TiB em um disco MBR com setores de 512 bytes?' : 'Em qual situação o GPT é obrigatório?', options: mcq(rng, g === 1 ? 'GPT, pois o MBR (setores de 512 B) só endereça até 2 TiB' : g === 2 ? 'Não é possível endereçar a parte além de 2 TiB; é preciso usar GPT para o espaço restante' : 'Para discos maiores que 2 TiB com setores de 512 bytes (e para inicialização UEFI, que usa GPT por padrão)', g === 1 ? ['MBR, pois é o único aceito por todos os sistemas Linux', 'MBR com partição estendida, que dobra o limite', 'LVM, que substitui a tabela de partições', 'Nenhum: discos acima de 2 TiB não são suportados'] : g === 2 ? ['O fdisk ajusta automaticamente os setores para 4096 bytes', 'O kernel divide a partição em duas automaticamente', 'A partição funciona, mas sem journal', 'O sistema de arquivos é convertido para XFS'] : ['Para qualquer disco SSD', 'Para qualquer sistema com mais de 4 GiB de RAM', 'Para instalar o GRUB 2', 'Nunca: o MBR cobre todos os casos atuais']), explanation: 'O MBR guarda início e tamanho das partições em 32 bits: 2³² setores × 512 B = 2 TiB. Para discos maiores é necessário o GPT (ou setores de 4 KiB, que levam o limite a 16 TiB).', ref: ['101:p.424-427'] };
  },
};

export const diskGens = [fdiskSession, fdiskKeys, partedCmd, mkfsCmd, fsCompare, mbrGpt];


// ═════════════════════════════════════════════ 104.2 ═════════════════════════════════════════════
const DNAMES = ['docs', 'img', 'src', 'logs', 'tmp', 'cache', 'data', 'backup', 'build', 'lib'];
const FNAMES = ['a.txt', 'b.log', 'c.conf', 'd.dat', 'e.md', 'f.csv', 'g.sh', 'h.bin'];
function makeTree(rng) {
  const nTop = rng.int(2, 3);
  const tops = rng.sample(DNAMES, nTop);
  const dirs = ['proj']; const files = [];
  const addFiles = (dir) => { const k = rng.int(0, 3); for (const f of rng.sample(FNAMES, k)) files.push(`${dir}/${f}`); };
  addFiles('proj');
  for (const t of tops) {
    dirs.push(`proj/${t}`); addFiles(`proj/${t}`);
    if (rng.chance(0.5)) { const sub = rng.pick(['v1', 'v2', 'old', 'new']); dirs.push(`proj/${t}/${sub}`); addFiles(`proj/${t}/${sub}`); }
  }
  if (files.length < 3) files.push('proj/leia-me.txt');
  return { dirs, files, tops };
}
const duLines = {
  id: 'du-lines', obj: '104.2', nivel: 3, peso: 2,
  make(rng) {
    const t = makeTree(rng);
    const depth = (p) => p.split('/').length - 1;
    const direct = (p) => p.split('/').length === 2;
    const D = t.dirs.length; const F = t.files.length;
    const dDirect = t.dirs.filter((d) => depth(d) === 1).length;
    const fDirect = t.files.filter((f) => depth(f) === 1).length;
    const cmds = [
      { c: 'du proj', n: D, why: 'Sem opções, o `du` imprime uma linha para **cada diretório** da árvore (e só diretórios): ' + D },
      { c: 'du -s proj', n: 1, why: '`-s` (summarize) imprime só o total do argumento: 1 linha.' },
      { c: 'du -sh proj', n: 1, why: '`-s` resume em uma única linha; `-h` só muda o formato (K, M, G).' },
      { c: 'du -a proj', n: D + F, why: '`-a` (all) inclui também os **arquivos**: diretórios (' + D + ') + arquivos (' + F + ').' },
      { c: 'du -c proj', n: D + 1, why: '`-c` (total) acrescenta uma linha final `total`: ' + D + ' diretórios + 1.' },
      { c: 'du -sc proj', n: 2, why: '`-s` resume (1 linha) e `-c` acrescenta a linha `total`: 2 linhas.' },
      { c: 'du -d 1 proj', n: 1 + dDirect, why: '`-d 1` (`--max-depth=1`) mostra o diretório e seus subdiretórios imediatos: 1 + ' + dDirect + '.' },
      { c: 'du -ad 1 proj', n: 1 + dDirect + fDirect, why: '`-a -d 1`: o diretório (1), seus subdiretórios imediatos (' + dDirect + ') e seus arquivos imediatos (' + fDirect + ').' },
      { c: 'du -h --max-depth=0 proj', n: 1, why: '`--max-depth=0` equivale a `-s`: apenas o total do argumento.' },
    ];
    const r = rng.pick(cmds);
    const tree = [...t.dirs.map((d) => `${d}/`), ...t.files].sort().join('\n');
    const mk = `d=$(mktemp -d); cd "$d"; mkdir -p ${t.dirs.map(sq).join(' ')}; touch ${t.files.map(sq).join(' ')}`;
    const pool = uniq([D, D + 1, D + F, F, 1, 2, dDirect, 1 + dDirect, D - 1, F + 1, 1 + dDirect + fDirect].filter((x) => x !== r.n && x > 0).map(String));
    return { type: 'unica', text: `A árvore abaixo existe no diretório atual (as entradas terminadas em \`/\` são diretórios):\n\n${block(tree)}\n\nQuantas linhas o comando \`${r.c}\` imprime?`, options: mcq(rng, String(r.n), pool), explanation: `${r.why} (A árvore tem ${D} diretórios, contando \`proj\`, e ${F} arquivos.) Lembre-se: \`du\` mostra uso de disco; para espaço livre use \`df\`.`, ref: ['101:p.460-465'], verify: { sh: `${mk}; ${r.c} | wc -l`, expect: String(r.n) } };
  },
};

const FSCK_BITS = [[1, 'o fsck corrigiu erros no sistema de arquivos'], [2, 'o sistema deve ser reiniciado'], [4, 'erros foram deixados sem correção'], [8, 'houve um erro operacional'], [16, 'houve erro de uso ou de sintaxe na linha de comando'], [32, 'o fsck foi cancelado a pedido do usuário'], [128, 'houve erro na biblioteca compartilhada']];
const fsckExit = {
  id: 'fsck-exit', obj: '104.2', nivel: 3, peso: 2,
  make(rng) {
    const code = rng.pick([0, 1, 2, 3, 4, 5, 8, 12, 16, 32, 4, 1, 6, 0]);
    const parts = FSCK_BITS.filter(([b]) => code & b).map(([, t]) => t);
    const ok = code === 0 ? 'Nenhum erro foi encontrado' : parts.map((x, i) => (i === 0 ? x[0].toUpperCase() + x.slice(1) : x)).join(' e ');
    const sentence = (c) => (c === 0 ? 'Nenhum erro foi encontrado' : FSCK_BITS.filter(([b]) => c & b).map(([, t]) => t).map((x, i) => (i === 0 ? x[0].toUpperCase() + x.slice(1) : x)).join(' e '));
    const alt = uniq([0, 1, 2, 3, 4, 5, 8, 16, 32].filter((c) => c !== code).map(sentence)).filter((x) => x !== ok);
    const verifyMap = {
      0: 'd=$(mktemp -d); cd "$d"; truncate -s 32M e.img; mkfs.ext4 -q -F e.img; e2fsck -fn e.img >/dev/null 2>&1; echo $?',
      1: 'd=$(mktemp -d); cd "$d"; truncate -s 32M e.img; mkfs.ext4 -q -F e.img; debugfs -w -R "set_super_value free_blocks_count 5" e.img >/dev/null 2>&1; e2fsck -fy e.img >/dev/null 2>&1; echo $?',
      16: 'e2fsck >/dev/null 2>&1; echo $?',
    };
    const out = { type: 'unica', text: `Ao verificar um sistema de arquivos, o \`fsck\`/\`e2fsck\` terminou com o código de saída **${code}** (\`echo $?\`). O que isso significa?`, options: mcq(rng, ok, alt), explanation: `O código de saída do fsck é a **soma** (OU bit a bit) de: 0 = nenhum erro; 1 = erros corrigidos; 2 = reinicialização necessária; 4 = erros deixados sem correção; 8 = erro operacional; 16 = erro de uso/sintaxe; 32 = cancelado pelo usuário; 128 = erro de biblioteca compartilhada. ${code} = ${code === 0 ? '0' : FSCK_BITS.filter(([b]) => code & b).map(([b]) => b).join(' + ')} → ${ok.toLowerCase()}.`, ref: ['101:p.466-473'] };
    if (verifyMap[code]) out.verify = { sh: verifyMap[code], expect: String(code) };
    return out;
  },
};

const tune2fsTask = {
  id: 'tune2fs-task', obj: '104.2', nivel: 2, peso: 3,
  make(rng) {
    const dev = rng.pick(['/dev/sdb1', '/dev/sdc1', '/dev/vdb1']);
    const lab = rng.pick(['dados', 'backup', 'web', 'arquivo', 'projetos']); const n = rng.pick([20, 30, 50, 100]); const days = rng.pick([7, 14, 30, 90]);
    const pct = rng.pick([1, 2, 3, 4, 8, 10]); const blocks = 16384;
    const pre = 'd=$(mktemp -d); cd "$d"; truncate -s 64M e.img; mkfs.ext4 -q -F -b 4096 e.img; ';
    const run = (cmd) => `${pre}${cmd.split(dev).join('e.img')} >/dev/null 2>&1; `;
    const rows = [
      { t: `Alterar o rótulo do sistema de arquivos ext4 em ${dev} para \`${lab}\``, ok: `tune2fs -L ${lab} ${dev}`, bad: [`tune2fs -l ${lab} ${dev}`, `tune2fs -n ${lab} ${dev}`, `e2label ${lab} ${dev}`, `tune2fs --label ${lab} ${dev}`.replace('--label', '-T')], v: [`${run(`tune2fs -L ${lab} ${dev}`)}tune2fs -l e.img | grep 'volume name' | tr -s ' '`, `Filesystem volume name: ${lab}`], w: '`tune2fs -L RÓTULO` altera o rótulo (`e2label DISPOSITIVO RÓTULO` também). `tune2fs -l` (minúsculo) apenas **lista** o superbloco.' },
      { t: `Listar os parâmetros do superbloco do ext4 de ${dev} (rótulo, UUID, contagens de blocos e de inodes, recursos...)`, ok: `tune2fs -l ${dev}`, bad: [`tune2fs -L ${dev}`, `tune2fs -s ${dev}`, `tune2fs -i ${dev}`, `tune2fs --list-all ${dev}`], v: [`${run('true')}tune2fs -l e.img | grep -c 'Filesystem UUID'`, '1'], w: '`tune2fs -l` (list) e `dumpe2fs -h` mostram o superbloco; `dumpe2fs` sem `-h` mostra também os grupos de blocos.' },
      { t: `Definir que ${dev} seja verificado pelo fsck a cada ${n} montagens`, ok: `tune2fs -c ${n} ${dev}`, bad: [`tune2fs -C ${n} ${dev}`, `tune2fs -i ${n} ${dev}`, `tune2fs -m ${n} ${dev}`, `tune2fs -t ${n} ${dev}`], v: [`${run(`tune2fs -c ${n} ${dev}`)}tune2fs -l e.img | grep 'Maximum mount count' | tr -s ' '`, `Maximum mount count: ${n}`], w: '`-c` define o número **máximo** de montagens entre verificações. `-C` altera o contador **atual**, `-i` define o intervalo em tempo e `-m` a porcentagem de blocos reservados.' },
      { t: `Definir que ${dev} seja verificado pelo menos a cada ${days} dias`, ok: `tune2fs -i ${days}d ${dev}`, bad: [`tune2fs -c ${days}d ${dev}`, `tune2fs -I ${days}d ${dev}`, `tune2fs -d ${days} ${dev}`, `tune2fs -i ${days}h ${dev}`.replace(`${days}h`, `${days}m`)], v: [`${run(`tune2fs -i ${days}d ${dev}`)}tune2fs -l e.img | grep 'Check interval' | sed 's/ (.*//' | tr -s ' '`, `Check interval: ${days * 86400}`], w: '`-i INTERVALO` aceita `d` (dias), `w` (semanas) ou `m` (meses); `tune2fs -i 0` desativa a verificação por tempo. Aqui ' + `${days} dias = ${days * 86400} segundos.` },
      { t: `Reservar ${pct}% dos blocos de ${dev} para o root (em vez do padrão de 5%)`, ok: `tune2fs -m ${pct} ${dev}`, bad: [`tune2fs -r ${pct} ${dev}`, `tune2fs -M ${pct} ${dev}`, `tune2fs -R ${pct}% ${dev}`, `tune2fs -u ${pct} ${dev}`], v: [`${run(`tune2fs -m ${pct} ${dev}`)}tune2fs -l e.img | grep 'Reserved block count' | tr -s ' '`, `Reserved block count: ${Math.floor((blocks * pct) / 100)}`], w: '`-m` define a **porcentagem** de blocos reservados (padrão 5%); `-r` define o **número** de blocos. Em um disco só de dados é comum reduzir a 1% (ou 0). Neste ext4 de 16384 blocos de 4 KiB, ' + `${pct}% = ${Math.floor((blocks * pct) / 100)} blocos.` },
      { t: `Transformar um ext2 em ext3 em ${dev}, adicionando um journal sem apagar os dados`, ok: `tune2fs -j ${dev}`, bad: [`tune2fs -J ${dev}`, `mkfs.ext3 ${dev}`, `tune2fs -t ext3 ${dev}`, `tune2fs -O ^extents ${dev}`], v: [`d=$(mktemp -d); cd "$d"; truncate -s 64M e.img; mkfs.ext2 -q -F e.img; tune2fs -j e.img >/dev/null 2>&1; blkid -o value -s TYPE e.img`, 'ext3'], w: '`tune2fs -j` (ou `-O has_journal`) acrescenta o journal e converte ext2 em ext3 sem perder dados; `mkfs.ext3` apagaria o conteúdo. `-J` apenas define parâmetros do journal.' },
      { t: `Remover o journal do ext4 em ${dev} (desmontado)`, ok: `tune2fs -O ^has_journal ${dev}`, bad: [`tune2fs -j0 ${dev}`, `tune2fs -O -journal ${dev}`, `tune2fs -o ^journal ${dev}`, `tune2fs --no-journal ${dev}`], v: [`${run(`tune2fs -O ^has_journal ${dev}`)}tune2fs -l e.img | grep -c has_journal`, '0'], w: '`-O` liga/desliga recursos; o `^` antes do nome desliga: `-O ^has_journal`. É preciso rodar `e2fsck -f` depois e o sistema de arquivos deve estar desmontado.' },
      { t: `Fazer com que erros no ext4 de ${dev} remontem o sistema de arquivos como somente leitura`, ok: `tune2fs -e remount-ro ${dev}`, bad: [`tune2fs -E remount-ro ${dev}`, `tune2fs -o remount-ro ${dev}`, `tune2fs -e readonly ${dev}`, `tune2fs -m remount-ro ${dev}`], v: [`${run(`tune2fs -e remount-ro ${dev}`)}tune2fs -l e.img | grep 'Errors behavior' | tr -s ' '`, 'Errors behavior: Remount read-only'], w: '`tune2fs -e continue|remount-ro|panic` escolhe o comportamento em caso de erro (o mesmo que a opção de montagem `errors=`).' },
    ];
    const r = rng.pick(rows);
    return { type: 'unica', text: `Qual comando realiza a tarefa abaixo?\n\n${r.t}`, options: mcq(rng, r.ok, r.bad), explanation: `\`${r.ok}\`. ${r.w}`, ref: ['101:p.466-473'], verify: { sh: r.v[0], expect: r.v[1] } };
  },
};

const ext4Reserved = {
  id: 'ext4-reserved', obj: '104.2', nivel: 3, peso: 1,
  make(rng) {
    const mib = rng.pick([32, 64, 96, 128, 200]); const pct = rng.pick([1, 2, 3, 4, 5, 6, 8, 10]);
    const blocks = mib * 256; const reserved = Math.floor((blocks * pct) / 100);
    const pool = [Math.floor((mib * 1024 * pct) / 100), blocks, Math.round((blocks * pct) / 100) + 7, Math.floor(blocks / pct), reserved * 4, Math.floor((blocks * (pct + 1)) / 100)].filter((x) => x !== reserved).map(String);
    return {
      type: 'unica',
      text: `Um sistema de arquivos ext4 de ${mib} MiB é criado com blocos de 4096 bytes e reserva de ${pct}%:\n\n${block(`mkfs.ext4 -b 4096 -m ${pct} /dev/sdb1`)}\n\nQuantos blocos ficam reservados ao root (\`Reserved block count\` do \`tune2fs -l\`)?`,
      options: mcq(rng, String(reserved), pool),
      explanation: `Total de blocos = ${mib} MiB ÷ 4 KiB = ${blocks}. Reserva = ${blocks} × ${pct}% = ${(blocks * pct) / 100} → ${reserved} blocos (o valor é truncado). Esses blocos só podem ser usados pelo root (ou pelo usuário/grupo configurados), o que evita que um disco cheio trave o sistema; em discos só de dados costuma-se reduzir com \`tune2fs -m 1\`.`,
      ref: ['101:p.466-473'],
      verify: { sh: `d=$(mktemp -d); cd "$d"; truncate -s ${mib}M e.img; mkfs.ext4 -q -F -b 4096 -m ${pct} e.img >/dev/null 2>&1; tune2fs -l e.img | grep 'Reserved block count' | tr -s ' ' | cut -d' ' -f4`, expect: String(reserved) },
    };
  },
};

const dfDiagnose = {
  id: 'df-diagnose', obj: '104.2', nivel: 3, peso: 2,
  make(rng) {
    const sc = rng.pick(['inode', 'full', 'reserved']);
    const mp = rng.pick(['/var', '/home', '/srv', '/data']); const dev = rng.pick(['/dev/sdb1', '/dev/sdc1', '/dev/vdb1']);
    const size = rng.pick([20, 50, 100, 200]);
    const usedPct = sc === 'full' ? 100 : sc === 'reserved' ? 95 : rng.int(20, 60);
    const used = Math.round((size * usedPct) / 100);
    const avail = sc === 'full' || sc === 'reserved' ? 0 : size - used;
    const inodes = rng.pick([1310720, 3276800, 6553600]);
    const iuse = sc === 'inode' ? 100 : rng.int(2, 15);
    const iused = Math.round((inodes * iuse) / 100);
    const usePct = sc === 'reserved' ? 100 : usedPct;
    const hFix = `${'Filesystem'.padEnd(11)} Size  Used Avail Use% Mounted on\n${dev.padEnd(11)} ${String(size + 'G').padStart(4)} ${String(used + 'G').padStart(5)} ${String(avail + 'G').padStart(5)} ${String(usePct + '%').padStart(4)} ${mp}`;
    const di = `${'Filesystem'.padEnd(11)}   Inodes   IUsed   IFree IUse% Mounted on\n${dev.padEnd(11)} ${String(inodes).padStart(8)} ${String(iused).padStart(7)} ${String(inodes - iused).padStart(7)} ${String(iuse + '%').padStart(4)} ${mp}`;
    const txt = `Um aplicativo recebe "No space left on device" ao criar arquivos em \`${mp}\`. O administrador executa:\n\n${block(`$ df -h ${mp}\n${hFix}\n\n$ df -i ${mp}\n${di}`)}\n\nQual é a causa mais provável e a medida adequada?`;
    const A = {
      inode: ['Os inodes se esgotaram (IUse% 100%) apesar de haver espaço livre: há milhões de arquivos pequenos; é preciso apagar/arquivar arquivos (ou recriar o sistema de arquivos com mais inodes)', 'Inodes esgotados: a solução é aumentar o espaço livre com tune2fs -m 0'],
      full: ['O espaço em blocos acabou (Use% 100%, Avail 0) enquanto sobram inodes: é preciso liberar espaço (apagar arquivos grandes, por exemplo achados com du/find) ou aumentar o volume', 'O espaço acabou; a solução é executar fsck -f em ' + mp],
      reserved: ['O espaço visível para usuários comuns acabou: os blocos restantes estão reservados ao root (padrão de 5% no ext4); libere espaço ou reduza a reserva com tune2fs -m', 'Os inodes acabaram, apesar de IUse% baixo'],
    };
    const ok = A[sc][0];
    const pool = [A.inode[0], A.full[0], A.reserved[0], 'O sistema de arquivos está corrompido: é preciso executar xfs_repair com o volume montado', 'O disco está com setores defeituosos: troque o disco; df não permite concluir mais nada', `O ponto de montagem ${mp} está montado como somente leitura (o erro seria "Read-only file system")`].filter((x) => x !== ok);
    return {
      type: 'unica', text: txt, options: mcq(rng, ok, pool),
      explanation: sc === 'inode' ? `Cada arquivo/diretório consome 1 inode. Aqui \`df -i\` mostra IUse% de 100% enquanto \`df -h\` ainda tem espaço livre (${avail}G): é o clássico "no space left" por falta de **inodes**. Procure onde estão os milhões de arquivos (\`find ${mp} -xdev -type f | cut -d/ -f1-3 | sort | uniq -c | sort -rn | head\`) e remova-os; o número de inodes é fixado na criação do ext4 (\`mke2fs -N\` / \`-i\`).` : sc === 'full' ? `Use% 100% com Avail 0 e IUse% de apenas ${iuse}%: faltam **blocos de dados**, não inodes. Use \`du -xh --max-depth=1 ${mp} | sort -h\` e \`find ${mp} -xdev -size +100M\` para achar o que ocupa espaço.` : `O ext4 reserva por padrão 5% dos blocos ao root: o \`df\` mostra Avail 0 para usuários comuns mesmo havendo blocos livres (Size − Used não é zero). Para discos de dados, \`tune2fs -m 1 ${dev}\` reduz a reserva.`,
      ref: ['101:p.460-465'],
    };
  },
};

const fsMaint = tableGen({
  id: 'fs-maint', obj: '104.2', nivel: 2, peso: 2, ref: ['101:p.459-473'],
  rows: [
    { q: 'Qual comando mostra o espaço usado e livre **dos sistemas de arquivos montados**, e qual mostra o espaço ocupado por um **diretório**?', ok: 'df e du, respectivamente', bad: ['du e df, respectivamente', 'df e df -d, respectivamente', 'ls -l e du, respectivamente', 'fsck e df, respectivamente'], why: '`df` (disk free) lê as estatísticas do sistema de arquivos; `du` (disk usage) soma o espaço dos arquivos de uma árvore. `df -h` e `du -sh DIR` usam unidades legíveis.' },
    { q: 'Qual opção do `df` mostra a utilização de **inodes** em vez de blocos?', ok: 'df -i', bad: ['df -h', 'df -I', 'df --blocks', 'df -T'], why: '`df -i` mostra Inodes/IUsed/IFree/IUse%. `-h` formata em unidades legíveis, `-T` mostra o tipo do sistema de arquivos.' },
    { q: 'Em qual condição o `fsck` deve ser executado em um sistema de arquivos?', ok: 'Com o sistema de arquivos desmontado (ou montado somente leitura), para não corromper dados', bad: ['Apenas com o sistema de arquivos montado e em uso', 'Somente depois de preencher 90% do espaço', 'Somente em partições swap', 'Somente pelo usuário comum, nunca pelo root'], why: 'Verificar um sistema de arquivos montado para escrita pode causar danos, pois ele muda enquanto é analisado. Por isso o fsck roda no boot, antes de montar, ou com `umount` prévio.' },
    { q: 'Qual é o papel do comando `fsck`?', ok: 'É um front-end que chama o verificador adequado ao tipo do sistema de arquivos (fsck.ext4, fsck.vfat, ...)', bad: ['Formata o sistema de arquivos com o tipo detectado', 'Repara apenas sistemas XFS', 'Mostra o espaço livre de cada partição', 'Troca o UUID do sistema de arquivos'], why: '`fsck -t TIPO` (ou o tipo detectado/lido do fstab) executa `fsck.TIPO`. Para ext2/3/4 o programa real é o `e2fsck`.' },
    { q: 'Qual opção do `e2fsck` força a verificação completa mesmo que o sistema de arquivos esteja marcado como "limpo"?', ok: '-f', bad: ['-n', '-p', '-y', '-c'], why: '`-f` força; `-n` abre somente leitura e responde "não" a tudo; `-p` repara automaticamente apenas problemas seguros; `-y` responde "sim" a todas as perguntas; `-c` procura blocos defeituosos.' },
    { q: 'Qual opção do `e2fsck` faz o reparo automático de problemas "seguros", sem perguntas (usada nos scripts de inicialização)?', ok: '-p', bad: ['-f', '-n', '-v', '-b'], why: '`-p` (preen) corrige o que é seguro corrigir e aborta se encontrar algo grave, exigindo intervenção. `-y` responde sim a tudo (mais arriscado).' },
    { q: 'Como verificar (somente verificar, sem alterar nada) um sistema de arquivos XFS desmontado em /dev/sdb1?', ok: 'xfs_repair -n /dev/sdb1', bad: ['fsck.xfs /dev/sdb1', 'xfs_check -r /dev/sdb1', 'xfs_repair -r /dev/sdb1', 'xfs_db -n /dev/sdb1'], why: 'O reparo do XFS é o `xfs_repair` (`-n` = modo "no modify"). O `fsck.xfs` existe só para satisfazer o `fsck` e **não faz nada**. O sistema de arquivos deve estar desmontado.' },
    { q: 'Qual utilitário do XFS permite examinar e depurar o sistema de arquivos (somente leitura com -r) e qual desfragmenta?', ok: 'xfs_db e xfs_fsr, respectivamente', bad: ['xfs_fsr e xfs_db, respectivamente', 'xfs_repair e xfs_growfs, respectivamente', 'xfs_info e xfs_admin, respectivamente', 'xfs_check e xfs_quota, respectivamente'], why: '`xfs_db` é o depurador do XFS (`-r` somente leitura); `xfs_fsr` reorganiza (desfragmenta) arquivos; `xfs_repair` conserta; `xfs_growfs` aumenta; `xfs_admin` altera rótulo/UUID; `xfs_info` mostra a geometria.' },
    { q: 'Onde o `e2fsck` coloca os arquivos/pedaços de arquivos órfãos que consegue recuperar?', ok: 'No diretório lost+found, na raiz do sistema de arquivos verificado', bad: ['Em /tmp', 'Em /var/crash', 'Em /root/recovered', 'Em /boot/recovery']
      , why: 'Cada sistema de arquivos ext tem um `lost+found` na sua raiz; o fsck liga ali os inodes sem nome (numerados como `#12345`) que encontra.' },
    { q: 'O superbloco principal de um ext4 está danificado. Como usar uma cópia de segurança dele?', ok: 'e2fsck -b 32768 /dev/sdb1 (o número do bloco de backup aparece em mke2fs -n /dev/sdb1)', bad: ['e2fsck -s 32768 /dev/sdb1', 'tune2fs -b 32768 /dev/sdb1', 'fsck -R 32768 /dev/sdb1', 'dumpe2fs -B 32768 /dev/sdb1'], why: 'O ext guarda cópias do superbloco em grupos de blocos (32768 em blocos de 4 KiB, 8193 em blocos de 1 KiB). `e2fsck -b BLOCO` as usa; `mke2fs -n` (simulação) ou `dumpe2fs` mostram onde ficam.' },
    { q: 'Qual comando mostra as informações do superbloco **e** as de cada grupo de blocos de um ext4, e qual opção limita à parte do superbloco?', ok: 'dumpe2fs e dumpe2fs -h', bad: ['tune2fs -l e tune2fs -h', 'e2fsck -v e e2fsck -h', 'dumpe2fs -h e dumpe2fs', 'debugfs e debugfs -h'], why: '`dumpe2fs DISPOSITIVO` imprime superbloco e grupos; `dumpe2fs -h` apenas o cabeçalho (como `tune2fs -l`).' },
    { q: 'Qual é a diferença entre os campos `Used` e `Avail` do `df` em um ext4 padrão com 5% de reserva?', ok: 'Used + Avail pode ser menor que Size, porque os blocos reservados ao root não contam como disponíveis para usuários comuns', bad: ['Avail é sempre igual a Size − Used', 'Used inclui os inodes e Avail só os blocos', 'Avail mostra o espaço livre do root e Used, o dos usuários', 'Used é calculado em KB e Avail em MB'], why: 'No ext4, 5% dos blocos ficam reservados ao root por padrão (ajustável com `tune2fs -m`), por isso `Size − Used − Avail` ≈ reserva. O `Use%` é calculado como Used / (Used + Avail).' },
  ],
});

export const maintGens = [duLines, fsckExit, tune2fsTask, ext4Reserved, dfDiagnose, fsMaint];

export const generators = [...diskGens, ...maintGens];
