// 101.1 hardware, 101.3 runlevels/targets/shutdown, 102.1 particionamento/LVM, 102.2 GRUB, 102.3 bibliotecas.
// (102.4/102.5/104.x ficam em system2.mjs e system3.mjs)
import { mcq, multi, block, code, pad } from './util.mjs';

// ───────────────────────── helpers compartilhados (system2/system3 importam daqui) ─────────────────────────
export const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
export const ORDM = ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo'];
export const ORDF = ['primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'sétima'];
export const L = (i) => String.fromCharCode(97 + i);
export const hex = (rng, n) => Array.from({ length: n }, () => '0123456789abcdef'[rng.int(0, 15)]).join('');
export const uniq = (arr) => [...new Set(arr)];

/** Gerador a partir de uma tabela de linhas `{q, ok, bad:[...], why, ref?, verify?}` (ou funções (rng) => linha). */
export function tableGen({ id, obj, nivel, peso, ref, rows, type = 'unica' }) {
  return {
    id, obj, nivel, peso,
    make(rng) {
      const r0 = rng.pick(rows);
      const r = typeof r0 === 'function' ? r0(rng) : r0;
      const out = { type, text: r.q, options: mcq(rng, r.ok, r.bad), explanation: r.why, ref: r.ref ?? ref };
      if (r.verify) out.verify = r.verify;
      return out;
    },
  };
}

// ═════════════════════════════════════════════ 101.1 ═════════════════════════════════════════════
const PSEUDO = [
  { p: '/proc/cpuinfo', d: 'modelo, frequência e flags (recursos) de cada processador lógico', chk: 'grep -q ^processor /proc/cpuinfo && echo ok' },
  { p: '/proc/meminfo', d: 'estatísticas de memória: total, livre, buffers, cache e swap', chk: 'grep -q ^MemTotal /proc/meminfo && echo ok' },
  { p: '/proc/interrupts', d: 'quantas interrupções (IRQ) cada CPU atendeu e qual dispositivo usa cada IRQ', chk: 'test -e /proc/interrupts && echo ok' },
  { p: '/proc/ioports', d: 'as faixas de portas de entrada/saída (E/S) registradas e em uso pelos dispositivos', chk: 'test -r /proc/ioports && echo ok' },
  { p: '/proc/dma', d: 'os canais de DMA (acesso direto à memória) registrados e em uso', chk: 'test -r /proc/dma && echo ok' },
  { p: '/proc/devices', d: 'os drivers registrados, com o número major de cada um, separados em dispositivos de caractere e de bloco', chk: 'grep -q "^Character devices:" /proc/devices && echo ok' },
  { p: '/proc/partitions', d: 'discos e partições conhecidos pelo kernel, com major, minor, tamanho em blocos e nome (sda, sda1...)', chk: 'head -1 /proc/partitions | tr -s " "', expect: 'major minor #blocks name' },
  { p: '/proc/modules', d: 'os módulos do kernel carregados (os mesmos dados que o comando lsmod formata)', chk: '[ "$(cut -d" " -f1 /proc/modules | sort)" = "$(lsmod | tail -n +2 | cut -d" " -f1 | sort)" ] && echo ok' },
  { p: '/proc/cmdline', d: 'os parâmetros de linha de comando com que o kernel foi iniciado', chk: 'test -s /proc/cmdline && echo ok' },
  { p: '/proc/swaps', d: 'as áreas de swap ativas, com tipo, tamanho, uso e prioridade', chk: 'head -1 /proc/swaps | grep -q Filename && echo ok' },
  { p: '/proc/version', d: 'a versão do kernel em execução e do compilador que o gerou', chk: 'grep -q "^Linux version" /proc/version && echo ok' },
  { p: '/sys/class/net/', d: 'uma entrada por interface de rede detectada (lo, eth0, ...), exportada pelo sysfs', chk: 'test -d /sys/class/net/lo && echo ok' },
  { p: '/sys/block/', d: 'um diretório por dispositivo de bloco (sda, nvme0n1, loop0...), exportado pelo sysfs', chk: 'test -d /sys/block && echo ok' },
];

const hwPseudofs = {
  id: 'hw-pseudofs', obj: '101.1', nivel: 1, peso: 2,
  make(rng) {
    const e = rng.pick(PSEUDO);
    const dir = rng.chance(0.5);
    const verify = { sh: e.chk, expect: e.expect ?? 'ok' };
    const why = `\`${e.p}\` mostra ${e.d}. /proc e /sys são pseudo-sistemas de arquivos (existem só na RAM, enquanto o sistema roda): /proc traz também dados de processos e estruturas do kernel; /sys (sysfs) é voltado ao modelo de dispositivos e hardware. Comandos como lspci, lsusb e lsmod apenas formatam esses dados.`;
    if (dir) {
      const wrong = PSEUDO.filter((x) => x.p !== e.p).map((x) => x.p);
      return { type: 'unica', text: `Qual arquivo (ou diretório) de pseudo-sistema de arquivos exibe ${e.d}?`, options: mcq(rng, e.p, wrong), explanation: why, ref: ['101:p.21-22'], verify };
    }
    const wrong = PSEUDO.filter((x) => x.p !== e.p).map((x) => x.d);
    return { type: 'unica', text: `O que o conteúdo de \`${e.p}\` mostra?`, options: mcq(rng, e.d[0].toUpperCase() + e.d.slice(1), wrong.map((w) => w[0].toUpperCase() + w.slice(1))), explanation: why, ref: ['101:p.21-22'], verify };
  },
};

const MODS = ['e1000e', 'r8169', 'iwlwifi', 'snd_hda_intel', 'usb_storage', 'nouveau', 'ahci', 'btusb', 'uvcvideo', 'xhci_hcd', 'i915', 'ath9k'];
const hwTools = {
  id: 'hw-tools', obj: '101.1', nivel: 2, peso: 3,
  make(rng) {
    const m = rng.pick(MODS);
    const addr = `${pad(rng.int(0, 7))}:${pad(rng.int(0, 31).toString(16))}.${rng.int(0, 3)}`;
    const vid = hex(rng, 4); const pid = hex(rng, 4);
    const sd = `/dev/sd${L(rng.int(0, 3))}`;
    const ko = `/lib/modules/6.1.0-18-amd64/kernel/drivers/${rng.pick(['net/ethernet', 'usb/storage', 'media/usb', 'gpu/drm'])}/${m}.ko`;
    const helpGrep = (cmd, pat) => ({ sh: `${cmd} 2>&1 | grep -c ${sq(pat)}`, expect: '1' });
    const rows = [
      { t: 'Listar os dispositivos PCI/PCIe, mostrando para cada um o driver (módulo do kernel) que o controla', ok: 'lspci -k', bad: ['lspci -t', 'lspci -nn', 'lsusb -v', 'lsmod', 'lspci -x'], v: helpGrep('lspci -h', 'Show kernel drivers handling each device'), w: '`lspci -k` acrescenta as linhas `Kernel driver in use` e `Kernel modules`. `-t` desenha a árvore de barramentos, `-nn` mostra IDs numéricos e `-x` despeja a configuração em hexadecimal.' },
      { t: 'Listar os dispositivos PCI exibindo, junto ao nome, os IDs numéricos fabricante:dispositivo', ok: 'lspci -nn', bad: ['lspci -n', 'lspci -k', 'lspci -t', 'lsusb -v', 'lspci -x'], v: helpGrep('lspci -h', 'Show both textual and numeric ID'), w: '`-nn` mostra nomes **e** números (ex.: `[8086:153a]`); um único `-n` mostra só os números.' },
      { t: 'Mostrar a hierarquia de barramentos e pontes PCI em forma de árvore', ok: 'lspci -t', bad: ['lspci -k', 'lsusb -t', 'lspci -P', 'lsblk', 'lspci -b'], v: helpGrep('lspci -h', 'Show bus tree'), w: '`lspci -t` (tree) desenha a árvore PCI; `lsusb -t` faz o mesmo, mas para o barramento USB.' },
      { t: 'Mostrar a hierarquia física dos dispositivos USB (hubs, portas e drivers) em árvore', ok: 'lsusb -t', bad: ['lsusb -v', 'lspci -t', 'lsusb -s', 'lsusb -d', 'lsmod'], v: helpGrep('lsusb --help', 'Dump the physical USB device hierarchy as a tree'), w: '`lsusb -t` mostra hubs, portas, classe e `Driver=` de cada interface. `-v` mostra os descritores detalhados; `-s` e `-d` apenas filtram a listagem.' },
      { t: `Mostrar os detalhes (subsistema, flags, IRQ, driver em uso) somente do dispositivo PCI no endereço ${addr}`, ok: `lspci -s ${addr} -v`, bad: [`lspci -d ${addr} -v`, `lspci -s ${addr} -t`, `lsusb -s ${addr} -v`, `lspci ${addr} -k -n`, `lspci -v ${addr}`], w: '`-s` seleciona o dispositivo pelo endereço `barramento:slot.função` e `-v` aumenta o detalhamento. `-d` filtra por ID `fabricante:dispositivo`, não por endereço, e `lsusb` só trata de USB.' },
      { t: `Mostrar os descritores detalhados do dispositivo USB de ID ${vid}:${pid}`, ok: `lsusb -v -d ${vid}:${pid}`, bad: [`lsusb -v -s ${vid}:${pid}`, `lsusb -t -d ${vid}:${pid}`, `lspci -v -d ${vid}:${pid}`, `lsusb -d ${vid}:${pid} -k`], v: helpGrep('lsusb --help', 'Show only devices with the specified vendor and'), w: '`-d fabricante:produto` seleciona pelo ID (hexadecimal) e `-v` mostra os descritores. `-s` espera `barramento:número` em decimal (ex.: `-s 01:20`).' },
      { t: 'Listar os módulos do kernel carregados no momento, com tamanho e contador de uso', ok: 'lsmod', bad: ['modinfo', 'modprobe -c', 'lspci -k', 'insmod -l', 'dmesg'], v: { sh: 'lsmod | head -1 | tr -s " "', expect: 'Module Size Used by' }, w: '`lsmod` formata o conteúdo de `/proc/modules` nas colunas `Module`, `Size` e `Used by`.' },
      { t: `Exibir descrição, arquivo .ko, dependências e parâmetros do módulo ${m} sem carregá-lo`, ok: `modinfo ${m}`, bad: [`lsmod ${m}`, `modprobe -c ${m}`, `insmod ${m}`, `rmmod -v ${m}`, `lspci -k ${m}`], w: '`modinfo` lê as informações gravadas no arquivo do módulo, esteja ele carregado ou não (`modinfo -p` lista só os parâmetros).' },
      { t: `Carregar o módulo ${m}, carregando antes as dependências dele`, ok: `modprobe ${m}`, bad: [`insmod ${m}`, `modprobe -r ${m}`, `rmmod ${m}`, `modinfo ${m}`, `lsmod ${m}`], w: '`modprobe` procura o módulo pelo nome em `/lib/modules/<versão>/` e carrega primeiro as dependências. `insmod` exige o caminho de um arquivo .ko e não resolve dependências.' },
      { t: `Descarregar o módulo ${m} do kernel, removendo também as dependências que deixarem de ser usadas`, ok: `modprobe -r ${m}`, bad: [`rmmod ${m}`, `modprobe ${m}`, `insmod -r ${m}`, `modinfo -r ${m}`, `lsmod -r ${m}`], v: helpGrep('modprobe --help', 'Remove modules instead of inserting'), w: '`modprobe -r` (remove) descarrega o módulo e as dependências que não são mais usadas; `rmmod` remove apenas o módulo indicado, sem tratar dependências.' },
      { t: `Carregar o módulo diretamente do arquivo ${ko}, sem resolver dependências`, ok: `insmod ${ko}`, bad: [`modprobe ${ko} --no-deps`, `depmod ${ko}`, `lsmod ${ko}`, `modinfo -l ${ko}`, `rmmod ${ko}`], w: '`insmod arquivo.ko` insere exatamente aquele arquivo; se faltar uma dependência, falha. `depmod` apenas (re)gera o índice de dependências usado pelo `modprobe`.' },
      { t: 'Ler o buffer circular de mensagens do kernel (detecção de hardware, drivers carregados, erros)', ok: 'dmesg', bad: ['lsmod', 'lspci -k', 'udevadm monitor', 'uname -a', 'lsusb -v'], w: '`dmesg` imprime o buffer de mensagens do kernel — onde se vê, por exemplo, a detecção de um pendrive recém-conectado.' },
      { t: 'Acompanhar em tempo real os eventos (uevents) que o kernel envia ao udev quando um dispositivo é conectado ou removido', ok: 'udevadm monitor', bad: ['udevadm trigger', 'udevadm info', 'udevadm settle', 'dmesg', 'lsusb -t'], w: '`udevadm monitor` mostra os eventos do kernel e do udev em tempo real; `info` consulta atributos, `trigger` reenvia eventos e `settle` espera a fila esvaziar.' },
      { t: `Consultar todos os atributos que o udev conhece sobre ${sd}, úteis para escrever uma regra`, ok: `udevadm info -a -n ${sd}`, bad: [`udevadm monitor ${sd}`, `udevadm trigger -n ${sd}`, `lsblk -a ${sd}`, `lsusb -s ${sd}`, `udevadm settle ${sd}`], w: '`udevadm info -a -n DISPOSITIVO` percorre o dispositivo e seus pais no sysfs mostrando os atributos (`ATTR{...}`, `KERNELS`, ...) que podem ser usados como condição nas regras de `/etc/udev/rules.d/`.' },
    ];
    const r = rng.pick(rows);
    const out = {
      type: 'unica',
      text: `Qual comando realiza a tarefa abaixo?\n\n${r.t}`,
      options: mcq(rng, r.ok, r.bad),
      explanation: `\`${r.ok}\`. ${r.w}`,
      ref: ['101:p.15-19'],
    };
    if (r.v) out.verify = r.v;
    return out;
  },
};

// nomes de dispositivos de bloco
const pre = (s, noun) => (s.p ? `a ${ORDF[s.p - 1]} partição do ${noun}` : `o ${noun}`);
const DEVKINDS = {
  sd: { name: (s) => `/dev/sd${L(s.d)}${s.p ?? ''}`, desc: (s) => pre(s, `${ORDM[s.d]} disco SATA/SCSI/USB (driver sd)`) },
  vd: { name: (s) => `/dev/vd${L(s.d)}${s.p ?? ''}`, desc: (s) => pre(s, `${ORDM[s.d]} disco virtio de uma máquina virtual (driver virtio_blk)`) },
  hd: { name: (s) => `/dev/hd${L(s.d)}${s.p ?? ''}`, desc: (s) => pre(s, `${ORDM[s.d]} disco IDE/PATA em kernels antigos (hda, hdb, hdc...)`) },
  nvme: { name: (s) => `/dev/nvme${s.c}n${s.n}${s.p ? `p${s.p}` : ''}`, desc: (s) => pre(s, `namespace ${s.n} do ${ORDM[s.c]} controlador NVMe (SSD no barramento PCIe)`) },
  mmc: { name: (s) => `/dev/mmcblk${s.d}${s.p ? `p${s.p}` : ''}`, desc: (s) => pre(s, `${ORDM[s.d]} cartão SD/eMMC (driver mmcblk)`) },
  sr: { name: (s) => `/dev/sr${s.d}`, desc: (s) => `o ${ORDM[s.d]} drive óptico (CD/DVD), detectado como dispositivo SCSI` },
  loop: { name: (s) => `/dev/loop${s.d}`, desc: (s) => `o ${ORDM[s.d]} dispositivo de loopback (monta um arquivo-imagem como se fosse um disco)` },
  sdlog: { name: (s) => `/dev/sd${L(s.d)}${5 + s.i}`, desc: (s) => `a ${ORDF[s.i]} partição **lógica** (dentro da estendida) do ${ORDM[s.d]} disco SATA com tabela MBR` },
};

function devVariants(s) {
  const out = [];
  const add = (x) => out.push(x);
  if (s.k === 'sdlog') {
    for (const di of [-1, 1]) if (s.d + di >= 0) add({ ...s, d: s.d + di });
    add({ k: 'sd', d: s.d, p: s.i + 1 }); add({ k: 'sd', d: s.d, p: s.i + 4 });
    add({ ...s, i: s.i + 1 }); if (s.i > 0) add({ ...s, i: s.i - 1 });
    return out;
  }
  const hasP = s.p !== undefined;
  if (s.d !== undefined) { if (s.d > 0) add({ ...s, d: s.d - 1 }); add({ ...s, d: s.d + 1 }); }
  if (hasP) { if (s.p > 1) add({ ...s, p: s.p - 1 }); add({ ...s, p: s.p + 1 }); }
  if (s.k === 'nvme') { add({ ...s, c: s.c + 1 }); if (s.c > 0) add({ ...s, c: s.c - 1 }); add({ ...s, n: s.n === 1 ? 2 : 1 }); }
  for (const k of ['sd', 'vd', 'hd']) if (s.k !== k && s.d !== undefined) add({ ...s, k });
  if (s.k === 'loop' || s.k === 'sr') add({ ...s, k: s.k === 'sr' ? 'loop' : 'sr' });
  return out;
}

const hwDevnames = {
  id: 'hw-devnames', obj: '101.1', nivel: 2, peso: 3,
  make(rng) {
    const kind = rng.pick(['sd', 'sd', 'vd', 'nvme', 'nvme', 'mmc', 'sr', 'loop', 'hd', 'sdlog']);
    const s = { k: kind };
    if (kind === 'nvme') { s.c = rng.int(0, 2); s.n = rng.chance(0.8) ? 1 : 2; s.p = rng.int(1, 4); }
    else if (kind === 'sr' || kind === 'loop') s.d = rng.int(0, 3);
    else if (kind === 'sdlog') { s.d = rng.int(0, 2); s.i = rng.int(0, 2); }
    else { s.d = rng.int(0, kind === 'mmc' ? 2 : 3); s.p = rng.int(1, 4); }
    const spec = (x) => DEVKINDS[x.k];
    const name = spec(s).name(s);
    const vars = devVariants(s).map((v) => [spec(v).name(v), spec(v).desc(v)]).filter(([n]) => n !== name);
    const desc = spec(s).desc(s);
    const cap = (x) => x[0].toUpperCase() + x.slice(1);
    const why = `Convenções do kernel: discos SATA/SCSI/USB/IDE-em-libata → \`sdX\` (a, b, c... por ordem de detecção) + número da partição; NVMe → \`nvme<controlador>n<namespace>p<partição>\`; cartões SD/eMMC → \`mmcblk<N>p<partição>\`; virtio → \`vdX\`; ópticos → \`sr<N>\`; loopback → \`loop<N>\`; IDE antigo → \`hdX\`. Letras de disco começam em \`a\` e números de dispositivo (sr, loop, mmcblk, nvme) em 0, mas as partições começam em 1 — e, em MBR, as partições lógicas começam sempre em 5 (1–4 são reservados às primárias/estendida). Resposta: \`${name}\` = ${desc}.`;
    if (rng.chance(0.55)) {
      const extra = kind === 'nvme' ? [`/dev/nvme${s.c}p${s.p}`, `/dev/nvme${s.c}n${s.n}${s.p}`] : kind === 'mmc' ? [`/dev/mmcblk${s.d}${s.p}`] : kind === 'sdlog' ? [`/dev/sd${L(s.d)}${s.i + 1}`] : [];
      return { type: 'unica', text: `Qual é o arquivo de dispositivo em \`/dev\` que representa ${desc}?`, options: mcq(rng, name, [...vars.map(([n]) => n), ...extra]), explanation: why, ref: ['101:p.22-23'] };
    }
    return { type: 'unica', text: `O arquivo \`${name}\` representa:`, options: mcq(rng, cap(desc), vars.map(([, d]) => cap(d))), explanation: why, ref: ['101:p.22-23'] };
  },
};

const LSPCI_DEVS = [
  { cls: 'Ethernet controller', nm: 'Realtek Semiconductor Co., Ltd. RTL8111/8168/8411 PCI Express Gigabit Ethernet Controller (rev 06)', drv: 'r8169', mods: ['r8169'], alt: ['r8168'] },
  { cls: 'Ethernet controller', nm: 'Intel Corporation 82579LM Gigabit Network Connection (rev 05)', drv: 'e1000e', mods: ['e1000e'], alt: [] },
  { cls: 'Network controller', nm: 'Intel Corporation Wireless 8265 / 8275 (rev 78)', drv: 'iwlwifi', mods: ['iwlwifi'], alt: [] },
  { cls: 'VGA compatible controller', nm: 'NVIDIA Corporation GM107 [GeForce GTX 750 Ti] (rev a2)', drv: 'nouveau', mods: ['nouveau', 'nvidia_drm', 'nvidia'], alt: [] },
  { cls: 'VGA compatible controller', nm: 'Intel Corporation HD Graphics 530 (rev 06)', drv: 'i915', mods: ['i915'], alt: [] },
  { cls: 'SATA controller', nm: 'Intel Corporation 8 Series SATA Controller 1 [AHCI mode] (rev 04)', drv: 'ahci', mods: ['ahci'], alt: [] },
  { cls: 'Audio device', nm: 'Intel Corporation 8 Series HD Audio Controller (rev 04)', drv: 'snd_hda_intel', mods: ['snd_hda_intel'], alt: [] },
  { cls: 'USB controller', nm: 'Intel Corporation 8 Series USB xHCI HC (rev 04)', drv: 'xhci_hcd', mods: [], alt: [] },
  { cls: 'Non-Volatile memory controller', nm: 'Samsung Electronics Co Ltd NVMe SSD Controller SM981/PM981', drv: 'nvme', mods: ['nvme'], alt: [] },
  { cls: 'Network controller', nm: 'Broadcom Inc. and subsidiaries BCM43142 802.11b/g/n (rev 01)', drv: null, mods: ['b43', 'bcma', 'wl'], alt: [] },
];
const LSMOD_BASES = [
  ['nf_conntrack', ['nf_nat', 'xt_conntrack', 'nf_conntrack_netlink']], ['snd_hda_core', ['snd_hda_codec', 'snd_hda_intel']], ['usbcore', ['usb_storage', 'uvcvideo', 'btusb', 'xhci_hcd']],
  ['bluetooth', ['btusb', 'btintel', 'rfcomm']], ['drm', ['i915', 'drm_kms_helper']], ['videodev', ['uvcvideo']], ['mac80211', ['iwlmvm', 'iwlwifi']], ['scsi_mod', ['usb_storage', 'sd_mod', 'ahci']],
  ['ip_tables', ['iptable_filter', 'iptable_nat']], ['cfg80211', ['mac80211', 'iwlwifi']], ['snd_pcm', ['snd_hda_codec', 'snd_hda_intel']], ['crc32c_generic', ['ext4', 'btrfs']],
];

const hwRead = {
  id: 'hw-read-lspci-lsmod', obj: '101.1', nivel: 2, peso: 2,
  make(rng) {
    if (rng.chance(0.55)) {
      const devs = rng.sample(LSPCI_DEVS, 3);
      const used = new Set(); const addrs = [];
      while (addrs.length < 3) { const a = `${pad(rng.int(0, 6))}:${pad(rng.int(0, 31).toString(16))}.${rng.int(0, 3)}`; if (!used.has(a)) { used.add(a); addrs.push(a); } }
      addrs.sort();
      const txt = devs.map((d, i) => `${addrs[i]} ${d.cls}: ${d.nm}\n\tSubsystem: ${rng.pick(['ASUSTeK Computer Inc.', 'Dell', 'Lenovo', 'Gigabyte Technology Co., Ltd'])} Device ${hex(rng, 4)}\n${d.drv ? `\tKernel driver in use: ${d.drv}\n` : ''}${d.mods.length ? `\tKernel modules: ${(d.mods.concat(d.alt)).join(', ')}\n` : ''}`.trimEnd()).join('\n');
      const i = rng.int(0, 2); const d = devs[i];
      const header = `Saída de \`lspci -k\`:\n\n${block(txt)}\n\n`;
      if (d.drv && rng.chance(0.65)) {
        const others = LSPCI_DEVS.flatMap((x) => [...x.mods, ...x.alt, x.drv]).filter((x) => x && x !== d.drv);
        const pool = [...d.mods.concat(d.alt).filter((x) => x !== d.drv), ...others];
        return { type: 'unica', text: `${header}Qual driver (módulo do kernel) está de fato **em uso** pelo dispositivo \`${addrs[i]}\` (${d.cls})?`, options: mcq(rng, d.drv, pool), explanation: `A linha \`Kernel driver in use\` informa o driver ligado ao dispositivo agora; \`Kernel modules\` lista apenas os módulos *capazes* de controlá-lo (alguns podem nem estar carregados). Para \`${addrs[i]}\` o driver em uso é \`${d.drv}\`.`, ref: ['101:p.15-17'] };
      }
      const nodrv = devs.find((x) => !x.drv);
      if (nodrv) {
        const a = addrs[devs.indexOf(nodrv)];
        return { type: 'unica', text: `${header}O que a ausência da linha \`Kernel driver in use\` no dispositivo \`${a}\` indica?`, options: mcq(rng, 'O dispositivo foi detectado, mas nenhum driver está ligado a ele no momento (os módulos listados podem ser carregados com modprobe)', ['O dispositivo está com defeito de hardware e não foi detectado pelo kernel', 'O dispositivo está funcionando em modo genérico, sem necessidade de driver', 'O módulo foi carregado, mas o udev bloqueou o acesso ao dispositivo', 'lspci só mostra o driver para dispositivos USB; para PCI a linha nunca aparece']), explanation: 'O dispositivo aparece em `lspci`, logo o hardware foi detectado. Sem `Kernel driver in use` não há driver ligado a ele; `Kernel modules` lista candidatos que podem ser carregados (ex.: `modprobe nome`).', ref: ['101:p.15-17'] };
      }
      return { type: 'unica', text: `${header}Quais informações a linha \`Kernel modules\` fornece?`, options: mcq(rng, 'Os módulos do kernel que sabem controlar aquele dispositivo (podem ou não estar carregados)', ['Os módulos que estão atualmente carregados e usando o dispositivo', 'Os módulos que foram removidos com modprobe -r desde o boot', 'Os módulos que dependem do driver em uso (coluna Used by do lsmod)']), explanation: '`Kernel modules` lista os módulos candidatos para o dispositivo; o efetivamente ligado a ele é o da linha `Kernel driver in use`.', ref: ['101:p.15-17'] };
    }
    // lsmod
    const picked = rng.sample(LSMOD_BASES, 4);
    const rows = []; const names = new Set();
    for (const [b, deps] of picked) {
      const ds = rng.sample(deps, rng.int(1, Math.min(3, deps.length)));
      rows.push({ m: b, size: rng.int(16, 900) * 4096, deps: ds });
      for (const d of ds) if (!picked.some((p) => p[0] === d)) names.add(d);
    }
    for (const d of names) rows.push({ m: d, size: rng.int(8, 300) * 4096, deps: [] });
    const dedup = []; const seen = new Set();
    for (const r of rows) { if (!seen.has(r.m)) { seen.add(r.m); dedup.push(r); } }
    const final = rng.shuffle(dedup);
    const text = ['Module                  Size  Used by', ...final.map((r) => `${r.m.padEnd(22)} ${String(r.size).padStart(6)}  ${r.deps.length}${r.deps.length ? ' ' + r.deps.join(',') : ''}`)].join('\n');
    const withDeps = final.filter((r) => r.deps.length);
    const fmt = rng.chance(0.5) ? 'deps' : 'free';
    if (fmt === 'deps') {
      const r = rng.pick(withDeps);
      const allMods = uniq(final.map((x) => x.m));
      const wrong = allMods.filter((x) => !r.deps.includes(x) && x !== r.m);
      if (wrong.length < 3 || r.deps.length < 2) {
        const w2 = allMods.filter((x) => x !== r.m && !r.deps.includes(x));
        return { type: 'unica', text: `Saída de \`lsmod\`:\n\n${block(text)}\n\nQual módulo está listado na coluna \`Used by\` de \`${r.m}\`, isto é, depende dele?`, options: mcq(rng, r.deps[0], [...w2, 'ext4', 'vfat', 'loop']), explanation: `Na coluna \`Used by\`, o número é a contagem de usos e, depois dele, vêm os módulos que dependem de \`${r.m}\`: ${r.deps.join(', ')}. Por isso \`${r.m}\` só pode ser descarregado depois deles.`, ref: ['101:p.18-19'] };
      }
      return { type: 'multipla', text: `Saída de \`lsmod\`:\n\n${block(text)}\n\nQuais módulos dependem diretamente de \`${r.m}\` (usam-no)?`, options: multi(rng, r.deps, wrong, Math.max(2, 5 - r.deps.length)), explanation: `A coluna \`Used by\` mostra a contagem de usos seguida dos módulos que dependem de \`${r.m}\`: ${r.deps.join(', ')}. Um módulo só é descarregado (\`modprobe -r\`/\`rmmod\`) se o contador for 0.`, ref: ['101:p.18-19'] };
    }
    const free = final.filter((r) => r.deps.length === 0).map((r) => r.m);
    const busy = final.filter((r) => r.deps.length > 0).map((r) => r.m);
    return { type: 'unica', text: `Saída de \`lsmod\`:\n\n${block(text)}\n\nQual módulo pode ser descarregado imediatamente com \`modprobe -r\`, sem antes remover outros módulos?`, options: mcq(rng, rng.pick(free), busy), explanation: 'Na coluna `Used by`, contador 0 e nenhum nome ao lado significa que nenhum módulo/processo usa aquele módulo, então ele pode ser descarregado. Módulos com contador maior que 0 têm dependentes, que precisam sair antes (o `modprobe -r` remove automaticamente as dependências que ficam sem uso, mas não módulos que ainda estejam em uso).', ref: ['101:p.18-19'] };
  },
};

const hwConcepts = tableGen({
  id: 'hw-concepts', obj: '101.1', nivel: 2, peso: 2, ref: ['101:p.14-22'],
  rows: [
    { q: 'Qual componente cria dinamicamente os arquivos de dispositivo em `/dev` quando o kernel detecta (hotplug ou coldplug) um novo hardware?', ok: 'udev, que recebe o evento do kernel e aplica regras (por exemplo, de /etc/udev/rules.d/)', bad: ['dbus, que repassa o evento do kernel ao /dev', 'modprobe, que cria o nó /dev ao carregar o módulo', 'sysfs, que grava os arquivos em /dev automaticamente', 'lsusb, que registra cada dispositivo USB em /dev'], why: 'O kernel detecta o hardware e envia um evento ao udev, que consulta suas regras (as de fábrica da distribuição e as do administrador em `/etc/udev/rules.d/`), cria o arquivo em `/dev` e pode executar ações (permissões, links simbólicos, etc.). O sysfs (`/sys`) é a fonte de informações que o udev consulta.' },
    { q: 'O que são o `/proc` e o `/sys`?', ok: 'Pseudo-sistemas de arquivos mantidos na memória pelo kernel, que expõem processos e informações de hardware/kernel', bad: ['Partições reais do disco que guardam os drivers de dispositivo', 'Diretórios que armazenam cópias de segurança dos arquivos de configuração do hardware', 'Pontos de montagem de mídias removíveis, como /media e /mnt', 'Diretórios criados pelo udev quando um dispositivo é conectado'], why: '`/proc` (procfs) e `/sys` (sysfs) não ocupam espaço em disco: são visões geradas pelo kernel em tempo de execução. O `/proc` mostra processos e várias estruturas do kernel; o `/sys` organiza o modelo de dispositivos (barramentos, classes, drivers).' },
    { q: 'Qual é a diferença entre `/proc` e `/sys` quanto ao conteúdo?', ok: '/sys é voltado a dispositivos e dados do kernel ligados ao hardware; /proc inclui também processos em execução e estruturas gerais do kernel', bad: ['/proc só contém dispositivos de bloco, enquanto /sys contém apenas processos', '/sys guarda arquivos de configuração persistentes; /proc guarda apenas logs', '/proc é montado a partir do disco e /sys, da RAM', '/sys foi substituído pelo /dev e já não é usado pelo udev'], why: 'Os dois são pseudo-sistemas de arquivos na RAM. O sysfs (`/sys`) é o que o udev usa para obter informações de hardware; o `/proc` também expõe dados de processos (`/proc/PID`) e parâmetros do kernel.' },
    { q: 'Em qual lugar o administrador pode ativar ou desativar periféricos integrados da placa-mãe (porta serial, controlador de rede onboard, USB) e escolher o dispositivo de boot?', ok: 'No utilitário de configuração do firmware (BIOS/UEFI setup), acessado por teclas como Del, F2 ou F12 ao ligar o computador', bad: ['No arquivo /etc/udev/rules.d/ de cada periférico', 'No comando lspci, com a opção --disable', 'Em /sys/firmware, editando o arquivo do dispositivo e reiniciando o udev', 'Somente no bootloader, por parâmetros do GRUB'], why: 'Periféricos integrados são habilitados/desabilitados e a ordem de boot é definida no setup da BIOS/UEFI. Depois disso o sistema operacional só enxerga (via `lspci`, `lsusb`) o que o firmware deixou ativo.' },
    { q: 'Uma placa de vídeo NVIDIA aparece em `lspci`, mas o administrador quer impedir que o módulo livre `nouveau` seja carregado automaticamente (para usar o driver proprietário). O que ele deve fazer?', ok: 'Adicionar a linha `blacklist nouveau` a um arquivo .conf em /etc/modprobe.d/', bad: ['Executar `lsmod -r nouveau` antes de cada boot', 'Adicionar a linha `nouveau=off` em /etc/udev/rules.d/', 'Editar /proc/modules e apagar a linha do nouveau', 'Executar `insmod -b nouveau` para registrá-lo na lista negra'], why: 'Arquivos em `/etc/modprobe.d/*.conf` controlam o `modprobe`: `blacklist modulo` impede o carregamento automático e `options modulo parametro=valor` define parâmetros (ex.: `options nouveau modeset=0`). `/proc/modules` é somente leitura e `lsmod` só lista.', ref: ['101:p.19-21'] },
    { q: 'Como definir de forma persistente um parâmetro de módulo, como `modeset=0` para o módulo `nouveau`?', ok: 'Com uma linha `options nouveau modeset=0` em um arquivo .conf dentro de /etc/modprobe.d/', bad: ['Com `echo modeset=0 > /proc/modules`', 'Com `lsmod nouveau modeset=0` antes de cada boot', 'Editando o arquivo /lib/modules/$(uname -r)/nouveau.ko com um editor de texto', 'Com `udevadm set nouveau modeset=0`'], why: 'Os parâmetros disponíveis aparecem em `modinfo -p nouveau`; para fixá-los usa-se `options modulo parametro=valor` em `/etc/modprobe.d/modulo.conf`. A mesma sintaxe pode ser passada na hora do carregamento: `modprobe nouveau modeset=0`.', ref: ['101:p.19-21'] },
    { q: 'O que significa a diferença entre `lspci` e `lsmod`?', ok: 'lspci lista os dispositivos PCI detectados; lsmod lista os módulos (drivers) do kernel carregados, que podem ou não ter relação com dispositivos PCI', bad: ['lspci lista módulos carregados; lsmod lista dispositivos PCI', 'lspci só funciona para placas de rede; lsmod só para discos', 'São o mesmo comando; lsmod é o nome antigo de lspci', 'lspci lista dispositivos USB e lsmod, dispositivos PCI'], why: '`lspci` e `lsusb` enumeram hardware nos barramentos PCI e USB; `lsmod` mostra o que está carregado no kernel (lido de `/proc/modules`). O elo entre os dois é o driver: `lspci -k` mostra qual módulo controla cada dispositivo.' },
    { q: 'Por que, depois de conectar um pendrive, o arquivo `/dev/sdb` aparece sem que o administrador tenha criado nada em `/dev`?', ok: 'Porque o udev recebeu o evento de hotplug do kernel e criou o nó de dispositivo dinamicamente', bad: ['Porque o comando mount cria o arquivo em /dev ao montar o pendrive', 'Porque o BIOS grava o arquivo em /dev durante o POST', 'Porque o lsusb cria um arquivo para cada dispositivo listado', 'Porque o GRUB gera /dev/sdb a partir do arquivo grub.cfg'], why: 'Hotplug é a detecção de dispositivos com o sistema em execução. O kernel emite um uevent, o udev identifica o dispositivo (consultando o sysfs) e cria `/dev/sdX` e os links úteis (por exemplo, em `/dev/disk/by-uuid/`).', ref: ['101:p.22'] },
    { q: 'Qual é o papel do D-Bus (dbus) na gestão de dispositivos de um sistema Linux moderno?', ok: 'Ser o barramento de mensagens pelo qual daemons e aplicações se comunicam e são notificados (por exemplo, sobre um dispositivo recém-conectado)', bad: ['Criar os arquivos de dispositivo em /dev', 'Carregar automaticamente os módulos do kernel', 'Montar o pseudo-sistema de arquivos /sys durante o boot', 'Listar os dispositivos conectados ao barramento PCI'], why: 'O D-Bus é um sistema de mensagens entre processos. Quem cria os nós de `/dev` é o udev; o D-Bus apenas permite que ambientes e serviços saibam que algo mudou.' },
  ],
});

export const hwGens = [hwPseudofs, hwTools, hwDevnames, hwRead, hwConcepts];

// ═════════════════════════════════════════════ 101.3 ═════════════════════════════════════════════
const RL = {
  0: { t: 'poweroff.target', d: 'desligamento do sistema' },
  1: { t: 'rescue.target', d: 'modo de usuário único (manutenção), sem rede e sem os demais recursos não essenciais' },
  3: { t: 'multi-user.target', d: 'modo multiusuário em texto: login por console e rede, sem interface gráfica' },
  5: { t: 'graphical.target', d: 'modo multiusuário com login em modo gráfico (nível 3 mais o ambiente gráfico)' },
  6: { t: 'reboot.target', d: 'reinicialização do sistema' },
};
const OTHER_TARGETS = ['emergency.target', 'network.target', 'sysinit.target', 'default.target', 'basic.target', 'sockets.target'];

const rlMap = {
  id: 'rl-map', obj: '101.3', nivel: 1, peso: 3,
  make(rng) {
    const n = rng.pick([0, 1, 3, 5, 6]);
    const e = RL[n];
    const keys = Object.keys(RL).map(Number);
    const fmt = rng.int(1, 5);
    const exp = `Correspondência SysV ↔ systemd: 0 → poweroff.target (desligar), 1 → rescue.target (usuário único), 2/3/4 → multi-user.target (o 3 é o típico; 2 e 4 são pouco usados), 5 → graphical.target, 6 → reboot.target. Existem links \`runlevel0.target\` … \`runlevel6.target\` apontando para esses destinos, mas o systemd não usa o /etc/inittab. Aqui: runlevel ${n} ↔ ${e.t} (${e.d}).`;
    if (fmt === 1) {
      return { type: 'unica', text: `Em um sistema SysV, o runlevel ${code(n)} corresponde a qual target do systemd?`, options: mcq(rng, e.t, [...keys.filter((k) => k !== n).map((k) => RL[k].t), ...OTHER_TARGETS]), explanation: exp, ref: ['101:p.48-53'] };
    }
    if (fmt === 2) {
      return { type: 'unica', text: `Qual runlevel do SysVinit equivale ao ${code(e.t)} do systemd?`, options: mcq(rng, String(n), keys.filter((k) => k !== n).map(String).concat(['2'].filter(() => n === 0 || n === 1 || n === 5 || n === 6))), explanation: exp + (n === 3 ? ' (Os runlevels 2 e 4 também apontam para multi-user.target em muitas distribuições; por isso eles não aparecem como alternativas.)' : ''), ref: ['101:p.48-53'] };
    }
    if (fmt === 3) {
      return { type: 'unica', text: `Qual runlevel do SysVinit corresponde a: ${e.d}?`, options: mcq(rng, String(n), keys.filter((k) => k !== n).map(String)), explanation: exp, ref: ['101:p.48'] };
    }
    if (fmt === 4) {
      return { type: 'unica', text: `Qual target do systemd corresponde a: ${e.d}?`, options: mcq(rng, e.t, [...keys.filter((k) => k !== n).map((k) => RL[k].t), ...OTHER_TARGETS]), explanation: exp, ref: ['101:p.51-53'] };
    }
    return {
      type: 'multipla',
      text: 'Quais valores **nunca** devem ser usados como runlevel padrão em `id:N:initdefault:` no `/etc/inittab` (SysVinit)?',
      options: multi(rng, ['0 (desligamento)', '6 (reinicialização)'], ['1 (usuário único)', '2 (multiusuário)', '3 (multiusuário em texto)', '5 (multiusuário gráfico)'].filter((x) => x !== '1 (usuário único)'), 3),
      explanation: 'O runlevel padrão é o que o init ativa ao terminar o boot. Se fosse 0 o sistema desligaria e se fosse 6 reiniciaria no fim da inicialização, em ciclo infinito. O mesmo vale no systemd: o `default.target` nunca deve apontar para o target de desligamento.',
      ref: ['101:p.49'],
    };
  },
};

const rlCmd = {
  id: 'rl-cmd', obj: '101.3', nivel: 2, peso: 3,
  make(rng) {
    const n = rng.pick([1, 3, 5]);
    const tgt = rng.pick(['multi-user.target', 'graphical.target', 'rescue.target']);
    const rlOf = { 'multi-user.target': 3, 'graphical.target': 5, 'rescue.target': 1 }[tgt];
    const useTelinit = rng.chance(0.5);
    const qkind = rng.pick(['q', 'Q']);
    const rows = [
      { q: `Em um sistema com SysVinit, qual comando muda **imediatamente** para o runlevel ${n}, sem reiniciar o computador?`, ok: useTelinit ? `telinit ${n}` : `init ${n}`, bad: [`runlevel ${n}`, `chkconfig --level ${n}`, `systemctl set-default runlevel${n}.target`, `shutdown -r ${n}`, `init=${n}`], why: '`telinit N` e `init N` pedem ao processo init (PID 1) que passe para o runlevel N, parando e iniciando os serviços de /etc/rcN.d/. O comando `runlevel` apenas mostra o nível anterior e o atual; `shutdown -r` reinicia a máquina.' },
      { q: 'Qual comando exibe os runlevels anterior e atual do SysVinit (saída como `N 3`, em que `N` indica que não houve mudança desde o boot)?', ok: 'runlevel', bad: ['telinit q', 'uname -r', 'systemctl get-default', 'who -b', 'init --version'], why: '`runlevel` imprime dois valores: o runlevel anterior (`N` = nenhum) e o atual. `telinit q` relê o /etc/inittab; `who -b` mostra a data do último boot; `systemctl get-default` é do systemd.' },
      { q: 'Qual comando mostra o runlevel atual junto com a data e a hora em que ele foi atingido?', ok: 'who -r', bad: ['runlevel', 'who -b', 'uptime', 'last -x', 'systemctl get-default'], why: '`who -r` imprime algo como `run-level 3  2024-05-12 08:01`. O comando `runlevel` mostra só o nível anterior e o atual, sem data; `who -b` mostra o instante do último boot.' },
      { q: 'Depois de editar o `/etc/inittab`, qual comando faz o init reler o arquivo sem reiniciar o sistema nem mudar de runlevel?', ok: `telinit ${qkind}`, bad: ['telinit 0', 'telinit u', 'telinit s', 'init 6', 'runlevel -r'], why: '`telinit q` (ou `Q`) pede ao init que recarregue a configuração; é recomendável sempre que o /etc/inittab for alterado. `telinit u` pede que o init se reexecute, `telinit s` leva ao modo de usuário único e `telinit 0`/`init 6` desligam/reiniciam.' },
      { q: 'Qual comando do systemd mostra o target padrão de boot?', ok: 'systemctl get-default', bad: ['systemctl show-default', 'systemctl list-default', 'systemctl is-default', 'systemctl get-target', 'runlevel'], why: '`systemctl get-default` informa o destino padrão, que é o alvo do link simbólico `/etc/systemd/system/default.target`. `runlevel` só mostra o nível atual e não existe nenhum `show-default` ou `list-default`.' },
      { q: `Qual comando define **permanentemente** o ${tgt} como target padrão de boot no systemd?`, ok: `systemctl set-default ${tgt}`, bad: [`systemctl isolate ${tgt}`, `telinit ${rlOf}`, `systemctl set-runlevel ${rlOf}`, `systemctl get-default ${tgt}`, `systemctl change-default ${tgt}`], why: '`systemctl set-default` recria o link `/etc/systemd/system/default.target`, valendo a partir do próximo boot. `isolate` e `telinit` alteram apenas o estado atual, sem persistir.' },
      { q: `Qual comando muda **agora** para o ${tgt} no systemd, sem alterar o target padrão de boot?`, ok: `systemctl isolate ${tgt}`, bad: [`systemctl set-default ${tgt}`, `systemctl change-target ${tgt}`, `systemctl switch ${tgt}`, `telinit ${tgt}`, `systemctl runlevel ${rlOf}`], why: '`systemctl isolate ALVO` inicia o alvo e para as unidades que não pertencem a ele (equivalente ao `telinit` do SysV). O padrão de boot só muda com `set-default`.' },
      { q: 'Qual comando coloca um sistema systemd em modo de resgate (usuário único), agora, sem alterar o padrão de boot?', ok: 'systemctl isolate rescue.target', bad: ['systemctl set-default rescue.target', 'systemctl isolate single.target', 'telinit rescue', 'systemctl rescue-mode', 'systemctl isolate runlevel0.target'], why: '`rescue.target` é o equivalente ao runlevel 1. `set-default rescue.target` faria **todos** os próximos boots caírem no modo de resgate; `runlevel0.target` é o desligamento.' },
      { q: 'Qual é o caminho do link simbólico que define o target padrão no systemd?', ok: '/etc/systemd/system/default.target', bad: ['/etc/systemd/default.target', '/etc/inittab', '/lib/systemd/system/runlevel.target', '/etc/default/systemd', '/etc/systemd/system.conf'], why: 'O link `/etc/systemd/system/default.target` aponta para a unidade de destino padrão (por exemplo, graphical.target). O systemd ignora o /etc/inittab.' },
      { q: `Qual entrada do \`/etc/inittab\` define o runlevel ${n} como padrão do SysVinit?`, ok: `id:${n}:initdefault:`, bad: [`id:${n}:default:`, `${n}:initdefault:id:`, `id:initdefault:${n}:`, `id:${n}:respawn:initdefault`, `id:${n}:sysinit:`], why: 'O formato é `id:runlevels:action:process`. Para o runlevel padrão, a ação é `initdefault` e o campo de runlevels contém o número desejado; o campo `process` fica vazio.' },
      { q: 'Em um sistema SysVinit, qual parâmetro adicionado à linha do kernel no GRUB inicia o sistema em modo de usuário único, ignorando o padrão do /etc/inittab?', ok: 'single', bad: ['init=1', 'runlevel=1', 'systemd.unit=1', 'rescue.target', 'initdefault=1'], why: 'Os parâmetros `1`, `S`, `s` ou `single` na linha de comando do kernel pedem o modo de usuário único. `init=` serve para escolher *outro programa* de init, não um runlevel.' },
      { q: 'Qual parâmetro de linha de comando do kernel faz um sistema com systemd iniciar uma vez no `multi-user.target`, sem alterar o padrão gravado em disco?', ok: 'systemd.unit=multi-user.target', bad: ['init=multi-user.target', 'systemd.target=multi-user.target', 'runlevel=multi-user', 'default=multi-user.target', 'systemd.default=multi-user.target'], why: 'O systemd aceita `systemd.unit=ALVO` na linha do kernel (pode ser editada no GRUB com a tecla `e`). Para tornar a escolha persistente seria preciso alterar a configuração do gerenciador de boot ou usar `systemctl set-default`.' },
      { q: 'Em um sistema com Upstart, qual comando lista os serviços (jobs) e seus estados?', ok: 'initctl list', bad: ['systemctl list-units', 'chkconfig --list', 'telinit list', 'runlevel -l'], why: 'No Upstart, `initctl list` mostra cada job com estado (`start/running`, `stop/waiting`) e PID; os jobs ficam em `/etc/init/` e são controlados por `start`, `stop` e `status`.' },
    ];
    const r = rng.pick(rows);
    return { type: 'unica', text: r.q, options: mcq(rng, r.ok, r.bad), explanation: r.why, ref: ['101:p.48-55'] };
  },
};

const INIT_SVCS = ['network', 'sshd', 'httpd', 'crond', 'rsyslog', 'nfs', 'postfix', 'mysqld', 'cups', 'ntpd', 'smb', 'named', 'sendmail', 'acpid'];
const ACTIONS = {
  initdefault: 'define o runlevel padrão (o que será ativado ao fim do boot se nenhum outro for pedido pelo kernel)',
  sysinit: 'executa o processo durante a inicialização, antes dos runlevels; o campo de runlevels é ignorado',
  wait: 'executa o processo ao entrar nos runlevels indicados e o init espera o término dele para continuar',
  respawn: 'reinicia o processo automaticamente sempre que ele terminar (típico de getty)',
  ctrlaltdel: 'executa o processo quando o init recebe o sinal SIGINT, gerado por Ctrl+Alt+Del',
  boot: 'executa o processo na inicialização do sistema, sem esperar o término; o campo de runlevels é ignorado',
  bootwait: 'executa o processo na inicialização e o init espera o término; o campo de runlevels é ignorado',
};

function makeInittab(rng) {
  const def = rng.pick([2, 3, 3, 3, 5, 5, 4]);
  const gettyRl = rng.pick(['23', '2345', '35', '2', '12345', '345']);
  const lines = [];
  const commented = def === 3 ? 5 : 3;
  lines.push('# Default runlevel');
  if (rng.chance(0.5)) lines.push(`#id:${commented}:initdefault:`);
  lines.push(`id:${def}:initdefault:`, '', '# Script executado durante o boot', 'si::sysinit:/etc/init.d/rcS', '', '# Ação em runlevel S (single user)', '~:S:wait:/sbin/sulogin', '');
  for (let i = 0; i <= 6; i++) lines.push(`l${i}:${i}:wait:/etc/init.d/rc ${i}`);
  const ca = rng.pick(['/sbin/shutdown -r now', '/sbin/shutdown -h now', '/sbin/shutdown -a -r now']);
  lines.push('', '# Ação ao pressionar ctrl+alt+del', `ca::ctrlaltdel:${ca}`, '', '# Consoles');
  const nTty = rng.int(2, 4);
  for (let i = 1; i <= nTty; i++) lines.push(`${i}:${gettyRl}:respawn:/sbin/getty tty${i} VC linux`);
  return { lines, def, gettyRl, ca, nTty };
}

const inittabRead = {
  id: 'inittab-read', obj: '101.3', nivel: 2, peso: 2,
  make(rng) {
    const t = makeInittab(rng);
    const content = t.lines.join('\n');
    const fmt = rng.int(1, 4);
    const intro = `Trecho do \`/etc/inittab\` de um sistema SysVinit:\n\n${block(content)}\n\n`;
    if (fmt === 1) {
      return {
        type: 'unica', text: `${intro}Em qual runlevel o sistema inicia por padrão (sem parâmetros do kernel)?`,
        options: mcq(rng, String(t.def), ['0', '1', '2', '3', '4', '5', '6'].filter((x) => x !== String(t.def))),
        explanation: `A entrada ativa é \`id:${t.def}:initdefault:\`; o campo de runlevels contém o nível padrão. Linhas iniciadas por # são comentários e não valem${content.includes('#id:') ? ' (a linha comentada com outro número é ignorada)' : ''}.`,
        ref: ['101:p.48-50'],
        verify: { sh: `printf '%s\\n' ${sq(content)} | awk -F: '$1 !~ /^#/ && $3=="initdefault" {print $2}'`, expect: String(t.def) },
      };
    }
    if (fmt === 2) {
      const sets = uniq([t.gettyRl, '23', '2345', '35', '12345', '3', '2', '345', '5', '1']);
      const label = (s) => [...s].join(', ');
      return {
        type: 'unica', text: `${intro}Em quais runlevels o init mantém ativo o terminal \`tty1\` (linha que começa com \`1:\`)?`,
        options: mcq(rng, label(t.gettyRl), sets.filter((x) => x !== t.gettyRl).map(label)),
        explanation: `No formato \`id:runlevels:action:process\`, o segundo campo da linha \`1:${t.gettyRl}:respawn:/sbin/getty tty1 VC linux\` é \`${t.gettyRl}\`, ou seja, os runlevels ${label(t.gettyRl)}. Com \`respawn\`, o getty é reiniciado sempre que o login termina.`,
        ref: ['101:p.48-50'],
        verify: { sh: `printf '%s\\n' ${sq(content)} | grep '^1:' | cut -d: -f2`, expect: t.gettyRl },
      };
    }
    if (fmt === 3) {
      const OUT = { r: 'Reinicia o sistema imediatamente', h: 'Desliga o sistema imediatamente', a: 'Reinicia o sistema imediatamente, mas apenas se um usuário listado em /etc/shutdown.allow estiver logado' };
      const key = t.ca.includes('-a') ? 'a' : t.ca.includes('-r') ? 'r' : 'h';
      const pool = [...Object.entries(OUT).filter(([k]) => k !== key).map(([, v]) => v), 'Nada acontece: a ação ctrlaltdel só é lida no runlevel 1', 'O init encerra apenas o terminal ativo e reinicia o getty', 'Muda para o runlevel 1 (usuário único)'];
      return {
        type: 'unica', text: `${intro}O que acontece quando alguém pressiona Ctrl+Alt+Del?`,
        options: mcq(rng, OUT[key], pool),
        explanation: `A ação \`ctrlaltdel\` roda o comando quando o init recebe SIGINT (Ctrl+Alt+Del). Aqui: \`${t.ca}\`. \`-r\` reinicia, \`-h\` desliga e \`-a\` restringe a ação aos usuários listados em /etc/shutdown.allow.`,
        ref: ['101:p.49-50', '101:p.56'],
      };
    }
    const act = rng.pick(Object.keys(ACTIONS));
    const sample = { initdefault: `id:${t.def}:initdefault:`, sysinit: 'si::sysinit:/etc/init.d/rcS', wait: 'l3:3:wait:/etc/init.d/rc 3', respawn: `1:${t.gettyRl}:respawn:/sbin/getty tty1 VC linux`, ctrlaltdel: `ca::ctrlaltdel:${t.ca}`, boot: 'bo::boot:/etc/init.d/boot.local', bootwait: 'bw::bootwait:/etc/init.d/rcB' }[act];
    const cap = (x) => x[0].toUpperCase() + x.slice(1);
    return {
      type: 'unica', text: `Na linha abaixo do \`/etc/inittab\`, o que significa a ação \`${act}\`?\n\n${block(sample)}`,
      options: mcq(rng, cap(ACTIONS[act]), Object.entries(ACTIONS).filter(([k]) => k !== act).map(([, v]) => cap(v))),
      explanation: `Ações do /etc/inittab: \`initdefault\` (runlevel padrão), \`sysinit\`/\`boot\`/\`bootwait\` (inicialização; ignoram o campo de runlevels), \`wait\` (executa e espera), \`respawn\` (reinicia ao terminar) e \`ctrlaltdel\` (reação a Ctrl+Alt+Del). Aqui: \`${act}\` ${ACTIONS[act]}.`,
      ref: ['101:p.49'],
    };
  },
};

const rcLinks = {
  id: 'rcd-links', obj: '101.3', nivel: 2, peso: 2,
  make(rng) {
    const rl = rng.pick([2, 3, 5]);
    const svcs = rng.sample(INIT_SVCS, 6);
    const nums = rng.sample([5, 8, 10, 12, 15, 20, 25, 30, 35, 40, 50, 55, 60, 75, 80, 90], 6);
    const nK = rng.int(2, 3);
    const items = svcs.map((s, i) => ({ s, n: nums[i], k: i < nK }));
    const shuffled = rng.shuffle(items);
    const nm = (x) => `${x.k ? 'K' : 'S'}${pad(x.n)}${x.s}`;
    const listing = shuffled.slice().sort((a, b) => (nm(a) < nm(b) ? -1 : 1)).map((x) => `lrwxrwxrwx 1 root root ${10 + x.s.length} mar  4 10:12 ${nm(x)} -> ../init.d/${x.s}`).join('\n');
    const intro = `Conteúdo do diretório \`/etc/rc${rl}.d/\`:\n\n${block(listing)}\n\n`;
    const names = items.map(nm);
    const mk = `d=$(mktemp -d); cd "$d"; touch ${names.map(sq).join(' ')}`;
    const fmt = rng.int(1, 3);
    if (fmt === 1) {
      const starts = items.filter((x) => !x.k).sort((a, b) => (nm(a) < nm(b) ? -1 : 1));
      const first = starts[0];
      return {
        type: 'unica', text: `${intro}Ao entrar no runlevel ${rl}, qual serviço é **iniciado primeiro**?`,
        options: mcq(rng, first.s, starts.slice(1).map((x) => x.s).concat(items.filter((x) => x.k).map((x) => x.s))),
        explanation: `Os links que começam com \`S\` iniciam o serviço (\`K\` o encerra) e são processados em ordem do número/nome. O menor número entre os \`S\` é ${pad(first.n)}: \`${nm(first)}\`. Os links \`K\` (${items.filter((x) => x.k).map((x) => `\`${nm(x)}\``).join(', ')}) apenas **param** os serviços correspondentes; todos os K são tratados antes dos S.`,
        ref: ['101:p.50-51'],
        verify: { sh: `${mk}; ls -1 S* | head -1`, expect: nm(first) },
      };
    }
    if (fmt === 2) {
      const x = rng.pick(items);
      const nice = x.k ? `${x.s} é **parado** (kill), caso esteja em execução` : `${x.s} é **iniciado**`;
      return {
        type: 'unica', text: `${intro}O que acontece com o serviço \`${x.s}\` quando o sistema entra no runlevel ${rl}?`,
        options: mcq(rng, x.k ? `O serviço ${x.s} é parado` : `O serviço ${x.s} é iniciado`, [x.k ? `O serviço ${x.s} é iniciado` : `O serviço ${x.s} é parado`, `O serviço ${x.s} é reiniciado (restart) em todos os runlevels`, `Nada: o link ${nm(x)} só é lido no runlevel ${rl === 5 ? 3 : 5}`, `O link é removido de /etc/init.d/`]),
        explanation: `${nice}. A primeira letra do link em /etc/rcN.d/ define a ação: \`K\` = kill (parar), \`S\` = start. Os links apontam (\`->\`) para os scripts reais em /etc/init.d/.`,
        ref: ['101:p.50-51'],
        verify: { sh: `${mk}; case ${sq(nm(x))} in K*) echo parado;; S*) echo iniciado;; esac`, expect: x.k ? 'parado' : 'iniciado' },
      };
    }
    const ks = items.filter((x) => x.k).map((x) => x.s);
    return {
      type: 'multipla', text: `${intro}Quais serviços são **parados** ao entrar no runlevel ${rl}?`,
      options: multi(rng, ks, items.filter((x) => !x.k).map((x) => x.s), 5 - ks.length + (ks.length === 3 ? 1 : 0)),
      explanation: `Links \`K\` (kill) pararam: ${ks.join(', ')}. Os demais começam com \`S\` e iniciam o serviço.`,
      ref: ['101:p.50-51'],
      verify: { sh: `${mk}; ls -1 K* | sed 's/^K[0-9]*//' | sort | tr '\\n' ' '`, expect: [...ks].sort().join(' ') },
    };
  },
};

const pad2 = (n) => pad(n);
const MSGS = ['Manutencao programada', 'Atualizacao do kernel', 'Backup em andamento', 'Troca de disco', 'Sistema sera reiniciado'];
const shutdownCmd = {
  id: 'shutdown-cmd', obj: '101.3', nivel: 2, peso: 3,
  make(rng) {
    const action = rng.pick(['r', 'h', 'r', 'h', 'c', 'k']);
    const tkind = rng.pick(['now', 'min', 'min', 'clock']);
    const m = rng.pick([2, 5, 10, 15, 20, 30, 45, 60]);
    const hh = rng.int(0, 23); const mm = rng.pick([0, 15, 30, 45]);
    const clock = `${pad2(hh)}:${pad2(mm)}`;
    const time = tkind === 'now' ? 'now' : tkind === 'min' ? `+${m}` : clock;
    const msg = action === 'c' ? null : rng.chance(0.65) ? rng.pick(MSGS) : null;
    const when = tkind === 'now' ? 'imediatamente' : tkind === 'min' ? `daqui a ${m} minutos` : `às ${clock}`;
    const build = (flag, tm, ms, order = 0) => {
      if (flag === 'c') return 'shutdown -c';
      const parts = ['shutdown', flag ? `-${flag}` : '', order === 1 && ms ? `"${ms}"` : tm, order === 1 ? tm : ms ? `"${ms}"` : ''].filter(Boolean);
      return parts.join(' ');
    };
    const correct = build(action, time, msg);
    const flagOther = action === 'r' ? 'h' : 'r';
    const pool = [];
    if (action !== 'c') {
      pool.push(build(flagOther, time, msg), build('k', time, msg));
      if (msg) pool.push(build(action, time, msg, 1));
      pool.push(tkind === 'min' ? build(action, String(m), msg) : tkind === 'clock' ? build(action, `+${clock}`, msg) : build(action, '+now', msg));
      pool.push(tkind === 'min' ? build(action, clock, msg) : tkind === 'clock' ? build(action, `+${hh * 60 + mm}`, msg) : build(action, '0:00', msg));
      pool.push(`shutdown -${action} -t ${tkind === 'min' ? m : 60}${msg ? ` "${msg}"` : ''}`);
      pool.push(build('c', time, msg));
    } else {
      pool.push('shutdown -k now', 'shutdown -r -c', 'shutdown --cancel now', 'shutdown -h +0', 'killall shutdown', 'telinit 6');
    }
    const actDesc = { r: 'Reiniciar o sistema', h: 'Desligar o sistema (parar a máquina)', c: 'Cancelar o desligamento ou a reinicialização que foi agendado com shutdown', k: 'Apenas avisar os usuários de um desligamento fictício, sem desligar nada (teste do aviso)' }[action];
    const whenTxt = action === 'c' ? '' : ` ${when}`;
    const msgTxt = msg ? `, enviando aos usuários logados a mensagem "${msg}"` : '';
    const why = `Sintaxe: \`shutdown [opção] tempo [mensagem]\`. O tempo é obrigatório e pode ser \`hh:mm\` (hora marcada), \`+m\` (daqui a m minutos) ou \`now\` (= \`+0\`); a mensagem de aviso vai por último. \`-r\` reinicia, \`-h\` desliga/para, \`-k\` só envia o aviso e \`-c\` cancela um agendamento. Resposta: \`${correct}\`. Erros típicos: usar \`+hh:mm\` ou minutos sem o \`+\`, colocar a mensagem antes do tempo (ela seria lida como tempo) e confundir \`-t\` (segundos de espera entre SIGTERM e SIGKILL) com o agendamento.`;
    if (rng.chance(0.4) && action !== 'c' && action !== 'k') {
      // formato inverso: comando -> descrição
      const sentence = (a, w, ms) => (a === 'k' ? 'Não desliga nada: apenas avisa os usuários logados' : `${{ r: 'Reinicia o sistema', h: 'Desliga o sistema' }[a]} ${w}`) + (ms ? `, enviando a mensagem "${ms}" aos usuários logados` : '');
      const whenAlt = tkind === 'now' ? `daqui a ${m} minutos` : 'imediatamente';
      const whenAlt2 = tkind === 'clock' ? `daqui a ${hh * 60 + mm} minutos` : tkind === 'min' ? `às ${pad2(m % 24)}:00` : `às 00:00`;
      const ok = sentence(action, when, msg);
      const wrongs = [sentence(flagOther, when, msg), sentence(action, whenAlt, msg), sentence(action, whenAlt2, msg), 'Cancela o desligamento agendado', sentence('k', when, msg)];
      return { type: 'unica', text: `O que faz o comando abaixo?\n\n${block(correct)}`, options: mcq(rng, ok, wrongs.filter((x) => x !== ok)), explanation: why, ref: ['101:p.56-57'] };
    }
    return { type: 'unica', text: `Qual comando executa a tarefa: ${actDesc.toLowerCase()}${whenTxt}${msgTxt}?`, options: mcq(rng, correct, pool.filter((x) => x !== correct)), explanation: why, ref: ['101:p.56-57'] };
  },
};

const UNITS = ['sshd', 'httpd', 'nginx', 'crond', 'chronyd', 'cups', 'postfix', 'docker', 'smb', 'named', 'rsyslog'];
const systemctlTask = {
  id: 'systemctl-task', obj: '101.3', nivel: 2, peso: 3,
  make(rng) {
    const u = `${rng.pick(UNITS)}.service`;
    const rows = [
      { q: `Iniciar \`${u}\` **agora**, sem alterar o que acontece no próximo boot`, ok: `systemctl start ${u}`, bad: [`systemctl enable ${u}`, `systemctl status ${u}`, `systemctl is-active ${u}`, `systemctl daemon-reload`], why: '`start` inicia a unidade nesta sessão; `enable` só cria os links para o início automático no boot (sem iniciar agora).' },
      { q: `Fazer com que \`${u}\` seja iniciado automaticamente a cada boot (sem iniciá-lo agora)`, ok: `systemctl enable ${u}`, bad: [`systemctl start ${u}`, `systemctl is-enabled ${u}`, `systemctl mask ${u}`, `systemctl daemon-reload`], why: '`enable` habilita a unidade para o boot (cria o link em .wants do target). `mask` faz o contrário: impede qualquer início, inclusive manual.' },
      { q: `Impedir que \`${u}\` inicie junto com o sistema, sem parar a instância que está em execução agora`, ok: `systemctl disable ${u}`, bad: [`systemctl stop ${u}`, `systemctl mask ${u}`, `systemctl kill ${u}`, `systemctl is-active ${u}`], why: '`disable` remove o início automático no boot, mas não interrompe o serviço em execução; `stop` interrompe agora e não muda o boot.' },
      { q: `Interromper \`${u}\` imediatamente, mantendo a configuração de boot como está`, ok: `systemctl stop ${u}`, bad: [`systemctl disable ${u}`, `systemctl pause ${u}`, `systemctl halt ${u}`, `systemctl is-active ${u}`], why: '`stop` encerra o serviço agora. `disable` não o interrompe. `pause` não existe e `halt` atua no sistema inteiro, não em um serviço.' },
      { q: `Mostrar apenas \`active\` ou \`inactive\` para \`${u}\`, em uma linha`, ok: `systemctl is-active ${u}`, bad: [`systemctl is-enabled ${u}`, `systemctl is-running ${u}`, `systemctl check ${u}`, `systemctl list-units ${u}`], why: '`is-active` imprime `active`/`inactive` (o código de saída também reflete isso). `is-enabled` informa se a unidade inicia no boot (`enabled`/`disabled`).' },
      { q: `Verificar se \`${u}\` está configurado para iniciar com o sistema`, ok: `systemctl is-enabled ${u}`, bad: [`systemctl is-active ${u}`, `systemctl is-boot ${u}`, `systemctl enabled ${u}`, `systemctl status --boot ${u}`], why: '`is-enabled` retorna `enabled`/`disabled` e o código de saída: 0 quando inicia com o sistema. `is-active` fala do estado atual, não do boot.' },
      { q: `Mostrar o estado detalhado de \`${u}\` (ativo ou não, PID, últimas linhas do log)`, ok: `systemctl status ${u}`, bad: [`systemctl show-status ${u}`, `systemctl is-active ${u}`, `systemctl list-units ${u}`, `systemctl info ${u}`], why: '`status` combina estado, PID, memória e as últimas mensagens do journal. `is-active` imprime apenas uma palavra.' },
      { q: `Pedir que \`${u}\` releia sua configuração sem derrubar o serviço (quando ele suporta)`, ok: `systemctl reload ${u}`, bad: [`systemctl restart ${u}`, `systemctl daemon-reload`, `systemctl reread ${u}`, `systemctl refresh ${u}`], why: '`reload` envia o pedido de recarga ao serviço (por exemplo, SIGHUP) sem interrompê-lo; `restart` para e inicia; `daemon-reload` recarrega os **arquivos de unidade** do systemd, não a configuração do serviço.' },
      { q: `Depois de criar ou editar o arquivo \`/etc/systemd/system/${u}\`, qual comando faz o systemd reler os arquivos de unidade?`, ok: 'systemctl daemon-reload', bad: [`systemctl reload ${u}`, 'systemctl reread-units', 'systemctl reboot', `systemctl restart ${u}`], why: '`systemctl daemon-reload` recarrega as definições de unidade em disco. Sem isso, o systemd continua usando a versão antiga carregada na memória.' },
      { q: 'Listar as unidades do tipo **target** que estão carregadas/ativas no momento', ok: 'systemctl list-units --type=target', bad: ['systemctl list-unit-files --type=target', 'systemctl list-targets', 'systemctl --target list', 'systemctl get-default --all'], why: '`list-units` mostra as unidades carregadas/ativas na sessão; `list-unit-files` mostra os arquivos de unidade instalados e se estão habilitados no boot. `--type=` filtra pelo tipo.' },
      { q: 'Listar todos os arquivos de unidade instalados e se cada um está habilitado para iniciar no boot', ok: 'systemctl list-unit-files', bad: ['systemctl list-units', 'systemctl list-enabled', 'systemctl status --all', 'systemctl show --all'], why: '`systemctl list-unit-files` lista os arquivos de unidade (em /lib/systemd/system, /etc/systemd/system...) com o estado `enabled`/`disabled`/`static`. `list-units` só mostra o que está carregado.' },
      { q: 'Colocar o sistema em suspensão (baixo consumo, mantendo os dados na memória RAM)', ok: 'systemctl suspend', bad: ['systemctl hibernate', 'systemctl poweroff', 'systemctl reboot', 'systemctl sleep-ram'], why: '`suspend` mantém o estado na RAM; `hibernate` grava a memória em disco e desliga. As ações dos botões e da tampa são configuradas em /etc/systemd/logind.conf (a menos que o acpid esteja gerenciando esses eventos).' },
      { q: 'Copiar o conteúdo da memória para o disco e desligar, permitindo recuperar o estado depois', ok: 'systemctl hibernate', bad: ['systemctl suspend', 'systemctl poweroff', 'systemctl reboot', 'systemctl save-state'], why: '`hibernate` grava a memória no disco (swap) antes de desligar; `suspend` mantém a RAM alimentada.' },
      { q: 'Desligar a máquina usando o systemd (requer root)', ok: 'systemctl poweroff', bad: ['systemctl halt-now', 'systemctl reboot', 'systemctl suspend', 'systemctl shutdown'], why: '`systemctl poweroff` desliga e `systemctl reboot` reinicia; ambos exigem privilégios de root. Em muitas distribuições `poweroff` e `reboot` são links para o `systemctl`.' },
    ];
    const r = rng.pick(rows);
    return { type: 'unica', text: `Qual comando do systemd executa a tarefa a seguir?\n\n${r.q}`, options: mcq(rng, r.ok, r.bad), explanation: r.why, ref: ['101:p.51-54', '101:p.56-57'] };
  },
};

const bootConcepts = tableGen({
  id: 'boot-concepts', obj: '101.3', nivel: 2, peso: 2, ref: ['101:p.47-57'],
  rows: [
    { q: 'Qual é o PID do gerenciador de serviços (SysVinit, systemd ou Upstart), o primeiro processo lançado pelo kernel?', ok: '1', bad: ['0', '2', '100', '1000'], why: 'O gerenciador de serviços é o primeiro programa que o kernel executa no boot, portanto seu PID é sempre 1; os demais processos descendem dele.' },
    { q: 'Em um sistema com systemd, o arquivo `/sbin/init` existe. O que ele é?', ok: 'Um link simbólico para o binário principal do systemd (/lib/systemd/systemd)', bad: ['Um script que lê o /etc/inittab e chama os scripts de /etc/init.d', 'Um diretório com os links S e K de cada runlevel', 'Um arquivo de configuração do GRUB', 'Um link para o comando telinit'], why: 'Para manter a compatibilidade, `/sbin/init` aponta para `/lib/systemd/systemd`. O systemd não usa o /etc/inittab.' },
    { q: 'O `/etc/inittab` define o runlevel padrão como 3, mas o sistema sempre inicia no runlevel 1. Qual é a causa mais provável?', ok: 'Um parâmetro como 1, S ou single está presente na linha de comando do kernel (bootloader)', bad: ['O arquivo /etc/rc1.d/ contém mais links S do que o /etc/rc3.d/', 'O comando telinit q não foi executado após editar o arquivo', 'O runlevel 1 é sempre usado quando o sistema usa systemd', 'O campo de ação da linha deveria ser respawn'], why: 'Parâmetros na linha de comando do kernel têm precedência sobre o `initdefault` do /etc/inittab. Verifique a entrada do GRUB e o conteúdo de /proc/cmdline.' },
    { q: 'Por que o runlevel padrão nunca deve ser 0 nem 6?', ok: 'Porque o sistema desligaria (0) ou reiniciaria (6) assim que terminasse de inicializar', bad: ['Porque esses runlevels são reservados ao modo gráfico', 'Porque o init não consegue ler o /etc/inittab nesses níveis', 'Porque 0 e 6 só existem em sistemas com systemd', 'Porque neles a rede não pode ser configurada'], why: 'O runlevel 0 é o desligamento e o 6 é a reinicialização. Defini-los como padrão faria o sistema desligar ou reiniciar em ciclo.' },
    { q: 'O que significa um link chamado `K90network` dentro de `/etc/rc1.d/`?', ok: 'Ao entrar no runlevel 1, o serviço network é interrompido (K = kill); o link aponta para /etc/init.d/network', bad: ['Ao entrar no runlevel 1, o serviço network é iniciado com prioridade 90', 'O serviço network é mantido ativo em todos os runlevels, exceto no 90', 'É um arquivo de log do serviço network no runlevel 1', 'O serviço network é reiniciado 90 segundos depois do boot'], why: 'Links `K` (kill) param o serviço e links `S` (start) iniciam. O número define a ordem. No runlevel 1 (usuário único, sem rede) é natural que a rede seja parada.' },
    { q: 'Onde ficam os scripts reais de controle dos serviços no SysVinit, e o que há em /etc/rc3.d/?', ok: 'Os scripts ficam em /etc/init.d/; em /etc/rc3.d/ há links simbólicos para eles (S = iniciar, K = parar)', bad: ['Os scripts ficam em /etc/rc3.d/; /etc/init.d/ contém apenas links simbólicos', 'Os scripts ficam em /etc/systemd/; /etc/rc3.d/ guarda os logs', 'Os scripts ficam em /etc/inittab; /etc/rc3.d/ define o runlevel padrão', 'Os scripts ficam em /sbin/init; /etc/rc3.d/ guarda os módulos do kernel'], why: 'Como o mesmo script pode servir a vários runlevels, cada /etc/rcN.d/ contém apenas links simbólicos para os scripts de /etc/init.d/.' },
    { q: 'Qual tipo de unidade do systemd agrupa outras unidades e faz o papel dos antigos runlevels?', ok: 'target', bad: ['service', 'socket', 'mount', 'device'], why: 'Uma unidade `target` agrupa outras unidades e é gerenciada como um todo; por exemplo, `multi-user.target` reúne as unidades do ambiente multiusuário (parecido com o runlevel 3).' },
    { q: 'Onde ficam, por padrão, os arquivos de unidade fornecidos pelos pacotes e onde o administrador coloca suas unidades e sobrescritas no systemd?', ok: 'Pacotes: /lib/systemd/system (ou /usr/lib/systemd/system); administrador: /etc/systemd/system', bad: ['Pacotes: /etc/systemd/system; administrador: /lib/systemd/system', 'Pacotes: /etc/init.d; administrador: /etc/rc.d', 'Pacotes e administrador: /etc/systemd/conf.d', 'Pacotes: /usr/lib/systemd/user; administrador: /var/lib/systemd'], why: 'Os arquivos em /etc/systemd/system têm precedência sobre os fornecidos pelos pacotes em /lib/systemd/system (/usr/lib/systemd/system), então o administrador pode sobrescrever ou criar unidades sem alterar os pacotes.' },
    { q: 'Qual arquivo define, no systemd, as ações dos botões de energia e da tampa do notebook (suspender, hibernar, desligar)?', ok: '/etc/systemd/logind.conf (ou arquivos em /etc/systemd/logind.conf.d/)', bad: ['/etc/inittab', '/etc/systemd/system/default.target', '/etc/acpid.conf', '/etc/shutdown.allow'], why: 'O systemd-logind lê /etc/systemd/logind.conf. Isso só vale se nenhum outro gerenciador de energia, como o daemon acpid, estiver em execução.' },
    { q: 'Qual é o papel do daemon `acpid`?', ok: 'Gerenciar eventos de energia ACPI (tampa fechada, botão power, bateria fraca) com ações configuráveis', bad: ['Substituir o systemd como PID 1 em sistemas embarcados', 'Aplicar atualizações de BIOS durante o boot', 'Montar automaticamente discos removíveis', 'Controlar os links S e K dos diretórios /etc/rcN.d/'], why: 'O acpid é o principal gerenciador de energia do Linux e permite ajustar as ações associadas a eventos como fechar a tampa ou bateria fraca; enquanto ele estiver em execução, o systemd-logind não deve tratar esses eventos.' },
    { q: 'Quais sinais o `shutdown` envia aos processos ao desligar ou reiniciar, e em que ordem?', ok: 'SIGTERM primeiro e, depois, SIGKILL', bad: ['SIGKILL primeiro e, depois, SIGTERM', 'SIGHUP primeiro e, depois, SIGSTOP', 'Apenas SIGKILL', 'SIGINT primeiro e, depois, SIGTERM'], why: 'Primeiro os processos recebem SIGTERM (chance de terminar de forma limpa) e depois SIGKILL (término forçado). Além disso, o shutdown avisa os usuários logados e bloqueia novos logins.' },
    { q: 'Qual a função do arquivo `/etc/shutdown.allow` quando o `shutdown -a` é usado na linha `ctrlaltdel` do /etc/inittab?', ok: 'Lista os usuários autorizados a reiniciar o sistema com Ctrl+Alt+Del', bad: ['Lista os serviços que não devem ser parados durante o shutdown', 'Define o horário permitido para desligar o sistema', 'Lista os runlevels permitidos para o shutdown', 'Guarda a mensagem de aviso enviada pelo shutdown'], why: 'Com a opção `-a`, o shutdown só aceita a combinação de teclas se algum dos usuários logados constar em /etc/shutdown.allow.' },
    { q: 'Qual comando envia uma mensagem a todos os terminais dos usuários logados, sem agendar desligamento algum?', ok: 'wall', bad: ['write', 'mesg', 'logger', 'talk'], why: '`wall` (write all) envia o texto (argumento ou arquivo) a todas as sessões de terminal. `write` fala com um único usuário e `mesg` apenas permite ou bloqueia o recebimento de mensagens.' },
    { q: 'Onde ficam os scripts de inicialização (jobs) do Upstart e quais comandos o controlam?', ok: '/etc/init/; initctl list, start, stop e status', bad: ['/etc/init.d/; chkconfig e service', '/etc/systemd/system/; systemctl', '/etc/rc.d/; telinit e runlevel', '/lib/upstart/; apt-get e dpkg'], why: 'O Upstart (criado para o Ubuntu e substituído pelo systemd em 2015) guarda os jobs em /etc/init/. Os comandos `runlevel` e `telinit` continuam existindo por compatibilidade, mas o /etc/inittab não é usado.' },
    { q: 'Qual comando do SysVinit cancelaria uma reinicialização agendada com `shutdown -r +30`?', ok: 'shutdown -c', bad: ['telinit 3', 'shutdown -k', 'init 5', 'killall -HUP init'], why: '`shutdown -c` cancela o desligamento ou reinicialização agendados e avisa os usuários.' },
  ],
});

export const bootGens = [rlMap, rlCmd, inittabRead, rcLinks, shutdownCmd, systemctlTask, bootConcepts];

// ═════════════════════════════════════════════ 102.1 ═════════════════════════════════════════════
const GUID = {
  esp: 'C12A7328-F81F-11D2-BA4B-00A0C93EC93B', linux: '0FC63DAF-8483-4772-8E79-3D69D8477DE4', swap: '0657FD6D-A4AB-43C4-84E5-0933C84B4F4F',
  lvm: 'E6D6D379-F507-44C2-A23C-238F2A3DF928', bios: '21686148-6449-6E6F-744E-656564454649',
};
const partPurpose = tableGen({
  id: 'part-purpose', obj: '102.1', nivel: 2, peso: 3, ref: ['101:p.66-70'],
  rows: [
    { q: 'Para que os dados dos usuários sobrevivam a uma reinstalação do sistema operacional sem serem tocados, qual diretório é recomendável manter em partição (ou disco) separada?', ok: '/home', bad: ['/etc', '/boot', '/dev', '/sys'], why: 'Com `/home` em partição própria, a reinstalação formata apenas a raiz e o `/home` é reaproveitado. `/etc` precisa estar no sistema de arquivos raiz (contém a configuração do host) e `/dev` e `/sys` são virtuais.' },
    { q: 'Um servidor web e um banco de dados gravam logs, caches e dados que crescem muito. Qual diretório vale a pena separar para que um processo descontrolado não encha o sistema de arquivos raiz?', ok: '/var', bad: ['/home', '/boot', '/etc', '/usr/bin'], why: '`/var` guarda dados variáveis (`/var/log`, `/var/tmp`, `/var/cache`, `/var/www/html`, `/var/lib/mysql`). Se estiver na raiz e encher, o sistema inteiro pode travar; separado, o problema fica contido.' },
    { q: 'Em uma máquina com firmware UEFI, onde a partição de sistema EFI (ESP) é montada em um Linux?', ok: '/boot/efi', bad: ['/boot/uefi', '/boot/grub', '/mnt/efi', '/media/efi'], why: 'A ESP é formatada em FAT (geralmente FAT32), guarda os carregadores (`grubx64.efi`, ...) e é montada em `/boot/efi`; `/boot/grub` guarda arquivos do GRUB na partição /boot.' },
    { q: 'Qual é o tamanho recomendado pelo material para uma partição `/boot` em uma máquina atual?', ok: 'Cerca de 300 MB', bad: ['Cerca de 4 MB', 'Cerca de 50 GB', 'Igual ao dobro da memória RAM', 'Mesmo tamanho da partição raiz'], why: '`/boot` guarda apenas kernels, initrd, System.map, config e arquivos do GRUB, por isso é pequena para os padrões atuais (cerca de 300 MB). Ela fica no início do disco para ser alcançável pela BIOS.' },
    { q: 'Em um disco com tabela de partições **MBR**, qual é o ID de tipo da partição de sistema EFI (ESP)?', ok: '0xEF', bad: ['0x83', '0x82', '0x8E', '0x0C'], why: 'Em MBR a ESP usa o tipo `0xEF` (EFI System); `0x83` é Linux, `0x82` é swap, `0x8E` é LVM e `0x0C` é FAT32 (LBA). Em GPT o tipo é identificado por GUID.', verify: { sh: "sfdisk --list-types --label dos | grep -i -E '^ *ef ' | tr -s ' '", expect: 'ef EFI (FAT-12/16/32)' } },
    { q: 'Em um disco com tabela **GPT**, qual GUID identifica a partição de sistema EFI (ESP)?', ok: GUID.esp, bad: [GUID.linux, GUID.swap, GUID.lvm, GUID.bios], why: `O GUID \`${GUID.esp}\` é o da ESP. Os demais são: ${GUID.linux} (dados Linux), ${GUID.swap} (swap), ${GUID.lvm} (LVM) e ${GUID.bios} (BIOS boot, usada pelo GRUB em BIOS + GPT).`, verify: { sh: `sfdisk --list-types --label gpt | grep -i ${GUID.esp} | tr -s ' '`, expect: `${GUID.esp} EFI System` } },
    { q: 'A partição `/boot` costuma ser a primeira do disco e terminar antes do cilindro 1024 (cerca de 528 MB). Por quê?', ok: 'BIOS antigas endereçavam o disco por cilindros/cabeças/setores (CHS) e só alcançavam os primeiros 1024 cilindros, então o kernel precisava estar nessa região', bad: ['O GRUB não consegue ler partições que começam depois do primeiro gigabyte', 'O sistema de arquivos ext4 não suporta partições /boot maiores que 528 MB', 'O kernel só pode ser carregado da primeira partição primária, por exigência do MBR', 'O initrd só funciona quando o /boot ocupa menos de 1024 setores'], why: 'Com o endereçamento CHS original (limite de 1024 cilindros, ~528 MB) o firmware só conseguia ler o kernel nessa região. Com LBA e UEFI isso deixou de ser exigência, mas ainda é uma boa prática para compatibilidade máxima.' },
    { q: 'Em uma instalação sem partição `/boot` separada, o que acontece com os arquivos de boot (kernel, initrd, GRUB)?', ok: 'Ficam em um diretório /boot dentro do sistema de arquivos raiz, e o GRUB os lê a partir de lá', bad: ['O sistema não inicia: a partição /boot é obrigatória em todo Linux', 'Ficam na partição swap, que o BIOS lê durante o boot', 'Ficam em /home, para que cada usuário escolha seu kernel', 'Ficam na ESP, que é obrigatória em discos MBR'], why: 'Uma partição /boot separada não é imprescindível; o GRUB costuma conseguir montar a raiz e achar `/boot` nela. A separação é útil quando a raiz usa criptografia/compactação/sistema de arquivos que o GRUB não entende, ou por segurança.' },
    { q: 'Qual diretório é o ponto de montagem tradicional para montar manualmente, e por pouco tempo, um sistema de arquivos?', ok: '/mnt', bad: ['/media', '/srv', '/opt', '/tmp'], why: 'Tradicionalmente `/mnt` é usado para montagens manuais temporárias. `/media` é o local dos dispositivos removíveis montados automaticamente (`/media/USUARIO/RÓTULO`).' },
    { q: 'Onde os ambientes de desktop modernos montam automaticamente um pendrive de rótulo `BACKUP` conectado pelo usuário `ana`?', ok: '/media/ana/BACKUP', bad: ['/mnt/ana/BACKUP', '/home/ana/media/BACKUP', '/media/BACKUP/ana', '/dev/ana/BACKUP'], why: 'A convenção é `/media/USUÁRIO/RÓTULO`. Para montagens manuais, o recomendado é `/mnt`.' },
    { q: 'Qual afirmação sobre a partição de swap é correta?', ok: 'Ela é preparada com mkswap e ativada com swapon; não é montada em um diretório como as demais', bad: ['Ela é formatada com mkfs.ext4 e montada em /swap', 'Ela precisa ser a última partição do disco e montada em /var', 'Ela é montada em /boot/swap para ser lida pelo GRUB', 'Ela só pode existir como partição; arquivos de swap não são suportados'], why: 'Swap usa tipo de partição específico e `mkswap`; é ativada com `swapon` (ou por uma linha com tipo `swap` no /etc/fstab). Também é possível usar arquivos de swap para aumentar rapidamente o espaço.' },
    { q: 'Qual é a única partição/ponto de montagem **indispensável** em uma instalação Linux?', ok: '/ (raiz)', bad: ['/home', '/boot', '/var', 'swap'], why: 'Só o sistema de arquivos raiz (`/`) é obrigatório. `/boot`, `/home`, `/var` e swap são divisões opcionais, usadas por desempenho, segurança ou facilidade de administração.' },
    { q: 'Qual a vantagem de manter o `/` em um SSD rápido e `/home` e `/var` em discos rígidos maiores e mais baratos?', ok: 'Equilibrar desempenho e custo: o sistema carrega rápido do SSD e os dados volumosos ficam em discos de grande capacidade', bad: ['É obrigatório pelo FHS que /home e /var estejam em discos rotativos', 'O kernel só consegue montar /home e /var a partir de discos SATA', 'Permite compartilhar a mesma partição /boot entre todos os discos', 'Evita a necessidade de criar o arquivo /etc/fstab'], why: 'Dividir diretórios entre dispositivos permite escolher o meio certo para cada uso (velocidade para o sistema, capacidade para dados). Cada ponto de montagem precisa constar no /etc/fstab para ser montado no boot.' },
  ],
});

const swapSize = {
  id: 'swap-size', obj: '102.1', nivel: 3, peso: 1,
  make(rng) {
    const band = rng.pick(['lt2', 'mid', 'big', 'huge']);
    const ram = band === 'lt2' ? rng.pick([0.5, 1, 1.5]) : band === 'mid' ? rng.pick([3, 4, 6]) : band === 'big' ? rng.pick([12, 16, 24, 32, 48]) : rng.pick([96, 128, 256]);
    const hib = rng.chance(0.5);
    let ans; let rule;
    if (band === 'lt2') { ans = hib ? `${ram * 3} GB` : `${ram * 2} GB`; rule = hib ? '3 × RAM' : '2 × RAM'; }
    else if (band === 'mid') { ans = hib ? `${ram * 2} GB` : `${ram} GB`; rule = hib ? '2 × RAM' : 'igual à RAM'; }
    else if (band === 'big') { ans = hib ? `${ram * 1.5} GB` : 'no mínimo 4 GB'; rule = hib ? '1,5 × RAM' : 'no mínimo 4 GB'; }
    else { ans = hib ? 'a hibernação não é recomendada' : 'no mínimo 4 GB'; rule = hib ? 'hibernação não recomendada' : 'no mínimo 4 GB'; }
    const f = (x) => `${String(x).replace('.', ',')} GB`;
    const fix = (s) => s.replace(/^([\d.]+) GB$/, (_, n) => f(n));
    const pool = [`${ram * 2} GB`, `${ram} GB`, `${ram * 3} GB`, `${ram * 1.5} GB`, `${ram * 0.5} GB`, 'no mínimo 4 GB', 'a hibernação não é recomendada', `${ram * 4} GB`].map(fix);
    const correct = fix(ans);
    return {
      type: 'unica',
      text: `Segundo a tabela de swap da Red Hat citada no material (RHEL 7), qual o tamanho de swap recomendado para um servidor com **${f(ram)} de RAM**, ${hib ? '**com**' : '**sem**'} suporte a hibernação?`,
      options: mcq(rng, correct, pool.filter((x) => x !== correct)),
      explanation: `Tabela (RAM → swap | com hibernação): < 2 GB → 2× RAM | 3× RAM; 2–8 GB → igual à RAM | 2× RAM; 8–64 GB → no mínimo 4 GB | 1,5× RAM; > 64 GB → no mínimo 4 GB | hibernação não recomendada. Com ${f(ram)} ${hib ? 'e hibernação' : 'sem hibernação'} vale a regra "${rule}" → ${correct}. (Na hibernação a memória é gravada na swap, por isso ela precisa ser maior.) Para bancos de dados e outros serviços críticos, consulte a documentação do fornecedor.`,
      ref: ['101:p.69-70'],
    };
  },
};

const VGS = ['vg0', 'vg_dados', 'vgsys', 'vg_web', 'vgdata', 'vg_bkp'];
const LVS = ['lv_home', 'lv_var', 'lv_dados', 'lv_root', 'lvlogs', 'lv_db'];
const lvmCmd = {
  id: 'lvm-cmd', obj: '102.1', nivel: 2, peso: 3,
  make(rng) {
    const vg = rng.pick(VGS); const lv = rng.pick(LVS);
    const [a, b, c] = rng.sample(['/dev/sdb1', '/dev/sdc1', '/dev/sdd1', '/dev/sde1', '/dev/vdb1', '/dev/vdc1'], 3);
    const sz = rng.pick([5, 8, 10, 20, 50, 100]); const sz2 = rng.pick([2, 3, 5, 10]);
    const rows = [
      { q: `Inicializar a partição \`${a}\` para uso pelo LVM (criar um volume físico, PV)`, ok: `pvcreate ${a}`, bad: [`vgcreate ${a}`, `lvcreate ${a}`, `pvdisplay ${a}`, `mkfs.lvm ${a}`], why: 'A hierarquia do LVM é PV (volume físico) → VG (grupo de volumes) → LV (volume lógico). `pvcreate` cria o PV; `pvdisplay` só mostra informações.' },
      { q: `Criar o grupo de volumes \`${vg}\` reunindo os PVs \`${a}\` e \`${b}\``, ok: `vgcreate ${vg} ${a} ${b}`, bad: [`vgcreate ${a} ${b} ${vg}`, `pvcreate ${vg} ${a} ${b}`, `lvcreate ${vg} ${a} ${b}`, `vgextend ${vg} ${a} ${b}`], why: 'Em `vgcreate NOME_DO_VG PV...` o primeiro argumento é o nome do novo VG e os seguintes são os PVs (já preparados com `pvcreate`). `vgextend` acrescenta PVs a um VG que já existe.' },
      { q: `Criar um volume lógico de ${sz} GB chamado \`${lv}\` dentro do grupo \`${vg}\``, ok: `lvcreate -L ${sz}G -n ${lv} ${vg}`, bad: [`lvcreate -l ${sz}G -n ${lv} ${vg}`, `lvcreate -L ${sz}G ${lv} ${vg}`, `vgcreate -L ${sz}G -n ${lv} ${vg}`, `lvextend -L ${sz}G -n ${lv} ${vg}`], why: '`-L` informa o tamanho em unidades (G, M); `-l` informa um número de extensões (ou porcentagem como 100%FREE). `-n` dá o nome do LV e o VG vem por último. O dispositivo resultante é `/dev/VG/LV`.' },
      { q: `Criar o volume lógico \`${lv}\` em \`${vg}\` usando **todo o espaço livre** do grupo`, ok: `lvcreate -l 100%FREE -n ${lv} ${vg}`, bad: [`lvcreate -L 100%FREE -n ${lv} ${vg}`, `lvcreate -l 100%LV -n ${lv} ${vg}`, `lvcreate --all -n ${lv} ${vg}`, `lvcreate -s -n ${lv} ${vg}`], why: '`-l` aceita extensões ou porcentagens (`100%FREE` = todas as extensões livres do VG); `-L` espera um tamanho absoluto. `-s` cria um snapshot (precisa de um LV de origem).' },
      { q: `Acrescentar o novo PV \`${c}\` (já criado com pvcreate) ao grupo de volumes existente \`${vg}\``, ok: `vgextend ${vg} ${c}`, bad: [`vgcreate ${vg} ${c}`, `lvextend ${vg} ${c}`, `pvextend ${vg} ${c}`, `vgadd ${vg} ${c}`], why: '`vgextend VG PV` adiciona o PV ao VG, aumentando o espaço livre disponível. `vgcreate` falharia porque o VG já existe; `lvextend` aumenta um LV, e `pvextend`/`vgadd` não existem.' },
      { q: `Aumentar em ${sz2} GB o LV \`/dev/${vg}/${lv}\` (que contém um sistema ext4) e depois ajustar o sistema de arquivos ao novo tamanho`, ok: `lvextend -L +${sz2}G /dev/${vg}/${lv} && resize2fs /dev/${vg}/${lv}`, bad: [`resize2fs /dev/${vg}/${lv} && lvextend -L +${sz2}G /dev/${vg}/${lv}`, `lvextend -L +${sz2}G /dev/${vg}/${lv} && e2fsck /dev/${vg}/${lv}`, `vgextend -L +${sz2}G ${vg} && resize2fs /dev/${vg}/${lv}`, `lvcreate -L +${sz2}G /dev/${vg}/${lv} && resize2fs /dev/${vg}/${lv}`], why: 'Primeiro cresce-se o volume (`lvextend`, com `+` para somar ao tamanho atual); só depois o sistema de arquivos pode ocupar o espaço novo (`resize2fs` para ext2/3/4; `xfs_growfs` para XFS). Se a ordem fosse inversa, o `resize2fs` não teria espaço a usar.' },
      { q: `Mostrar informações detalhadas (tamanho, extensões, status) do volume lógico \`${lv}\` do grupo \`${vg}\``, ok: `lvdisplay /dev/${vg}/${lv}`, bad: [`pvdisplay /dev/${vg}/${lv}`, `vgdisplay /dev/${vg}/${lv}`, `lvcreate --display /dev/${vg}/${lv}`, `lvs -d ${vg} ${lv}`], why: 'Os comandos `pvdisplay`, `vgdisplay` e `lvdisplay` detalham, respectivamente, PVs, VGs e LVs (as versões curtas `pvs`, `vgs`, `lvs` mostram um resumo de uma linha por objeto).' },
      { q: `Qual é o caminho do dispositivo de bloco do volume lógico \`${lv}\` do grupo \`${vg}\`, no formato /dev/VG/LV?`, ok: `/dev/${vg}/${lv}`, bad: [`/dev/${lv}/${vg}`, `/dev/mapper/${vg}/${lv}`, `/dev/${vg}-${lv}`, `/dev/lvm/${vg}/${lv}`], why: 'Depois de criado, o LV é um dispositivo de bloco comum: `/dev/NOME_DO_VG/NOME_DO_LV` (também acessível como `/dev/mapper/VG-LV`). Ele pode receber `mkfs.ext4`, ser montado e listado no /etc/fstab.' },
      { q: 'Qual é a sequência correta para colocar em uso um novo volume lógico com sistema de arquivos ext4?', ok: 'pvcreate → vgcreate → lvcreate → mkfs.ext4 → mount', bad: ['vgcreate → pvcreate → lvcreate → mkfs.ext4 → mount', 'pvcreate → lvcreate → vgcreate → mkfs.ext4 → mount', 'pvcreate → vgcreate → mkfs.ext4 → lvcreate → mount', 'pvcreate → vgcreate → lvcreate → mount → mkfs.ext4'], why: 'PV → VG → LV é a ordem de dependência (o VG é feito de PVs; o LV é cortado do VG). O sistema de arquivos só pode ser criado quando o LV existe, e só então ele é montado.' },
    ];
    const r = rng.pick(rows);
    const full = r.ok.includes('→') || r.ok.startsWith('/dev');
    return { type: 'unica', text: full ? r.q : `Qual comando do LVM realiza a tarefa abaixo?

${r.q}`, options: mcq(rng, r.ok, r.bad), explanation: r.why, ref: ['101:p.70-71'] };
  },
};

const lvmExtents = {
  id: 'lvm-extents', obj: '102.1', nivel: 3, peso: 1,
  make(rng) {
    const pe = rng.pick([4, 4, 8, 16, 32]);
    const fmt = rng.int(1, 3);
    const fm = (mib) => (mib % 1024 === 0 ? `${mib / 1024} GiB` : `${mib} MiB`);
    if (fmt === 1) {
      const n = rng.pick([128, 250, 256, 500, 512, 750, 1000, 1024, 2000, 2560]);
      const total = n * pe;
      const pool = [n * 4, n * pe * 1024, n, Math.round(n / pe), n * pe + pe, n * pe * 1000 / 1024].map((x) => fm(Math.round(x)));
      const correct = fm(total);
      return { type: 'unica', text: `Um grupo de volumes usa extensões físicas (PE) de ${pe} MiB. Um volume lógico foi criado com ${n} extensões. Qual é o tamanho desse LV?`, options: mcq(rng, correct, pool.filter((x) => x !== correct)), explanation: `Tamanho do LV = tamanho da extensão × número de extensões = ${pe} MiB × ${n} = ${total} MiB (${fm(total)}). O LVM aloca sempre em múltiplos inteiros da extensão (por padrão, 4 MiB).`, ref: ['101:p.71'], verify: { sh: `echo $((${pe} * ${n}))`, expect: String(total) } };
    }
    if (fmt === 2) {
      const gib = rng.pick([1, 2, 5, 8, 10, 20, 40]);
      const n = (gib * 1024) / pe;
      const pool = [gib * 1000 / pe, gib * pe, gib * 1024 / 4, gib * 1024 * pe, gib / pe, gib * 1024 / (pe * 2)].map((x) => String(Math.round(x * 100) / 100));
      const correct = String(n);
      return { type: 'unica', text: `Em um VG com extensões de ${pe} MiB, quantas extensões físicas ocupa um LV de ${gib} GiB?`, options: mcq(rng, correct, pool.filter((x) => x !== correct)), explanation: `${gib} GiB = ${gib * 1024} MiB; ${gib * 1024} MiB ÷ ${pe} MiB por extensão = ${n} extensões.`, ref: ['101:p.71'], verify: { sh: `echo $((${gib} * 1024 / ${pe}))`, expect: String(n) } };
    }
    return {
      type: 'unica', text: 'No LVM, como é determinado o tamanho de um volume lógico?',
      options: mcq(rng, 'Pelo tamanho da extensão física (PE) multiplicado pelo número de extensões alocadas ao volume', ['Pelo tamanho do menor PV do grupo de volumes', 'Pelo tamanho do sistema de arquivos criado sobre ele com mkfs', 'Pela soma do tamanho de todos os PVs, dividida pelo número de LVs', 'Pelo limite de cota definido no /etc/lvm/lvm.conf para cada usuário']),
      explanation: 'O VG é dividido em extensões de tamanho fixo (por padrão 4 MB): PE no lado dos PVs e LE no lado dos LVs. O tamanho do LV é a extensão multiplicada pelo número de extensões; para aumentá-lo basta atribuir mais extensões livres do VG.', ref: ['101:p.71'],
    };
  },
};

export const partGens = [partPurpose, swapSize, lvmCmd, lvmExtents];

// ═════════════════════════════════════════════ 102.2 ═════════════════════════════════════════════
const dtype = (rng) => rng.pick(['msdos', 'gpt']);
const grubDevconv = {
  id: 'grub-devconv', obj: '102.2', nivel: 3, peso: 3,
  make(rng) {
    const ver = rng.pick(['legacy', 'grub2']);
    const d = rng.int(0, 3); const p = rng.int(1, 6);
    const dev = `/dev/sd${L(d)}${p}`;
    const tbl = dtype(rng);
    const gl = (dd, pp) => `(hd${dd},${pp - 1})`;
    const g2 = (dd, pp) => `(hd${dd},${pp})`;
    const g2t = (dd, pp, t = tbl) => `(hd${dd},${t}${pp})`;
    const fmt = rng.int(1, 4);
    const why = 'No **GRUB Legacy**, discos *e* partições são numerados a partir de **0**: `/dev/sdb3` = `(hd1,2)`. No **GRUB 2**, os discos continuam a partir de 0, mas as partições começam em **1**: `/dev/sdb3` = `(hd1,3)` (e `ls` mostra `(hd1,msdos3)` em discos MBR ou `(hd1,gpt3)` em GPT). Os discos seguem a ordem de detecção do BIOS: hd0 = primeiro disco (sda).';
    if (fmt === 1) {
      const ok = ver === 'legacy' ? gl(d, p) : g2(d, p);
      const pool = ver === 'legacy' ? [g2(d, p), gl(d + 1, p), gl(d, p + 1), `(hd${p - 1},${d})`, gl(d, p - 1 || 2), gl(d, p + 2), gl(d + 2, p)] : [gl(d, p), g2(d, p + 1), g2(d + 1, p), `(hd${p},${d})`, g2(d, p - 1 || 2), g2(d, p + 2), g2(d + 2, p)];
      return { type: 'unica', text: `No ${ver === 'legacy' ? 'GRUB Legacy' : 'GRUB 2'}, como se escreve \`root\`/\`set root\` para a partição Linux \`${dev}\`?`, options: mcq(rng, ok, pool.filter((x) => x !== ok)), explanation: why + ` Aqui: \`${dev}\` → \`${ok}\`.`, ref: ['101:p.84-89'] };
    }
    if (fmt === 2) {
      const gdev = ver === 'legacy' ? gl(d, p) : g2(d, p);
      const pool = [`/dev/sd${L(d)}${ver === 'legacy' ? p + 1 : p - 1 || 2}`, `/dev/sd${L(d + 1)}${p}`, `/dev/sd${L(p % 4)}${d + 1}`, `/dev/sd${L(Math.max(d - 1, 0) === d ? d + 2 : d - 1)}${p}`, `/dev/sd${L(d)}${ver === 'legacy' ? p - 1 || 2 : p + 1}`];
      return { type: 'unica', text: `Em uma entrada do ${ver === 'legacy' ? 'GRUB Legacy (menu.lst)' : 'GRUB 2 (grub.cfg)'} aparece \`${ver === 'legacy' ? 'root' : 'set root='}${ver === 'legacy' ? ' ' : ''}${gdev}\`. A qual partição do Linux isso corresponde (discos SATA/SCSI nomeados sda, sdb, ...)?`, options: mcq(rng, dev, pool.filter((x) => x !== dev)), explanation: why + ` Aqui: \`${gdev}\` → \`${dev}\`.`, ref: ['101:p.84-89'] };
    }
    if (fmt === 3) {
      const ok = g2t(d, p);
      const other = tbl === 'msdos' ? 'gpt' : 'msdos';
      const pool = [g2t(d, p, other), g2t(d, p - 1 || 2), g2t(d + 1, p), `(hd${p},${tbl}${d})`];
      return { type: 'unica', text: `No shell do GRUB 2, o comando \`ls\` lista as partições do primeiro disco de um sistema com tabela de partições ${tbl === 'msdos' ? '**MBR**' : '**GPT**'}. Como aparece a partição \`${dev}\`?`, options: mcq(rng, ok, pool.filter((x) => x !== ok)), explanation: why + ' O prefixo `msdos` indica tabela MBR e `gpt`, tabela GUID.', ref: ['101:p.86'] };
    }
    const ok = `${gl(d, p)} e ${g2(d, p)}`;
    const pool = [`${g2(d, p)} e ${gl(d, p)}`, `${gl(d, p)} em ambos`, `${g2(d, p)} em ambos`, `${gl(d, p + 1)} e ${g2(d, p + 1)}`];
    return { type: 'unica', text: `Qual par de notações referencia \`${dev}\`, respectivamente, no GRUB Legacy e no GRUB 2?`, options: mcq(rng, ok, pool.filter((x) => x !== ok)), explanation: why + ` Resposta: Legacy ${gl(d, p)}; GRUB 2 ${g2(d, p)}.`, ref: ['101:p.84-89'] };
  },
};

const grubTask = {
  id: 'grub-task', obj: '102.2', nivel: 2, peso: 3,
  make(rng) {
    const dk = `/dev/sd${L(rng.int(0, 1))}`;
    const kv = `${rng.int(4, 6)}.${rng.int(0, 15)}.${rng.int(0, 9)}-${rng.int(1, 80)}-generic`;
    const rows = [
      { q: `Reinstalar o GRUB 2 no MBR do disco \`${dk}\` (estando em um sistema em funcionamento)`, ok: `grub-install ${dk}`, bad: [`grub-install ${dk}1`, `grub-mkconfig ${dk}`, `update-grub ${dk}`, `grub-install --boot-directory=${dk}`], why: 'O `grub-install` recebe o **dispositivo (disco)** onde o carregador será gravado, e não a partição. `--boot-directory=` indica onde fica o diretório com os arquivos do GRUB (/boot), não o disco.' },
      { q: 'Regenerar o /boot/grub/grub.cfg em Debian/Ubuntu depois de alterar o /etc/default/grub', ok: 'update-grub', bad: ['grub-install', 'grub-mkconfig', 'grub-update', 'update-grub /etc/default/grub'], why: '`update-grub` é um atalho para `grub-mkconfig -o /boot/grub/grub.cfg`. O `grub-mkconfig` sozinho apenas imprime a configuração na saída padrão; o `grub-install` grava o carregador no disco.' },
      { q: 'Gerar o arquivo /boot/grub/grub.cfg diretamente com grub-mkconfig', ok: 'grub-mkconfig -o /boot/grub/grub.cfg', bad: ['grub-mkconfig > /etc/default/grub', 'grub-mkconfig -i /boot/grub/grub.cfg', 'grub-install -o /boot/grub/grub.cfg', 'update-grub -o /boot/grub/menu.lst'], why: 'A opção `-o` indica o arquivo de saída. O `grub-mkconfig` lê /etc/default/grub e os scripts de /etc/grub.d/ e produz o grub.cfg; sobrescrever /etc/default/grub apagaria as configurações do administrador.' },
      { q: 'Em um sistema Red Hat/CentOS/Fedora com BIOS, regenerar o arquivo de configuração do GRUB 2', ok: 'grub2-mkconfig -o /boot/grub2/grub.cfg', bad: ['grub-mkconfig -o /boot/grub2/grub.cfg', 'update-grub2', 'grub2-install -o /boot/grub2/grub.cfg', 'grub2-mkconfig -o /boot/grub/menu.lst'], why: 'Na família Red Hat os comandos levam o prefixo `grub2-` e o diretório é `/boot/grub2/`. `update-grub` é um utilitário do Debian/Ubuntu.' },
      { q: 'Qual arquivo o administrador deve editar para alterar opções como o tempo limite do menu e a entrada padrão do GRUB 2?', ok: '/etc/default/grub', bad: ['/boot/grub/grub.cfg', '/boot/grub/menu.lst', '/etc/grub.d/00_header', '/etc/grub.conf'], why: 'O grub.cfg é gerado automaticamente (edições manuais são perdidas na próxima execução de `update-grub`). As opções ficam em /etc/default/grub; depois roda-se `update-grub`.' },
      { q: 'Onde se adicionam entradas de menu personalizadas ao GRUB 2 para que sobrevivam à regeneração do grub.cfg?', ok: '/etc/grub.d/40_custom', bad: ['/etc/default/grub', '/boot/grub/grub.cfg', '/etc/grub.d/10_linux', '/boot/grub/menu.lst'], why: 'Os scripts de /etc/grub.d/ (executáveis) são processados em ordem numérica pelo `update-grub`; o `40_custom` é o lugar previsto para entradas manuais. O `10_linux` gera as entradas dos kernels automaticamente.' },
      { q: 'Como os scripts do diretório /etc/grub.d/ são tratados pelo update-grub / grub-mkconfig?', ok: 'Precisam ser executáveis e são processados em ordem numérica do nome (por exemplo, 05_debian_theme antes de 10_linux)', bad: ['São processados em ordem alfabética inversa, do maior número para o menor', 'Precisam ter extensão .cfg e são lidos diretamente pelo firmware', 'São copiados sem alteração para a partição EFI', 'São executados somente no primeiro boot depois da instalação'], why: 'Cada script gera um trecho do grub.cfg: `00_header`, `10_linux` (kernels), `30_os-prober` (outros sistemas), `40_custom` (entradas do administrador). Scripts sem permissão de execução são ignorados.' },
      { q: 'Qual é o arquivo de configuração (menu) do GRUB Legacy em Debian e derivados?', ok: '/boot/grub/menu.lst', bad: ['/boot/grub/grub.cfg', '/etc/default/grub', '/etc/grub.d/40_custom', '/boot/grub2/grub.cfg'], why: 'O GRUB Legacy lê um arquivo de texto simples, editado à mão: `/boot/grub/menu.lst` (em algumas distribuições Red Hat, `grub.conf`). O GRUB 2 usa `/boot/grub/grub.cfg`, gerado automaticamente.' },
      { q: 'No shell do GRUB Legacy, qual comando instala o carregador no MBR do primeiro disco (depois de definir a partição de boot com `root`)?', ok: 'setup (hd0)', bad: ['setup (hd0,0)', 'install (hd0)', 'grub-install (hd0,0)', 'find (hd0)'], why: '`setup (hd0)` grava o GRUB no MBR do primeiro disco; `setup (hd0,0)` grava no setor de boot da primeira *partição*. Antes disso, `root (hd0,0)` define onde está /boot e `find /boot/grub/stage1` ajuda a descobri-lo.' },
      { q: 'No shell do GRUB Legacy, como descobrir qual partição contém o diretório /boot/grub?', ok: 'find /boot/grub/stage1', bad: ['search /boot/grub/stage1', 'root /boot/grub/stage1', 'locate /boot/grub/stage1', 'setup /boot/grub/stage1'], why: 'O comando `find` do shell do GRUB Legacy procura o arquivo informado em todas as partições e devolve algo como `(hd0,0)`.' },
      { q: `Qual arquivo de /boot contém o **kernel compactado** do Linux ${kv}?`, ok: `vmlinuz-${kv}`, bad: [`System.map-${kv}`, `initrd.img-${kv}`, `config-${kv}`, `grub.cfg-${kv}`], why: 'Em /boot encontram-se: `vmlinuz-VERSÃO` (kernel; o `z` indica compactação), `initrd.img-VERSÃO` (disco RAM inicial), `System.map-VERSÃO` (tabela de símbolos) e `config-VERSÃO` (opções de compilação do kernel).' },
      { q: `Qual arquivo de /boot contém o disco RAM inicial (initrd) do kernel ${kv}, com os módulos necessários para montar o sistema de arquivos raiz?`, ok: `initrd.img-${kv}`, bad: [`vmlinuz-${kv}`, `System.map-${kv}`, `config-${kv}`, `grub.cfg-${kv}`], why: 'O `initrd.img-VERSÃO` é um sistema de arquivos raiz mínimo carregado na RAM, com utilitários e módulos que o kernel usa para montar a raiz real.' },
      { q: `Qual arquivo de /boot é uma tabela que associa nomes de símbolos (funções, variáveis) do kernel ${kv} a endereços de memória, útil para analisar um kernel panic?`, ok: `System.map-${kv}`, bad: [`config-${kv}`, `vmlinuz-${kv}`, `initrd.img-${kv}`, `grub.cfg-${kv}`], why: 'O `System.map-VERSÃO` mapeia símbolos para posições na memória; o `config-VERSÃO` registra as opções usadas na compilação e não deve ser editado manualmente.' },
      { q: 'No menu do GRUB 2, qual tecla abre o editor da entrada selecionada (para alterar, por exemplo, parâmetros do kernel apenas nesta inicialização)?', ok: 'e', bad: ['c', 'Esc', 'F2', 'Tab'], why: 'No menu: `e` edita a entrada (depois Ctrl+X ou F10 inicia o boot, Esc volta ao menu); `c` abre o shell de comandos do GRUB (`grub>`). Se aparecer só uma contagem regressiva sem menu, pressione Shift.' },
      { q: 'No menu do GRUB 2, qual tecla abre a linha de comando (o shell `grub>`)?', ok: 'c', bad: ['e', 'F10', 'Ctrl+X', 'Delete'], why: '`c` abre o shell do GRUB (a partir do editor, Ctrl+C faz o mesmo). `e` edita a entrada, e Ctrl+X/F10 inicializam com as alterações feitas.' },
      { q: 'Em um GRUB 2 funcionando, qual é o comando do shell `grub>` que inicia o sistema depois de definidos `set root`, `linux` e `initrd`?', ok: 'boot', bad: ['start', 'init 3', 'chainloader +1', 'setup'], why: 'No shell do GRUB 2, a sequência típica é `set root=...`, `linux /vmlinuz root=/dev/sdXN`, `initrd /initrd.img` e `boot`.' },
    ];
    const r = rng.pick(rows);
    const lead = r.q.endsWith('?') ? r.q : `Qual comando/arquivo corresponde à tarefa a seguir?\n\n${r.q}`;
    return { type: 'unica', text: lead, options: mcq(rng, r.ok, r.bad), explanation: r.why, ref: ['101:p.80-89'] };
  },
};

const grubDefaults = {
  id: 'grub-defaults', obj: '102.2', nivel: 2, peso: 2,
  make(rng) {
    const fmt = rng.int(1, 4);
    if (fmt === 1) {
      const n = rng.int(2, 5);
      return { type: 'unica', text: `Em \`/etc/default/grub\`, qual valor de \`GRUB_DEFAULT\` faz o GRUB 2 iniciar por padrão a ${ORDF[n - 1]} entrada do menu?`, options: mcq(rng, String(n - 1), [String(n), String(n + 1), String(n - 2 < 0 ? n + 2 : n - 2), 'saved', 'last']), explanation: `As entradas do menu são numeradas a partir de **zero**: a primeira é 0, a segunda é 1 e assim por diante. A ${ORDF[n - 1]} é, portanto, \`GRUB_DEFAULT=${n - 1}\`. Depois de editar o arquivo é preciso executar \`update-grub\` (ou \`grub-mkconfig -o /boot/grub/grub.cfg\`) para que valha.`, ref: ['101:p.83'] };
    }
    if (fmt === 2) {
      const t = rng.pick([0, 3, 5, 10, 30]);
      const mk = (v) => `GRUB_TIMEOUT=${v}`;
      const goal = rng.pick(['zero', 'wait', 'secs']);
      if (goal === 'zero') return { type: 'unica', text: 'Qual configuração faz o GRUB 2 inicializar a entrada padrão imediatamente, sem exibir o menu?', options: mcq(rng, 'GRUB_TIMEOUT=0', ['GRUB_TIMEOUT=-1', 'GRUB_TIMEOUT=1', 'GRUB_DEFAULT=0', 'GRUB_TIMEOUT=off']), explanation: '`GRUB_TIMEOUT` é o tempo, em segundos, antes de iniciar a entrada padrão. Com `0` o menu nem é exibido; com `-1` o GRUB espera indefinidamente até o usuário escolher.', ref: ['101:p.83'] };
      if (goal === 'wait') return { type: 'unica', text: 'Qual configuração faz o GRUB 2 aguardar indefinidamente até que o usuário escolha uma entrada?', options: mcq(rng, 'GRUB_TIMEOUT=-1', ['GRUB_TIMEOUT=0', 'GRUB_TIMEOUT=999999', 'GRUB_DEFAULT=-1', 'GRUB_TIMEOUT=wait']), explanation: '`GRUB_TIMEOUT=-1` desativa a contagem regressiva: o menu fica na tela até alguém escolher. `0` inicia a entrada padrão sem mostrar o menu.', ref: ['101:p.83'] };
      const s = t || 7;
      return { type: 'unica', text: `Qual linha de \`/etc/default/grub\` faz o menu do GRUB 2 ficar ${s} segundos na tela antes de iniciar a entrada padrão?`, options: mcq(rng, mk(s), [`GRUB_DEFAULT=${s}`, `GRUB_TIMEOUT=-${s}`, `GRUB_DELAY=${s}`, `GRUB_TIMEOUT_STYLE=${s}`]), explanation: `\`GRUB_TIMEOUT\` define os segundos de espera do menu. \`GRUB_DEFAULT\` escolhe a entrada, e \`GRUB_TIMEOUT=-N\` não é um valor válido (apenas \`-1\` tem significado: esperar indefinidamente).`, ref: ['101:p.83'] };
    }
    if (fmt === 3) {
      const opt = rng.pick(['quiet nomodeset', 'quiet splash', 'console=ttyS0,115200', 'nomodeset', 'systemd.unit=multi-user.target']);
      const both = rng.chance(0.5);
      const ok = both ? `GRUB_CMDLINE_LINUX="${opt}"` : `GRUB_CMDLINE_LINUX_DEFAULT="${opt}"`;
      const bad = both ? [`GRUB_CMDLINE_LINUX_DEFAULT="${opt}"`, `GRUB_CMDLINE="${opt}"`, `GRUB_KERNEL_PARAMS="${opt}"`, `GRUB_DEFAULT="${opt}"`] : [`GRUB_CMDLINE_LINUX="${opt}"`, `GRUB_CMDLINE="${opt}"`, `GRUB_KERNEL_PARAMS="${opt}"`, `GRUB_DEFAULT="${opt}"`];
      return { type: 'unica', text: `Para acrescentar \`${opt}\` à linha do kernel ${both ? '**em todas as entradas geradas, inclusive as de recuperação (recovery)**' : '**somente nas entradas de inicialização normal**, não nas de recuperação'}, qual linha deve ser colocada em /etc/default/grub?`, options: mcq(rng, ok, bad), explanation: 'O `update-grub` gera, para cada kernel, uma entrada normal e uma de recuperação. `GRUB_CMDLINE_LINUX` vale para as duas; `GRUB_CMDLINE_LINUX_DEFAULT` só para a normal. Depois de editar, execute `update-grub`.', ref: ['101:p.83-84'] };
    }
    const def = rng.pick([0, 1, 2, 'saved']); const to = rng.pick([0, 5, 10, -1]);
    const lines = [`GRUB_DEFAULT=${def}`, ...(def === 'saved' ? ['GRUB_SAVEDEFAULT=true'] : []), `GRUB_TIMEOUT=${to}`, 'GRUB_CMDLINE_LINUX_DEFAULT="quiet"'];
    const entry = def === 'saved' ? 'a última entrada escolhida no menu' : `a ${ORDF[def]} entrada do menu`;
    const tm = to === 0 ? 'imediatamente, sem mostrar o menu' : to === -1 ? 'só depois de o usuário escolher, pois o menu espera indefinidamente' : `após ${to} segundos de menu`;
    const ok = `Inicia ${entry} ${tm}`;
    const alts = [];
    if (def === 'saved') alts.push(`Inicia a primeira entrada do menu ${tm}`); else { alts.push(`Inicia a ${ORDF[def + 1]} entrada do menu ${tm}`); if (def > 0) alts.push(`Inicia a ${ORDF[def - 1]} entrada do menu ${tm}`); alts.push(`Inicia a última entrada escolhida no menu ${tm}`); }
    const tmAlt = to === 0 ? 'após 10 segundos de menu' : to === -1 ? 'imediatamente, sem mostrar o menu' : 'só depois de o usuário escolher, pois o menu espera indefinidamente';
    alts.push(`Inicia ${entry} ${tmAlt}`);
    alts.push(`Inicia ${entry} ${to === 5 ? 'após 10 segundos de menu' : 'após 5 segundos de menu'}`);
    return { type: 'unica', text: `Com o /etc/default/grub abaixo (e depois de executar update-grub), o que acontece ao ligar o computador?\n\n${block(lines.join('\n'))}`, options: mcq(rng, ok, alts.filter((x) => x !== ok)), explanation: `\`GRUB_DEFAULT=${def}\` ${def === 'saved' ? '(com `GRUB_SAVEDEFAULT=true`) repete a última escolha; ' : `escolhe a entrada de índice ${def} — como a contagem começa em 0, é a ${ORDF[def]} — `}e \`GRUB_TIMEOUT=${to}\` define ${to === 0 ? 'inicialização imediata (sem menu)' : to === -1 ? 'espera indefinida' : `${to} segundos de espera`}.`, ref: ['101:p.83'] };
  },
};

const grubEntry = {
  id: 'grub-entry-lines', obj: '102.2', nivel: 3, peso: 2,
  make(rng) {
    const kv = `${rng.int(4, 6)}.${rng.int(0, 19)}.${rng.int(0, 9)}-${rng.int(1, 60)}-amd64`;
    const d = rng.int(0, 1); const p = rng.int(1, 2);
    const dev = `/dev/sd${L(d)}${p}`; // partição que o GRUB usa como root (onde ficam kernel e initrd)
    const sep = rng.chance(0.5); // /boot em partição própria?
    const rdev = sep ? `/dev/sd${L(d)}${p + rng.int(1, 2)}` : dev; // dispositivo raiz passado ao kernel
    const ver = rng.pick(['grub2', 'legacy']);
    const fmt = rng.int(1, 5);
    const g2 = `menuentry "Debian GNU/Linux" {\n    set root=(hd${d},${p})\n    linux /vmlinuz-${kv} root=${rdev} ro quiet splash\n    initrd /initrd.img-${kv}\n}`;
    const gl = `title Debian GNU/Linux\nroot (hd${d},${p - 1})\nkernel /vmlinuz-${kv} root=${rdev} ro quiet\ninitrd /initrd.img-${kv}`;
    if (fmt === 1) {
      const txt = ver === 'grub2' ? g2 : gl;
      const ok = ver === 'grub2' ? 'GRUB 2: entrada em /boot/grub/grub.cfg (normalmente gerada pelo update-grub; as manuais ficam em /etc/grub.d/40_custom)' : 'GRUB Legacy: entrada em /boot/grub/menu.lst, editado diretamente';
      return { type: 'unica', text: `A entrada de menu abaixo pertence a qual versão do GRUB e a qual arquivo?\n\n${block(txt)}`, options: mcq(rng, ok, [ver === 'grub2' ? 'GRUB Legacy: entrada em /boot/grub/menu.lst, editado diretamente' : 'GRUB 2: entrada em /boot/grub/grub.cfg (normalmente gerada pelo update-grub; as manuais ficam em /etc/grub.d/40_custom)', 'LILO: entrada em /etc/lilo.conf', 'GRUB 2: entrada em /etc/default/grub', 'systemd-boot: entrada em /boot/loader/entries']), explanation: 'Sintaxe do GRUB 2: `menuentry "título" { ... }` com `set root=`, `linux` e `initrd`. Sintaxe do GRUB Legacy: linhas `title`, `root (hdX,Y)`, `kernel` e `initrd`, sem chaves.', ref: ['101:p.84-89'] };
    }
    if (fmt === 2) {
      const txt = ver === 'grub2' ? g2 : gl;
      const gdev = ver === 'grub2' ? `(hd${d},${p})` : `(hd${d},${p - 1})`;
      const pool = [rdev, `/dev/sd${L(d)}${p + 3}`, `/dev/sd${L(d + 1)}${p}`, `/dev/sd${L(d ^ 1)}${p + 1}`, `/dev/sd${L(d)}${p + 4}`];
      return { type: 'unica', text: `Na entrada abaixo, qual partição do Linux o GRUB usa para localizar o kernel e o initrd (\`${ver === 'grub2' ? 'set root' : 'root'}\`)?\n\n${block(txt)}`, options: mcq(rng, dev, pool.filter((x) => x !== dev)), explanation: `\`${gdev}\` ${ver === 'grub2' ? '(GRUB 2: disco a partir de 0, partição a partir de 1)' : '(GRUB Legacy: disco e partição a partir de 0)'} corresponde a \`${dev}\`. Atenção: o \`root=${rdev}\` da linha do kernel é *outra coisa* — é o parâmetro que diz ao kernel qual dispositivo montar como raiz${sep ? ' (aqui /boot está numa partição separada, por isso os dois valores diferem)' : ''}.`, ref: ['101:p.84-89'] };
    }
    if (fmt === 3) {
      const rows = [
        { l: `linux /vmlinuz-${kv} root=${rdev} ro quiet splash`, ok: `Carrega o kernel e informa a ele que o sistema de arquivos raiz está em ${rdev}, montado inicialmente somente para leitura (ro), com poucas mensagens (quiet) e tela de abertura (splash)`, bad: [`Carrega o initrd e monta ${rdev} em /mnt para leitura e escrita`, `Define ${rdev} como dispositivo de boot do GRUB (equivale a set root)`, `Instala o GRUB em ${rdev} e o marca como ativo`, `Carrega o kernel e monta ${rdev} como swap`] },
        { l: `initrd /initrd.img-${kv}`, ok: 'Carrega o disco RAM inicial, com os módulos e utilitários que o kernel precisa para montar o sistema de arquivos raiz real', bad: ['Inicializa a rede para o boot via PXE', 'Informa ao kernel o dispositivo raiz que deve ser montado', 'Reinstala o GRUB no MBR do disco', 'Executa o script de init do primeiro runlevel'] },
        { l: `set root=(hd${d},${p})`, ok: `Define a partição (${dev}) onde o GRUB procurará o kernel e o initrd`, bad: [`Define ${rdev === dev ? '/dev/sdc9' : rdev} como raiz do sistema de arquivos do kernel (root=)`, `Instala o GRUB na partição ${dev}`, `Monta ${dev} em /mnt`, 'Define o usuário root como dono do menu'] },
        { l: 'insmod ext2', ok: 'Carrega o módulo do GRUB que permite ler sistemas de arquivos ext2/3/4', bad: ['Carrega o módulo ext4 no kernel Linux', 'Cria um sistema de arquivos ext2 na partição raiz', 'Insere a entrada ext2 no menu', 'Monta a partição como ext2 no sistema em execução'] },
        { l: 'search --no-floppy --fs-uuid --set=root ae71b214-0aec-48e8-80b2-090b6986b625', ok: 'Procura o sistema de arquivos com esse UUID e o define como root do GRUB, independentemente da numeração de discos', bad: ['Gera um novo UUID para a partição raiz', 'Procura o arquivo grub.cfg no disco floppy', 'Procura o kernel pelo UUID e o carrega imediatamente', 'Monta a partição pelo UUID em /boot'] },
      ];
      const r = rng.pick(rows);
      return { type: 'unica', text: `Em uma entrada do GRUB 2, o que faz a linha abaixo?\n\n${block(r.l)}`, options: mcq(rng, r.ok, r.bad), explanation: 'No GRUB 2: `set root=` (ou `search --set=root`) escolhe a partição do GRUB; `linux` carrega o kernel e repassa parâmetros (`root=` diz ao kernel onde está a raiz, `ro` monta somente leitura, `quiet`/`splash` controlam mensagens); `initrd` carrega o disco RAM inicial; `insmod` carrega módulos do próprio GRUB.', ref: ['101:p.84-85'] };
    }
    if (fmt === 4) {
      const rows = [
        { l: 'title Meu Linux', ok: 'Define o texto exibido no menu para esta entrada', bad: ['Define o nome do kernel a carregar', 'Define o título da janela do terminal ao iniciar', 'Define o nome do volume lógico raiz', 'Define o hostname do sistema'] },
        { l: `root (hd0,${p - 1})`, ok: `Define a partição de boot do GRUB Legacy (primeira partição se for (hd0,0)); aqui, a partição ${p} do primeiro disco`, bad: [`Define o dispositivo raiz do kernel como ${dev}`, 'Define o usuário root como dono do menu', 'Instala o GRUB no MBR do primeiro disco', `Monta (hd0,${p - 1}) em /`] },
        { l: `kernel /vmlinuz-${kv} root=${rdev} ro`, ok: 'Indica o caminho do kernel (relativo à partição definida em root) e seus parâmetros, como root= e ro', bad: ['Compila um novo kernel a partir do código-fonte em /vmlinuz', 'Carrega o disco RAM inicial', 'Define o título da entrada', 'Instala o kernel no MBR'] },
      ];
      const r = rng.pick(rows);
      return { type: 'unica', text: `Em uma entrada do menu do **GRUB Legacy** (/boot/grub/menu.lst), o que faz a linha abaixo?\n\n${block(r.l)}`, options: mcq(rng, r.ok, r.bad), explanation: 'Uma entrada do GRUB Legacy tem no mínimo `title` (texto do menu), `root` (dispositivo/partição de boot, numerados a partir de 0) e `kernel` (caminho da imagem relativo ao `root`, com parâmetros). O `initrd` é opcional, mas comum.', ref: ['101:p.89-90'] };
    }
    const md = `(hd0,msdos1)`;
    const seqRescue = [`set prefix=${md}/boot/grub`, 'insmod normal', 'insmod linux', `set root=${md}`, 'linux /vmlinuz root=/dev/sda1', 'initrd /initrd.img', 'boot'];
    const seqShell = [`set root=${md}`, 'linux /vmlinuz root=/dev/sda1', 'initrd /initrd.img', 'boot'];
    const rescue = rng.chance(0.5);
    const seq = rescue ? seqRescue : seqShell;
    const j = (a) => a.join('; ');
    const swap = (a, i, k) => { const b = a.slice(); [b[i], b[k]] = [b[k], b[i]]; return b; };
    const pool = rescue
      ? [swap(seq, 3, 4), swap(seq, 5, 6), seq.filter((x) => !x.startsWith('insmod')), swap(seq, 1, 4)].map(j)
      : [swap(seq, 0, 1), swap(seq, 2, 3), swap(seq, 1, 2), [seq[0], seq[2], seq[1], seq[3]].map((x) => x)].map(j);
    return {
      type: 'unica', text: `O GRUB 2 mostra o prompt ${rescue ? '`grub rescue>`' : '`grub>`'} e o administrador já descobriu, com \`ls\`, que o kernel está em \`${md}/\`. Qual sequência de comandos inicia o sistema?`,
      options: mcq(rng, j(seq), uniq(pool).filter((x) => x !== j(seq))),
      explanation: rescue ? 'No shell de resgate o GRUB está simplificado: é preciso apontar `prefix` para o diretório do GRUB, carregar os módulos `normal` e `linux` (`insmod`), definir `root`, carregar o kernel (`linux`, com `root=`), o initrd (`initrd`) e dar `boot`.' : 'No shell normal os módulos já estão disponíveis: define-se `set root=`, carrega-se o kernel com `linux ... root=`, o disco RAM com `initrd` e, por fim, `boot`. O kernel precisa ser carregado antes do initrd e `boot` vem por último.',
      ref: rescue ? ['101:p.87-88'] : ['101:p.86-87'],
    };
  },
};

export const grubGens = [grubDevconv, grubTask, grubDefaults, grubEntry];

// ═════════════════════════════════════════════ 102.3 ═════════════════════════════════════════════
const LNAMES = ['acme', 'geo', 'render', 'calc', 'imgproc', 'codec', 'vault', 'netutil', 'pdfkit', 'chart', 'audio', 'tinyxml'];
/** Script de bancada: constrói uma biblioteca compartilhada REAL (soname embutido) e um executável que depende dela. */
function libFixture({ name, major, real, dir, link = true }) {
  return [
    'd=$(mktemp -d); cd "$d"',
    `mkdir -p ".${dir}" etc/ld.so.conf.d`,
    `printf '.globl ${name}_hello\\n${name}_hello:\\n\\tret\\n' > t.s`,
    'as t.s -o t.o',
    `ld -shared -soname lib${name}.so.${major} -o ".${dir}/lib${name}.so.${real}" t.o`,
    ...(link ? [`ln -s lib${name}.so.${real} ".${dir}/lib${name}.so.${major}"`] : []),
    `printf '.globl _start\\n_start:\\n\\tcall ${name}_hello@PLT\\n\\tmov $60,%%eax\\n\\txor %%edi,%%edi\\n\\tsyscall\\n' > m.s`,
    'as m.s -o m.o',
    `ld -dynamic-linker /lib64/ld-linux-x86-64.so.2 -o prog m.o -L".${dir}" -l:lib${name}.so.${real}`,
  ].join('\n');
}

const libName = {
  id: 'lib-name', obj: '102.3', nivel: 2, peso: 2,
  make(rng) {
    const name = rng.pick(LNAMES); const maj = rng.int(1, 9); const mi = rng.int(0, 30); const pa = rng.int(0, 20);
    const real = `${maj}.${mi}.${pa}`;
    const fmt = rng.int(1, 4);
    const so = `lib${name}.so`;
    if (fmt === 1) {
      const correct = `${so}.${maj}`;
      return {
        type: 'unica',
        text: `O arquivo real de uma biblioteca compartilhada é \`${so}.${real}\`. Qual é o nome do *soname* (o nome geral, normalmente um link simbólico, que os executáveis registram como dependência)?`,
        options: mcq(rng, correct, [`${so}.${maj}.${mi}`, so, `${so}.${real}.a`, `lib${name}.${maj}.so`, `${so}.${maj + 1}`]),
        explanation: `O soname segue o padrão *nome da biblioteca* (\`lib${name}\`, com prefixo lib) + \`.so\` (shared object) + o número de versão **principal** (${maj}). Aqui: \`${correct}\`, normalmente um link para o arquivo real \`${so}.${real}\` (que carrega a versão completa). O \`ldconfig\` cria/atualiza esses links. Sem o número de versão (\`${so}\`) fica o *linker name*, usado só na compilação (-l${name}).`,
        ref: ['101:p.100-102'],
        verify: { sh: `${libFixture({ name, major: maj, real, dir: '/l', link: false })}; ldconfig -n ./l; ls l | tr '\\n' ' '`, expect: `${so}.${maj} ${so}.${real}` },
      };
    }
    if (fmt === 2) {
      return {
        type: 'unica', text: `Qual destes nomes de arquivo corresponde a uma biblioteca **estática** chamada \`${name}\`?`,
        options: mcq(rng, `lib${name}.a`, [`lib${name}.so`, `lib${name}.so.${maj}`, `lib${name}.dll`, `${name}.lib.so`]),
        explanation: `Bibliotecas estáticas terminam em \`.a\` (archive) e são copiadas para dentro do executável na compilação (não geram dependência em tempo de execução). As compartilhadas usam \`.so\` (shared object) e o número de versão, como \`lib${name}.so.${maj}\`; \`.dll\` é a convenção do Windows.`,
        ref: ['101:p.100'],
      };
    }
    if (fmt === 3) {
      const base = rng.pick(['libprocps.so.6', 'libdl.so.2', 'libc.so.6', 'libsystemd.so.0', 'libpthread.so.0', `${so}.${maj}`]);
      const m = base.match(/^(.*)\.so\.(\d+)$/);
      return {
        type: 'unica', text: `No nome de biblioteca \`${base}\`, qual é o significado do trecho \`.so\` e do número final?`,
        options: mcq(rng, `\`.so\` = shared object (objeto compartilhado); \`${m[2]}\` = número de versão da biblioteca`, [`\`.so\` = static object; \`${m[2]}\` = número da arquitetura`, `\`.so\` = system overlay; \`${m[2]}\` = número de ordem de carga`, `\`.so\` = source object; \`${m[2]}\` = número do runlevel`, `\`.so\` = shared output; \`${m[2]}\` = prioridade do ldconfig`]),
        explanation: `O nome de uma biblioteca compartilhada tem três partes: nome (\`${m[1]}\`, geralmente com prefixo lib), \`so\` (shared object) e o número de versão (\`${m[2]}\`). Exemplo do material: libpthread.so.0.`,
        ref: ['101:p.100'],
      };
    }
    return {
      type: 'unica', text: `Qual nome a *ligação dinâmica* usa quando o compilador/linker precisa apenas de \`-l${name}\` (link usado em tempo de compilação, geralmente instalado pelo pacote -dev)?`,
      options: mcq(rng, so, [`${so}.${maj}`, `${so}.${real}`, `lib${name}.a.${maj}`, `${name}.so`]),
      explanation: `O link sem versão (\`${so}\`, "linker name") é usado quando se compila com \`-l${name}\`; em tempo de execução o programa procura o soname completo (\`${so}.${maj}\`), que aponta para o arquivo real \`${so}.${real}\`.`,
      ref: ['101:p.100-101'],
    };
  },
};

const libTask = {
  id: 'lib-task', obj: '102.3', nivel: 2, peso: 3,
  make(rng) {
    const prog = rng.pick(['/usr/bin/convert', '/usr/local/bin/app', '/opt/acme/bin/server', '/usr/bin/gimp', '/usr/sbin/daemon']);
    const dir = rng.pick(['/opt/acme/lib', '/usr/local/mylib', '/srv/libs', '/opt/vendor/lib64']);
    const cf = rng.pick(['acme', 'mylib', 'vendor', 'app']);
    const rows = [
      { q: `Listar as bibliotecas compartilhadas de que \`${prog}\` depende`, ok: `ldd ${prog}`, bad: [`ldconfig -p ${prog}`, `lsmod ${prog}`, `lsof ${prog}`, `modinfo ${prog}`], why: '`ldd` mostra, para o executável (ou biblioteca) indicado, cada dependência e o caminho em que o ligador dinâmico a encontra (`=> not found` quando não existe). `ldconfig -p` lista o conteúdo do cache, sem relação com um programa específico.' },
      { q: `Atualizar o cache \`/etc/ld.so.cache\` e os links de soname depois de adicionar um novo diretório de bibliotecas em /etc/ld.so.conf.d/`, ok: 'ldconfig', bad: ['ldd', 'ldconfig -p', 'depmod -a', 'updatedb'], why: '`ldconfig` (como root) lê /etc/ld.so.conf e /etc/ld.so.conf.d/*.conf, cria os links de soname e regrava o cache usado pelo ligador dinâmico. `ldconfig -p` apenas imprime o cache atual; `depmod` trata de módulos do kernel.' },
      { q: 'Imprimir a lista de bibliotecas que estão no cache atual do ligador dinâmico', ok: 'ldconfig -p', bad: ['ldconfig -v', 'ldd -p', 'ldconfig -c', 'cat /etc/ld.so.cache'], why: '`-p` (print-cache) lista as bibliotecas do cache `/etc/ld.so.cache` (que é binário, por isso `cat` não serve). `-v` (verbose) reconstrói o cache mostrando diretórios e links criados.' },
      { q: `Tornar \`${dir}\` parte do caminho de busca de bibliotecas para a sessão atual do shell e para todos os processos iniciados a partir dela`, ok: `export LD_LIBRARY_PATH=${dir}`, bad: [`LD_LIBRARY_PATH=${dir}`, `export PATH=$PATH:${dir}`, `export LIBRARY_PATH=${dir}`, `export LD_PATH=${dir}`], why: '`LD_LIBRARY_PATH` é para as bibliotecas compartilhadas o que `PATH` é para os executáveis. Sem `export`, a variável existe só no shell e não chega aos processos filhos; `LIBRARY_PATH` é lida pelo compilador (gcc), não em tempo de execução.' },
      { q: `Executar \`${prog}\` usando temporariamente bibliotecas de \`${dir}\`, sem alterar o ambiente do shell nem a configuração do sistema`, ok: `LD_LIBRARY_PATH=${dir} ${prog}`, bad: [`${prog} --library-path=${dir}`, `LD_LIBRARY=${dir} ${prog}`, `ldconfig ${dir} ${prog}`, `export PATH=${dir} ${prog}`], why: 'Uma atribuição antes do comando vale só para aquele processo. A variável correta é `LD_LIBRARY_PATH`, com diretórios separados por dois-pontos (:).' },
      { q: `Para tornar \`${dir}\` um diretório permanente de bibliotecas para todos os usuários, o administrador escreve o caminho absoluto em um arquivo \`${cf}.conf\`. Onde deve guardar o arquivo e qual comando precisa executar em seguida?`, ok: '/etc/ld.so.conf.d/ e depois ldconfig', bad: ['/etc/ld.so.conf.d/ e depois ldd', '/etc/ld.so.cache e depois ldconfig -p', '/lib/ e depois export LD_LIBRARY_PATH', '/etc/ e depois source /etc/' + cf + '.conf'], why: 'Os arquivos `*.conf` de `/etc/ld.so.conf.d/` são incluídos pelo `/etc/ld.so.conf` (linha `include /etc/ld.so.conf.d/*.conf`). Cada um lista, um por linha, **diretórios** de bibliotecas (caminhos absolutos). O `ldconfig` precisa rodar depois para atualizar o cache.' },
      { q: 'Qual comando mostra, para um executável, as dependências diretas de biblioteca que foram vinculadas mas **não são usadas**?', ok: 'ldd -u /usr/bin/prog', bad: ['ldd -v /usr/bin/prog', 'ldconfig -u /usr/bin/prog', 'ldd --unused-libs /usr/bin/prog', 'readelf -u /usr/bin/prog'], why: 'A opção `-u` (`--unused`) do `ldd` imprime as dependências diretas não utilizadas; elas existem porque o ligador as marcou como NEEDED mesmo sem o programa precisar delas.' },
      { q: 'Qual destes diretórios é um local comum de bibliotecas compartilhadas em um sistema Linux?', ok: pick4(rng, ['/lib', '/lib64', '/usr/lib', '/usr/local/lib']), bad: ['/usr/include', '/var/lib', '/usr/share/man', '/boot/libs', '/etc/lib'], why: 'Locais usuais: /lib, /lib32, /lib64, /usr/lib e /usr/local/lib (e os subdiretórios multiarch, como /usr/lib/x86_64-linux-gnu). /usr/include guarda arquivos de cabeçalho (.h) para compilação.' },
      { q: 'Qual a principal diferença entre uma biblioteca estática e uma compartilhada?', ok: 'A estática é copiada para o executável na compilação (sem dependência em tempo de execução); a compartilhada é carregada em tempo de execução e usada por vários programas', bad: ['A estática é carregada em tempo de execução; a compartilhada é copiada para o executável na compilação', 'A estática só funciona em kernels sem módulos; a compartilhada exige o systemd', 'A compartilhada deve ser instalada em /boot; a estática, em /lib', 'Não há diferença: .a e .so são extensões equivalentes do mesmo formato'], why: 'Bibliotecas estáticas (`.a`) aumentam o executável, mas dispensam arquivos externos. Compartilhadas (`.so`) economizam disco e memória (uma cópia na RAM atende vários programas) e permitem atualizar a biblioteca sem recompilar, mas precisam estar disponíveis em execução.' },
      { q: `O programa \`${prog}\` falha ao iniciar com "error while loading shared libraries: libacme.so.2: cannot open shared object file: No such file or directory". Qual é o primeiro comando indicado para diagnosticar?`, ok: `ldd ${prog}`, bad: [`ldconfig -v ${prog}`, `lsmod | grep acme`, `modprobe libacme`, `strace -c ${prog}`], why: '`ldd programa` mostra todas as dependências e destaca as ausentes com `=> not found`. A partir daí é possível instalar o pacote da biblioteca ou registrar o diretório dela em /etc/ld.so.conf.d/ (e rodar `ldconfig`) ou usar `LD_LIBRARY_PATH`.' },
    ];
    const r = rng.pick(rows);
    const lead = /\?$/.test(r.q) ? r.q : `Qual comando (ou procedimento) executa a tarefa a seguir?\n\n${r.q}`;
    return { type: 'unica', text: lead, options: mcq(rng, r.ok, r.bad), explanation: r.why, ref: ['101:p.101-105'] };
  },
};
function pick4(rng, arr) { return rng.pick(arr); }

const libConfEffect = {
  id: 'lib-conf-effect', obj: '102.3', nivel: 3, peso: 3,
  make(rng) {
    const name = rng.pick(LNAMES); const maj = rng.int(1, 6); const real = `${maj}.${rng.int(0, 9)}.${rng.int(0, 9)}`;
    const dir = rng.pick([`/opt/${name}/lib`, `/usr/local/${name}/lib`, `/srv/${name}-libs`, `/opt/vendor/${name}/lib64`]);
    const lib = `lib${name}.so.${maj}`;
    const parent = dir.replace(/\/[^/]+$/, '');
    const conf = rng.pick([name, `${name}-libs`, 'custom']);
    const fx = libFixture({ name, major: maj, real, dir });
    const base = `${fx}; echo "include $d/etc/ld.so.conf.d/*.conf" > etc/ld.so.conf; CF="-f $d/etc/ld.so.conf -C $d/cache"; ldconfig $CF 2>/dev/null`;
    const found = `ldconfig -C "$d/cache" -p | grep -q ${sq(lib + ' ')} && echo found || echo missing`;
    const envChk = 'ldd ./prog | grep -q "not found" && echo missing || echo found';
    const prog = `/usr/local/bin/${name}d`;
    const Y_conf = 'Sim: o diretório da biblioteca está em um arquivo .conf lido por /etc/ld.so.conf e o ldconfig atualizou o cache';
    const R = {
      ext: 'Não: arquivos de /etc/ld.so.conf.d/ só são lidos se terminarem em .conf (a linha include usa *.conf), então a configuração foi ignorada',
      file: 'Não: o arquivo de configuração deve listar o diretório que contém a biblioteca, e não o caminho do arquivo .so',
      noldc: 'Não: o cache /etc/ld.so.cache não foi atualizado; é preciso executar ldconfig depois de alterar a configuração',
      parent: 'Não: o ldconfig não procura recursivamente; o diretório que contém o arquivo da biblioteca precisa estar listado, e não um diretório acima dele',
      noexp: 'Não: a variável foi definida sem export, portanto não é herdada pelo processo filho (o programa)',
      var: 'Não: LIBRARY_PATH é usada pelo compilador na hora de ligar o programa; em tempo de execução a variável lida é LD_LIBRARY_PATH',
      yenv: 'Sim: LD_LIBRARY_PATH exportada é herdada pelo programa e o ligador dinâmico procura primeiro nos diretórios dela',
      yinl: 'Sim: a atribuição na própria linha do comando vale para aquele processo e faz o ligador dinâmico procurar nos diretórios da variável',
      ycolon: 'Sim: os diretórios de LD_LIBRARY_PATH são separados por dois-pontos e o diretório da biblioteca está na lista',
    };
    const kinds = ['ok', 'ext', 'file', 'noldc', 'parent', 'noexp', 'var', 'yenv', 'yinl', 'ycolon'];
    const k = rng.pick(kinds);
    const confExt = rng.pick([`${conf}.txt`, `${conf}.conf.bak`, conf, `${conf}.cnf`]);
    let steps; let works; let reasonKey; let sh;
    const baseText = `A biblioteca \`${lib}\` (arquivo real \`${lib.replace(/\.\d+$/, '')}.${real}\`) foi instalada em \`${dir}\` — um diretório que **não** consta em nenhum arquivo de configuração. O programa \`${prog}\` depende dela e hoje falha com "error while loading shared libraries".`;
    if (k === 'ok') { steps = [`O administrador cria \`/etc/ld.so.conf.d/${conf}.conf\` com a linha \`${dir}\`.`, 'Em seguida executa `ldconfig` como root.']; works = true; reasonKey = 'conf'; sh = `${base}; echo "$d${dir}" > etc/ld.so.conf.d/${conf}.conf; ldconfig $CF 2>/dev/null; ${found}`; }
    else if (k === 'ext') { steps = [`O administrador cria \`/etc/ld.so.conf.d/${confExt}\` com a linha \`${dir}\`.`, 'Em seguida executa `ldconfig` como root.']; works = false; reasonKey = 'ext'; sh = `${base}; echo "$d${dir}" > etc/ld.so.conf.d/${confExt}; ldconfig $CF 2>/dev/null; ${found}`; }
    else if (k === 'file') { steps = [`O administrador cria \`/etc/ld.so.conf.d/${conf}.conf\` com a linha \`${dir}/${lib.replace(/\.\d+$/, '')}.${real}\` (o caminho do próprio arquivo da biblioteca).`, 'Em seguida executa `ldconfig` como root.']; works = false; reasonKey = 'file'; sh = `${base}; echo "$d${dir}/lib${name}.so.${real}" > etc/ld.so.conf.d/${conf}.conf; ldconfig $CF 2>/dev/null; ${found}`; }
    else if (k === 'noldc') { steps = [`O administrador cria \`/etc/ld.so.conf.d/${conf}.conf\` com a linha \`${dir}\`.`, 'Não executa `ldconfig` e simplesmente roda o programa de novo.']; works = false; reasonKey = 'noldc'; sh = `${base}; echo "$d${dir}" > etc/ld.so.conf.d/${conf}.conf; ${found}`; }
    else if (k === 'parent') { steps = [`O administrador cria \`/etc/ld.so.conf.d/${conf}.conf\` com a linha \`${parent}\` (o diretório *pai* de \`${dir}\`).`, 'Em seguida executa `ldconfig` como root.']; works = false; reasonKey = 'parent'; sh = `${base}; echo "$d${parent}" > etc/ld.so.conf.d/${conf}.conf; ldconfig $CF 2>/dev/null; ${found}`; }
    else if (k === 'noexp') { steps = [`No shell, digita \`LD_LIBRARY_PATH=${dir}\` (sem \`export\`).`, `Em seguida executa \`${prog}\`.`]; works = false; reasonKey = 'noexp'; sh = `${fx}; LD_LIBRARY_PATH="$d${dir}"; ${envChk}`; }
    else if (k === 'var') { steps = [`No shell, digita \`export LIBRARY_PATH=${dir}\`.`, `Em seguida executa \`${prog}\`.`]; works = false; reasonKey = 'var'; sh = `${fx}; export LIBRARY_PATH="$d${dir}"; ${envChk}`; }
    else if (k === 'yenv') { steps = [`No shell, digita \`export LD_LIBRARY_PATH=${dir}\`.`, `Em seguida executa \`${prog}\`.`]; works = true; reasonKey = 'yenv'; sh = `${fx}; export LD_LIBRARY_PATH="$d${dir}"; ${envChk}`; }
    else if (k === 'yinl') { steps = [`Executa \`LD_LIBRARY_PATH=${dir} ${prog}\`, tudo na mesma linha.`]; works = true; reasonKey = 'yinl'; sh = `${fx}; LD_LIBRARY_PATH="$d${dir}" ${envChk}`; }
    else { steps = [`No shell, digita \`export LD_LIBRARY_PATH=/opt/outra/lib:${dir}\`.`, `Em seguida executa \`${prog}\`.`]; works = true; reasonKey = 'ycolon'; sh = `${fx}; export LD_LIBRARY_PATH="/tmp:$d${dir}"; ${envChk}`; }
    const correct = works ? (reasonKey === 'conf' ? Y_conf : R[reasonKey]) : R[reasonKey];
    const NOS = ['ext', 'file', 'noldc', 'parent', 'noexp', 'var'].filter((x) => x !== reasonKey).map((x) => R[x]);
    const pool = works ? ['ext', 'file', 'noldc', 'noexp', 'var', 'parent'].map((x) => R[x]) : [...NOS, 'Sim: o ligador dinâmico procura automaticamente em qualquer diretório que contenha arquivos .so', 'Sim: basta que o arquivo da biblioteca exista em algum diretório sob /opt'];
    const expl = {
      conf: 'Os arquivos *.conf de /etc/ld.so.conf.d/ (incluídos pelo /etc/ld.so.conf) listam diretórios; o `ldconfig` os lê, cria os links de soname e grava o cache /etc/ld.so.cache, que o ligador dinâmico consulta.',
      ext: 'O /etc/ld.so.conf contém `include /etc/ld.so.conf.d/*.conf`; arquivos com outra extensão (.txt, .bak, sem extensão) nunca são lidos.',
      file: 'Cada linha de um arquivo .conf é um **diretório**; um caminho de arquivo não faz o `ldconfig` indexar a biblioteca.',
      noldc: 'O ligador dinâmico não lê os arquivos .conf em tempo de execução: ele usa o cache /etc/ld.so.cache, que só é regravado pelo `ldconfig`.',
      parent: 'Os diretórios são varridos sem recursão: só os arquivos .so que estão diretamente no diretório listado entram no cache.',
      noexp: 'Atribuições sem `export` valem só para o shell; processos filhos (o programa) não as recebem.',
      var: '`LIBRARY_PATH` afeta a compilação (ligação com gcc/ld); o ligador dinâmico em execução usa `LD_LIBRARY_PATH`, /etc/ld.so.cache e os diretórios padrão (/lib, /usr/lib).',
      yenv: '`LD_LIBRARY_PATH` é consultada antes do cache; precisa ser exportada para alcançar o programa.',
      yinl: 'Variável colocada antes do comando é exportada apenas para aquele processo.',
      ycolon: 'Como `PATH`, `LD_LIBRARY_PATH` aceita vários diretórios separados por dois-pontos.',
    }[reasonKey];
    return {
      type: 'unica',
      text: `${baseText}\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nO programa conseguirá localizar \`${lib}\`?`,
      options: mcq(rng, correct, pool),
      explanation: `${expl} Resultado neste cenário: ${works ? 'a biblioteca é encontrada' : 'a biblioteca continua não sendo encontrada'}. Para investigar use \`ldd ${prog}\` (procure \`=> not found\`) e \`ldconfig -p | grep ${name}\`.`,
      ref: ['101:p.101-104'],
      verify: { sh, expect: works ? 'found' : 'missing' },
    };
  },
};

const BINS = [
  { p: '/bin/ls', libs: ['libselinux.so.1', 'libc.so.6', 'libpcre2-8.so.0'] },
  { p: '/bin/bash', libs: ['libtinfo.so.6', 'libc.so.6'] },
  { p: '/usr/bin/grep', libs: ['libpcre2-8.so.0', 'libc.so.6'] },
  { p: '/usr/bin/find', libs: ['libselinux.so.1', 'libm.so.6', 'libc.so.6', 'libpcre2-8.so.0'] },
  { p: '/bin/tar', libs: ['libacl.so.1', 'libselinux.so.1', 'libc.so.6', 'libpcre2-8.so.0'] },
  { p: '/usr/bin/less', libs: ['libtinfo.so.6', 'libc.so.6'] },
  { p: '/bin/sed', libs: ['libacl.so.1', 'libselinux.so.1', 'libc.so.6', 'libpcre2-8.so.0'] },
];
const lddRead = {
  id: 'ldd-read', obj: '102.3', nivel: 2, peso: 2,
  make(rng) {
    const b = rng.pick(BINS);
    const addr = () => `0x00007f${hex(rng, 7)}000`;
    const libs = rng.shuffle(b.libs);
    const missing = rng.chance(0.4) ? rng.pick(libs) : null;
    const lines = [`\tlinux-vdso.so.1 (${`0x00007ffd${hex(rng, 4)}000`.slice(0, 18)})`, ...libs.map((l) => (l === missing ? `\t${l} => not found` : `\t${l} => /lib/x86_64-linux-gnu/${l} (${addr()})`)), `\t/lib64/ld-linux-x86-64.so.2 (${addr()})`];
    const out = lines.join('\n');
    const verify = { sh: `ldd ${b.p} | awk '$2=="=>"{print $1}' | sort | tr '\\n' ' '`, expect: [...b.libs].sort().join(' ') };
    const fmt = missing ? rng.pick(['missing', 'missing', 'cmd']) : rng.pick(['linker', 'vdso', 'cmd']);
    if (fmt === 'missing') {
      return { type: 'unica', text: `Ao executar \`ldd ${b.p}\` num sistema com um problema, obteve-se:\n\n${block(out)}\n\nQual biblioteca precisa ser instalada ou ter seu diretório registrado (por /etc/ld.so.conf.d/ e \`ldconfig\`, ou por LD_LIBRARY_PATH)?`, options: mcq(rng, missing, libs.filter((x) => x !== missing).concat(['linux-vdso.so.1', 'ld-linux-x86-64.so.2'])), explanation: `Linhas com \`=> not found\` indicam dependências que o ligador dinâmico não encontrou: \`${missing}\`. As demais foram resolvidas (\`=> caminho\`). \`linux-vdso.so.1\` é fornecida pelo kernel e \`ld-linux-x86-64.so.2\` é o próprio ligador dinâmico.`, ref: ['101:p.104-105'], verify };
    }
    if (fmt === 'linker') {
      return { type: 'unica', text: `Saída de \`ldd ${b.p}\`:\n\n${block(out)}\n\nQual entrada é o próprio ligador (carregador) dinâmico, responsável por resolver as demais dependências?`, options: mcq(rng, '/lib64/ld-linux-x86-64.so.2', ['linux-vdso.so.1', ...libs.slice(0, 3)]), explanation: 'O `ld-linux-x86-64.so.2` (ld.so) é o ligador dinâmico: carrega o programa e as bibliotecas compartilhadas em memória e resolve as referências na hora da execução. Fica no fim da lista, sem `=>`, porque é indicado diretamente no cabeçalho do executável.', ref: ['101:p.101', '101:p.104-105'], verify };
    }
    if (fmt === 'vdso') {
      return { type: 'unica', text: `Saída de \`ldd ${b.p}\`:\n\n${block(out)}\n\nQual entrada não corresponde a um arquivo em disco, pois é uma biblioteca virtual fornecida pelo próprio kernel?`, options: mcq(rng, 'linux-vdso.so.1', ['/lib64/ld-linux-x86-64.so.2', ...libs.slice(0, 3)]), explanation: 'O `linux-vdso.so.1` (virtual dynamic shared object) é mapeado pelo kernel em cada processo para acelerar chamadas de sistema; por isso aparece sem `=> caminho`.', ref: ['101:p.104-105'], verify };
    }
    return { type: 'unica', text: `A saída abaixo foi produzida por qual comando?\n\n${block(out)}`, options: mcq(rng, `ldd ${b.p}`, [`ldconfig -p ${b.p}`, `ldconfig -v ${b.p}`, `lsof ${b.p}`, `file ${b.p}`]), explanation: '`ldd EXECUTÁVEL` lista as bibliotecas compartilhadas necessárias, o caminho onde cada uma foi encontrada (`=>`) e o endereço de memória em que será carregada.', ref: ['101:p.104-105'], verify };
  },
};

export const libGens = [libName, libTask, libConfEffect, lddRead];

export const generators = [...hwGens, ...bootGens, ...partGens, ...grubGens, ...libGens];
