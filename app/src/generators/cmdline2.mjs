// 103.2 — filtros de texto: head/tail, sort, uniq, cut, tr, wc, nl, paste, sed, od, split, checksums.
// Cada filtro é reimplementado em JS (modelo) e o resultado é conferido contra o GNU coreutils/sed real (campo `verify`).
import { mcq, multi, block } from './util.mjs';

const sq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

function retry(fn, tries = 80) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try { const r = fn(i); if (r) return r; } catch (e) { last = e; }
  }
  throw last ?? new Error('retry esgotado');
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // comparação bytewise (ASCII), como LC_ALL=C

// ------------------------------------------------------------------------------------------
// sort
// ------------------------------------------------------------------------------------------
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const numVal = (s) => {
  const m = /^[ \t]*(-?\d*\.?\d*)/.exec(s);
  const v = m && m[1] && m[1] !== '-' && m[1] !== '.' ? parseFloat(m[1]) : 0;
  return Number.isNaN(v) ? 0 : v;
};
const UNITS = ['', 'K', 'M', 'G', 'T'];
const humanKey = (s) => {
  const m = /^[ \t]*(-?\d*\.?\d*)([KMGT]?)/.exec(s);
  const v = m && m[1] ? parseFloat(m[1]) || 0 : 0;
  return [UNITS.indexOf(m ? m[2] : ''), v];
};
const monthKey = (s) => MONTHS.indexOf(s.trim().slice(0, 3).toLowerCase()) + 1;
function verCmp(a, b) {
  const ra = a.match(/\d+|\D+/g) ?? []; const rb = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
    const x = ra[i]; const y = rb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (/^\d/.test(x) && /^\d/.test(y)) { const d = Number(x) - Number(y); if (d) return d < 0 ? -1 : 1; } else if (x !== y) return cmp(x, y);
  }
  return 0;
}
/** spec: { t: separador|null, keys: [{a, b, f:{n,r,f,h,M,V}}], g: {n,r,f,u,h,M,V} } */
export function gsort(lines, spec) {
  const g = spec.g ?? {};
  const keyText = (line, k) => {
    let fields;
    if (spec.t) fields = line.split(spec.t);
    else fields = line.split(' ');
    const from = k.a - 1;
    const to = k.b === undefined ? fields.length - 1 : k.b - 1;
    return fields.slice(from, to + 1).join(spec.t ?? ' ');
  };
  const keys = spec.keys && spec.keys.length ? spec.keys : [{ a: 1, f: null, whole: true }];
  const cmpKey = (x, y, flags) => {
    let d;
    if (flags.n) d = cmp(numVal(x), numVal(y));
    else if (flags.h) { const [ox, vx] = humanKey(x); const [oy, vy] = humanKey(y); d = cmp(ox, oy) || cmp(vx, vy); } else if (flags.M) d = cmp(monthKey(x), monthKey(y));
    else if (flags.V) d = verCmp(x, y);
    else if (flags.f) d = cmp(x.toUpperCase(), y.toUpperCase());
    else d = cmp(x, y);
    return flags.r ? -d : d;
  };
  const cmpAll = (x, y, useLast) => {
    for (const k of keys) {
      const flags = k.f && Object.keys(k.f).length ? k.f : g;
      const kx = k.whole ? x : keyText(x, k); const ky = k.whole ? y : keyText(y, k);
      const d = cmpKey(kx, ky, flags);
      if (d) return d;
    }
    if (!useLast) return 0;
    const d = cmp(x, y);
    return g.r ? -d : d;
  };
  const sorted = lines.map((l, i) => [l, i]).sort((p, q) => cmpAll(p[0], q[0], !g.u) || p[1] - q[1]).map((p) => p[0]);
  if (!g.u) return sorted;
  const out = [];
  for (const l of sorted) if (!out.length || cmpAll(out[out.length - 1], l, false) !== 0) out.push(l);
  return out;
}

// ------------------------------------------------------------------------------------------
// uniq / cut / tr / head / tail / wc / nl / paste
// ------------------------------------------------------------------------------------------
export function guniq(lines, o = {}) {
  const groups = [];
  for (const l of lines) {
    const last = groups[groups.length - 1];
    const same = last && (o.i ? last.l.toLowerCase() === l.toLowerCase() : last.l === l);
    if (same) last.n++; else groups.push({ l, n: 1 });
  }
  return groups.filter((g) => (o.d ? g.n > 1 : o.u ? g.n === 1 : true)).map((g) => (o.c ? `${String(g.n).padStart(7)} ${g.l}` : g.l));
}

function listPred(spec) {
  const parts = spec.split(',').map((p) => {
    const m = /^(\d*)(-?)(\d*)$/.exec(p);
    const a = m[1] ? Number(m[1]) : 1;
    const b = m[2] ? (m[3] ? Number(m[3]) : Infinity) : a;
    return [a, b];
  });
  return (i) => parts.some(([a, b]) => i >= a && i <= b);
}
export function gcutF(line, { d = '\t', f, s = false, complement = false, outd }) {
  if (!line.includes(d)) return s ? null : line;
  const pred = listPred(f);
  const fields = line.split(d);
  const sel = fields.filter((_, i) => (pred(i + 1) !== complement));
  return sel.join(outd ?? d);
}
export function gcutC(line, c, complement = false) {
  const pred = listPred(c);
  return [...line].filter((_, i) => pred(i + 1) !== complement).join('');
}

const CLASSES = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digit: '0123456789',
  alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', space: ' \t\n\v\f\r', alnum: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  punct: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~', blank: ' \t',
};
export function expandSet(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '[' && s[i + 1] === ':') {
      const e = s.indexOf(':]', i);
      out.push(...CLASSES[s.slice(i + 2, e)]);
      i = e + 1;
    } else if (s[i] === '\\') {
      const c = s[i + 1]; i++;
      out.push(c === 'n' ? '\n' : c === 't' ? '\t' : c === '\\' ? '\\' : c);
    } else if (s[i + 1] === '-' && i + 2 < s.length) {
      const a = s.charCodeAt(i); const b = s.charCodeAt(i + 2);
      for (let c = a; c <= b; c++) out.push(String.fromCharCode(c));
      i += 2;
    } else out.push(s[i]);
  }
  return out;
}
/** tr: o = {d, s, c}; set1/set2 como na linha de comando */
export function gtr(text, set1, set2, o = {}) {
  let s1 = expandSet(set1);
  const all = []; for (let c = 0; c < 256; c++) all.push(String.fromCharCode(c));
  if (o.c) s1 = all.filter((ch) => !s1.includes(ch));
  const s2 = set2 !== undefined ? expandSet(set2) : [];
  let out = [];
  if (o.d) {
    out = [...text].filter((ch) => !s1.includes(ch));
    if (o.s && set2 !== undefined) out = squeeze(out, s2);
    return out.join('');
  }
  if (set2 !== undefined && s2.length) {
    const map = new Map();
    s1.forEach((ch, i) => { if (!map.has(ch)) map.set(ch, s2[Math.min(i, s2.length - 1)]); });
    out = [...text].map((ch) => (map.has(ch) ? map.get(ch) : ch));
    if (o.s) out = squeeze(out, s2);
    return out.join('');
  }
  if (o.s) return squeeze([...text], s1).join('');
  return text;
}
function squeeze(chars, set) {
  const out = [];
  for (const ch of chars) if (!(out.length && out[out.length - 1] === ch && set.includes(ch))) out.push(ch);
  return out;
}

export const ghead = (lines, n) => (n >= 0 ? lines.slice(0, n) : lines.slice(0, Math.max(0, lines.length + n)));
export const gtail = (lines, n) => (n >= 0 ? lines.slice(Math.max(0, lines.length - n)) : lines.slice(-n - 1 < 0 ? 0 : -n - 1)); // n negativo = "+K" (a partir da linha K)
export const gtailFrom = (lines, k) => lines.slice(Math.max(0, k - 1));

/** nl: -b a|t, -v início, -i incremento */
export function gnl(lines, { b = 't', v = 1, i = 1 } = {}) {
  let n = v; const out = [];
  for (const l of lines) {
    if (b === 'a' || (b === 't' && l !== '')) { out.push({ num: n, l }); n += i; } else out.push({ num: null, l });
  }
  return out;
}

export function gpaste(files, { d = '\t', s = false } = {}) {
  const delims = [...d];
  const dl = (i) => delims[i % delims.length];
  if (s) {
    return files.map((f) => f.map((x, i) => (i ? dl(i - 1) : '') + x).join(''));
  }
  const n = Math.max(...files.map((f) => f.length));
  const out = [];
  for (let r = 0; r < n; r++) {
    let line = '';
    files.forEach((f, ci) => { line += (ci ? dl(ci - 1) : '') + (f[r] ?? ''); });
    out.push(line);
  }
  return out;
}

// ------------------------------------------------------------------------------------------
// sed (modelos por gabarito)
// ------------------------------------------------------------------------------------------
const WORDS = ['alfa', 'beta', 'gama', 'delta', 'omega', 'sigma', 'kappa', 'lambda', 'zeta', 'teta', 'iota', 'ypsilon'];
const NAMES = ['ana', 'bia', 'caio', 'dani', 'edu', 'fabi', 'gui', 'hugo', 'ivo', 'lia', 'mara', 'nino'];
const toLines = (s) => s.split('\n');
const lines2 = (arr) => arr.join('\n');
const showJoin = (arr, sep = ' | ') => (arr.length ? arr.join(sep) : '(nenhuma saída)');
const printfFile = (name, lines) => `printf '%s\\n' ${lines.map(sq).join(' ')} > ${name}`;

export const generators = [];
generators.push(
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-sort', obj: '103.2', nivel: 2, peso: 3,
    make(rng) {
      return retry(() => {
        const kind = rng.weighted(['num', 'word', 'fold', 'human', 'month', 'ver'], (x) => ({ num: 5, word: 3, fold: 2, human: 2, month: 1, ver: 2 }[x]));
        let tokens; let sets; let ok;
        if (kind === 'num') {
          const pool = [1, 2, 3, 5, 8, 9, 10, 11, 12, 20, 25, 30, 100, 150, 200, 1000, -3, -12, 0, 7, 45, 64, 99, 250];
          tokens = rng.sample(pool, rng.int(5, 7)).map(String);
          if (rng.chance(0.3)) tokens.push(rng.pick(tokens));
          if (rng.chance(0.2)) tokens.push(rng.pick(['1.5', '10.25', '2.75', '0.5']));
          sets = { '': {}, '-n': { n: 1 }, '-nr': { n: 1, r: 1 }, '-r': { r: 1 }, '-nu': { n: 1, u: 1 }, '-u': { u: 1 } };
          ok = ['-n', '-nr', '-r', '-nu'];
        } else if (kind === 'word') {
          tokens = rng.sample(NAMES, rng.int(4, 6));
          tokens.push(rng.pick(tokens));
          sets = { '': {}, '-r': { r: 1 }, '-u': { u: 1 }, '-ru': { r: 1, u: 1 } };
          ok = ['', '-r', '-u', '-ru'];
        } else if (kind === 'fold') {
          const ws = ['banana', 'Apple', 'cherry', 'Date', 'elder', 'Fig', 'Grape', 'honey', 'Ice', 'jam'];
          tokens = rng.sample(ws, rng.int(5, 6));
          sets = { '-f': { f: 1 }, '-fr': { f: 1, r: 1 }, '': {}, '-r': { r: 1 } };
          ok = ['-f', '-fr'];
        } else if (kind === 'human') {
          tokens = rng.sample(['4K', '12K', '512', '2M', '1G', '300K', '20M', '7M', '900', '15G', '64K', '3M'], rng.int(5, 6));
          sets = { '-h': { h: 1 }, '-hr': { h: 1, r: 1 }, '-n': { n: 1 }, '': {} };
          ok = ['-h', '-hr'];
        } else if (kind === 'month') {
          tokens = rng.sample(MONTHS, rng.int(5, 6));
          sets = { '-M': { M: 1 }, '-Mr': { M: 1, r: 1 }, '': {}, '-r': { r: 1 } };
          ok = ['-M', '-Mr'];
        } else {
          tokens = rng.sample(['arq1.txt', 'arq10.txt', 'arq2.txt', 'arq20.txt', 'arq3.txt', 'arq11.txt', 'arq9.txt', 'arq100.txt'], rng.int(5, 6));
          sets = { '-V': { V: 1 }, '': {}, '-r': { r: 1 }, '-Vr': { V: 1, r: 1 } };
          ok = ['-V', '-Vr'];
        }
        const opt = rng.pick(ok);
        const run = (o) => gsort(tokens, { g: sets[o] });
        const correct = run(opt).join(' ');
        const pool = Object.keys(sets).filter((o) => o !== opt).map((o) => run(o).join(' '));
        if (kind === 'num' || kind === 'word') pool.push(run(opt).slice().reverse().join(' '));
        const wrongSet = new Set(pool.filter((p) => p !== correct));
        if (wrongSet.size < 3) return null;
        const f = rng.pick(['valores.txt', 'lista.txt', 'dados.txt', 'entrada.txt']);
        const why = {
          '': 'Sem opções, `sort` compara os textos byte a byte (localidade C/POSIX): a ordem é "alfabética" e, nos números, é textual (`100` vem antes de `25`, porque `1` < `2`).',
          '-n': '`-n` compara o **valor numérico** do início de cada linha (por isso `2` vem antes de `10`).',
          '-nr': '`-n` ordena pelo valor numérico e `-r` inverte o resultado: do maior para o menor.',
          '-r': '`-r` inverte a ordem de comparação (decrescente).',
          '-u': '`-u` mantém só a primeira de várias linhas iguais.',
          '-nu': '`-n` ordena numericamente e `-u` descarta as linhas que têm o mesmo valor numérico.',
          '-ru': '`-r` ordena de forma decrescente e `-u` elimina as repetições.',
          '-f': '`-f` ignora a diferença entre maiúsculas e minúsculas na comparação (`Apple` fica entre `a` e `b`); sem ele, na localidade C as maiúsculas vêm antes das minúsculas.',
          '-fr': '`-f` ignora a caixa e `-r` inverte a ordem.',
          '-h': '`-h` ordena números "legíveis" com sufixo (`K` < `M` < `G`), como a saída de `du -h`/`ls -lh`.',
          '-hr': '`-h` entende os sufixos `K`, `M`, `G` e `-r` inverte a ordem.',
          '-M': '`-M` ordena por mês (jan < fev < ... < dez), não alfabeticamente.',
          '-Mr': '`-M` ordena por mês do ano e `-r` inverte.',
          '-V': '`-V` faz a "ordenação natural" de versões/números embutidos no texto (`arq2` antes de `arq10`).',
          '-Vr': '`-V` ordena de forma natural e `-r` inverte.',
        }[opt];
        return {
          type: 'unica',
          text: `O arquivo \`${f}\` contém, uma por linha, as entradas abaixo (nesta ordem):\n\n${block(tokens.join('\n'))}\n\nQual é a saída de \`sort${opt ? ' ' + opt : ''} ${f}\`? (A saída tem uma entrada por linha; aqui elas aparecem separadas por espaço.)`,
          options: mcq(rng, correct, [...wrongSet], 4),
          explanation: `${why} Resultado: ${correct}.`,
          ref: ['101:p.208-211', '101:p.223-225'],
          verify: { sh: `${printfFile(f, tokens)}\nsort ${opt} ${f} | paste -s -d' ' -`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-sort-key', obj: '103.2', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const sep = rng.pick([':', ',', ';']);
        const nr = rng.int(4, 6);
        const names = rng.sample(NAMES, nr);
        const ages = rng.sample([9, 12, 25, 31, 47, 100, 8, 64, 150, 18, 77], nr);
        const cities = ['rio', 'sao', 'bh', 'poa', 'rec', 'cur'];
        const deps = rng.sample(['ti', 'rh', 'ops'], 3);
        const recs = names.map((n, i) => [n, String(ages[i]), rng.pick(cities), rng.pick(deps)]);
        const lines = recs.map((r) => r.join(sep));
        const tq = sep === ';' ? `-t';'` : `-t${sep}`;
        const cases = [
          { cmd: `${tq} -k2 -n`, spec: { t: sep, keys: [{ a: 2 }], g: { n: 1 } }, why: '`-t` define o separador de campos, `-k2` escolhe o campo 2 e `-n` compara numericamente' },
          { cmd: `${tq} -k2`, spec: { t: sep, keys: [{ a: 2 }], g: {} }, why: 'sem `-n`, o campo 2 é comparado como **texto** (`100` < `25` < `9`)' },
          { cmd: `${tq} -k2,2nr`, spec: { t: sep, keys: [{ a: 2, b: 2, f: { n: 1, r: 1 } }], g: {} }, why: '`-k2,2nr`: só o campo 2, numérico e invertido (maior primeiro)' },
          { cmd: `${tq} -k3,3 -k2,2n`, spec: { t: sep, keys: [{ a: 3, b: 3, f: {} }, { a: 2, b: 2, f: { n: 1 } }], g: {} }, why: 'primeira chave: o campo 3 (texto); empates são desfeitos pela segunda chave: o campo 2, numérico' },
          { cmd: `${tq} -k4,4 -k2,2nr`, spec: { t: sep, keys: [{ a: 4, b: 4, f: {} }, { a: 2, b: 2, f: { n: 1, r: 1 } }], g: {} }, why: 'ordena pelo campo 4 (texto) e, dentro de cada valor igual, pelo campo 2 em ordem numérica decrescente' },
          { cmd: `${tq} -k1,1r`, spec: { t: sep, keys: [{ a: 1, b: 1, f: { r: 1 } }], g: {} }, why: '`-k1,1r` ordena pelo campo 1 em ordem inversa' },
          { cmd: `${tq} -k1`, spec: { t: sep, keys: [{ a: 1 }], g: {} }, why: 'ordena pelo campo 1 (texto)' },
        ];
        const c = rng.pick(cases);
        const runOut = (spec) => gsort(lines, spec).map((l) => l.split(sep)[0]);
        // chaves principais distintas (evita depender do desempate por última comparação)
        const keyOf = (r, k) => r[k - 1];
        const mainKey = c.spec.keys[0].a;
        const second = c.spec.keys[1];
        if (!second && new Set(recs.map((r) => keyOf(r, mainKey))).size !== recs.length) return null;
        if (second) {
          const combos = new Set(recs.map((r) => keyOf(r, mainKey) + '|' + keyOf(r, second.a)));
          if (combos.size !== recs.length) return null;
          const distinctMain = new Set(recs.map((r) => keyOf(r, mainKey))).size;
          if (distinctMain < 2 || distinctMain > recs.length - 1) return null; // a segunda chave precisa fazer diferença
        }
        const correct = runOut(c.spec).join(' ');
        const pool = cases.filter((x) => x !== c).map((x) => runOut(x.spec).join(' '));
        pool.push(runOut({ ...c.spec, g: { ...c.spec.g, r: c.spec.g.r ? undefined : 1 } }).join(' '));
        const wrong = new Set(pool.filter((p) => p !== correct));
        if (wrong.size < 3) return null;
        const f = rng.pick(['cadastro.txt', 'pessoas.csv', 'registros.txt']);
        return {
          type: 'unica',
          text: `O arquivo \`${f}\` tem os registros abaixo (campos separados por \`${sep}\`: nome, idade, cidade, departamento):\n\n${block(lines.join('\n'))}\n\nEm que ordem os **nomes** (primeiro campo) aparecem na saída de \`sort ${c.cmd} ${f}\`?`,
          options: mcq(rng, correct, [...wrong], 4),
          explanation: `${c.why[0].toUpperCase()}${c.why.slice(1)}. Ordem final dos nomes: ${correct}. Lembre: \`-k N\` sem \`,M\` usa o campo N **até o fim da linha**; \`-k N,N\` limita a chave ao campo N. Uma opção colada à chave (\`2n\`, \`2,2nr\`) vale só para aquela chave.`,
          ref: ['101:p.208-211', '101:p.234'],
          verify: { sh: `${printfFile(f, lines)}\nsort ${c.cmd} ${f} | cut -d${sq(sep)} -f1 | paste -s -d' ' -`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-uniq', obj: '103.2', nivel: 2, peso: 3,
    make(rng) {
      return retry(() => {
        const base = rng.sample(NAMES, rng.int(3, 5));
        const lines = [];
        base.forEach((n) => { const k = rng.int(1, 4); for (let i = 0; i < k; i++) lines.push(n); });
        const L = rng.shuffle(lines);
        if (rng.chance(0.6)) { const i = rng.int(0, L.length - 1); L.splice(i, 0, L[i]); }
        const f = rng.pick(['votos.txt', 'acessos.txt', 'nomes.txt', 'log.txt']);
        const sorted = gsort(L, { g: {} });
        const norm = (a) => a.map((l) => l.trim().replace(/\s+/, ' '));
        const cnt = (arr) => norm(guniq(arr, { c: 1 }));
        const bumpOne = (arr, d) => arr.map((x, i) => (i === 1 || arr.length === 1 ? x.replace(/^\d+/, (m) => String(Math.max(1, Number(m) + d))) : x));
        const muts = (arr) => [arr.slice(0, -1), arr.slice(1), [...arr].reverse(), arr.length > 1 ? [arr[1], arr[0], ...arr.slice(2)] : arr];
        const listForm = (arr) => arr.join(' ');
        const cntForm = (arr) => arr.join(', ');
        const forms = [
          { cmd: `sort ${f} | uniq -c`, out: cnt(sorted), fmt: cntForm, alts: () => [cnt(L), bumpOne(cnt(sorted), 1), bumpOne(cnt(sorted), -1), ...muts(cnt(sorted))], sh: `sort ${f} | uniq -c | sed 's/^ *//' | paste -s -d, - | sed 's/,/, /g'`, why: '`sort` junta as linhas iguais e `uniq -c` conta cada grupo, imprimindo `contagem texto`', c: true },
          { cmd: `uniq ${f}`, out: guniq(L), fmt: listForm, alts: () => [guniq(sorted), L, [...new Set(L)], ...muts(guniq(L))], sh: `uniq ${f} | paste -s -d' ' -`, why: '`uniq` sem `sort` só remove repetições **adjacentes**; nomes iguais separados por outros continuam repetidos' },
          { cmd: `uniq -c ${f}`, out: cnt(L), fmt: cntForm, alts: () => [cnt(sorted), bumpOne(cnt(L), 1), ...muts(cnt(L))], sh: `uniq -c ${f} | sed 's/^ *//' | paste -s -d, - | sed 's/,/, /g'`, why: '`uniq -c` sem `sort` conta apenas sequências **consecutivas** iguais', c: true },
          { cmd: `sort ${f} | uniq -d`, out: guniq(sorted, { d: 1 }), fmt: listForm, alts: () => [guniq(sorted, { u: 1 }), guniq(sorted), guniq(L, { d: 1 }), ...muts(guniq(sorted, { d: 1 }))], sh: `sort ${f} | uniq -d | paste -s -d' ' -`, why: '`uniq -d` mostra (uma vez) só as linhas que aparecem **mais de uma vez**' },
          { cmd: `sort ${f} | uniq -u`, out: guniq(sorted, { u: 1 }), fmt: listForm, alts: () => [guniq(sorted, { d: 1 }), guniq(sorted), guniq(L, { u: 1 }), ...muts(guniq(sorted, { u: 1 }))], sh: `sort ${f} | uniq -u | paste -s -d' ' -`, why: '`uniq -u` mostra só as linhas que aparecem **uma única vez**' },
          { cmd: `sort ${f} | uniq | wc -l`, out: [String(guniq(sorted).length)], fmt: (a) => a[0], alts: () => [[String(L.length)], [String(guniq(L).length)], [String(guniq(sorted).length + 1)], [String(guniq(sorted).length - 1)], [String(guniq(sorted, { d: 1 }).length)]], sh: `sort ${f} | uniq | wc -l`, why: 'depois de `sort | uniq` sobra uma linha por nome distinto, e `wc -l` as conta' },
          { cmd: `sort ${f} | uniq -c | sort -nr | head -n 2`, out: gsort(cnt(sorted), { g: { n: 1, r: 1 } }).slice(0, 2), fmt: cntForm, alts: () => [gsort(cnt(sorted), { g: { n: 1 } }).slice(0, 2), gsort(cnt(sorted), { g: { n: 1, r: 1 } }).slice(0, 1), gsort(cnt(sorted), { g: { n: 1, r: 1 } }).slice(0, 3), cnt(sorted).slice(0, 2), cnt(sorted).slice(-2)], sh: `sort ${f} | uniq -c | sort -nr | head -n 2 | sed 's/^ *//' | paste -s -d, - | sed 's/,/, /g'`, why: '`uniq -c` conta, `sort -nr` põe as maiores contagens primeiro e `head -n 2` fica com as duas primeiras', top: 2, c: true },
        ];
        const fm = rng.pick(forms);
        if (fm.top) {
          const counts = guniq(sorted, { c: 1 }).map((x) => Number(x.trim().split(' ')[0])).sort((a, b) => b - a);
          if (counts[fm.top - 1] === counts[fm.top] || counts[0] === counts[1]) return null; // evita empates
        }
        const correct = fm.out.length ? fm.fmt(fm.out) : '(nenhuma saída)';
        const wrong = new Set(fm.alts().map((a) => (a.length ? fm.fmt(a) : '(nenhuma saída)')).filter((s) => s !== correct && s.trim()));
        if (wrong.size < 3) return null;
        return {
          type: 'unica',
          text: `O arquivo \`${f}\` contém (uma por linha, nesta ordem):\n\n${block(L.join('\n'))}\n\nQual é o resultado de \`${fm.cmd}\`?${fm.c ? ' (Ignore o recuo à esquerda que o `uniq -c` imprime; os itens aparecem separados por vírgula.)' : ' (Os itens da saída, uma por linha, aparecem aqui separados por espaço.)'}`,
          options: mcq(rng, correct, [...wrong], 4),
          explanation: `${fm.why[0].toUpperCase()}${fm.why.slice(1)}. Resultado: ${correct}. Atenção: o \`uniq\` só compara linhas **adjacentes**; por isso quase sempre vem depois de um \`sort\`.`,
          ref: ['101:p.224', '101:p.234'],
          verify: { sh: `${printfFile(f, L)}\nr=$(${fm.sh})\necho "\${r:-(nenhuma saída)}"`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-cut', obj: '103.2', nivel: 2, peso: 3,
    make(rng) {
      return retry(() => {
        const mode = rng.weighted(['f', 'c'], (x) => ({ f: 3, c: 1 }[x]));
        if (mode === 'c') {
          const strs = rng.sample(['20240315-alfa', '20231201-beta', '19991231-gama', '20250102-delta', '20210607-omega'], 3);
          const specs = ['1-4', '5-6', '7,8', '1-4,10-', '-4', '10-', '3,5,7'];
          const spec = rng.pick(specs);
          const outs = strs.map((s) => gcutC(s, spec));
          const compl = rng.chance(0.25);
          const outs2 = compl ? strs.map((s) => gcutC(s, spec, true)) : outs;
          const correct = outs2.join(' | ');
          const pool = [strs.map((s) => gcutC(s, spec, !compl)).join(' | '), strs.map((s) => gcutC(s, spec.replace(/\d+/g, (d) => String(Number(d) + 1)), compl)).join(' | '), strs.map((s) => gcutC(s, spec.replace(/\d+/g, (d) => String(Math.max(1, Number(d) - 1))), compl)).join(' | '), strs.map((s) => s.length).join(' | ')];
          const wrong = new Set(pool.filter((p) => p !== correct));
          if (wrong.size < 3) return null;
          return {
            type: 'unica',
            text: `O arquivo \`ids.txt\` contém as linhas abaixo. Qual é a saída de \`cut -c${spec}${compl ? ' --complement' : ''} ids.txt\`? (uma linha de saída por linha do arquivo, separadas aqui por \` | \`)\n\n${block(strs.join('\n'))}`,
            options: mcq(rng, correct, [...wrong], 4),
            explanation: `\`cut -c\` seleciona **posições de caracteres** (a primeira posição é 1): ${spec} ${compl ? '(e `--complement` inverte a seleção, mostrando tudo o que NÃO está na lista)' : ''}. Linha a linha: ${strs.map((s, i) => `${s} → ${outs2[i]}`).join('; ')}.`,
            ref: ['101:p.230'],
            verify: { sh: `${printfFile('ids.txt', strs)}\ncut -c${spec}${compl ? ' --complement' : ''} ids.txt | paste -s -d'|' - | sed 's/|/ | /g'`, expect: correct },
          };
        }
        const style = rng.pick(['passwd', 'csv']);
        const d = style === 'passwd' ? ':' : ',';
        const nm = rng.sample(NAMES, 3);
        const lines = style === 'passwd'
          ? nm.map((n, i) => `${n}:x:${1000 + i}:${1000 + (i % 2)}:${n.toUpperCase()}:/home/${n}:/bin/${rng.pick(['bash', 'sh', 'zsh'])}`)
          : nm.map((n) => [n, rng.int(18, 60), rng.pick(['rio', 'sao', 'bh']), rng.pick(['ti', 'rh', 'ops']), rng.pick(['A', 'B', 'C'])].join(','));
        const nf = lines[0].split(d).length;
        const withBare = rng.chance(0.2);
        const data = withBare ? [...lines.slice(0, 2), 'linha sem separador'] : lines;
        const specs = ['1', '1,3', '2-4', '3-', '-2', '1,nf', '3,1', '2,4-5'].map((s) => s.replace('nf', String(nf)));
        const spec = rng.pick(specs);
        const compl = rng.chance(0.2);
        const sOpt = withBare && rng.chance(0.5);
        const run = (o) => data.map((l) => gcutF(l, { d, f: o.f, s: o.s, complement: o.compl })).filter((x) => x !== null);
        const outs = run({ f: spec, s: sOpt, compl });
        const correct = outs.join(' | ');
        const pool = [
          run({ f: spec, s: !sOpt, compl }).join(' | '),
          run({ f: spec, s: sOpt, compl: !compl }).join(' | '),
          data.map((l) => gcutF(l, { d, f: spec.replace(/\d+/g, (x) => String(Math.max(1, Number(x) + 1))), s: sOpt, complement: compl })).filter((x) => x !== null).join(' | '),
          data.map((l) => gcutF(l, { d, f: spec.replace(/\d+/g, (x) => String(Math.max(1, Number(x) - 1))), s: sOpt, complement: compl })).filter((x) => x !== null).join(' | '),
          spec.includes(',') ? run({ f: spec.split(',').reverse().join(','), s: sOpt, compl }).join(' | ') : run({ f: spec, s: sOpt, compl }).map((x) => x.split(d).reverse().join(d)).join(' | '),
        ];
        const wrong = new Set(pool.filter((p) => p !== correct));
        if (wrong.size < 3) return null;
        const dq = d === ',' ? `-d,` : `-d${d}`;
        const cmd = `cut ${dq} -f${spec}${compl ? ' --complement' : ''}${sOpt ? ' -s' : ''} arq.txt`;
        return {
          type: 'unica',
          text: `O arquivo \`arq.txt\` contém as linhas abaixo. Qual é a saída de \`${cmd}\`? (uma linha de saída por linha impressa, separadas aqui por \` | \`)\n\n${block(data.join('\n'))}`,
          options: mcq(rng, correct, [...wrong], 4),
          explanation: `\`-d${d}\` define o delimitador e \`-f${spec}\` escolhe os campos (a numeração começa em 1). Os campos saem **sempre na ordem original do arquivo**, mesmo que a lista os cite em outra ordem (\`3,1\` equivale a \`1,3\`). ${withBare ? 'Uma linha sem o delimitador é impressa inteira, a menos que se use `-s`, que a descarta. ' : ''}${compl ? '`--complement` mostra os campos que **não** estão na lista. ' : ''}Resultado: ${correct}.`,
          ref: ['101:p.230-233'],
          verify: { sh: `${printfFile('arq.txt', data)}\n${cmd} | paste -s -d'|' - | sed 's/|/ | /g'`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-tr', obj: '103.2', nivel: 2, peso: 3,
    make(rng) {
      return retry(() => {
        const inputs = ['Linux LPIC 2024', 'tux-e-bash-99', 'foo,bar,baz', 'hello world 42', 'a--b---c----d', 'Debian 12 bookworm', 'ROOT:x:0:0', 'um dois tres quatro', 'aaabbbccc 111 222'];
        const input = rng.pick(inputs);
        const T = (args, s1, s2, o, why, noNl = false) => ({ args, s1, s2, o: o ?? {}, why, noNl });
        const specs = [
          T('a-z A-Z', 'a-z', 'A-Z', {}, 'cada letra de `a-z` é trocada pela correspondente de `A-Z`'),
          T("'[:lower:]' '[:upper:]'", '[:lower:]', '[:upper:]', {}, '`[:lower:]` e `[:upper:]` são classes de caracteres: minúsculas viram maiúsculas'),
          T("'[:upper:]' '[:lower:]'", '[:upper:]', '[:lower:]', {}, 'maiúsculas viram minúsculas'),
          T('-d aeiou', 'aeiou', undefined, { d: 1 }, '`-d` **apaga** todos os caracteres do conjunto (aqui, as vogais minúsculas)'),
          T("-d '[:digit:]'", '[:digit:]', undefined, { d: 1 }, '`-d \'[:digit:]\'` apaga todos os algarismos'),
          T("-d ' '", ' ', undefined, { d: 1 }, '`-d \' \'` apaga os espaços'),
          T("-cd '[:digit:]'", '[:digit:]', undefined, { c: 1, d: 1 }, '`-c` complementa o conjunto: `-cd \'[:digit:]\'` apaga tudo o que **não** é algarismo (só sobram os dígitos; até a quebra de linha é apagada)', true),
          T('-s -', '-', undefined, { s: 1 }, '`-s` (squeeze) troca sequências repetidas do caractere por uma só ocorrência'),
          T('-s a-c', 'a-c', undefined, { s: 1 }, '`-s a-c` comprime as repetições consecutivas de a, b ou c em uma só'),
          T('abc xyz', 'abc', 'xyz', {}, 'a→x, b→y, c→z (correspondência posição a posição)'),
          T('a-c x', 'a-c', 'x', {}, 'quando o segundo conjunto é menor, ele é completado repetindo o **último** caractere: a, b e c viram `x`'),
          T("' ' _", ' ', '_', {}, 'cada espaço vira `_`'),
          T("',' ';'", ',', ';', {}, 'cada vírgula vira `;`'),
          T('A-Za-z N-ZA-Mn-za-m', 'A-Za-z', 'N-ZA-Mn-za-m', {}, 'é a cifra ROT13: cada letra é trocada pela que está 13 posições adiante no alfabeto'),
          T("-d '-'", '-', undefined, { d: 1 }, '`-d \'-\'` apaga os hifens'),
        ];
        const sp = rng.pick(specs);
        const evalSpec = (s) => gtr(input + '\n', s.s1, s.s2, s.o).replace(/\n$/, '');
        const correct = evalSpec(sp);
        if (correct === input || correct === '') return null;
        const pool = specs.filter((x) => x !== sp).map(evalSpec).filter((x) => x !== correct && x !== input && x.trim() !== '');
        pool.push(input);
        const wrong = new Set(pool.filter((p) => p !== correct));
        if (wrong.size < 3) return null;
        const cmd = `tr ${sp.args}`;
        return {
          type: 'unica',
          text: `Qual é a saída do comando abaixo?\n\n${block(`$ echo '${input}' | ${cmd}`)}`,
          options: mcq(rng, correct, [...wrong], 4),
          explanation: `${sp.why[0].toUpperCase()}${sp.why.slice(1)}. Entrada \`${input}\` → \`${correct}\`.`,
          ref: ['101:p.235-236', '101:p.237-238'],
          verify: { sh: `echo ${sq(input)} | ${cmd}; echo`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-headtail', obj: '103.2', nivel: 2, peso: 3,
    make(rng) {
      return retry(() => {
        const n = rng.int(7, 10);
        const L = rng.sample(WORDS.concat(NAMES), n);
        const f = rng.pick(['lista.txt', 'itens.txt', 'nomes.txt']);
        const k = rng.int(2, 4);
        const a = rng.int(2, n - 4); const b = a + rng.int(1, 3);
        const forms = [
          { cmd: `head -n ${k} ${f}`, out: ghead(L, k), why: `\`head -n ${k}\` mostra as **primeiras** ${k} linhas` },
          { cmd: `tail -n ${k} ${f}`, out: gtail(L, k), why: `\`tail -n ${k}\` mostra as **últimas** ${k} linhas` },
          { cmd: `head -n -${k} ${f}`, out: ghead(L, -k), why: `\`head -n -${k}\` mostra **tudo menos as últimas ${k}** linhas` },
          { cmd: `tail -n +${k} ${f}`, out: gtailFrom(L, k), why: `\`tail -n +${k}\` começa a mostrar **a partir da linha ${k}** (inclusive) até o fim` },
          { cmd: `head -n ${b} ${f} | tail -n ${b - a + 1}`, out: gtail(ghead(L, b), b - a + 1), why: `\`head -n ${b}\` guarda as ${b} primeiras linhas e \`tail -n ${b - a + 1}\` fica com as últimas ${b - a + 1} delas: linhas ${a} a ${b}` },
          { cmd: `tail -n +${a} ${f} | head -n ${b - a + 1}`, out: ghead(gtailFrom(L, a), b - a + 1), why: `\`tail -n +${a}\` começa na linha ${a} e \`head -n ${b - a + 1}\` pega ${b - a + 1} linhas a partir dali: linhas ${a} a ${b}` },
          { cmd: `tail -n ${k + 1} ${f} | head -n 1`, out: ghead(gtail(L, k + 1), 1), why: `\`tail -n ${k + 1}\` guarda as últimas ${k + 1} linhas e \`head -n 1\` fica só com a primeira delas: a ${k + 1}ª contando do fim` },
          { cmd: `head -c ${k + 3} ${f}`, out: null, why: '' },
        ].filter((x) => x.out);
        const fm = rng.pick(forms);
        const fmt = (a2) => a2.join(' ');
        const correct = fmt(fm.out);
        const pool = forms.filter((x) => x !== fm).map((x) => fmt(x.out));
        pool.push(fmt(ghead(L, k + 1)), fmt(gtail(L, k + 1)), fmt(ghead(L, k - 1)), fmt(gtailFrom(L, k + 1)), fmt(gtailFrom(L, k - 1)));
        const wrong = new Set(pool.filter((p) => p !== correct && p.trim()));
        if (wrong.size < 3) return null;
        return {
          type: 'unica',
          text: `O arquivo \`${f}\` tem ${n} linhas:\n\n${block(L.map((l, i) => `${i + 1}  ${l}`).join('\n'))}\n\n(O número à esquerda é só a numeração das linhas aqui no enunciado; ele **não** faz parte do arquivo.) Qual é a saída de \`${fm.cmd}\`? (uma linha por palavra; aqui separadas por espaço)`,
          options: mcq(rng, correct, [...wrong], 4),
          explanation: `${fm.why[0].toUpperCase()}${fm.why.slice(1)}. Resultado: ${correct}.`,
          ref: ['101:p.213-215'],
          verify: { sh: `${printfFile(f, L)}\n${fm.cmd} | paste -s -d' ' -`, expect: correct },
        };
      });
    },
  },
);
generators.push(
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-wc', obj: '103.2', nivel: 2, peso: 2,
    make(rng) {
      return retry(() => {
        const nl = rng.int(3, 6);
        const lines = Array.from({ length: nl }, () => rng.sample(WORDS, rng.int(1, 4)).join(' '));
        if (rng.chance(0.3)) lines.splice(rng.int(1, nl - 1), 0, '');
        const trailing = rng.chance(0.7);
        const text = lines.join('\n') + (trailing ? '\n' : '');
        const l = (text.match(/\n/g) ?? []).length;
        const w = text.split(/\s+/).filter(Boolean).length;
        const c = text.length;
        const longest = Math.max(...lines.map((x) => x.length));
        const opt = rng.pick(['-l', '-l', '-w', '-c', '-L']);
        const val = { '-l': l, '-w': w, '-c': c, '-L': longest }[opt];
        const f = rng.pick(['texto.txt', 'notas.txt', 'saida.txt']);
        const pool = [l + 1, l - 1, w, c, longest, lines.length, w + 1, c + 1, c - 1, val + 1, val - 1, nl + 1].filter((x) => x !== val && x > 0);
        const wrong = [...new Set(pool.map(String))];
        const why = { '-l': 'o `wc -l` conta **caracteres de nova linha** (`\\n`), não "linhas visuais": se a última linha não termina com `\\n`, ela não entra na contagem', '-w': '`wc -w` conta palavras (sequências separadas por espaços, tabs ou quebras de linha)', '-c': '`wc -c` conta **bytes** — cada caractere ASCII é 1 byte e cada `\\n` também conta', '-L': '`wc -L` mostra o comprimento da **linha mais longa**' }[opt];
        const shown = lines.map((x) => JSON.stringify(x).slice(1, -1)).join('\\n') + (trailing ? '\\n' : '');
        return {
          type: 'unica',
          text: `O arquivo \`${f}\` foi criado assim:\n\n${block(`$ printf '${shown}' > ${f}`)}\n\nQue número o comando \`wc ${opt} < ${f}\` imprime?`,
          options: mcq(rng, String(val), wrong, 4),
          explanation: `${why[0].toUpperCase()}${why.slice(1)}. Aqui: ${l} quebras de linha, ${w} palavras, ${c} bytes e linha mais longa com ${longest} caracteres${trailing ? '' : ' (a última linha não termina em `\\n`)'}. Resposta: ${val}.`,
          ref: ['101:p.215', '101:p.227-228'],
          verify: { sh: `printf '${shown}' > ${f}\nwc ${opt} < ${f}`, expect: String(val) },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-nl', obj: '103.2', nivel: 3, peso: 2,
    make(rng) {
      return retry(() => {
        const n = rng.int(5, 9);
        const lines = Array.from({ length: n }, () => (rng.chance(0.28) ? '' : rng.pick(WORDS.concat(NAMES))));
        if (lines.filter((x) => x === '').length < 1 || lines.filter((x) => x !== '').length < 3) return null;
        const f = rng.pick(['texto.txt', 'lista.txt', 'doc.txt']);
        const forms = [
          { cmd: `nl ${f}`, num: () => gnl(lines), why: '`nl` numera **apenas as linhas não vazias** por padrão (`-b t`); as linhas em branco ficam sem número' },
          { cmd: `nl -b a ${f}`, num: () => gnl(lines, { b: 'a' }), why: '`-b a` manda numerar **todas** as linhas, inclusive as vazias' },
          { cmd: `cat -n ${f}`, num: () => gnl(lines, { b: 'a' }), why: '`cat -n` numera todas as linhas, vazias ou não' },
          { cmd: `cat -b ${f}`, num: () => gnl(lines, { b: 't' }), why: '`cat -b` numera só as linhas não vazias (como o `nl` padrão)' },
          { cmd: `nl -v 10 ${f}`, num: () => gnl(lines, { v: 10 }), why: '`-v 10` faz a numeração começar em 10 (e só as linhas não vazias são numeradas)' },
          { cmd: `nl -b a -i 5 ${f}`, num: () => gnl(lines, { b: 'a', i: 5 }), why: '`-b a` numera todas as linhas e `-i 5` soma 5 a cada número (1, 6, 11, ...)' },
          { cmd: `nl -v 100 -b a ${f}`, num: () => gnl(lines, { b: 'a', v: 100 }), why: '`-v 100` define o primeiro número e `-b a` numera inclusive as linhas vazias' },
        ];
        const fm = rng.pick(forms);
        const last = (r) => [...r].reverse().find((x) => x.num !== null).num;
        const correct = String(last(fm.num()));
        const wrong = [...new Set(forms.filter((x) => x !== fm).map((x) => String(last(x.num()))).concat([String(Number(correct) + 1), String(Number(correct) - 1)]).filter((x) => x !== correct && Number(x) > 0))];
        if (wrong.length < 3) return null;
        const shown = lines.map((x) => JSON.stringify(x).slice(1, -1)).join('\\n') + '\\n';
        return {
          type: 'unica',
          text: `O arquivo \`${f}\` tem ${n} linhas, algumas em branco:\n\n${block(lines.map((x) => (x === '' ? '(linha em branco)' : x)).join('\n'))}\n\nQual é o **maior número** que aparece na saída de \`${fm.cmd}\`?`,
          options: mcq(rng, correct, wrong, 4),
          explanation: `${fm.why[0].toUpperCase()}${fm.why.slice(1)}. Há ${lines.filter((x) => x === '').length} ${lines.filter((x) => x === '').length === 1 ? 'linha em branco' : 'linhas em branco'} e ${lines.filter((x) => x !== '').length} com texto; o último número impresso é ${correct}.`,
          ref: ['101:p.214', '101:p.227-228'],
          verify: { sh: `printf '${shown}' > ${f}\n${fm.cmd} | sed -n 's/^ *\\([0-9][0-9]*\\)\\t.*/\\1/p' | tail -n 1`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-cat-show', obj: '103.2', nivel: 3, peso: 1,
    make(rng) {
      return retry(() => {
        const flag = rng.pick(['-E', '-T', '-A', '-A', '-sE']);
        const n = rng.int(2, 3);
        const hasTab = flag === '-T' || flag === '-A';
        const items = Array.from({ length: n }, () => {
          const a = rng.pick(WORDS); const b = rng.pick(NAMES);
          const kind = rng.pick(flag === '-T' ? ['tab', 'tab', 'plain'] : hasTab ? ['tab', 'tab', 'trail', 'plain'] : ['trail', 'plain', 'plain']);
          if (kind === 'tab') return `${a}\t${b}`;
          if (kind === 'trail') return `${a} ${b} `;
          return `${a} ${b}`;
        });
        if (flag === '-sE') items.splice(1, 0, '', '');
        const text = items.join('\n') + '\n';
        const catShow = (t, fl) => {
          let lines = t.slice(0, -1).split('\n');
          if (fl.includes('s')) { const o = []; for (const l of lines) if (!(l === '' && o[o.length - 1] === '')) o.push(l); lines = o; }
          return lines.map((l) => {
            let x = l;
            if (/[AT]/.test(fl)) x = x.replace(/\t/g, '^I');
            if (/[AE]/.test(fl)) x += '$';
            return x;
          });
        };
        const outs = catShow(text, flag);
        const correct = outs.join(' | ');
        const alt = ['-E', '-T', '-A', '-sE'].filter((x) => x !== flag).map((x) => catShow(text, x).join(' | '));
        const wrong = [...new Set(alt.filter((a) => a !== correct && !a.includes('\t')))];
        // usa a mesma notação sem `$`/^I como erro típico
        wrong.push(outs.map((l) => l.replace(/\$$/, '').replace(/\^I/g, ' ')).join(' | '));
        const wr = [...new Set(wrong)].filter((x) => x !== correct && x.trim());
        if (wr.length < 3) return null;
        const shown = items.map((x) => JSON.stringify(x).slice(1, -1)).join('\\n') + '\\n';
        const why = { '-E': '`-E` (`--show-ends`) marca o fim de cada linha com `$` (assim se vê espaço sobrando no fim)', '-T': '`-T` (`--show-tabs`) mostra cada TAB como `^I`', '-A': '`-A` (`--show-all`) equivale a `-vET`: mostra TABs como `^I` e o fim de cada linha com `$`', '-sE': '`-s` comprime linhas em branco consecutivas em uma só e `-E` marca o fim de cada linha com `$` (uma linha vazia aparece só como `$`)' }[flag];
        return {
          type: 'unica',
          text: `O arquivo \`t.txt\` foi criado com o comando abaixo (\`\\t\` é um caractere TAB):\n\n${block(`$ printf '${shown}' > t.txt`)}\n\nQual é a saída de \`cat ${flag} t.txt\`? (uma linha de saída por linha do arquivo, separadas aqui por \` | \`)`,
          options: mcq(rng, correct, wr, 4),
          explanation: `${why[0].toUpperCase()}${why.slice(1)}. Saída: ${correct}.`,
          ref: ['101:p.209-210'],
          verify: { sh: `printf '${shown}' > t.txt\ncat ${flag} t.txt | paste -s -d'|' - | sed 's/|/ | /g'`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-paste', obj: '103.2', nivel: 2, peso: 2,
    make(rng) {
      return retry(() => {
        const nf = rng.int(2, 3);
        const len = rng.int(2, 4);
        const pools = [rng.sample(NAMES, 4), rng.sample(['10', '20', '30', '40', '55'], 4), rng.sample(['rio', 'sao', 'bh', 'poa', 'rec'], 4)];
        const files = Array.from({ length: nf }, (_, i) => pools[i].slice(0, len - (rng.chance(0.25) && i > 0 ? 1 : 0)));
        const fnames = ['a.txt', 'b.txt', 'c.txt'].slice(0, nf);
        const dsel = rng.pick([',', ':', ';', '-', ',;', '+-']);
        const serial = rng.chance(0.3);
        const dq = dsel.length > 1 || dsel === ';' ? `-d'${dsel}'` : `-d${dsel}`;
        const cmd = `paste ${serial ? '-s ' : ''}${dq} ${fnames.join(' ')}`;
        const run = (o) => gpaste(files, o);
        const correct = run({ d: dsel, s: serial }).join(' | ');
        const pool = [run({ d: dsel, s: !serial }), run({ d: '\t', s: serial }).map((x) => x.replace(/\t/g, '⇥')), run({ d: dsel[0], s: serial }), run({ d: [...dsel].reverse().join(''), s: serial }),
          files.map((f) => f.join(dsel[0])), [].concat(...files)].map((a) => a.join(' | '));
        const wrong = [...new Set(pool)].filter((x) => x !== correct && !x.includes('⇥'));
        if (wrong.length < 3) return null;
        const show = files.map((f, i) => `${fnames[i]}: ${f.join(' ')}`).join('\n');
        return {
          type: 'unica',
          text: `Os arquivos abaixo têm uma palavra por linha (aqui cada um aparece em uma linha, com os itens separados por espaço):\n\n${block(show)}\n\nQual é a saída de \`${cmd}\`? (uma linha de saída por linha impressa, separadas aqui por \` | \`)`,
          options: mcq(rng, correct, wrong, 4),
          explanation: `\`paste\` junta linhas **correspondentes** dos arquivos (a linha 1 de cada um, depois a linha 2...) separadas pelo delimitador de \`-d\` (padrão: TAB). ${dsel.length > 1 ? `Com mais de um caractere em \`-d\`, os delimitadores são usados **em rodízio**, um por junção (\`${[...dsel].join('`, `')}\`, \`${dsel[0]}\`, ...). ` : ''}${serial ? 'Com `-s` ("serial") cada arquivo vira **uma linha** (os itens do mesmo arquivo juntos). ' : ''}Se um arquivo tem menos linhas, o campo fica vazio mas o delimitador permanece. Saída: ${correct}.`,
          ref: ['101:p.225-226', '101:p.235-236'],
          verify: { sh: `${files.map((f, i) => printfFile(fnames[i], f)).join('\n')}\n${cmd} | paste -s -d'|' - | sed 's/|/ | /g'`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-sed', obj: '103.2', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const fam = rng.weighted(['sub', 'addr', 'ops'], (x) => ({ sub: 4, addr: 3, ops: 3 }[x]));
        const f = rng.pick(['arq.txt', 'dados.txt', 'ftu.txt']);
        const run = (lines, v) => v.fn(lines);
        let lines; let cases; let pick;
        if (fam === 'sub') {
          lines = rng.shuffle(['banana', 'alfa beta alfa', 'abacaxi', 'gama', 'cana de acucar', 'papaya', 'java banana']).slice(0, 3);
          const ch = rng.pick(['a', 'an', 'al']);
          const to = rng.pick(['X', 'O', '#']);
          const repl = (s, g, nth) => {
            let i = 0;
            return s.replace(new RegExp(ch, 'g'), (m) => { i++; if (g) return to; return i === (nth ?? 1) ? to : m; });
          };
          cases = [
            { s: `s/${ch}/${to}/`, n: false, fn: (L) => L.map((x) => repl(x, false)), why: `\`s/${ch}/${to}/\` troca só a **primeira** ocorrência de \`${ch}\` em cada linha` },
            { s: `s/${ch}/${to}/g`, n: false, fn: (L) => L.map((x) => repl(x, true)), why: `o flag \`g\` troca **todas** as ocorrências em cada linha` },
            { s: `s/${ch}/${to}/2`, n: false, fn: (L) => L.map((x) => repl(x, false, 2)), why: `o número \`2\` no final troca somente a **segunda** ocorrência em cada linha` },
            { s: `s/${ch}/${to}/gp`, n: true, fn: (L) => L.filter((x) => x.includes(ch)).map((x) => repl(x, true)), why: `com \`-n\`, só as linhas em que \`s///\` fez substituição e que têm o flag \`p\` são impressas` },
          ];
          pick = rng.pick(cases.slice(0, 3));
        } else if (fam === 'addr') {
          lines = rng.sample(WORDS.concat(NAMES), rng.int(5, 6));
          const k = rng.int(2, 3); const m = k + rng.int(1, 2);
          const w = lines[rng.int(1, lines.length - 2)];
          cases = [
            { s: `${k}p`, n: true, fn: (L) => [L[k - 1]], why: `\`-n\` suprime a impressão automática e \`${k}p\` imprime só a linha ${k}` },
            { s: `${k},${m}p`, n: true, fn: (L) => L.slice(k - 1, m), why: `com \`-n\`, \`${k},${m}p\` imprime as linhas ${k} a ${m}` },
            { s: `${k},${m}d`, n: false, fn: (L) => L.filter((_, i) => i + 1 < k || i + 1 > m), why: `sem \`-n\`, o sed imprime tudo, exceto as linhas ${k} a ${m}, apagadas por \`d\`` },
            { s: `${k}d`, n: false, fn: (L) => L.filter((_, i) => i + 1 !== k), why: `\`${k}d\` apaga a linha ${k}; as demais são impressas` },
            { s: '$d', n: false, fn: (L) => L.slice(0, -1), why: '`$` representa a última linha; `$d` a apaga' },
            { s: '$p', n: true, fn: (L) => [L[L.length - 1]], why: '`-n` + `$p` imprime só a última linha' },
            { s: `/${w}/d`, n: false, fn: (L) => L.filter((x) => !x.includes(w)), why: `\`/${w}/d\` apaga as linhas que contêm \`${w}\`` },
            { s: `/${w}/p`, n: true, fn: (L) => L.filter((x) => x.includes(w)), why: `com \`-n\`, \`/${w}/p\` imprime só as linhas que contêm \`${w}\`` },
            { s: `/${w}/p`, n: false, fn: (L) => L.flatMap((x) => (x.includes(w) ? [x, x] : [x])), why: `**sem** \`-n\`, além da impressão automática de todas as linhas, \`p\` imprime de novo as que casam: elas saem duplicadas` },
            { s: `/${w}/!d`, n: false, fn: (L) => L.filter((x) => x.includes(w)), why: `\`!d\` apaga as linhas que **não** contêm \`${w}\` (só ficam as que casam)` },
            { s: `${k}q`, n: false, fn: (L) => L.slice(0, k), why: `\`${k}q\` imprime até a linha ${k} e encerra (quit)` },
          ];
          pick = rng.pick(cases);
        } else {
          lines = rng.sample(['host01:eth0', 'root:x:0', 'tux:1000:bash', 'ana 25 anos', 'cod42 item7', 'linha sem digitos', 'a1b22c333', '# comentario', 'chave=valor', 'dir/arq.txt'], 3);
          cases = [
            { s: 's/^/> /', n: false, fn: (L) => L.map((x) => `> ${x}`), why: '`^` ancora no início da linha: `s/^/> /` acrescenta `> ` antes de cada linha' },
            { s: 's/$/;/', n: false, fn: (L) => L.map((x) => `${x};`), why: '`$` ancora no fim da linha: `s/$/;/` acrescenta `;` ao final' },
            { s: 's/[0-9]//g', n: false, fn: (L) => L.map((x) => x.replace(/[0-9]/g, '')), why: '`[0-9]` casa qualquer algarismo; trocar por nada com `g` apaga todos' },
            { s: 's/[0-9]\\+/<&>/g', n: false, fn: (L) => L.map((x) => x.replace(/[0-9]+/g, (m) => `<${m}>`)), why: '`[0-9]\\+` casa uma ou mais sequências de dígitos e `&` representa o trecho casado: cada número ganha `<` `>` em volta' },
            { s: 's/[aeiou]/_/g', n: false, fn: (L) => L.map((x) => x.replace(/[aeiou]/g, '_')), why: '`[aeiou]` casa qualquer vogal minúscula; com `g` todas viram `_`' },
            { s: 's/\\(.*\\):\\(.*\\)/\\2:\\1/', n: false, fn: (L) => L.map((x) => x.replace(/(.*):(.*)/, '$2:$1')), why: '`\\(...\\)` guarda trechos; `\\1` e `\\2` os reutilizam. Como `.*` é "ganancioso", o primeiro grupo vai até o **último** `:` da linha, e os dois lados trocam de lugar' },
            { s: 's/.*/(&)/', n: false, fn: (L) => L.map((x) => `(${x})`), why: '`.*` casa a linha toda e `&` a reinsere: a linha fica entre parênteses' },
            { s: '/^#/d', n: false, fn: (L) => L.filter((x) => !x.startsWith('#')), why: '`/^#/d` apaga as linhas que **começam** com `#` (comentários)' },
            { s: 'y/abc/ABC/', n: false, fn: (L) => L.map((x) => x.replace(/[abc]/g, (m) => m.toUpperCase())), why: '`y/abc/ABC/` traduz caractere a caractere (como o `tr`): a→A, b→B, c→C' },
          ];
          pick = rng.pick(cases);
        }
        const out = (c) => c.fn(lines);
        const correct = showJoin(out(pick));
        const wrong = [...new Set(cases.filter((c) => c !== pick).map((c) => showJoin(out(c))).concat([showJoin(lines), showJoin(out(pick).slice().reverse())]))].filter((x) => x !== correct);
        if (out(pick).join('|') === lines.join('|')) return null;
        if (wrong.length < 3) return null;
        const cmd = `sed ${pick.n ? '-n ' : ''}${sq(pick.s)} ${f}`;
        return {
          type: 'unica',
          text: `O arquivo \`${f}\` contém:\n\n${block(lines.join('\n'))}\n\nQual é a saída de \`${cmd}\`? (uma linha de saída por linha impressa, separadas aqui por \` | \`)`,
          options: mcq(rng, correct, wrong, 4),
          explanation: `${pick.why[0].toUpperCase()}${pick.why.slice(1)}. Saída: ${correct}.`,
          ref: ['101:p.215-218', '101:p.230-233'],
          verify: { sh: `${printfFile(f, lines)}\nr=$(${cmd} | paste -s -d'|' - | sed 's/|/ | /g'); echo "\${r:-(nenhuma saída)}"`, expect: correct },
        };
      });
    },
  },
);
generators.push(
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-od', obj: '103.2', nivel: 3, peso: 2,
    make(rng) {
      return retry(() => {
        const fmt = rng.weighted(['bytes', 'rev', 'size'], (x) => ({ bytes: 4, rev: 2, size: 3 }[x]));
        const chars = (s) => [...s].map((c) => c.charCodeAt(0));
        const FORMATS = {
          '-tx1': (n) => n.toString(16).padStart(2, '0'),
          '-to1': (n) => n.toString(8).padStart(3, '0'),
          '-tu1': (n) => String(n).padStart(3, ' ').trim(),
          '-td1': (n) => String(n),
        };
        if (fmt === 'bytes') {
          const s = rng.pick(['LPI', 'Tux', 'bash', 'ls -l', 'AZaz', 'abc\\n', 'sh', 'Hi!', '2024', 'root\\n']);
          const raw = s.replace(/\\n/g, '\n');
          const codes = chars(raw);
          const opt = rng.pick(Object.keys(FORMATS));
          const render = (o, arr = codes) => arr.map(FORMATS[o]).join(' ');
          const correct = render(opt);
          const pool = [...Object.keys(FORMATS).filter((o) => o !== opt).map((o) => render(o)), render(opt, [...codes].reverse()), render(opt, codes.map((c) => c + 1)), render(opt, codes.map((c) => c - 1))];
          const wrong = [...new Set(pool)].filter((x) => x !== correct);
          if (wrong.length < 3) return null;
          const names = { '-tx1': 'hexadecimal', '-to1': 'octal (3 dígitos)', '-tu1': 'decimal sem sinal', '-td1': 'decimal com sinal' };
          return {
            type: 'unica',
            text: `Qual é a saída de \`printf '${s}' | od -An ${opt}\`? (O \`-An\` suprime a coluna de endereços; os bytes aparecem separados por espaço e o recuo à esquerda deve ser ignorado.)`,
            options: mcq(rng, correct, wrong, 4),
            explanation: `\`od -t${opt.slice(2)}\` mostra cada byte do fluxo em ${names[opt]} (\`x\` = hexa, \`o\` = octal, \`u\` = decimal sem sinal, \`d\` = decimal com sinal; o \`1\` indica 1 byte por item). Códigos ASCII: ${[...raw].map((c, i) => `${c === '\n' ? '\\n' : c} = ${codes[i]}`).join(', ')}. Saída: ${correct}.`,
            ref: ['101:p.220-221'],
            verify: { sh: `printf '${s}' | od -An ${opt} | tr -s ' ' | sed 's/^ //'`, expect: correct },
          };
        }
        if (fmt === 'rev') {
          const s = rng.pick(['LPI', 'Tux', 'bash', 'root', 'sudo', 'Linux', 'vim', 'sed', 'tr', 'cat']);
          const hex = chars(s).map(FORMATS['-tx1']).join(' ');
          const wrong = [...new Set([s.toUpperCase() === s ? s.toLowerCase() : s.toUpperCase(), [...s].reverse().join(''), s.slice(0, -1) + String.fromCharCode(s.charCodeAt(s.length - 1) + 1), String.fromCharCode(s.charCodeAt(0) + 1) + s.slice(1), s.slice(1)])].filter((x) => x !== s);
          if (wrong.length < 3) return null;
          return {
            type: 'unica',
            text: `A saída de um comando \`od -An -tx1\` foi:\n\n${block(' ' + hex)}\n\nQue texto (sem quebra de linha) foi enviado ao \`od\`? (Tabela ASCII: \`A\` = 41, \`a\` = 61, \`0\` = 30; todos os valores estão em hexadecimal.)`,
            options: mcq(rng, s, wrong, 4),
            explanation: `Cada par hexadecimal é um byte: ${chars(s).map((c, i) => `${FORMATS['-tx1'](c)} = ${s[i]}`).join(', ')}. Texto: ${s}.`,
            ref: ['101:p.220-221'],
            verify: { sh: `printf '${s}' | od -An -tx1 | tr -s ' ' | sed 's/^ //'`, expect: hex },
          };
        }
        // size: última linha de `od` mostra o total de bytes (em octal por padrão)
        const nl = rng.int(3, 6);
        const lines = Array.from({ length: nl }, () => rng.sample(WORDS, rng.int(1, 3)).join(' '));
        const text = lines.join('\n') + '\n';
        const size = text.length;
        const radix = rng.pick(['', '', '-Ad', '-Ax']);
        const last = radix === '-Ad' ? String(size).padStart(7, '0') : radix === '-Ax' ? size.toString(16).padStart(6, '0') : size.toString(8).padStart(7, '0');
        const f = rng.pick(['ftu.txt', 'amostra.txt', 'dados.txt']);
        const shown = lines.map((x) => JSON.stringify(x).slice(1, -1)).join('\\n') + '\\n';
        if (rng.chance(0.5)) {
          const wrong = [...new Set([String(size).padStart(7, '0'), size.toString(8).padStart(7, '0'), size.toString(16).padStart(6, '0'), (size + 1).toString(8).padStart(7, '0'), String(size - 1).padStart(7, '0')])].filter((x) => x !== last);
          if (wrong.length < 3) return null;
          return {
            type: 'unica',
            text: `O arquivo \`${f}\` foi criado com \`printf '${shown}' > ${f}\` e tem **${size} bytes**. Qual é a última linha da saída de \`od ${radix ? radix + ' ' : ''}${f}\`?`,
            options: mcq(rng, last, wrong, 4),
            explanation: `A última linha do \`od\` mostra apenas o **deslocamento final**, isto é, o tamanho do arquivo. Por padrão o deslocamento é em **octal** com 7 dígitos; \`-Ad\` o mostra em decimal (7 dígitos) e \`-Ax\` em hexadecimal (6 dígitos). Aqui o tamanho é ${size}: em octal ${size.toString(8)}, em hexadecimal ${size.toString(16)}. ${radix === '-Ad' ? 'Com `-Ad`: ' : radix === '-Ax' ? 'Com `-Ax`: ' : 'Sem opção de endereço (octal): '}\`${last}\`.`,
            ref: ['101:p.220-221'],
            verify: { sh: `printf '${shown}' > ${f}\nod ${radix} ${f} | tail -n 1`, expect: last },
          };
        }
        const octalOff = size.toString(8).padStart(7, '0');
        return {
          type: 'lacuna',
          text: `A última linha da saída de \`od ${f}\` (sem opções de endereço) é \`${octalOff}\`. Quantos **bytes** (em decimal) tem o arquivo \`${f}\`?`,
          answers: [String(size)],
          explanation: `A última linha do \`od\` mostra o deslocamento final, em octal por padrão: ${octalOff} (octal) = ${size} (decimal). Conversão: ${[...octalOff.replace(/^0+/, '')].map((d, i, a) => `${d}×8^${a.length - 1 - i}`).join(' + ')} = ${size}.`,
          ref: ['101:p.220-221'],
          verify: { sh: `printf '${shown}' > ${f}\nod ${f} | tail -n 1`, expect: octalOff },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-split', obj: '103.2', nivel: 3, peso: 2,
    make(rng) {
      return retry(() => {
        const M = rng.int(7, 25);
        const f = rng.pick(['livro.txt', 'log.txt', 'dados.txt', 'grande.txt']);
        const mode = rng.weighted(['l', 'b'], (x) => ({ l: 4, b: 2 }[x]));
        const suffix = (i, len, num) => {
          if (num) return String(i).padStart(len, '0');
          let s = ''; let v = i;
          for (let k = 0; k < len; k++) { s = String.fromCharCode(97 + (v % 26)) + s; v = Math.floor(v / 26); }
          return s;
        };
        const content = Array.from({ length: M }, (_, i) => `l${i + 1}`); // linhas de tamanho conhecido
        const bytes = content.join('\n').length + 1;
        const K = mode === 'l' ? rng.int(2, 6) : rng.int(8, 20);
        const total = mode === 'l' ? M : bytes;
        const nFiles = Math.ceil(total / K);
        if (nFiles < 3 || nFiles > 10) return null;
        const prefix = rng.pick(['', '', 'parte_', 'p', 'seg-']);
        const useD = rng.chance(0.4);
        const alen = rng.pick([2, 2, 2, 3]);
        const addSuf = rng.chance(0.2) ? '.txt' : '';
        const px = prefix || 'x';
        const names = Array.from({ length: nFiles }, (_, i) => `${px}${suffix(i, alen, useD)}${addSuf}`);
        const cmd = `split -${mode} ${K}${useD ? ' -d' : ''}${alen === 3 ? ' -a 3' : ''}${addSuf ? ` --additional-suffix=${addSuf}` : ''} ${f}${prefix ? ' ' + prefix : ''}`;
        const q = rng.pick(['names', 'count', 'last']);
        const lastSize = total - K * (nFiles - 1);
        let text; let correct; let pool; let expl; let sh;
        const ls = `ls | grep -v '^${f}$'`;
        if (q === 'names') {
          const lastN = rng.pick([2, 3]);
          correct = names.slice(-lastN).join(' ');
          const alt = (o) => Array.from({ length: nFiles }, (_, i) => `${o.px ?? px}${suffix(i, o.len ?? alen, o.num ?? useD)}${o.suf ?? addSuf}`).slice(-lastN).join(' ');
          pool = [alt({ num: !useD }), alt({ len: alen === 2 ? 3 : 2 }), alt({ px: prefix ? 'x' : 'part' }), alt({ suf: addSuf ? '' : '.txt' }), names.slice(0, lastN).join(' '), Array.from({ length: nFiles + 1 }, (_, i) => `${px}${suffix(i, alen, useD)}${addSuf}`).slice(-lastN).join(' ')];
          text = `O arquivo \`${f}\` tem ${mode === 'l' ? `${M} linhas` : `${bytes} bytes`}. Depois de \`${cmd}\`, quais são os **${lastN} últimos** nomes de arquivo criados, em ordem alfabética?`;
          expl = `\`split -${mode} ${K}\` ${mode === 'l' ? `cria arquivos de ${K} linhas` : `cria arquivos de ${K} bytes`}; com ${total} ${mode === 'l' ? 'linhas' : 'bytes'} saem ⌈${total}/${K}⌉ = ${nFiles} arquivos. ${prefix ? `O prefixo informado é \`${prefix}\`` : 'Sem prefixo, o padrão é `x`'}; os sufixos são ${useD ? 'numéricos (`-d`)' : 'letras (aa, ab, ...)'} com ${alen} posições${alen === 3 ? ' (`-a 3`)' : ''}${addSuf ? `, seguidos de \`${addSuf}\` (\`--additional-suffix\`)` : ''}. Últimos nomes: ${correct}.`;
          sh = `${ls} | tail -n ${lastN} | paste -s -d' ' -`;
        } else if (q === 'count') {
          correct = String(nFiles);
          pool = [nFiles - 1, nFiles + 1, Math.floor(total / K), Math.ceil(total / K) + 2, K].map(String);
          text = `O arquivo \`${f}\` tem ${mode === 'l' ? `${M} linhas` : `${bytes} bytes`}. Quantos arquivos \`${cmd}\` cria?`;
          expl = `${total} ${mode === 'l' ? 'linhas' : 'bytes'} em pedaços de ${K}: ⌈${total}/${K}⌉ = ${nFiles} arquivos (o último guarda o que sobra: ${lastSize}).`;
          sh = `${ls} | wc -l`;
        } else {
          correct = String(lastSize);
          pool = [K, K - 1, lastSize + 1, lastSize - 1, total % K === 0 ? K + 1 : total % K + K].map(String);
          text = `O arquivo \`${f}\` tem ${mode === 'l' ? `${M} linhas` : `${bytes} bytes`} (cada linha é do tipo \`l1\`, \`l2\`, ...). Depois de \`${cmd}\`, ${mode === 'l' ? 'quantas linhas' : 'quantos bytes'} tem o **último** arquivo criado?`;
          expl = `Os primeiros ${nFiles - 1} arquivos têm ${K} ${mode === 'l' ? 'linhas' : 'bytes'} cada (${K * (nFiles - 1)} no total); sobram ${total} − ${K * (nFiles - 1)} = ${lastSize} para o último arquivo.`;
          sh = mode === 'l' ? `wc -l < "$(${ls} | tail -n 1)"` : `wc -c < "$(${ls} | tail -n 1)"`;
        }
        const wrong = [...new Set(pool.map(String))].filter((x) => x !== correct && x !== '0' && !x.startsWith('-'));
        if (wrong.length < 3) return null;
        const seqCmd = `for i in $(seq 1 ${M}); do echo "l$i"; done > ${f}`;
        return {
          type: 'unica',
          text,
          options: mcq(rng, correct, wrong, 4),
          explanation: expl,
          ref: ['101:p.237'],
          verify: { sh: `cd "$(mktemp -d)"\n${seqCmd}\n${cmd}\n${sh}`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-checksum-len', obj: '103.2', nivel: 1, peso: 2,
    make(rng) {
      return retry(() => {
        const ALG = [
          { c: 'md5sum', n: 32, bits: 128, name: 'MD5' },
          { c: 'sha1sum', n: 40, bits: 160, name: 'SHA-1' },
          { c: 'sha256sum', n: 64, bits: 256, name: 'SHA-256' },
          { c: 'sha512sum', n: 128, bits: 512, name: 'SHA-512' },
        ];
        const a = rng.pick(ALG);
        const fmt = rng.pick(['cmd', 'len']);
        if (fmt === 'cmd') {
          const wrong = ALG.filter((x) => x !== a).map((x) => x.c);
          return {
            type: 'unica',
            text: `Qual comando calcula um resumo (hash) que aparece como **${a.n} caracteres hexadecimais** no início da linha de saída?`,
            options: mcq(rng, a.c, [...wrong, 'cksum'], 4),
            explanation: `Cada caractere hexadecimal representa 4 bits: ${a.name} produz ${a.bits} bits = ${a.bits}/4 = ${a.n} caracteres. Os demais: ${ALG.filter((x) => x !== a).map((x) => `\`${x.c}\` → ${x.n}`).join(', ')}. (\`cksum\` imprime um CRC numérico curto, não um hash hexadecimal.)`,
            ref: ['101:p.218-220'],
            verify: { sh: `printf 'lpic' | ${a.c} | cut -d' ' -f1 | tr -d '\\n' | wc -c`, expect: String(a.n) },
          };
        }
        return {
          type: 'lacuna',
          text: `Quantos caracteres hexadecimais tem o resumo impresso por \`${a.c}\` (o primeiro campo da saída, sem contar o nome do arquivo)?`,
          answers: [String(a.n)],
          explanation: `\`${a.c}\` calcula ${a.name}, que gera ${a.bits} bits; cada caractere hexadecimal vale 4 bits, então são ${a.bits} ÷ 4 = ${a.n} caracteres.`,
          ref: ['101:p.218-220'],
          verify: { sh: `printf 'lpic' | ${a.c} | cut -d' ' -f1 | tr -d '\\n' | wc -c`, expect: String(a.n) },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-checksum-verify', obj: '103.2', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const alg = rng.pick(['md5sum', 'sha256sum', 'sha512sum']);
        const nf = rng.int(5, 6);
        const names = rng.sample(['relatorio.txt', 'dados.csv', 'notas.md', 'backup.tar', 'script.sh', 'config.ini', 'log.txt', 'foto.jpg'], nf);
        const acts = [
          { id: 'append', cmd: (n) => `echo extra >> ${n}`, bad: true, say: (n) => `\`echo extra >> ${n}\` (acrescenta uma linha)` },
          { id: 'sedA', cmd: (n) => `sed -i 's/a/A/' ${n}`, bad: true, say: (n) => `\`sed -i 's/a/A/' ${n}\` (troca um \`a\` por \`A\` dentro do arquivo)` },
          { id: 'trunc', cmd: (n) => `: > ${n}`, bad: true, say: (n) => `\`: > ${n}\` (esvazia o arquivo)` },
          { id: 'rm', cmd: (n) => `rm ${n}`, bad: true, say: (n) => `\`rm ${n}\` (apaga o arquivo)` },
          { id: 'touch', cmd: (n) => `touch ${n}`, bad: false, say: (n) => `\`touch ${n}\` (só muda a data de modificação)` },
          { id: 'chmod', cmd: (n) => `chmod 600 ${n}`, bad: false, say: (n) => `\`chmod 600 ${n}\` (só muda as permissões)` },
          { id: 'cp', cmd: (n) => `cp ${n} ${n}.bak`, bad: false, say: (n) => `\`cp ${n} ${n}.bak\` (cria uma cópia)` },
          { id: 'same', cmd: (n) => `cat ${n} > ${n}.tmp && mv ${n}.tmp ${n}`, bad: false, say: (n) => `regrava o mesmo conteúdo (\`cat ${n} > ${n}.tmp && mv ${n}.tmp ${n}\`)` },
          { id: 'none', cmd: null, bad: false, say: () => '' },
        ];
        const nBad = rng.int(2, 3);
        const badIdx = rng.sample([...Array(nf).keys()], nBad);
        const plan = names.map((n, i) => {
          if (badIdx.includes(i)) return rng.pick(acts.filter((a) => a.bad));
          return rng.pick(acts.filter((a) => !a.bad));
        });
        const contents = names.map(() => `${rng.pick(WORDS)} ${rng.pick(WORDS)} banana`);
        const listing = names.map((n, i) => (plan[i].cmd ? plan[i].say(n) : null)).filter(Boolean);
        if (listing.length < 3) return null;
        const failing = names.filter((_, i) => plan[i].bad);
        const sums = 'SUMS';
        const sumsCmd = `${alg} ${names.join(' ')} > ${sums}`;
        const options = multi(rng, failing, names.filter((n) => !failing.includes(n)), nf - nBad);
        const shuffled = options;
        const setup = names.map((n, i) => `echo ${sq(contents[i])} > ${n}`).join('\n');
        const apply = names.map((n, i) => (plan[i].cmd ? plan[i].cmd(n) : '')).filter(Boolean).join('\n');
        const verifySh = `cd "$(mktemp -d)"\n${setup}\n${sumsCmd}\n${apply}\n${alg} -c ${sums} 2>/dev/null | grep -v ': OK$' | cut -d: -f1 | sort | paste -s -d' ' -`;
        return {
          type: 'multipla',
          text: `Foi gerado um arquivo de somas de verificação:\n\n${block(`$ ${sumsCmd}`)}\n\nDepois disso, foram feitas as alterações abaixo (os arquivos não citados ficaram intactos):\n\n${listing.map((x) => '* ' + x).join('\n')}\n\nQuais arquivos são relatados como **FAILED** (ou como não lidos) quando se executa \`${alg} -c ${sums}\`?`,
          options: shuffled,
          explanation: `\`${alg} -c\` recalcula o resumo de cada arquivo listado e compara com o valor gravado. Muda o resumo qualquer alteração no **conteúdo** (acrescentar, esvaziar, trocar um caractere) e também o desaparecimento do arquivo (\`FAILED open or read\`). **Não** muda: \`touch\` (só altera a data), \`chmod\` (permissões), copiar o arquivo ou regravar o mesmo conteúdo — o hash depende só dos bytes. Falharam: ${failing.join(', ')}.`,
          ref: ['101:p.218-220'],
          verify: { sh: verifySh, expect: [...failing].sort().join(' ') },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'ft-zcat', obj: '103.2', nivel: 1, peso: 1,
    make(rng) {
      return retry(() => {
        const C = [
          { comp: 'gzip', ext: 'gz', cat: 'zcat', alt: 'gunzip -c', unc: 'gunzip' },
          { comp: 'bzip2', ext: 'bz2', cat: 'bzcat', alt: 'bunzip2 -c', unc: 'bunzip2' },
          { comp: 'xz', ext: 'xz', cat: 'xzcat', alt: 'unxz -c', unc: 'unxz' },
        ];
        const c = rng.pick(C);
        const f = rng.pick(['relatorio', 'dados', 'log', 'notas']);
        const wrong = [...C.filter((x) => x !== c).map((x) => x.cat), 'cat', 'less'];
        const options = mcq(rng, c.cat, wrong, 4);
        const probes = options.map((o) => `out=$({ ${o.t} ${f}.txt.${c.ext}; } 2>/dev/null | tr -d '\\000'); [ "$out" = "linha um" ] && echo S || echo N`);
        return {
          type: 'unica',
          text: `O arquivo \`${f}.txt.${c.ext}\` foi criado com \`${c.comp} ${f}.txt\`. Qual comando mostra o texto original na tela **sem descompactar o arquivo em disco** (o \`.${c.ext}\` continua existindo)?`,
          options,
          explanation: `Cada compactador tem seu "cat": \`zcat\` (gzip, .gz), \`bzcat\` (bzip2, .bz2) e \`xzcat\` (xz, .xz) descompactam para a saída padrão sem alterar o arquivo. \`${c.alt}\` é equivalente. \`cat\` mostraria bytes binários ilegíveis, e o cat de outro formato falha ("not in gzip format", "not a bzip2 file" ou "File format not recognized"). Para \`.${c.ext}\`: \`${c.cat}\`.`,
          ref: ['101:p.211-213'],
          verify: {
            sh: `cd "$(mktemp -d)"\nprintf 'linha um\\n' > ${f}.txt\n${c.comp} ${f}.txt\n${probes.join('\n')}`,
            expect: options.map((o) => (o.ok ? 'S' : 'N')).join('\n'),
          },
        };
      });
    },
  },
);
// ------------------------------------------------------------------------------------------
// Pipelines compostos (sort | uniq -c | sort -nr | head ...)
// ------------------------------------------------------------------------------------------
const SORTOPT = { '': {}, '-r': { r: 1 }, '-n': { n: 1 }, '-nr': { n: 1, r: 1 }, '-u': { u: 1 } };
const UNIQOPT = { '': {}, '-c': { c: 1 }, '-d': { d: 1 }, '-u': { u: 1 } };
const normC = (s) => s.trim().replace(/\s+/g, ' ');

function mkStage(sp) {
  switch (sp.t) {
    case 'sort': return { txt: `sort${sp.o ? ' ' + sp.o : ''}`, fn: (L) => gsort(L, { g: SORTOPT[sp.o] }) };
    case 'sortk': {
      const flags = { n: sp.o.includes('n') ? 1 : undefined, r: sp.o.includes('r') ? 1 : undefined };
      Object.keys(flags).forEach((k) => flags[k] === undefined && delete flags[k]);
      return { txt: `sort -t${sp.sep} -k${sp.k},${sp.k}${sp.o}`, fn: (L) => gsort(L, { t: sp.sep, keys: [{ a: sp.k, b: sp.k, f: flags }], g: {} }) };
    }
    case 'uniq': return { txt: `uniq${sp.o ? ' ' + sp.o : ''}`, fn: (L) => guniq(L, UNIQOPT[sp.o]) };
    case 'head': return { txt: `head -n ${sp.k}`, fn: (L) => ghead(L, sp.k) };
    case 'tail': return { txt: `tail -n ${sp.k}`, fn: (L) => gtail(L, sp.k) };
    case 'cut': return { txt: `cut -d${sp.d} -f${sp.f}`, fn: (L) => L.map((l) => gcutF(l, { d: sp.d, f: String(sp.f) })) };
    case 'tr': return { txt: `tr ${sp.a} ${sp.b}`, fn: (L) => L.map((l) => gtr(l + '\n', sp.a, sp.b).replace(/\n$/, '')) };
    case 'wc': return { txt: 'wc -l', fn: (L) => [String(L.length)] };
    default: throw new Error('stage?');
  }
}
function runStages(stages, lines) {
  let cur = lines; const trace = [];
  for (const sp of stages) { const st = mkStage(sp); cur = st.fn(cur); trace.push({ txt: st.txt, out: cur }); }
  return { out: cur, trace };
}
function mutations(stages) {
  const res = [];
  stages.forEach((sp, i) => {
    const put = (n) => res.push(stages.map((s, j) => (j === i ? n : s)));
    if (sp.t === 'sort') Object.keys(SORTOPT).filter((o) => o !== sp.o).forEach((o) => put({ ...sp, o }));
    if (sp.t === 'sortk') ['', 'n', 'nr', 'r'].filter((o) => o !== sp.o).forEach((o) => put({ ...sp, o }));
    if (sp.t === 'uniq') Object.keys(UNIQOPT).filter((o) => o !== sp.o).forEach((o) => put({ ...sp, o }));
    if (sp.t === 'head' || sp.t === 'tail') { put({ ...sp, k: sp.k + 1 }); if (sp.k > 1) put({ ...sp, k: sp.k - 1 }); put({ t: sp.t === 'head' ? 'tail' : 'head', k: sp.k }); }
    if (sp.t === 'cut') { put({ ...sp, f: sp.f + 1 }); if (sp.f > 1) put({ ...sp, f: sp.f - 1 }); }
    if (sp.t === 'sort' && stages[i + 1]?.t === 'uniq') res.push(stages.filter((_, j) => j !== i));
  });
  return res;
}

const TPL = [
  (rng) => { // shells mais usados
    const shells = ['bash', 'sh', 'zsh', 'nologin'];
    const n = rng.int(7, 9);
    const names = rng.sample(NAMES.concat(['tux', 'root', 'sync']), n);
    const wts = rng.shuffle([4, 2, 1, 1]);
    const lines = names.map((nm) => `${nm}:${1000 + rng.int(0, 90)}:${rng.weighted(shells, (s) => wts[shells.indexOf(s)])}`);
    const k = rng.pick([1, 2]);
    return { f: 'passwd.txt', lines, stages: [{ t: 'cut', d: ':', f: 3 }, { t: 'sort', o: '' }, { t: 'uniq', o: '-c' }, { t: 'sort', o: '-nr' }, { t: 'head', k }], need: { uniqCountTop: k }, ref: 'shell mais comum' };
  },
  (rng) => { // nome com o maior uid
    const n = rng.int(5, 7);
    const names = rng.sample(NAMES, n);
    const uids = rng.sample([99, 100, 1000, 1001, 250, 33, 4, 65534, 800, 12, 7], n);
    const lines = names.map((nm, i) => `${nm}:${uids[i]}:/home/${nm}`);
    return { f: 'contas.txt', lines, stages: [{ t: 'sortk', sep: ':', k: 2, o: 'n' }, { t: 'tail', k: 1 }, { t: 'cut', d: ':', f: 1 }] };
  },
  (rng) => { // top 2 mais frequentes
    const base = rng.sample(NAMES, rng.int(4, 5));
    const cnt = rng.shuffle([5, 3, 2, 1, 4]).slice(0, base.length);
    const lines = rng.shuffle(base.flatMap((nm, i) => Array(cnt[i]).fill(nm)));
    return { f: 'acessos.txt', lines, stages: [{ t: 'sort', o: '' }, { t: 'uniq', o: '-c' }, { t: 'sort', o: '-nr' }, { t: 'head', k: 2 }], need: { uniqCountTop: 2 } };
  },
  (rng) => { // repetidos em maiúsculas
    const base = rng.sample(NAMES, rng.int(4, 6));
    const lines = rng.shuffle(base.flatMap((nm) => Array(rng.pick([1, 1, 2, 3])).fill(nm)));
    return { f: 'nomes.txt', lines, stages: [{ t: 'sort', o: '' }, { t: 'uniq', o: '-d' }, { t: 'tr', a: 'a-z', b: 'A-Z' }] };
  },
  (rng) => { // cidades distintas
    const cities = rng.sample(['rio', 'sao', 'bh', 'poa', 'rec', 'cur'], rng.int(3, 4));
    const n = rng.int(6, 8);
    const lines = Array.from({ length: n }, (_, i) => `${rng.pick(['mouse', 'teclado', 'monitor', 'cabo', 'hub'])}${i},${rng.int(1, 90)},${rng.pick(cities)}`);
    return { f: 'vendas.csv', lines, stages: [{ t: 'cut', d: ',', f: 3 }, { t: 'sort', o: '-u' }, { t: 'wc' }] };
  },
  (rng) => { // dois maiores por quantidade
    const n = rng.int(5, 7);
    const prods = rng.sample(['mouse', 'teclado', 'monitor', 'cabo', 'hub', 'webcam', 'dock'], n);
    const q = rng.sample([5, 12, 9, 100, 33, 8, 64, 150, 21], n);
    const lines = prods.map((p, i) => `${p},${q[i]},${rng.pick(['rio', 'sao', 'bh'])}`);
    return { f: 'estoque.csv', lines, stages: [{ t: 'sortk', sep: ',', k: 2, o: 'nr' }, { t: 'head', k: 2 }, { t: 'cut', d: ',', f: 1 }] };
  },
  (rng) => { // um trecho do meio
    const n = rng.int(7, 9);
    const lines = rng.sample(WORDS.concat(NAMES), n);
    const a = rng.int(4, n - 1); const b = rng.int(2, 3);
    return { f: 'lista.txt', lines, stages: [{ t: 'head', k: a }, { t: 'tail', k: b }, { t: 'tr', a: 'a-z', b: 'A-Z' }] };
  },
];

generators.push({
  id: 'ft-pipeline', obj: '103.2', nivel: 3, peso: 4,
  make(rng) {
    return retry(() => {
      const t = rng.pick(TPL)(rng);
      const { out, trace } = runStages(t.stages, t.lines);
      if (t.need) {
        // sem empates nas contagens no limite do top-K (o desempate depende da localidade)
        const idx = t.stages.findIndex((s) => s.t === 'uniq' && s.o === '-c');
        const upto = runStages(t.stages.slice(0, idx + 1), t.lines).out;
        const counts = upto.map((x) => Number(x.trim().split(' ')[0])).sort((a, b) => b - a);
        if (counts[t.need.uniqCountTop - 1] === counts[t.need.uniqCountTop] || counts[0] === counts[1]) return null;
      }
      const show = (o) => (o.length ? o.map(normC).join(' | ') : '(nenhuma saída)');
      const correct = show(out);
      const wrong = new Set(mutations(t.stages).map((m) => show(runStages(m, t.lines).out)).filter((x) => x !== correct && x !== '(nenhuma saída)'));
      if (wrong.size < 3) return null;
      const pipe = [`${mkStage(t.stages[0]).txt} ${t.f}`, ...t.stages.slice(1).map((s) => mkStage(s).txt)].join(' | ');
      const steps = trace.map((s, i) => `\`${i === 0 ? s.txt + ' ' + t.f : s.txt}\` → ${s.out.length ? s.out.map(normC).join(' / ') : '(nada)'}`);
      return {
        type: 'unica',
        text: `O arquivo \`${t.f}\` contém:\n\n${block(t.lines.join('\n'))}\n\nQual é a saída do pipeline abaixo? (${pipe.includes('uniq -c') ? 'Ignore o recuo à esquerda do `uniq -c`; ' : ''}as linhas de saída aparecem separadas aqui por \` | \`.)\n\n${block('$ ' + pipe)}`,
        options: mcq(rng, correct, [...wrong], 4),
        explanation: `Em um pipeline, cada comando recebe a saída do anterior. Resultado de cada etapa: ${steps.join('; ')}. Saída final: ${correct}.`,
        ref: ['101:p.223-224', '101:p.229-231', '101:p.234'],
        verify: { sh: `${printfFile(t.f, t.lines)}\nr=$(${pipe} | sed 's/^ *//' | paste -s -d'|' - | sed 's/|/ | /g'); echo "\${r:-(nenhuma saída)}"`, expect: correct },
      };
    });
  },
});
