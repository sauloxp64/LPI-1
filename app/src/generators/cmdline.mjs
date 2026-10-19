// 103.1 — trabalhar na linha de comando: aspas e expansões, escopo de variáveis, histórico,
// PATH/type/which, precedência de comandos, env x set, listas de comandos (; && ||).
// Os gabaritos vêm de modelos em JS conferidos contra o bash real (campo `verify`).
import { mcq, multi, block } from './util.mjs';

const sq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

function retry(fn, tries = 80) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try { const r = fn(i); if (r) return r; } catch (e) { last = e; }
  }
  throw last ?? new Error('retry esgotado');
}

// ---------------------------------------------------------------------------------------------
// Aspas e expansão em `echo`
// ---------------------------------------------------------------------------------------------
const D = '$';
const QITEMS = {
  bare: { src: (N) => D + N, val: (v, N) => v },
  dq: { src: (N) => `"${D}${N}"`, val: (v, N, s) => (s.dqNo ? D + N : v) },
  sq: { src: (N) => `'${D}${N}'`, val: (v, N, s) => (s.sqExp ? v : D + N) },
  esc: { src: (N) => `\\${D}${N}`, val: (v, N, s) => (s.bsKeep ? '\\' + v : D + N) },
  dqesc: { src: (N) => `"\\${D}${N}"`, val: (v, N, s) => (s.dqNo ? `\\${D}${N}` : s.bsKeep ? '\\' + v : D + N) },
  brace: { src: (N) => `${D}{${N}}s`, val: (v) => v + 's' },
  glued: { src: (N) => `${D}${N}s`, val: (v, N, s) => (s.glued ? v + 's' : null) },
  dqbrace: { src: (N) => `"${D}{${N}}s"`, val: (v, N, s) => (s.dqNo ? `${D}{${N}}s` : v + 's') },
  sqInDq: { src: (N) => `"'${D}${N}'"`, val: (v, N, s) => (s.dqNo ? `'${D}${N}'` : `'${v}'`) },
  dqInSq: { src: (N) => `'"${D}${N}"'`, val: (v, N, s) => (s.sqExp ? `"${v}"` : `"${D}${N}"`) },
  concat: { src: (N) => `"${D}${N}"'${D}${N}'`, val: (v, N, s) => (s.sqExp ? v + v : s.dqNo ? `${D}${N}${D}${N}` : v + D + N) },
  dqBsBs: { src: (N) => `"\\\\${D}${N}"`, val: (v, N, s) => (s.dqNo ? `\\\\${D}${N}` : s.bsKeep ? `\\\\${v}` : '\\' + v) },
  cmd: { src: (N) => `${D}(echo ${D}${N})`, val: (v) => v },
  sqCmd: { src: (N) => `'${D}(echo ${D}${N})'`, val: (v, N, s) => (s.sqExp ? v : `${D}(echo ${D}${N})`) },
  dqCmd: { src: (N) => `"${D}(echo ${D}${N})"`, val: (v, N, s) => (s.dqNo ? `${D}(echo ${D}${N})` : v) },
  dqQuote: { src: (N) => `"\\"${D}${N}\\""`, val: (v, N, s) => (s.dqNo ? `\\"${D}${N}\\"` : s.bsKeep ? `\\"${v}\\"` : `"${v}"`) },
  escQuote: { src: (N) => `\\"${D}${N}\\"`, val: (v, N, s) => (s.bsKeep ? `\\"${v}\\"` : `"${v}"`) },
  twice: { src: (N) => `"${D}${N}${D}${N}"`, val: (v, N, s) => (s.dqNo ? `${D}${N}${D}${N}` : v + v) },
};
const QIDS = Object.keys(QITEMS);
const QWEIGHT = { bare: 1, dq: 3, sq: 3, esc: 2, dqesc: 2, brace: 1, glued: 3, dqbrace: 1, sqInDq: 2, dqInSq: 2, concat: 2, dqBsBs: 1, cmd: 1, sqCmd: 2, dqCmd: 1, dqQuote: 2, escQuote: 1, twice: 1 };
const SEMS = {
  ok: {}, sqExp: { sqExp: true }, dqNo: { dqNo: true }, bsKeep: { bsKeep: true }, glued: { glued: true },
  sqDq: { sqExp: true, dqNo: true }, dqBs: { dqNo: true, bsKeep: true }, sqGl: { sqExp: true, glued: true },
};
const qOut = (ids, v, N, sem) => ids.map((id) => QITEMS[id].val(v, N, sem)).filter((x) => x !== null).join(' ');
const qSrc = (ids, N) => ids.map((id) => QITEMS[id].src(N)).join(' ');

const VARNAMES = ['CURSO', 'DISTRO', 'SHELL_NOME', 'PROJETO', 'LINGUA', 'EDITOR_PADRAO'];
const VALUES = ['LPIC', 'Debian', 'bash', 'nginx', 'vim', 'kernel', 'Ubuntu', 'redhat', 'tux'];

// ---------------------------------------------------------------------------------------------
// Histórico: modelo das expansões `!`
// ---------------------------------------------------------------------------------------------
const HCMDS = [
  'ls -l /etc/hosts', 'cd /var/log', 'cat /etc/passwd', 'grep root /etc/passwd', 'head -n 5 notas.txt', 'mkdir -p projetos/web',
  'chmod 640 chave.pem', 'tail -n 20 /var/log/syslog', 'find /home -name notas.txt', 'systemctl status ssh', 'ls -la /home/ana',
  'sort dados.csv', 'wc -l dados.csv', 'rm -i velho.txt', 'mv rascunho.txt final.txt', 'touch lista.txt', 'ping -c 3 localhost',
  'echo ola mundo', 'df -h /home', 'du -sh /var/log', 'ls /usr/bin', 'cd /tmp', 'uname -r', 'id aluno', 'less /etc/fstab',
];
const first = (s) => s.split(' ')[0];
const lastw = (s) => s.split(' ').slice(-1)[0];
const args = (s) => s.split(' ').slice(1).join(' ');

function histScenario(rng) {
  const kind = rng.weighted(['bang2', 'sudo', 'num', 'neg', 'str', 'lastarg', 'firstarg', 'allargs', 'word', 'quick', 'contains'], (k) => ({ bang2: 2, sudo: 2, num: 3, neg: 3, str: 3, lastarg: 3, firstarg: 1, allargs: 2, word: 2, quick: 3, contains: 2 }[k]));
  const len = rng.int(6, 9);
  let H = rng.sample(HCMDS, len);
  const used = new Set(H);
  const base = rng.pick([1, 1, 25, 118, 240, 501, 912, 1204]);
  const N = (i) => base + i; // número do i-ésimo (0-based)
  const L = () => H.length;
  const sc = { kind, H, base };
  const dedupe = (pool) => [...new Set(pool.filter((x) => x !== sc.result))];
  if (kind === 'bang2') {
    sc.line = '!!'; sc.result = H[L() - 1];
    sc.alts = [H[L() - 2], H[L() - 3], `sudo ${H[L() - 1]}`, 'history'];
  } else if (kind === 'sudo') {
    sc.line = 'sudo !!'; sc.result = `sudo ${H[L() - 1]}`;
    sc.alts = [`sudo ${H[L() - 2]}`, H[L() - 1], `sudo ${first(H[L() - 1])}`, `sudo ${H[L() - 3]}`, 'sudo history'];
  } else if (kind === 'num') {
    const i = rng.int(0, L() - 2);
    sc.line = `!${N(i)}`; sc.result = H[i];
    sc.alts = [H[i + 1], H[i - 1] ?? H[L() - 1], H[L() - 1], H[L() - 1 - i] ?? H[0], H[L() - i - 2] ?? H[1]];
  } else if (kind === 'neg') {
    const k = rng.int(2, Math.min(5, L() - 1));
    sc.line = `!-${k}`; sc.result = H[L() - k];
    sc.alts = [H[L() - k - 1], H[L() - k + 1], H[k - 1], H[L() - 1], H[k]];
  } else if (kind === 'str') {
    const p = rng.pick(['ls', 'cd', 'cat', 'sort', 'echo', 'rm']);
    const mk = (n) => ({ ls: `ls -l ${n}`, cd: `cd ${n}`, cat: `cat ${n}`, sort: `sort ${n}`, echo: `echo ${n}`, rm: `rm ${n}` }[p]);
    H = H.filter((h) => first(h) !== p);
    const a = rng.pick(['/etc', '/usr', 'dados.txt']); const b = rng.pick(['/home', '/opt', 'notas.txt']);
    const iA = rng.int(0, Math.max(0, H.length - 3)); H.splice(iA, 0, mk(a));
    const iB = rng.int(iA + 1, H.length - 1); H.splice(iB, 0, mk(b));
    sc.H = H;
    sc.line = `!${p}`; sc.result = mk(b);
    sc.alts = [mk(a), H[H.length - 1], H[iB + 1] ?? H[0], `${p}`];
  } else if (kind === 'lastarg' || kind === 'firstarg' || kind === 'allargs') {
    const cmdp = rng.pick(['cat', 'less', 'wc -l', 'file', 'stat', 'ls -l']);
    const withArgs = H.filter((h) => h.split(' ').length >= 3 && !/^\w+ -/.test(h));
    const prev = rng.pick(withArgs.length ? withArgs : ['cp relatorio.txt /tmp/backup']);
    H.splice(H.indexOf(prev), 1); H.push(prev); sc.H = H;
    const w = prev.split(' ');
    const sym = kind === 'lastarg' ? '!$' : kind === 'firstarg' ? '!^' : '!*';
    sc.line = `${cmdp} ${sym}`;
    const lastA = w[w.length - 1]; const firstA = w[1]; const all = w.slice(1).join(' ');
    sc.result = `${cmdp} ${kind === 'lastarg' ? lastA : kind === 'firstarg' ? firstA : all}`;
    sc.alts = [`${cmdp} ${lastA}`, `${cmdp} ${firstA}`, `${cmdp} ${all}`, `${cmdp} ${w[0]}`, `${cmdp} ${prev}`, `${cmdp} ${lastw(H[H.length - 2])}`];
  } else if (kind === 'word') {
    const i = rng.int(0, L() - 2);
    const w = H[i].split(' ');
    if (w.length < 3) return null;
    const useLast = rng.chance(0.4);
    const pos = useLast ? w.length - 1 : rng.int(1, w.length - 2);
    sc.line = `echo !${N(i)}:${useLast ? '$' : pos}`;
    sc.result = `echo ${w[pos]}`;
    sc.alts = [`echo ${w[0]}`, `echo ${w[w.length - 1]}`, `echo ${w[pos - 1] ?? w[0]}`, `echo ${w[pos + 1] ?? w[w.length - 1]}`, `echo ${args(H[i])}`, `echo ${H[H.length - 1].split(' ')[Math.min(pos, H[H.length - 1].split(' ').length - 1)]}`];
  } else if (kind === 'quick') {
    const nm = rng.pick(['relatorio', 'notas', 'dados', 'lista']);
    const nm2 = rng.pick(['backup', 'final', 'copia']);
    const pat = rng.pick([`cp ${nm}.txt ${nm}.txt.bak`, `mv ${nm}.txt ${nm}.txt.old`, `ls -l ${nm}.txt ${nm}.txt~`]);
    H.push(pat); sc.H = H;
    sc.line = `^${nm}^${nm2}`;
    sc.result = pat.replace(nm, nm2);
    sc.alts = [pat.split(nm).join(nm2), pat, pat.replace(`${nm}.txt`, nm2), H[H.length - 2].replace(nm, nm2)];
  } else {
    const key = rng.pick(['passwd', 'hosts', 'notas', 'syslog', 'dados']);
    const idx = H.findIndex((h) => h.includes(key) && !h.startsWith(key));
    if (idx < 0) return null;
    // a mais recente que contém `key` (não necessariamente no início)
    const lastIdx = H.map((h, i) => (h.includes(key) ? i : -1)).filter((i) => i >= 0).pop();
    if (lastIdx === H.length - 1) return null;
    sc.line = `!?${key}`; sc.result = H[lastIdx];
    const olds = H.map((h, i) => (h.includes(key) ? i : -1)).filter((i) => i >= 0 && i !== lastIdx);
    sc.alts = [...olds.map((i) => H[i]), H[H.length - 1], H[lastIdx + 1], H[lastIdx - 1] ?? H[0], `${key}`];
  }
  sc.alts = dedupe(sc.alts.filter(Boolean));
  if (sc.alts.length < 3) return null;
  return sc;
}

const HEXPL = {
  bang2: '`!!` repete o **último** comando do histórico.',
  sudo: '`!!` é substituído pelo último comando antes de a linha ser executada; é o truque clássico `sudo !!` para repetir com privilégios.',
  num: '`!N` repete o comando de número **N** exatamente como mostrado por `history` (a numeração é absoluta).',
  neg: '`!-N` conta **para trás** a partir do fim: `!-1` é o último, `!-2` o penúltimo, e assim por diante.',
  str: '`!texto` busca o comando **mais recente que *começa* com** `texto`.',
  lastarg: '`!$` é o **último argumento** do comando anterior.',
  firstarg: '`!^` é o **primeiro argumento** (palavra 1) do comando anterior, sem contar o nome do comando.',
  allargs: '`!*` são **todos os argumentos** do comando anterior (tudo menos a palavra 0).',
  word: '`!N:W` seleciona a palavra W do comando N (palavra 0 = nome do comando, `$` = última).',
  quick: '`^velho^novo` refaz o último comando trocando apenas a **primeira** ocorrência de `velho` por `novo`.',
  contains: '`!?texto` busca o comando mais recente que **contém** `texto` em qualquer posição (diferente de `!texto`, que exige o começo).',
};

// ---------------------------------------------------------------------------------------------
// Escopo de variáveis
// ---------------------------------------------------------------------------------------------
function runScope(stmts, sem = {}) {
  const vars = new Map(); // nome -> {val, exp}
  const out = [];
  const val = (n) => (vars.has(n) ? vars.get(n).val : '');
  for (const s of stmts) {
    switch (s.k) {
      case 'assign': { const o = vars.get(s.n); vars.set(s.n, { val: s.v, exp: o ? o.exp : false }); break; }
      case 'export': { const o = vars.get(s.n); vars.set(s.n, { val: o ? o.val : '', exp: true }); break; }
      case 'exportAssign': vars.set(s.n, { val: s.v, exp: true }); break;
      case 'unset': vars.delete(s.n); break;
      case 'echo': out.push(`${s.n}=${val(s.n)}`); break;
      case 'child': out.push(`${s.n}=${sem.childAll || (vars.get(s.n) && vars.get(s.n).exp) ? val(s.n) : ''}`); break;
      case 'childSet': out.push(`${s.n}=${s.v}`); break;
      case 'sub': { out.push(`${s.n}=${s.v}`); if (sem.subLeaks) { const o = vars.get(s.n); vars.set(s.n, { val: s.v, exp: o ? o.exp : false }); } break; }
      case 'prefixChild': out.push(`${s.n}=${s.v}`); if (sem.prefixPersists) { const o = vars.get(s.n); vars.set(s.n, { val: s.v, exp: o ? o.exp : false }); } break;
      case 'prefixEcho': out.push(`${s.n}=${sem.prefixTemp ? s.v : val(s.n)}`); if (sem.prefixPersists) { const o = vars.get(s.n); vars.set(s.n, { val: s.v, exp: o ? o.exp : false }); } break;
      default: throw new Error('stmt?');
    }
  }
  return out;
}
const stmtText = (s) => ({
  assign: `${s.n}=${s.v}`, export: `export ${s.n}`, exportAssign: `export ${s.n}=${s.v}`, unset: `unset ${s.n}`,
  echo: `echo "${s.n}=$${s.n}"`, child: `bash -c 'echo "${s.n}=$${s.n}"'`, childSet: `bash -c '${s.n}=${s.v}; echo "${s.n}=$${s.n}"'`,
  sub: `(${s.n}=${s.v}; echo "${s.n}=$${s.n}")`, prefixChild: `${s.n}=${s.v} bash -c 'echo "${s.n}=$${s.n}"'`,
  prefixEcho: `${s.n}=${s.v} echo "${s.n}=$${s.n}"`,
}[s.k]);
const isPrint = (s) => ['echo', 'child', 'childSet', 'sub', 'prefixChild', 'prefixEcho'].includes(s.k);

// ---------------------------------------------------------------------------------------------
// Listas de comandos (; && ||)
// ---------------------------------------------------------------------------------------------
const TERMS = [
  { t: 'true', st: 0 }, { t: 'false', st: 1 }, { t: '[ -d /tmp ]', st: 0 }, { t: '[ -f /naoexiste ]', st: 1 },
  { t: 'grep -q root /etc/passwd', st: 0 }, { t: 'grep -q zzz /etc/hostname', st: 1 },
  { t: 'ls /naoexiste 2>/dev/null', st: 2 }, { t: 'naoexiste 2>/dev/null', st: 127 },
];
function runChain(segs, sem = {}, log = null) {
  const out = []; let status = 0;
  segs.forEach((seg, si) => {
    if (sem.semiAnd && si > 0 && status !== 0) return;
    const run = (term) => {
      if (term.echo !== undefined) { out.push(term.echo); status = 0; if (log) log.push(`\`${term.t}\` roda e imprime ${term.echo} (status 0)`); } else if (term.status) { out.push(String(status)); if (log) log.push(`\`echo $?\` roda e imprime ${status} (o status do comando anterior)`); status = 0; } else { status = term.st; if (log) log.push(`\`${term.t}\` roda → status ${status}`); }
    };
    if (sem.allRun) { for (const x of seg.items) run(x.term); return; }
    if (sem.andTight) {
      // erro comum: achar que && tem precedência sobre ||
      const blocks = [[]];
      seg.items.forEach((x, idx) => { if (idx > 0 && x.op === '||') blocks.push([]); blocks[blocks.length - 1].push(x); });
      blocks.forEach((bl, bi) => {
        if (bi > 0 && status === 0) return;
        bl.forEach((x, j) => { if (j === 0 || status === 0) run(x.term); });
      });
      return;
    }
    seg.items.forEach((x, idx) => {
      if (idx === 0) { run(x.term); return; }
      if ((x.op === '&&' && status === 0) || (x.op === '||' && status !== 0)) { if (log) log.push(`${x.op} com status ${status}: executa`); run(x.term); } else if (log) log.push(`${x.op} com status ${status}: PULA \`${x.term.t}\``);
    });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
export const generators = [
  // -------------------------------------------------------------------------------------------
  {
    id: 'cl-echo-quotes', obj: '103.1', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const N = rng.pick(VARNAMES); const v = rng.pick(VALUES);
        const n = rng.int(2, 3);
        const ids = [];
        while (ids.length < n) { const id = rng.weighted(QIDS, (k) => QWEIGHT[k]); if (!ids.includes(id)) ids.push(id); }
        if (ids.every((i) => i === 'bare' || i === 'dq')) return null;
        const correct = qOut(ids, v, N, SEMS.ok);
        const setup = `${N}=${v}`;
        const line = `echo ${qSrc(ids, N)}`;
        const fmt = rng.chance(0.65) ? 'direta' : 'inversa';
        if (fmt === 'direta') {
          const pool = Object.entries(SEMS).filter(([k]) => k !== 'ok').map(([, s]) => qOut(ids, v, N, s)).filter((x) => x !== correct);
          const options = mcq(rng, correct || '(linha em branco)', pool.map((p) => p || '(linha em branco)'), 4);
          const rule = ids.map((id) => ({
            bare: `\`${QITEMS.bare.src(N)}\`: sem aspas, a variável é expandida (e passa por divisão em palavras)`,
            dq: `\`${QITEMS.dq.src(N)}\`: aspas duplas preservam o \`$\` — a variável é expandida`,
            sq: `\`${QITEMS.sq.src(N)}\`: aspas simples tornam **tudo** literal`,
            esc: `\`${QITEMS.esc.src(N)}\`: a barra invertida protege o \`$\` (vira texto) e é removida`,
            dqesc: `\`${QITEMS.dqesc.src(N)}\`: dentro de aspas duplas \`\\$\` também gera um \`$\` literal`,
            brace: `\`${QITEMS.brace.src(N)}\`: as chaves delimitam o nome da variável; depois dela vem o texto \`s\``,
            glued: `\`${QITEMS.glued.src(N)}\`: o nome da variável é \`${N}s\` (não existe) e expande para nada — o argumento some`,
            dqbrace: `\`${QITEMS.dqbrace.src(N)}\`: variável delimitada pelas chaves, dentro de aspas duplas`,
            sqInDq: `\`${QITEMS.sqInDq.src(N)}\`: aspas simples dentro de aspas duplas são caracteres comuns; o \`$\` ainda expande`,
            dqInSq: `\`${QITEMS.dqInSq.src(N)}\`: tudo entre aspas simples é literal, inclusive as aspas duplas e o \`$\``,
            concat: `\`${QITEMS.concat.src(N)}\`: dois trechos colados num só argumento; o primeiro expande, o segundo (aspas simples) é literal`,
            dqBsBs: `\`${QITEMS.dqBsBs.src(N)}\`: em aspas duplas \`\\\\\` vira uma barra literal e o \`$\` seguinte ainda expande`,
            cmd: `\`${QITEMS.cmd.src(N)}\`: substituição de comando (o \`echo\` interno imprime o valor)`,
            sqCmd: `\`${QITEMS.sqCmd.src(N)}\`: em aspas simples nada é executado nem expandido`,
            dqCmd: `\`${QITEMS.dqCmd.src(N)}\`: a substituição de comando funciona dentro de aspas duplas`,
            dqQuote: `\`${QITEMS.dqQuote.src(N)}\`: \`\\"\` produz aspas literais dentro das aspas duplas, e a variável expande`,
            escQuote: `\`${QITEMS.escQuote.src(N)}\`: \`\\"\` fora de aspas gera aspas literais`,
            twice: `\`${QITEMS.twice.src(N)}\`: duas expansões coladas num único argumento`,
          }[id])).join('; ');
          return {
            type: 'unica',
            text: `Com a variável definida abaixo, qual é a saída do comando \`echo\`?\n\n${block(`$ ${setup}\n$ ${line}`)}`,
            options,
            explanation: `Argumento a argumento: ${rule}. O \`echo\` junta os argumentos restantes com um espaço. Saída: ${correct ? '`' + correct + '`' : 'linha em branco'}.`,
            ref: ['101:p.199-200', '101:p.205'],
            verify: { sh: `${setup}\n${line}`, expect: correct },
          };
        }
        // inversa: qual comando imprime X?
        const alts = [];
        const seen = new Set([correct]);
        const tryAlt = (arr) => {
          const o = qOut(arr, v, N, SEMS.ok);
          if (seen.has(o) || o === '') return;
          seen.add(o); alts.push({ ids: arr, out: o });
        };
        for (let k = 0; k < 40 && alts.length < 3; k++) {
          const arr = [...ids];
          const pos = rng.int(0, arr.length - 1);
          const sub = rng.weighted(QIDS, (q) => QWEIGHT[q]);
          if (arr.includes(sub)) continue;
          arr[pos] = sub;
          tryAlt(arr);
        }
        if (alts.length < 3 || correct === '') return null;
        const optIds = [ids, ...alts.map((a) => a.ids)];
        const options = [{ t: `echo ${qSrc(ids, N)}`, ok: true }, ...alts.map((a) => ({ t: `echo ${qSrc(a.ids, N)}`, ok: false }))];
        return {
          type: 'unica',
          text: `Com \`${setup}\` definida, qual dos comandos abaixo imprime exatamente a linha a seguir?\n\n${block(correct)}`,
          options,
          explanation: `Saída de cada opção: ${optIds.map((arr) => '`echo ' + qSrc(arr, N) + '` → `' + qOut(arr, v, N, SEMS.ok) + '`').join('; ')}. Lembre: aspas duplas expandem \`$\`, aspas simples não expandem nada, \`\\\` protege o caractere seguinte e \`$VARs\` procura a variável \`VARs\`, não \`VAR\` seguida de \`s\`.`,
          ref: ['101:p.199-200', '101:p.205'],
          verify: { sh: `${setup}\n${options.map((o) => o.t).join('\n')}`, expect: optIds.map((arr) => qOut(arr, v, N, SEMS.ok)).join('\n') },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'cl-quote-files', obj: '103.1', nivel: 2, peso: 2,
    make(rng) {
      return retry(() => {
        const V = rng.pick(['ARQ', 'NOME', 'DOC']);
        const file = rng.pick(['meu relatorio.txt', 'nota de aula.md', 'lista de compras.txt', 'dados 2024.csv', 'foto de ferias.jpg']);
        const [w1, ...rest] = file.split(' ');
        const forms = [
          { src: `$${V}`, files: file.split(' ') },
          { src: `"$${V}"`, files: [file] },
          { src: `'$${V}'`, files: [`$${V}`] },
          { src: `\\$${V}`, files: [`$${V}`] },
          { src: `$${V}.bak`, files: [w1, ...rest.slice(0, -1), rest[rest.length - 1] + '.bak'] },
          { src: `"$${V}".bak`, files: [file + '.bak'] },
          { src: `"$${V}.bak"`, files: [file + '.bak'] },
          { src: `\${${V}}_old`, files: [w1, ...rest.slice(0, -1), rest[rest.length - 1] + '_old'] },
          { src: `"\${${V}}_old"`, files: [file + '_old'] },
          { src: `"$${V}" "$${V}.bak"`, files: [file, file + '.bak'] },
        ];
        const pick = rng.pick(forms);
        const cmd = `touch ${pick.src}`;
        const sortAscii = (a) => [...new Set(a)].sort();
        const fmt = (files) => sortAscii(files).map((f) => `'${f}'`).join(', ');
        const correct = fmt(pick.files);
        // alternativas por mal-entendidos
        const alt = [
          [file], file.split(' '), [`$${V}`], [file + '.bak'], [w1], [file, w1], [file + '_old'],
          [...file.split(' '), file], pick.files.slice(0, 1), pick.files.slice(1), [V],
        ].filter((a) => a.length).map(fmt);
        const prefix = `$ ${V}="${file}"\n`;
        return {
          type: 'unica',
          text: `Em um diretório vazio, o usuário digita os comandos abaixo. Quais arquivos existem no diretório depois deles?\n\n${block(`${prefix}$ ${cmd}\n$ ls -1`)}`,
          options: mcq(rng, correct, alt, 4),
          explanation: `Sem aspas, o Bash faz *divisão em palavras* depois de expandir a variável: o valor "${file}" vira ${file.split(' ').length} argumentos para o \`touch\`. Entre aspas duplas a variável é expandida mas o resultado continua sendo **um** argumento; entre aspas simples (ou com \`\\\`) o \`$\` fica literal e o arquivo se chamaria \`$${V}\`. Aqui: \`${cmd}\` cria ${pick.files.length === 1 ? 'um arquivo' : pick.files.length + ' arquivos'}: ${correct}.`,
          ref: ['101:p.199-200'],
          verify: { sh: `cd "$(mktemp -d)"\n${V}="${file}"\n${cmd}\nls -1 | sed "s/^/'/;s/$/'/" | paste -s -d, - | sed 's/,/, /g'`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'cl-var-scope', obj: '103.1', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const names = rng.sample(['CURSO', 'NIVEL', 'TURMA', 'LINGUA', 'MODO'], rng.int(1, 2));
        const vals = ['alfa', 'beta', 'gama', 'delta', 'omega', 'zeta', 'sigma', 'kappa'];
        const pickV = () => rng.pick(vals);
        const stmts = [];
        const used = new Set();
        const n0 = names[0];
        stmts.push({ k: rng.chance(0.3) ? 'exportAssign' : 'assign', n: n0, v: pickV() });
        if (names[1]) stmts.push({ k: rng.chance(0.4) ? 'exportAssign' : 'assign', n: names[1], v: pickV() });
        const kinds = ['echo', 'child', 'child', 'childSet', 'sub', 'prefixChild', 'prefixEcho', 'export', 'assign', 'unset'];
        const total = rng.int(4, 6);
        for (let i = 0; i < total; i++) {
          const k = rng.pick(kinds);
          const n = rng.pick(names);
          stmts.push({ k, n, v: pickV() });
        }
        const prints = stmts.filter(isPrint).length;
        if (prints < 3 || prints > 5) return null;
        if (!stmts.some((s) => s.k === 'child')) return null;
        const correctLines = runScope(stmts);
        const sems = [{ childAll: true }, { subLeaks: true }, { prefixPersists: true }, { prefixTemp: true }, { childAll: true, subLeaks: true }, { prefixPersists: true, prefixTemp: true }];
        const fmt = (l) => l.map((x) => (x.endsWith('=') ? x : x)).join(' | ');
        const correct = fmt(correctLines);
        const pool = sems.map((s) => fmt(runScope(stmts, s)));
        const text = stmts.map(stmtText);
        const uniq = new Set(pool.filter((p) => p !== correct));
        if (uniq.size < 3) return null;
        return {
          type: 'unica',
          text: `Os comandos abaixo são digitados, na ordem, em um terminal Bash (nenhuma das variáveis existia antes). Quais linhas são impressas? (uma linha por comando que imprime, separadas aqui por \` | \`)\n\n${block(text.map((t) => '$ ' + t).join('\n'))}`,
          options: mcq(rng, correct, [...uniq], 4),
          explanation: 'Regras: (1) uma variável criada com `V=valor` é **local** ao shell; só vai para o ambiente dos processos filhos (como `bash -c`) se for **exportada** (`export V`). (2) `( ... )` e `bash -c` rodam em outro processo: o que mudam lá não volta para o shell pai. (3) `V=x comando` vale **só durante aquele comando**, e a expansão de `$V` na própria linha acontece **antes** da atribuição (por isso `V=x echo "$V"` mostra o valor antigo). Passo a passo: ' +
            stmts.map((s, i) => `\`${text[i]}\`` + (isPrint(s) ? ` → ${runScope(stmts.slice(0, i + 1)).slice(-1)[0]}` : '')).join('; ') + `. Saída: ${correct}.`,
          ref: ['101:p.197-199'],
          verify: { sh: `{\n${text.join('\n')}\n} 2>&1 | paste -s -d'|' -`, expect: correctLines.join('|') },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'cl-hist-expand', obj: '103.1', nivel: 2, peso: 3,
    make(rng) {
      return retry(() => {
        const sc = histScenario(rng);
        if (!sc) return null;
        const listing = sc.H.map((h, i) => `${String(sc.base + i).padStart(5)}  ${h}`).join('\n');
        const options = mcq(rng, sc.result, sc.alts, 4);
        const dummy = sc.base > 1 ? `for ((i=1;i<${sc.base};i++)); do history -s ':'; done\n` : '';
        const script = `bash -c ${sq(`set -o history; HISTSIZE=100000; history -c\n${dummy}${sc.H.map((h) => `history -s ${sq(h)}`).join('\n')}\nhistory -p ${sq(sc.line)}`)}`;
        return {
          type: 'unica',
          text: `O histórico da sessão atual do Bash contém os comandos abaixo (numerados como na saída de \`history\`; o mais recente é o último). O usuário digita a linha seguinte e pressiona Enter. Qual comando o Bash realmente executa depois da expansão do histórico?\n\n${block(listing)}\n\n${block('$ ' + sc.line)}`,
          options,
          explanation: `${HEXPL[sc.kind]} Aqui, \`${sc.line}\` resulta em \`${sc.result}\`. Mantenha em mente que o histórico é consultado **antes** de a própria linha ser registrada, e que a expansão é feita imediatamente após a leitura da linha.`,
          ref: ['101:p.189-190'],
          verify: { sh: script, expect: sc.result },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'cl-chain-ops', obj: '103.1', nivel: 3, peso: 2,
    make(rng) {
      return retry(() => {
        const nSeg = rng.chance(0.6) ? 1 : 2;
        const segs = [];
        const used = new Set();
        for (let s = 0; s < nSeg; s++) {
          const nIt = rng.int(3, 4);
          const items = [];
          for (let i = 0; i < nIt; i++) {
            const op = i === 0 ? null : rng.pick(['&&', '||']);
            const r = rng.int(0, 99);
            let term;
            if (i === 0) term = r < 85 ? rng.pick(TERMS) : { t: 'echo A', echo: 'A' };
            else if (r < 62) { const w = rng.pick(['A', 'B', 'C', 'D', 'E', 'F']); term = { t: `echo ${w}`, echo: w }; }
            else if (r < 80) term = rng.pick(TERMS);
            else term = { t: 'echo $?', status: true };
            items.push({ op, term: { ...term } });
            if (term.t !== 'echo $?' && !term.t.startsWith('echo ')) used.add(term);
          }
          segs.push({ items });
        }
        const toText = (sg) => sg.items.map((x) => (x.op ? ` ${x.op} ` : '') + x.term.t).join('');
        const line = segs.map(toText).join('; ');
        const outs = runChain(segs);
        if (outs.length < 1 || outs.length > 4) return null;
        const alts = [runChain(segs, { allRun: true }), runChain(segs, { andTight: true }), runChain(segs, { semiAnd: true })];
        const fmt = (a) => (a.length ? a.join(' ') : '(nenhuma saída)');
        const correct = fmt(outs);
        const pool = alts.map(fmt).filter((p) => p !== correct);
        if (new Set(pool).size < 2) return null;
        pool.push(fmt(outs.slice(0, -1)), fmt([...outs, outs[outs.length - 1]]));
        if (outs.length > 1) pool.push(fmt([...outs].reverse()));
        if (new Set(pool.filter((p) => p !== correct)).size < 3) return null;
        const statusTable = TERMS.filter((t) => line.includes(t.t)).map((t) => `\`${t.t}\` → ${t.st}`).join('; ');
        const traceLog = [];
        runChain(segs, {}, traceLog);
        return {
          type: 'unica',
          text: `Qual é a saída (os valores impressos, na ordem, separados aqui por espaço) da linha de comando abaixo? Códigos de saída dos comandos de teste usados: ${statusTable || 'apenas `echo` (sempre 0)'}.\n\n${block('$ ' + line)}`,
          options: mcq(rng, correct, pool, 4),
          explanation: '`;` separa listas independentes (a seguinte sempre roda). Dentro de uma lista, `&&` e `||` têm a **mesma precedência** e são avaliados da **esquerda para a direita**: `a && b` executa `b` só se o status de `a` for 0; `a || b` executa `b` só se o status for diferente de 0. Um comando que é pulado mantém o status anterior, e `echo $?` mostra o status do último comando executado. Passo a passo: ' +
            `${traceLog.join('; ')}. Resultado desta linha: ${correct}.`,
          ref: ['101:p.185'],
          verify: { sh: `{ ${line.replace(/;\s*/g, '; ')}; } | paste -s -d' ' -`, expect: outs.join(' ') },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'cl-env-vs-set', obj: '103.1', nivel: 3, peso: 2,
    make(rng) {
      return retry(() => {
        const n = rng.pick(['CURSO', 'TURMA', 'NIVEL', 'MODO']);
        const vals = ['alfa', 'beta', 'gama', 'delta'];
        const stmts = [];
        let st = null; // {val, exp}
        const kinds = ['assign', 'exportAssign', 'export', 'unset', 'reassign'];
        const total = rng.int(2, 4);
        for (let i = 0; i < total; i++) {
          let k = rng.pick(i === 0 ? ['assign', 'exportAssign', 'assign'] : kinds);
          if (k === 'export' && !st) k = 'exportAssign';
          if (k === 'unset' && !st) k = 'assign';
          if (k === 'reassign' && !st) k = 'assign';
          const v = rng.pick(vals);
          if (k === 'assign' || k === 'reassign') { st = { val: v, exp: st ? st.exp : false }; stmts.push(`${n}=${v}`); }
          else if (k === 'exportAssign') { st = { val: v, exp: true }; stmts.push(`export ${n}=${v}`); }
          else if (k === 'export') { st = { val: st.val, exp: true }; stmts.push(`export ${n}`); }
          else { st = null; stmts.push(`unset ${n}`); }
        }
        const inEnv = st && st.exp ? 1 : 0;
        const inSet = st ? 1 : 0;
        const correct = `${inEnv} e ${inSet}`;
        const pool = ['0 e 0', '0 e 1', '1 e 1', '1 e 0'].filter((x) => x !== correct);
        return {
          type: 'unica',
          text: `Depois dos comandos abaixo, em um shell Bash interativo, o que imprimem **as duas linhas finais**? Cada uma conta quantas linhas começam com \`${n}=\` na saída de \`env\` e na de \`set\`, respectivamente. (Responda no formato "env e set".)\n\n${block(stmts.map((s) => '$ ' + s).join('\n') + `\n$ env | grep -c '^${n}='\n$ set | grep -c '^${n}='`)}`,
          options: mcq(rng, correct, pool, 4),
          explanation: '`set` (sem argumentos) lista **todas** as variáveis do shell — exportadas ou não — e as funções; `env` mostra apenas as variáveis **exportadas** (o ambiente herdado pelos processos filhos). `unset` remove a variável de ambos; `V=valor` cria só no shell; `export V` marca para exportação. Estado final: ' +
            (st ? `${n}=${st.val}, ${st.exp ? 'exportada' : 'não exportada'}` : `${n} não existe`) + `. Resultado: ${correct}.`,
          ref: ['101:p.197-199'],
          verify: { sh: `${stmts.join('\n')}\necho "$(env | grep -c '^${n}=') e $(set | grep -c '^${n}=')"`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'cl-path-resolve', obj: '103.1', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const prog = rng.pick(['relat', 'backup', 'limpar', 'sincro', 'status', 'deploy']);
        const DIRS = ['/usr/local/bin', '/opt/ferramentas/bin', '/home/ana/bin', '/srv/scripts', '/usr/local/sbin', '/opt/app/bin'];
        const fmt = rng.weighted(['order', 'which', 'cwd', 'append'], (x) => ({ order: 4, which: 2, cwd: 3, append: 3 }[x]));
        if (fmt === 'cwd') {
          const hasX = rng.chance(0.7);
          const wd = rng.pick(['/home/ana/scripts', '/tmp/teste', '/home/ana/projetos']);
          const cand = [
            { t: prog, ok: false, why: `\`${prog}\` sem barra é procurado só nos diretórios do PATH, e o diretório atual não está no PATH: "command not found"` },
            { t: `./${prog}`, ok: hasX, why: hasX ? `\`./${prog}\` é um caminho (contém barra), então o PATH é ignorado; funciona porque o arquivo tem permissão de execução` : `\`./${prog}\` ignora o PATH, mas o arquivo **não** tem permissão de execução: "Permission denied"` },
            { t: `bash ${prog}`, ok: true, why: `\`bash ${prog}\` abre o arquivo como argumento do interpretador (o caminho relativo é resolvido a partir do diretório atual); não precisa de permissão de execução` },
            { t: `sh ${prog}`, ok: true, why: `\`sh ${prog}\` também lê o script como argumento; dispensa o bit de execução` },
            { t: `$PWD/${prog}`, ok: hasX, why: hasX ? `\`$PWD/${prog}\` é um caminho absoluto; funciona porque há permissão de execução` : `\`$PWD/${prog}\` é um caminho absoluto, mas falta o bit de execução: "Permission denied"` },
            { t: `. ./${prog}`, ok: true, why: `\`. ./${prog}\` (source) lê e executa os comandos no shell atual, sem exigir o bit de execução` },
          ];
          const total = rng.int(5, 6);
          const okPool = cand.filter((c) => c.ok); const badPool = cand.filter((c) => !c.ok);
          const nC = Math.min(okPool.length, rng.int(2, 3));
          const chosenOk = rng.sample(okPool, nC);
          const chosenBad = badPool.length ? rng.sample(badPool, Math.min(badPool.length, total - nC)) : [];
          if (chosenOk.length + chosenBad.length < 5) return null;
          const options = multi(rng, chosenOk.map((c) => c.t), chosenBad.map((c) => c.t), chosenBad.length);
          const all = [...chosenOk, ...chosenBad];
          const probes = options.map((o) => `out=$({ ${o.t}; } 2>&1); [ "$out" = executado ] && echo S || echo N`);
          return {
            type: 'multipla',
            text: `O script \`${prog}\` está no diretório atual (\`${wd}\`), que **não** faz parte do \`PATH\`. O arquivo ${hasX ? 'tem permissão de execução (`-rwxr-xr-x`)' : '**não** tem permissão de execução (`-rw-r--r--`)'} e imprime \`executado\`. Quais comandos, digitados nesse diretório, fazem o script imprimir \`executado\`?`,
            options,
            explanation: all.filter((c) => options.some((o) => o.t === c.t)).map((c) => c.why + '.').join(' '),
            ref: ['101:p.197'],
            verify: { sh: `cd "$(mktemp -d)"\nprintf '#!/bin/sh\\necho executado\\n' > ${prog}\n${hasX ? `chmod 755 ${prog}` : `chmod 644 ${prog}`}\n${probes.join('\n')}`, expect: options.map((o) => (o.ok ? 'S' : 'N')).join('\n') },
          };
        }
        // cenários baseados em PATH com versões em vários diretórios
        const n = rng.int(2, 3);
        const dirs = rng.sample(DIRS, n);
        const exec = dirs.map(() => rng.chance(0.75));
        if (fmt === 'order' || fmt === 'which') {
          const pathOrder = dirs;
          const extra = ['/usr/bin', '/bin'];
          const pathStr = [...pathOrder, ...extra].join(':');
          const winner = pathOrder.findIndex((d, i) => exec[i]);
          if (fmt === 'which' && winner < 0) return null;
          const label = (d) => `versao de ${d}`;
          let correct; let pool;
          if (fmt === 'order') {
            correct = winner >= 0 ? label(pathOrder[winner]) : 'bash: ' + prog + ': Permission denied';
            pool = [...pathOrder.map(label), `bash: ${prog}: command not found`, `bash: ${prog}: Permission denied`].filter((x) => x !== correct);
            if (winner >= 0) pool.push(`bash: ${prog}: Permission denied`);
          } else {
            correct = winner >= 0 ? `${pathOrder[winner]}/${prog}` : '(nada é impresso; status 1)';
            pool = [...pathOrder.map((d) => `${d}/${prog}`), `/usr/bin/${prog}`, '(nada é impresso; status 1)', `./${prog}`].filter((x) => x !== correct);
          }
          const listing = pathOrder.map((d, i) => `${exec[i] ? '-rwxr-xr-x' : '-rw-r--r--'} 1 root root  28 mar  3 10:15 ${d}/${prog}`).join('\n');
          const setup = pathOrder.map((d, i) => `mkdir -p "$d${d}"; printf '#!/bin/sh\\necho "%s"\\n' ${sq(label(d))} > "$d${d}/${prog}"; chmod ${exec[i] ? 755 : 644} "$d${d}/${prog}"`).join('\n');
          const real = pathOrder.map((d) => `$d${d}`).join(':');
          const sh = fmt === 'order'
            ? `d=$(mktemp -d)\n${setup}\nPATH=${real}:/usr/bin:/bin\nout=$(${prog} 2>&1); case "$out" in *"Permission denied") echo 'bash: ${prog}: Permission denied';; *"command not found") echo 'bash: ${prog}: command not found';; *) echo "$out";; esac`
            : `d=$(mktemp -d)\n${setup}\nPATH=${real}:/usr/bin:/bin\nr=$(command -v ${prog}); if [ -n "$r" ]; then echo "\${r#$d}"; else echo '(nada é impresso; status 1)'; fi`;
          const cmdTxt = fmt === 'order' ? prog : `command -v ${prog}`;
          return {
            type: 'unica',
            text: `Considere os arquivos abaixo (todos com o nome \`${prog}\`) e o valor atual do \`PATH\`:\n\n${block(`${listing}\n\n$ echo $PATH\n${pathStr}`)}\n\n${fmt === 'order' ? `O que acontece quando o usuário (que não é o dono dos arquivos) digita \`${prog}\`? (Cada script imprime "versao de" seguido do diretório onde está.)` : `Qual é a saída de \`${cmdTxt}\`?`}`,
            options: mcq(rng, correct, pool, 4),
            explanation: `O Bash procura o comando nos diretórios do \`PATH\` **da esquerda para a direita** e usa o **primeiro arquivo executável** que encontrar; arquivos sem permissão de execução são ignorados na busca. ${winner >= 0 ? (winner === 0 ? `Aqui, o primeiro diretório do PATH (\`${pathOrder[0]}\`) já contém uma versão executável.` : `Aqui, ${pathOrder.slice(0, winner).map((d) => '`' + d + '`').join(' e ')} ${winner === 1 ? 'tem' : 'têm'} o arquivo, mas sem permissão de execução, e por isso ${winner === 1 ? 'é ignorado' : 'são ignorados'}; o primeiro executável está em \`${pathOrder[winner]}\`.`) : 'Nenhuma das versões é executável; para o comando digitado só resta o erro de permissão.'}${fmt === 'which' ? ' `command -v`, `type -p` e `which` mostram o caminho dessa primeira correspondência.' : ''} Resultado: ${correct}.`,
            ref: ['101:p.188-189', '101:p.196-197'],
            verify: { sh, expect: correct },
          };
        }
        // 'append': PATH=$PATH:dir x PATH=dir:$PATH
        const sys = '/usr/bin';
        const newDir = rng.pick(['/opt/ferramentas/bin', '/home/ana/bin', '/usr/local/bin']);
        const front = rng.chance(0.5);
        const assign = front ? `PATH=${newDir}:$PATH` : `PATH=$PATH:${newDir}`;
        const labelSys = `versao do sistema (${sys})`; const labelNew = `versao nova (${newDir})`;
        const correct = front ? labelNew : labelSys;
        const pool = [front ? labelSys : labelNew, `bash: ${prog}: command not found`, `bash: ${prog}: Permission denied`];
        const sh = `d=$(mktemp -d)\nmkdir -p "$d${sys}" "$d${newDir}"\nprintf '#!/bin/sh\\necho "%s"\\n' ${sq(labelSys)} > "$d${sys}/${prog}"; chmod 755 "$d${sys}/${prog}"\nprintf '#!/bin/sh\\necho "%s"\\n' ${sq(labelNew)} > "$d${newDir}/${prog}"; chmod 755 "$d${newDir}/${prog}"\nPATH="$d${sys}:/bin"\n${front ? `PATH="$d${newDir}:$PATH"` : `PATH="$PATH:$d${newDir}"`}\n${prog}`;
        return {
          type: 'unica',
          text: `Existem duas versões do programa \`${prog}\`: uma em \`${sys}\` (que imprime "${labelSys}") e outra em \`${newDir}\` (que imprime "${labelNew}"). O \`PATH\` inicial do usuário é \`${sys}:/bin\`. Ele executa:\n\n${block(`$ ${assign}\n$ ${prog}`)}\n\nO que é impresso?`,
          options: mcq(rng, correct, pool, 4),
          explanation: `\`${assign}\` ${front ? `coloca \`${newDir}\` **no início** do PATH: ele é pesquisado antes de \`${sys}\`, então vale a versão nova.` : `acrescenta \`${newDir}\` **no fim** do PATH: \`${sys}\` continua sendo pesquisado primeiro e a versão do sistema prevalece.`} Vale o **primeiro** diretório do PATH que contiver o executável. (A mudança só vale para o shell atual e seus filhos, e some quando a sessão termina, a menos que seja gravada em um arquivo de perfil.)`,
          ref: ['101:p.196-197', '101:p.204'],
          verify: { sh, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'cl-path-broken', obj: '103.1', nivel: 3, peso: 2,
    make(rng) {
      return retry(() => {
        const works = [
          { t: 'echo ola', why: '`echo` é um comando interno (builtin) do Bash' },
          { t: 'pwd', why: '`pwd` é builtin' },
          { t: 'cd /tmp', why: '`cd` só pode ser builtin' },
          { t: 'export X=1', why: '`export` é builtin' },
          { t: 'test -d /tmp', why: '`test` existe como builtin' },
          { t: 'kill -l', why: '`kill` é builtin do Bash' },
          { t: 'umask', why: '`umask` é builtin' },
          { t: 'printf x', why: '`printf` existe como builtin' },
          { t: '/bin/ls /tmp', why: 'um caminho **absoluto** dispensa a busca no PATH' },
          { t: '/usr/bin/uname', why: 'um caminho absoluto dispensa a busca no PATH' },
          { t: './nada.sh', why: 'um caminho com barra dispensa o PATH (o script do diretório atual tem permissão de execução)', setup: true },
        ];
        const fails = [
          { t: 'ls /tmp', why: '`ls` é um programa externo e só é achado pelo PATH' },
          { t: 'cat /etc/hostname', why: '`cat` é externo' },
          { t: 'uname -r', why: '`uname` é externo' },
          { t: 'date', why: '`date` é externo' },
          { t: 'which ls', why: '`which` é um programa externo' },
          { t: 'env', why: '`env` é externo' },
          { t: 'id', why: '`id` é externo' },
          { t: 'sleep 0', why: '`sleep` é externo' },
          { t: 'type ls', why: '`type` é builtin, mas aqui retorna erro (status 1) porque não encontra `ls` no PATH' },
          { t: 'command -v ls', why: '`command -v` é builtin, mas devolve status 1 porque `ls` não é encontrado' },
        ];
        const nOk = rng.int(2, 3);
        const nBad = rng.int(5, 6) - nOk;
        const oks = rng.sample(works, nOk); const bads = rng.sample(fails, nBad);
        const options = multi(rng, oks.map((o) => o.t), bads.map((b) => b.t), nBad);
        const all = [...oks, ...bads];
        const how = rng.pick(['PATH=/nonexistent', 'export PATH=/nonexistent', 'PATH=/opt/vazio']);
        const val = how.split('=')[1];
        const probes = options.map((o) => `( PATH=${val}; ${o.t} ) >/dev/null 2>&1 && echo S || echo N`);
        return {
          type: 'multipla',
          text: `Um usuário digitou \`${how}\` e o PATH passou a conter apenas um diretório que não existe.${options.some((o) => o.t === './nada.sh') ? ' O diretório atual contém o script `nada.sh`, com permissão de execução.' : ''} Em seguida, nesse mesmo shell Bash, quais comandos ainda **executam com sucesso** (status 0)?`,
          options,
          explanation: 'Comandos internos (builtins) e caminhos absolutos/relativos com barra não dependem do PATH; programas externos chamados só pelo nome precisam ser localizados nos diretórios do PATH. ' +
            all.filter((a) => options.some((o) => o.t === a.t)).map((a) => `\`${a.t}\`: ${a.why}.`).join(' '),
          ref: ['101:p.188-189', '101:p.204'],
          verify: { sh: `cd "$(mktemp -d)"\nprintf '#!/bin/sh\\ntrue\\n' > nada.sh; chmod 755 nada.sh\n${probes.join('\n')}`, expect: options.map((o) => (o.ok ? 'S' : 'N')).join('\n') },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'cl-precedence', obj: '103.1', nivel: 3, peso: 2,
    make(rng) {
      return retry(() => {
        const N = rng.pick(['saudar', 'relatorio', 'limpar', 'status', 'agenda']);
        const hasAlias = rng.chance(0.85); const hasFunc = rng.chance(0.85);
        if (!hasAlias && !hasFunc) return null;
        const state = { alias: hasAlias, func: hasFunc };
        const labelOf = (mode, s, sem = {}) => {
          if (mode === 'plain') return sem.funcFirst ? (s.func ? 'funcao' : s.alias ? 'alias' : 'externo') : (s.alias ? 'alias' : s.func ? 'funcao' : 'externo');
          if (mode === 'bs') return sem.bsAll ? 'externo' : (s.func ? 'funcao' : 'externo');
          if (mode === 'cmd') return sem.cmdAlias ? (s.func ? 'funcao' : 'externo') : 'externo';
          return 'externo';
        };
        const textOf = { plain: N, bs: `\\${N}`, cmd: `command ${N}`, abs: `/usr/local/bin/${N}` };
        // programa: 3 ou 4 formas distintas de invocar + remoções do alias/função + uma chamada final simples
        const steps = rng.sample(['plain', 'bs', 'cmd', 'abs'], rng.int(3, 4));
        if (hasAlias && rng.chance(0.6)) steps.splice(rng.int(1, steps.length), 0, 'unalias');
        if (hasFunc && rng.chance(0.6)) steps.splice(rng.int(1, steps.length), 0, 'unfunc');
        if (steps.some((k) => k === 'unalias' || k === 'unfunc')) steps.push(rng.pick(['plain', 'bs']));
        const run = (sem) => {
          const s = { ...state }; const o = [];
          for (const k of steps) {
            if (k === 'unalias') { if (!sem.noUnset) s.alias = false; } else if (k === 'unfunc') { if (!sem.noUnset) s.func = false; } else o.push(labelOf(k, s, sem));
          }
          return o;
        };
        const correctArr = run({});
        const correct = correctArr.join(' ');
        const alts = [run({ bsAll: true }), run({ cmdAlias: true }), run({ funcFirst: true }), run({ noUnset: true }), run({ bsAll: true, cmdAlias: true })].map((a) => a.join(' '));
        const pool = alts.filter((a) => a !== correct);
        if (new Set(pool).size < 3) return null;
        const setupLines = [];
        if (hasFunc) setupLines.push(`$ ${N}() { echo funcao; }`);
        if (hasAlias) setupLines.push(`$ alias ${N}='echo alias'`);
        const stepText = steps.map((k) => (k === 'unalias' ? `unalias ${N}` : k === 'unfunc' ? `unset -f ${N}` : textOf[k]));
        const evalLines = stepText.map((t) => `eval ${sq(t.replace('/usr/local/bin/', '"$d"/usr/local/bin/'))}`);
        const sh = `shopt -s expand_aliases\nd=$(mktemp -d); mkdir -p "$d/usr/local/bin"; printf '#!/bin/sh\\necho externo\\n' > "$d/usr/local/bin/${N}"; chmod 755 "$d/usr/local/bin/${N}"\nPATH="$d/usr/local/bin:$PATH"\n${hasFunc ? `eval ${sq(`${N}() { echo funcao; }`)}\n` : ''}${hasAlias ? `eval ${sq(`alias ${N}='echo alias'`)}\n` : ''}{\n${evalLines.join('\n')}\n} | paste -s -d' ' -`;
        let pi = 0;
        const trace = steps.map((k, i) => (k === 'unalias' ? `\`unalias ${N}\` remove o alias` : k === 'unfunc' ? `\`unset -f ${N}\` remove a função` : `\`${textOf[k]}\` → ${correctArr[pi++]}`));
        return {
          type: 'unica',
          text: `Existe um executável \`/usr/local/bin/${N}\` (no PATH) que imprime \`externo\`. No shell interativo foram definidos:\n\n${block(setupLines.join('\n'))}\n\nAs linhas abaixo são digitadas em sequência. Quais textos são impressos, na ordem? (as linhas \`unalias\` e \`unset -f\` não imprimem nada)\n\n${block(stepText.map((t) => '$ ' + t).join('\n'))}`,
          options: mcq(rng, correct, pool, 4),
          explanation: 'Ordem de resolução de um nome de comando: **alias → função → builtin → arquivo no PATH**. A barra invertida (`\\nome`) e as aspas impedem apenas a expansão do **alias**; `command nome` ignora aliases **e** funções (executa o builtin ou o arquivo); um caminho com barra executa sempre o arquivo. `unalias` e `unset -f` removem o alias e a função, deixando a camada seguinte à mostra. Passo a passo: ' + trace.join('; ') + '.',
          ref: ['101:p.188-189'],
          verify: { sh, expect: correct },
        };
      });
    },
  },
];
