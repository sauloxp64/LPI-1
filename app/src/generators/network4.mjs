// 109.3 — Soluções para problemas simples de rede: iproute2 (ip), net-tools legados, tabela de rotas,
// ss/netstat, ping/traceroute/tracepath/nc e diagnóstico.
import { mcq, multi, code as c } from './util.mjs';
import { ip2n, n2ip, maskN, maskStr, calc, shq, py, randPrivate } from './network.mjs';

const DEVS = ['eth0', 'eth1', 'enp3s5', 'enp0s8', 'ens33', 'eno1', 'enp0s3', 'wlan0'];
const subnetOf = (ip, p) => calc(ip, p);

/** Parâmetros aleatórios coerentes (o gateway fica na mesma sub-rede do host). */
function params(r) {
  const dev = r.pick(DEVS); const pfx = r.pick([24, 24, 24, 16, 25, 23, 22, 20]);
  let A = randPrivate(r); const s = subnetOf(A, pfx); const G = n2ip(s.first);
  if (A === G) A = n2ip(s.first + 5);
  let A2 = n2ip(s.first + r.int(20, Math.min(s.hosts - 2, 60))); if (A2 === A) A2 = n2ip(s.first + 7);
  const np = r.pick([16, 20, 22, 24, 24, 24]); const netBase = r.pick([`172.${r.int(16, 31)}.${r.int(0, 255)}.0`, `10.${r.int(0, 255)}.${r.int(0, 255)}.0`, `192.168.${r.int(0, 255)}.0`]);
  const NET = n2ip((ip2n(netBase) & maskN(np)) >>> 0);
  return { dev, pfx, A, A2, G, CIDR: `${A}/${pfx}`, CIDR2: `${A2}/${pfx}`, NET, NP: np, NETC: `${NET}/${np}`, MASKN: maskStr(np), MTU: r.pick([1400, 1492, 9000, 1280, 1450]), VID: r.pick([10, 20, 30, 100, 200, 300]), IP6: `2001:db8:${r.int(1, 9)}::${r.int(2, 99)}/64`, DST: `${r.int(11, 99)}.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}` };
}

// ---------- descrição <-> comando ip ----------
export function ipTasks(r) {
  const p = params(r); const { dev, A, A2, G, CIDR, CIDR2, NETC, MTU, VID, IP6, DST } = p;
  const T = [
    { id: 'addr-add', desc: `Atribuir o endereço ${c(CIDR)} à interface ${c(dev)} (configuração imediata, que se perde ao reiniciar)`, cmd: `ip addr add ${CIDR} dev ${dev}`,
      wrong: [{ c: `ip addr add ${A} dev ${dev}`, n: 'sem o prefixo, o endereço entra como /32' }, { c: `ip addr set ${CIDR} dev ${dev}`, f: 1, n: '"set" não existe em ip addr (os verbos são add, del, show, flush…)' }, { c: `ip link set ${dev} address ${CIDR}`, f: 1, n: 'ip link set … address altera o endereço MAC, não o IP' }, { c: `ip addr add ${CIDR} ${dev}`, f: 1, n: 'falta a palavra-chave dev antes do nome da interface' }, { c: `ip route add ${CIDR} dev ${dev}`, n: 'isso é um comando de rota (ip route), não atribui endereço à interface' }] },
    { id: 'addr-del', desc: `Remover o endereço ${c(CIDR)} da interface ${c(dev)}`, cmd: `ip addr del ${CIDR} dev ${dev}`,
      wrong: [{ c: `ip addr flush dev ${dev}`, n: 'flush remove TODOS os endereços da interface, não só um' }, { c: `ip link del ${dev}`, n: 'isso remove a própria interface (se for virtual)' }, { c: `ip route del ${CIDR} dev ${dev}`, n: 'isso remove uma rota, não o endereço' }, { c: `ip addr rm ${CIDR} dev ${dev}`, f: 1, n: '"rm" não é um verbo válido do ip addr' }] },
    { id: 'addr-show', desc: `Mostrar os endereços IP configurados somente na interface ${c(dev)}`, cmd: `ip addr show dev ${dev}`, ok: 1,
      wrong: [{ c: `ip link show dev ${dev}`, n: 'ip link mostra a camada de enlace (estado, MTU, MAC), não os endereços IP' }, { c: `ip route show dev ${dev}`, n: 'mostra as rotas ligadas à interface' }, { c: `ip neigh show dev ${dev}`, n: 'mostra a tabela de vizinhos (ARP), não os endereços locais' }, { c: `ip addr list ${dev} ip`, f: 1, n: 'argumento "ip" inválido' }] },
    { id: 'link-down', desc: `Desativar a interface ${c(dev)} (sem remover sua configuração)`, cmd: `ip link set ${dev} down`,
      wrong: [{ c: `ip link del ${dev}`, n: 'remove a interface em vez de apenas desativá-la' }, { c: `ip addr del ${dev}`, f: 1, n: 'ip addr del exige o endereço e a palavra dev' }, { c: `ip link set ${dev} disable`, f: 1, n: '"disable" não é argumento do ip link' }, { c: `ip link up ${dev}`, f: 1, n: '"up" não é um verbo do ip link (e ainda por cima ativaria a interface)' }] },
    { id: 'link-up', desc: `Ativar a interface ${c(dev)}`, cmd: `ip link set ${dev} up`,
      wrong: [{ c: `ip link up ${dev}`, f: 1, n: '"up" não é um verbo do ip link: é uma opção de ip link set' }, { c: `ip addr set ${dev} up`, f: 1, n: 'ip addr não tem "set"' }, { c: `ip link set ${dev} down`, n: 'isso DESATIVA a interface' }, { c: `ip route set ${dev} up`, f: 1, n: 'ip route não tem "set"' }] },
    { id: 'mtu', desc: `Alterar o MTU da interface ${c(dev)} para ${c(String(MTU))}`, cmd: `ip link set ${dev} mtu ${MTU}`,
      wrong: [{ c: `ip addr set mtu ${MTU} dev ${dev}`, f: 1, n: 'ip addr não tem "set"; o MTU é propriedade do enlace' }, { c: `ip link set ${dev} speed ${MTU}`, f: 1, n: '"speed" não é uma opção de ip link set' }, { c: `ip link mtu ${MTU} ${dev}`, f: 1, n: '"mtu" não é um verbo do ip link' }, { c: `ip route add mtu ${MTU} dev ${dev}`, f: 1, n: 'rota inválida: falta o destino' }] },
    { id: 'defroute', desc: `Configurar a rota padrão (default) para usar o gateway ${c(G)}`, cmd: `ip route add default via ${G}`,
      wrong: [{ c: `ip route add default gw ${G}`, f: 1, n: '"gw" é a sintaxe do comando legado route; no ip usa-se via' }, { c: `ip route default via ${G}`, f: 1, n: 'falta o verbo add' }, { c: `ip route add default dev ${G}`, f: 1, n: 'dev espera o nome de uma interface, não o IP do gateway' }, { c: `ip route add default ${G}`, f: 1, n: 'falta a palavra via antes do endereço do gateway' }] },
    { id: 'netroute', desc: `Criar uma rota estática para a rede ${c(NETC)} passando pelo gateway ${c(G)}`, cmd: `ip route add ${NETC} via ${G}`,
      wrong: [{ c: `ip route add ${NETC} gw ${G}`, f: 1, n: '"gw" é sintaxe do route legado' }, { c: `ip route add ${G} via ${NETC}`, f: 1, n: 'destino e gateway invertidos' }, { c: `ip route add ${p.NET} via ${G}`, n: 'sem o prefixo, vira uma rota para um único host (/32)' }, { c: `ip route add default via ${G}`, n: 'isso define a rota padrão, não a rota para a rede pedida' }] },
    { id: 'devroute', desc: `Criar uma rota para a rede ${c(NETC)} diretamente pela interface ${c(dev)} (sem gateway)`, cmd: `ip route add ${NETC} dev ${dev}`,
      wrong: [{ c: `ip route add ${NETC} via ${dev}`, f: 1, n: 'via espera um endereço de gateway, não o nome de uma interface' }, { c: `ip route add ${dev} via ${NETC}`, f: 1, n: 'argumentos trocados' }, { c: `ip route add ${NETC} gw ${dev}`, f: 1, n: '"gw" não existe no ip route' }, { c: `ip addr add ${NETC} dev ${dev}`, n: 'isso atribui um endereço à interface, não cria uma rota' }] },
    { id: 'route-del', desc: `Remover a rota para a rede ${c(NETC)}`, cmd: `ip route del ${NETC}`,
      wrong: [{ c: 'ip route del default', n: 'remove a rota padrão, não a rota pedida' }, { c: `ip route flush cache`, n: 'esvazia o cache de rotas; a rota continua configurada' }, { c: `ip route remove ${NETC}`, f: 1, n: '"remove" não é um verbo válido' }, { c: `ip addr del ${NETC} dev ${dev}`, n: 'remove um endereço da interface, não a rota' }] },
    { id: 'route-show', desc: 'Exibir a tabela de roteamento IPv4 do kernel', cmd: 'ip route', ok: 1,
      wrong: [{ c: 'ip rule show', n: 'mostra as regras de política de roteamento, não a tabela de rotas' }, { c: 'ip neigh show', n: 'mostra o cache ARP/vizinhos' }, { c: 'ip addr route', f: 1, n: '"route" não é argumento de ip addr' }, { c: 'ip link route', f: 1, n: '"route" não é argumento de ip link' }] },
    { id: 'route-get', desc: `Descobrir qual rota (gateway e interface) o kernel usaria para chegar a ${c(DST)}`, cmd: `ip route get ${DST}`, ok: 1,
      wrong: [{ c: `ip route lookup ${DST}`, f: 1, n: '"lookup" não existe em ip route (o verbo é get)' }, { c: `ip route check ${DST}`, f: 1, n: '"check" não existe' }, { c: `ip addr show ${DST}`, f: 1, n: 'ip addr show espera uma interface, não um destino' }, { c: `ip route find ${DST}`, f: 1, n: '"find" não existe' }] },
    { id: 'neigh', desc: 'Exibir a tabela ARP / cache de vizinhos (endereço IP → endereço MAC)', cmd: 'ip neigh', ok: 1,
      wrong: [{ c: 'ip arp', f: 1, n: '"arp" não é um objeto do ip (use neigh/neighbour)' }, { c: 'ip addr neigh', f: 1, n: '"neigh" não é argumento de ip addr' }, { c: 'ip route neigh', f: 1, n: '"neigh" não é argumento de ip route' }, { c: 'ip link show arp', f: 1, n: 'argumento inválido' }] },
    { id: 'stats', desc: `Mostrar os contadores de bytes/pacotes e erros (RX/TX) da interface ${c(dev)}`, cmd: `ip -s link show ${dev}`, ok: 1,
      wrong: [{ c: `ip link show ${dev}`, n: 'sem -s não há contadores de pacotes' }, { c: `ip -s route show dev ${dev}`, n: 'mostra rotas (com estatísticas de rota), não os contadores da interface' }, { c: `ip link stats ${dev}`, f: 1, n: '"stats" não é um verbo do ip link' }, { c: `ip addr count ${dev}`, f: 1, n: '"count" não existe' }] },
    { id: 'vlan', desc: `Criar a subinterface de VLAN ${c(String(VID))} sobre ${c(dev)}, chamada ${c(`${dev}.${VID}`)}`, cmd: `ip link add link ${dev} name ${dev}.${VID} type vlan id ${VID}`,
      wrong: [{ c: `ip link add link ${dev} name ${dev}.${VID} type vlan ${VID}`, f: 1, n: 'falta a palavra id antes do número da VLAN' }, { c: `ip link set ${dev} vlan ${VID}`, f: 1, n: 'ip link set não tem "vlan"; VLANs são criadas com ip link add … type vlan' }, { c: `ip addr add vlan ${VID} dev ${dev}`, f: 1, n: 'ip addr não cria VLANs' }, { c: `ip link add link ${dev} name ${dev}.${VID} type bridge id ${VID}`, f: 1, n: 'o tipo é vlan (bridge serve ao spanning tree/pontes)' }] },
    { id: 'label', desc: `Adicionar um **segundo** endereço ${c(CIDR2)} à interface ${c(dev)}, com o apelido (label) ${c(`${dev}:sub1`)}`, cmd: `ip addr add ${CIDR2} dev ${dev} label ${dev}:sub1`,
      wrong: [{ c: `ip addr add ${CIDR2} label ${dev}:sub1`, f: 1, n: 'falta dev: sem a interface o comando é recusado (“dev” argument is required)' }, { c: `ip addr add ${CIDR2} dev ${dev} alias sub1`, f: 1, n: '"alias" não é palavra-chave do ip addr (use label)' }, { c: `ip addr set ${CIDR2} label ${dev}:sub1 dev ${dev}`, f: 1, n: 'ip addr não tem "set"' }, { c: `ip addr add ${CIDR2} dev ${dev} name ${dev}:sub1`, f: 1, n: '"name" não é palavra-chave do ip addr add (o apelido vai em label)' }] },
    { id: 'flush', desc: `Remover **todos** os endereços IP da interface ${c(dev)}`, cmd: `ip addr flush dev ${dev}`,
      wrong: [{ c: 'ip addr flush all', f: 1, n: '"all" não é nome de interface: é preciso indicar dev e a interface' }, { c: `ip link set ${dev} down`, n: 'apenas desativa a interface; os endereços continuam configurados' }, { c: `ip link del ${dev}`, n: 'remove a interface' }, { c: `ip addr remove all dev ${dev}`, f: 1, n: '"remove" não é um verbo válido do ip addr' }] },
    { id: 'addr6', desc: `Atribuir o endereço IPv6 ${c(IP6)} à interface ${c(dev)} usando o comando ip`, cmd: `ip addr add ${IP6} dev ${dev}`,
      wrong: [{ c: `ip addr add ${IP6.replace('/64', '')} dev ${dev}`, n: 'sem o prefixo, o endereço IPv6 entra como /128' }, { c: `ip addr add inet6 ${IP6} dev ${dev}`, f: 1, n: '"inet6" não é argumento (o ip reconhece a família pelo próprio endereço)' }, { c: `ip addr set ${IP6} dev ${dev}`, f: 1, n: 'ip addr não tem "set"' }, { c: `ip addr add ${IP6} ${dev}`, f: 1, n: 'falta a palavra dev' }] },
    { id: 'save', desc: 'Fazer backup da tabela de roteamento no arquivo /root/routes/route_backup', cmd: 'ip route save > /root/routes/route_backup', ok: 1,
      wrong: [{ c: 'ip route backup > /root/routes/route_backup', f: 1, n: '"backup" não existe (o verbo é save)' }, { c: 'ip route dump > /root/routes/route_backup', f: 1, n: '"dump" não existe' }, { c: 'ip route show > /root/routes/route_backup', n: 'gera apenas texto; o arquivo não pode ser restaurado com ip route restore' }, { c: 'ip route export /root/routes/route_backup', f: 1, n: '"export" não existe' }] },
    { id: 'restore', desc: 'Restaurar a tabela de roteamento a partir do backup /root/routes/route_backup', cmd: 'ip route restore < /root/routes/route_backup', ok: 1,
      wrong: [{ c: 'ip route load < /root/routes/route_backup', f: 1, n: '"load" não existe (o verbo é restore)' }, { c: 'ip route save < /root/routes/route_backup', n: 'save grava (despeja) a tabela; não a lê do arquivo' }, { c: 'ip route import /root/routes/route_backup', f: 1, n: '"import" não existe' }, { c: 'ip route restore > /root/routes/route_backup', f: 1, n: 'o redirecionamento está invertido: o backup tem de ser lido (<), não sobrescrito (>)' }] },
  ];
  return { T, p };
}
const IPGRP = { 'addr-add': 'a', 'addr-del': 'a', 'addr-show': 'a', flush: 'a', label: 'a', addr6: 'a', 'link-up': 'l', 'link-down': 'l', mtu: 'l', stats: 'l', vlan: 'l', defroute: 'r', netroute: 'r', devroute: 'r', 'route-del': 'r', 'route-show': 'r', 'route-get': 'r', save: 'r', restore: 'r', neigh: 'n' };
/** Descrições erradas: primeiro as de tarefas do mesmo objeto (addr/link/route), depois de outros. */
function nearDescs(rng, t, others) {
  const clean = (x) => x.desc.replace(/\*\*/g, '');
  const same = rng.shuffle(others.filter((x) => IPGRP[x.id] === IPGRP[t.id])).slice(0, 2); const diff = rng.shuffle(others.filter((x) => IPGRP[x.id] !== IPGRP[t.id]));
  return [...same, ...diff].slice(0, 3).map(clean);
}
/** Script de verificação: cada comando deve ser aceito (P) ou rejeitado na análise sintática (F) pelo ip real. */
function ipVerify(cmds, dev) {
  const sub = (s) => s.split('/root/routes/route_backup').join('/tmp/rb').split(dev).join('eth0');
  const body = cmds.map((x) => `p ${shq(sub(x.c))}`).join('\n');
  return { sh: `p() { ip route save > /tmp/rb 2>/dev/null; r=$(bash -c "$1" 2>&1 >/dev/null </dev/null); rc=$?; case "$r" in *"Operation not permitted"*) printf P;; *) if [ $rc -eq 0 ]; then printf P; else printf F; fi;; esac; }\n${body}\necho`, expect: cmds.map((x) => (x.f ? 'F' : 'P')).join('') };
}

// ---------- net-tools <-> iproute2 ----------
function pairs(r) {
  const p = params(r); const { dev, A, G, NET, NP, MASKN, MTU, pfx } = p; const mk = maskStr(pfx); const H = r.pick(['servidor.example.com', 'fe80::1', '2001:db8::10', 'srv01']);
  const v6 = H.includes(':');
  return [
    { id: 'ifc', l: 'ifconfig', m: 'ip addr show', tr: ['ip link show', 'ip route show', 'ip neigh'] },
    { id: 'ifca', l: 'ifconfig -a', m: 'ip link show', tr: ['ip addr show', 'ip route', 'ip -s link up'], ok: 1 },
    { id: 'ifup', l: `ifconfig ${dev} up`, m: `ip link set ${dev} up`, tr: [`ip addr set ${dev} up`, `ip link up ${dev}`, `ip route set ${dev} up`] },
    { id: 'ifdown', l: `ifconfig ${dev} down`, m: `ip link set ${dev} down`, tr: [`ip link del ${dev}`, `ip addr del ${dev}`, `ip link down ${dev}`] },
    { id: 'ifip', l: `ifconfig ${dev} ${A} netmask ${mk}`, m: `ip addr add ${A}/${pfx} dev ${dev}`, tr: [`ip addr add ${A} dev ${dev}`, `ip addr set ${A}/${pfx} dev ${dev}`, `ip link set ${dev} address ${A}/${pfx}`] },
    { id: 'ifmtu', l: `ifconfig ${dev} mtu ${MTU}`, m: `ip link set ${dev} mtu ${MTU}`, tr: [`ip addr set ${dev} mtu ${MTU}`, `ip route add mtu ${MTU} dev ${dev}`, `ip link mtu ${MTU} ${dev}`] },
    { id: 'rn', l: 'route -n', m: 'ip route', tr: ['ip rule show', 'ip neigh', 'ip link show'], ok: 1 },
    { id: 'nr', l: 'netstat -r', m: 'ip route', tr: ['ss -r', 'ip neigh', 'ip -s link'], ok: 1 },
    { id: 'rdef', l: `route add default gw ${G}`, m: `ip route add default via ${G}`, tr: [`ip route add default gw ${G}`, `ip route default via ${G}`, `ip addr add default via ${G}`] },
    { id: 'rnet', l: `route add -net ${NET} netmask ${MASKN} gw ${G}`, m: `ip route add ${NET}/${NP} via ${G}`, tr: [`ip route add ${NET} via ${G}`, `ip route add ${NET}/${NP} gw ${G}`, `ip addr add ${NET}/${NP} dev ${dev}`] },
    { id: 'rdel', l: 'route del default', m: 'ip route del default', tr: ['ip route flush cache', 'ip route delete all', 'ip addr del default'], ok: 1 },
    { id: 'ns', l: 'netstat -tulpn', m: 'ss -tulpn', tr: ['ss -tulpa', 'ss -tulp', 'ss -sulpn'], ok: 1 },
    { id: 'nan', l: 'netstat -an', m: 'ss -an', tr: ['ss -ln', 'ss -tn', 'ss -s'], ok: 1 },
    { id: 'nss', l: 'netstat -s', m: 'ss -s', tr: ['ss -l', 'ss -a', 'ss -p'], ok: 1 },
    { id: 'ni', l: 'netstat -i', m: 'ip -s link', tr: ['ip addr show', 'ip route', 'ss -i'], ok: 1 },
    { id: 'arp', l: 'arp -n', m: 'ip neigh', tr: ['ip addr show', 'ip route', 'ip link show'], ok: 1 },
    { id: 'p6', l: `ping6 ${v6 ? H : 'srv01'}`, m: `ping -6 ${v6 ? H : 'srv01'}`, tr: [`ping -4 ${v6 ? H : 'srv01'}`, `ping -6c ${v6 ? H : 'srv01'}`, `tracepath ${v6 ? H : 'srv01'}`], noverify: 1 },
    { id: 'tr6', l: `traceroute6 ${v6 ? H : 'srv01'}`, m: `traceroute -6 ${v6 ? H : 'srv01'}`, tr: [`traceroute -4 ${v6 ? H : 'srv01'}`, `tracepath ${v6 ? H : 'srv01'}`, `ping -6 ${v6 ? H : 'srv01'}`], noverify: 1 },
    { id: 'r6', l: 'route -6', m: 'ip -6 route', tr: ['ip route', 'ip -6 neigh', 'ip -6 addr show'], ok: 1 },
  ].map((x) => ({ ...x, dev }));
}
const NT_EXPL = 'Correspondências: ifconfig → ip addr (endereços) / ip link (estado, MTU); route e netstat -r → ip route; netstat -tulpn → ss -tulpn; netstat -i → ip -s link; arp → ip neigh; ping6/traceroute6 → ping -6/traceroute -6. O pacote net-tools (ifconfig, route, netstat, arp) é legado; iproute2 (ip, ss) é o conjunto moderno.';

// ---------- tabela de rotas ----------
const fmtN = (n, w) => String(n).padEnd(w);
function routeLines(routes, style) {
  if (style === 'ip') return routes.map((x) => {
    if (x.kind === 'default') return `default via ${x.gw} dev ${x.dev} proto ${x.proto}${x.metric ? ` metric ${x.metric}` : ''}`;
    if (x.kind === 'conn') return `${x.net}/${x.p} dev ${x.dev} proto kernel scope link src ${x.src}${x.metric ? ` metric ${x.metric}` : ''}`;
    return `${x.net}/${x.p} via ${x.gw} dev ${x.dev}${x.metric ? ` metric ${x.metric}` : ''}`;
  }).join('\n');
  const rows = routes.map((x) => {
    const dst = x.kind === 'default' ? '0.0.0.0' : x.net; const gw = x.kind === 'conn' ? '0.0.0.0' : x.gw; const mask = x.kind === 'default' ? '0.0.0.0' : maskStr(x.p);
    return `${fmtN(dst, 15)} ${fmtN(gw, 15)} ${fmtN(mask, 15)} ${fmtN(x.kind === 'conn' ? 'U' : 'UG', 5)} ${fmtN(x.metric || 0, 6)} ${fmtN(0, 6)} ${String(0).padStart(3)} ${x.dev}`;
  });
  return ['Kernel IP routing table', 'Destination     Gateway         Genmask         Flags Metric Ref    Use Iface', ...rows].join('\n');
}
/** Qual rota o kernel escolhe: maior prefixo; empate -> menor métrica; sem rota -> null. */
export function pickRoute(routes, dest) {
  const d = ip2n(dest); let best = null;
  for (const x of routes) {
    const p = x.kind === 'default' ? 0 : x.p; const net = x.kind === 'default' ? 0 : ip2n(x.net);
    if (((d & maskN(p)) >>> 0) !== net) continue;
    if (!best || p > best.p || (p === best.p && (x.metric || 0) < (best.x.metric || 0))) best = { p, x };
  }
  return best?.x ?? null;
}
const where = (x) => (!x ? 'Nenhuma rota se aplica: o pacote é descartado (Network is unreachable)' : x.kind === 'conn' ? `Diretamente pela interface ${x.dev} (destino na rede local, sem gateway)` : `Pelo gateway ${x.gw}, interface ${x.dev}`);
export function topology(r) {
  const b1 = `10.${r.int(0, 9)}.${r.int(0, 254)}`; const b2 = `192.168.${r.int(0, 254)}`;
  const if1 = r.pick(['enp0s3', 'eth0', 'ens33', 'eno1']); const if2 = r.pick(['enp0s8', 'eth1', 'ens34', 'eno2']);
  const gw1 = `${b1}.${r.pick([1, 2, 254])}`; const gw2 = `${b2}.${r.pick([1, 254])}`;
  const sec = r.int(16, 31); const big = `172.${sec}.0.0`; const mid = `172.${sec}.${r.int(1, 254)}.0`;
  const metricDef = r.pick([100, 100, 600]);
  const routes = [
    { kind: 'default', gw: gw1, dev: if1, proto: r.pick(['dhcp', 'static']), metric: metricDef },
    { kind: 'conn', net: `${b1}.0`, p: 24, dev: if1, src: `${b1}.${r.int(10, 200)}`, metric: metricDef },
    { kind: 'conn', net: `${b2}.0`, p: 24, dev: if2, src: `${b2}.${r.int(10, 200)}`, metric: r.pick([0, 0, 101]) },
    { kind: 'static', net: big, p: 16, gw: gw2, dev: if2 },
    { kind: 'static', net: mid, p: 24, gw: gw1, dev: if1 },
  ];
  routes.find((x) => x.kind === 'conn' && x.dev === if2).metric = routes.find((x) => x.kind === 'conn' && x.dev === if2).metric || 0;
  return { routes, b1, b2, if1, if2, gw1, gw2, big, mid };
}

// ---------- ss / netstat ----------
function ssDesc(fl) {
  const proto = fl.has('t') && fl.has('u') ? 'sockets TCP e UDP' : fl.has('t') ? 'sockets TCP' : 'sockets UDP';
  const st = fl.has('l') ? 'apenas os que estão **em escuta** (LISTEN/UNCONN)' : fl.has('a') ? 'de **todos os estados** (em escuta e conectados)' : 'apenas os **já conectados** (estabelecidos) — os que só estão escutando não aparecem';
  return `Lista ${proto}, ${st}, ${fl.has('n') ? 'com endereços e portas **numéricos** (sem resolver nomes)' : 'resolvendo nomes de portas/hosts'}${fl.has('p') ? ', mostrando o **processo** (PID/programa) de cada socket' : ', sem mostrar o processo'}`;
}

export const generators = [
  {
    id: 'ip-cmd', obj: '109.3', nivel: 2, peso: 3,
    make(rng) {
      const { T, p } = ipTasks(rng); const t = rng.pick(T);
      const fwd = rng.chance(0.65);
      if (fwd) {
        const wrongs = rng.shuffle(t.wrong).slice(0, 3);
        // pelo menos um erro "de sintaxe inválida" e, se houver, um "válido porém diferente" para variar a dificuldade
        const options = [{ t: c(t.cmd), ok: true }, ...wrongs.map((w) => ({ t: c(w.c), ok: false }))];
        const note = Object.fromEntries(wrongs.map((w) => [w.c, w.n]));
        return {
          type: 'unica', text: `Qual comando do pacote iproute2 realiza a tarefa abaixo?\n\n${t.desc}.`, options,
          explanation: `${c(t.cmd)}. Sintaxe geral: ip [opções] OBJETO COMANDO (ip addr, ip link, ip route, ip neigh…). Sobre as alternativas: ${wrongs.map((w) => `${c(w.c)} → ${note[w.c]}`).join('; ')}.`,
          ref: ['102:p.453-458', '102:p.464'],
          verify: ipVerify([{ c: t.cmd }, ...wrongs], p.dev),
        };
      }
      const others = T.filter((x) => x.id !== t.id && !((t.id === 'addr-add' && x.id === 'label') || (t.id === 'label' && x.id === 'addr-add') || (t.id === 'addr-add' && x.id === 'addr6') || (t.id === 'addr6' && x.id === 'addr-add') || (t.id === 'link-up' && x.id === 'mtu') || (t.id === 'route-show' && x.id === 'route-get') || (t.id === 'addr-del' && x.id === 'flush') || (t.id === 'flush' && x.id === 'addr-del')));
      return {
        type: 'unica', text: `O que faz o comando abaixo?\n\n\`\`\`\n${t.cmd}\n\`\`\``,
        options: mcq(rng, t.desc.replace(/\*\*/g, ''), nearDescs(rng, t, others)),
        explanation: `${c(t.cmd)} → ${t.desc.replace(/\*\*/g, '')}. Sintaxe geral: ip [opções] OBJETO COMANDO. As alterações feitas assim valem só até o reinício; para persistir, usa-se a configuração da distribuição (por exemplo, /etc/network/interfaces ou o NetworkManager).`,
        ref: ['102:p.453-458', '102:p.464'],
        verify: ipVerify([{ c: t.cmd }], p.dev),
      };
    },
  },
  {
    id: 'net-tools-equiv', obj: '109.3', nivel: 2, peso: 3,
    make(rng) {
      const P = pairs(rng); const t = rng.pick(P);
      const kind = rng.pick(['l2m', 'l2m', 'l2m', 'm2l', 'multi']);
      const isIpSs = (s) => /^(ip|ss) /.test(s);
      // o comando moderno correto (ip/ss) deve ser aceito pelo programa real: consultas retornam 0; alterações chegam ao kernel e falham só por falta de permissão
      const verifyOne = (cmd, dev) => (isIpSs(cmd) ? { sh: `p() { r=$(bash -c "$1" 2>&1 >/dev/null </dev/null); rc=$?; case "$r" in *"Operation not permitted"*) printf P;; *) if [ $rc -eq 0 ]; then printf P; else printf F; fi;; esac; }\np ${shq(cmd.split(dev).join('eth0'))}\necho`, expect: 'P' } : undefined);
      if (kind === 'l2m') {
        const near = rng.shuffle(t.tr).slice(0, 2); const far = rng.shuffle(P.filter((x) => x.m !== t.m).map((x) => x.m));
        const pool = [...new Set([...near, ...far])].filter((x) => x !== t.m).slice(0, 3);
        const options = [{ t: c(t.m), ok: true }, ...pool.map((x) => ({ t: c(x), ok: false }))];
        return {
          type: 'unica', text: `Qual comando do iproute2 (ou equivalente moderno) substitui o comando legado ${c(t.l)}?`, options,
          explanation: `${c(t.l)} (net-tools, legado) ≈ ${c(t.m)}. ${NT_EXPL}`, ref: ['102:p.453-458', '102:p.464'],
          verify: verifyOne(t.m, t.dev),
        };
      }
      if (kind === 'm2l') {
        const uniq = P.filter((x) => P.filter((y) => y.m === x.m).length === 1);
        const u = rng.pick(uniq);
        const sameTool = rng.shuffle(P.filter((x) => x.m !== u.m && x.l.split(' ')[0] === u.l.split(' ')[0]).map((x) => x.l)); const otherTool = rng.shuffle(P.filter((x) => x.m !== u.m && x.l.split(' ')[0] !== u.l.split(' ')[0]).map((x) => x.l));
        const pool = [...new Set([...sameTool.slice(0, 2), ...otherTool])].filter((x) => x !== u.l).slice(0, 3);
        return {
          type: 'unica', text: `Qual comando legado do net-tools corresponde ao comando moderno ${c(u.m)}?`, options: [{ t: c(u.l), ok: true }, ...pool.map((x) => ({ t: c(x), ok: false }))],
          explanation: `${c(u.m)} ≈ ${c(u.l)}. ${NT_EXPL}`, ref: ['102:p.453-458', '102:p.464'],
        };
      }
      const good = rng.sample(['route', 'route -n', 'netstat -r', 'netstat -rn'], rng.int(2, 3));
      const bad = rng.sample(['arp -n', 'ifconfig -a', 'netstat -i', 'netstat -tulpn', `route add default gw ${params(rng).G}`, 'netstat -s'], 5 - good.length);
      return {
        type: 'multipla', text: 'Marque **todos** os comandos legados (net-tools) que exibem a tabela de roteamento — o equivalente de `ip route`.', options: multi(rng, good.map((x) => c(x)), bad.map((x) => c(x)), 5 - good.length),
        explanation: `A tabela de rotas pode ser vista com ${c('route')}, ${c('route -n')} (numérico), ${c('netstat -r')} e ${c('netstat -rn')}, todos substituídos por ${c('ip route')}. ${c('arp -n')} mostra o cache ARP (ip neigh), ${c('ifconfig -a')} lista interfaces (ip link/ip addr), ${c('netstat -i')} mostra estatísticas das interfaces, ${c('netstat -tulpn')} mostra sockets (ss -tulpn) e ${c('route add default gw …')} altera a rota padrão em vez de exibir a tabela.`, ref: ['102:p.455-456'],
      };
    },
  },
  {
    id: 'route-lookup', obj: '109.3', nivel: 3, peso: 3,
    make(rng) {
      const tp = topology(rng); const { routes } = tp;
      const style = rng.pick(['ip', 'ip', 'route']);
      const sc = rng.pick(['lpm', 'lpm', 'big', 'default', 'connected', 'metric', 'unreach']);
      let rt = routes.slice(); let dest;
      const mid = ip2n(tp.mid); const big = ip2n(tp.big);
      if (sc === 'lpm') dest = n2ip(mid + rng.int(1, 254));
      else if (sc === 'big') { do dest = n2ip(big + rng.int(256 * 2, 65534)); while (((ip2n(dest) & 0xffffff00) >>> 0) === mid); }
      else if (sc === 'default') dest = `${rng.pick([8, 45, 93, 151, 200])}.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`;
      else if (sc === 'connected') dest = `${tp.b2}.${rng.int(2, 253)}`;
      else if (sc === 'metric') {
        rt = [...routes, { kind: 'default', gw: tp.gw2, dev: tp.if2, proto: 'static', metric: (routes[0].metric || 100) + rng.pick([100, 500]) }];
        dest = `${rng.pick([8, 45, 93, 151, 200])}.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`;
      } else { rt = routes.filter((x) => x.kind !== 'default'); dest = `${rng.pick([8, 45, 93, 151, 200])}.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`; }
      const chosen = pickRoute(rt, dest);
      const correct = where(chosen);
      const cand = new Set([where(null)]);
      for (const x of rt) cand.add(where(x));
      cand.add(where({ kind: 'conn', dev: tp.if1 })); cand.add(where({ kind: 'conn', dev: tp.if2 }));
      cand.add(`Pelo gateway ${tp.gw1}, interface ${tp.if2}`); cand.add(`Pelo gateway ${tp.gw2}, interface ${tp.if1}`);
      const options = mcq(rng, correct, [...cand].filter((x) => x !== correct));
      const shown = rt.slice().sort((a, b) => (a.kind === 'default' ? 0 : ip2n(a.net)) - (b.kind === 'default' ? 0 : ip2n(b.net)) || (a.kind === 'default' ? 0 : a.p) - (b.kind === 'default' ? 0 : b.p) || (a.metric || 0) - (b.metric || 0));
      const vsh = py(`import ipaddress as I\nR = ${JSON.stringify(rt.map((q) => ({ n: q.kind === 'default' ? '0.0.0.0/0' : `${q.net}/${q.p}`, m: q.metric || 0, k: q.kind, g: q.gw || '', d: q.dev })))}\nd = I.ip_address('${dest}')\nc = [q for q in R if d in I.ip_network(q['n'])]\nif not c:\n    print('none')\nelse:\n    b = sorted(c, key=lambda q: (-I.ip_network(q['n']).prefixlen, q['m']))[0]\n    print(' '.join(v for v in (b['k'], b['g'], b['d']) if v))`);
      const vexp = chosen ? [chosen.kind, chosen.gw, chosen.dev].filter(Boolean).join(' ') : 'none';
      return {
        type: 'unica',
        text: `A tabela de roteamento de um host Linux (saída de ${c(style === 'ip' ? 'ip route' : 'route -n')}) é:\n\n\`\`\`\n${routeLines(shown, style)}\n\`\`\`\n\nPara qual saída o kernel encaminha um pacote destinado a **${dest}**?`,
        options,
        explanation: `O kernel escolhe a rota **mais específica** (maior prefixo / "longest prefix match") que contenha o destino; se houver empate de prefixo, vence a de **menor métrica**; a rota padrão (default / 0.0.0.0/0) só é usada quando nada mais combina; sem nenhuma rota aplicável, o pacote é descartado (Network is unreachable). Aqui: ${chosen ? (chosen.kind === 'default' ? `nenhuma rota mais específica contém ${dest}, então vale a rota padrão${sc === 'metric' ? ' de menor métrica (há duas rotas padrão)' : ''}` : chosen.kind === 'conn' ? `${dest} está na rede ${chosen.net}/${chosen.p}, conectada diretamente a ${chosen.dev}` : `a rota ${chosen.net}/${chosen.p} contém ${dest} e é a de maior prefixo`) : `${dest} não está em nenhuma rota e não existe rota padrão`}. Resposta: ${correct}.`,
        ref: ['102:p.452', '102:p.455-457'],
        verify: { sh: vsh, expect: vexp },
      };
    },
  },
  {
    id: 'ip-route-fields', obj: '109.3', nivel: 2, peso: 2,
    make(rng) {
      const tp = topology(rng); const kind = rng.pick(['default', 'conn', 'static', 'flags']);
      const dhcp = rng.chance(0.6);
      const dfl = { kind: 'default', gw: tp.gw1, dev: tp.if1, proto: dhcp ? 'dhcp' : 'static', metric: rng.pick([100, 600, 202]) };
      const conn = tp.routes[2]; const stat = tp.routes[3];
      const MEAN = {
        'proto dhcp': 'A rota foi adicionada pelo cliente DHCP',
        'proto static': 'A rota foi adicionada manualmente (configuração estática)',
        'proto kernel': 'A rota foi criada automaticamente pelo kernel ao configurar o endereço da interface',
        'scope link': 'O destino é alcançável diretamente no enlace local, sem passar por um gateway',
        via: 'Endereço do gateway (próximo salto) para onde os pacotes são enviados',
        dev: 'Interface de rede pela qual os pacotes saem',
        src: 'Endereço IP de origem preferencial usado nos pacotes enviados por essa rota',
        metric: 'Custo da rota, usado para desempatar rotas de mesmo prefixo (a de menor valor é preferida)',
      };
      const ask = (line, tok) => {
        const ok = MEAN[tok]; const pool = Object.entries(MEAN).filter(([k]) => k !== tok).map(([, v]) => v);
        return { type: 'unica', text: `Em uma linha da saída de \`ip route\`:\n\n\`\`\`\n${line}\n\`\`\`\n\nO que indica o trecho ${c(tok)}?`, options: mcq(rng, ok, pool), explanation: `${tok}: ${ok}. Formato da linha de ip route: destino, gateway (via), interface (dev), protocolo que criou a rota (proto), escopo (scope), endereço de origem (src) e métrica (metric). Sem scope, o escopo é global; uma rota sem via é de rede diretamente conectada.`, ref: ['102:p.456-457'] };
      };
      if (kind === 'default') {
        const line = `default via ${dfl.gw} dev ${dfl.dev} proto ${dfl.proto} metric ${dfl.metric}`;
        const tok = rng.pick([`proto ${dfl.proto}`, 'via', 'dev', 'metric']);
        return ask(line, tok);
      }
      if (kind === 'conn') {
        const line = `${conn.net}/${conn.p} dev ${conn.dev} proto kernel scope link src ${conn.src}${conn.metric ? ` metric ${conn.metric}` : ''}`;
        return ask(line, rng.pick(['proto kernel', 'scope link', 'src', 'dev']));
      }
      if (kind === 'static') {
        const line = `${stat.net}/${stat.p} via ${stat.gw} dev ${stat.dev}`;
        const gws = [stat.gw, stat.net, conn.src, tp.gw1].filter((x, i, a) => a.indexOf(x) === i);
        return {
          type: 'unica', text: `Em uma linha da saída de \`ip route\`:\n\n\`\`\`\n${line}\n\`\`\`\n\nQual é o endereço do **gateway** dessa rota e por qual interface ela sai?`,
          options: mcq(rng, `Gateway ${stat.gw}, interface ${stat.dev}`, [`Gateway ${stat.net}, interface ${stat.dev}`, `Gateway ${stat.gw}, interface ${tp.if1 === stat.dev ? tp.if2 : tp.if1}`, `Gateway ${stat.net}, interface ${tp.if1 === stat.dev ? tp.if2 : tp.if1}`, `Sem gateway: o destino é diretamente conectado, saindo por ${stat.dev}`]),
          explanation: `Depois de "via" vem o endereço do gateway (${stat.gw}) e depois de "dev" a interface de saída (${stat.dev}). O primeiro campo, ${stat.net}/${stat.p}, é o **destino** da rota (a rede alcançada). Uma rota sem "via" seria de rede diretamente conectada.`, ref: ['102:p.456-457'],
        };
      }
      // flags de route -n
      const key = rng.pick(['U', 'UG', 'UGH']);
      const rowOf = (d, g, m, f, met, ifc) => `${fmtN(d, 15)} ${fmtN(g, 15)} ${fmtN(m, 15)} ${fmtN(f, 5)} ${fmtN(met, 6)} ${fmtN(0, 6)} ${'0'.padStart(3)} ${ifc}`;
      const row = key === 'U' ? rowOf(conn.net, '0.0.0.0', maskStr(24), 'U', conn.metric || 0, conn.dev) : key === 'UG' ? rowOf('0.0.0.0', dfl.gw, '0.0.0.0', 'UG', dfl.metric, dfl.dev) : rowOf(`${tp.b2}.50`, tp.gw2, '255.255.255.255', 'UGH', 0, tp.if2);
      const kk = key;
      const ok = key === 'U' ? 'Rota ativa (Up) para uma rede diretamente conectada, sem gateway' : key === 'UG' ? 'Rota ativa (Up) que usa um gateway (G)' : 'Rota ativa (Up) para um host específico (H) por meio de um gateway (G)';
      const pool = ['Rota ativa (Up) para uma rede diretamente conectada, sem gateway', 'Rota ativa (Up) que usa um gateway (G)', 'Rota ativa (Up) para um host específico (H) por meio de um gateway (G)', 'Rota rejeitada (reject): os pacotes são descartados', 'Rota desativada (Down) com gateway', 'Rota para o endereço de broadcast da rede'].filter((x) => x !== ok);
      return {
        type: 'unica', text: `Na saída de \`route -n\`, a linha abaixo tem a coluna Flags igual a **${kk}**. O que isso significa?\n\n\`\`\`\nDestination     Gateway         Genmask         Flags Metric Ref    Use Iface\n${row}\n\`\`\``,
        options: mcq(rng, ok, pool),
        explanation: `Flags de route: U = rota ativa (up); G = usa um gateway; H = rota para um host (e não para uma rede); ! = rota rejeitada. ${kk}: ${ok}. As colunas Metric e Ref não são usadas pelo kernel Linux para o roteamento comum; "Use" mostra o número de consultas à rota.`, ref: ['102:p.455-456'],
      };
    },
  },
  {
    id: 'ss-netstat-flags', obj: '109.3', nivel: 2, peso: 3,
    make(rng) {
      const protos = rng.pick([['t'], ['u'], ['t', 'u'], ['t', 'u'], ['t']]); const st = rng.pick([null, 'l', 'l', 'l', 'a']);
      const fl = new Set([...protos, ...(st ? [st] : []), ...(rng.chance(0.75) ? ['n'] : []), ...(rng.chance(0.55) ? ['p'] : [])]);
      const sig = (s) => { const l = s.has('t') && (s.has('l') || s.has('a')) ? 1 : 0; const u = s.has('u') && (s.has('l') || s.has('a')) ? 1 : 0; const e = s.has('t') && !s.has('l') ? 1 : 0; return `L=${l} U=${u} E=${e} P=${s.has('p') && (l || u || e) ? 1 : 0}`; };
      const vsh = (cmd) => py(`import socket, subprocess\nt = socket.socket(); t.bind(('127.0.0.1', 0)); t.listen()\nlp = t.getsockname()[1]\nc = socket.create_connection(('127.0.0.1', lp)); a, _ = t.accept()\nu = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); u.bind(('127.0.0.1', 0)); up = u.getsockname()[1]\nout = subprocess.run(${JSON.stringify(cmd.split(' '))}, capture_output=True, text=True).stdout\nL = any('LISTEN' in l and ':%d' % lp in l for l in out.splitlines())\nU = any(':%d' % up in l for l in out.splitlines())\nE = 'ESTAB' in out\nP = 'users:' in out\nprint('L=%d U=%d E=%d P=%d' % (L, U, E, P))`);
      const mk = (s) => `ss -${rng.shuffle([...s]).join('')}`;
      const variants = [];
      const tog = (f) => { const s = new Set(fl); if (s.has(f)) s.delete(f); else s.add(f); return s; };
      variants.push(tog('n'), tog('p'));
      variants.push(fl.has('l') ? (() => { const s = new Set(fl); s.delete('l'); s.add('a'); return s; })() : (() => { const s = new Set(fl); s.delete('a'); s.add('l'); return s; })());
      variants.push(fl.has('t') && fl.has('u') ? (() => { const s = new Set(fl); s.delete('u'); return s; })() : (() => { const s = new Set(fl); s.delete('t'); s.delete('u'); s.add(fl.has('t') ? 'u' : 't'); return s; })());
      if (!st) variants.push((() => { const s = new Set(fl); s.add('l'); return s; })(), (() => { const s = new Set(fl); s.add('a'); return s; })());
      const key = (s) => [...s].sort().join('');
      const vs = variants.filter((s) => (s.has('t') || s.has('u')) && key(s) !== key(fl));
      const dedup = [...new Map(vs.map((s) => [key(s), s])).values()];
      const NOTE = 'Opções: -t TCP, -u UDP, -l apenas sockets em escuta, -a todos os sockets, -n numérico (sem resolver nomes), -p mostra o processo. Sem -l nem -a, o ss mostra só as conexões já estabelecidas (os sockets que apenas escutam não aparecem). O netstat aceita as mesmas letras (netstat -tulpn).';
      if (rng.chance(0.55)) { // comando -> descrição
        const cmd = mk(fl);
        return {
          type: 'unica', text: `O que faz o comando abaixo?\n\n\`\`\`\n${cmd}\n\`\`\``, options: mcq(rng, ssDesc(fl), dedup.map(ssDesc)),
          explanation: `${cmd}: ${ssDesc(fl).replace(/\*\*/g, '')}. ${NOTE}`, ref: ['102:p.472-473'], verify: { sh: vsh(cmd), expect: sig(fl) },
        };
      }
      const correct = mk(fl); const wrong = dedup.map(mk);
      return {
        type: 'unica', text: `Qual comando abaixo faz o seguinte?\n\n${ssDesc(fl)}.`, options: mcq(rng, c(correct), wrong.map((x) => c(x))),
        explanation: `${c(correct)}: ${ssDesc(fl).replace(/\*\*/g, '')}. ${NOTE}`, ref: ['102:p.472-473'], verify: { sh: vsh(correct), expect: sig(fl) },
      };
    },
  },
  {
    id: 'net-troubleshoot', obj: '109.3', nivel: 3, peso: 3,
    make(rng) {
      const p = params(rng); const { dev, A, G, CIDR } = p; const host = rng.pick(['www.example.com', 'git.example.org', 'api.example.net']); const srv = `10.${rng.int(0, 9)}.${rng.int(0, 254)}.${rng.int(2, 250)}`; const port = rng.pick([22, 80, 443, 3306, 8080]);
      const net2 = (() => { const q = G.split('.'); return `${q[0]}.${q[1]}.${(Number(q[2]) + 1) % 256}.1`; })();
      const S = [
        { id: 'down', cause: `A interface ${dev} está desativada (DOWN): ativá-la com ${c(`ip link set ${dev} up`)}`,
          out: `$ ip link show ${dev}\n2: ${dev}: <BROADCAST,MULTICAST> mtu 1500 qdisc fq_codel state DOWN mode DEFAULT group default qlen 1000\n$ ping -c 1 ${G}\nping: connect: Network is unreachable` },
        { id: 'nodef', cause: `Falta a rota padrão (default): adicioná-la com ${c(`ip route add default via ${G}`)}`,
          out: `$ ip route\n${n2ip(calc(A, p.pfx).net)}/${p.pfx} dev ${dev} proto kernel scope link src ${A}\n$ ping -c 1 ${G}\n64 bytes from ${G}: icmp_seq=1 ttl=64 time=0.42 ms\n$ ping -c 1 8.8.8.8\nping: connect: Network is unreachable` },
        { id: 'arp', cause: `O gateway ${G} não responde na camada 2 (ARP falha): verificar cabo, switch, VLAN ou se o gateway está ligado`,
          out: `$ ping -c 2 ${G}\nFrom ${A} icmp_seq=1 Destination Host Unreachable\nFrom ${A} icmp_seq=2 Destination Host Unreachable\n$ ip neigh show dev ${dev}\n${G} FAILED` },
        { id: 'dns', cause: `Falha na resolução de nomes: corrigir o ${c('nameserver')} do ${c('/etc/resolv.conf')} (e conferir a linha hosts: do /etc/nsswitch.conf)`,
          out: `$ ping -c 1 8.8.8.8\n64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=11.2 ms\n$ ping -c 1 ${host}\nping: ${host}: Temporary failure in name resolution` },
        { id: 'nx', cause: `O nome foi digitado errado ou não existe no DNS (NXDOMAIN): conferir a grafia; a rede e o DNS estão funcionando`,
          out: `$ ping -c 1 8.8.8.8\n64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=11.2 ms\n$ ping -c 1 w${host}\nping: w${host}: Name or service not known\n$ dig +short ${host}\n93.184.216.34` },
        { id: 'refused', cause: `O host está acessível, mas nenhum serviço escuta na porta ${port}: iniciar o serviço e conferir com ${c(`ss -tlnp | grep :${port}`)} no servidor`,
          out: `$ ping -c 1 ${srv}\n64 bytes from ${srv}: icmp_seq=1 ttl=64 time=0.51 ms\n$ nc -zv ${srv} ${port}\nnc: connect to ${srv} port ${port} (tcp) failed: Connection refused` },
        { id: 'drop', cause: `Um firewall está descartando (DROP) os pacotes para a porta ${port}: ajustar a regra do firewall no servidor ou no caminho`,
          out: `$ ping -c 1 ${srv}\n64 bytes from ${srv}: icmp_seq=1 ttl=64 time=0.51 ms\n$ nc -zv -w 3 ${srv} ${port}\nnc: connect to ${srv} port ${port} (tcp) timed out: Operation now in progress` },
        { id: 'gw', cause: `O gateway ${net2} está fora da sub-rede do host (${CIDR}): usar um gateway dentro da mesma rede, ou corrigir o IP/máscara`,
          out: `$ ip addr show dev ${dev}\n    inet ${CIDR} brd ${n2ip(calc(A, p.pfx).bc)} scope global ${dev}\n$ ip route add default via ${net2}\nError: Nexthop has invalid gateway.` },
        { id: 'hosts', cause: `Há uma entrada antiga em ${c('/etc/hosts')} (a fonte files vem antes do dns em /etc/nsswitch.conf): atualizar ou remover essa linha`,
          out: `$ ping -c 1 ${host.split('.')[0]}\nPING ${host.split('.')[0]} (10.9.9.9) 56(84) bytes of data.\n$ dig +short ${host.split('.')[0]}.example.com\n93.184.216.34\n$ getent hosts ${host.split('.')[0]}\n10.9.9.9         ${host.split('.')[0]}` },
      ];
      const t = rng.pick(S);
      const ask = rng.pick(['Qual é o diagnóstico mais provável e a correção adequada?', 'Qual é a causa mais provável do problema e como corrigi-lo?']);
      return {
        type: 'unica', text: `Um administrador investiga um problema de rede em um host Linux (interface ${c(dev)}, endereço ${c(CIDR)}) e coleta as saídas abaixo.\n\n\`\`\`\n${t.out}\n\`\`\`\n\n${ask}`,
        options: mcq(rng, t.cause, S.filter((x) => x.id !== t.id).map((x) => x.cause)),
        explanation: `${t.cause}. Pistas: "Network is unreachable" = não há rota para o destino (interface DOWN ou falta de rota padrão); "Destination Host Unreachable" vindo do próprio host = falha do ARP na rede local; "Temporary failure in name resolution" = o resolvedor não conseguiu falar com um DNS; "Name or service not known" = o DNS respondeu que o nome não existe; "Connection refused" = o host respondeu e recusou (nada escutando); "timed out" = pacotes descartados no caminho. Roteiro de teste: loopback → IP próprio → gateway → IP remoto → nome.`,
        ref: ['102:p.466-467', '102:p.480'],
      };
    },
  },
  {
    id: 'net-diag-tools', obj: '109.3', nivel: 2, peso: 2,
    make(rng) {
      const p = params(rng); const H = rng.pick(['servidor.example.com', '192.0.2.10', 'srv01.lab.local', 'www.example.org']); const IF = rng.pick(['eth0', 'enp3s5', 'ens33']); const P = rng.int(1025, 9999);
      const port = rng.pick([22, 25, 80, 443, 3306]);
      const T = [
        { d: `Descobrir o **MTU** máximo do caminho (PMTU) até ${c(H)}`, cmd: `tracepath ${H}`, w: [`ping -c 4 ${H}`, `ip route get ${H}`, `traceroute -n ${H}`, `nc -zv ${H} ${port}`], n: 'O tracepath envia datagramas UDP grandes e informa o menor MTU do caminho (linha "Resume: pmtu …"). O traceroute só informa MTUs com --mtu.' },
        { d: `Listar os roteadores (saltos) do caminho até ${c(H)} usando requisições **ICMP echo** em vez de pacotes UDP (exige root)`, cmd: `traceroute -I ${H}`, w: [`traceroute -T ${H}`, `traceroute -i ${IF} ${H}`, `tracepath ${H}`, `ping -c 4 ${H}`], n: 'Por padrão o traceroute envia pacotes UDP (porta 33434); -I usa ICMP echo e -T usa TCP.' },
        { d: `Rastrear o caminho até ${c(H)} usando pacotes **TCP** para a porta ${port} (exige root), útil quando ICMP é bloqueado`, cmd: `traceroute -T -p ${port} ${H}`, w: [`traceroute -I -p ${port} ${H}`, `traceroute -U ${port} ${H}`, `tracepath -p ${port} ${H}`, `nc -zv ${H} ${port}`], n: '-T seleciona o método TCP e -p informa a porta de destino.' },
        { d: `Rastrear o caminho até ${c(H)} forçando o uso da interface ${c(IF)}`, cmd: `traceroute -i ${IF} ${H}`, w: [`traceroute -I ${IF} ${H}`, `traceroute -s ${IF} ${H}`, `traceroute -T ${IF} ${H}`, `tracepath ${IF} ${H}`], n: '-i escolhe a interface de saída; -I (maiúsculo) escolhe o método ICMP.' },
        { d: `Enviar exatamente 4 requisições de eco ICMP para ${c(H)} e encerrar`, cmd: `ping -c 4 ${H}`, w: [`ping -w 4 ${H}`, `ping -t 4 ${H}`, `ping -n 4 ${H}`, `ping -q 4 ${H}`], n: '-c define a quantidade de pacotes; -w define um prazo (deadline) em segundos; -t define o TTL.', verify: { sh: 'ping -c 4 127.0.0.1 | grep -c "bytes from"', expect: '4' } },
        { d: `Abrir um **listener** TCP na porta ${c(String(P))} com o netcat (receber dados enviados por outro host)`, cmd: `nc -l ${P}`, w: [`nc ${P}`, `nc -u -l ${P}`, `nc -z ${P}`, `nc -s ${P}`], n: '-l coloca o nc em modo de escuta; -u usaria UDP em vez de TCP.' },
        { d: `Abrir um listener **UDP** na porta ${c(String(P))} com o netcat`, cmd: `nc -u -l ${P}`, w: [`nc -l ${P}`, `nc -l -t ${P}`, `nc -u ${P}`, `nc -ul`], n: '-u seleciona UDP; sem ele o nc usa TCP.' },
        { d: `Verificar se a porta TCP ${c(String(port))} de ${c(H)} está aberta, sem enviar dados (apenas testar a conexão)`, cmd: `nc -zv ${H} ${port}`, w: [`nc -l ${H} ${port}`, `nc -u ${H} ${port}`, `nc -zl ${H} ${port}`, `nc ${port} ${H}`], n: '-z faz apenas a varredura de portas (sem enviar dados) e -v mostra o resultado.' },
        { d: `Conectar-se manualmente à porta 80 de ${c(H)} para digitar uma requisição HTTP (por exemplo, GET /index.html)`, cmd: `nc ${H} 80`, w: [`nc -l ${H} 80`, `nc -u ${H} 80`, `nc 80 ${H}`, `nc -z ${H} 80`], n: 'Sem -l, o nc é cliente: conecta ao host e à porta informados e repassa o que for digitado.' },
        { d: `Descobrir qual **processo** está escutando na porta TCP ${c(String(port))} deste host (numericamente)`, cmd: `ss -tlnp | grep :${port}`, w: [`ss -tln | grep :${port}`, `ss -s | grep :${port}`, `ip route | grep :${port}`, `ping -c 1 localhost:${port}`], n: '-p mostra o PID/programa dono do socket; sem ele só aparecem endereços e portas.' },
        { d: `Capturar e examinar os pacotes que entram e saem da interface ${c(IF)}`, cmd: `tcpdump -i ${IF}`, w: [`ss -i ${IF}`, `ip -s link show ${IF}`, `traceroute -i ${IF} ${H}`, `ping -I ${IF} ${H}`], n: 'tcpdump (ou wireshark) captura pacotes; ss, ip -s link e ping não mostram o conteúdo do tráfego.' },
      ];
      const t = rng.pick(T);
      return {
        type: 'unica', text: `Qual comando realiza a tarefa abaixo?\n\n${t.d}.`, options: mcq(rng, c(t.cmd), t.w.map((x) => c(x))),
        explanation: `${c(t.cmd)}. ${t.n} Resumo: ping/ping6 (ICMP echo), traceroute/traceroute6 (caminho; UDP por padrão, -I ICMP, -T TCP), tracepath/tracepath6 (caminho e MTU), nc (conexões TCP/UDP arbitrárias), ss/netstat (sockets).`,
        ref: ['102:p.466-473'], ...(t.verify ? { verify: t.verify } : {}),
      };
    },
  },
];
