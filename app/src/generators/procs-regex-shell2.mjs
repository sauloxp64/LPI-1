// 103.7 — expressões regulares: motor BRE/ERE -> JS, geradores de grep. (sed está em procs-regex-shell3.mjs)
import { mcq, multi, code, block } from './util.mjs';
import { sq, juntar, chooseVerify } from './procs-regex-shell.mjs';

// ---------------------------------------------------------------- tradutor POSIX BRE/ERE (subconjunto GNU) -> RegExp do JS
const POSIX = { digit: '0-9', alpha: 'A-Za-z', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v', blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f' };
export const escJs = (c) => (/[\\^$.*+?()[\]{}|/]/.test(c) ? '\\' + c : c);

/** Converte o padrão `p` (BRE se ere=false, ERE se ere=true) em fonte de RegExp do JS. */
export function toJs(p, ere) {
  let out = ''; let i = 0; let atom = false; let start = true;
  const n = p.length;
  while (i < n) {
    const c = p[i];
    if (c === '\\') {
      const d = p[i + 1]; i += 2;
      if (d === undefined) { out += '\\\\'; atom = true; start = false; continue; }
      if (!ere && d === '(') { out += '('; atom = false; start = true; continue; }
      if (!ere && d === ')') { out += ')'; atom = true; start = false; continue; }
      if (!ere && d === '|') { out += '|'; atom = false; start = true; continue; }
      if (!ere && d === '{') { const j = p.indexOf('\\}', i); out += `{${p.slice(i, j)}}`; i = j + 2; atom = true; continue; }
      if (!ere && (d === '+' || d === '?')) { out += d; atom = true; continue; }
      if (/[1-9]/.test(d)) { out += `\\${d}`; atom = true; start = false; continue; }
      if (d === '<') { out += '\\b(?=\\w)'; atom = false; start = false; continue; }
      if (d === '>') { out += '\\b(?<=\\w)'; atom = false; start = false; continue; }
      if (d === 'w') { out += '[A-Za-z0-9_]'; atom = true; start = false; continue; }
      out += escJs(d); atom = true; start = false; continue;
    }
    if (c === '[') {
      let j = i + 1; let neg = false; let body = '';
      if (p[j] === '^') { neg = true; j++; }
      if (p[j] === ']') { body += '\\]'; j++; }
      while (j < n && p[j] !== ']') {
        if (p[j] === '[' && p[j + 1] === ':') { const e = p.indexOf(':]', j + 2); body += POSIX[p.slice(j + 2, e)]; j = e + 2; continue; }
        body += p[j] === '\\' ? '\\\\' : p[j] === '[' ? '\\[' : p[j]; j++;
      }
      out += `[${neg ? '^' : ''}${body}]`; i = j + 1; atom = true; start = false; continue;
    }
    i++;
    if (c === '.') { out += '.'; atom = true; start = false; continue; }
    if (c === '*') { if (atom) out += '*'; else out += '\\*'; start = false; continue; }
    if (c === '^') { if (ere || start) { out += '^'; atom = false; /* start permanece: * depois de ^ é literal */ } else { out += '\\^'; atom = true; start = false; } continue; }
    if (c === '$') { const rest = p.slice(i); if (ere || rest === '' || (!ere && (rest.startsWith('\\)') || rest.startsWith('\\|')))) { out += '$'; atom = false; } else { out += '\\$'; atom = true; } start = false; continue; }
    if (ere && c === '(') { out += '('; atom = false; start = true; continue; }
    if (ere && c === ')') { out += ')'; atom = true; start = false; continue; }
    if (ere && c === '|') { out += '|'; atom = false; start = true; continue; }
    if (ere && (c === '+' || c === '?')) { if (atom) out += c; else out += `\\${c}`; start = false; continue; }
    if (ere && c === '{') { const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i - 1)); if (m && atom) { out += m[0]; i += m[0].length - 1; } else out += '\\{'; start = false; continue; }
    out += escJs(c); atom = true; start = false;
  }
  return out;
}

/** RegExp de uma linha conforme as opções do grep (ere, i, w, x, F). */
export function lineRe(p, o = {}) {
  let src = o.F ? [...p].map(escJs).join('') : toJs(p, !!o.ere);
  if (o.x) src = `^(?:${src})$`; else if (o.w) src = `(?<![A-Za-z0-9_])(?:${src})(?![A-Za-z0-9_])`;
  return new RegExp(src, o.i ? 'i' : '');
}
export const selecionadas = (lines, p, o = {}) => { const re = lineRe(p, o); return lines.map((l, k) => [l, k + 1]).filter(([l]) => re.test(l) !== !!o.v).map(([, k]) => k); };
export function matchesO(line, p, o = {}) {
  const re = lineRe(p, { ...o, x: false, w: false }); const g = new RegExp(re.source, `g${o.i ? 'i' : ''}`);
  return [...line.matchAll(g)].map((m) => m[0]).filter((s) => s !== '');
}
const flagsStr = (o) => ['i', 'v', 'w', 'x'].filter((k) => o[k]).map((k) => `-${k}`).join(' ');
const grepCmd = (o, pat, file = 'arq.txt', extra = '') => `${o.F ? 'grep -F' : o.ere ? 'grep -E' : 'grep'}${flagsStr(o) ? ' ' + flagsStr(o) : ''}${extra ? ' ' + extra : ''} ${sq(pat)} ${file}`;

// ---------------------------------------------------------------- famílias de padrões (BRE e ERE equivalentes)
const ANIM = ['gato', 'rato', 'pato', 'lobo', 'urso', 'peixe', 'cavalo', 'coelho', 'tigre', 'sapo'];
const NIVEL = ['ERRO', 'AVISO', 'INFO', 'DEBUG', 'FATAL'];
const NOMES = ['Maria', 'Joao', 'Ana', 'Carlos', 'Paula', 'Rui'];
const NEUTRAS = ['nada a declarar', 'linha em branco acima', 'fim do arquivo', 'servidor reiniciado', 'backup concluido', 'usuario conectado', 'tudo certo por aqui', 'a b c d'];
const mut = (rng, w) => rng.pick([() => w.slice(0, -1), () => `${w}s`, () => w.toUpperCase(), () => w.replace(/[aeiou]/, '0'), () => `${w}x`, () => w.slice(1)])();
const digs = (rng, k) => Array.from({ length: k }, () => rng.int(0, 9)).join('');

const FAMILIAS = [
  { id: 'alt', mk(rng) { const ws = rng.sample(ANIM, rng.int(2, 3)); return { bre: ws.join('\\|'), ere: ws.join('|'), core: () => rng.pick(ws), near: () => mut(rng, rng.pick(ws)), o: true, d: `contêm uma das palavras ${ws.join(', ')}` }; } },
  { id: 'opt', mk(rng) { const [a, ch, b] = rng.pick([['colo', 'u', 'r'], ['favo', 'u', 'rito'], ['hono', 'u', 'r'], ['gen', 'e', 'ral'], ['pa', 'i', 's'], ['tre', 's', 'mil']]); return { bre: `${a}${ch}\\?${b}`, ere: `${a}${ch}?${b}`, core: () => a + (rng.chance(0.5) ? ch : '') + b, near: () => a + ch + ch + b, o: true, d: `contêm "${a}", o caractere "${ch}" opcional (0 ou 1 vez) e depois "${b}"` }; } },
  { id: 'plus', mk(rng) { const [a, ch, b] = rng.pick([['g', 'o', 'l'], ['b', 'e', 'm'], ['s', 'a', 'l'], ['m', 'u', 'ito'], ['c', 'a', 'sa'], ['v', 'i', 'da']]); return { bre: `${a}${ch}\\+${b}`, ere: `${a}${ch}+${b}`, core: () => a + ch.repeat(rng.int(1, 4)) + b, near: () => a + b, o: true, d: `contêm "${a}", uma ou mais vezes "${ch}" e depois "${b}"` }; } },
  { id: 'star', mk(rng) { const [a, ch, b] = rng.pick([['a', 'b', 'c'], ['p', 'o', 'rta'], ['c', 'a', 'ro'], ['x', 'y', 'z']]); return { bre: `${a}${ch}*${b}`, ere: `${a}${ch}*${b}`, core: () => a + ch.repeat(rng.int(0, 3)) + b, near: () => a + 'k' + b, o: true, d: `contêm "${a}", zero ou mais "${ch}" e depois "${b}"` }; } },
  { id: 'interval', mk(rng) { const [lo, hi] = rng.pick([[2, 3], [3, 3], [2, 4], [3, 4]]); const q = lo === hi ? `{${lo}}` : `{${lo},${hi}}`; const qb = lo === hi ? `\\{${lo}\\}` : `\\{${lo},${hi}\\}`; return { bre: `[0-9]${qb}-[0-9]\\{4\\}`, ere: `[0-9]${q}-[0-9]{4}`, core: () => `${digs(rng, rng.int(lo, hi))}-${digs(rng, 4)}`, near: () => `${digs(rng, rng.pick([1, hi + 2]))}-${digs(rng, rng.pick([3, 4]))}`, o: true, d: `contêm ${lo === hi ? lo : `${lo} a ${hi}`} dígitos, hífen e 4 dígitos` }; } },
  { id: 'ini', mk(rng) { const w = rng.pick(NIVEL); return { bre: `^${w}`, ere: `^${w}`, core: () => `${w} falha no modulo`, near: () => rng.pick([` ${w} falha`, `[${w}]`, w.toLowerCase() + ' falha']), ini: true, d: `começam com ${w}` }; } },
  { id: 'fim', mk(rng) { const w = rng.pick(['ok', 'fim', 'pronto', 'erro']); return { bre: `${w}$`, ere: `${w}$`, core: () => `tarefa ${w}`, near: () => rng.pick([`${w} tarefa`, `${w}s`, `${w}.`]), fimA: true, d: `terminam com ${w}` }; } },
  { id: 'negcls', mk(rng) { return { bre: '[^0-9]\\+$', ere: '[^0-9]+$', core: () => rng.pick(['sala', 'abc def', 'rua b']), near: () => `${rng.pick(['sala', 'rua'])} ${digs(rng, 2)}`, fimA: true, d: 'terminam com uma sequência de caracteres que não são dígitos' }; } },
  { id: 'bref', mk(rng) { const dup = ['carro', 'passo', 'sorriso', 'ffmpeg', 'aaa', 'chuva' + 'a', 'ossos']; const sem = ['casa', 'mesa', 'livro', 'pedra', 'vidro']; return { bre: '\\([a-z]\\)\\1', ere: '([a-z])\\1', core: () => rng.pick(dup.slice(0, 5)), near: () => rng.pick(sem), o: true, d: 'contêm uma letra minúscula seguida da mesma letra (backreference \\1)' }; } },
  { id: 'posix', mk(rng) { const k = rng.pick(['nome', 'dig']); if (k === 'nome') return { bre: '[[:upper:]][[:lower:]]\\+', ere: '[[:upper:]][[:lower:]]+', core: () => rng.pick(NOMES), near: () => rng.pick(NOMES).toLowerCase(), o: true, d: 'contêm uma maiúscula seguida de uma ou mais minúsculas' }; return { bre: '[[:digit:]]\\{3\\}', ere: '[[:digit:]]{3}', core: () => `cod ${digs(rng, 3)}`, near: () => `cod ${digs(rng, 2)}`, o: true, d: 'contêm três dígitos consecutivos' }; } },
  { id: 'dot', mk(rng) { return { bre: '[0-9]\\+\\.[0-9]\\+', ere: '[0-9]+\\.[0-9]+', core: () => `${rng.int(1, 99)}.${rng.int(1, 99)}`, near: () => `${rng.int(1, 99)},${rng.int(1, 99)}`, o: true, d: 'contêm um número decimal com ponto literal (o ponto escapado não é "qualquer caractere")' }; } },
  { id: 'grp', mk(rng) { const u = rng.pick(['ha', 'na', 'ta', 'ri']); const m = rng.int(2, 3); return { bre: `\\(${u}\\)\\{${m},\\}`, ere: `(${u}){${m},}`, core: () => u.repeat(rng.int(m, m + 2)), near: () => u.repeat(m - 1) + 'x', o: true, d: `contêm "${u}" repetido ${m} ou mais vezes seguidas` }; } },
  { id: 'ext', mk(rng) { const e = rng.sample(['txt', 'md', 'csv', 'log', 'conf'], 2); return { bre: `\\.\\(${e[0]}\\|${e[1]}\\)$`, ere: `\\.(${e[0]}|${e[1]})$`, core: () => `${rng.pick(['notas', 'leia', 'dados'])}.${rng.pick(e)}`, near: () => rng.pick([`${e[0]}`, `x.${e[0]}.bak`, `x.${e[1]}x`]), fimA: true, d: `terminam em .${e[0]} ou .${e[1]}` }; } },
  { id: 'dotstar', mk(rng) { const [a, z] = rng.pick([['a', 'z'], ['i', 'o'], ['s', 'x']]); return { bre: `^${a}.*${z}$`, ere: `^${a}.*${z}$`, core: () => a + rng.pick(['', 'bc', ' abc ', '123']) + z, near: () => a + 'bc' + rng.pick(['y', z + 'k']), ini: true, fimA: true, d: `começam com "${a}", têm qualquer coisa no meio e terminam com "${z}"` }; } },
  { id: 'cmt', mk(rng) { return { bre: '^[[:space:]]*#', ere: '^[[:space:]]*#', core: () => rng.pick(['# comentario', '   # indentado', '#!/bin/bash', '\t# com tab']), near: () => rng.pick(['x # no fim', 'echo "#"', 'valor=1', '  server on']), ini: true, d: 'são comentários (# no início, possivelmente após espaços)' }; } },
];

/** Monta ~7 linhas para a família `f` (objeto de mk). Retorna array de strings. */
function fazLinhas(rng, f, n = 7) {
  const deco = (core) => { const pre = f.ini ? '' : rng.pick(['', 'o ', 'um ', 'meu ', 'x', '- ']); const post = f.fimA ? '' : rng.pick(['', ' dorme', ' ok', 's', ' 1']); return pre + core + post; };
  const k = rng.int(2, 4); const lines = [];
  for (let i = 0; i < k; i++) lines.push(deco(f.core()));
  for (let i = 0; i < rng.int(2, 3); i++) lines.push(deco(f.near()));
  while (lines.length < n) lines.push(rng.pick(NEUTRAS));
  return rng.shuffle(lines).slice(0, n);
}
const nomeLinhas = (ks) => (ks.length === 0 ? 'nenhuma linha' : ks.length === 1 ? `a linha ${ks[0]}` : `as linhas ${juntar(ks.map(String))}`);
const caps = (s) => s[0].toUpperCase() + s.slice(1);
const REF = ['101:p.389-393'];

function sorteiaCenario(rng, { precisaFlavor = false, usarO = false } = {}) {
  for (let t = 0; t < 60; t++) {
    const fam = rng.pick(FAMILIAS.filter((x) => !usarO || true)); const f = fam.mk(rng);
    if (usarO && !f.o) continue;
    if (precisaFlavor && f.bre === f.ere) continue;
    const ere = precisaFlavor ? rng.chance(0.5) : rng.chance(0.5);
    const o = { ere };
    if (rng.chance(0.3)) o.i = true;
    if (!usarO && rng.chance(0.3)) o.v = true;
    if (!usarO && rng.chance(0.2) && !f.ini && !f.fimA) o.w = true;
    const pat = ere ? f.ere : f.bre;
    const lines = fazLinhas(rng, f);
    const sel = selecionadas(lines, pat, o);
    if (usarO) { if (sel.length < 1 || sel.length > 5 || o.v) continue; }
    else if (sel.length < 1 || sel.length > lines.length - 1) continue;
    return { f, o, pat, lines, sel, fam };
  }
  throw new Error('sem cenário');
}
const arqSetup = (lines) => `printf '%s\\n' ${lines.map(sq).join(' ')} > arq.txt`;
const mostraArq = (lines) => block(lines.map((l, k) => `${k + 1}: ${l}`).join('\n')).replace(/^(\d+): /gm, '$1\t');

// ---------------------------------------------------------------- geradores
const grepLines = {
  id: 'grep-lines', obj: '103.7', nivel: 2, peso: 3,
  make(rng) {
    const fmt = rng.pick(['linhas', 'linhas', 'contagem', 'only']);
    const { f, o, pat, lines, sel } = sorteiaCenario(rng, { usarO: fmt === 'only' });
    const cmd = grepCmd(o, pat, 'arq.txt', fmt === 'only' ? '-o' : fmt === 'contagem' ? '-c' : '');
    const arq = lines.map((l, k) => `${String(k + 1).padStart(2, ' ')}  ${l}`).join('\n');
    const arqTxt = `O arquivo \`arq.txt\` tem as linhas abaixo (o número à esquerda **não** faz parte do arquivo):\n\n${block(arq)}\n\n`;
    const expl0 = `O padrão seleciona as linhas que ${f.d}.${o.ere ? 'Com `-E` (ERE), `+ ? | ( ) { }` são operadores.' : 'Em BRE, `+ ? | ( ) { }` precisam de barra invertida para serem operadores; sem ela são literais.'}${o.i ? ' `-i` ignora maiúsculas/minúsculas.' : ''}${o.v ? ' `-v` inverte: imprime as linhas que **não** casam.' : ''}${o.w ? ' `-w` exige que o trecho casado seja uma palavra inteira (cercado por não-letras/dígitos/_).' : ''}`;
    if (fmt === 'contagem') {
      return {
        type: 'lacuna', text: `${arqTxt}Qual número o comando abaixo imprime?\n\n${block(cmd)}`, answers: [String(sel.length)],
        explanation: `${expl0} \`-c\` imprime só a *quantidade de linhas* selecionadas, não de ocorrências. Linhas selecionadas: ${sel.length ? sel.join(', ') : 'nenhuma'} → ${sel.length}.`,
        ref: REF, verify: { sh: `${arqSetup(lines)}\n${cmd}`, expect: String(sel.length) },
      };
    }
    if (fmt === 'only') {
      const pieces = lines.flatMap((l) => matchesO(l, pat, o));
      const show = (ps) => (ps.length ? ps.map((x) => '`' + x + '`').join(' ') : '(nenhuma saída)');
      const alt = [];
      const other = lines.flatMap((l) => matchesO(l, pat, { ...o, i: !o.i })); alt.push(show(other));
      const noFlavor = lines.flatMap((l) => matchesO(l, pat, { ...o, ere: !o.ere })); alt.push(show(noFlavor));
      alt.push(show(selecionadas(lines, pat, o).map((k) => lines[k - 1])));
      alt.push(show(pieces.slice(0, -1)), show([...pieces, pieces[0]]), show(pieces.map((p) => p.slice(0, Math.max(1, p.length - 1)))));
      return {
        type: 'unica', text: `${arqTxt}O que o comando abaixo escreve na saída (na ordem, uma ocorrência por linha de saída)?\n\n${block(cmd)}`,
        options: mcq(rng, show(pieces), alt),
        explanation: `${expl0} \`-o\` imprime **somente os trechos que casam** (um por linha de saída), e não a linha inteira; uma linha com duas ocorrências gera duas saídas. Trechos: ${show(pieces)}.`,
        ref: REF, verify: { sh: `${arqSetup(lines)}\n${cmd} | paste -sd' ' -`, expect: pieces.join(' ') },
      };
    }
    const ok = nomeLinhas(sel);
    const alts = [];
    alts.push(selecionadas(lines, pat, { ...o, v: !o.v }), selecionadas(lines, pat, { ...o, i: !o.i }), selecionadas(lines, pat, { ...o, ere: !o.ere }), selecionadas(lines, pat, { ...o, w: !o.w }));
    for (let k = 0; k < 3; k++) { const s2 = new Set(sel); const j = rng.int(1, lines.length); if (s2.has(j)) s2.delete(j); else s2.add(j); alts.push([...s2].sort((a, b) => a - b)); }
    return {
      type: 'unica', text: `${arqTxt}Quais linhas são impressas pelo comando abaixo?\n\n${block(cmd)}`,
      options: mcq(rng, ok, alts.map(nomeLinhas)),
      explanation: `${expl0} Resultado: ${ok}.`,
      ref: REF, verify: { sh: `${arqSetup(lines)}\n${cmd.replace('grep', 'grep -n')} | cut -d: -f1 | paste -sd, -`, expect: sel.join(',') },
    };
  },
};

const grepFlavor = {
  id: 'grep-flavor', obj: '103.7', nivel: 3, peso: 3,
  make(rng) {
    const { f, lines, fam } = (() => { for (let t = 0; t < 80; t++) { const c = sorteiaCenario(rng, { precisaFlavor: true }); const sb = selecionadas(c.lines, c.f.bre, { ere: false }); const se = selecionadas(c.lines, c.f.ere, { ere: true }); if (sb.join() === se.join() && sb.length >= 1 && sb.length < c.lines.length) { return c; } } throw new Error('flavor'); })();
    const v = rng.chance(0.2); const objetivo = selecionadas(lines, f.bre, { ere: false, v });
    const alvo = objetivo.map((k) => lines[k - 1]);
    const ok = rng.pick([`grep${v ? ' -v' : ''} ${sq(f.bre)} arq.txt`, `grep -E${v ? 'v' : ''} ${sq(f.ere)} arq.txt`]);
    const cand = [
      `grep${v ? ' -v' : ''} ${sq(f.ere)} arq.txt`, // ERE sem -E
      `grep -E${v ? 'v' : ''} ${sq(f.bre)} arq.txt`, // BRE com -E
      `grep${v ? '' : ' -v'} ${sq(f.bre)} arq.txt`, `grep -F${v ? 'v' : ''} ${sq(f.ere)} arq.txt`,
    ];
    const nOk = (c) => lines.filter((l) => true).length >= 0 && c;
    void nOk;
    const resultOf = (c) => {
      const mv = /^grep( -E| -F)?( ?-?v)?/.exec(c); const ere = (mv[1] ?? '') === ' -E'; const F = (mv[1] ?? '') === ' -F'; const vv = /^grep -E?F?v|^grep -v/.test(c) || / -v /.test(c);
      const pat = c.match(/'((?:[^']|'\\'')*)'/)[1].replace(/'\\''/g, "'");
      return selecionadas(lines, pat, { ere, F, v: vv }).join();
    };
    const target = objetivo.join();
    const wrong = [...new Set(cand.filter((c) => resultOf(c) !== target))];
    if (wrong.length < 3) wrong.push(`grep -w ${sq(f.bre)} arq.txt`, `grep -x ${sq(f.ere)} arq.txt`);
    const options = mcq(rng, ok, wrong.filter((w) => resultOf(w) !== target));
    const ordered = [options.find((x) => x.ok).t, ...options.filter((x) => !x.ok).map((x) => x.t)];
    const arq = lines.map((l, k) => `${String(k + 1).padStart(2, ' ')}  ${l}`).join('\n');
    return {
      type: 'unica',
      text: `O arquivo \`arq.txt\` tem as linhas abaixo (o número à esquerda não faz parte do arquivo):\n\n${block(arq)}\n\nQual comando imprime exatamente ${nomeLinhas(objetivo)} (as linhas que ${v ? '**não** ' : ''}${f.d})?`,
      options,
      explanation: `Em **BRE** (\`grep\` puro) os operadores \`+ ? | ( ) { }\` são literais, e só viram operadores com barra invertida (\`\\+ \\? \\| \\( \\) \\{ \\}\`, extensão do GNU). Em **ERE** (\`grep -E\`, \`egrep\`) é o contrário: sem barra são operadores e com barra são literais. Por isso: BRE \`${f.bre}\` ≡ ERE \`${f.ere}\`. Misturar a sintaxe (ERE sem \`-E\` ou BRE com \`-E\`) procura os caracteres literalmente e normalmente não casa nada.${v ? ' `-v` inverte a seleção.' : ''}`,
      ref: ['101:p.381-382', '101:p.392-393'],
      verify: chooseVerify(arqSetup(lines), ordered, alvo.join('\n')),
    };
  },
};

const FLAG_CASOS = [
  // cada caso devolve {txt, cmds, files, out(expect), ask}
  (rng) => {
    const w = rng.pick(['erro', 'root', 'admin', 'ok']); const L = ['sistema iniciado', `${w} no modulo 1`, 'tudo certo', `${w.toUpperCase()} critico`, `sem ${w}s aqui`, `pre${w}`, 'fim'];
    const lines = rng.shuffle(L); const k = rng.pick(['-c', '-i -c', '-w -c', '-v -c', '-iw -c', '-ic']);
    const flags = k.replace('-ic', '-i -c').replace('-iw -c', '-i -w -c');
    const o = { i: /-i/.test(k), w: /-w|-iw/.test(k), v: /-v/.test(k) };
    const n = selecionadas(lines, w, o).length;
    return { lines, cmd: `grep ${flags} ${sq(w)} arq.txt`, ask: 'Que número é impresso?', out: String(n), pool: [0, 1, 2, 3, 4, 5, 6, 7].map(String), why: `Com \`${flags}\`: ${o.i ? 'ignora caixa; ' : ''}${o.w ? 'só palavras inteiras; ' : ''}${o.v ? 'linhas que não casam; ' : ''}\`-c\` conta linhas. Selecionadas: ${selecionadas(lines, w, o).join(', ') || 'nenhuma'}.` };
  },
  (rng) => {
    const w = rng.pick(['gato', 'log', 'kernel']); const lines = rng.shuffle([`${w} um`, 'abc', `dois ${w}`, 'xyz', `${w}s`, 'fim', `o ${w}`]);
    const ctx = rng.pick(['-A 1', '-B 1', '-C 1']); const sel = selecionadas(lines, w, {});
    const show = new Set(); for (const s of sel) { const a = ctx === '-B 1' ? 0 : 1; const b = ctx === '-A 1' ? 0 : 1; for (let d = -b; d <= a; d++) if (s + d >= 1 && s + d <= lines.length) show.add(s + d); }
    const nl = [...show].sort((a, b) => a - b); let seps = 0; for (let i = 1; i < nl.length; i++) if (nl[i] !== nl[i - 1] + 1) seps++;
    return { lines, cmd: `grep ${ctx} ${sq(w)} arq.txt | wc -l`, ask: 'Que número é impresso (inclua as linhas `--` que separam grupos)?', out: String(nl.length + seps), pool: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], why: `\`${ctx}\` mostra linhas de contexto (uma antes/depois). Linhas mostradas: ${nl.join(', ')} (${nl.length}) mais ${seps} separador(es) \`--\` entre grupos não contíguos = ${nl.length + seps}.` };
  },
  (rng) => {
    const w = rng.pick(['a.c', 'x*y', '1+1', 'a[b]']);
    const lines = rng.shuffle([w, w.replace(/[.*+[\]]/g, 'z'), `[${w}]`, 'outra', `${w}${w}`, w.replace(/[.*+]/, '.')]);
    const F = rng.chance(0.5); const o = { F };
    const sel = selecionadas(lines, w, o);
    return { lines, cmd: F ? `fgrep -c ${sq(w)} arq.txt` : `grep -c ${sq(w)} arq.txt`, ask: 'Que número é impresso?', out: String(sel.length), pool: ['0', '1', '2', '3', '4', '5'], why: F ? '`fgrep` (= `grep -F`) trata o padrão como texto literal; `.`, `*`, `+` e `[` não são especiais.' : '`grep` interpreta o padrão como BRE: `.` é qualquer caractere, `*` repete o anterior e `[...]` é uma lista de caracteres.', fgrep: F };
  },
];
const grepFlags = {
  id: 'grep-flags', obj: '103.7', nivel: 2, peso: 2,
  make(rng) {
    const fmt = rng.pick(['caso', 'caso', 'status', 'lh']);
    if (fmt === 'caso') {
      const c = rng.pick(FLAG_CASOS)(rng);
      const cmdV = c.cmd.replace(/^fgrep/, 'grep -F');
      const sel0 = c.cmd.includes('fgrep');
      void sel0;
      return {
        type: 'unica', text: `O arquivo \`arq.txt\` tem as linhas abaixo:\n\n${block(c.lines.join('\n'))}\n\nSaída do comando:\n\n${block(c.cmd)}\n\n${c.ask}`,
        options: mcq(rng, c.out, c.pool), explanation: c.why, ref: REF, verify: { sh: `${arqSetup(c.lines)}\n${c.cmd}`, expect: c.out },
      };
    }
    if (fmt === 'status') {
      const w = rng.pick(['root', 'daemon', 'aluno', 'zumbi', 'backup']); const present = rng.chance(0.5); const missing = rng.chance(0.25);
      const lines = ['root:x:0:0', 'daemon:x:1:1', 'aluno:x:1000:1000'];
      const flag = rng.pick(['-q', '-q', '-qi']);
      const file = missing ? 'passwd.bak' : 'passwd';
      const found = selecionadas(lines, w, { i: flag === '-qi' }).length > 0;
      const st = missing ? 2 : found ? 0 : 1;
      void present;
      return {
        type: 'unica', text: `O arquivo \`passwd\` (existente) contém as linhas:\n\n${block(lines.join('\n'))}\n\nQual é o valor de \`$?\` logo depois do comando abaixo? (Não existe \`passwd.bak\`.)\n\n${block(`grep ${flag} ${w} ${file}`)}`,
        options: mcq(rng, String(st), ['0', '1', '2', '127', '126', '3']),
        explanation: 'O status de saída do `grep` é **0** se alguma linha foi selecionada, **1** se nenhuma foi e **2** se houve erro (como arquivo inexistente). `-q` suprime a saída e é ideal em `if grep -q ...; then`.', ref: REF,
        verify: { sh: `${arqSetup(lines).replace('arq.txt', 'passwd')}\ngrep ${flag} ${w} ${file} 2>/dev/null; echo $?`, expect: String(st) },
      };
    }
    const w = rng.pick(['erro', 'ok', 'host']); const F1 = rng.shuffle([`${w} a`, 'nada', `${w} b`]); const F2 = rng.shuffle(['x', 'y', 'z']); const F3 = rng.shuffle([`${w}`, `z ${w}`, 'q', 'w']);
    const o = rng.pick([['-l', 'liste só os nomes dos arquivos que têm linhas casando'], ['-L', 'liste só os nomes dos arquivos que **não** têm nenhuma linha casando'], ['-c', 'mostre, para cada arquivo, o nome e a quantidade de linhas casando'], ['-h', 'mostre as linhas casando sem prefixar o nome do arquivo']]);
    const files = { a1: F1, a2: F2, a3: F3 };
    const matchN = (L) => L.filter((l) => l.includes(w)).length;
    let out; let optTxt;
    if (o[0] === '-l') out = Object.entries(files).filter(([, L]) => matchN(L) > 0).map(([n]) => n).join(' ');
    else if (o[0] === '-L') out = Object.entries(files).filter(([, L]) => matchN(L) === 0).map(([n]) => n).join(' ');
    else if (o[0] === '-c') out = Object.entries(files).map(([n, L]) => `${n}:${matchN(L)}`).join(' ');
    else out = Object.entries(files).flatMap(([, L]) => L.filter((l) => l.includes(w))).join(' | ');
    const cmd = `grep ${o[0]} ${w} a1 a2 a3`;
    const post = o[0] === '-h' ? " | paste -sd'|' - | sed 's/|/ | /g'" : " | paste -sd' ' -";
    optTxt = out;
    const alts = [];
    const base = Object.entries(files);
    alts.push(base.filter(([, L]) => matchN(L) > 0).map(([n]) => n).join(' '), base.filter(([, L]) => matchN(L) === 0).map(([n]) => n).join(' '), base.map(([n, L]) => `${n}:${matchN(L)}`).join(' '), base.flatMap(([n, L]) => L.filter((l) => l.includes(w)).map((l) => `${n}:${l}`)).join(' '), base.flatMap(([, L]) => L.filter((l) => l.includes(w))).join(' | '));
    return {
      type: 'unica', text: `Existem três arquivos no diretório atual:\n\n${block(base.map(([n, L]) => `${n}: ${L.join(' / ')}`).join('\n'))}\n\n(As barras separam as linhas de cada arquivo.) Qual é a saída de \`${cmd}\`? (Mostrada em uma só linha, itens separados por espaço ou \`|\` se forem linhas.)`,
      options: mcq(rng, optTxt || '(vazio)', alts.filter((x) => x && x !== out).concat(['(vazio)'])),
      explanation: `${o[0]} faz o grep ${o[1]}. Quando há vários arquivos, o grep prefixa cada linha com \`arquivo:\` (a menos que se use \`-h\`).`, ref: REF,
      verify: { sh: base.map(([n, L]) => `printf '%s\\n' ${L.map(sq).join(' ')} > ${n}`).join('\n') + `\n${cmd}${post}`, expect: out || '' },
    };
  },
};

// afirmações verificáveis (BRE x ERE x fixo): [rótulo do comando, flags, padrão, linha]
const AFIRM = [
  ['', 'ab+c', 'abbc'], ['-E', 'ab+c', 'abbc'], ['', 'ab\\+c', 'abbc'], ['', 'ab+c', 'ab+c'], ['-E', 'ab\\+c', 'ab+c'], ['-E', 'ab\\+c', 'abbc'],
  ['', 'a|b', 'b'], ['-E', 'a|b', 'b'], ['', 'a\\|b', 'b'], ['', 'a|b', 'a|b'], ['-E', 'cas(a|o)', 'caso'], ['', 'cas(a|o)', 'caso'], ['', 'cas\\(a\\|o\\)', 'caso'], ['-E', 'cas\\(a\\|o\\)', 'caso'],
  ['', 'x{2}', 'xx'], ['', 'x\\{2\\}', 'xx'], ['-E', 'x{2}', 'xx'], ['-E', 'x\\{2\\}', 'xx'], ['', 'x{2}', 'x{2}'], ['-E', '(ab){2}', 'abab'], ['', '\\(ab\\)\\{2\\}', 'abab'], ['', '(ab){2}', 'abab'],
  ['', 'colou\\?r', 'color'], ['', 'colou?r', 'color'], ['-E', 'colou?r', 'color'], ['', 'colou?r', 'colou?r'], ['-E', 'colou?r', 'colour'],
  ['-F', 'a.c', 'abc'], ['', 'a.c', 'abc'], ['-F', 'a.c', 'a.c'], ['-F', '1+1', '1+1'], ['', '1+1', '11'], ['-E', '1+1', '11'], ['-F', 'a*b', 'aab'], ['', 'a*b', 'aab'],
  ['', '[[:digit:]]', '7up'], ['', '^[[:upper:]]', 'Casa'], ['', '^[[:upper:]]', 'casa'], ['', '[[:alpha:]][[:digit:]]', 'a1'],
  ['-w', 'gat', 'gato'], ['-w', 'gato', 'o gato dorme'], ['-w', 'gato', 'gatos'], ['-x', 'gato', 'gato'], ['-x', 'gato', 'o gato'], ['-i', 'gato', 'GATO'], ['', 'gato', 'GATO'], ['', '^$', ''], ['', '^a.*z$', 'abcz'], ['', 'a\\.b', 'axb'], ['', 'a\\.b', 'a.b'],
];
const regexConcept = {
  id: 'regex-concept', obj: '103.7', nivel: 3, peso: 2,
  make(rng) {
    for (let t = 0; t < 200; t++) {
      const itens = rng.sample(AFIRM, 5).map(([fl, pat, line]) => { const o = { ere: fl === '-E', F: fl === '-F', w: fl === '-w', x: fl === '-x', i: fl === '-i' }; return { fl, pat, line, ok: lineRe(pat, o).test(line) }; });
      const nOk = itens.filter((x) => x.ok).length;
      if (nOk < 2 || nOk > 3) continue;
      const txt = (x) => `\`echo ${sq(x.line)} | grep${x.fl ? ' ' + x.fl : ''} ${sq(x.pat)}\` seleciona a linha (status 0)`;
      const options = [...itens.filter((x) => x.ok), ...itens.filter((x) => !x.ok)].map((x) => ({ t: txt(x), ok: x.ok }));
      const ordered = options.map((o) => itens.find((x) => txt(x) === o.t));
      return {
        type: 'multipla', text: 'Em qual(is) das situações abaixo o `grep` **seleciona** a linha lida da entrada padrão? (escolha todas)',
        options,
        explanation: 'Regras: em **BRE** (`grep`) `+ ? | ( ) { }` são literais e só são operadores quando escapados (`\\+ \\? \\| \\( \\) \\{ \\}`); em **ERE** (`grep -E`/`egrep`) é o inverso. `grep -F`/`fgrep` não usa regex (tudo literal). `-w` exige palavra inteira e `-x` linha inteira. Classes POSIX só valem **dentro** de colchetes: `[[:digit:]]` (escrever só `[:digit:]` é erro no GNU grep). Resultado:' + ordered.map((x) => `${x.ok ? 'casa' : 'não casa'} (${x.fl || 'BRE'} ${x.pat} ← ${x.line || 'linha vazia'})`).join('; ') + '.',
        ref: ['101:p.379-382', '101:p.392-393'],
        verify: { sh: ordered.map((x) => `printf '%s\\n' ${sq(x.line)} | grep${x.fl ? ' ' + x.fl : ''} ${sq(x.pat)} > /dev/null 2>&1 && printf 1 || printf 0`).join('\n') + '\necho', expect: ordered.map((x) => (x.ok ? '1' : '0')).join('') },
      };
    }
    throw new Error('regex-concept');
  },
};

export const generators = [grepLines, grepFlavor, grepFlags, regexConcept];
