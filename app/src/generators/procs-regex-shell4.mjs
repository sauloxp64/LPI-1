// 103.8 — vi/vim: emulador mínimo do modo normal e geradores (verificados com `vim -es` real).
import { mcq, code, block } from './util.mjs';
import { sq, chooseVerify } from './procs-regex-shell.mjs';
import { toJs } from './procs-regex-shell2.mjs';

class Err extends Error {}
const fnbOf = (s) => Math.min(/^ */.exec(s)[0].length, Math.max(0, s.length - 1));
const nextWord = (s, c) => { for (let i = c + 1; i < s.length; i++) if (s[i] !== ' ' && s[i - 1] === ' ') return i; return null; };
const endWord = (s, c) => { let j = c; while (j + 1 < s.length && s[j + 1] !== ' ') j++; return j; };
const cnt = (n) => (n > 1 ? String(n) : '');

/** teclas (como o usuário digita) de um token */
export function keysOf(t) {
  switch (t.k) {
    case 'dd': case 'yy': case 'dw': return `${cnt(t.n ?? 1)}${t.k}`;
    case 'x': case 'j': case 'k': case 'w': return `${cnt(t.n ?? 1)}${t.k}`;
    case 'NG': return `${t.n}G`;
    case 'cw': case 'o': case 'O': case 'A': case 'I': case 'i': case 'a': return `${t.k}${t.t}<Esc>`;
    case 'r': return `r${t.ch}`;
    case 'ex': return `:${t.cmd}<Enter>`;
    case 'search': return `${t.dir > 0 ? '/' : '?'}${t.pat}<Enter>`;
    case 'raw': return t.keys;
    case 'exit': return t.how === 'ZZ' || t.how === 'ZQ' ? t.how : `:${t.how}<Enter>`;
    default: return t.k;
  }
}
export const keysTxt = (ts) => ts.map(keysOf).join('');

/** executa tokens sobre `lines0`; devolve { lines (buffer), saved (arquivo em disco ao final), quit } ou lança Err se algum comando falhar */
export function viRun(lines0, tokens) {
  let L = lines0.slice(); let r = 0; let c = 0; let want = 0; let reg = null; const undo = []; let saved = lines0.slice(); let quit = false; let unk = false; let lastSearch = null;
  const snap = () => undo.push({ L: L.slice(), r, c });
  const setC = (x) => { c = x; want = x; };
  const rel = new Set(['G', 'gg', 'NG', 'ex', 'exit', 'search']);
  for (const t of tokens) {
    if (quit) break;
    if (unk && !rel.has(t.k)) throw new Err('cursor desconhecido');
    switch (t.k) {
      case 'dd': { const n = t.n ?? 1; if (r + n > L.length || n >= L.length) throw new Err(); snap(); reg = { lw: true, t: L.splice(r, n) }; r = Math.min(r, L.length - 1); setC(fnbOf(L[r])); break; }
      case 'yy': { const n = t.n ?? 1; if (r + n > L.length) throw new Err(); reg = { lw: true, t: L.slice(r, r + n) }; break; }
      case 'p': case 'P': {
        if (!reg) throw new Err(); snap();
        if (reg.lw) { const at = t.k === 'p' ? r + 1 : r; L.splice(at, 0, ...reg.t); r = at; setC(fnbOf(L[r])); } else {
          const s = L[r]; const pos = t.k === 'p' && s !== '' ? c + 1 : c; L[r] = s.slice(0, pos) + reg.t + s.slice(pos); setC(pos + reg.t.length - 1);
        }
        break;
      }
      case 'x': { const s = L[r]; if (s === '') throw new Err(); const k = Math.min(t.n ?? 1, s.length - c); snap(); reg = { lw: false, t: s.slice(c, c + k) }; L[r] = s.slice(0, c) + s.slice(c + k); setC(Math.min(c, Math.max(0, L[r].length - 1))); break; }
      case 'X': { if (c === 0) throw new Err(); const s = L[r]; snap(); reg = { lw: false, t: s[c - 1] }; L[r] = s.slice(0, c - 1) + s.slice(c); setC(c - 1); break; }
      case 'dw': {
        const s = L[r]; if (s === '') throw new Err(); let pos = c;
        for (let i = 0; i < (t.n ?? 1); i++) { const nx = nextWord(s, pos); if (nx === null) { if (i < (t.n ?? 1) - 1) throw new Err(); pos = s.length; break; } pos = nx; }
        snap(); reg = { lw: false, t: s.slice(c, pos) }; L[r] = s.slice(0, c) + s.slice(pos); setC(Math.min(c, Math.max(0, L[r].length - 1))); break;
      }
      case 'D': { const s = L[r]; if (s === '') throw new Err(); snap(); reg = { lw: false, t: s.slice(c) }; L[r] = s.slice(0, c); setC(Math.max(0, c - 1)); break; }
      case 'J': { if (r + 1 >= L.length || L[r] === '') throw new Err(); const a = L[r]; const b = L[r + 1].replace(/^ +/, ''); snap(); L.splice(r, 2, b ? `${a} ${b}` : a); setC(b ? a.length : Math.max(0, a.length - 1)); break; }
      case 'cw': { const s = L[r]; if (s === '' || s[c] === ' ') throw new Err(); const e = endWord(s, c); snap(); reg = { lw: false, t: s.slice(c, e + 1) }; L[r] = s.slice(0, c) + t.t + s.slice(e + 1); setC(c + t.t.length - 1); break; }
      case 'r': { const s = L[r]; if (s === '') throw new Err(); snap(); L[r] = s.slice(0, c) + t.ch + s.slice(c + 1); break; }
      case 'o': snap(); L.splice(r + 1, 0, t.t); r++; setC(t.t.length - 1); break;
      case 'O': snap(); L.splice(r, 0, t.t); setC(t.t.length - 1); break;
      case 'A': snap(); L[r] += t.t; setC(L[r].length - 1); break;
      case 'I': { snap(); const p = /^ */.exec(L[r])[0].length; L[r] = L[r].slice(0, p) + t.t + L[r].slice(p); setC(p + t.t.length - 1); break; }
      case 'i': { snap(); const s = L[r]; const p = s === '' ? 0 : c; L[r] = s.slice(0, p) + t.t + s.slice(p); setC(p + t.t.length - 1); break; }
      case 'a': { snap(); const s = L[r]; const p = s === '' ? 0 : c + 1; L[r] = s.slice(0, p) + t.t + s.slice(p); setC(p + t.t.length - 1); break; }
      case 'G': r = L.length - 1; setC(fnbOf(L[r])); unk = false; break;
      case 'gg': r = 0; setC(fnbOf(L[0])); unk = false; break;
      case 'NG': r = Math.min(t.n, L.length) - 1; setC(fnbOf(L[r])); unk = false; break;
      case 'dG': { if (r === 0) throw new Err(); snap(); reg = { lw: true, t: L.splice(r) }; r = L.length - 1; setC(fnbOf(L[r])); break; }
      case 'dgg': { if (r === L.length - 1) throw new Err(); snap(); reg = { lw: true, t: L.splice(0, r + 1) }; r = 0; setC(fnbOf(L[0])); break; }
      case 'j': case 'k': { const d = t.k === 'j' ? (t.n ?? 1) : -(t.n ?? 1); if (r + d < 0 || r + d >= L.length) throw new Err(); r += d; c = Math.max(0, Math.min(want === Infinity ? 1e9 : want, L[r].length - 1)); break; }
      case '0': setC(0); break;
      case '$': c = Math.max(0, L[r].length - 1); want = Infinity; break;
      case '^': setC(fnbOf(L[r])); break;
      case 'w': for (let i = 0; i < (t.n ?? 1); i++) { const nx = nextWord(L[r], c); if (nx !== null) c = nx; else if (r + 1 < L.length) { r++; c = /^ */.exec(L[r])[0].length; } else throw new Err(); } want = c; break;
      case 'u': { if (!undo.length) throw new Err(); const s = undo.pop(); L = s.L; r = s.r; c = s.c; want = c; unk = true; break; }
      case 'search': {
        const pat = t.pat === '' && lastSearch ? lastSearch : t.pat; lastSearch = pat; let found = null;
        const n = L.length;
        for (let step = 0; step <= n && found === null; step++) {
          const li = (((r + t.dir * step) % n) + n) % n; const s = L[li];
          if (t.dir > 0) { const from = step === 0 ? c + 1 : 0; const k = s.indexOf(pat, from); if (k >= 0) found = [li, k]; } else { const to = step === 0 ? c - 1 : s.length; const k = to < 0 ? -1 : s.lastIndexOf(pat, to); if (k >= 0 && (step !== 0 || k < c)) found = [li, k]; }
        }
        if (!found) throw new Err(); [r, c] = found; want = c; unk = false; break;
      }
      case 'ex': {
        const e = t.e; snap();
        const n = L.length; const lo = e.rg === '%' ? 0 : e.rg ? e.rg[0] - 1 : r; const hi = e.rg === '%' ? n - 1 : e.rg ? e.rg[1] - 1 : r;
        if (hi >= n || lo < 0) throw new Err();
        if (e.c === 's') {
          const re = new RegExp(toJs(e.pat, false), e.g ? 'g' : ''); let last = -1;
          for (let i = lo; i <= hi; i++) { const nv = L[i].replace(re, e.rep); if (nv !== L[i]) { L[i] = nv; last = i; } }
          if (last < 0) throw new Err(); r = last; c = 0; unk = true;
        } else if (e.c === 'd') { if (hi - lo + 1 >= n) throw new Err(); reg = { lw: true, t: L.splice(lo, hi - lo + 1) }; r = Math.min(lo, L.length - 1); unk = true; } else if (e.c === 'g' || e.c === 'v') {
          const re = new RegExp(toJs(e.pat, false)); const keep = L.filter((l) => re.test(l) === (e.c === 'v')); if (keep.length === L.length || keep.length === 0) throw new Err(); L = keep; r = Math.min(r, L.length - 1); unk = true;
        } else if (e.c === 'goto') { if (e.n > n) throw new Err(); r = e.n - 1; c = 0; setC(fnbOf(L[r])); unk = false; }
        break;
      }
      case 'exit': {
        if (t.how === 'w') { saved = L.slice(); break; }
        if (t.how === 'ZZ' || t.how === 'wq' || t.how === 'x') saved = L.slice();
        quit = true; break;
      }
      default: throw new Err('token?');
    }
  }
  return { lines: L, saved, quit };
}

const exTxt = (e) => (e.c === 'goto' ? String(e.n) : e.c === 's' ? `${e.rg === '%' ? '%' : e.rg ? `${e.rg[0]},${e.rg[1]}` : ''}s/${e.pat}/${e.rep}/${e.g ? 'g' : ''}` : e.c === 'd' ? `${e.rg ? `${e.rg[0]},${e.rg[1]}` : ''}d` : `g${e.c === 'v' ? '!' : ''}/${e.pat}/d`);
const mkEx = (e) => ({ k: 'ex', e, cmd: exTxt(e) });

/** script vimscript (um token por exe, com quebra de undo) -> comando sh que imprime o arquivo final */
export function vimSh(lines, tokens) {
  const vs = ['normal! gg'];
  for (const t of tokens) {
    if (t.k === 'ex') vs.push(t.cmd);
    else if (t.k === 'exit' && t.how !== 'ZZ' && t.how !== 'ZQ') vs.push(t.how);
    else vs.push(`exe "normal! ${keysOf(t).replace(/<Esc>/g, '\\<Esc>').replace(/<Enter>/g, '\\<CR>').replace(/"/g, '\\"')}"`);
    vs.push('let &ul=&ul');
  }
  return `printf '%s\\n' ${lines.map(sq).join(' ')} > f\nprintf '%s\\n' ${vs.map(sq).join(' ')} > s.vim\nvim -es -u NONE -N -S s.vim f\npaste -sd'|' - < f`;
}
export const lineOut = (ls) => ls.join('|');

// ---------------------------------------------------------------- geração de sequências
const PALAVRAS = ['um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'sol', 'lua', 'mar', 'rio', 'vento', 'nuvem', 'chuva', 'terra', 'fogo', 'agua'];
const INS = ['novo', 'fim', 'texto', 'ok', 'abc', 'x1', 'zeta'];
function fazTexto(rng) {
  const n = rng.int(4, 5); return Array.from({ length: n }, () => rng.sample(PALAVRAS, rng.int(2, 3)).join(' '));
}
const clone = (s) => JSON.parse(JSON.stringify(s));
function tokenAleatorio(rng, ls, estado, ultimo) {
  const pesos = [['dd', 3], ['yy', 1], ['p', 2], ['P', 1], ['x', 1], ['X', 0.4], ['dw', 1.5], ['D', 1], ['J', 1.2], ['cw', 1.5], ['r', 0.4], ['o', 1.2], ['O', 0.8], ['A', 1], ['I', 0.5], ['i', 0.3], ['a', 0.3], ['G', 0.6], ['gg', 0.4], ['NG', 0.6], ['j', 1.5], ['k', 0.8], ['w', 0.6], ['$', 0.5], ['0', 0.3], ['dG', 0.4], ['ex', 1.4]];
  const k = rng.weighted(pesos, (x) => x[1])[0];
  const n = rng.pick([1, 1, 2, 3]);
  const txt = () => rng.sample(INS, rng.int(1, 2)).join(' ');
  switch (k) {
    case 'dd': case 'yy': case 'dw': case 'x': case 'j': case 'k': case 'w': return { k, n };
    case 'cw': case 'o': case 'O': case 'A': case 'I': case 'i': case 'a': return { k, t: txt() };
    case 'r': return { k, ch: rng.pick(['X', 'Z', '9', 'K']) };
    case 'NG': return { k, n: rng.int(1, ls.length) };
    case 'ex': {
      const a = rng.int(1, ls.length - 1); const b = rng.int(a, ls.length);
      const pal = rng.pick(ls).split(' ')[0]; const letra = rng.pick('aeiou'.split(''));
      return mkEx(rng.pick([{ c: 's', pat: letra, rep: rng.pick(['0', '4', 'X']), g: true }, { c: 's', pat: letra, rep: '7', g: false }, { c: 's', rg: [a, b], pat: letra, rep: rng.pick(['0', 'X']), g: true }, { c: 's', rg: '%', pat: letra, rep: '5', g: true }, { c: 'd', rg: [a, b] }, { c: 'd', rg: [a, a] }, { c: 'g', pat: letra }, { c: 'v', pat: pal }]));
    }
    default: return { k };
  }
}
/** gera tokens + exit; `estado` guarda o prefixo válido */
export function geraSeq(rng, ls, { min = 2, max = 4, permiteU = true } = {}) {
  for (let tent = 0; tent < 200; tent++) {
    const total = rng.int(min, max); const toks = [];
    let ok = true;
    for (let i = 0; i < total && ok; i++) {
      let achou = false;
      for (let t = 0; t < 40 && !achou; t++) {
        let tk = tokenAleatorio(rng, ls, null, toks[toks.length - 1]);
        if (toks.length && toks[toks.length - 1].k === 'yy' && !['p', 'P'].includes(tk.k)) tk = { k: rng.pick(['p', 'P']) };
        try { viRun(ls, [...toks, tk]); toks.push(tk); achou = true; } catch (e) { if (!(e instanceof Err)) throw e; }
      }
      if (!achou) ok = false;
    }
    if (!ok || !toks.length) continue;
    if (toks[toks.length - 1].k === 'yy') continue;
    if (permiteU && rng.chance(0.2)) { const u = { k: 'u' }; try { viRun(ls, [...toks, u]); toks.push(u); } catch (e) { /* ignora */ } }
    const exit = { k: 'exit', how: rng.pick(['ZZ', 'ZZ', 'wq', 'x']) };
    const res = viRun(ls, [...toks, exit]);
    if (res.saved.join('|') === ls.join('|')) continue;
    if (res.saved.length < 1 || res.saved.some((l) => l === '')) continue;
    return { toks, exit, final: res.saved };
  }
  throw new Error('geraSeq');
}
/** variações com um erro típico */
function variacoes(ls, toks, exit) {
  const out = [];
  const add = (nt, ex = exit) => out.push([nt, ex]);
  toks.forEach((t, i) => {
    const sub = (nv) => { const c = toks.slice(); c[i] = nv; return c; };
    if (t.k === 'p') add(sub({ k: 'P' })); if (t.k === 'P') add(sub({ k: 'p' }));
    if (t.k === 'dd') add(sub({ ...t, k: 'yy' }));
    if (t.k === 'yy') add(sub({ ...t, k: 'dd' }));
    if (['dd', 'yy', 'x', 'dw', 'j', 'k', 'w'].includes(t.k)) { add(sub({ ...t, n: (t.n ?? 1) + 1 })); if ((t.n ?? 1) > 1) add(sub({ ...t, n: (t.n ?? 1) - 1 })); }
    if (t.k === 'x') add(sub({ k: 'X' })); if (t.k === 'D') add(sub({ k: 'dd' })); if (t.k === 'dd' && !t.n) add(sub({ k: 'D' }));
    if (t.k === 'dw') add(sub({ k: 'x', n: 1 })); if (t.k === 'j') add(sub({ ...t, k: 'k' })); if (t.k === 'k') add(sub({ ...t, k: 'j' }));
    if (t.k === 'G') add(sub({ k: 'gg' })); if (t.k === 'o') add(sub({ ...t, k: 'O' })); if (t.k === 'O') add(sub({ ...t, k: 'o' }));
    if (t.k === 'A') add(sub({ ...t, k: 'I' })); if (t.k === 'a') add(sub({ ...t, k: 'i' })); if (t.k === 'i') add(sub({ ...t, k: 'a' }));
    if (t.k === 'ex' && t.e.c === 's') { add(sub(mkEx({ ...t.e, g: !t.e.g }))); if (!t.e.rg) add(sub(mkEx({ ...t.e, rg: '%' }))); }
    if (t.k === 'ex' && t.e.c === 'g') add(sub(mkEx({ ...t.e, c: 'v' })));
    if (t.k === 'ex' && t.e.c === 'v') add(sub(mkEx({ ...t.e, c: 'g' })));
    add(toks.filter((_, j) => j !== i));
    if (i + 1 < toks.length) { const c = toks.slice(); [c[i], c[i + 1]] = [c[i + 1], c[i]]; add(c); }
  });
  add(toks, { k: 'exit', how: 'ZQ' });
  const res = [];
  for (const [nt, ex] of out) { if (!nt.length) continue; try { const r = viRun(ls, [...nt, ex]); res.push({ toks: nt, exit: ex, final: r.saved }); } catch (e) { if (!(e instanceof Err)) throw e; } }
  return res;
}
const mostra = (ls) => `\`${ls.join(' / ')}\``;
const textoArq = (ls) => block(ls.join('\n'));
const REF = ['101:p.410-413'];
const EXPL_BASE = 'No **modo normal** do vi: `dd` apaga (recorta) a linha, `yy` copia a linha, `p` cola **depois/abaixo** do cursor e `P` cola **antes/acima**; `x` apaga o caractere sob o cursor, `dw` apaga até o início da próxima palavra, `D` apaga até o fim da linha, `J` junta a linha seguinte à atual, `cw` troca a palavra, `o`/`O` abrem linha abaixo/acima, `A`/`I` inserem no fim/início da linha, `u` desfaz. Em `:s/a/b/` só a primeira ocorrência de cada linha troca (use `g` para todas); `ZZ`, `:wq` e `:x` gravam e saem, `ZQ` e `:q!` saem **sem** gravar.';

const tenta = (fn) => (rng) => { for (let t = 0; t < 15; t++) { try { return fn(rng); } catch (e) { if (e.message !== 'poucas variações') throw e; } } throw new Error('sem variações suficientes'); };
const viFinal = {
  id: 'vi-final-text', obj: '103.8', nivel: 3, peso: 3,
  make: tenta((rng) => {
    const ls = fazTexto(rng); const { toks, exit, final } = geraSeq(rng, ls);
    const seq = [...toks, exit];
    const vars = variacoes(ls, toks, exit).map((v) => v.final.join('|')).filter((x) => x !== final.join('|'));
    const pool = [...new Set(vars)].map((x) => x.split('|'));
    if (pool.length < 3) throw new Error('poucas variações');
    pool.push(ls);
    const options = mcq(rng, final.join(' / '), pool.map((p) => p.join(' / ')).map((x) => x));
    const passos = [];
    let acc = [];
    for (const t of toks) { acc.push(t); const r = viRun(ls, acc); passos.push(`${keysOf(t)} → ${r.lines.join(' / ')}`); }
    return {
      type: 'unica',
      text: `O arquivo \`notas.txt\` contém as linhas abaixo e é aberto com \`vi notas.txt\` (o cursor começa no primeiro caractere da linha 1):\n\n${textoArq(ls)}\n\nNo modo normal, são digitadas as teclas abaixo, nesta ordem (\`<Esc>\` é a tecla Esc e \`<Enter>\` a tecla Enter):\n\n${block(keysTxt(seq))}\n\nQual é o conteúdo do arquivo \`notas.txt\` no disco depois disso? (linhas separadas por " / ")`,
      options: options.map((o) => ({ ...o, t: '`' + o.t + '`' })),
      explanation: `Passo a passo: ${passos.join('; ')}; depois \`${keysOf(exit)}\` ${exit.how === 'ZZ' || exit.how === 'wq' || exit.how === 'x' ? 'grava e sai' : 'sai sem gravar'}. Resultado: ${final.join(' / ')}. ${EXPL_BASE}`,
      ref: REF,
      verify: { sh: vimSh(ls, seq), expect: lineOut(final) },
    };
  }),
};

const viGoal = {
  id: 'vi-keys-goal', obj: '103.8', nivel: 3, peso: 2,
  make: tenta((rng) => {
    const ls = fazTexto(rng); const { toks, exit, final } = geraSeq(rng, ls, { min: 1, max: 3, permiteU: false });
    const ok = [...toks, exit];
    const vs = variacoes(ls, toks, exit).filter((v) => v.final.join('|') !== final.join('|'));
    const vistos = new Set([keysTxt(ok)]); const errados = [];
    for (const v of rng.shuffle(vs)) { const k = keysTxt([...v.toks, v.exit]); if (!vistos.has(k)) { vistos.add(k); errados.push([...v.toks, v.exit]); } if (errados.length === 3) break; }
    if (errados.length < 3) throw new Error('poucas variações');
    const todos = [ok, ...errados];
    const options = mcq(rng, keysTxt(ok), errados.map(keysTxt));
    const ordered = [options.find((o) => o.ok).t, ...options.filter((o) => !o.ok).map((o) => o.t)];
    const seqDe = (k) => todos.find((s) => keysTxt(s) === k);
    return {
      type: 'unica',
      text: `O arquivo \`notas.txt\` é aberto no vi com o cursor no primeiro caractere da linha 1:\n\n${textoArq(ls)}\n\nQuais teclas, digitadas em sequência no modo normal, deixam o arquivo gravado assim?\n\n${textoArq(final)}`,
      options: options.map((o) => ({ ...o, t: '`' + o.t + '`' })),
      explanation: `A sequência correta é \`${keysTxt(ok)}\`. Confira cada comando: ${toks.map((t) => `\`${keysOf(t)}\``).join(', ')} e então \`${keysOf(exit)}\`. As outras alternativas trocam um detalhe (p/P, dd/yy, contagem, ordem, ZZ/ZQ) e dão outro resultado. ${EXPL_BASE}`,
      ref: REF,
      verify: (() => {
        const cmds = ordered.map((k) => vimSh(ls, seqDe(k)));
        return chooseVerify("", cmds, final.join("|"));
      })(),
    };
  }),
};

// ---------------------------------------------------------------- conceitos de uma tecla/comando
const BASE = ['um dois tres', 'quatro cinco seis', 'sete oito nove'];
const IR_CINCO = [{ k: 'j' }, { k: 'w' }]; // cursor em "cinco"
const ITEMS = [
  { g: 'apagar a linha atual', a: [{ k: 'dd' }], alt: [], pre: IR_CINCO, ans: ['dd'] },
  { g: 'copiar a linha atual e colá-la logo abaixo (duplicar)', a: [{ k: 'yy' }, { k: 'p' }], pre: IR_CINCO, ans: ['yyp', 'Yp'], alt: ['Yp'] },
  { g: 'trocar a linha atual de lugar com a linha seguinte', a: [{ k: 'dd' }, { k: 'p' }], pre: IR_CINCO, ans: ['ddp'], alt: [] },
  { pos: 'com o cursor na linha 2, depois de a linha 3 ter sido copiada com `yy`', g: 'colar a linha copiada **acima** da linha atual (a linha 3 foi copiada antes com `yy`)', a: [{ k: 'P' }], pre: [{ k: 'NG', n: 3 }, { k: 'yy' }, { k: 'k' }], ans: ['P'], alt: [] },
  { g: 'apagar do cursor até o final da linha', a: [{ k: 'D' }], pre: IR_CINCO, ans: ['D', 'd$'], alt: ['d$'] },
  { g: 'apagar a palavra a partir do cursor (até o início da próxima)', a: [{ k: 'dw' }], pre: IR_CINCO, ans: ['dw'], alt: [] },
  { g: 'apagar o caractere sob o cursor', a: [{ k: 'x' }], pre: IR_CINCO, ans: ['x'], alt: [] },
  { g: 'juntar a linha atual com a seguinte', a: [{ k: 'J' }], pre: IR_CINCO, ans: ['J'], alt: [] },
  { pos: 'com o cursor no primeiro caractere da linha 1', g: 'ir para a última linha do arquivo (e trocar o primeiro caractere dela por X)', a: [{ k: 'G' }, { k: 'r', ch: 'X' }], pre: [], ans: ['G'], alt: [], probe: true },
  { pos: 'com o cursor no início da última linha', g: 'voltar para a primeira linha do arquivo (e trocar o primeiro caractere dela por X)', a: [{ k: 'gg' }, { k: 'r', ch: 'X' }], pre: [{ k: 'G' }], ans: ['gg', '1G'], alt: ['1G'], probe: true },
  { g: 'ir para o fim da linha atual (e trocar o último caractere dela por X)', a: [{ k: '$' }, { k: 'r', ch: 'X' }], pre: IR_CINCO, ans: ['$'], alt: [], probe: true },
  { g: 'ir para o início da linha atual (e trocar o primeiro caractere dela por X)', a: [{ k: '0' }, { k: 'r', ch: 'X' }], pre: IR_CINCO, ans: ['0', '^'], alt: ['^'], probe: true },
  { g: 'abrir uma nova linha **abaixo** da atual e digitar `NOVA`', a: [{ k: 'o', t: 'NOVA' }], pre: IR_CINCO, key: 'o', ans: [], alt: [] },
  { g: 'abrir uma nova linha **acima** da atual e digitar `NOVA`', a: [{ k: 'O', t: 'NOVA' }], pre: IR_CINCO, key: 'O', ans: [], alt: [] },
  { g: 'inserir `NOVA` no **fim** da linha atual', a: [{ k: 'A', t: 'NOVA' }], pre: IR_CINCO, key: 'A', ans: [], alt: [] },
  { g: 'inserir `NOVA` no **início** da linha atual', a: [{ k: 'I', t: 'NOVA' }], pre: IR_CINCO, key: 'I', ans: [], alt: [] },
  { g: 'inserir `NOVA` **antes** do caractere sob o cursor', a: [{ k: 'i', t: 'NOVA' }], pre: IR_CINCO, key: 'i', ans: [], alt: [] },
  { g: 'inserir `NOVA` **depois** do caractere sob o cursor', a: [{ k: 'a', t: 'NOVA' }], pre: IR_CINCO, key: 'a', ans: [], alt: [] },
  { g: 'substituir a palavra sob o cursor por `NOVA`', a: [{ k: 'cw', t: 'NOVA' }], pre: IR_CINCO, key: 'cw', ans: [], alt: [] },
  { pos: 'logo depois de a linha 2 ter sido apagada com `dd`', g: 'desfazer a última alteração (a linha atual acabou de ser apagada)', a: [{ k: 'u' }], pre: [...IR_CINCO, { k: 'dd' }], ans: ['u'], alt: [] },
  { pos: 'com o cursor no primeiro caractere da linha 1', g: 'procurar para a frente a palavra `oito` e trocar o primeiro caractere do trecho encontrado por X', a: [{ k: 'search', dir: 1, pat: 'oito' }, { k: 'r', ch: 'X' }], pre: [], key: '/oito<Enter>', ans: [], alt: [] },
  { pos: 'com o cursor no início da última linha', g: 'procurar para trás a palavra `dois` e trocar o primeiro caractere do trecho encontrado por X (cursor no fim do arquivo)', a: [{ k: 'search', dir: -1, pat: 'dois' }, { k: 'r', ch: 'X' }], pre: [{ k: 'G' }], key: '?dois<Enter>', ans: [], alt: [] },
];
const EXITS = [
  { g: 'gravar as alterações e sair do vi', how: ['ZZ', 'wq', 'x'], saves: true, ans: ['ZZ', ':wq', ':x'] },
  { g: 'sair do vi **descartando** as alterações', how: ['q!', 'ZQ'], saves: false, ans: [':q!', 'ZQ'] },
  { g: 'gravar as alterações **sem** sair do vi', how: ['w'], saves: true, ans: [':w'] },
];
const viConcept = {
  id: 'vi-concept', obj: '103.8', nivel: 2, peso: 3,
  make(rng) {
    if (rng.chance(0.25)) {
      const ex = rng.pick(EXITS); const ini = BASE.slice();
      const mod = [{ k: 'x' }]; const modified = viRun(ini, mod).lines;
      const fin = ex.saves ? modified : ini;
      const run = (a) => { const toks = [...mod, { k: 'exit', how: a.replace(/^:/, '') }]; if (a === ':w') toks.push({ k: 'exit', how: 'q!' }); return vimSh(ini, toks); };
      const todos = ex.ans;
      const wrongPool = EXITS.filter((e) => e !== ex).flatMap((e) => e.ans).filter((a) => !ex.ans.includes(a)).concat([':q', 'ZX', ':e!', ':wq!!']);
      const verifyAll = { sh: todos.map((a) => run(a)).join('\necho\n'), expect: todos.map(() => lineOut(fin)).join('\n\n') };
      if (rng.chance(0.5)) {
        return {
          type: 'lacuna', text: `No vi, qual comando (ou sequência de teclas) permite ${ex.g}? Responda com uma das formas, como você digitaria no modo normal (ex.: \`:q!\` ou \`ZZ\`).`,
          answers: [...todos, ...todos.map((a) => a.replace(/^:/, '')).filter((a) => a.length > 1 && a !== 'ZZ' && a !== 'ZQ')],
          explanation: `Formas equivalentes: ${todos.map((a) => '`' + a + '`').join(', ')}. ${EXPL_BASE}`, ref: REF, verify: verifyAll,
        };
      }
      return {
        type: 'unica', text: `No vi, qual comando permite ${ex.g}?`, options: mcq(rng, todos[0], wrongPool, 4),
        explanation: `Corretas: ${todos.map((a) => '`' + a + '`').join(', ')}. ${EXPL_BASE}`, ref: REF, verify: verifyAll,
      };
    }
    const it = rng.pick(ITEMS);
    const probe = it.probe ? it.a.slice(1) : []; const exit = { k: 'exit', how: 'ZZ' };
    const fin = viRun(BASE, [...it.pre, ...it.a, exit]).saved;
    const runs = [[...it.pre, ...it.a, exit], ...(it.alt ?? []).map((a) => [...it.pre, { k: 'raw', keys: a }, ...probe, exit])];
    const verify = { sh: runs.map((r) => vimSh(BASE, r)).join('\necho\n'), expect: runs.map(() => lineOut(fin)).join('\n\n') };
    const txt = `Considere o arquivo abaixo, aberto no vi (${it.pos ?? 'com o cursor sobre a palavra `cinco`, na linha 2'}):\n\n${textoArq(BASE)}\n\n`;
    if (it.ans.length) {
      if (rng.chance(0.55)) {
        return {
          type: 'lacuna', text: `${txt}Que tecla(s) do modo normal fazem isto: ${it.g}? Responda só com as teclas (sem <Enter>).`,
          answers: it.ans, explanation: `Resposta: ${it.ans.map((a) => '`' + a + '`').join(' ou ')}. ${EXPL_BASE}`, ref: REF, verify,
        };
      }
      const pool = ITEMS.filter((o) => o !== it && o.ans.length && !it.ans.includes(o.ans[0])).map((o) => o.ans[0]).concat(['dG', 'yw', 'Y$', 'ZX']);
      return {
        type: 'unica', text: `${txt}Qual tecla (ou sequência) do modo normal faz isto: ${it.g}?`,
        options: mcq(rng, it.ans[0], pool.filter((p) => !it.ans.includes(p))), explanation: `Resposta: ${it.ans.map((a) => '`' + a + '`').join(' ou ')}. ${EXPL_BASE}`, ref: REF, verify,
      };
    }
    const busca = it.key.startsWith('/') || it.key.startsWith('?');
    const outros = ITEMS.filter((o) => o !== it && o.key && (o.key.startsWith('/') || o.key.startsWith('?')) === busca).map((o) => o.key);
    const pool = busca
      ? [...outros, it.key.startsWith('/') ? it.key.replace('/', '?') : it.key.replace('?', '/'), ':' + it.key.slice(1), 'n', 'N', '*']
      : [...outros, it.key === 'cw' ? 'dw' : 'cc', 'r', 'R', 's'];
    return {
      type: 'unica', text: `${txt}Qual comando inicia a ação: ${it.g}?${busca ? '' : ' (O texto digitado deve ser seguido de `<Esc>`.)'}`,
      options: mcq(rng, it.key, pool.filter((p) => p !== it.key)), explanation: `${EXPL_BASE} Aqui: \`${keysOf(it.a[0])}\`.`, ref: REF, verify,
    };
  },
};

// ---------------------------------------------------------------- noções gerais: vi, vim, nano, emacs, EDITOR
const MISC = [
  { q: 'Como abrir o arquivo `/etc/fstab` no vi já com o cursor na linha 9?', ok: '`vi +9 /etc/fstab`', bad: ['`vi 9 /etc/fstab`', '`vi -9 /etc/fstab`', '`vi /etc/fstab:9`', '`vi -l 9 /etc/fstab`'], e: 'Um `+N` antes do nome do arquivo posiciona o cursor na linha N; um `+` sozinho leva à última linha.' },
  { q: 'Como abrir um arquivo no vi com o cursor já na **última** linha?', ok: '`vi + arquivo`', bad: ['`vi -G arquivo`', '`vi ++ arquivo`', '`vi -e arquivo`', '`vi $ arquivo`'], e: '`vi +N arquivo` abre na linha N; o `+` sem número significa "última linha".' },
  { q: 'Qual variável de ambiente indica o editor de texto padrão usado por programas como `crontab -e`?', ok: '`EDITOR` (ou `VISUAL`)', bad: ['`TEXTEDITOR`', '`DEFAULT_EDIT`', '`EDIT`', '`SHELLEDITOR`'], e: 'O shell e vários programas consultam `VISUAL` ou `EDITOR` para decidir qual editor abrir.' },
  { q: 'Qual comando define o `nano` como editor padrão **herdado pelos programas** iniciados na sessão atual do bash?', ok: '`export EDITOR=nano`', bad: ['`EDITOR=nano` (sem `export`)', '`set editor nano`', '`alias EDITOR=nano`', '`export nano=EDITOR`'], e: 'Sem `export`, a variável é apenas do shell e não chega aos processos filhos como `crontab`. Para persistir entre sessões, o comando vai em `~/.bash_profile`.' },
  { q: 'Em qual arquivo se deve colocar `export EDITOR=nano` para que a escolha valha em todos os logins futuros do usuário?', ok: '`~/.bash_profile`', bad: ['`~/.bash_logout`', '`/etc/passwd`', '`~/.vimrc`', '`/etc/hostname`'], e: 'Arquivos de inicialização de shell de login (`~/.bash_profile`, `~/.profile`) são o lugar certo para variáveis de ambiente do usuário.' },
  { q: 'No nano, qual combinação **corta** a linha ou a seleção atual?', ok: 'Ctrl-K', bad: ['Ctrl-U', 'Ctrl-C', 'Ctrl-V', 'Ctrl-D'], e: 'No nano: Ctrl-K corta, Ctrl-U cola, Ctrl-6 (ou Meta-A) inicia a seleção, Meta-6 copia, Meta-U desfaz, Meta-E refaz.' },
  { q: 'No nano, qual combinação **cola** o conteúdo cortado ou copiado?', ok: 'Ctrl-U', bad: ['Ctrl-K', 'Ctrl-P', 'Ctrl-V', 'Ctrl-Y'], e: 'Ctrl-U cola (un-cut) no nano; Ctrl-K corta.' },
  { q: 'No nano, qual combinação inicia a verificação ortográfica do documento ou da seleção?', ok: 'Ctrl-T', bad: ['Ctrl-S', 'Ctrl-O', 'Ctrl-L', 'Ctrl-R'], e: 'Ctrl-T chama o corretor ortográfico (spell) do nano.' },
  { q: 'Qual comando abre um tutorial interativo e editável do vim?', ok: '`vimtutor`', bad: ['`vi --tutorial`', '`vimhelp`', '`man vi-tutor`', '`vim -t`'], e: '`vimtutor` abre uma cópia editável de um guia passo a passo; dentro do vim, `:help vim-modes-intro` explica os modos.' },
  { q: 'Em qual arquivo o vim lê as configurações do usuário (por exemplo, para tornar macros persistentes)?', ok: '`~/.vimrc`', bad: ['`~/.vim.conf`', '`/etc/vi.cfg`', '`~/.vi_profile`', '`~/.exrc.vim`'], e: 'As configurações pessoais do vim ficam em `~/.vimrc`; ali, por exemplo, `let @d = \'...\'` grava uma sequência de teclas num registro.' },
  { q: 'Em qual modo o vi **inicia** por padrão?', ok: 'Modo normal (de comandos)', bad: ['Modo de inserção', 'Modo visual', 'Modo de substituição', 'Modo de linha de comando'], e: 'O vi abre em modo normal; é preciso um comando de inserção (`i`, `a`, `o`...) para digitar texto, e `Esc` volta ao modo normal.' },
  { q: 'Qual tecla encerra o modo de inserção do vi e volta ao modo normal?', ok: 'Esc', bad: ['Ctrl-X', 'Enter', 'Ctrl-Z', 'Insert'], e: 'A tecla Esc conclui o modo de inserção.' },
  { q: 'No vi, o que faz o comando `:!ls`?', ok: 'Executa o comando de shell `ls` e mostra a saída', bad: ['Apaga todas as linhas que contêm "ls"', 'Lista os buffers abertos', 'Salva o arquivo com o nome "ls"', 'Procura a palavra "ls" no texto'], e: 'No modo de linha de comando, `:!` executa um comando do shell.' },
  { q: 'Qual comando de dois pontos do vi grava o arquivo e sai **apenas se houve alterações**?', ok: '`:x`', bad: ['`:q!`', '`:w!`', '`:e`', '`:visual`'], e: '`:x` (ou `:exit`) é como `:wq`, mas só grava quando necessário.' },
  { q: 'O que significa digitar `"ayy` no modo normal do vi?', ok: 'Copia a linha atual para o registro `a`', bad: ['Apaga a linha atual e a guarda em `a`', 'Cola o registro `a` abaixo da linha atual', 'Marca a linha atual com a marca `a`', 'Grava a macro `a`'], e: 'Um registro é indicado por aspas + letra (`"a`); `yy` copia a linha. Depois `"ap` cola o conteúdo do registro `a`.' },
  { q: 'Como gravar uma macro no registro `d` do vi e depois executá-la?', ok: '`qd` ... `q` para gravar e `@d` para executar', bad: ['`md` ... `m` para gravar e `\'d` para executar', '`"d` ... `"d` para gravar e `@d` para executar', '`:macro d` e `:run d`', '`vd` ... `v` para gravar e `.d` para executar'], e: '`q` + letra inicia a gravação e `q` encerra; `@` + letra executa. Marcas usam `m` + letra e o retorno é `\'` + letra.' },
  { q: 'Qual editor de texto de terminal também funciona como IDE e pode ser configurado como cliente de e-mail e de RSS?', ok: 'Emacs', bad: ['nano', 'vi', 'pico', 'ed'], e: 'O Emacs vai muito além de um editor: compila, executa, testa programas e lê e-mail/notícias.' },
  { q: 'No vi/vim, como procurar **para trás** pela palavra `erro` e repetir a busca na mesma direção?', ok: '`?erro<Enter>` e depois `n`', bad: ['`/erro<Enter>` e depois `n`', '`?erro<Enter>` e depois `N`', '`:s/erro/` e depois `n`', '`f erro` e depois `;`'], e: '`/` busca para a frente e `?` para trás; `n` repete a busca no mesmo sentido e `N` no sentido oposto.' },
];
const viMisc = {
  id: 'vi-misc', obj: '103.8', nivel: 1, peso: 1,
  make(rng) {
    const it = rng.pick(MISC);
    return { type: 'unica', text: it.q, options: mcq(rng, it.ok, it.bad), explanation: it.e, ref: REF };
  },
};

export const generators = [viFinal, viGoal, viConcept, viMisc];
