// 109.4 — Configurar DNS cliente: host / dig / getent, interpretação da saída do dig, nsswitch + resolv.conf,
// systemd-resolved e diagnóstico de erros de resolução.
// A verificação no Docker sobe um servidor DNS falso (Python, stdlib) em 127.0.0.1 e roda host/dig de verdade contra ele.
import { mcq, multi, code as c } from './util.mjs';
import { randPublic } from './network.mjs';

const PY_HEAD = 'import socket, struct, threading, subprocess, json, re, sys';
const PY_REST = String.raw`
T = {'A': 1, 'NS': 2, 'CNAME': 5, 'PTR': 12, 'MX': 15, 'TXT': 16, 'AAAA': 28}
RT = {v: k for k, v in T.items()}
def enc(n): return b''.join(bytes([len(p)]) + p.encode() for p in n.rstrip('.').split('.') if p) + b'\0'
def rd(t, v):
    if t == 'A': return socket.inet_aton(v)
    if t == 'AAAA': return socket.inet_pton(socket.AF_INET6, v)
    if t in ('NS', 'CNAME', 'PTR'): return enc(v)
    if t == 'MX':
        p, h = v.split(); return struct.pack('!H', int(p)) + enc(h)
    if t == 'TXT': b = v.encode(); return bytes([len(b)]) + b
srv = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); srv.bind(('127.0.0.1', 0)); PORT = srv.getsockname()[1]
LOG = []
def serve():
    while True:
        data, addr = srv.recvfrom(4096)
        i = 12; labels = []
        while data[i]:
            l = data[i]; labels.append(data[i + 1:i + 1 + l].decode().lower()); i += 1 + l
        qname = '.'.join(labels); qtype, qcls = struct.unpack('!HH', data[i + 1:i + 5]); q = data[12:i + 5]
        LOG.append(qname + ' ' + RT.get(qtype, str(qtype)))
        ent = ZONE.get(qname); rcode = 3; ans = b''; n = 0
        if ent is not None:
            rcode = ent.get('_rcode', 0)
            for v in ent.get(RT.get(qtype, '?'), []):
                r = rd(RT[qtype], v); ans += b'\xc0\x0c' + struct.pack('!HHIH', qtype, 1, ent.get('_ttl', 300), len(r)) + r; n += 1
        fl = ent.get('_flags', 'aa ra') if ent is not None else 'ra'
        flags = 0x8000 | (struct.unpack('!H', data[2:4])[0] & 0x0100) | (0x0400 if 'aa' in fl.split() else 0) | (0x0080 if 'ra' in fl.split() else 0) | rcode
        opt = bytes([0, 0, 41, 4, 208, 0, 0, 0, 0, 0, 0])
        srv.sendto(data[:2] + struct.pack('!HHHHH', flags, 1, n, 0, 1) + q + ans + opt, addr)
threading.Thread(target=serve, daemon=True).start()
def run(cmd):
    return subprocess.run(['bash', '-c', cmd.replace('@PORT@', str(PORT))], capture_output=True, text=True, timeout=25).stdout
def norm(text):
    out = []
    for l in text.split('\n'):
        if re.match(r'^(; <<>> DiG|; \(\d+ servers? found\)|;; (WHEN|Query time|SERVER|MSG SIZE))', l): continue
        l = re.sub(r'id: \d+', 'id: N', l); l = ' '.join(l.split())
        if l: out.append(l)
    return '\n'.join(out)
`;
const pj = (o) => JSON.stringify(JSON.stringify(o)); // literal de string Python que contém o JSON
/** Verificação com servidor DNS falso. mode: 'log' (consultas recebidas), 'out' (saída normalizada) ou 'same' (confere o texto do dig). */
export function dnsVerify({ zone, cmd, mode, text }) {
  const body = mode === 'log'
    ? `run(${JSON.stringify(cmd)})\nprint('\\n'.join(sorted(set(LOG))))`
    : mode === 'out'
      ? `print(norm(run(${JSON.stringify(cmd)})))`
      : `got = norm(run(${JSON.stringify(cmd)}))\nwant = norm(${JSON.stringify(text)})\nprint('OK' if got == want else 'DIFF\\n' + got + '\\n----\\n' + want)`;
  return `python3 -I - <<'PYEOF'\n${PY_HEAD}\nZONE = json.loads(${pj(zone)})\n${PY_REST}\n${body}\nPYEOF`;
}

const ZONES = ['example.com', 'empresa.com.br', 'lpi.org', 'exemplo.net', 'loja.com.br', 'rede.org', 'intranet.example'];
const rev = (ip) => `${ip.split('.').reverse().join('.')}.in-addr.arpa`;
const hostP = (P, args, S) => `host ${P}${args}${S ? ` ${S}` : ''}`;
const digP = (P, args, S) => `dig ${S ? `@${S} ` : ''}${P}${args}`;

/** Tarefas host/dig: cada comando é uma função (S, P) -> string. S = servidor, P = "-p PORTA " (só na verificação). */
export function dnsTasks(r) {
  const Z = r.pick(ZONES); const W = `${r.pick(['www', 'mail', 'api', 'portal', 'srv01'])}.${Z}`; const X = randPublic(r);
  const SRV = r.pick(['8.8.8.8', '1.1.1.1', '9.9.9.9', '192.168.1.1', '10.0.0.53']);
  const zone = { [Z]: { A: [X], AAAA: ['2001:db8::10'], MX: [`10 mail.${Z}`, `20 mail2.${Z}`], NS: [`ns1.${Z}`], TXT: ['v=spf1 -all'], _ttl: 300 }, [W]: { A: [X], _ttl: 300 }, [rev(X)]: { PTR: [W], _ttl: 300 } };
  const T = [];
  for (const [ty, what] of [['MX', 'os servidores de e-mail (registros MX)'], ['NS', 'os servidores de nomes (registros NS)'], ['AAAA', 'o endereço IPv6 (registro AAAA)'], ['TXT', 'os registros TXT']]) {
    T.push({ id: `host-${ty}`, desc: `Consultar ${what} de ${c(Z)} usando o comando host`, ok: (S, P) => hostP(P, `-t ${ty} ${Z}`, S), wrong: [(S, P) => hostP(P, `-t ${Z} ${ty}`, S), (S, P) => hostP(P, `${ty} ${Z}`, S), (S, P) => hostP(P, `-x ${ty} ${Z}`, S), (S, P) => hostP(P, `-a ${Z}`, S)], exp: `${Z} ${ty}`, mode: 'log', n: '-t escolhe o tipo de registro; sem ele, o host mostra os registros A, AAAA e MX.' });
    T.push({ id: `dig-${ty}`, desc: `Consultar ${what} de ${c(Z)} usando o comando dig`, ok: (S, P) => digP(P, `-t ${ty} ${Z}`, S), wrong: [(S, P) => digP(P, `-t ${Z} ${ty}`, S), (S, P) => digP(P, `+${ty.toLowerCase()} ${Z}`, S), (S, P) => digP(P, `-x ${Z}`, S), (S, P) => digP(P, `${Z}`, S)], exp: `${Z} ${ty}`, mode: 'log', n: 'No dig o tipo vai em -t TIPO (ou como argumento depois do nome); por padrão ele consulta o registro A.' });
  }
  T.push({ id: 'host-ptr', desc: `Descobrir o nome associado ao endereço ${c(X)} (consulta reversa, registro PTR) usando o host`, ok: (S, P) => hostP(P, X, S), wrong: [(S, P) => hostP(P, `-t A ${X}`, S), (S, P) => hostP(P, `-x ${X}`, S), (S, P) => hostP(P, `-t MX ${X}`, S), (S, P) => hostP(P, `-a ${X}`, S)], exp: `${rev(X)} PTR`, mode: 'log', n: 'Quando o argumento do host é um endereço IP, ele faz a consulta reversa (PTR) automaticamente.' });
  T.push({ id: 'dig-ptr', desc: `Descobrir o nome associado ao endereço ${c(X)} (consulta reversa, registro PTR) usando o dig`, ok: (S, P) => digP(P, `-x ${X}`, S), wrong: [(S, P) => digP(P, `-t PTR ${X}`, S), (S, P) => digP(P, `${X} PTR`, S), (S, P) => digP(P, `-r ${X}`, S), (S, P) => digP(P, `${X}`, S)], exp: `${rev(X)} PTR`, mode: 'log', n: 'dig -x monta sozinho o nome reverso (D.C.B.A.in-addr.arpa) e consulta o PTR; com -t PTR e o IP "cru", a consulta seria feita para um nome que não existe.' });
  T.push({ id: 'host-srv', srv: SRV, desc: `Consultar os registros MX de ${c(Z)} perguntando diretamente ao servidor DNS ${c(SRV)} (e não aos do /etc/resolv.conf), com o host`, ok: (S, P) => hostP(P, `-t MX ${Z}`, S), wrong: [(S, P) => `host ${P}-t MX ${S} ${Z}`, (S, P) => hostP(P, `-t MX ${Z} @${S}`, ''), (S, P) => `host ${P}-t MX ${Z} -s ${S}`, (S, P) => `host ${P}-t MX ${Z} ns ${S}`], exp: `${Z} MX`, mode: 'log', n: 'No host, o servidor a consultar é o último argumento: host -t MX nome servidor.' });
  T.push({ id: 'dig-srv', srv: SRV, desc: `Consultar os registros MX de ${c(Z)} perguntando diretamente ao servidor DNS ${c(SRV)}, com o dig`, ok: (S, P) => digP(P, `-t MX ${Z}`, S), wrong: [(S, P) => digP(P, `-t MX ${Z} ${S}`, ''), (S, P) => `dig ${P}-t MX @${Z} ${S}`, (S, P) => `dig ${P}-t MX ${Z} -s ${S}`, (S, P) => `dig ${P}-t MX ${Z} +server=${S}`], exp: `${Z} MX`, mode: 'log', n: 'No dig, o servidor é indicado com @servidor (antes ou depois das demais opções).' });
  T.push({ id: 'dig-short', desc: `Mostrar apenas o endereço IP do registro A de ${c(W)}, sem os cabeçalhos e seções do dig`, ok: (S, P) => digP(P, `+short ${W}`, S), wrong: [(S, P) => digP(P, `-short ${W}`, S), (S, P) => digP(P, `--short ${W}`, S), (S, P) => digP(P, `short ${W}`, S), (S, P) => digP(P, `+quiet ${W}`, S)], exp: X, mode: 'out', n: 'As opções de consulta do dig começam com + (+short, +noall, +answer…); as opções de linha de comando começam com - (-t, -x, -p).' });
  T.push({ id: 'dig-noall', desc: `Exibir somente a pergunta e a resposta (seções QUESTION e ANSWER) da consulta do registro A de ${c(W)}`, ok: (S, P) => digP(P, `+noall +answer +question ${W}`, S), wrong: [(S, P) => digP(P, `+answer +question ${W}`, S), (S, P) => digP(P, `+noall +answer ${W}`, S), (S, P) => digP(P, `-noall +answer +question ${W}`, S), (S, P) => digP(P, `+short +question ${W}`, S)], exp: `;${W}. IN A\n${W}. 300 IN A ${X}`, mode: 'out', n: '+noall desliga todas as seções; em seguida +answer e +question ligam só as duas pedidas.' });
  return { T, zone, Z, W, X, SRV };
}

const GETENT = (r) => {
  const nm = r.pick(['srv01', 'web01', 'intranet', 'impressora', 'nas']); const grp = r.pick(['openldap', 'developers', 'suporte', 'docker']);
  return [
    { d: `Descobrir qual endereço IP uma aplicação obteria para ${c(nm)}, respeitando a ordem de /etc/nsswitch.conf (inclusive o /etc/hosts)`, ok: `getent hosts ${nm}`, w: [`host ${nm}`, `dig ${nm}`, `nslookup ${nm}`, `getent hosts ${nm} dns`], n: 'O getent usa as mesmas bibliotecas de resolução das aplicações, seguindo o nsswitch.conf. host, dig e nslookup consultam apenas o DNS e ignoram o /etc/hosts.' },
    { d: `Resolver ${c(nm)} consultando **somente** a fonte dns (ignorando o /etc/hosts), mas ainda pelo mecanismo de resolução do sistema`, ok: `getent -s dns hosts ${nm}`, w: [`getent -s files hosts ${nm}`, `getent hosts -s dns ${nm}`, `getent -d dns hosts ${nm}`, `getent dns hosts ${nm}`], n: 'A opção -s escolhe a fonte de dados e vem antes do nome do banco de dados (hosts).' },
    { d: `Resolver ${c(nm)} consultando **somente** o arquivo /etc/hosts (fonte files), pelo mecanismo de resolução do sistema`, ok: `getent -s files hosts ${nm}`, w: [`getent -s dns hosts ${nm}`, `getent files hosts ${nm}`, `getent -s hosts files ${nm}`, `host ${nm} /etc/hosts`], n: 'getent -s files hosts NOME consulta apenas a fonte files (/etc/hosts).' },
    { d: `Exibir os dados do grupo ${c(grp)} em qualquer fonte configurada no nsswitch.conf (arquivos locais, LDAP, etc.)`, ok: `getent group ${grp}`, w: [`getent hosts ${grp}`, `grep ${grp} /etc/group`, `id ${grp}`, `getent passwd ${grp}`], n: 'getent BANCO [CHAVE] consulta qualquer banco do nsswitch.conf (passwd, group, hosts, services…). Um grep em /etc/group enxerga só o arquivo local.' },
  ];
};

// ---------- saída do dig ----------
const tabs = (len, col) => '\t'.repeat(Math.max(1, Math.ceil((col - len) / 8)));
function digText(o) { // o: { args, qname, qtype, status, flags, answers:[{ttl,type,data}], server, id }
  const q = `;${o.qname}.`; const lines = [
    `; <<>> DiG 9.18.19-1~deb12u1-Debian <<>> ${o.args}`, ';; global options: +cmd', ';; Got answer:',
    `;; ->>HEADER<<- opcode: QUERY, status: ${o.status}, id: ${o.id}`, `;; flags: ${o.flags}; QUERY: 1, ANSWER: ${o.answers.length}, AUTHORITY: 0, ADDITIONAL: 1`, ...(o.flags.includes('ra') ? [] : [';; WARNING: recursion requested but not available']), '',
    ';; OPT PSEUDOSECTION:', '; EDNS: version: 0, flags:; udp: 1232', ';; QUESTION SECTION:', `${q}${tabs(q.length, 32)}IN\t${o.qtype}`,
  ];
  if (o.answers.length) {
    lines.push('', ';; ANSWER SECTION:');
    for (const a of o.answers) { const n = `${o.qname}.`; lines.push(`${n}${tabs(n.length, 24)}${a.ttl}\tIN\t${a.type}\t${a.data}`); }
  }
  lines.push('', `;; Query time: ${o.ms} msec`, `;; SERVER: ${o.server}#53(${o.server}) (UDP)`, `;; WHEN: ${o.when}`, `;; MSG SIZE  rcvd: ${o.size}`);
  return lines.join('\n');
}
const STATUS_MEANING = {
  NOERROR: 'A consulta foi bem-sucedida e há registros do tipo pedido na resposta',
  NODATA: 'O nome existe, mas não há registros do tipo consultado (resposta NOERROR com ANSWER: 0)',
  NXDOMAIN: 'O nome consultado não existe no DNS',
  SERVFAIL: 'O servidor DNS não conseguiu processar a consulta (falha no servidor ou na zona)',
  REFUSED: 'O servidor DNS recusou-se a responder à consulta (política/ACL)',
};
const FLAG_MEANING = { qr: 'É uma resposta (query response), não uma consulta', aa: 'A resposta é autoritativa: veio de um servidor responsável pela zona', rd: 'Recursão desejada: o cliente pediu ao servidor que resolva por completo', ra: 'Recursão disponível: o servidor aceita fazer consultas recursivas (sem ela, o dig avisa "recursion requested but not available")' };

export const generators = [
  {
    id: 'dns-tool-cmd', obj: '109.4', nivel: 2, peso: 3,
    make(rng) {
      if (rng.chance(0.22)) {
        const g = rng.pick(GETENT(rng));
        return { type: 'unica', text: `Qual comando realiza a tarefa abaixo?\n\n${g.d}.`, options: mcq(rng, c(g.ok), g.w.map((x) => c(x))), explanation: `${c(g.ok)}. ${g.n}`, ref: ['102:p.487-488', '102:p.496'] };
      }
      const { T, zone } = dnsTasks(rng); const t = rng.pick(T);
      const disp = (fn) => fn(t.srv || '', '');
      return {
        type: 'unica', text: `Qual comando realiza a tarefa abaixo?\n\n${t.desc}.`, options: mcq(rng, c(disp(t.ok)), t.wrong.map((w) => c(disp(w)))),
        explanation: `${c(disp(t.ok))}. ${t.n} Em resumo: host é para consultas DNS simples (-t TIPO, servidor como último argumento); dig é para consultas detalhadas (-t TIPO, -x, @servidor, +short, +noall +answer…); getent consulta pelo resolvedor do sistema (nsswitch.conf).`,
        ref: ['102:p.488-492'],
        verify: { sh: dnsVerify({ zone, cmd: t.ok('127.0.0.1', '-p @PORT@ '), mode: t.mode }), expect: t.exp },
      };
    },
  },
  {
    id: 'dns-reverse-name', obj: '109.4', nivel: 2, peso: 2,
    make(rng) {
      const X = randPublic(rng); const o = X.split('.'); const correct = rev(X); const r4 = o.slice().reverse();
      const zone = { [correct]: { PTR: ['host.example.com'] } };
      const verify = { sh: dnsVerify({ zone, cmd: 'dig @127.0.0.1 -p @PORT@ -x ' + X, mode: 'log' }), expect: `${correct} PTR` };
      const expl = `Na consulta reversa, os octetos do endereço são escritos em ordem inversa e seguidos de in-addr.arpa: ${X} → ${correct}. Por isso o dig -x ${X} e o host ${X} perguntam o registro PTR desse nome.`;
      if (rng.chance(0.4)) return { type: 'lacuna', text: `Qual nome (sem o ponto final) o DNS consulta para obter o registro PTR do endereço ${c(X)}?`, answers: [correct, `${correct}.`], explanation: expl, ref: ['102:p.488'], verify };
      const wrong = [`${o.join('.')}.in-addr.arpa`, `${r4.join('.')}.arpa`, `${r4.join('.')}.in-addr`, `in-addr.arpa.${r4.join('.')}`, `${r4.slice(0, 3).join('.')}.in-addr.arpa`];
      return { type: 'unica', text: `Em uma consulta reversa (PTR) do endereço ${c(X)}, qual é o nome realmente consultado no DNS?`, options: mcq(rng, c(correct), wrong.map((w) => c(w))), explanation: expl, ref: ['102:p.488'], verify };
    },
  },
  {
    id: 'dns-dig-read', obj: '109.4', nivel: 3, peso: 3,
    make(rng) {
      const Z = rng.pick(ZONES); const kind = rng.pick(['A', 'A', 'MX', 'NS', 'AAAA', 'TXT', 'NXDOMAIN', 'NODATA', 'SERVFAIL', 'REFUSED']);
      const W = rng.chance(0.5) ? Z : `${rng.pick(['www', 'mail', 'api'])}.${Z}`;
      const ttl = rng.pick([60, 120, 300, 600, 3600, 86400]); const X = randPublic(rng); const auth = rng.chance(0.35);
      let qtype = 'A'; let status = 'NOERROR'; let ans = []; let flags = auth ? 'qr aa rd' : 'qr rd ra'; let entry = null;
      const fk = auth ? 'aa' : 'ra';
      if (kind === 'A') { ans = [X, ...(rng.chance(0.4) ? [randPublic(rng)] : [])].map((d) => ({ type: 'A', data: d, raw: d })); entry = { A: ans.map((a) => a.raw), _ttl: ttl, _flags: fk }; }
      else if (kind === 'MX') { qtype = 'MX'; ans = rng.sample([5, 10, 20, 30], rng.int(2, 3)).map((p) => { const h = `mx${rng.int(1, 9)}.${Z}`; return { type: 'MX', data: `${p} ${h}.`, raw: `${p} ${h}` }; }); entry = { MX: ans.map((a) => a.raw), _ttl: ttl, _flags: fk }; }
      else if (kind === 'NS') { qtype = 'NS'; ans = rng.sample(['ns1', 'ns2', 'dns1', 'dns2'], 2).map((n) => ({ type: 'NS', data: `${n}.${Z}.`, raw: `${n}.${Z}` })); entry = { NS: ans.map((a) => a.raw), _ttl: ttl, _flags: fk }; }
      else if (kind === 'AAAA') { qtype = 'AAAA'; const v6 = `2001:db8:${rng.int(1, 9)}::${rng.int(1, 99)}`; ans = [{ type: 'AAAA', data: v6, raw: v6 }]; entry = { AAAA: [v6], _ttl: ttl, _flags: fk }; }
      else if (kind === 'TXT') { qtype = 'TXT'; ans = [{ type: 'TXT', data: '"v=spf1 mx -all"', raw: 'v=spf1 mx -all' }]; entry = { TXT: ['v=spf1 mx -all'], _ttl: ttl, _flags: fk }; }
      else if (kind === 'NODATA') { qtype = rng.pick(['AAAA', 'MX', 'TXT']); entry = { A: [X], _ttl: ttl, _flags: fk }; }
      else if (kind === 'NXDOMAIN') { status = 'NXDOMAIN'; flags = 'qr rd ra'; entry = null; }
      else if (kind === 'SERVFAIL') { status = 'SERVFAIL'; flags = 'qr rd ra'; entry = { _rcode: 2, _flags: 'ra' }; }
      else { status = 'REFUSED'; flags = 'qr rd'; entry = { _rcode: 5, _flags: '' }; }
      const server = rng.pick(['192.168.1.20', '10.0.0.53', '8.8.8.8', '172.16.0.2', '1.1.1.1']);
      const o = { args: qtype === 'A' ? W : `-t ${qtype} ${W}`, qname: W, qtype, status, flags, answers: ans.map((a) => ({ ttl, type: a.type, data: a.data })), server, id: rng.int(1000, 65000), ms: rng.int(1, 140), when: 'Mon Oct 19 10:15:03 -03 2026', size: rng.int(44, 180) };
      const text = digText(o);
      const cmd = `dig @127.0.0.1 -p @PORT@ ${qtype === 'A' ? '' : `-t ${qtype} `}${W}`;
      const verify = { sh: dnsVerify({ zone: entry ? { [W]: entry } : {}, cmd, mode: 'same', text }), expect: 'OK' };
      const shown = `\`\`\`\n${text}\n\`\`\``;
      const which = rng.pick(['status', 'status', 'extract', 'extract', 'flags']);
      const statusKey = status === 'NOERROR' && ans.length === 0 ? 'NODATA' : status;
      if (which === 'status') {
        return {
          type: 'unica', text: `Analise a saída do \`dig\` abaixo.\n\n${shown}\n\nO que a resposta indica?`, options: mcq(rng, STATUS_MEANING[statusKey], Object.entries(STATUS_MEANING).filter(([k]) => k !== statusKey).map(([, v]) => v).concat(['O servidor DNS não respondeu (timeout): nenhum servidor pôde ser alcançado'])),
          explanation: `O campo "status" do cabeçalho mostra o código de retorno: NOERROR (consulta bem-sucedida), NXDOMAIN (o nome não existe), SERVFAIL (falha no servidor), REFUSED (consulta recusada). Atenção: NOERROR com "ANSWER: 0" significa que o nome existe, mas não há registro do tipo pedido (NODATA). Aqui: status ${status}, ANSWER ${ans.length} → ${STATUS_MEANING[statusKey]}. Se nenhum servidor respondesse, o dig mostraria ";; no servers could be reached", sem seção HEADER.`,
          ref: ['102:p.489-492'], verify,
        };
      }
      if (which === 'flags') {
        const fl = rng.pick(flags.split(' '));
        return {
          type: 'unica', text: `Na saída do \`dig\` abaixo, a linha de flags é \`;; flags: ${flags}; …\`.\n\n${shown}\n\nO que significa a flag **${fl}**?`, options: mcq(rng, FLAG_MEANING[fl], Object.entries(FLAG_MEANING).filter(([k]) => k !== fl).map(([, v]) => v).concat(['A resposta foi truncada e deve ser refeita por TCP', 'A resposta está assinada com DNSSEC'])),
          explanation: `Flags do cabeçalho DNS: qr = é uma resposta; aa = resposta autoritativa; rd = recursão desejada (pedida pelo cliente); ra = recursão disponível no servidor. ${fl} → ${FLAG_MEANING[fl]}.`, ref: ['102:p.489-492'], verify,
        };
      }
      const ex = [{ q: 'Quantos registros há na **ANSWER SECTION** dessa resposta? (apenas o número)', a: [String(ans.length)], e: `O cabeçalho informa ANSWER: ${ans.length}.` }];
      if (ans.length) ex.push({ q: 'Qual é o **TTL** (em segundos) do registro devolvido? (apenas o número)', a: [String(ttl)], e: `O número logo antes de "IN" na ANSWER SECTION é o TTL: ${ttl} segundos (tempo que a resposta pode ficar em cache).` });
      ex.push({ q: 'Qual **tipo de registro** foi consultado (campo da QUESTION SECTION)?', a: [qtype], e: `A QUESTION SECTION mostra o nome e o tipo consultados: ${W}. IN ${qtype}. Sem -t, o dig consulta o registro A.` });
      ex.push({ q: 'Qual é o **endereço IP do servidor DNS** que respondeu (linha ;; SERVER)?', a: [server], e: `A linha ";; SERVER: ${server}#53(${server})" indica o servidor que respondeu e a porta (53).` });
      if (kind === 'MX') {
        const best = ans.slice().sort((a, b) => Number(a.raw.split(' ')[0]) - Number(b.raw.split(' ')[0]))[0]; const hn = best.raw.split(' ')[1];
        ex.push({ q: 'Qual é o servidor de e-mail **preferido** (maior prioridade) desse domínio? (somente o nome do servidor)', a: [hn, `${hn}.`], e: `Em registros MX, o menor valor de preferência (${best.raw.split(' ')[0]}) tem a maior prioridade; logo o servidor preferido é ${hn}.` });
      }
      const pickEx = rng.pick(ex);
      return { type: 'lacuna', text: `Analise a saída do \`dig\` abaixo.\n\n${shown}\n\n${pickEx.q}`, answers: pickEx.a, explanation: `${pickEx.e} Estrutura da saída: cabeçalho (status, flags e contagens), OPT PSEUDOSECTION (EDNS), QUESTION, ANSWER e, ao final, tempo da consulta, SERVER, data e tamanho.`, ref: ['102:p.489-492'], verify };
    },
  },
];
