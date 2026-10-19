// 109.2 — Configuração persistente de rede: nsswitch.conf / hosts / resolv.conf, hostnamectl, nmcli,
// ifup/ifdown, systemd-networkd e nomes de interface.
import { mcq, multi, code as c } from './util.mjs';

const lines = (...l) => l.map((x) => c(x)).join('\n'); // várias linhas de código em uma opção (renderiza com quebra de linha)

// ---------- simulador do Name Service Switch ----------
/** 'files [NOTFOUND=return] dns' -> [{name, conds:[{neg, st, act}]}] */
export function parseNss(line) {
  const srcs = [];
  for (const m of line.matchAll(/\[([^\]]*)\]|(\S+)/g)) {
    if (m[1] === undefined) srcs.push({ name: m[2], conds: [] });
    else for (const t of m[1].trim().split(/\s+/)) { const g = t.match(/^(!?)(\w+)=(\w+)$/); srcs.at(-1).conds.push({ neg: !!g[1], st: g[2].toUpperCase(), act: g[3].toLowerCase() }); }
  }
  return srcs;
}
/** env = { files: ip|null, dns: { kind: 'ip'|'nx'|'down', ip } } -> { ip, from, steps } */
export function nssRun(srcs, env) {
  const steps = [];
  for (const s of srcs) {
    const st = s.name === 'files' ? (env.files ? 'SUCCESS' : 'NOTFOUND') : env.dns.kind === 'ip' ? 'SUCCESS' : env.dns.kind === 'nx' ? 'NOTFOUND' : 'UNAVAIL';
    const ip = st === 'SUCCESS' ? (s.name === 'files' ? env.files : env.dns.ip) : null;
    let act = st === 'SUCCESS' ? 'return' : 'continue'; let by = 'padrão';
    for (const k of s.conds) if (k.neg ? st !== k.st : st === k.st) { act = k.act; by = `${k.neg ? '!' : ''}${k.st}=${k.act}`; }
    steps.push({ name: s.name, st, act, by, ip });
    if (act === 'return') return { ip, from: s.name, steps };
  }
  return { ip: null, from: null, steps };
}
/** Sequência de nomes consultados pelo resolvedor (glibc) para `name`, dado `search`/`ndots`. */
export function resolvOrder(name, cfg) {
  if (name.endsWith('.')) return [name];
  const dots = (name.match(/\./g) || []).length; const list = cfg.search.map((d) => `${name}.${d}`);
  return dots >= cfg.ndots ? [name, ...list] : [...list, name];
}
/** Lê as linhas de um resolv.conf: a última entre `domain` e `search` vale. */
export function parseResolv(text) {
  const cfg = { search: [], ns: [], ndots: 1 };
  for (const l of text.split('\n')) {
    const t = l.split('#')[0].trim().split(/\s+/);
    if (t[0] === 'search') cfg.search = t.slice(1); else if (t[0] === 'domain') cfg.search = [t[1]]; else if (t[0] === 'nameserver') cfg.ns.push(t[1]);
    else if (t[0] === 'options') for (const o of t.slice(1)) { const m = o.match(/^ndots:(\d+)$/); if (m) cfg.ndots = Number(m[1]); }
  }
  return cfg;
}

const HOSTN = ['srv01', 'web01', 'db01', 'app02', 'nas', 'git', 'proxy', 'mail01', 'intranet', 'backup', 'wiki', 'impressora'];
const DOMS = ['lab.example.com', 'corp.example.net', 'empresa.local', 'dc1.example.org', 'rede.interna', 'filial.example.com', 'ti.example.net'];

export function nssScenario(rng) {
  const name = rng.pick(HOSTN);
  const pat = rng.pick([(a, b) => `${a} ${b}`, (a, b) => `${a} ${b}`, (a, b) => `${a} [NOTFOUND=return] ${b}`, (a, b) => `${a} [NOTFOUND=return] ${b}`, (a, b) => `${a} [!UNAVAIL=return] ${b}`, (a, b) => `${a} [UNAVAIL=return] ${b}`]);
  const line = rng.chance(0.5) ? pat('files', 'dns') : pat('dns', 'files');
  const filesIp = rng.chance(0.7) ? `10.${rng.int(0, 9)}.${rng.int(0, 255)}.${rng.int(2, 250)}` : null;
  const kind = rng.pick(['ip', 'ip', 'nx', 'down']);
  const dnsIp = kind === 'ip' ? `${rng.pick(['203.0.113', '198.51.100', '192.0.2'])}.${rng.int(2, 250)}` : null;
  return { name, line, env: { files: filesIp, dns: { kind, ip: dnsIp } } };
}

const traceText = (steps) => steps.map((s) => `${s.name} → ${s.st}${s.ip ? ` (${s.ip})` : ''}; ação ${s.act === 'return' ? 'return (encerra a busca)' : 'continue (tenta a próxima fonte)'}${s.by === 'padrão' ? ' [padrão]' : ` [regra ${s.by}]`}`).join(' | ');

// ---------- nomes de interface ----------
const IFNAMES = [
  { n: () => 'eno1', t: 'Ethernet', why: 'prefixo en = Ethernet; "o1" = índice do dispositivo onboard informado pelo firmware/BIOS (regra 1)' },
  { n: (r) => `eno${r.int(2, 4)}`, t: 'Ethernet', why: 'prefixo en = Ethernet; "o" = índice onboard informado pelo firmware/BIOS (regra 1)' },
  { n: (r) => `ens${r.int(1, 9)}`, t: 'Ethernet', why: 'prefixo en = Ethernet; "s" = índice do slot PCI Express (hotplug) informado pelo firmware (regra 2)' },
  { n: (r) => `enp${r.int(1, 9)}s${r.int(0, 9)}`, t: 'Ethernet', why: 'prefixo en = Ethernet; "p<barramento>s<slot>" = endereço do dispositivo no barramento PCI (regra 3), como visto em lspci' },
  { n: (r) => `enx${Array.from({ length: 6 }, () => r.int(0, 255).toString(16).padStart(2, '0')).join('')}`, t: 'Ethernet', why: 'prefixo en = Ethernet; "x<MAC>" = nome baseado no endereço MAC da interface (regra 4)' },
  { n: () => 'wlo1', t: 'LAN sem fio (Wi-Fi)', why: 'prefixo wl = WLAN (sem fio); "o1" = índice onboard' },
  { n: (r) => `wlp${r.int(1, 9)}s${r.int(0, 9)}`, t: 'LAN sem fio (Wi-Fi)', why: 'prefixo wl = WLAN (sem fio); "p<barramento>s<slot>" = endereço no barramento PCI' },
  { n: (r) => `wwp0s${r.int(10, 29)}u${r.int(1, 6)}`, t: 'WAN sem fio (WWAN, celular)', why: 'prefixo ww = rede de longa distância sem fio (WWAN)' },
  { n: (r) => `ibp${r.int(1, 9)}s0`, t: 'InfiniBand', why: 'prefixo ib = InfiniBand' },
  { n: (r) => `eth${r.int(0, 3)}`, t: 'Ethernet (nome legado, atribuído pela ordem de detecção do kernel)', why: 'eth0, eth1… é a convenção antiga (regra 5, a de menor prioridade): numerada pela ordem em que o kernel encontra os dispositivos' },
  { n: (r) => `wlan${r.int(0, 2)}`, t: 'LAN sem fio (nome legado)', why: 'wlan0, wlan1… é a convenção antiga para interfaces sem fio, numerada pela ordem de detecção' },
];

// ---------- nmcli / hostnamectl / ifup ----------
const SSIDS = ['Hypnotoad', 'CasaWifi', 'Escritorio5G', 'LabRedes', 'Hotel Internet', 'Cafe Livre', 'Visitantes', 'NETGEAR'];
const PASSES = ['MyPassword', 's3nh4F0rt3', 'Redes2024', 'abc12345', 'Linux.2026'];
const WIFI_IF = ['wlo1', 'wlp2s0', 'wlan0', 'wlp3s0'];
const ETH_IF = ['enp3s5', 'eno1', 'ens33', 'eth0', 'enp0s8'];
const HOSTS2 = ['firewall', 'storage', 'gateway01', 'web-prod', 'servidor-arquivos', 'lab-pc07', 'dns1'];
const q = (s) => (/\s/.test(s) ? `"${s}"` : s);
function tasks(r) {
  const ssid = r.pick(SSIDS); const pw = r.pick(PASSES); const wif = r.pick(WIFI_IF); const eif = r.pick(ETH_IF); const hn = r.pick(HOSTS2);
  const pretty = r.pick(['Armazenamento da LAN', 'Servidor Web de Producao', 'Firewall do Escritorio']);
  return [
    { id: 'h-static', desc: `Definir **apenas o nome de host estático** (o gravado em /etc/hostname) como ${c(hn)}`, cmd: `hostnamectl --static set-hostname ${hn}`, wrong: [`hostnamectl --pretty set-hostname ${hn}`, `hostnamectl --transient set-hostname ${hn}`, `hostnamectl set-static ${hn}`, `hostnamectl hostname ${hn} --file /etc/hostname`] },
    { id: 'h-all', desc: `Definir o nome do host ${c(hn)} nos três tipos (estático, transiente e pretty) de uma vez, gravando-o em /etc/hostname`, cmd: `hostnamectl set-hostname ${hn}`, wrong: [`hostnamectl --static set-hostname ${hn}`, `hostnamectl --transient set-hostname ${hn}`, `hostnamectl hostname ${hn}`, `hostnamectl set ${hn}`] },
    { id: 'h-pretty', desc: `Definir o nome de host **pretty** (descritivo, aceita espaços e acentos) como "${pretty}"`, cmd: `hostnamectl --pretty set-hostname "${pretty}"`, wrong: [`hostnamectl --static set-hostname "${pretty}"`, `hostnamectl --transient set-hostname "${pretty}"`, `hostnamectl set-pretty "${pretty}"`] },
    { id: 'h-show', desc: 'Exibir o nome de host estático, pretty e transiente, o ID da máquina, o sistema operacional e o kernel', cmd: 'hostnamectl status', wrong: ['hostname -f --all', 'hostnamectl list', 'nmcli general hostname', 'hostnamectl show-names'] },
    { id: 'n-dev', desc: 'Listar os dispositivos de rede (interfaces) vistos pelo NetworkManager e o estado de cada um', cmd: 'nmcli device', wrong: ['nmcli connection show', 'nmcli general', 'nmcli radio', 'nmcli network list'] },
    { id: 'n-con', desc: 'Listar as conexões salvas no NetworkManager (nome, UUID, tipo e dispositivo)', cmd: 'nmcli connection show', wrong: ['nmcli device', 'nmcli device show', 'nmcli general status', 'nmcli connection list --uuid'] },
    { id: 'n-gen', desc: 'Ver o estado geral do NetworkManager (STATE, CONNECTIVITY, WIFI-HW, WIFI…)', cmd: 'nmcli general status', wrong: ['nmcli device status --general', 'nmcli connection status', 'nmcli networking show', 'nmcli radio status'] },
    { id: 'n-wlist', desc: 'Listar as redes Wi-Fi disponíveis na área (SSID, canal, sinal, segurança)', cmd: 'nmcli device wifi list', wrong: ['nmcli connection wifi list', 'nmcli radio wifi list', 'nmcli wifi scan list', 'nmcli device list wifi'] },
    { id: 'n-wconn', desc: `Em um console de texto, conectar-se à rede Wi-Fi ${c(ssid)} usando a senha ${c(pw)}`, cmd: `nmcli device wifi connect ${q(ssid)} password ${pw}`, wrong: [`nmcli connection wifi connect ${q(ssid)} password ${pw}`, `nmcli device connect ${q(ssid)} password ${pw}`, `nmcli device wifi connect password ${pw} ${q(ssid)}`, `nmcli wifi connect ${q(ssid)} --password ${pw}`] },
    { id: 'n-wif', desc: `Conectar-se à rede Wi-Fi ${c(ssid)} (senha ${c(pw)}) usando especificamente o adaptador ${c(wif)}`, cmd: `nmcli device wifi connect ${q(ssid)} password ${pw} ifname ${wif}`, wrong: [`nmcli device wifi connect ${q(ssid)} password ${pw} device ${wif}`, `nmcli device wifi connect ${q(ssid)} ifname ${wif}`, `nmcli connection up ${wif} wifi ${q(ssid)}`, `nmcli device wifi connect ${wif} password ${pw} ifname ${q(ssid)}`] },
    { id: 'n-hid', desc: `Conectar-se à rede Wi-Fi **oculta** (SSID não divulgado) ${c(ssid)} com a senha ${c(pw)}`, cmd: `nmcli device wifi connect ${q(ssid)} password ${pw} hidden yes`, wrong: [`nmcli device wifi connect ${q(ssid)} password ${pw} hidden`, `nmcli device wifi connect ${q(ssid)} password ${pw} visible no`, `nmcli device wifi connect ${q(ssid)} password ${pw} --hidden`] },
    { id: 'n-down', desc: `Desativar a conexão salva chamada ${c(ssid)} (pelo nome da conexão)`, cmd: `nmcli connection down ${q(ssid)}`, wrong: [`nmcli device down ${q(ssid)}`, `nmcli connection disconnect ${q(ssid)}`, `nmcli connection delete ${q(ssid)}`, `nmcli connection stop ${q(ssid)}`] },
    { id: 'n-up', desc: `Reativar a conexão salva chamada ${c(ssid)}, sem informar a senha de novo`, cmd: `nmcli connection up ${q(ssid)}`, wrong: [`nmcli device up ${q(ssid)}`, `nmcli connection add ${q(ssid)}`, `nmcli connection activate ${q(ssid)}`, `nmcli connection start ${q(ssid)}`] },
    { id: 'n-ddis', desc: `Desconectar a interface ${c(wif)} pelo **nome da interface** (não pelo da conexão)`, cmd: `nmcli device disconnect ${wif}`, wrong: [`nmcli connection disconnect ${wif}`, `nmcli connection down ${wif}`, `nmcli device delete ${wif}`, `nmcli radio disconnect ${wif}`] },
    { id: 'n-dcon', desc: `Reconectar a interface ${c(eif)} pelo nome da interface`, cmd: `nmcli device connect ${eif}`, wrong: [`nmcli connection connect ${eif}`, `nmcli connection up device ${eif}`, `nmcli device up ${eif} connection`, `nmcli radio connect ${eif}`] },
    { id: 'n-del', desc: `Excluir a conexão salva chamada ${c(ssid)}, que não é mais usada`, cmd: `nmcli connection delete ${q(ssid)}`, wrong: [`nmcli connection remove-all ${q(ssid)}`, `nmcli device delete ${q(ssid)}`, `nmcli connection down ${q(ssid)}`, `nmcli connection rm ${q(ssid)} --force-delete`] },
    { id: 'n-roff', desc: 'Desligar o rádio Wi-Fi para economizar energia', cmd: 'nmcli radio wifi off', wrong: ['nmcli device wifi off', 'nmcli wifi radio off', 'nmcli radio off wifi', 'nmcli networking wifi off'] },
    { id: 'n-ron', desc: 'Ligar novamente o adaptador sem fio que estava desabilitado', cmd: 'nmcli radio wifi on', wrong: ['nmcli device wifi on', 'nmcli connection wifi on', 'nmcli radio on wifi', 'nmcli general wifi on'] },
    { id: 'n-rescan', desc: 'Pedir ao NetworkManager que procure de novo os pontos de acesso Wi-Fi (nova varredura)', cmd: 'nmcli device wifi rescan', wrong: ['nmcli device wifi refresh', 'nmcli radio wifi rescan', 'nmcli connection wifi rescan', 'nmcli device rescan wifi'] },
    { id: 'ifup', desc: `Ativar a interface ${c(eif)} aplicando o que está definido para ela em /etc/network/interfaces`, cmd: `ifup ${eif}`, wrong: [`ip link set ${eif} up`, `ifconfig ${eif} up`, `nmcli device up ${eif}`, `ifdown ${eif}`] },
    { id: 'ifdown', desc: `Desativar a interface ${c(eif)} segundo a configuração de /etc/network/interfaces`, cmd: `ifdown ${eif}`, wrong: [`ifup ${eif}`, `ip addr del ${eif}`, `ifup -d ${eif}`, `nmcli device delete ${eif}`] },
    { id: 'wpa', desc: `Gerar o arquivo de credenciais (hash da senha) do wpa_supplicant para a rede ${c(ssid)} com a senha ${c(pw)} passada como argumento, para a interface ${c(wif)}`, cmd: `wpa_passphrase ${q(ssid)} ${pw} > /etc/wpa_supplicant/wpa_supplicant-${wif}.conf`, wrong: [`wpa_passphrase ${pw} ${q(ssid)} > /etc/wpa_supplicant/wpa_supplicant-${wif}.conf`, `wpa_passphrase ${q(ssid)} ${pw} > /etc/wpa_supplicant/${q(ssid)}.conf`, `wpa_passphrase ${q(ssid)} --password ${pw} > /etc/wpa_supplicant/wpa_supplicant-${wif}.conf`] },
  ];
}
const TOOL_EXPL = 'Resumo: hostnamectl cuida dos nomes de host (--static grava /etc/hostname; --pretty e --transient são os outros dois tipos; sem opção, os três); nmcli organiza-se por objetos (general, networking, radio, connection, device); "connection" age sobre conexões salvas (pelo nome/UUID) e "device" age sobre interfaces (pelo nome da interface); ifup/ifdown usam /etc/network/interfaces.';

export const generators = [
  {
    id: 'nss-hosts-order', obj: '109.2', nivel: 3, peso: 3,
    make(rng) {
      const sc = nssScenario(rng); const { name, line, env } = sc;
      const res = nssRun(parseNss(line), env);
      const cmd = rng.pick([`getent hosts ${name}`, `ping -c 1 ${name}`, `ssh ${name}`, `getent hosts ${name}`]);
      const other = [`10.${rng.int(0, 9)}.${rng.int(0, 255)}.${rng.int(2, 250)}`, '127.0.0.1', `192.168.${rng.int(0, 255)}.${rng.int(2, 250)}`];
      const hostsOther = `10.${rng.int(10, 20)}.${rng.int(0, 255)}.${rng.int(2, 250)}`;
      const FAIL = 'Nenhum: o nome não é resolvido (a resolução falha)';
      const correct = res.ip ?? FAIL;
      // distratores: primeiro o resultado "da outra fonte" e a falha; depois endereços de outras entradas
      const pri = [env.files, env.dns.ip, FAIL].filter((x) => x && x !== correct);
      const wrong = [...pri, ...rng.shuffle([hostsOther, ...other]).filter((x) => x !== correct)].slice(0, 3);
      const hostsBlock = ['127.0.0.1   localhost', '::1         localhost ip6-localhost ip6-loopback', ...(env.files ? [`${env.files}   ${name}`] : []), `${hostsOther}   outro-host`].join('\n');
      const dnsText = env.dns.kind === 'ip' ? `O servidor DNS responde: ${c(`${name}  A  ${env.dns.ip}`)}.` : env.dns.kind === 'nx' ? 'O servidor DNS responde **NXDOMAIN** (o nome não existe no DNS; para o NSS isso é o status NOTFOUND).' : 'O servidor DNS está **inacessível** (a fonte `dns` termina com o status UNAVAIL).';
      const askIp = cmd.startsWith('getent') ? 'Qual endereço IP esse comando exibe?' : 'Qual endereço IP esse comando usa como destino?';
      return {
        type: 'unica',
        text: `Em um host Linux, o arquivo \`/etc/nsswitch.conf\` contém a linha abaixo, e o \`/etc/hosts\` tem o conteúdo mostrado. ${dnsText}\n\n\`\`\`\nhosts:      ${line}\n\`\`\`\n\n\`\`\`\n# /etc/hosts\n${hostsBlock}\n\`\`\`\n\nO comando ${c(cmd)} é executado. ${askIp}`,
        options: [{ t: correct, ok: true }, ...wrong.map((t) => ({ t, ok: false }))],
        explanation: `O resolvedor lê a linha \`hosts:\` e consulta as fontes da esquerda para a direita. Cada fonte devolve um status (SUCCESS, NOTFOUND, UNAVAIL…); por padrão SUCCESS encerra a busca (return) e os demais status seguem para a próxima fonte (continue), a menos que haja uma regra \`[STATUS=ação]\` (com \`!\` = "se o status NÃO for…"). Aqui: ${traceText(res.steps)}. Resultado: ${res.ip ? res.ip : 'nenhum endereço — a resolução falha'}.`,
        ref: ['102:p.427-428'],
      };
    },
  },
  {
    id: 'resolv-search-order', obj: '109.2', nivel: 3, peso: 2,
    make(rng) {
      const doms = rng.sample(DOMS, rng.int(1, 3)); const useBoth = rng.chance(0.3);
      const ndots = rng.chance(0.3) ? rng.int(2, 3) : 1;
      const dotsInName = rng.int(0, 3);
      const name = `${rng.pick(HOSTN)}${dotsInName >= 1 ? '.' + rng.sample(['lab', 'dmz', 'rh', 'ti', 'sede'], dotsInName).join('.') : ''}`;
      const ns = rng.sample(['10.0.0.53', '192.168.1.1', '172.16.0.2', '10.10.0.10'], rng.int(1, 3));
      let body = []; let eff = doms; let alt = null;
      if (useBoth) { const d2 = rng.pick(DOMS.filter((d) => !doms.includes(d))); const first = rng.chance(0.5); body = first ? [`domain ${d2}`, `search ${doms.join(' ')}`] : [`search ${doms.join(' ')}`, `domain ${d2}`]; eff = first ? doms : [d2]; alt = first ? [d2] : doms; }
      else if (doms.length === 1 && rng.chance(0.5)) body = [`domain ${doms[0]}`]; else body = [`search ${doms.join(' ')}`];
      const file = [...ns.map((n) => `nameserver ${n}`), ...body, ...(ndots !== 1 ? [`options ndots:${ndots}`] : [])];
      const cfg = parseResolv(file.join('\n'));
      const seq = resolvOrder(name, cfg);
      const fmt = (a) => a.join(' → ');
      const wrong = [
        fmt(resolvOrder(name, { ...cfg, ndots: cfg.ndots === 1 ? 2 + (name.split('.').length) : 1 })), // ndots entendido ao contrário
        fmt([...cfg.search.map((d) => `${name}.${d}`).reverse(), name]), // domínios em ordem invertida
        fmt([name]), // só o nome puro
        fmt(cfg.search.map((d) => `${name}.${d}`)), // esquece a tentativa do nome como veio
        fmt([name, ...cfg.search.map((d) => `${name}.${d}`).reverse()]),
      ];
      if (alt) wrong.push(fmt(resolvOrder(name, { ...cfg, search: alt })));
      if (doms.length > 1 && !useBoth) wrong.push(fmt(resolvOrder(name, { ...cfg, search: [cfg.search[0]] })));
      const dotsN = (name.match(/\./g) || []).length;
      const options = mcq(rng, fmt(seq), [...new Set(wrong)].filter((w) => w !== fmt(seq)));
      return {
        type: 'unica',
        text: `O arquivo \`/etc/resolv.conf\` de um host é:\n\n\`\`\`\n${file.join('\n')}\n\`\`\`\n\nO usuário executa um comando que resolve o nome ${c(name)} (que não é absoluto, ou seja, não termina em ponto). Supondo que nenhum dos nomes exista no DNS, em que ordem o resolvedor tenta os nomes completos?`,
        options,
        explanation: `As diretivas \`domain\` e \`search\` são mutuamente exclusivas: se ambas aparecem, vale a **última**${useBoth ? ` (aqui, a lista efetiva é: ${eff.join(', ')})` : ''}; \`domain X\` equivale a \`search X\`. O resolvedor compara o número de pontos do nome (${dotsN}) com \`ndots\` (${cfg.ndots}${cfg.ndots === 1 ? ', o padrão' : ''}): com pontos ≥ ndots ele tenta primeiro o nome como foi digitado e depois acrescenta cada domínio de busca; com menos pontos, tenta primeiro os domínios de busca e só no fim o nome puro. Ordem: ${fmt(seq)}.`,
        ref: ['102:p.428-429'],
      };
    },
  },
  {
    id: 'net-file-role', obj: '109.2', nivel: 1, peso: 3,
    make(rng) {
      const nm = rng.pick(HOSTN); const ip = `10.${rng.int(0, 9)}.${rng.int(0, 255)}.${rng.int(2, 250)}`; const dns = rng.pick(['1.1.1.1', '9.9.9.9', '10.0.0.53', '192.168.1.1']);
      const ITEMS = [
        { f: '/etc/hostname', d: 'guardar o nome de host **estático** da máquina, lido na inicialização (a primeira linha; linhas com # são ignoradas)' },
        { f: '/etc/hosts', d: `associar localmente nomes a endereços IP (por exemplo, fazer ${nm} resolver para ${ip} sem consultar o DNS)` },
        { f: '/etc/nsswitch.conf', d: 'definir a **ordem das fontes** de resolução de nomes (a linha `hosts:`, por exemplo `files dns`)' },
        { f: '/etc/resolv.conf', d: `indicar ao resolvedor os servidores DNS (\`nameserver ${dns}\`) e os domínios de busca (\`search\`/\`domain\`)` },
        { f: '/etc/network/interfaces', d: 'definir as interfaces que o `ifup`/`ifdown` configuram em sistemas **Debian** (linhas `auto` e `iface`)' },
        { f: '/etc/sysconfig/network-scripts/', d: 'guardar um arquivo de configuração por interface em sistemas da família **Red Hat/CentOS** (formato diferente do /etc/network/interfaces)' },
        { f: '/etc/systemd/network/', d: 'guardar os arquivos `.network`, `.netdev` e `.link` que o **systemd-networkd** usa para configurar a rede (diretório de administração local, de maior prioridade)' },
        { f: '/etc/services', d: 'listar os nomes de serviço e suas portas/protocolos padrão (por exemplo, `ssh 22/tcp`)' },
        { f: '/etc/wpa_supplicant/', d: 'guardar os arquivos com o hash da senha Wi-Fi gerados pelo `wpa_passphrase`, um por interface (por exemplo, wpa_supplicant-wlo1.conf)' },
      ];
      const it = rng.pick(ITEMS); const rest = ITEMS.filter((x) => x !== it);
      if (rng.chance(0.55)) {
        return {
          type: 'unica', text: `Qual arquivo (ou diretório) é usado para ${it.d}?`, options: mcq(rng, c(it.f), rest.map((x) => c(x.f))),
          explanation: `${it.f} serve para ${it.d.replace(/\*\*/g, '')}. Resumo: /etc/hostname = nome estático do host; /etc/hosts = nome ↔ IP local; /etc/nsswitch.conf = ordem das fontes de resolução; /etc/resolv.conf = servidores DNS e domínios de busca; /etc/network/interfaces = ifup/ifdown (Debian); /etc/sysconfig/network-scripts/ = Red Hat/CentOS; /etc/systemd/network/ = systemd-networkd; /etc/services = nomes de serviço ↔ portas.`, ref: ['102:p.423-429', '102:p.440-442'],
        };
      }
      return {
        type: 'unica', text: `Para que serve ${c(it.f)}?`, options: mcq(rng, it.d.replace(/\*\*/g, '').replace(/^./, (x) => x.toUpperCase()), rest.map((x) => x.d.replace(/\*\*/g, '').replace(/^./, (y) => y.toUpperCase()))),
        explanation: `${it.f} serve para ${it.d.replace(/\*\*/g, '')}.`, ref: ['102:p.423-429', '102:p.440-442'],
      };
    },
  },
  {
    id: 'nm-hostnamectl-cmd', obj: '109.2', nivel: 2, peso: 3,
    make(rng) {
      const all = tasks(rng); const t = rng.pick(all);
      if (rng.chance(0.65)) {
        return {
          type: 'unica', text: `Qual comando realiza a tarefa a seguir?\n\n${t.desc}.`, options: mcq(rng, c(t.cmd), t.wrong.map((w) => c(w))),
          explanation: `${c(t.cmd)}. ${TOOL_EXPL} As alternativas erradas usam o objeto/subcomando errado ou uma sintaxe inexistente.`, ref: ['102:p.423-427', '102:p.435-439'],
        };
      }
      // as variantes "mais específicas" (ifname/hidden) também fazem o que a versão básica descreve: não as misturar
      const others = all.filter((x) => x.id !== t.id && !((t.id === 'n-wif' || t.id === 'n-hid') && x.id === 'n-wconn'));
      return {
        type: 'unica', text: `O que faz o comando abaixo?\n\n\`\`\`\n${t.cmd}\n\`\`\``, options: mcq(rng, t.desc.replace(/\*\*/g, ''), others.map((x) => x.desc.replace(/\*\*/g, ''))),
        explanation: `${c(t.cmd)} → ${t.desc.replace(/\*\*/g, '')}. ${TOOL_EXPL}`, ref: ['102:p.423-427', '102:p.435-439'],
      };
    },
  },
  {
    id: 'ifupdown-networkd', obj: '109.2', nivel: 2, peso: 2,
    make(rng) {
      const kind = rng.pick(['dhcp', 'static', 'nd-static', 'nd-dhcp', 'nd-facts', 'nd-facts']);
      const ifn = rng.pick(['eno1', 'enp3s5', 'ens33', 'eth0', 'enp0s8']);
      const a = rng.int(1, 253); const net = `192.168.${rng.int(0, 254)}`; const addr = `${net}.${rng.int(10, 200)}`; const gw = `${net}.1`; const pfx = rng.pick([24, 24, 24, 25, 16]);
      const gwBad = `${net.replace(/\.\d+$/, (m) => `.${(Number(m.slice(1)) + 1) % 255}`)}.1`;
      if (kind === 'dhcp') {
        const ok = lines(`auto ${ifn}`, `iface ${ifn} inet dhcp`);
        return {
          type: 'unica', text: `Em um sistema Debian que usa \`ifup\`/\`ifdown\`, qual trecho de \`/etc/network/interfaces\` faz a interface ${c(ifn)} subir na inicialização obtendo as configurações de IP de um servidor DHCP?`,
          options: mcq(rng, ok, [lines(`auto ${ifn}`, `iface ${ifn} inet static`), lines(`iface ${ifn} inet dhcp`), lines(`auto ${ifn}`, `iface ${ifn} dhcp`), lines(`auto ${ifn}`, `iface ${ifn} inet loopback`), lines(`auto ${ifn}`, `iface ${ifn} inet manual`)]),
          explanation: 'A linha `auto <interface>` marca a interface para ser ativada na inicialização (e por `ifup -a`); a linha `iface <interface> <família> <método>` descreve a configuração: família `inet` (IPv4; `inet6` seria IPv6) e método `dhcp`. Sem `auto`, a interface só sobe se alguém executar `ifup` manualmente; `static` exige endereço fixo; `loopback` é só para lo.', ref: ['102:p.423-425'],
        };
      }
      if (kind === 'static') {
        const ok = lines(`auto ${ifn}`, `iface ${ifn} inet static`, `    address ${addr}/${pfx}`, `    gateway ${gw}`);
        return {
          type: 'unica', text: `Qual trecho de \`/etc/network/interfaces\` configura ${c(ifn)} com o IP fixo ${c(`${addr}/${pfx}`)} e o gateway ${c(gw)}, ativando a interface na inicialização?`,
          options: mcq(rng, ok, [lines(`auto ${ifn}`, `iface ${ifn} inet dhcp`, `    address ${addr}/${pfx}`, `    gateway ${gw}`), lines(`auto ${ifn}`, `iface ${ifn} inet manual`, `    address ${addr}/${pfx}`, `    gateway ${gw}`), lines(`auto ${ifn}`, `iface ${ifn} static`, `    address ${addr}/${pfx}`, `    gateway ${gw}`), lines(`auto ${ifn}`, `iface ${ifn} inet static`, `    ip ${addr}/${pfx}`, `    route default ${gw}`), lines(`auto ${ifn}`, `iface ${ifn} inet loopback`, `    address ${addr}/${pfx}`, `    gateway ${gw}`)]),
          explanation: 'O método `static` usa as opções `address` (IP com prefixo) e `gateway` (rota padrão) na própria estanza `iface`. Com `dhcp` ou `manual` esses valores não seriam aplicados como se espera, `iface <if> static` omite a família (`inet`), e `ip`/`route default` não são palavras-chave do arquivo.', ref: ['102:p.424-425'],
        };
      }
      if (kind === 'nd-static') {
        const ok = lines('[Match]', `Name=${ifn}`, '[Network]', `Address=${addr}/${pfx}`, `Gateway=${gw}`);
        return {
          type: 'unica', text: `Qual conteúdo, gravado em \`/etc/systemd/network/30-lan.network\`, faz o **systemd-networkd** configurar a interface ${c(ifn)} com ${c(`${addr}/${pfx}`)} e gateway ${c(gw)}?`,
          options: mcq(rng, ok, [lines('[Network]', `Name=${ifn}`, '[Match]', `Address=${addr}/${pfx}`, `Gateway=${gw}`), lines('[Match]', `Name=${ifn}`, '[Network]', 'DHCP=yes', `Address=${addr}/${pfx}`), lines('[Match]', `Interface=${ifn}`, '[Network]', `IP=${addr}/${pfx}`, `Router=${gw}`), lines('[Match]', `Name=${ifn}`, '[Network]', `Address=${addr}`, `Gateway=${gw}`), lines('[Network]', `Address=${addr}/${pfx}`, `Gateway=${gw}`, `Name=${ifn}`)]),
          explanation: 'Num arquivo `.network`, a seção `[Match]` escolhe a(s) interface(s) (`Name=`, que aceita globs como `en*`, ou `MACAddress=`) e a seção `[Network]` traz a configuração: `Address=` (com o prefixo, aqui /' + pfx + ') e `Gateway=` para IP estático, ou `DHCP=yes` para DHCP. Seções trocadas, `IP=`/`Router=`/`Interface=` (chaves que não existem), endereço sem prefixo ou ausência de `[Match]` (o arquivo valeria para qualquer interface) não atendem ao pedido; `DHCP=yes` junto com o endereço fixo também não, e ainda faltaria o gateway.', ref: ['102:p.440-441'],
        };
      }
      if (kind === 'nd-dhcp') {
        const ok = lines('[Match]', 'MACAddress=00:16:3e:8d:2b:5b', '[Network]', 'DHCP=yes');
        return {
          type: 'unica', text: 'Qual arquivo `.network` do systemd-networkd seleciona a interface pelo endereço MAC `00:16:3e:8d:2b:5b` e a configura para obter IPv4 e IPv6 por DHCP?',
          options: mcq(rng, ok, [lines('[Match]', 'Name=00:16:3e:8d:2b:5b', '[Network]', 'DHCP=yes'), lines('[Match]', 'MACAddress=00:16:3e:8d:2b:5b', '[Network]', 'DHCP=static'), lines('[Match]', 'MACAddress=00:16:3e:8d:2b:5b', '[DHCP]', 'Enable=yes'), lines('[Network]', 'MACAddress=00:16:3e:8d:2b:5b', '[Match]', 'DHCP=yes')]),
          explanation: '`[Match]` aceita `MACAddress=` para escolher o dispositivo pelo MAC (e não `Name=`, que é o nome da interface); `DHCP=yes` na seção `[Network]` liga o DHCP (`DHCP=ipv4` ou `DHCP=ipv6` limitam a uma família).', ref: ['102:p.441'],
        };
      }
      // fatos do systemd-networkd
      const F = [
        { t: 'Para criar um dispositivo virtual (bridge, tun…), usa-se um arquivo com o sufixo `.netdev`.', f: ['Para criar um dispositivo virtual (bridge, tun…), usa-se um arquivo com o sufixo `.link`.', 'Para criar um dispositivo virtual (bridge, tun…), usa-se um arquivo com o sufixo `.network`.'] },
        { t: 'Endereços de rede e rotas são configurados em arquivos com o sufixo `.network`.', f: ['Endereços de rede e rotas são configurados em arquivos com o sufixo `.netdev`.', 'Endereços de rede e rotas são configurados em arquivos com o sufixo `.link`.'] },
        { t: 'Os arquivos em `/etc/systemd/network` têm prioridade sobre os de mesmo nome em `/run/systemd/network` e `/lib/systemd/network`.', f: ['Os arquivos em `/lib/systemd/network` têm prioridade sobre os de mesmo nome em `/etc/systemd/network`.', 'Os arquivos em `/run/systemd/network` têm prioridade sobre os de mesmo nome em `/etc/systemd/network`.'] },
        { t: 'Os arquivos de configuração são processados em ordem lexicográfica, por isso é comum prefixá-los com números (10-, 30-…).', f: ['Os arquivos de configuração são processados em ordem de data de modificação, do mais antigo para o mais novo.', 'Só o primeiro arquivo `.network` do diretório é lido; os demais são ignorados.'] },
        { t: 'Para selecionar todas as interfaces Ethernet, usa-se `Name=en*` na seção `[Match]`, pois são aceitos globs no estilo do shell.', f: ['Para selecionar todas as interfaces Ethernet, usa-se `Type=eth` na seção `[Network]`.', 'Para selecionar todas as interfaces Ethernet, usa-se `Name=eth*`, porque `en*` não é aceito.'] },
        { t: 'Para redes Wi-Fi com senha, o adaptador precisa estar autenticado antes (wpa_supplicant); só então o systemd-networkd aplica o arquivo `.network`.', f: ['O systemd-networkd autentica sozinho em redes Wi-Fi WPA2; o wpa_supplicant não é necessário.', 'O arquivo `.network` guarda a senha do Wi-Fi em texto claro na chave `Password=` da seção `[Match]`.'] },
      ];
      const idx = rng.shuffle(F.map((_, i) => i)); const multiple = rng.chance(0.4);
      if (!multiple) return { type: 'unica', text: 'Sobre o systemd-networkd, qual afirmação está **correta**?', options: mcq(rng, F[idx[0]].t, idx.slice(1, 4).map((i) => rng.pick(F[i].f))), explanation: `${F[idx[0]].t.replace(/`/g, '')} Arquivos: .netdev (dispositivos virtuais), .link (ajustes de baixo nível da interface), .network (endereços e rotas). Diretórios: /etc/systemd/network (maior prioridade), /run/systemd/network e /lib/systemd/network.`, ref: ['102:p.440-442'] };
      const k = rng.int(2, 3);
      return { type: 'multipla', text: 'Sobre o systemd-networkd, marque **todas** as afirmações corretas.', options: multi(rng, idx.slice(0, k).map((i) => F[i].t), idx.slice(k, 5).map((i) => rng.pick(F[i].f)), 5 - k), explanation: `Corretas: ${idx.slice(0, k).map((i) => F[i].t.replace(/`/g, '')).join(' ')} Arquivos: .netdev (dispositivos virtuais), .link (baixo nível), .network (endereços/rotas); diretórios por prioridade: /etc/systemd/network > /run/systemd/network > /lib/systemd/network.`, ref: ['102:p.440-442'] };
    },
  },
  {
    id: 'net-ifname', obj: '109.2', nivel: 1, peso: 2,
    make(rng) {
      const it = rng.pick(IFNAMES); const nm = it.n(rng);
      const kind = rng.pick(['type', 'type', 'rule', 'order', 'list']);
      if (kind === 'type') {
        const types = [...new Set(IFNAMES.map((x) => x.t))];
        return { type: 'unica', text: `Em uma distribuição que usa a nomenclatura previsível do systemd, que tipo de adaptador de rede é a interface ${c(nm)}?`, options: mcq(rng, it.t, types.filter((t) => t !== it.t)), explanation: `${nm}: ${it.why}. Prefixos: en = Ethernet, wl = WLAN, ww = WWAN, ib = InfiniBand, sl = SLIP.`, ref: ['102:p.422-423'] };
      }
      if (kind === 'rule') {
        const RULES = { o: 'Índice do dispositivo onboard informado pelo firmware/BIOS', s: 'Índice do slot PCI Express informado pelo firmware/BIOS', p: 'Endereço do dispositivo no barramento PCI (barramento e slot)', x: 'Endereço MAC da interface', l: 'Ordem de detecção pelo kernel (convenção legada)' };
        const key = /^(en|wl|ww|ib)x/.test(nm) ? 'x' : /^(en|wl)o/.test(nm) ? 'o' : /^(en|wl|ww|ib)s\d/.test(nm) ? 's' : /^(en|wl|ww|ib)p/.test(nm) ? 'p' : 'l';
        return { type: 'unica', text: `O nome ${c(nm)} foi construído a partir de qual informação?`, options: mcq(rng, RULES[key], Object.entries(RULES).filter(([k]) => k !== key).map(([, v]) => v)), explanation: `${nm}: ${it.why}. Prioridade, da mais alta para a mais baixa: (1) índice onboard do firmware (eno1), (2) índice do slot PCIe (ens1), (3) endereço no barramento (enp3s5), (4) endereço MAC (enx78e7d1ea46da), (5) nome legado (eth0).`, ref: ['102:p.422-423'] };
      }
      if (kind === 'order') {
        return { type: 'unica', text: 'Na nomenclatura previsível de interfaces, qual é a ordem de prioridade das regras, da mais alta para a mais baixa?', options: mcq(rng, 'Índice onboard do firmware → índice do slot PCIe → endereço no barramento → endereço MAC → nome legado (eth0)', ['Nome legado (eth0) → endereço MAC → endereço no barramento → índice do slot PCIe → índice onboard', 'Endereço MAC → endereço no barramento → índice onboard → índice do slot PCIe → nome legado (eth0)', 'Índice do slot PCIe → índice onboard do firmware → endereço no barramento → nome legado (eth0) → endereço MAC', 'Endereço no barramento → índice onboard → índice do slot PCIe → nome legado (eth0) → endereço MAC']), explanation: 'O sistema tenta nomear pela fonte mais estável e cai para a seguinte se não houver informação: eno1 (onboard) → ens1 (slot PCIe) → enp3s5 (barramento) → enx<MAC> → eth0 (legado, por ordem de detecção).', ref: ['102:p.422-423'] };
      }
      return {
        type: 'unica', text: 'Qual dos comandos abaixo **não** serve para listar as interfaces de rede presentes no sistema?', options: mcq(rng, 'hostnamectl status', ['ip link show', 'nmcli device', 'ifconfig -a', 'ls /sys/class/net']),
        explanation: '`ip link show`, `nmcli device` (se o NetworkManager estiver em uso), `ifconfig -a` (legado) e `ls /sys/class/net` listam as interfaces. O `hostnamectl status` mostra nomes de host, ID da máquina, sistema e kernel — não as interfaces.', ref: ['102:p.421', '102:p.433'],
      };
    },
  },
  {
    id: 'hosts-entry', obj: '109.2', nivel: 2, peso: 2,
    make(rng) {
      const kind = rng.pick(['syntax', 'syntax', 'comment', 'v6', 'alias']);
      const ip = `10.${rng.int(0, 9)}.${rng.int(0, 255)}.${rng.int(2, 250)}`; const [n1, n2] = rng.sample(HOSTN, 2);
      const fqdn = `${n1}.${rng.pick(DOMS)}`;
      if (kind === 'syntax') {
        return {
          type: 'unica', text: `Qual linha de \`/etc/hosts\` associa os nomes ${c(n1)} e ${c(n2)} ao endereço ${c(ip)}?`,
          options: mcq(rng, c(`${ip} ${n1} ${n2}`), [c(`${n1} ${n2} ${ip}`), c(`${ip}, ${n1}, ${n2}`), c(`${n1}=${ip} ${n2}`), c(`${ip} = ${n1} ${n2}`), c(`${n1} ${ip} ${n2}`)]),
          explanation: 'Cada linha do /etc/hosts tem o formato `endereço-IP  nome-oficial  [apelidos…]`, com campos separados por espaços ou tabulações: a coluna da esquerda é sempre o endereço IP (IPv4 ou IPv6) e as demais são nomes associados a ele. Vírgulas e sinais de igual não são separadores.', ref: ['102:p.427-428'],
        };
      }
      if (kind === 'comment') {
        const line = `${ip}   ${n1} ${n2}   # servidor de testes`;
        return {
          type: 'unica', text: `O \`/etc/hosts\` contém a linha abaixo. Quais nomes passam a resolver para ${c(ip)}?\n\n\`\`\`\n${line}\n\`\`\``,
          options: mcq(rng, `${n1} e ${n2}`, [`${n1}, ${n2}, servidor e de testes`, `Apenas ${n1}; os apelidos exigem uma linha por nome`, `Nenhum: linhas com # são totalmente ignoradas`, `${n2} e "servidor de testes"`]),
          explanation: 'O texto a partir de `#` até o fim da linha é comentário e é ignorado; o que vem antes vale normalmente. O primeiro nome é o oficial e os seguintes são apelidos (aliases) para o mesmo IP, então tanto ' + n1 + ' quanto ' + n2 + ' resolvem para ' + ip + '.', ref: ['102:p.427-428'],
        };
      }
      if (kind === 'v6') {
        return {
          type: 'unica', text: 'Qual é a entrada padrão do /etc/hosts para o endereço de **loopback IPv6**?', options: mcq(rng, c('::1  localhost ip6-localhost ip6-loopback'), [c('localhost  ::1'), c('::1/128  localhost'), c('127.0.0.1  ip6-localhost'), c('fe80::1  localhost'), c('ff02::1  localhost')]),
          explanation: 'O endereço de loopback IPv6 é `::1` (equivale ao 127.0.0.1 do IPv4); no /etc/hosts o IP vem primeiro, seguido dos nomes (localhost e, em Debian, ip6-localhost e ip6-loopback). `fe80::` é link-local e `ff02::1` é multicast.', ref: ['102:p.428'],
        };
      }
      const line = `${ip}  ${fqdn} ${n1} ${n2}`;
      return {
        type: 'unica', text: `Com a linha abaixo no \`/etc/hosts\`, que nomes o resolvedor local associa a ${c(ip)}?\n\n\`\`\`\n${line}\n\`\`\``,
        options: mcq(rng, `${fqdn}, ${n1} e ${n2}`, [`Somente ${fqdn}; ${n1} e ${n2} só valem se estiverem em linhas separadas`, `Somente ${n2}, o último nome da linha`, `${ip} é associado a ${fqdn}, e ${n1} e ${n2} são endereços IP alternativos`, `Nenhum dos três, pois o nome completo precisa vir depois dos apelidos`]),
        explanation: `O primeiro nome após o IP é o nome canônico (${fqdn}); os demais (${n1}, ${n2}) são aliases (apelidos), colocados no fim da linha, para o mesmo endereço. Assim, qualquer um dos três nomes resolve para ${ip}. Ex.: \`192.168.1.10 foo.mydomain.org foo\`.`, ref: ['102:p.427-428'],
      };
    },
  },
];
