// 109.1 (parte 2) — portas e serviços, TCP/UDP/ICMP, IPv4 x IPv6, abreviação e tipos de endereço IPv6.
import { mcq, multi, code as c, block as blk } from './util.mjs';
import { py } from './network.mjs';
const hex4 = (n) => n.toString(16).padStart(4, '0');

// ---------- portas e serviços (lista oficial do objetivo 109.1) ----------
const SVC = [
  { port: 20, name: 'FTP (canal de dados)', grp: 'ftp', tr: 'TCP' },
  { port: 21, name: 'FTP (canal de controle)', grp: 'ftp', tr: 'TCP' },
  { port: 22, name: 'SSH', grp: 'rem', tr: 'TCP' },
  { port: 23, name: 'Telnet', grp: 'rem', tr: 'TCP' },
  { port: 25, name: 'SMTP (enviar e-mail)', grp: 'mail', tr: 'TCP' },
  { port: 53, name: 'DNS', grp: 'inf', tr: 'TCP e UDP' },
  { port: 80, name: 'HTTP', grp: 'web', tr: 'TCP' },
  { port: 110, name: 'POP3 (receber e-mail)', grp: 'mail', tr: 'TCP' },
  { port: 123, name: 'NTP (sincronização de horário)', grp: 'inf', tr: 'UDP' },
  { port: 139, name: 'NetBIOS (sessão)', grp: 'ms', tr: 'TCP' },
  { port: 143, name: 'IMAP (acessar e-mail no servidor)', grp: 'mail', tr: 'TCP' },
  { port: 161, name: 'SNMP (gerência de rede)', grp: 'inf', tr: 'UDP' },
  { port: 162, name: 'SNMPTRAP (notificações SNMP)', grp: 'inf', tr: 'UDP' },
  { port: 389, name: 'LDAP', grp: 'dir', tr: 'TCP' },
  { port: 443, name: 'HTTPS', grp: 'web', tr: 'TCP' },
  { port: 465, name: 'SMTPS (SMTP seguro)', grp: 'mail', tr: 'TCP' },
  { port: 514, name: 'RSH (shell remoto)', grp: 'rem', tr: 'TCP' },
  { port: 636, name: 'LDAPS (LDAP seguro)', grp: 'dir', tr: 'TCP' },
  { port: 993, name: 'IMAPS (IMAP seguro)', grp: 'mail', tr: 'TCP' },
  { port: 995, name: 'POP3S (POP3 seguro)', grp: 'mail', tr: 'TCP' },
];
const SECURE = [[80, 443], [25, 465], [110, 995], [143, 993], [389, 636], [23, 22]];
const byPort = (p) => SVC.find((s) => s.port === p);
const base = (s) => s.name.replace(/ \(.*\)$/, '');
/** Serviços do mesmo grupo primeiro (distratores mais plausíveis), depois os demais. */
function near(rng, svc) {
  return [...rng.shuffle(SVC.filter((x) => x.grp === svc.grp && x !== svc)), ...rng.shuffle(SVC.filter((x) => x.grp !== svc.grp))];
}
const GRP_NOTE = {
  ftp: 'O FTP usa duas portas: 21 (controle) e 20 (dados).',
  rem: 'Acesso remoto: 22 SSH (criptografado), 23 Telnet (texto puro) e 514 RSH (shell remoto).',
  mail: 'E-mail: 25 SMTP (enviar), 110 POP3 (receber) e 143 IMAP (acessar no servidor); versões seguras: 465 SMTPS, 995 POP3S e 993 IMAPS.',
  web: 'Web: 80 HTTP e 443 HTTPS.',
  inf: 'Infraestrutura: 53 DNS, 123 NTP, 161 SNMP e 162 SNMPTRAP (notificações SNMP).',
  ms: 'A 139 é o NetBIOS (serviço de sessão usado por Windows/Samba).',
  dir: 'Diretório: 389 LDAP e 636 LDAPS (LDAP seguro).',
};
const note = (svc) => `${GRP_NOTE[svc.grp]} A tabela de portas padrão de um Linux fica em /etc/services.`;
const ALL_NOTE = 'Tabela do LPI: 20/21 FTP, 22 SSH, 23 Telnet, 25 SMTP, 53 DNS, 80 HTTP, 110 POP3, 123 NTP, 139 NetBIOS, 143 IMAP, 161 SNMP, 162 SNMPTRAP, 389 LDAP, 443 HTTPS, 465 SMTPS, 514 RSH, 636 LDAPS, 993 IMAPS, 995 POP3S.';

// ---------- fatos: TCP/UDP/ICMP, portas e IPv4 x IPv6 ----------
const FACTS_TRANSPORT = [
  { t: 'O TCP garante a entrega dos pacotes, verificando integridade e ordem e retransmitindo o que se perdeu.', f: ['O UDP garante a entrega dos pacotes na ordem correta, retransmitindo os que se perdem.', 'O ICMP retransmite automaticamente os pacotes que se perderam na rede.'] },
  { t: 'O TCP é um protocolo de transporte orientado a conexões.', f: ['O TCP é um protocolo da camada de rede que não usa números de porta.', 'O TCP é um protocolo sem conexão: cada pacote é enviado de forma independente, sem confirmação.'] },
  { t: 'Serviços como SSH, SMTP, HTTP e FTP usam o TCP por padrão.', f: ['O NTP (123) e o SNMP (161) usam o TCP por padrão.', 'O ping e o traceroute usam o TCP na porta 7.'] },
  { t: 'No UDP, a verificação de perdas e de ordem dos pacotes fica a cargo da aplicação, se ela precisar disso.', f: ['O UDP detecta e retransmite sozinho os datagramas perdidos.', 'No UDP, a aplicação não pode implementar nenhum controle: a ordem é sempre garantida pelo protocolo.'] },
  { t: 'Por ter menos controle que o TCP, o UDP oferece melhor desempenho no fluxo de dados.', f: ['Por ter mais controles de erro, o UDP é sempre mais lento que o TCP e por isso não é usado na prática.', 'O UDP usa um handshake de três vias para garantir a ordem dos pacotes.'] },
  { t: 'O NTP (123) e o SNMP (161) usam o UDP por padrão.', f: ['O SSH (22) e o Telnet (23) usam o UDP por padrão.', 'O HTTPS (443) usa o ICMP por padrão.'] },
  { t: 'O ICMP é um protocolo da camada de rede usado para mensagens de controle e diagnóstico, como as do ping.', f: ['O ICMP é um protocolo da camada de transporte usado para entregar páginas web.', 'O ICMP usa a porta TCP 80 para transportar os dados dos aplicativos.'] },
  { t: 'O ping envia mensagens ICMP de requisição de eco (echo request) e espera respostas de eco (echo reply).', f: ['O ping envia segmentos TCP SYN para a porta 22 do destino.', 'O ping envia datagramas UDP para a porta 33434 do destino.'] },
  { t: 'O ICMP serve, entre outras coisas, para sinalizar destino inacessível, TTL excedido e redirecionamento de rota.', f: ['O ICMP serve para criptografar o tráfego entre dois hosts.', 'O ICMP serve para atribuir endereços IP aos hosts da rede (DHCP).'] },
  { t: 'O traceroute depende das mensagens ICMP "TTL excedido" devolvidas pelos roteadores do caminho.', f: ['O traceroute depende de respostas do protocolo ARP vindas de cada roteador.', 'O traceroute funciona alterando a máscara de sub-rede de cada pacote enviado.'] },
  { t: 'O campo de porta tem 16 bits; por isso existem 65.535 portas possíveis.', f: ['O campo de porta tem 8 bits; por isso existem 255 portas possíveis.', 'O campo de porta tem 32 bits; por isso existem mais de 4 bilhões de portas possíveis.'] },
  { t: 'Os serviços usam portas de 1 a 1023 (privilegiadas); a origem da conexão costuma usar portas de 1024 a 65535.', f: ['Os serviços usam portas de 1024 a 65535; a origem da conexão usa as portas de 1 a 1023.', 'Cliente e servidor devem sempre usar o mesmo número de porta nos dois lados da conexão.'] },
  { t: 'As portas padrão dos serviços são controladas pela IANA e listadas, em um sistema Linux, no arquivo /etc/services.', f: ['As portas padrão dos serviços são definidas em /etc/hosts e variam de uma distribuição para outra.', 'As portas padrão dos serviços ficam em /etc/resolv.conf, junto com os servidores DNS.'] },
];
const CHAR = { // característica -> protocolo
  TCP: ['é orientado a conexões e garante entrega, integridade e ordem dos pacotes (com retransmissão)', 'faz controle de fluxo e retransmite os pacotes perdidos, de modo que o aplicativo não precisa fazer isso', 'é o protocolo de transporte usado por padrão por SSH, SMTP, HTTP e FTP'],
  UDP: ['não verifica perdas nem ordem dos pacotes, deixando esse controle para a aplicação, e por isso tem melhor desempenho', 'é o protocolo de transporte usado por padrão pelo NTP (123) e pelo SNMP (161)', 'troca menos informações de controle e é preferido por serviços que priorizam velocidade, aceitando alguma perda'],
  ICMP: ['é usado pelo comando ping (requisição e resposta de eco)', 'pertence à camada de rede e é usado para controle e diagnóstico, informando destino inacessível e TTL excedido', 'não usa portas TCP/UDP; suas mensagens servem para analisar e controlar a rede, como o redirecionamento de rotas'],
};
const FACTS_V6 = [
  { t: 'O endereço IPv6 tem 128 bits, escritos em 8 grupos de 16 bits em hexadecimal.', f: ['O endereço IPv6 tem 64 bits, escritos em 4 grupos de 16 bits em hexadecimal.', 'O endereço IPv6 tem 32 bits, escritos como 4 octetos em decimal separados por pontos.'] },
  { t: 'O endereço IPv4 tem 32 bits, escritos como 4 octetos decimais separados por pontos (dotted quad).', f: ['O endereço IPv4 tem 128 bits, escritos em 8 grupos hexadecimais.', 'O endereço IPv4 tem 64 bits, escritos em 4 grupos hexadecimais.'] },
  { t: 'O IPv6 não tem broadcast; o endereço multicast ff02::1 (todos os nós do link) cumpre papel semelhante.', f: ['O IPv6 usa o endereço de broadcast ff:ff:ff:ff:ff:ff como o IPv4.', 'O IPv6 mantém o broadcast, representado pelo último endereço de cada sub-rede /64.'] },
  { t: 'O campo TTL do cabeçalho IPv4 foi substituído, no IPv6, pelo Hop Limit (limite de saltos).', f: ['O campo Hop Limit existe no IPv4; o IPv6 eliminou qualquer limite de saltos.', 'O IPv6 mantém o campo TTL idêntico ao do IPv4, sem nenhuma mudança.'] },
  { t: 'O IPv6 usa o Neighbor Discovery Protocol (NDP) em vez do ARP.', f: ['O IPv6 continua usando o ARP para descobrir o endereço físico dos vizinhos.', 'O IPv4 usa o NDP e o IPv6 usa o ARP.'] },
  { t: 'Toda interface IPv6 possui um endereço link-local, com prefixo fe80::/10.', f: ['O endereço link-local do IPv6 usa o prefixo fc00::/7 e só existe se houver um servidor DHCP.', 'O endereço link-local do IPv6 usa o prefixo ff00::/8 e é compartilhado por todas as interfaces da rede.'] },
  { t: 'Com SLAAC, os hosts IPv6 podem se autoconfigurar sem depender de um servidor DHCP.', f: ['O IPv6 exige obrigatoriamente um servidor DHCP para atribuir qualquer endereço.', 'O SLAAC é um recurso exclusivo do IPv4 para renovar concessões DHCP.'] },
  { t: 'Em um endereço IPv6, a abreviação :: só pode ser usada uma vez.', f: ['Em um endereço IPv6, :: pode aparecer quantas vezes forem necessárias, uma por sequência de zeros.', 'A abreviação :: é obrigatória em todo endereço IPv6 que tenha ao menos um grupo 0000.'] },
  { t: 'Os tipos de endereço IPv6 são unicast, multicast e anycast.', f: ['Os tipos de endereço IPv6 são unicast, multicast e broadcast.', 'O IPv6 só define endereços unicast; multicast e anycast existem apenas no IPv4.'] },
  { t: 'Ao indicar uma porta junto com um endereço IPv6, o endereço deve ficar entre colchetes, como [2001:db8::1]:443.', f: ['Ao indicar uma porta junto com um endereço IPv6, usa-se o formato 2001:db8::1:443, sem colchetes, como no IPv4.', 'O IPv6 não usa portas TCP/UDP; as aplicações são identificadas apenas pelo endereço.'] },
  { t: 'O comando ping6 (ou ping -6) testa a conectividade com um destino IPv6.', f: ['O comando ping6 testa a conectividade com um destino IPv4 por meio de um túnel.', 'O comando ping6 só funciona para o endereço ::1 (loopback).'] },
];

/** Pergunta "qual afirmação está correta" (unica) ou "marque todas" (multipla) a partir de fatos {t, f[]}. */
function factQ(rng, facts, topic, multiple) {
  const idx = rng.shuffle(facts.map((_, i) => i));
  if (!multiple) {
    const f = facts[idx[0]];
    return { type: 'unica', text: `${topic} Qual das afirmações abaixo está **correta**?`, options: mcq(rng, f.t, idx.slice(1, 4).map((i) => rng.pick(facts[i].f)), 4), good: [f] };
  }
  const k = rng.int(2, 3); const good = idx.slice(0, k).map((i) => facts[i]);
  return { type: 'multipla', text: `${topic} Marque **todas** as afirmações corretas.`, options: multi(rng, good.map((x) => x.t), idx.slice(k, 5).map((i) => rng.pick(facts[i].f)), 5 - k), good };
}

// ---------- IPv6 ----------
const h16 = (x) => x.toString(16);
const explodeV6 = (g) => g.map(hex4).join(':');
/** Escreve os 8 grupos colapsando em `::` as sequências indicadas ([início, tamanho]); `fmt` formata cada grupo. */
function buildV6(g, collapse, fmt = h16) {
  const rs = collapse.slice().sort((x, y) => x[0] - y[0]); let out = ''; let i = 0;
  for (const [st, l] of rs) { out += `${g.slice(i, st).map(fmt).join(':')}::`; i = st + l; }
  return out + g.slice(i).map(fmt).join(':');
}
/** 8 grupos com uma sequência de zeros (2–5) e, às vezes, outra estritamente menor (sem empate). runs[0] é a maior. */
function randGroups(rng) {
  const vals = [0x0db8, 0x00a1, 0x0100, 0x1000, 0x000f, 0x0abc, 0x7344, 0x85a3, 0x8a2e, 0x0370, 0x0001, 0x0010, 0x2001, 0x1319, 0x00ff, 0x0a00, 0x0027, 0x02aa];
  const g = Array.from({ length: 8 }, () => (rng.chance(0.55) ? rng.pick(vals) : rng.int(1, 0xffff)));
  const L1 = rng.int(2, 5); const s1 = rng.int(0, 8 - L1); const runs = [[s1, L1]];
  for (let i = 0; i < L1; i++) g[s1 + i] = 0;
  if (rng.chance(0.55)) {
    const L2 = rng.int(1, L1 - 1); const cands = [];
    for (let st = 0; st + L2 <= 8; st++) if (st + L2 < s1 || st > s1 + L1) cands.push(st);
    if (cands.length) { const s2 = rng.pick(cands); for (let i = 0; i < L2; i++) g[s2 + i] = 0; runs.push([s2, L2]); }
  }
  return { g, runs };
}
const shortOf = ({ g, runs }) => buildV6(g, [runs[0]]);
const hx = (rng, n = 4) => Array.from({ length: n }, () => rng.int(1, 0xffff).toString(16));
const V6T = {
  loop: { lab: 'Loopback (::1)', gen: () => '::1', why: '::1 é o endereço de loopback (equivalente ao 127.0.0.1 do IPv4)' },
  unspec: { lab: 'Não especificado (::)', gen: () => '::', why: ':: (todos os bits zero) é o endereço não especificado, usado por um host que ainda não tem endereço' },
  ll: { lab: 'Link-local (fe80::/10)', gen: (r) => `fe80::${hx(r, 4).join(':')}`, why: 'o prefixo fe80::/10 é link-local: válido apenas no enlace local, existe em toda interface IPv6 e não é roteado' },
  ula: { lab: 'ULA, unicast local único (fc00::/7)', gen: (r) => `${r.pick(['fd', 'fc'])}${r.int(0, 255).toString(16).padStart(2, '0')}:${hx(r, 2).join(':')}::${hx(r, 1)[0]}`, why: 'o prefixo fc00::/7 (na prática fd00::/8) é ULA, o equivalente IPv6 dos endereços privados da RFC 1918' },
  mc: { lab: 'Multicast (ff00::/8)', gen: (r) => r.pick(['ff02::1', 'ff02::2', 'ff02::fb', 'ff05::2', 'ff02::1:2', 'ff0e::101', 'ff02::1:ff00:1']), why: 'o prefixo ff00::/8 é multicast: o pacote vai a todas as interfaces do grupo (ff02::1 = todos os nós do link; ff02::2 = todos os roteadores)' },
  gua: { lab: 'Unicast global (2000::/3)', gen: (r) => `${r.pick(['2001:db8', '2804', '2a03', '2606:4700', '2001:4860'])}:${hx(r, 2).join(':')}::${hx(r, 1)[0]}`, why: 'o prefixo 2000::/3 é unicast global: roteável na internet (equivalente aos endereços públicos do IPv4)' },
};

export const generators = [
  {
    id: 'net-ports', obj: '109.1', nivel: 1, peso: 3,
    make(rng) {
      const kind = rng.pick(['p2s', 'p2s', 's2p', 's2p', 'lacuna', 'multi', 'transport', 'secure']);
      const s = rng.pick(SVC);
      const ref = ['102:p.408-409'];
      if (kind === 'p2s') {
        return {
          type: 'unica', text: `Qual serviço usa por padrão a porta **${s.port}**${s.tr === 'UDP' ? ' (UDP)' : s.tr === 'TCP e UDP' ? '' : ' (TCP)'}?`,
          options: mcq(rng, s.name, near(rng, s).map((x) => x.name)),
          explanation: `A porta ${s.port} é a do serviço ${s.name}. ${note(s)}`, ref,
        };
      }
      if (kind === 's2p') {
        return {
          type: 'unica', text: `Qual é a porta padrão do serviço **${s.name}**?`,
          options: mcq(rng, String(s.port), near(rng, s).map((x) => String(x.port))),
          explanation: `${s.name} usa a porta ${s.port}/${s.tr === 'TCP e UDP' ? 'tcp e udp' : s.tr.toLowerCase()}. ${note(s)}`, ref,
        };
      }
      if (kind === 'lacuna') {
        return {
          type: 'lacuna', text: `Informe apenas o número da porta padrão do serviço **${s.name}**.`, answers: [String(s.port)],
          explanation: `${s.name} → porta ${s.port}. ${note(s)}`, ref,
        };
      }
      if (kind === 'secure') {
        const [plain, sec] = rng.pick(SECURE); const ps = byPort(plain); const ss = byPort(sec);
        const q = plain === 23 ? `Qual é a porta do serviço que substitui o **Telnet** com comunicação criptografada (o SSH)?` : `Qual é a porta padrão da versão **segura** do ${base(ps)} (${base(ss)})?`;
        const pool = [plain, ...SVC.map((x) => x.port).filter((x) => x !== sec)];
        return {
          type: 'unica', text: q, options: mcq(rng, String(sec), rng.shuffle(pool).map(String)),
          explanation: plain === 23 ? 'O SSH (22) é o substituto seguro do Telnet (23), que trafega tudo sem criptografia.' : `${base(ps)} usa a porta ${plain} sem criptografia; a versão protegida por TLS, ${base(ss)}, usa a ${sec}. ${note(ss)}`, ref,
        };
      }
      if (kind === 'transport') {
        const pool = SVC.filter((x) => ![20, 139, 162, 389, 514, 636, 465, 993, 995].includes(x.port));
        const t = rng.pick(pool);
        return {
          type: 'unica', text: `Qual protocolo de transporte o serviço **${base(t)}** (porta ${t.port}) usa por padrão?`,
          options: mcq(rng, t.tr, ['TCP', 'UDP', 'TCP e UDP', 'ICMP']),
          explanation: t.tr === 'TCP e UDP' ? 'O DNS usa a porta 53 tanto em UDP (consultas comuns, mais rápidas) quanto em TCP (respostas grandes e transferências de zona).' : `${base(t)} usa ${t.tr} por padrão. Como regra: serviços que exigem confiabilidade (SSH, Telnet, SMTP, HTTP/HTTPS, POP3, IMAP, FTP) usam TCP; NTP e SNMP priorizam leveza e usam UDP. O ICMP não usa portas.`, ref: ['102:p.408-410'],
        };
      }
      // várias associações porta/serviço
      const k = rng.int(2, 3); const picks = rng.sample(SVC, 5);
      const good = picks.slice(0, k).map((x) => `${x.port} — ${x.name}`);
      const bad = picks.slice(k).map((x) => { const other = rng.pick(near(rng, x).filter((y) => y.port !== x.port)); return `${other.port} — ${x.name}`; });
      return {
        type: 'multipla', text: 'Marque **todas** as associações porta/serviço que estão **corretas**.', options: multi(rng, good, bad, 5 - k),
        explanation: `As corretas são ${picks.slice(0, k).map((x) => `${x.port} = ${x.name}`).join('; ')}. As outras trocam o serviço por uma porta de um serviço parecido (por exemplo, 110 é POP3 e 143 é IMAP). ${ALL_NOTE}`, ref,
      };
    },
  },
  {
    id: 'net-proto-facts', obj: '109.1', nivel: 1, peso: 3,
    make(rng) {
      if (rng.chance(0.5)) {
        const proto = rng.pick(['TCP', 'UDP', 'ICMP']); const phrase = rng.pick(CHAR[proto]);
        return {
          type: 'unica', text: `Qual protocolo ${phrase}?`, options: mcq(rng, proto, ['TCP', 'UDP', 'ICMP', 'ARP']),
          explanation: `${proto}: ${CHAR[proto].join('; ')}. TCP e UDP são protocolos de transporte (usam portas); o TCP é confiável e orientado a conexões, o UDP é leve e sem garantias; o ICMP é da camada de rede e serve a mensagens de controle/diagnóstico (ping, traceroute).`, ref: ['102:p.410'],
        };
      }
      const q = factQ(rng, FACTS_TRANSPORT, 'Sobre os protocolos TCP, UDP e ICMP e sobre portas:', rng.chance(0.4));
      return { type: q.type, text: q.text, options: q.options, explanation: `Corretas: ${q.good.map((x) => x.t).join(' ')} As demais alternativas trocam características entre os protocolos ou inventam valores.`, ref: ['102:p.408-410'] };
    },
  },
  {
    id: 'net-v4v6-facts', obj: '109.1', nivel: 2, peso: 2,
    make(rng) {
      const q = factQ(rng, FACTS_V6, 'Sobre as diferenças e características do IPv4 e do IPv6:', rng.chance(0.4));
      return { type: q.type, text: q.text, options: q.options, explanation: `Corretas: ${q.good.map((x) => x.t).join(' ')} As outras alternativas misturam características de IPv4 e IPv6 ou usam valores errados.`, ref: ['102:p.411-413'] };
    },
  },
  {
    id: 'net-ipv6-abbrev', obj: '109.1', nivel: 2, peso: 3,
    make(rng) {
      const G = randGroups(rng); const { g, runs } = G; const full = explodeV6(g); const short = shortOf(G);
      const kind = rng.pick(['compress', 'compress', 'expand', 'count', 'invalid']);
      if (kind === 'compress') {
        const wrong = [
          g.map(h16).join(':'), // só tirou zeros à esquerda: válido, porém mais longo
          buildV6(g, [runs[0]], hex4), // usou :: mas manteve os zeros à esquerda
          short.replace('::', ':'), // :: trocado por um único ":" (faltam grupos)
          short.replace('::', ':0:'),
        ];
        if (runs.length > 1) { wrong.push(buildV6(g, [runs[1]])); wrong.push(buildV6(g, runs)); }
        const tr = g.findIndex((x) => x !== 0 && x % 16 === 0);
        if (tr >= 0) { const g2 = g.slice(); g2[tr] >>= 4; wrong.push(buildV6(g2, [runs[0]])); } // "zero à direita" removido: outro endereço
        const options = mcq(rng, short, [...new Set(wrong)].filter((w) => w !== short));
        const texts = options.map((o) => o.t);
        return {
          type: 'unica', text: `Qual é a forma abreviada **mais curta** (e válida) do endereço IPv6 abaixo?\n\n${blk(full)}`, options,
          explanation: `Duas regras: (1) zeros à esquerda de cada grupo podem ser omitidos (0db8 → db8, mas nunca zeros à direita: 0100 não vira 1); (2) uma única sequência de grupos 0000 consecutivos pode virar \`::\` — escolhe-se a mais longa, e só uma vez no endereço. Resultado: ${c(short)}.`,
          ref: ['102:p.411-412'],
          verify: { sh: py(`import ipaddress as I\na = I.ip_address('${full}')\nbest = None\nfor o in ${JSON.stringify(texts)}:\n    try:\n        x = I.ip_address(o)\n    except ValueError:\n        continue\n    if x == a and (best is None or len(o) < len(best)):\n        best = o\nprint(best)`), expect: short },
        };
      }
      if (kind === 'expand') {
        const [st, l] = runs[0];
        const wrong = [
          g.map((x) => h16(x).padEnd(4, '0')).join(':'), // zeros colocados à direita
          explodeV6([...g.slice(0, st), ...Array(l - 1).fill(0), ...g.slice(st + l)]), // zeros a menos: 7 grupos
          explodeV6([...g.slice(0, st), ...Array(l + 1).fill(0), ...g.slice(st + l)]), // zeros a mais: 9 grupos
          g.map(h16).join(':'), // sem completar os grupos com 4 dígitos
        ];
        const rest = g.filter((_, i) => i < st || i >= st + l); const mid = Math.max(1, Math.ceil(rest.length / 2));
        wrong.push(explodeV6([...rest.slice(0, mid), ...Array(l).fill(0), ...rest.slice(mid)])); // bloco de zeros no lugar errado
        const options = mcq(rng, full, [...new Set(wrong)].filter((w) => w !== full));
        const texts = options.map((o) => o.t);
        return {
          type: 'unica', text: `Qual é a forma **completa** (8 grupos de 4 dígitos hexadecimais, sem nenhuma abreviação) do endereço IPv6 ${c(short)}?`, options,
          explanation: `Cada grupo deve ter 4 dígitos, completados com zeros à **esquerda** (db8 → 0db8), e \`::\` representa quantos grupos 0000 forem necessários para chegar a 8 grupos — aqui ${l} grupo(s) no lugar do \`::\`. Resultado: ${full}.`,
          ref: ['102:p.411-412'],
          verify: { sh: py(`import ipaddress as I\nexp = I.ip_address('${short}').exploded\nprint(*[o for o in ${JSON.stringify(texts)} if o == exp])`), expect: full },
        };
      }
      if (kind === 'count') {
        const l = runs[0][1]; const extra = runs.length > 1 ? runs[1][1] : 0;
        return {
          type: 'lacuna', text: `Em ${c(short)}, o \`::\` substitui quantos grupos de 16 bits (grupos 0000)? Responda com o número.`, answers: [String(l)],
          explanation: `Um endereço IPv6 tem 8 grupos. Em ${short} aparecem ${8 - l} grupos escritos; os ${l} que faltam foram omitidos e valem 0000 (\`::\`). Forma completa: ${full}.`, ref: ['102:p.411-412'],
          verify: { sh: py(`import ipaddress as I\ne = I.ip_address('${short}').exploded.split(':')\nprint(sum(1 for x in e if x == '0000') - ${extra})`), expect: String(l) },
        };
      }
      // endereço inválido
      const vs = [short, shortOf(randGroups(rng)), shortOf(randGroups(rng))];
      const hh = g.map(h16); const toks = short.split(':'); const ti = toks.findIndex((t) => t.length > 0);
      const mk = {
        dois: () => `${hh[0]}::${hh[1]}:${hh[2]}::${hh[3]}`,
        nove: () => [...hh, '1'].join(':'),
        sete: () => hh.slice(0, 7).join(':'),
        cinco: () => toks.map((t, i) => (i === ti ? t.padEnd(5, '0') : t)).join(':'),
        hexa: () => short.replace(/[0-9a-f]/, 'g'),
      };
      const bad = mk[rng.pick(Object.keys(mk))]();
      const pool = [...new Set(vs)].filter((x) => x !== bad);
      const options = mcq(rng, bad, pool);
      const texts = options.map((o) => o.t);
      return {
        type: 'unica', text: 'Qual das opções abaixo **não** é um endereço IPv6 válido?', options,
        explanation: `Um endereço IPv6 tem exatamente 8 grupos de até 4 dígitos hexadecimais (0–9, a–f), e a abreviação \`::\` pode aparecer no máximo uma vez. ${bad} viola essas regras (mais de um ::, grupos a mais ou a menos sem ::, grupo com mais de 4 dígitos ou caractere não hexadecimal).`, ref: ['102:p.411-412'],
        verify: { sh: py(`import ipaddress as I\nfor o in ${JSON.stringify(texts)}:\n    try:\n        I.ip_address(o)\n    except ValueError:\n        print(o)`), expect: bad },
      };
    },
  },
  {
    id: 'net-ipv6-type', obj: '109.1', nivel: 2, peso: 2,
    make(rng) {
      const kind = rng.pick(['classify', 'classify', 'classify', 'prefix', 'allnodes']);
      const PYT = "import ipaddress as I\ndef t(s):\n    a = I.ip_address(s)\n    if a == I.ip_address('::1'): return 'loop'\n    if a == I.ip_address('::'): return 'unspec'\n    if a in I.ip_network('fe80::/10'): return 'll'\n    if a in I.ip_network('fc00::/7'): return 'ula'\n    if a in I.ip_network('ff00::/8'): return 'mc'\n    if a in I.ip_network('2000::/3'): return 'gua'\n    return '?'\n";
      if (kind === 'classify') {
        const id = rng.pick(['loop', 'll', 'll', 'ula', 'mc', 'gua', 'gua', 'unspec']); const addr = V6T[id].gen(rng);
        return {
          type: 'unica', text: `Que tipo de endereço IPv6 é \`${addr}\`?`, options: mcq(rng, V6T[id].lab, Object.keys(V6T).filter((k) => k !== id).map((k) => V6T[k].lab)),
          explanation: `${addr}: ${V6T[id].why}. Resumo: ::1 loopback; fe80::/10 link-local; fc00::/7 ULA; ff00::/8 multicast; 2000::/3 unicast global. O IPv6 não tem broadcast.`, ref: ['102:p.412-413'],
          verify: { sh: py(`${PYT}print(t('${addr}'))`), expect: id },
        };
      }
      if (kind === 'prefix') {
        const id = rng.pick(['ll', 'ula', 'mc', 'gua']); const pre = { ll: 'fe80::/10', ula: 'fc00::/7', mc: 'ff00::/8', gua: '2000::/3' };
        const wrong = Object.entries(pre).filter(([k]) => k !== id).map(([, v]) => v).concat(['fe80::/64', '::1/128', '2001::/16']);
        return {
          type: 'unica', text: `Qual prefixo IPv6 identifica os endereços do tipo **${V6T[id].lab.replace(/ \(.*\)$/, '')}**?`, options: mcq(rng, pre[id], id === 'll' ? wrong.filter((x) => x !== 'fe80::/64') : wrong),
          explanation: `${V6T[id].why}.`, ref: ['102:p.412-413'],
        };
      }
      return {
        type: 'unica', text: 'No IPv6 não existe broadcast. Que endereço permite enviar um pacote a **todos os nós** da rede local (papel semelhante ao do broadcast)?',
        options: mcq(rng, 'ff02::1', ['ff02::2', '::1', 'fe80::1', 'ff00::', '2000::1', '::']),
        explanation: 'ff02::1 é o multicast de "todos os nós" no escopo do enlace local; ff02::2 é o de "todos os roteadores". ::1 é loopback (só o próprio host) e fe80::1 é um unicast link-local.', ref: ['102:p.412'],
        verify: { sh: py("import ipaddress as I\nprint(I.ip_address('ff02::1').is_multicast, I.ip_address('ff02::2').is_multicast, I.ip_address('::1').is_loopback)"), expect: 'True True True' },
      };
    },
  },
];
