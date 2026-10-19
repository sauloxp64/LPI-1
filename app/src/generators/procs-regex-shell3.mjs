// 103.7 — sed: mini-interpretador (verificado contra o sed real) e geradores.
import { mcq, code, block } from './util.mjs';
import { sq, chooseVerify } from './procs-regex-shell.mjs';
import { toJs } from './procs-regex-shell2.mjs';

// ---------------------------------------------------------------- mini-sed
// spec = { n, E, cmds: [ { a: endereço|null, neg, c, ... } ] }
//   endereço: {k:'n',n} | {k:'last'} | {k:'re',re} | {k:'step',first,step} | {k:'range', a:{...}, b:{k:'n'|'last'|'re'|'plus',...}}
const rxOf = (spec, re, i = false) => new RegExp(toJs(re, !!spec.E), i ? 'i' : '');
function expand(rep, m) {
  let out = '';
  for (let i = 0; i < rep.length; i++) {
    const c = rep[i];
    if (c === '\\' && i + 1 < rep.length) { const d = rep[++i]; out += /[1-9]/.test(d) ? (m[Number(d)] ?? '') : d === '&' ? '&' : d === 'n' ? '\n' : d; } else if (c === '&') out += m[0]; else out += c;
  }
  return out;
}
export function aplicaS(ps, c, spec) {
  const re = new RegExp(toJs(c.pat, !!spec.E), `g${c.i ? 'i' : ''}`);
  let out = ''; let last = 0; let count = 0; let did = false; let m;
  while ((m = re.exec(ps)) !== null) {
    if (m[0] === '') { re.lastIndex++; continue; }
    count++;
    const alvo = c.num ?? 1;
    if (c.g ? count >= alvo : count === alvo) { out += ps.slice(last, m.index) + expand(c.rep, m); last = m.index + m[0].length; did = true; if (!c.g) break; }
  }
  return did ? out + ps.slice(last) : null;
}
export function rodaSed(spec, input) {
  const out = []; const N = input.length; const st = spec.cmds.map(() => ({ on: false, end: 0 }));
  const hit = (a, ln, ps) => (a.k === 'n' ? ln === a.n : a.k === 'last' ? ln === N : a.k === 're' ? rxOf(spec, a.re).test(ps) : a.k === 'step' ? ln >= a.first && (ln - a.first) % a.step === 0 : false);
  const casa = (c, ci, ln, ps) => {
    let r;
    if (!c.a) r = true;
    else if (c.a.k !== 'range') r = hit(c.a, ln, ps);
    else {
      const s = st[ci]; const { a, b } = c.a;
      if (!s.on) {
        r = hit(a, ln, ps);
        if (r) {
          s.on = true;
          if (b.k === 'n') { if (b.n <= ln) s.on = false; } else if (b.k === 'plus') { s.end = ln + b.n; if (b.n === 0) s.on = false; } else if (b.k === 'last') { if (ln === N) s.on = false; }
        }
      } else {
        r = true;
        if (b.k === 'n') { if (ln >= b.n) s.on = false; } else if (b.k === 'plus') { if (ln >= s.end) s.on = false; } else if (b.k === 'last') { if (ln === N) s.on = false; } else if (rxOf(spec, b.re).test(ps)) s.on = false;
      }
    }
    return c.neg ? !r : r;
  };
  for (let i = 0; i < N; i++) {
    let ps = input[i]; const ln = i + 1; let del = false; let quit = false; const fila = [];
    for (let ci = 0; ci < spec.cmds.length; ci++) {
      const c = spec.cmds[ci];
      if (!casa(c, ci, ln, ps)) continue;
      if (c.c === 'd') del = true;
      else if (c.c === 'p') out.push(ps);
      else if (c.c === 's') { const r = aplicaS(ps, c, spec); if (r !== null) { ps = r; if (c.p) out.push(ps); } } else if (c.c === 'y') ps = [...ps].map((ch) => { const k = c.from.indexOf(ch); return k >= 0 ? c.to[k] : ch; }).join('');
      else if (c.c === 'a') fila.push(c.t);
      else if (c.c === 'i') out.push(c.t);
      else if (c.c === 'c') { out.push(c.t); del = true; } else if (c.c === '=') out.push(String(ln));
      else if (c.c === 'q') quit = true;
      if (del) break;
    }
    if (!del && !spec.n) out.push(ps);
    out.push(...fila);
    if (quit) break;
  }
  return out;
}
const addrTxt = (a) => (a.k === 'n' ? String(a.n) : a.k === 'last' ? '$' : a.k === 're' ? `/${a.re}/` : a.k === 'plus' ? `+${a.n}` : a.k === 'step' ? `${a.first}~${a.step}` : `${addrTxt(a.a)},${addrTxt(a.b)}`);
export function cmdTxt(c) {
  const ad = c.a ? addrTxt(c.a) + (c.neg ? '!' : '') : '';
  if (c.c === 's') { const d = c.d ?? '/'; return `${ad}s${d}${c.pat}${d}${c.rep}${d}${c.g ? 'g' : ''}${c.num ? c.num : ''}${c.i ? 'I' : ''}${c.p ? 'p' : ''}`; }
  if (c.c === 'y') return `${ad}y/${c.from}/${c.to}/`;
  if (c.c === 'a' || c.c === 'i' || c.c === 'c') return `${ad}${c.c} ${c.t}`;
  return ad + c.c;
}
export const sedTxt = (spec) => `sed${spec.n ? ' -n' : ''}${spec.E ? ' -E' : ''} ${sq(spec.cmds.map(cmdTxt).join(';'))}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

/** variações plausíveis (erros típicos) de uma spec */
function variantes(spec) {
  const out = [];
  const v = (f) => { const s = clone(spec); f(s); out.push(s); };
  v((s) => { s.n = !s.n; });
  spec.cmds.forEach((c, i) => {
    if (c.a?.k === 'range') {
      if (c.a.b.k === 'n') { v((s) => { s.cmds[i].a.b.n += 1; }); v((s) => { s.cmds[i].a.b.n -= 1; }); }
      if (c.a.a.k === 'n') { v((s) => { s.cmds[i].a.a.n += 1; }); v((s) => { s.cmds[i].a.a.n -= 1; }); }
    }
    if (c.a?.k === 'n') { v((s) => { s.cmds[i].a.n += 1; }); v((s) => { s.cmds[i].a.n -= 1; }); }
    if (c.a) v((s) => { s.cmds[i].neg = !s.cmds[i].neg; });
    if (c.c === 'd') v((s) => { s.cmds[i].c = 'p'; });
    if (c.c === 'p') v((s) => { s.cmds[i].c = 'd'; });
    if (c.c === 's') {
      v((s) => { s.cmds[i].g = !s.cmds[i].g; });
      if (c.num) { v((s) => { s.cmds[i].num += 1; }); v((s) => { s.cmds[i].num = null; }); }
      v((s) => { s.cmds[i].i = !s.cmds[i].i; });
      if (spec.E) v((s) => { s.E = false; });
      v((s) => { s.cmds[i].p = !s.cmds[i].p; s.n = !s.n; });
    }
    if (c.c === 'a') { v((s) => { s.cmds[i].c = 'i'; }); v((s) => { s.cmds[i].c = 'c'; }); }
    if (c.c === 'i') { v((s) => { s.cmds[i].c = 'a'; }); v((s) => { s.cmds[i].c = 'c'; }); }
    if (c.c === 'c') { v((s) => { s.cmds[i].c = 'a'; }); v((s) => { s.cmds[i].c = 'i'; }); }
  });
  return out.filter((s) => s.cmds.every((c) => !c.a || c.a.k !== 'n' || c.a.n >= 1));
}

const GREGO = ['alfa', 'beta', 'gama', 'delta', 'epsilon', 'zeta', 'eta', 'teta', 'iota', 'kappa', 'lambda', 'sigma', 'omega', 'tau'];
const RE_ADDR = [{ b: 'a$', e: 'a$', d: 'terminam em "a"' }, { b: '^[a-d]', e: '^[a-d]', d: 'começam com uma letra de a a d' }, { b: 'ta', e: 'ta', d: 'contêm "ta"' }, { b: 'e.*a', e: 'e.*a', d: 'têm um "e" seguido, mais adiante, de um "a"' }, { b: '^.\\{4\\}$', e: '^.{4}$', d: 'têm exatamente 4 letras' }, { b: 'a\\|o', e: 'a|o', d: 'contêm "a" ou "o"' }, { b: '^[^aeiou]', e: '^[^aeiou]', d: 'não começam com vogal' }];
const nm = (n) => ({ k: 'n', n });
const saida = (lines) => (lines.length ? lines.join(', ') : '(nenhuma saída)');
const REF = ['101:p.393-397'];

const sedAddr = {
  id: 'sed-addr', obj: '103.7', nivel: 2, peso: 3,
  make(rng) {
    const words = rng.sample(GREGO, rng.int(7, 9));
    const E = rng.chance(0.3); const re = rng.pick(RE_ADDR); const rtx = E ? re.e : re.b;
    const N = words.length; const a = rng.int(2, N - 3); const b = rng.int(a + 1, Math.min(N - 1, a + 3));
    const re2 = rng.pick(RE_ADDR.filter((x) => x !== re));
    const familias = [
      () => ({ n: false, cmds: [{ a: nm(a), c: 'd' }] }),
      () => ({ n: false, cmds: [{ a: { k: 'range', a: nm(a), b: nm(b) }, c: 'd' }] }),
      () => ({ n: false, cmds: [{ a: { k: 'range', a: nm(a), b: { k: 'last' } }, c: 'd' }] }),
      () => ({ n: false, cmds: [{ a: { k: 'last' }, c: 'd' }] }),
      () => ({ n: false, cmds: [{ a: { k: 're', re: rtx }, c: 'd' }] }),
      () => ({ n: false, cmds: [{ a: { k: 're', re: rtx }, neg: true, c: 'd' }] }),
      () => ({ n: true, cmds: [{ a: nm(a), c: 'p' }] }),
      () => ({ n: true, cmds: [{ a: { k: 'range', a: nm(a), b: nm(b) }, c: 'p' }] }),
      () => ({ n: true, cmds: [{ a: { k: 're', re: rtx }, c: 'p' }] }),
      () => ({ n: true, cmds: [{ a: { k: 're', re: rtx }, neg: true, c: 'p' }] }),
      () => ({ n: true, cmds: [{ a: { k: 'last' }, c: 'p' }] }),
      () => ({ n: false, cmds: [{ a: nm(a), c: 'p' }] }),
      () => ({ n: false, cmds: [{ a: { k: 'range', a: nm(a), b: nm(b) }, c: 'p' }] }),
      () => ({ n: false, cmds: [{ a: { k: 'step', first: 1, step: 2 }, c: 'd' }] }),
      () => ({ n: true, cmds: [{ a: { k: 'step', first: 2, step: 2 }, c: 'p' }] }),
      () => ({ n: false, cmds: [{ a: nm(a), c: 'q' }] }),
      () => ({ n: false, cmds: [{ a: { k: 'range', a: nm(a), b: { k: 'plus', n: 2 } }, c: 'd' }] }),
      () => ({ n: false, cmds: [{ a: { k: 'range', a: { k: 're', re: rtx }, b: { k: 're', re: E ? re2.e : re2.b } }, c: 'd' }] }),
      () => ({ n: false, cmds: [{ a: nm(a), c: 'a', t: 'NOVA' }] }),
      () => ({ n: false, cmds: [{ a: nm(a), c: 'i', t: 'NOVA' }] }),
      () => ({ n: false, cmds: [{ a: nm(a), c: 'c', t: 'NOVA' }] }),
      () => ({ n: true, cmds: [{ a: { k: 'last' }, c: '=' }] }),
    ];
    const spec = rng.pick(familias)(); spec.E = E && spec.cmds.some((c) => c.a?.k === 're' || c.a?.k === 'range' && c.a.a.k === 're');
    const real = rodaSed(spec, words); const correct = saida(real);
    const alts = variantes(spec).map((s) => saida(rodaSed(s, words)));
    const cmd = sedTxt(spec);
    const c0 = spec.cmds[0];
    const frases = {
      d: 'apaga (`d`) as linhas selecionadas pelo endereço; as demais seguem para a saída (impressão automática)',
      p: spec.n ? 'com `-n` a impressão automática é desligada; só sai o que o `p` imprime' : 'sem `-n`, o `p` imprime a linha selecionada **além** da impressão automática, então ela aparece duas vezes',
      q: '`q` imprime a linha atual (autoprint) e encerra: tudo depois some',
      a: '`a` anexa o texto depois da linha endereçada', i: '`i` insere o texto antes da linha endereçada', c: '`c` substitui a linha endereçada pelo texto', '=': '`=` imprime o número da linha; com `-n` e `$` só a última, ou seja, o total de linhas',
    };
    return {
      type: 'unica',
      text: `O arquivo \`greek.txt\` contém, uma por linha, as palavras abaixo:\n\n${block(words.map((w, k) => `${k + 1}  ${w}`).join('\n'))}\n\n(O número à esquerda não faz parte do arquivo.) Qual é a saída do comando abaixo? As linhas de saída são mostradas separadas por vírgula.\n\n${block(`${cmd} greek.txt`)}`,
      options: mcq(rng, correct, [...alts, saida(words), saida(words.slice(0, -1)), saida(words.slice(1))]),
      explanation: `${cmd}: ${frases[c0.c]}.${c0.a?.k === 'step' ? ' `primeira~passo` (extensão do GNU sed) seleciona as linhas primeira, primeira+passo, ...' : ''}${c0.a?.k === 'range' ? ' Um intervalo `A,B` vai da linha A até a B, inclusive.' : ''}${c0.neg ? ' O `!` depois do endereço inverte a seleção.' : ''}${spec.E ? ' `-E` ativa ERE nos endereços e na substituição.' : ' Sem `-E`, as regex são BRE.'} Saída: ${correct}.`,
      ref: REF,
      verify: { sh: `printf '%s\\n' ${words.map(sq).join(' ')} | ${cmd} | paste -sd, - | sed 's/,/, /g'`, expect: real.join(', ') },
    };
  },
};

// ---------------------------------------------------------------- sed s///
const SUBST = [
  (rng) => { const p = rng.pick([['-', '_'], [':', ' '], [',', ';'], ['/', '|']]); const campos = rng.sample(['um', 'dois', 'tres', 'quatro', 'cinco', 'seis'], rng.int(3, 5)); const line = campos.join(p[0]); const mode = rng.pick(['', 'g', '2', '2g']); const d = p[0] === '/' ? '#' : '/'; return { E: false, line, cmd: { c: 's', pat: p[0] === '.' ? '\\.' : p[0], rep: p[1], g: mode.includes('g'), num: /\d/.test(mode) ? 2 : null, d } }; },
  (rng) => ({ E: false, line: `tel ${rng.int(100, 999)} cel ${rng.int(10000, 99999)} fixo ${rng.int(10, 99)}`, cmd: { c: 's', pat: '[0-9]\\+', rep: rng.pick(['(&)', '<&>', '[&]', '&&']), g: rng.chance(0.7) } }),
  (rng) => { const k = rng.pick(['nome', 'idade', 'cidade']); const v = rng.pick(['maria', '42', 'recife', 'x7']); return { E: false, line: `${k}=${v}`, cmd: { c: 's', pat: '\\([a-z]*\\)=\\(.*\\)', rep: '\\2=\\1' } }; },
  (rng) => { const k = rng.pick(['usuario', 'grupo', 'dir']); const v = rng.pick(['ana', 'dev', 'home']); return { E: true, line: `${k}:${v}`, cmd: { c: 's', pat: '([a-z]+):([a-z]+)', rep: '\\2:\\1' } }; },
  (rng) => ({ E: false, line: `${rng.pick(['/usr/local/bin', '/usr/local/lib', '/opt/usr/local/x'])}`, cmd: { c: 's', pat: '/usr/local', rep: rng.pick(['/opt', '/srv']), d: '|' } }),
  (rng) => ({ E: false, line: rng.pick(['Erro: disco cheio. erro: rede', 'ERRO no erro de ERRO', 'erro e Erro']), cmd: { c: 's', pat: 'erro', rep: 'ok', g: true, i: rng.chance(0.6) } }),
  (rng) => ({ E: false, line: `${rng.int(1, 9)}.${rng.int(10, 99)} e ${rng.int(1, 9)}.${rng.int(10, 99)}`, cmd: { c: 's', pat: '\\.', rep: ',', g: rng.chance(0.6) } }),
  (rng) => ({ E: false, line: rng.pick(['  texto com   espacos   ', 'a  b   c', ' fim  ']), cmd: rng.pick([{ c: 's', pat: ' \\+', rep: ' ', g: true }, { c: 's', pat: '^ *', rep: '' }, { c: 's', pat: ' *$', rep: '' }]) }),
  (rng) => ({ E: false, line: rng.pick(['linha de teste', 'abc def ghi', 'um dois']), cmd: rng.pick([{ c: 's', pat: '^', rep: '> ' }, { c: 's', pat: '$', rep: ';' }, { c: 's', pat: '^', rep: '# ' }]) }),
  (rng) => ({ E: true, line: rng.pick(['cor e color', 'colour', 'a cor da colour']), cmd: { c: 's', pat: 'colou?r', rep: 'COR', g: true } }),
  (rng) => ({ E: true, line: rng.pick(['gato rato pato', 'rato pato', 'o gato e o rato']), cmd: { c: 's', pat: '(gato|rato)', rep: '[\\1]', g: true } }),
  (rng) => ({ E: false, line: rng.pick(['abc123def45', 'x9y88z777', 'ab12']), cmd: { c: 's', pat: '[0-9]', rep: '', g: true } }),
];
const sedSubst = {
  id: 'sed-subst', obj: '103.7', nivel: 3, peso: 3,
  make(rng) {
    for (let t = 0; t < 50; t++) {
      const s = rng.pick(SUBST)(rng); const spec = { n: false, E: s.E, cmds: [s.cmd] };
      const real = rodaSed(spec, [s.line])[0];
      const alts = variantes(spec).map((v) => rodaSed(v, [s.line]).join(String.fromCharCode(10)) || "(nenhuma saída)").filter((x) => x !== real && !x.includes(String.fromCharCode(10)));
      alts.push(s.line);
      const seen = new Set([real.trim()]); const opts = []; for (const x of alts) if (x.trim() && !seen.has(x.trim())) { seen.add(x.trim()); opts.push(x); }
      if (opts.length < 3) continue;
      const cmd = sedTxt(spec);
      const c = s.cmd;
      const explic = [];
      explic.push(`\`${cmd}\` aplica \`s/ER/substituto/\` a cada linha.`);
      if (!c.g && !c.num) explic.push('Sem o flag `g`, só a **primeira** ocorrência por linha é substituída.');
      if (c.g && !c.num) explic.push('O flag `g` substitui **todas** as ocorrências.');
      if (c.num) explic.push(`O número ${c.num} faz a substituição valer só para a ${c.num}ª ocorrência${c.g ? ' (e, com `g`, também para as seguintes)' : ''}.`);
      if (c.i) explic.push('O flag `I` ignora maiúsculas/minúsculas.');
      if (c.rep.includes('&')) explic.push('`&` representa o trecho que casou.');
      if (/\\[12]/.test(c.rep)) explic.push('`\\1`, `\\2` reinserem os trechos capturados por grupos (`\\( \\)` em BRE, `( )` em ERE).');
      if (c.d && c.d !== '/') explic.push(`O delimitador pode ser qualquer caractere (aqui \`${c.d}\`), o que evita escapar as barras.`);
      if (s.E) explic.push('`-E` ativa ERE: `+ ? | ( )` funcionam sem barra invertida.');
      return {
        type: 'unica', text: `Qual é a saída do comando abaixo?\n\n${block(`echo ${sq(s.line)} | ${cmd}`)}`,
        options: mcq(rng, real, opts),
        explanation: `${explic.join(' ')} Resultado: \`${real}\`.`, ref: REF,
        verify: { sh: `printf '%s\\n' ${sq(s.line)} | ${cmd}`, expect: real },
      };
    }
    throw new Error('sed-subst');
  },
};

// ---------------------------------------------------------------- sed: qual comando?
const sedGoal = {
  id: 'sed-goal', obj: '103.7', nivel: 2, peso: 2,
  make(rng) {
    const words = rng.sample(GREGO, rng.int(6, 8)); const N = words.length;
    const a = rng.int(2, N - 3); const b = rng.int(a + 1, Math.min(N - 1, a + 2)); const re = rng.pick(RE_ADDR);
    const X = rng.pick(['a', 'e', 'o']); const Y = rng.pick(['4', '3', '0', '@']);
    const T = [
      { t: `imprimir **somente** as linhas ${a} a ${b}`, s: { n: true, cmds: [{ a: { k: 'range', a: nm(a), b: nm(b) }, c: 'p' }] }, lines: words },
      { t: `remover as linhas ${a} a ${b} (e mostrar as demais)`, s: { n: false, cmds: [{ a: { k: 'range', a: nm(a), b: nm(b) }, c: 'd' }] }, lines: words },
      { t: `remover as linhas que ${re.d}`, s: { n: false, cmds: [{ a: { k: 're', re: re.b }, c: 'd' }] }, lines: words },
      { t: `mostrar somente as linhas que ${re.d}`, s: { n: true, cmds: [{ a: { k: 're', re: re.b }, c: 'p' }] }, lines: words },
      { t: 'remover a primeira linha', s: { n: false, cmds: [{ a: nm(1), c: 'd' }] }, lines: words },
      { t: 'remover a última linha', s: { n: false, cmds: [{ a: { k: 'last' }, c: 'd' }] }, lines: words },
      { t: `trocar **todas** as ocorrências da letra "${X}" por "${Y}" em cada linha`, s: { n: false, cmds: [{ c: 's', pat: X, rep: Y, g: true }] }, lines: words },
      { t: `trocar apenas a **primeira** ocorrência de "${X}" por "${Y}" em cada linha`, s: { n: false, cmds: [{ c: 's', pat: X, rep: Y }] }, lines: words },
      { t: `trocar apenas a **segunda** ocorrência de "${X}" por "${Y}" em cada linha`, s: { n: false, cmds: [{ c: 's', pat: X, rep: Y, num: 2 }] }, lines: words },
      { t: `inserir a linha "NOVA" **antes** da linha ${a}`, s: { n: false, cmds: [{ a: nm(a), c: 'i', t: 'NOVA' }] }, lines: words },
      { t: `inserir a linha "NOVA" **depois** da linha ${a}`, s: { n: false, cmds: [{ a: nm(a), c: 'a', t: 'NOVA' }] }, lines: words },
      { t: `substituir a linha ${a} inteira pela linha "NOVA"`, s: { n: false, cmds: [{ a: nm(a), c: 'c', t: 'NOVA' }] }, lines: words },
      { t: `mostrar somente as ${a} primeiras linhas e encerrar`, s: { n: false, cmds: [{ a: nm(a), c: 'q' }] }, lines: words },
      { t: 'imprimir a quantidade de linhas do arquivo', s: { n: true, cmds: [{ a: { k: 'last' }, c: '=' }] }, lines: words },
    ];
    const g = rng.pick(T);
    const real = rodaSed(g.s, words);
    const vs = variantes(g.s).filter((v) => rodaSed(v, words).join('\n') !== real.join('\n'));
    const wrongs = [...new Set(vs.filter((v) => rodaSed(v, words).join('\n') !== real.join('\n')).map(sedTxt))].filter((x) => x !== sedTxt(g.s));
    if (wrongs.length < 3) wrongs.push(`sed -n '${a},${b}!p'`, `sed '${a}d;${b}d'`, "sed -n '$p'");
    const okTxt = sedTxt(g.s);
    const options = mcq(rng, okTxt, wrongs);
    const ordered = [options.find((o) => o.ok).t, ...options.filter((o) => !o.ok).map((o) => o.t)];
    const alvo = real.join('\n');
    return {
      type: 'unica', text: `Qual comando do GNU sed faz o seguinte com o arquivo \`greek.txt\`: ${g.t}?`,
      options: options.map((o) => ({ ...o, t: `${o.t} greek.txt` })),
      explanation: `Resposta: \`${okTxt} greek.txt\`. Lembre-se: \`-n\` desliga a impressão automática (use com \`p\`); sem \`-n\`, \`p\` duplica as linhas; \`d\` apaga a linha; \`s/ER/novo/\` troca a primeira ocorrência, com \`g\` todas, com um número a N-ésima; \`i\`, \`a\` e \`c\` inserem antes, depois e substituem; \`$\` é a última linha e \`$=\` com \`-n\` conta as linhas.`,
      ref: REF,
      verify: chooseVerify(`printf '%s\\n' ${words.map(sq).join(' ')} > greek.txt`, ordered.map((c) => `${c} greek.txt`), alvo),
    };
  },
};

export const generators = [sedAddr, sedSubst, sedGoal];
