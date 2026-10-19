// 109.1 — Fundamentos de protocolos de internet: máscaras/CIDR, sub-redes, IPs privados,
// portas e serviços, TCP/UDP/ICMP, IPv4 x IPv6, abreviação e tipos de endereço IPv6.
// (Os helpers exportados aqui também são usados por network2.mjs / network3.mjs.)
import { mcq, multi, code as c, block as blk } from './util.mjs';

// ---------- helpers IPv4 ----------
export const ip2n = (s) => s.split('.').reduce((a, o) => a * 256 + Number(o), 0);
export const n2ip = (n) => [24, 16, 8, 0].map((sh) => Math.floor(n / 2 ** sh) % 256).join('.');
export const maskN = (p) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);
export const maskStr = (p) => n2ip(maskN(p));
export const bin8 = (n) => n.toString(2).padStart(8, '0');
export const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
/** Executa um trecho Python 3 (stdlib) dentro do verificador. */
export const py = (src) => `python3 -I - <<'PYEOF'\n${src}\nPYEOF`;
/** Cálculo de sub-rede IPv4: rede, broadcast, primeiro/último host, nº de hosts. */
export function calc(ip, p) {
  const n = ip2n(ip); const net = (n & maskN(p)) >>> 0; const size = 2 ** (32 - p);
  return { n, net, size, bc: net + size - 1, first: net + 1, last: net + size - 2, hosts: size - 2, mask: maskStr(p) };
}
const inRange = (x) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;

export function randPrivate(rng) {
  const k = rng.int(0, 2);
  if (k === 0) return `10.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`;
  if (k === 1) return `172.${rng.int(16, 31)}.${rng.int(0, 255)}.${rng.int(1, 254)}`;
  return `192.168.${rng.int(0, 255)}.${rng.int(1, 254)}`;
}
export function randPublic(rng) {
  const first = rng.pick([...Array(89).keys()].map((i) => i + 11).concat([...Array(26).keys()].map((i) => i + 101), [...Array(41).keys()].map((i) => i + 128), [170, 171], [...Array(19).keys()].map((i) => i + 173), [193, 194, 195, 196, 197, 199, 200, 201, 202, 204, 205, 206, 207, 208, 209, 210, 216, 217, 218, 219, 220]));
  return `${first}.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`;
}
export const randIp = (rng) => (rng.chance(0.7) ? randPrivate(rng) : randPublic(rng));

/** Explicação passo a passo do cálculo de sub-rede. */
function subnetSteps(ip, p) {
  const r = calc(ip, p); const o = ip.split('.').map(Number);
  const h = 32 - p;
  let s = `Máscara ${r.mask} = /${p}: ${p} bits de rede e ${h} bits de host → ${r.size} endereços por sub-rede (${r.size} − 2 = ${r.hosts} utilizáveis). `;
  if (p % 8 === 0) {
    s += `A máscara cobre ${p / 8} octeto(s) inteiro(s): zerando os octetos de host obtém-se a rede ${n2ip(r.net)}; preenchendo-os com 255 obtém-se o broadcast ${n2ip(r.bc)}. `;
  } else {
    const j = Math.floor(p / 8); const mo = Number(r.mask.split('.')[j]); const block = 256 - mo;
    const no = Number(n2ip(r.net).split('.')[j]);
    s += `Octeto ${j + 1}: ${o[j]} (${bin8(o[j])}) E ${mo} (${bin8(mo)}) = ${no} (${bin8(no)}) — as sub-redes avançam de ${block} em ${block} nesse octeto. Rede = ${n2ip(r.net)}; broadcast = rede + ${r.size - 1} = ${n2ip(r.bc)}. `;
  }
  return `${s}Faixa de hosts: ${n2ip(r.first)} a ${n2ip(r.last)}.`;
}

const pickP = (rng) => (rng.chance(0.15) ? rng.pick([8, 16, 24]) : rng.pick([...Array(14).keys()].map((i) => i + 17).concat([9, 10, 11, 12, 13, 14, 15]).filter((x) => x % 8)));

/** Pergunta "mesma sub-rede / gateway válido"; devolve null se o sorteio não servir (o chamador tenta de novo). */
function sameSubnetTry(rng) {
  const p = rng.int(20, 29); const base = n2ip((ip2n(randPrivate(rng)) & maskN(p)) >>> 0); const r = calc(base, p);
  const host = () => n2ip(r.net + rng.int(1, r.size - 2));
  if (rng.chance(0.5)) {
    // qual par de hosts conversa diretamente (mesma sub-rede)?
    const a = host(); let b = host(); while (b === a) b = host();
    const pairs = [[a, b]];
    for (const off of rng.shuffle([-1, 1, -2, 2, 1, -1])) {
      if (pairs.length === 4) break;
      const nb = r.net + off * r.size; if (!inRange(nb) || nb + r.size > 0xffffffff) continue;
      const x = rng.chance(0.5) ? a : host(); const y = n2ip(nb + rng.int(1, r.size - 2));
      if (!pairs.some((q) => q[0] === x && q[1] === y)) pairs.push([x, y]);
    }
    const same = (x, y) => (calc(x, p).net === calc(y, p).net);
    if (pairs.length < 4 || pairs.filter(([x, y]) => same(x, y)).length !== 1) return null;
    const texts = pairs.map(([x, y]) => `${x} e ${y}`);
    const ok = texts[0];
    return {
      type: 'unica', text: `Todos os hosts usam a máscara ${c(maskStr(p))} (${c('/' + p)}). Qual dos pares abaixo consegue se comunicar **diretamente**, sem passar por um roteador?`,
      options: mcq(rng, ok, texts.slice(1)),
      explanation: `Dois hosts só se falam diretamente se o endereço de rede (IP E máscara) for o mesmo. Com ${c('/' + p)} as sub-redes têm ${r.size} endereços: ${a} e ${pairs[0][1]} pertencem a ${n2ip(r.net)}/${p}. Nos outros pares, os IPs caem em sub-redes vizinhas (${pairs.slice(1).map(([x, y]) => `${n2ip(calc(x, p).net)}/${p} × ${n2ip(calc(y, p).net)}/${p}`).join('; ')}) e precisam de rota padrão/roteador.`,
      ref: ['102:p.399-402'],
      verify: { sh: py(`import ipaddress as I\nm = '${maskStr(p)}'\npairs = ${JSON.stringify(pairs)}\nprint(*[I.ip_interface(a + '/' + m).network == I.ip_interface(b + '/' + m).network for a, b in pairs])`), expect: pairs.map(([x, y]) => (same(x, y) ? 'True' : 'False')).join(' ') },
    };
  }
  // gateway válido para o host
  const me = host(); let gw = host(); while (gw === me) gw = host();
  const cands = [gw, n2ip(r.net), n2ip(r.bc), n2ip(r.net + r.size + rng.int(1, r.size - 2)), me, n2ip(r.net - r.size + rng.int(1, r.size - 2))].filter((x) => inRange(ip2n(x)));
  const wrong = [...new Set(cands.slice(1))].filter((x) => x !== gw);
  const options = mcq(rng, gw, wrong);
  const texts = options.map((o) => o.t);
  return {
    type: 'unica', text: `Um host tem o endereço ${c(`${me}/${p}`)}. Qual dos endereços abaixo pode ser configurado como a **rota padrão (gateway)** dele?`, options,
    explanation: `O gateway precisa estar na **mesma sub-rede** do host (${n2ip(r.net)}/${p}, hosts ${n2ip(r.first)} a ${n2ip(r.last)}) e ser um endereço de host válido e diferente do próprio IP. ${n2ip(r.net)} é o endereço de rede, ${n2ip(r.bc)} é o broadcast, ${me} é o próprio host, e endereços de sub-redes vizinhas não são alcançáveis diretamente.`,
    ref: ['102:p.402'],
    verify: { sh: py(`import ipaddress as I\ni = I.ip_interface('${me}/${p}'); n = i.network\nfor g in ${JSON.stringify(texts)}:\n    a = I.ip_address(g)\n    if a in n and a != n.network_address and a != n.broadcast_address and a != i.ip:\n        print(g)`), expect: gw },
  };
}

export const generators = [
  {
    id: 'net-mask-cidr', obj: '109.1', nivel: 1, peso: 2,
    make(rng) {
      const kind = rng.pick(['m2c', 'c2m', 'valid', 'lacuna-m2c', 'lacuna-c2m', 'm2c', 'c2m']);
      const p = pickP(rng); const mask = maskStr(p);
      const bits = mask.split('.').map((o) => bin8(Number(o))).join('.');
      const expl = `${mask} = ${bits} → ${p} bits em 1 (rede) e ${32 - p} bits em 0 (host), ou seja, ${c('/' + p)}.`;
      if (kind === 'm2c' || kind === 'lacuna-m2c') {
        const verify = { sh: `python3 -I -c "import ipaddress;print(ipaddress.ip_network('0.0.0.0/${mask}').prefixlen)"`, expect: String(p) };
        if (kind === 'lacuna-m2c') return { type: 'lacuna', text: `Qual é o comprimento do prefixo CIDR (apenas o número) da máscara ${c(mask)}?`, answers: [String(p), `/${p}`], explanation: expl, ref: ['102:p.398'], verify };
        const wrong = [p - 1, p + 1, p - 2, p + 2, 32 - p, p - 3, p + 3].filter((x) => x >= 1 && x <= 32).map((x) => `/${x}`);
        return { type: 'unica', text: `A máscara de sub-rede ${c(mask)} corresponde a qual notação CIDR?`, options: mcq(rng, `/${p}`, wrong), explanation: `${expl} Um erro comum é contar os bits de host (/${32 - p}) em vez dos bits de rede.`, ref: ['102:p.398'], verify };
      }
      if (kind === 'c2m' || kind === 'lacuna-c2m') {
        const verify = { sh: `python3 -I -c "import ipaddress;print(ipaddress.ip_network('0.0.0.0/${p}').netmask)"`, expect: mask };
        if (kind === 'lacuna-c2m') return { type: 'lacuna', text: `Escreva, em notação decimal pontuada, a máscara equivalente a ${c('/' + p)}.`, answers: [mask], explanation: expl, ref: ['102:p.398'], verify };
        const wrong = [p - 1, p + 1, p - 2, p + 2, 32 - p].filter((x) => x >= 1 && x <= 31).map(maskStr);
        return { type: 'unica', text: `Qual é a máscara de sub-rede equivalente a ${c('/' + p)}?`, options: mcq(rng, mask, wrong), explanation: `${expl} Os bits 1 devem ficar todos à esquerda, de forma contígua.`, ref: ['102:p.398'], verify };
      }
      // máscara válida: bits 1 contíguos à esquerda e 0 à direita
      const oct = mask.split('.').map(Number);
      const swapped = oct.slice(); const k = oct.findIndex((o, i) => i < 3 && o !== oct[i + 1]);
      [swapped[k], swapped[k + 1]] = [swapped[k + 1], swapped[k]];
      const bad1 = rng.pick([253, 251, 247, 239, 223, 191, 127, 250, 245]);
      const j = Math.floor(p / 8) % 4; const mutated = oct.slice(); mutated[Math.min(j, 3)] = bad1; if (mutated[Math.min(j, 3)] === oct[Math.min(j, 3)]) mutated[Math.min(j, 3)] = 249;
      const wrong = [n2ip((~maskN(p)) >>> 0), swapped.join('.'), mutated.join('.'), `255.255.256.0`, `0.255.255.255`, `255.0.255.0`].filter((x) => x !== mask);
      const options = mcq(rng, mask, wrong);
      const texts = options.map((o) => o.t);
      return {
        type: 'unica', text: 'Qual das opções abaixo é uma máscara de sub-rede IPv4 **válida**?', options,
        explanation: `Uma máscara válida tem todos os bits 1 à esquerda e todos os bits 0 à direita, sem intercalar (${mask} = ${bits}). As demais misturam 0 e 1, são "máscaras invertidas" (wildcard, como ${n2ip((~maskN(p)) >>> 0)}) ou têm octetos acima de 255.`,
        ref: ['102:p.398'],
        verify: { sh: py(`import ipaddress, re\nok = []\nfor o in ${JSON.stringify(texts)}:\n    try:\n        i = int(ipaddress.IPv4Address(o))\n    except ValueError:\n        continue\n    if re.fullmatch('1*0*', format(i, '032b')):\n        ok.append(o)\nprint(*ok)`), expect: mask },
      };
    },
  },
  {
    id: 'net-subnet-calc', obj: '109.1', nivel: 3, peso: 3,
    make(rng) {
      const p = pickP(rng); let ip = randIp(rng);
      const r = calc(ip, p); const net = n2ip(r.net);
      if (ip === net || ip === n2ip(r.bc)) ip = n2ip(r.net + rng.int(1, r.size - 2)); // o IP do enunciado é um host válido
      const intro = rng.chance(0.5) ? `Um host tem o endereço ${c(`${ip}/${p}`)}.` : `Um host está configurado com o IP ${c(ip)} e a máscara ${c(r.mask)}.`;
      const asked = rng.pick(['rede', 'broadcast', 'primeiro', 'ultimo', 'hosts', 'rede', 'broadcast', 'hosts']);
      const f = { rede: r.net, broadcast: r.bc, primeiro: r.first, ultimo: r.last };
      const wrongFor = {
        rede: [r.net + r.size, r.net - r.size, (r.n & 0xffffff00) >>> 0, (r.n & maskN(Math.max(p - 1, 1))) >>> 0, (r.n & maskN(Math.min(p + 1, 30))) >>> 0, r.n, r.first],
        broadcast: [r.bc - 1, r.bc + 1, (r.n | 0xff) >>> 0, (r.n | (~maskN(Math.max(p - 1, 1)) >>> 0)) >>> 0, (r.n | (~maskN(Math.min(p + 1, 30)) >>> 0)) >>> 0, r.net + r.size / 2 - 1, r.bc + r.size],
        primeiro: [r.net, r.net + 2, r.n, r.net - r.size + 1, r.net + r.size + 1],
        ultimo: [r.bc, r.bc - 2, r.n, r.bc + r.size - 1, r.net + r.size / 2 - 2],
      };
      const verifyAll = { sh: py(`import ipaddress\nn = ipaddress.ip_interface('${ip}/${p}').network\nprint(n.network_address, n.broadcast_address, n.network_address + 1, n.broadcast_address - 1, n.num_addresses - 2)`), expect: `${net} ${n2ip(r.bc)} ${n2ip(r.first)} ${n2ip(r.last)} ${r.hosts}` };
      const expl = subnetSteps(ip, p);
      if (rng.chance(0.2)) { // várias afirmações
        const fields = rng.shuffle(['rede', 'broadcast', 'primeiro', 'ultimo', 'hosts']); const k = rng.int(2, 3);
        const label = { rede: 'O endereço de rede é', broadcast: 'O endereço de broadcast é', primeiro: 'O primeiro host utilizável é', ultimo: 'O último host utilizável é', hosts: 'O número de hosts utilizáveis é' };
        const val = (fld) => (fld === 'hosts' ? String(r.hosts) : n2ip(f[fld]));
        const wv = (fld) => (fld === 'hosts' ? String(rng.pick([r.size, r.size - 1, r.size * 2 - 2, r.size / 2 - 2, r.size - 4].filter((x) => x > 0 && x !== r.hosts))) : n2ip(rng.pick(wrongFor[fld].filter((x) => inRange(x) && x !== f[fld]))));
        const goods = fields.slice(0, k).map((fld) => `${label[fld]} ${c(val(fld))}.`);
        const bads = fields.slice(k).map((fld) => `${label[fld]} ${c(wv(fld))}.`);
        return { type: 'multipla', text: `${intro} Marque **todas** as afirmações corretas sobre a sub-rede à qual ele pertence.`, options: multi(rng, goods, bads, 5 - k), explanation: expl, ref: ['102:p.398-401'], verify: verifyAll };
      }
      const qtext = { rede: 'Qual é o endereço de **rede** dessa sub-rede?', broadcast: 'Qual é o endereço de **broadcast** (transmissão) dessa sub-rede?', primeiro: 'Qual é o **primeiro** endereço que pode ser atribuído a um host nessa sub-rede?', ultimo: 'Qual é o **último** endereço que pode ser atribuído a um host nessa sub-rede?', hosts: 'Quantos endereços podem ser atribuídos a **hosts** nessa sub-rede?' }[asked];
      if (asked === 'hosts') {
        if (rng.chance(0.3)) return { type: 'lacuna', text: `${intro} ${qtext} (apenas o número)`, answers: [String(r.hosts)], explanation: expl, ref: ['102:p.398-401'], verify: verifyAll };
        const wrong = [r.size, r.size - 1, r.size * 2 - 2, r.size / 2 - 2, r.size - 4, 2 ** (32 - p) - 3].filter((x) => x > 0);
        return { type: 'unica', text: `${intro} ${qtext}`, options: mcq(rng, String(r.hosts), wrong.map(String)), explanation: `${expl} Rede e broadcast não podem ser atribuídos a hosts.`, ref: ['102:p.398-401'], verify: verifyAll };
      }
      const correct = n2ip(f[asked]);
      if (rng.chance(0.3)) return { type: 'lacuna', text: `${intro} ${qtext}`, answers: [correct], explanation: expl, ref: ['102:p.398-401'], verify: verifyAll };
      const wrong = [...new Set(wrongFor[asked].filter((x) => inRange(x) && x !== f[asked]))].map(n2ip);
      return { type: 'unica', text: `${intro} ${qtext}`, options: mcq(rng, correct, wrong), explanation: expl, ref: ['102:p.398-401'], verify: verifyAll };
    },
  },
  {
    id: 'net-same-subnet', obj: '109.1', nivel: 3, peso: 2,
    make(rng) { for (let i = 0; ; i++) { const q = sameSubnetTry(i ? rng.fork(`r${i}`) : rng); if (q) return q; } },
  },
  {
    id: 'net-prefix-hosts', obj: '109.1', nivel: 3, peso: 2,
    make(rng) {
      const kind = rng.pick(['hosts', 'minprefix', 'minprefix', 'divide-mask', 'divide-net', 'divide-bc', 'divide-hosts']);
      if (kind === 'hosts') {
        const p = rng.int(18, 30); const n = 2 ** (32 - p) - 2;
        const wrong = [n + 2, n + 1, n * 2 + 2, (n + 2) / 2 - 2, n - 2, 2 ** (32 - p - 1)];
        return {
          type: 'unica', text: `Quantos endereços podem ser atribuídos a hosts em uma sub-rede ${c('/' + p)} (máscara ${c(maskStr(p))})?`,
          options: mcq(rng, String(n), wrong.map(String)),
          explanation: `/${p} deixa ${32 - p} bits para hosts: 2^${32 - p} = ${n + 2} endereços. Subtraem-se o endereço de rede e o de broadcast: ${n + 2} − 2 = ${n} hosts utilizáveis.`,
          ref: ['102:p.399-400'],
          verify: { sh: `python3 -I -c "import ipaddress;print(ipaddress.ip_network('10.0.0.0/${p}').num_addresses-2)"`, expect: String(n) },
        };
      }
      if (kind === 'minprefix') {
        const h = rng.int(3, 11); const size = 2 ** h;
        const N = rng.pick([size - 2, size - 1, size - 3, rng.int(size / 2 - 1, size - 2), size - 2]);
        const hNeed = Math.ceil(Math.log2(N + 2)); const p = 32 - hNeed;
        const naive = 32 - Math.ceil(Math.log2(N));
        const wrongP = [p + 1, p - 1, naive, p + 2, p - 2].filter((x) => x !== p && x >= 8 && x <= 30);
        const expl = `${N} hosts + 2 (rede e broadcast) = ${N + 2} endereços. A menor potência de 2 que comporta isso é 2^${hNeed} = ${2 ** hNeed}, logo são ${hNeed} bits de host e o prefixo é 32 − ${hNeed} = /${p} (${2 ** hNeed - 2} hosts utilizáveis). /${p + 1} teria só ${2 ** (hNeed - 1) - 2} hosts. ${naive !== p ? `Esquecer os dois endereços reservados leva ao erro /${naive}.` : ''}`;
        const verify = { sh: `python3 -I -c "print(next(p for p in range(30,0,-1) if 2**(32-p)-2>=${N}))"`, expect: String(p) };
        if (rng.chance(0.3)) return { type: 'lacuna', text: `Qual é o **maior** prefixo CIDR (menor sub-rede) que ainda comporta ${N} hosts? Responda apenas com o número do prefixo.`, answers: [String(p), `/${p}`], explanation: expl, ref: ['102:p.399-400'], verify };
        return { type: 'unica', text: `Qual é a menor sub-rede (maior prefixo CIDR) capaz de comportar ${N} hosts?`, options: mcq(rng, `/${p}`, wrongP.map((x) => `/${x}`)), explanation: expl, ref: ['102:p.399-400'], verify };
      }
      // dividir uma rede em K sub-redes iguais
      const baseP = rng.chance(0.75) ? 24 : 16;
      const base = baseP === 24 ? n2ip((ip2n(randPrivate(rng)) & maskN(24)) >>> 0) : rng.pick([`172.${rng.int(16, 31)}.0.0`, `10.${rng.int(0, 255)}.0.0`, '192.168.0.0']);
      const lg = rng.int(1, baseP === 24 ? 4 : 5); const K = 2 ** lg; const np = baseP + lg; const size = 2 ** (32 - np);
      const idx = rng.int(2, K); const net = ip2n(base) + (idx - 1) * size;
      const head = `A rede ${c(`${base}/${baseP}`)} deve ser dividida em ${K} sub-redes de mesmo tamanho.`;
      const ord = `${idx}ª`;
      const pyv = (expr) => ({ sh: py(`import ipaddress as I\ns = list(I.ip_network('${base}/${baseP}').subnets(prefixlen_diff=${lg}))\n${expr}`) });
      const expl0 = `${K} sub-redes = 2^${lg}, então tomam-se ${lg} bits emprestados dos bits de host: /${baseP} + ${lg} = /${np} (máscara ${maskStr(np)}). Cada sub-rede tem ${size} endereços (${size - 2} hosts utilizáveis) e as redes avançam de ${size} em ${size}: ${[0, 1, 2].map((i) => `${n2ip(ip2n(base) + i * size)}/${np}`).join(', ')}…`;
      if (kind === 'divide-mask') {
        const wrong = [baseP + K, np - 1, np + 1, np + 2, baseP + lg + 1, 32 - lg].filter((x) => x !== np && x <= 30);
        return { type: 'unica', text: `${head} Qual é o prefixo (máscara) de cada sub-rede?`, options: mcq(rng, `/${np}`, wrong.map((x) => `/${x}`)), explanation: `${expl0} (Somar K ao prefixo é um erro comum: o que se soma é log2(K).)`, ref: ['102:p.400'], verify: { ...pyv('print(s[0].prefixlen)'), expect: String(np) } };
      }
      if (kind === 'divide-hosts') {
        const wrong = [size, size - 1, size * K - 2, size / 2 - 2, size - 4].filter((x) => x > 0 && x !== size - 2);
        return { type: 'unica', text: `${head} Quantos hosts utilizáveis tem cada sub-rede?`, options: mcq(rng, String(size - 2), wrong.map(String)), explanation: expl0, ref: ['102:p.400'], verify: { ...pyv('print(s[0].num_addresses - 2)'), expect: String(size - 2) } };
      }
      if (kind === 'divide-net') {
        const wrong = [net - size, net + size, net - 2 * size, net + 1, net + size - 1, ip2n(base) + (idx - 1) * (size - 1)].filter((x) => x !== net && inRange(x));
        return { type: 'unica', text: `${head} Qual é o endereço de rede da ${ord} sub-rede (contando a partir da primeira, que começa em ${c(base)})?`, options: mcq(rng, `${n2ip(net)}/${np}`, wrong.map((x) => `${n2ip(x)}/${np}`)), explanation: `${expl0} A ${ord} sub-rede começa em ${base} + ${idx - 1} × ${size} = ${n2ip(net)}.`, ref: ['102:p.400'], verify: { ...pyv(`print(s[${idx - 1}])`), expect: `${n2ip(net)}/${np}` } };
      }
      const bc = net + size - 1;
      const wrong = [bc - 1, bc + 1, bc - size, bc + size, net + size, net - 1].filter((x) => x !== bc && inRange(x));
      return { type: 'unica', text: `${head} Qual é o endereço de **broadcast** da ${ord} sub-rede?`, options: mcq(rng, n2ip(bc), wrong.map(n2ip)), explanation: `${expl0} A ${ord} sub-rede vai de ${n2ip(net)} a ${n2ip(bc)}; o último endereço da faixa é o broadcast.`, ref: ['102:p.400-401'], verify: { ...pyv(`print(s[${idx - 1}].broadcast_address)`), expect: n2ip(bc) } };
    },
  },
  {
    id: 'net-addr-type', obj: '109.1', nivel: 2, peso: 3,
    make(rng) {
      const kind = rng.pick(['classify', 'classify', 'which-private', 'which-private', 'multi-private', 'class-mask', 'class-mask']);
      const LAB = { priv: 'Privado (RFC 1918)', loop: 'Loopback (127.0.0.0/8)', apipa: 'Link-local / APIPA (169.254.0.0/16)', multi: 'Multicast (224.0.0.0/4)', pub: 'Público (roteável na internet)' };
      const tricky = (r) => r.pick([`172.${r.pick([15, 32, 33, 12])}.${r.int(0, 255)}.${r.int(1, 254)}`, `192.${r.pick([167, 169, 170, 1])}.${r.int(1, 255)}.${r.int(1, 254)}`, `11.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`, `9.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`, `${r.pick([101, 126])}.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`]);
      const gen = {
        priv: (r) => randPrivate(r), loop: (r) => `127.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`, apipa: (r) => `169.254.${r.int(1, 254)}.${r.int(1, 254)}`,
        multi: (r) => `${r.int(224, 239)}.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`, pub: (r) => (r.chance(0.4) ? tricky(r) : randPublic(r)),
      };
      const PYCLS = "import ipaddress as I\ndef cls(s):\n    a = I.ip_address(s)\n    if a in I.ip_network('127.0.0.0/8'): return 'loop'\n    if a in I.ip_network('169.254.0.0/16'): return 'apipa'\n    if a in I.ip_network('224.0.0.0/4'): return 'multi'\n    if any(a in I.ip_network(n) for n in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')): return 'priv'\n    return 'pub'\n";
      const why = {
        priv: 'está dentro de uma das faixas reservadas pela RFC 1918 para redes privadas (10.0.0.0–10.255.255.255, 172.16.0.0–172.31.255.255, 192.168.0.0–192.168.255.255) e não é roteado na internet',
        loop: 'o bloco 127.0.0.0/8 é reservado ao loopback (comunicação interna do próprio host)',
        apipa: 'o bloco 169.254.0.0/16 é o link-local (APIPA): o sistema se autoconfigura com ele quando não encontra servidor DHCP; não é roteado',
        multi: 'o bloco 224.0.0.0–239.255.255.255 é multicast (classe D), usado para grupos de hosts',
        pub: 'não pertence a nenhuma faixa reservada (privada, loopback, link-local ou multicast), logo é público e roteável na internet',
      };
      if (kind === 'classify') {
        const t = rng.pick(['priv', 'priv', 'pub', 'pub', 'loop', 'apipa', 'multi']); const ip = gen[t](rng);
        const others = Object.keys(LAB).filter((k) => k !== t);
        return {
          type: 'unica', text: `Que tipo de endereço IPv4 é ${c(ip)}?`, options: mcq(rng, LAB[t], others.map((k) => LAB[k])),
          explanation: `${ip} ${why[t]}. Atenção às bordas: só 172.16.0.0–172.31.255.255 é privado no bloco 172 (172.15.x.x e 172.32.x.x são públicos) e só 192.168.x.x no bloco 192.`,
          ref: ['102:p.395-396'], verify: { sh: py(`${PYCLS}print(cls('${ip}'))`), expect: t },
        };
      }
      if (kind === 'which-private' || kind === 'multi-private') {
        const mk = (priv) => (priv ? randPrivate(rng) : (rng.chance(0.65) ? tricky(rng) : rng.pick([gen.loop, gen.apipa, gen.pub])(rng)));
        const isPriv = (ip) => /^(10\.|192\.168\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
        if (kind === 'which-private') {
          const good = mk(true); const bad = new Set(); while (bad.size < 3) { const x = mk(false); if (!isPriv(x)) bad.add(x); }
          const all = [good, ...bad];
          return {
            type: 'unica', text: 'Qual dos endereços abaixo pertence a uma faixa **privada** reservada pela RFC 1918?', options: mcq(rng, good, [...bad]),
            explanation: `As faixas privadas são 10.0.0.0/8, 172.16.0.0/12 (172.16.x.x a 172.31.x.x) e 192.168.0.0/16. ${good} está em uma delas; os demais são públicos, loopback ou link-local — as bordas (172.15/172.32, 192.169) são armadilhas clássicas.`,
            ref: ['102:p.395-396'], verify: { sh: py(`${PYCLS}print(*[x for x in ${JSON.stringify(all)} if cls(x) == 'priv'])`), expect: good },
          };
        }
        const k = rng.int(2, 3); const good = new Set(); while (good.size < k) good.add(mk(true)); const bad = new Set(); while (bad.size < 5 - k) { const x = mk(false); if (!isPriv(x)) bad.add(x); }
        return {
          type: 'multipla', text: 'Marque **todos** os endereços abaixo que pertencem às faixas **privadas** da RFC 1918.', options: multi(rng, [...good], [...bad], 5 - k),
          explanation: 'Privadas: 10.0.0.0/8, 172.16.0.0/12 (172.16.0.0 a 172.31.255.255) e 192.168.0.0/16. Os demais endereços são públicos (inclusive os vizinhos 172.15.x.x, 172.32.x.x e 192.169.x.x), loopback (127/8) ou link-local (169.254/16).',
          ref: ['102:p.395-396'], verify: { sh: py(`${PYCLS}print(*sorted(x for x in ${JSON.stringify([...good, ...bad])} if cls(x) == 'priv'))`), expect: [...good].sort().join(' ') },
        };
      }
      // classes históricas
      const f = rng.pick([rng.int(1, 126), rng.int(1, 126), rng.int(128, 191), rng.int(128, 191), rng.int(192, 223), rng.int(192, 223), 10, 172, 192]);
      const ip = `${f}.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`;
      const cl = f <= 126 ? 'A' : f <= 191 ? 'B' : 'C'; const mk = { A: '255.0.0.0 (/8)', B: '255.255.0.0 (/16)', C: '255.255.255.0 (/24)' };
      const lab = (k, m) => `Classe ${k} — máscara padrão ${mk[m]}`;
      const wrong = [];
      for (const k of 'ABC') for (const m of 'ABC') if (!(k === cl && m === cl)) wrong.push(lab(k, m));
      return {
        type: 'unica', text: `Considerando as classes tradicionais de endereço IPv4, a qual classe pertence ${c(ip)} e qual é a sua máscara padrão?`,
        options: mcq(rng, lab(cl, cl), wrong),
        explanation: `A classe é definida pelo primeiro octeto: A = 1–126 (255.0.0.0), B = 128–191 (255.255.0.0), C = 192–223 (255.255.255.0). Aqui o primeiro octeto é ${f}: classe ${cl}. (127.x.x.x é loopback e 224 em diante é multicast/reservado, fora das classes A–C.)`,
        ref: ['102:p.395-396', '102:p.398'], verify: { sh: py(`o = int('${ip}'.split('.')[0])\nprint('A' if 1 <= o <= 126 else 'B' if 128 <= o <= 191 else 'C' if 192 <= o <= 223 else '?')`), expect: cl },
      };
    },
  },
];
