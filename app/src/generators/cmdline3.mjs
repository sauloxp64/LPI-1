// 103.3 — gerenciamento básico de arquivos: find, globbing/chaves, dd, tar, cpio, cp/mv/rm, ls, touch, compactadores.
// Os gabaritos vêm de modelos em JS conferidos contra o GNU findutils/coreutils/tar reais (campo `verify`).
import { mcq, multi, block } from './util.mjs';

const sq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

function retry(fn, tries = 120) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try { const r = fn(i); if (r) return r; } catch (e) { last = e; }
  }
  throw last ?? new Error('retry esgotado');
}
const base = (p) => p.split('/').pop();
const depthOf = (p) => (p === '.' ? 0 : p.split('/').length - 1);

// ------------------------------------------------------------------------------------------
// globbing (shell) e padrões do `find -name`
// ------------------------------------------------------------------------------------------
function globRe(p, ci = false) {
  let re = '^';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (c === '[') {
      let j = p.indexOf(']', i + 2);
      if (j < 0) { re += '\\['; continue; }
      let set = p.slice(i + 1, j);
      if (set[0] === '!' || set[0] === '^') set = '^' + set.slice(1);
      re += '[' + set.replace(/\\/g, '\\\\') + ']';
      i = j;
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(re + '$', ci ? 'i' : 's');
}
/** casamento do shell: curingas não casam um ponto inicial */
const shellGlob = (pat, name) => (name.startsWith('.') && !pat.startsWith('.') ? false : globRe(pat).test(name));
/** o que `echo PADRAO` imprime num diretório com os nomes dados (LC_ALL=C) */
function echoGlob(words, names) {
  const out = [];
  for (const w of words) {
    for (const e of braceExpand(w)) {
      if (/[*?[]/.test(e)) {
        const hit = names.filter((n) => shellGlob(e, n)).sort();
        if (hit.length) out.push(...hit); else out.push(e);
      } else out.push(e);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------
// find: ficha de arquivos + átomos de teste
// ------------------------------------------------------------------------------------------
const UNIT = { c: 1, b: 512, k: 1024, M: 1048576, G: 1073741824 };
const cmpN = (x, sign, n) => (sign === '+' ? x > n : sign === '-' ? x < n : x === n);
const fmtAge = (min) => {
  const d = Math.floor(min / 1440); const h = Math.floor((min % 1440) / 60); const m = min % 60;
  return [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ');
};
const permStr = (mode, type = 'f') => (type === 'd' ? 'd' : '-') + [6, 3, 0].map((s) => { const b = (mode >> s) & 7; return (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + (b & 1 ? 'x' : '-'); }).join('');
const MIB = 1048576;
const sizeText = (n) => (n >= MIB && n % MIB === 0 ? `${n / MIB} MiB` : n >= 1024 && n % 1024 === 0 ? `${n / 1024} KiB` : `${n} bytes`);

const ATOM = {
  type: (c) => ({ k: 'type', c, txt: `-type ${c}`, ok: (f) => f.type === c, say: c === 'f' ? 'são arquivos regulares' : 'são diretórios' }),
  name: (pat, ci = false) => ({ k: ci ? 'iname' : 'name', pat, ci, txt: `-${ci ? 'i' : ''}name ${sq(pat)}`, ok: (f) => globRe(pat, ci).test(base(f.path)), say: nameSay(pat, ci) }),
  notname: (pat) => ({ k: 'notname', pat, txt: `! -name ${sq(pat)}`, ok: (f) => !globRe(pat).test(base(f.path)), say: 'NÃO ' + nameSay(pat, false).replace(/^têm/, 'têm') }),
  size: (sign, n, u) => ({ k: 'size', sign, n, u, txt: `-size ${sign}${n}${u}`, ok: (f) => cmpN(Math.ceil(f.size / UNIT[u]), sign, n), say: `${sign === '+' ? 'têm mais de' : sign === '-' ? 'têm menos de' : 'têm exatamente'} ${n} ${{ c: 'bytes', k: 'KiB', M: 'MiB', G: 'GiB' }[u]}` }),
  mtime: (sign, n) => ({ k: 'mtime', sign, n, txt: `-mtime ${sign}${n}`, ok: (f) => cmpN(Math.floor(f.age / 1440), sign, n), say: sign === '-' ? `foram modificados nos últimos ${n} dias` : sign === '+' ? `foram modificados há mais de ${n} dias` : `foram modificados há ${n} dia(s)` }),
  mmin: (sign, n) => ({ k: 'mmin', sign, n, txt: `-mmin ${sign}${n}`, ok: (f) => (sign === '+' ? f.age > n : f.age < n), say: sign === '-' ? `foram modificados nos últimos ${n} minutos` : `foram modificados há mais de ${n} minutos` }),
  perm: (kind, mode) => ({
    k: 'perm', kind, mode, txt: `-perm ${kind}${mode}`,
    ok: (f) => { const m = parseInt(mode, 8); return kind === '' ? f.perm === m : kind === '-' ? (f.perm & m) === m : (f.perm & m) !== 0; },
    say: kind === '' ? `têm permissões exatamente ${mode}` : kind === '-' ? `têm pelo menos as permissões ${mode} (todos esses bits ligados)` : `têm ao menos um dos bits de ${mode} ligado`,
  }),
  empty: () => ({ k: 'empty', txt: '-empty', ok: (f) => f.type === 'f' && f.size === 0, say: 'estão vazios' }),
};
function nameSay(pat, ci) {
  const sfx = ci ? ' (sem diferenciar maiúsculas de minúsculas)' : '';
  if (/^\*[^*?[]+$/.test(pat)) return `têm nome terminado em \`${pat.slice(1)}\`${sfx}`;
  if (/^[^*?[]+\*$/.test(pat)) return `têm nome começando com \`${pat.slice(0, -1)}\`${sfx}`;
  if (/^\*[^*?[]+\*$/.test(pat)) return `têm \`${pat.slice(1, -1)}\` em qualquer parte do nome${sfx}`;
  return `têm nome que casa com \`${pat}\`${sfx}`;
}
const renderExpr = (items) => items.map((it) => (it === 'or' ? '-o' : it.group ? `\\( ${it.group.map((g, i) => (i ? '-o ' : '') + g.txt).join(' ')} \\)` : it.txt)).join(' ');
const evalExpr = (items, f) => {
  const segs = [[]];
  for (const it of items) { if (it === 'or') segs.push([]); else segs[segs.length - 1].push(it); }
  return segs.some((seg) => seg.every((it) => (it.group ? it.group.some((g) => g.ok(f)) : it.ok(f))));
};
const findCmd = (c) => `find .${c.maxdepth ? ` -maxdepth ${c.maxdepth}` : ''} ${renderExpr(c.items)}`.trim();
const findRun = (fix, c) => fix.filter((f) => (!c.maxdepth || depthOf(f.path) <= c.maxdepth) && evalExpr(c.items, f)).map((f) => f.path).sort();

function mkFixture(rng, withDirs = false) {
  const pickFrom = (arr, n) => rng.sample(arr, n);
  const rootNames = ['relatorio.pdf', 'LEIAME.md', 'backup.tar.gz', 'script.sh', 'notas.txt', 'dados.csv', 'foto.JPG', 'config.ini', 'Resumo.TXT'];
  const docsNames = ['manual.pdf', 'notas.txt', 'guia.md', 'tabela.csv', 'ata.TXT', 'edital.pdf'];
  const logsNames = ['sistema.log', 'erro.log', 'acesso.log.1', 'app.tmp', 'cache.tmp', 'debug.log', 'Boot.LOG'];
  const sizes = [0, 700, 1024, 1500, 4096, 20000, 1048576, 1048577, 1572864, 3145728, 10485760, 10485761, 52428800];
  const ages = [15, 40, 95, 150, 300, 780, 1560, 2160, 3000, 4500, 7300, 11000, 20000];
  const perms = [0o644, 0o600, 0o755, 0o640, 0o664, 0o444, 0o750, 0o700, 0o666];
  const mk = (dir, names) => names.map((n) => ({ path: dir ? `./${dir}/${n}` : `./${n}`, type: 'f', size: rng.pick(sizes), age: rng.pick(ages), perm: rng.pick(perms) }));
  const files = [...mk('', pickFrom(rootNames, 3)), ...mk('docs', pickFrom(docsNames, 3)), ...mk('logs', pickFrom(logsNames, 3))];
  if (withDirs) files.push({ path: '.', type: 'd', size: 4096, age: 5, perm: 0o755 }, { path: './docs', type: 'd', size: 4096, age: 5, perm: 0o755 }, { path: './logs', type: 'd', size: 4096, age: 5, perm: 0o755 });
  return files;
}
function fixtureSetup(fix) {
  const lines = ['cd "$(mktemp -d)"', 'mkdir -p docs logs'];
  for (const f of fix.filter((x) => x.type === 'f')) {
    const p = f.path.slice(2);
    lines.push(`truncate -s ${f.size} ${sq(p)}; chmod ${f.perm.toString(8)} ${sq(p)}; touch -d "${f.age} minutes ago" ${sq(p)}`);
  }
  if (fix.some((x) => x.type === 'd')) lines.push('chmod 755 . docs logs', 'touch -d "5 minutes ago" . docs logs');
  return lines.join('\n');
}
function fixtureTable(fix) {
  const files = fix.filter((x) => x.type === 'f').sort((a, b) => (a.path < b.path ? -1 : 1));
  const w = Math.max(...files.map((f) => String(f.size).length));
  return files.map((f) => `${permStr(f.perm)}  ${String(f.size).padStart(w)} bytes  há ${fmtAge(f.age).padEnd(10)} ${f.path}`).join('\n');
}

export const generators = [];
// ------------------------------------------------------------------------------------------
// find: geração de comandos aleatórios sobre a ficha de arquivos
// ------------------------------------------------------------------------------------------
function randomAtoms(rng, fix, { forBuild = false } = {}) {
  const files = fix.filter((f) => f.type === 'f');
  const exts = [...new Set(files.map((f) => '.' + base(f.path).split('.').pop()))];
  const namePat = () => {
    const f = rng.pick(files); const b = base(f.path);
    const r = rng.int(0, 9);
    if (r < 6) return '*.' + b.split('.').pop();
    if (r < 8) return b.slice(0, 3) + '*';
    return '*' + b.slice(1, 4) + '*';
  };
  const makers = {
    name: () => ATOM.name(namePat(), false),
    iname: () => { const p = namePat(); return ATOM.name(rng.chance(0.5) ? p.toLowerCase() : p.toUpperCase(), true); },
    notname: () => ATOM.notname('*.' + rng.pick(exts).slice(1)),
    size: () => { const [s, n, u] = rng.pick(forBuild ? [['+', 1, 'M'], ['+', 10, 'M'], ['+', 100, 'k'], ['+', 1, 'k'], ['+', 3, 'M'], ['+', 20, 'k']] : [['+', 1, 'M'], ['+', 10, 'M'], ['-', 2, 'M'], ['+', 1, 'k'], ['-', 2, 'k'], ['+', 100, 'k'], ['-', 3, 'M'], ['+', 50, 'M'], ['', 2, 'M'], ['', 1, 'k'], ['-', 1, 'M']]); return ATOM.size(s, n, u); },
    mtime: () => { const [s, n] = rng.pick(forBuild ? [['-', 1], ['-', 7], ['+', 7], ['+', 3], ['-', 3]] : [['-', 1], ['+', 1], ['-', 7], ['+', 7], ['', 1], ['-', 2], ['+', 2], ['', 0], ['+', 3], ['', 2]]); return ATOM.mtime(s, n); },
    mmin: () => { const [s, n] = rng.pick([['-', 30], ['+', 60], ['-', 120], ['+', 240], ['-', 600]]); return ATOM.mmin(s, n); },
    perm: () => { const [k, m] = rng.pick(forBuild ? [['', '644'], ['-', '644'], ['/', '111'], ['-', '600'], ['/', '022'], ['', '755'], ['-', '111']] : [['', '644'], ['-', '644'], ['/', '111'], ['-', '600'], ['/', '022'], ['', '755'], ['-', '111'], ['', '600']]); return ATOM.perm(k, m); },
    empty: () => ATOM.empty(),
  };
  return makers;
}

/** variações "de um token" do comando, para criar distratores */
function findVariants(c) {
  const out = [];
  const swap = (idx, atom) => out.push({ ...c, items: c.items.map((it, i) => (i === idx ? atom : it)) });
  c.items.forEach((it, i) => {
    if (it === 'or') return;
    const atoms = it.group ? it.group : [it];
    atoms.forEach((a, j) => {
      const put = (na) => {
        if (it.group) swap(i, { group: it.group.map((g, k) => (k === j ? na : g)) });
        else swap(i, na);
      };
      if (a.k === 'type' && !c.items.some((x) => x !== 'or' && [x, ...(x.group ?? [])].some((y) => y.k === 'size' || y.k === 'empty'))) put(ATOM.type(a.c === 'f' ? 'd' : 'f'));
      if (a.k === 'name') put(ATOM.name(a.pat, true));
      if (a.k === 'iname') put(ATOM.name(a.pat, false));
      if (a.k === 'notname') put(ATOM.name(a.pat, false));
      if (a.k === 'size') {
        put(ATOM.size(a.sign === '+' ? '-' : '+', a.n, a.u));
        if (a.sign !== '') put(ATOM.size('', a.n, a.u));
        if (a.u === 'M') put(ATOM.size(a.sign, a.n, 'k')); else if (a.u === 'k') put(ATOM.size(a.sign, a.n, 'M'));
      }
      if (a.k === 'mtime') { put(ATOM.mtime(a.sign === '-' ? '+' : '-', a.n)); if (a.sign !== '') put(ATOM.mtime('', a.n)); if (a.n > 0) put(ATOM.mmin(a.sign || '-', a.n)); }
      if (a.k === 'mmin') { put(ATOM.mmin(a.sign === '-' ? '+' : '-', a.n)); put(ATOM.mtime(a.sign, a.n)); }
      if (a.k === 'perm') ['', '-', '/'].filter((k) => k !== a.kind).forEach((k) => put(ATOM.perm(k, a.mode)));
    });
    if (it.group) out.push({ ...c, items: [...c.items.slice(0, i), ...it.group.flatMap((g, k) => (k ? ['or', g] : [g])), ...c.items.slice(i + 1)] });
  });
  if (c.maxdepth) { out.push({ ...c, maxdepth: undefined }); out.push({ ...c, maxdepth: c.maxdepth + 1 }); } else out.push({ ...c, maxdepth: 1 });
  return out;
}

generators.push(
  // -------------------------------------------------------------------------------------------
  {
    id: 'fs-find-eval', obj: '103.3', nivel: 3, peso: 4,
    make(rng) {
      return retry(() => {
        const fix = mkFixture(rng);
        const mk = randomAtoms(rng, fix);
        const kinds = rng.sample(['name', 'iname', 'size', 'size', 'mtime', 'mtime', 'mmin', 'perm', 'perm', 'notname', 'empty'], 2).filter((v, i, a) => a.indexOf(v) === i);
        const items = [ATOM.type('f'), ...kinds.map((k) => mk[k]())];
        const useGroup = rng.chance(0.25);
        if (useGroup) {
          const a1 = mk.name(); const a2 = mk.name();
          if (a1.txt === a2.txt) return null;
          items.splice(1, 0, { group: [a1, a2] });
        }
        const c = { items, maxdepth: rng.chance(0.2) ? 1 : undefined };
        const cmd = findCmd(c);
        const res = findRun(fix, c);
        if (res.length < 2 || res.length > 3) return null;
        const resSet = new Set(res);
        const all = fix.filter((f) => f.type === 'f').map((f) => f.path).sort();
        const nonMatch = all.filter((p) => !resSet.has(p));
        if (nonMatch.length < 3) return null;
        const vars = findVariants(c).map((v) => findRun(fix, v));
        const near = [...new Set(vars.flat())].filter((p) => !resSet.has(p));
        const wrongPool = [...rng.shuffle(near), ...rng.shuffle(nonMatch.filter((p) => !near.includes(p)))];
        const nWrong = rng.int(5, 6) - res.length;
        const wrong = wrongPool.slice(0, nWrong);
        if (wrong.length < nWrong) return null;
        const options = multi(rng, res, wrong, nWrong);
        const lines = all.map((p) => {
          const f = fix.find((x) => x.path === p);
          const marks = [];
          const flat = c.items.flatMap((it) => (it === 'or' ? [] : it.group ? it.group : [it]));
          for (const a of flat) {
            let info = '';
            if (a.k === 'size') info = `⌈${f.size}/${UNIT[a.u]}⌉=${Math.ceil(f.size / UNIT[a.u])}`;
            else if (a.k === 'mtime') info = `⌊${f.age}/1440⌋=${Math.floor(f.age / 1440)}`;
            else if (a.k === 'mmin') info = `${f.age} min`;
            else if (a.k === 'perm') info = f.perm.toString(8);
            else if (a.k === 'empty') info = `${f.size} B`;
            else if (a.k === 'name' || a.k === 'iname' || a.k === 'notname') info = base(f.path);
            else continue;
            marks.push(`${a.txt.replace(/^! /, 'não ')}: ${info} ${a.ok(f) ? '✓' : '✗'}`);
          }
          return `${p} → ${resSet.has(p) ? 'SIM' : 'não'} (${marks.join('; ')}${c.maxdepth && depthOf(p) > c.maxdepth ? `; -maxdepth ${c.maxdepth}: ✗` : ''})`;
        });
        const rules = [];
        const flatAll = c.items.flatMap((it) => (it === 'or' ? [] : it.group ? it.group : [it]));
        if (flatAll.some((a) => a.k === 'size')) rules.push('`-size` **arredonda para cima** o tamanho para a unidade dada (c = byte, k = KiB, M = MiB) antes de comparar: `+1M` significa "mais de 1 MiB", `-2M` significa "no máximo 1 MiB" e `2M` casa tamanhos entre 1 MiB (exclusive) e 2 MiB (inclusive)');
        if (flatAll.some((a) => a.k === 'mtime')) rules.push('`-mtime n` usa a idade em dias **inteiros** (a parte fracionária é descartada): `-mtime -1` = menos de 24 h; `-mtime 1` = de 24 h a 48 h; `-mtime +1` = 48 h ou mais');
        if (flatAll.some((a) => a.k === 'mmin')) rules.push('`-mmin -n` / `+n` compara a idade em minutos (menos/mais de n minutos)');
        if (flatAll.some((a) => a.k === 'perm')) rules.push('`-perm 644` exige modo **exatamente** 644; `-perm -644` exige que **todos** esses bits estejam ligados (pode haver outros); `-perm /111` basta que **algum** desses bits esteja ligado');
        if (flatAll.some((a) => a.k === 'iname')) rules.push('`-iname` ignora maiúsculas/minúsculas; `-name` não');
        if (c.items.some((it) => it.group)) rules.push('o grupo `\\( ... -o ... \\)` faz o `-o` (OU) valer só dentro dos parênteses; fora dele, os testes são todos obrigatórios (E implícito)');
        return {
          type: 'multipla',
          text: `O diretório atual contém os arquivos abaixo (permissões, tamanho em bytes, tempo desde a última modificação e caminho):\n\n${block(fixtureTable(fix))}\n\nQuais arquivos são listados por \`${cmd}\`?`,
          options,
          explanation: `${rules.join('. ')}. Avaliação arquivo a arquivo:\n${block(lines.join('\n'))}`,
          ref: ['101:p.266-268'],
          verify: { sh: `${fixtureSetup(fix)}\necho "[$(${cmd} | sort | paste -s -d' ' -)]"`, expect: `[${res.join(' ')}]` },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'fs-find-build', obj: '103.3', nivel: 3, peso: 4,
    make(rng) {
      return retry(() => {
        const fix = mkFixture(rng, true);
        const mk = randomAtoms(rng, fix, { forBuild: true });
        const kinds = rng.sample(['name', 'iname', 'size', 'mtime', 'mmin', 'perm', 'notname', 'empty'], rng.int(1, 2));
        const items = [ATOM.type('f'), ...kinds.map((k) => mk[k]())];
        if (kinds.length === 1 && rng.chance(0.3)) {
          const a1 = mk.name(); const a2 = mk.name();
          if (a1.txt !== a2.txt && kinds[0] !== 'name' && kinds[0] !== 'notname' && kinds[0] !== 'iname') items.splice(1, 0, { group: [a1, a2] });
        }
        const c = { items, maxdepth: rng.chance(0.25) ? 1 : undefined };
        const cmd = findCmd(c);
        const res = findRun(fix, c);
        const vars = findVariants(c);
        const cands = [];
        const seen = new Set([cmd]);
        for (const v of rng.shuffle(vars)) {
          const t = findCmd(v);
          if (seen.has(t)) continue;
          const r = findRun(fix, v);
          if (r.join('|') === res.join('|')) continue; // precisa ser distinguível na ficha
          seen.add(t); cands.push({ t, v, r });
          if (cands.length === 3) break;
        }
        if (cands.length < 3) return null;
        if (res.length === 0) return null;
        const flat = c.items.flatMap((it) => (it === 'or' ? [] : it.group ? [{ say: `${it.group.map((g) => '(' + g.say.replace(/^têm /, 'têm ') + ')').join(' OU ')}` }] : [it]));
        const bullets = flat.map((a) => '* ' + a.say).join('\n');
        const options = [{ t: cmd, ok: true }, ...cands.map((x) => ({ t: x.t, ok: false }))];
        const tail = c.maxdepth ? '\n* a busca fica restrita ao diretório atual, sem entrar nos subdiretórios' : '';
        const expl = flat.map((a) => a.say).join('; ');
        const rules = [];
        const all2 = c.items.flatMap((it) => (it === 'or' ? [] : it.group ? it.group : [it]));
        if (all2.some((a) => a.k === 'size')) rules.push('`-size +N` = maior que N unidades (c, k, M, G), com arredondamento para cima; `-size -N` seria o oposto');
        if (all2.some((a) => a.k === 'mtime')) rules.push('`-mtime -N` = modificado há menos de N dias; `-mtime +N` = há mais de N dias; `-mmin` faz o mesmo em minutos');
        if (all2.some((a) => a.k === 'perm')) rules.push('`-perm MODO` exato; `-perm -MODO` todos os bits; `-perm /MODO` qualquer um dos bits');
        if (all2.some((a) => a.k === 'name' || a.k === 'iname' || a.k === 'notname')) rules.push('o padrão de `-name`/`-iname` vai entre aspas para o shell não expandi-lo; `-iname` ignora a caixa; `!` ou `-not` nega o teste');
        return {
          type: 'unica',
          text: `Qual comando \`find\` lista, a partir do diretório atual, apenas os itens que:\n\n${bullets}${tail}`,
          options,
          explanation: `Critérios: ${expl}. Comando correto: \`${cmd}\`. ${rules.join('. ')}. Cada alternativa errada troca um único detalhe (${cands.map((x) => '`' + x.t + '`').join('; ')}) e passa a listar outros arquivos.`,
          ref: ['101:p.265-269'],
          verify: {
            sh: `${fixtureSetup(fix)}\n${options.map((o) => `echo "[$(${o.t.startsWith('find') ? o.t : o.t} | sort | paste -s -d' ' -)]"`).join('\n')}`,
            expect: [res, ...cands.map((x) => x.r)].map((r) => `[${r.join(' ')}]`).join('\n'),
          },
        };
      });
    },
  },
);
// ------------------------------------------------------------------------------------------
// chaves (brace expansion) — expansão da esquerda para a direita, respeitando o aninhamento
// ------------------------------------------------------------------------------------------
function braceExpand(w) {
  const start = w.indexOf('{');
  if (start < 0) return [w];
  let depth = 0; let end = -1;
  for (let i = start; i < w.length; i++) {
    if (w[i] === '{') depth++;
    else if (w[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [w];
  const pre = w.slice(0, start); const body = w.slice(start + 1, end); const post = w.slice(end + 1);
  const parts = []; let cur = ''; depth = 0;
  for (const ch of body) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  let alts;
  const rn = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/.exec(body);
  const rc = /^([a-zA-Z])\.\.([a-zA-Z])$/.exec(body);
  if (rn) {
    const a = Number(rn[1]); const b = Number(rn[2]); const st = Math.abs(Number(rn[3] ?? 1)) || 1;
    const pad = /^-?0\d/.test(rn[1]) || /^-?0\d/.test(rn[2]) ? Math.max(rn[1].length, rn[2].length) : 0;
    alts = [];
    if (a <= b) for (let i = a; i <= b; i += st) alts.push(String(i).padStart(pad, '0'));
    else for (let i = a; i >= b; i -= st) alts.push(String(i).padStart(pad, '0'));
  } else if (rc) {
    const a = rc[1].charCodeAt(0); const b = rc[2].charCodeAt(0);
    alts = [];
    if (a <= b) for (let i = a; i <= b; i++) alts.push(String.fromCharCode(i));
    else for (let i = a; i >= b; i--) alts.push(String.fromCharCode(i));
  } else if (parts.length < 2) {
    // chave sem vírgula nem intervalo: fica literal
    return braceExpand(w.slice(end + 1)).map((r) => w.slice(0, end + 1) + r);
  } else alts = parts;
  return alts.flatMap((alt) => braceExpand(alt).flatMap((x) => braceExpand(post).map((y) => pre + x + y)));
}

const FNAMES = ['arq', 'nota', 'dados', 'foto', 'log', 'tmp', 'relat'];

generators.push(
  // -------------------------------------------------------------------------------------------
  {
    id: 'fs-glob', obj: '103.3', nivel: 2, peso: 4,
    make(rng) {
      return retry(() => {
        const bs = rng.sample(FNAMES, 3);
        const exts = rng.sample(['txt', 'log', 'jpg', 'csv', 'md'], 3);
        const names = new Set();
        bs.forEach((b) => { for (const d of rng.sample(['1', '2', '3', '10', '7'], rng.int(1, 3))) names.add(`${b}${d}.${rng.pick(exts)}`); });
        names.add(`${bs[0]}A.${exts[0]}`); names.add(`${bs[1]}b.${exts[1]}`);
        if (rng.chance(0.7)) names.add('.oculto.' + exts[0]);
        if (rng.chance(0.5)) names.add(bs[2].toUpperCase() + '1.' + exts[0].toUpperCase());
        if (rng.chance(0.5)) names.add('leiame');
        const list = [...names].sort();
        if (list.length < 7) return null;
        const b = rng.pick(bs); const e = rng.pick(exts); const e2 = rng.pick(exts.filter((x) => x !== e));
        const pats = [
          { p: `*.${e}`, why: `\`*\` casa qualquer sequência (inclusive vazia) de caracteres — mas **não** casa um ponto inicial, então arquivos ocultos (\`.nome\`) ficam de fora` },
          { p: `${b}?.${e}`, why: '`?` casa exatamente **um** caractere (qualquer um, letra ou dígito)' },
          { p: `${b}[0-9].${e}`, why: '`[0-9]` casa exatamente um algarismo' },
          { p: `${b}[1-3]*`, why: '`[1-3]` casa um caractere entre 1 e 3 e `*` completa o resto do nome' },
          { p: `*[!0-9].${e}`, why: '`[!0-9]` casa um caractere que **não** seja algarismo (a negação usa `!` ou `^` logo após o `[`)' },
          { p: `${b[0]}*`, why: 'o `*` casa qualquer sequência depois da primeira letra' },
          { p: `[${b[0]}${bs[1][0]}]*`, why: '`[xy]` casa um caractere que seja um dos listados' },
          { p: `*.{${e},${e2}}`, why: 'as chaves são expandidas **antes** do globbing: o shell tenta os dois padrões e junta os resultados; um padrão sem correspondência aparece literalmente' },
          { p: `???.${e}`, why: 'três `?` casam exatamente três caracteres antes do ponto' },
          { p: `*[0-9]*`, why: 'casa qualquer nome que contenha pelo menos um algarismo' },
          { p: `*${b.slice(0, 2)}*`, why: 'casa qualquer nome que contenha essas letras em qualquer posição (maiúsculas são caracteres diferentes)' },
        ];
        const fmt = rng.weighted(['multi', 'inverse', 'count'], (x) => ({ multi: 5, inverse: 3, count: 2 }[x]));
        const pat = rng.pick(pats);
        const res = echoGlob([pat.p], list);
        const real = res.filter((x) => list.includes(x));
        const setup = `cd "$(mktemp -d)"\ntouch ${list.map(sq).join(' ')}`;
        const shownList = list.join('  ');
        if (fmt === 'multi') {
          const uniq = [...new Set(real)];
          if (uniq.length < 2 || uniq.length > 3) return null;
          const others = list.filter((n) => !uniq.includes(n));
          // distratores: o que casaria sob equívocos comuns
          const alt = [
            echoGlob([pat.p.replace(/\?/g, '*')], list), echoGlob([pat.p.replace(/\[!/g, '[')], list),
            list.filter((n) => globRe(pat.p).test(n)), list.filter((n) => globRe(pat.p, true).test(n)),
          ].flat().filter((n) => list.includes(n) && !uniq.includes(n));
          const wrongPool = [...new Set([...rng.shuffle(alt), ...rng.shuffle(others)])];
          const nWrong = rng.int(5, 6) - uniq.length;
          if (wrongPool.length < nWrong) return null;
          return {
            type: 'multipla',
            text: `Um diretório contém exatamente estes arquivos (incluindo os ocultos, que começam com ponto):\n\n${block(shownList)}\n\nQuais arquivos são listados por \`ls ${pat.p}\` nesse diretório?`,
            options: multi(rng, uniq, wrongPool.slice(0, nWrong), nWrong),
            explanation: `${pat.why[0].toUpperCase()}${pat.why.slice(1)}. O Bash expande \`${pat.p}\` antes de executar o \`ls\`: ${uniq.join(', ')}. (O globbing diferencia maiúsculas de minúsculas e ordena os resultados.)`,
            ref: ['101:p.252-256'],
            verify: { sh: `${setup}\necho ${pat.p}`, expect: res.join(' ') },
          };
        }
        if (fmt === 'count') {
          const n = real.length;
          if (n < 2 || res.length !== real.length) return null;
          return {
            type: 'lacuna',
            text: `Um diretório contém exatamente estes arquivos (incluindo os ocultos):\n\n${block(shownList)}\n\nQuantos arquivos são selecionados pelo padrão \`${pat.p}\` (por exemplo, em \`ls ${pat.p}\`)?`,
            answers: [String(n)],
            explanation: `${pat.why[0].toUpperCase()}${pat.why.slice(1)}. Casam ${n}: ${real.join(', ')}.`,
            ref: ['101:p.252-256'],
            verify: { sh: `${setup}\nset -- ${pat.p}\necho "$#"`, expect: String(res.length) },
          };
        }
        // inverse: qual padrão seleciona exatamente estes arquivos?
        if (real.length < 2 || real.length > 4 || res.length !== real.length) return null;
        const key = (r) => r.join('|');
        const cands = [];
        const seen = new Set([key(real)]);
        const alt = rng.shuffle(pats.map((x) => x.p).concat([pat.p.replace(/\?/g, '*'), pat.p.replace(/\[!/g, '['), pat.p.replace(/\*/, '?'), pat.p.replace(/\.[a-z]+$/, '.' + e2), pat.p.replace(/\d-\d|1-3/, '0-9')]));
        for (const a of alt) {
          if (a === pat.p) continue;
          const r = echoGlob([a], list);
          if (r.some((x) => !list.includes(x))) continue;
          if (seen.has(key(r)) || r.length === 0) continue;
          seen.add(key(r)); cands.push({ p: a, r });
          if (cands.length === 3) break;
        }
        if (cands.length < 3) return null;
        const options = [{ t: pat.p, ok: true }, ...cands.map((c) => ({ t: c.p, ok: false }))];
        return {
          type: 'unica',
          text: `Um diretório contém exatamente estes arquivos (incluindo os ocultos):\n\n${block(shownList)}\n\nQual padrão, usado em \`ls PADRÃO\`, seleciona **exatamente** os arquivos ${real.map((x) => '`' + x + '`').join(', ')}?`,
          options,
          explanation: `${pat.why[0].toUpperCase()}${pat.why.slice(1)}. Resultados das opções: ${options.map((o) => '`' + o.t + '` → ' + echoGlob([o.t], list).join(' ')).join('; ')}.`,
          ref: ['101:p.252-256'],
          verify: { sh: `${setup}\n${options.map((o) => `echo ${o.t}`).join('\n')}`, expect: options.map((o) => echoGlob([o.t], list).join(' ')).join('\n') },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'fs-brace', obj: '103.3', nivel: 2, peso: 2,
    make(rng) {
      return retry(() => {
        const w = rng.sample(['jan', 'fev', 'mar', 'abr'], 3);
        const cases = [
          { src: '{a,b,c}' },
          { src: `arq{1..${rng.int(3, 5)}}.txt` },
          { src: '{a,b}{1,2}' },
          { src: '{1,2}{a,b}' },
          { src: 'dados{,.bak}' },
          { src: `f{01..0${rng.int(3, 5)}}` },
          { src: `{a..${rng.pick(['d', 'e', 'f'])}}` },
          { src: `{1..${rng.pick([10, 12])}..${rng.pick([3, 4])}}` },
          { src: 'dir/{x,y}/z' },
          { src: 'a{b,c{d,e}}' },
          { src: '{A..C}{1..2}' },
          { src: `copia_{${w.join(',')}}.csv` },
          { src: `img{${rng.int(8, 9)}..${rng.int(10, 12)}}.png` },
          { src: `n{0${rng.int(7, 9)}..${rng.int(10, 12)}}` },
          { src: `{${rng.int(3, 5)}..1}` },
        ];
        const c = rng.pick(cases);
        const out = braceExpand(c.src);
        const correct = out.join(' ');
        // distratores: mutações da própria expressão
        const mut = [];
        const m = (s) => { try { return braceExpand(s).join(' '); } catch { return null; } };
        mut.push(m(c.src.replace(/\.\.(\d+)/, (x, d) => `..${Number(d) + 1}`)), m(c.src.replace(/\.\.(\d+)/, (x, d) => `..${Math.max(1, Number(d) - 1)}`)));
        mut.push(m(c.src.replace(/\{0(\d)/, '{$1')), m(c.src.replace(/\{(\d+)\.\./, (x, d) => `{${Number(d) + 1}..`)));
        mut.push(m(c.src.replace(/\{(.*?)\}\{(.*?)\}/, '{$2}{$1}')));
        mut.push(out.join(','), out.join('').replace(/\s+/g, ''), out.length > 2 ? [...out].reverse().join(' ') : null, out.length > 1 ? out.slice(0, -1).join(' ') : null, c.src);
        if (/\{,/.test(c.src)) mut.push(out.map((x) => x.replace(/\.bak$/, '')).join(' '), 'dados .bak');
        if (/\{a,b\}\{1,2\}/.test(c.src)) mut.push('a1 b1 a2 b2', 'a b 1 2');
        if (/\{1,2\}\{a,b\}/.test(c.src)) mut.push('1a 1b 2a 2b'.split(' ').reverse().join(' '));
        const wrong = [...new Set(mut.filter((x) => x && x !== correct))];
        if (wrong.length < 3) return null;
        return {
          type: 'unica',
          text: `Qual é a saída do comando abaixo? (Ignore a quebra de linha final; os itens saem separados por espaço.)\n\n${block(`$ echo ${c.src}`)}`,
          options: mcq(rng, correct, wrong, 4),
          explanation: `A **expansão de chaves** (*brace expansion*) acontece antes de tudo e gera um argumento para cada alternativa, sem consultar o sistema de arquivos (diferente do globbing). Listas \`{a,b}\` dão cada item; intervalos \`{1..4}\`/\`{a..e}\` percorrem a sequência (\`{1..10..3}\` com passo 3); zeros à esquerda (\`01\`) fixam a largura; chaves consecutivas combinam todos os pares na ordem do **produto, com a primeira chave variando mais devagar**. \`${c.src}\` → ${correct}.`,
          ref: ['101:p.252-256'],
          verify: { sh: `echo ${c.src}`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'fs-dd', obj: '103.3', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const mode = rng.weighted(['size', 'records', 'slice', 'conv'], (x) => ({ size: 4, records: 3, slice: 2, conv: 1 }[x]));
        const MUL = { b: 512, c: 1, k: 1024, K: 1024, M: 1048576, kB: 1000, MB: 1000000, w: 2 };
        const bsOf = (s) => { const m = /^(\d+)([a-zA-Z]*)$/.exec(s); return Number(m[1]) * (m[2] ? MUL[m[2]] : 1); };
        if (mode === 'size') {
          const bs = rng.pick(['512', '1k', '1K', '4k', '1M', '2M', '1kB', '1MB', '100', '64k', '1b']);
          const count = rng.int(1, 6);
          const seek = rng.chance(0.45) ? rng.int(1, 4) : 0;
          const exists = rng.chance(0.4);
          const E = exists ? rng.pick([1048576, 524288, 10240, 8192, 3000000]) : 0;
          const notrunc = exists && rng.chance(0.6);
          const bsv = bsOf(bs);
          const end = (seek + count) * bsv;
          const final = notrunc ? Math.max(E, end) : end;
          const cmd = `dd if=/dev/zero of=img bs=${bs} count=${count}${seek ? ` seek=${seek}` : ''}${notrunc ? ' conv=notrunc' : ''}`;
          const dec = /[kKM]$/.test(bs) ? (seek + count) * bsOf(bs.replace(/[kKM]$/, (u) => (u === 'M' ? 'MB' : 'kB'))) : end + 1;
          const pool = [count * bsv, notrunc ? end : Math.max(E, end), E, seek * bsv, count * bsv + E, final + bsv, Math.max(1, final - bsv), end + E, dec].filter((x) => x !== final && x > 0);
          const wrong = [...new Set(pool.map(String))];
          if (wrong.length < 3) return null;
          return {
            type: 'unica',
            text: `${exists ? `O arquivo \`img\` já existe e tem **${E} bytes**. ` : 'O arquivo `img` ainda não existe. '}Depois do comando abaixo, qual é o tamanho de \`img\`, em bytes?\n\n${block('$ ' + cmd)}`,
            options: mcq(rng, String(final), wrong, 4),
            explanation: `\`bs=${bs}\` = ${bsv} bytes por bloco (sufixos: \`k\`/\`K\` = 1024, \`M\` = 1048576, \`b\` = 512; já \`kB\` = 1000 e \`MB\` = 1000000). Com \`count=${count}\` são copiados ${count} blocos = ${count * bsv} bytes${seek ? `, gravados a partir do deslocamento \`seek=${seek}\` blocos (${seek * bsv} bytes), então o fim da escrita fica em (${seek}+${count})×${bsv} = ${end}` : ''}. ${exists ? (notrunc ? `Com \`conv=notrunc\` o arquivo existente **não é truncado**: o tamanho final é o maior entre ${E} e ${end}.` : `Sem \`conv=notrunc\`, o \`dd\` **trunca** o arquivo de saída no ponto de escrita (${seek * bsv} bytes) antes de copiar: o tamanho final é ${end}.`) : ''} Tamanho final: ${final}.`,
            ref: ['101:p.273-274'],
            verify: { sh: `cd "$(mktemp -d)"\n${exists ? `truncate -s ${E} img\n` : ''}${cmd} 2>/dev/null\nstat -c %s img`, expect: String(final) },
          };
        }
        if (mode === 'records') {
          const S = rng.int(20, 300);
          const bs = rng.pick([10, 16, 32, 50, 64, 100]);
          const skip = rng.chance(0.4) ? rng.int(1, 3) : 0;
          const count = rng.chance(0.4) ? rng.int(1, 4) : 0;
          const rem = Math.max(0, S - skip * bs);
          const bytesRead = count ? Math.min(rem, count * bs) : rem;
          const full = Math.floor(bytesRead / bs); const part = bytesRead % bs ? 1 : 0;
          const fmtR = (f, p) => `${f}+${p}`;
          const correct = `${fmtR(full, part)} registros`;
          const pool = [fmtR(full + part, 0), fmtR(Math.floor(S / bs), S % bs ? 1 : 0), fmtR(part, full), fmtR(full, 1 - part), fmtR(full + 1, part), fmtR(Math.max(0, full - 1), part)].map((x) => `${x} registros`);
          const wrong = [...new Set(pool)].filter((x) => x !== correct);
          if (wrong.length < 3 || bytesRead <= 0) return null;
          const cmd = `dd if=dados.bin of=copia.bin bs=${bs}${skip ? ` skip=${skip}` : ''}${count ? ` count=${count}` : ''}`;
          return {
            type: 'unica',
            text: `O arquivo \`dados.bin\` tem **${S} bytes**. No relatório que o \`dd\` imprime (linhas \`X+Y records in\` e \`X+Y records out\`), qual valor aparece como \`X+Y\` depois de executar o comando abaixo?\n\n${block('$ ' + cmd)}`,
            options: mcq(rng, correct, wrong, 4),
            explanation: `No formato \`X+Y\`, **X** é o número de blocos *completos* e **Y** o de blocos *parciais*. Com \`bs=${bs}\`${skip ? `, \`skip=${skip}\` (pula ${skip * bs} bytes da entrada)` : ''}${count ? ` e \`count=${count}\` (no máximo ${count} blocos)` : ''}, são lidos ${bytesRead} bytes = ${full} bloco(s) de ${bs} bytes${part ? ` mais um bloco parcial de ${bytesRead % bs} bytes` : ''}. Resultado: ${fmtR(full, part)}.`,
            ref: ['101:p.273-274'],
            verify: { sh: `cd "$(mktemp -d)"\nhead -c ${S} /dev/zero > dados.bin\n${cmd} 2>&1 | head -n 1 | sed 's/ records in/ registros/'`, expect: correct },
          };
        }
        if (mode === 'slice') {
          const txt = rng.pick(['abcdefghijklmnopqrstuvwxyz', '0123456789ABCDEFGHIJ', 'LinuxProfessionalInstitute']);
          const bs = rng.pick([1, 1, 2, 3]);
          const skip = rng.int(1, 4); const count = rng.int(1, 3);
          const out = txt.slice(skip * bs, (skip + count) * bs);
          if (!out) return null;
          const pool = [txt.slice((skip - 1) * bs, (skip - 1 + count) * bs), txt.slice((skip + 1) * bs, (skip + 1 + count) * bs), txt.slice(skip, skip + count), txt.slice(0, count * bs), txt.slice(skip * bs), txt.slice(skip * bs - 1, (skip + count) * bs - 1)];
          const wrong = [...new Set(pool)].filter((x) => x && x !== out);
          if (wrong.length < 3) return null;
          const cmd = `dd bs=${bs} skip=${skip} count=${count} 2>/dev/null`;
          return {
            type: 'unica',
            text: `Qual é a saída do comando abaixo? (O \`2>/dev/null\` esconde o relatório do \`dd\`.)\n\n${block(`$ printf '${txt}' | ${cmd}`)}`,
            options: mcq(rng, out, wrong, 4),
            explanation: `Sem \`if=\`, o \`dd\` lê a entrada padrão; \`skip=${skip}\` descarta ${skip} bloco(s) de ${bs} byte(s) (${skip * bs} bytes) do início e \`count=${count}\` copia ${count} bloco(s) = ${count * bs} byte(s). Posições ${skip * bs + 1} a ${(skip + count) * bs} de "${txt}": ${out}.`,
            ref: ['101:p.273-274'],
            verify: { sh: `printf '${txt}' | ${cmd}; echo`, expect: out },
          };
        }
        const conv = rng.pick(['ucase', 'lcase']);
        const txt = rng.pick(['Linux e LPIC', 'dd copia bytes', 'Shell BASH 5']);
        const out = conv === 'ucase' ? txt.toUpperCase() : txt.toLowerCase();
        const wrong = [...new Set([conv === 'ucase' ? txt.toLowerCase() : txt.toUpperCase(), txt, [...out].reverse().join(''), out.replace(/ /g, '')])].filter((x) => x !== out);
        if (wrong.length < 3) return null;
        return {
          type: 'unica',
          text: `Qual é a saída do comando abaixo?\n\n${block(`$ echo '${txt}' | dd conv=${conv} 2>/dev/null`)}`,
          options: mcq(rng, out, wrong, 4),
          explanation: `\`conv=ucase\` converte as letras para **maiúsculas** e \`conv=lcase\` para **minúsculas** durante a cópia (o \`dd\` também serve como filtro de texto). Entrada: "${txt}" → saída: ${out}.`,
          ref: ['101:p.273-274'],
          verify: { sh: `echo '${txt}' | dd conv=${conv} 2>/dev/null`, expect: out },
        };
      });
    },
  },
);
// ------------------------------------------------------------------------------------------
// tar: escolher o comando certo (verificado por efeito) e prever o conteúdo do pacote
// ------------------------------------------------------------------------------------------
const COMP = {
  gz: { flag: 'z', ext: 'tar.gz', long: '--gzip', fileRe: '^gzip', nome: 'gzip' },
  bz2: { flag: 'j', ext: 'tar.bz2', long: '--bzip2', fileRe: '^bzip2', nome: 'bzip2' },
  xz: { flag: 'J', ext: 'tar.xz', long: '--xz', fileRe: '^XZ', nome: 'xz' },
  none: { flag: '', ext: 'tar', long: '', fileRe: 'tar archive', nome: 'sem compressão' },
};
function tarScenario(rng) {
  const ck = rng.weighted(['gz', 'bz2', 'xz', 'none'], (x) => ({ gz: 4, bz2: 3, xz: 2, none: 2 }[x]));
  const c = COMP[ck];
  const D = rng.pick(['projeto', 'site', 'docs', 'fotos', 'config']);
  const A = `${rng.pick(['backup', 'pacote', 'copia', 'arquivo'])}.${c.ext}`;
  const other = rng.pick(Object.keys(COMP).filter((k) => k !== ck && k !== 'none' || (ck === 'none' && k !== 'none')));
  return { ck, c, D, A, other: COMP[other] };
}
const tarSetup = (sc, { made = false } = {}) => [
  'cd "$(mktemp -d)"', `mkdir -p ${sc.D}/sub`, `echo um > ${sc.D}/arq1.txt`, `echo dois > ${sc.D}/arq2.txt`, `echo tres > ${sc.D}/sub/arq3.txt`,
  ...(made ? [`tar -c${sc.c.flag}f ${sc.A} ${sc.D}`, `rm -r ${sc.D}`] : []),
].join('\n');

generators.push(
  // -------------------------------------------------------------------------------------------
  {
    id: 'fs-tar-cmd', obj: '103.3', nivel: 3, peso: 4,
    make(rng) {
      return retry(() => {
        const sc = tarScenario(rng);
        const { c, D, A, other } = sc;
        const goal = rng.weighted(['create', 'list', 'extractTo', 'extractOne'], (x) => ({ create: 4, list: 2, extractTo: 3, extractOne: 2 }[x]));
        const f = c.flag; const wf = other.flag;
        const dest = rng.pick(['restaurar', 'destino', 'recuperado']);
        let text; let oks; let bads; let check; let made = true; let why;
        if (goal === 'create') {
          made = false;
          text = `Qual comando cria o pacote \`${A}\` com o conteúdo do diretório \`${D}\`${c.nome === 'sem compressão' ? ' (sem compactar)' : `, compactado com ${c.nome}`}?`;
          oks = [`tar -c${f}vf ${A} ${D}`, `tar -c${f}f ${A} ${D}`, `tar c${f}f ${A} ${D}`, c.long ? `tar --create ${c.long} --file=${A} ${D}` : `tar --create --file=${A} ${D}`];
          bads = [`tar -c${wf}f ${A} ${D}`, `tar -cf${f || 'v'} ${A} ${D}`, `tar -x${f}f ${A} ${D}`, `tar -c${f}f ${D} ${A}`, `tar -c${f} ${A} ${D}`, `tar -t${f}f ${A} ${D}`, `tar -c${f}vf ${D}`];
          check = `[ -f ${A} ] && tar -tf ${A} >/dev/null 2>&1 && file -b ${A} | grep -qi ${sq(c.fileRe)} && tar -tf ${A} | grep -q '^${D}/'`;
          why = 'o `-c` cria; o `-f` precisa vir **imediatamente antes** do nome do pacote (é ele que consome o argumento seguinte — por isso `-cfz pacote` falha: o `f` pegaria o `z` como nome do arquivo); a letra de compressão escolhe o algoritmo (`z` = gzip → .tar.gz/.tgz, `j` = bzip2 → .tar.bz2, `J` = xz → .tar.xz); e a ordem é "pacote primeiro, origem depois"';
        } else if (goal === 'list') {
          text = `O pacote \`${A}\` (${c.nome === 'sem compressão' ? 'sem compressão' : 'compactado com ' + c.nome}) já existe. Qual comando **lista o conteúdo sem extrair** nada?`;
          oks = [`tar -t${f}f ${A}`, `tar -t${f}vf ${A}`, `tar --list --file=${A}`, `tar -tf ${A}`];
          bads = [`tar -x${f}f ${A}`, `tar -x${f}vf ${A}`, `tar -t${f} ${A}`, `tar -t${wf}f ${A}`, `tar -c${f}f ${A}`];
          why = '`-t` (*list*) lista; `-x` extrairia os arquivos; o `-f` precisa do nome do pacote logo em seguida. (O GNU tar reconhece sozinho a compressão ao listar/extrair, por isso `tar -tf` também funciona; já uma letra de compressão **errada**, como `-j` para um .gz, causa erro)';
        } else if (goal === 'extractTo') {
          text = `Qual comando extrai o conteúdo de \`${A}\` para o diretório \`${dest}\` (que já existe)?`;
          oks = [`tar -x${f}f ${A} -C ${dest}`, `tar -C ${dest} -x${f}f ${A}`, `tar -x${f}vf ${A} -C ${dest}`, `tar --extract${c.long ? ' ' + c.long : ''} --file=${A} --directory=${dest}`];
          bads = [`tar -x${f}f ${A} ${dest}`, `tar -x${f}f ${dest} -C ${A}`, `tar -t${f}f ${A} -C ${dest}`, `tar -x${wf}f ${A} -C ${dest}`, `tar -c${f}f ${A} -C ${dest}`];
          check = `[ -f ${dest}/${D}/arq1.txt ] && [ ! -e ${D} ]`;
          why = '`-C DIR` (ou `--directory=DIR`) manda o `tar` entrar em DIR antes de extrair; sem ele, os arquivos vão para o diretório atual. Um nome de diretório solto no fim da linha seria tomado como **membro do pacote** a extrair';
        } else {
          text = `Do pacote \`${A}\`, qual comando extrai **somente** o arquivo \`${D}/arq1.txt\` para o diretório atual?`;
          oks = [`tar -x${f}f ${A} ${D}/arq1.txt`, `tar -x${f}vf ${A} ${D}/arq1.txt`, `tar --extract --file=${A} ${D}/arq1.txt`];
          bads = [`tar -x${f}f ${A} arq1.txt`, `tar -x${f}f ${D}/arq1.txt ${A}`, `tar -t${f}f ${A} ${D}/arq1.txt`, `tar -x${wf}f ${A} ${D}/arq1.txt`, `tar -x${f} ${A} ${D}/arq1.txt`];
          check = `[ -f ${D}/arq1.txt ] && [ ! -e ${D}/arq2.txt ]`;
          why = 'depois do nome do pacote, os argumentos de `-x` são os **nomes dos membros**, exatamente como aparecem em `tar -tf` (aqui com o diretório: `' + D + '/arq1.txt`); sem eles o pacote inteiro seria extraído';
        }
        const ok = rng.pick(oks);
        const badPick = rng.sample([...new Set(bads)].filter((b) => b !== ok), 3);
        if (badPick.length < 3) return null;
        const options = [{ t: ok, ok: true }, ...badPick.map((t) => ({ t, ok: false }))];
        const probe = (cmd) => {
          const lines = [tarSetup(sc, { made })];
          if (goal === 'extractTo') lines.push(`mkdir -p ${dest}`);
          if (goal === 'list') lines.push(`out=$({ ${cmd}; } 2>/dev/null </dev/null)`, `echo "$out" | grep -q '${D}/' && [ ! -e ${D} ] && echo S || echo N`);
          else lines.push(`( ${cmd} ) >/dev/null 2>&1 </dev/null`, `( ${check} ) && echo S || echo N`);
          return lines.join('\n');
        };
        return {
          type: 'unica',
          text,
          options,
          explanation: `${why[0].toUpperCase()}${why.slice(1)}. Certo: \`${ok}\`. Os outros falham por algum detalhe: ${badPick.map((b) => '`' + b + '`').join('; ')}.`,
          ref: ['101:p.269-272'],
          verify: { sh: options.map((o) => `(\n${probe(o.t)}\n)`).join('\n'), expect: options.map((o) => (o.ok ? 'S' : 'N')).join('\n') },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'fs-tar-list', obj: '103.3', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const P = rng.pick(['proj', 'site', 'dados', 'app']);
        const SUB = rng.pick(['sub', 'lib', 'cfg']);
        const f1 = rng.pick(['a.txt', 'leia.txt', 'x.txt']); const f2 = rng.pick(['b.log', 'erro.log', 'y.log']);
        const f3 = rng.pick(['c.txt', 'z.txt', 'm.txt']); const f4 = rng.pick(['d.log', 'w.log', 'k.log']);
        const tree = [`${P}/`, `${P}/${f1}`, `${P}/${f2}`, `${P}/${SUB}/`, `${P}/${SUB}/${f3}`, `${P}/${SUB}/${f4}`];
        const strip = (arr, pref) => arr.filter((e) => e.startsWith(pref)).map((e) => e.slice(pref.length - (pref.endsWith('/') ? 0 : 0)));
        const under = (dir) => tree.filter((e) => e === `${dir}/` || e.startsWith(`${dir}/`));
        const withDot = (dir) => tree.filter((e) => e.startsWith(`${dir}/`) && e !== `${dir}/`).map((e) => './' + e.slice(dir.length + 1)).map((e) => (e === './' ? e : e));
        const forms = [
          { cmd: `tar -cf x.tar ${P}`, list: tree, why: 'o diretório e tudo dentro dele, com o caminho como foi informado (diretórios aparecem com `/` no fim)' },
          { cmd: `tar -cf x.tar ${P}/${SUB}`, list: under(`${P}/${SUB}`), why: 'só o subdiretório, mantendo o prefixo do caminho informado' },
          { cmd: `tar -cf x.tar -C ${P} .`, list: ['./', ...withDot(P)], why: '`-C ' + P + '` entra no diretório antes de empacotar e `.` é a origem: os nomes começam com `./`' },
          { cmd: `tar -cf x.tar -C ${P} ${SUB}`, list: under(`${P}/${SUB}`).map((e) => e.slice(P.length + 1)), why: '`-C ' + P + '` muda de diretório, então o prefixo `' + P + '/` não aparece no pacote' },
          { cmd: `tar -cf x.tar --exclude='*.log' ${P}`, list: tree.filter((e) => !e.endsWith('.log')), why: '`--exclude=\'*.log\'` (entre aspas, para o shell não expandir) deixa de fora tudo o que casa com o padrão; as pastas continuam' },
          { cmd: `tar -cf x.tar ${P}/${f1} ${P}/${SUB}/${f3}`, list: [`${P}/${f1}`, `${P}/${SUB}/${f3}`], why: 'só os arquivos citados entram; os diretórios pai **não** são adicionados sozinhos' },
          { cmd: `tar -cf x.tar ${P}/*.txt`, list: [`${P}/${f1}`], why: 'o shell expande `' + P + '/*.txt` **antes** do tar: só os `.txt` do primeiro nível casam (o do subdiretório não)' },
          { cmd: `tar -cf x.tar --exclude=${SUB} ${P}`, list: tree.filter((e) => !e.startsWith(`${P}/${SUB}`)), why: '`--exclude=' + SUB + '` ignora o diretório `' + SUB + '` e tudo o que há nele' },
        ].filter((x, i, a) => a.findIndex((y) => y.list.join() === x.list.join()) === i);
        const fm = rng.pick(forms);
        const norm = (a) => [...a].sort().join(' ');
        const correct = norm(fm.list);
        const wrong = [...new Set(forms.filter((x) => x !== fm).map((x) => norm(x.list)))].filter((x) => x !== correct);
        wrong.push(norm(fm.list.filter((e) => !e.endsWith('/'))), norm(fm.list.map((e) => e.replace(/\/$/, ''))));
        const wr = [...new Set(wrong)].filter((x) => x !== correct && x.trim());
        if (wr.length < 3 || fm.list.length < 2) return null;
        const setup = `cd "$(mktemp -d)"\nmkdir -p ${P}/${SUB}\ntouch ${P}/${f1} ${P}/${f2} ${P}/${SUB}/${f3} ${P}/${SUB}/${f4}`;
        return {
          type: 'unica',
          text: `Existe a árvore abaixo (as entradas terminadas em \`/\` são diretórios):\n\n${block(tree.join('\n'))}\n\nDepois de executar \`${fm.cmd}\` no diretório que contém \`${P}\`, quais entradas \`tar -tf x.tar\` mostra? (A ordem de listagem varia; aqui elas aparecem em ordem alfabética, separadas por espaço.)`,
          options: mcq(rng, correct, wr, 4),
          explanation: `${fm.why[0].toUpperCase()}${fm.why.slice(1)}. Entradas: ${correct}.`,
          ref: ['101:p.269-272'],
          verify: { sh: `${setup}\n${fm.cmd}\ntar -tf x.tar | sort | paste -s -d' ' -`, expect: correct },
        };
      });
    },
  },
);
// ------------------------------------------------------------------------------------------
// cp / mv / rm / mkdir / rmdir: simulador de árvore de arquivos
// ------------------------------------------------------------------------------------------
class Tree {
  constructor(entries = []) { this.m = new Map(entries.map((e) => [e.replace(/\/$/, ''), e.endsWith('/') ? 'd' : 'f'])); }
  clone() { const t = new Tree(); t.m = new Map(this.m); return t; }
  has(p) { return this.m.has(p); }
  isDir(p) { return this.m.get(p) === 'd'; }
  kids(dir) { return [...this.m.keys()].filter((p) => (dir === '' ? !p.includes('/') : p.startsWith(dir + '/') && !p.slice(dir.length + 1).includes('/'))); }
  sub(p) { return [...this.m.keys()].filter((k) => k === p || k.startsWith(p + '/')); }
  parentOk(p) { const i = p.lastIndexOf('/'); return i < 0 || this.isDir(p.slice(0, i)); }
  expand(arg) {
    if (!/[*?[]/.test(arg)) return [arg];
    const i = arg.lastIndexOf('/');
    const dir = i < 0 ? '' : arg.slice(0, i); const pat = arg.slice(i + 1);
    const hit = this.kids(dir).filter((k) => shellGlob(pat, k.slice(dir ? dir.length + 1 : 0))).sort();
    return hit.length ? hit : [arg];
  }
  copyTo(src, dst) { for (const p of this.sub(src)) this.m.set(dst + p.slice(src.length), this.m.get(p)); }
  list() { return [...this.m.keys()].sort().map((p) => './' + p); }
}
/** executa um comando simples (cp/mv/rm/rmdir/mkdir) sobre a árvore; erros não alteram nada */
function runCmd(tree, cmd) {
  const t = tree.clone();
  const words = cmd.split(/\s+/);
  const name = words[0];
  const flags = words.filter((w, i) => i > 0 && w.startsWith('-')).join('');
  const args = words.slice(1).filter((w) => !w.startsWith('-')).map((w) => w.replace(/\/$/, '')).flatMap((w) => t.expand(w));
  const baseOf = (p) => p.split('/').pop();
  if (name === 'mkdir') {
    for (const a of args) {
      if (/p/.test(flags)) { const parts = a.split('/'); for (let i = 1; i <= parts.length; i++) { const p = parts.slice(0, i).join('/'); if (!t.has(p)) t.m.set(p, 'd'); } } else if (!t.has(a) && t.parentOk(a)) t.m.set(a, 'd');
    }
  } else if (name === 'rmdir') {
    for (const a of args) if (t.isDir(a) && t.kids(a).length === 0) t.m.delete(a);
  } else if (name === 'rm') {
    for (const a of args) {
      if (!t.has(a)) continue;
      if (t.isDir(a)) { if (/r|R/.test(flags)) for (const p of t.sub(a)) t.m.delete(p); } else t.m.delete(a);
    }
  } else if (name === 'cp' || name === 'mv') {
    const dst = args[args.length - 1]; const srcs = args.slice(0, -1);
    const recursive = /r|R|a/.test(flags);
    for (const raw of srcs) {
      let src = raw; let dot = false;
      if (src.endsWith('/.')) { src = src.slice(0, -2); dot = true; }
      if (!t.has(src)) continue;
      const dstIsDir = t.isDir(dst);
      if (t.isDir(src)) {
        if (name === 'cp' && !recursive) continue; // "omitting directory"
        if (name === 'mv' && t.has(dst) && !dstIsDir) continue;
        const target = dot ? dst : dstIsDir ? `${dst}/${baseOf(src)}` : dst;
        if (!dstIsDir && !t.parentOk(dst)) continue;
        if (target === src || target.startsWith(src + '/')) continue;
        if (dot) { for (const p of t.sub(src)) if (p !== src) t.m.set(dst + p.slice(src.length), t.m.get(p)); if (!t.has(dst)) t.m.set(dst, 'd'); } else t.copyTo(src, target);
        if (name === 'mv') for (const p of t.sub(src)) t.m.delete(p);
      } else {
        const target = dstIsDir ? `${dst}/${baseOf(src)}` : dst;
        if (!dstIsDir && !t.parentOk(dst)) continue;
        if (target === src) continue;
        t.m.set(target, 'f');
        if (name === 'mv') t.m.delete(src);
      }
    }
  }
  return t;
}

const TREES = [
  (n) => ({ entries: [`${n.p}/`, `${n.p}/a.txt`, `${n.p}/b.txt`, `${n.p}/sub/`, `${n.p}/sub/c.txt`, `${n.d}/`, 'notas.txt'] }),
  (n) => ({ entries: [`${n.p}/`, `${n.p}/x.conf`, `${n.p}/y.conf`, `${n.p}/lib/`, `${n.p}/lib/z.so`, `${n.d}/`, `${n.d}/velho.conf`, 'leia.txt'] }),
  (n) => ({ entries: [`${n.p}/`, `${n.p}/r1.txt`, `${n.p}/img/`, `${n.p}/img/f.png`, `${n.d}/`, 'notas.txt', 'extra.txt'] }),
];

generators.push(
  // -------------------------------------------------------------------------------------------
  {
    id: 'fs-cp-mv-rm', obj: '103.3', nivel: 3, peso: 4,
    make(rng) {
      return retry(() => {
        const n = { p: rng.pick(['proj', 'src', 'docs', 'app']), d: rng.pick(['dest', 'bak', 'saida', 'copia']) };
        const tpl = rng.pick(TREES)(n);
        const T0 = new Tree(tpl.entries);
        const top = tpl.entries.filter((e) => !e.includes('/', 0) || e.endsWith('/') && e.indexOf('/') === e.length - 1);
        const files = tpl.entries.filter((e) => !e.endsWith('/') && !e.includes('/'));
        const f0 = files[0];
        const P = n.p; const Dd = n.d;
        const novo = rng.pick(['novo', 'outro', 'copia2']);
        const pool = [
          `cp -r ${P} ${Dd}`, `cp -r ${P} ${novo}`, `cp ${P}/* ${Dd}`, `cp -r ${P}/* ${Dd}`, `cp -r ${P}/. ${Dd}`, `cp ${P} ${Dd}`,
          `mv ${P} ${Dd}`, `mv ${P} ${novo}`, `mv ${f0} ${Dd}`, `mv ${f0} ${Dd}/`, `mv ${f0} ${novo}.txt`, `cp ${f0} ${Dd}`, `cp ${f0} ${novo}.txt`,
          `rm -r ${P}`, `rm ${P}`, `rm ${P}/*`, `rm -r ${P}/*`, `rmdir ${P}`, `rmdir ${Dd}`, `mkdir -p ${novo}/a/b`, `mkdir ${novo}/a/b`, `mkdir ${novo}`, `rm ${f0}`,
        ];
        const cmd = rng.pick(pool);
        const T1 = runCmd(T0, cmd);
        const show = (t) => t.list().join(' ');
        const correct = show(T1);
        if (correct === show(T0)) return null; // comando que falha: tudo bem, mas só às vezes
        const wrong = [...new Set(pool.filter((c) => c !== cmd).map((c) => show(runCmd(T0, c))))].filter((x) => x !== correct);
        if (show(T1) === show(T0) && wrong.length < 3) return null;
        wrong.push(show(T0));
        const uniqWrong = [...new Set(wrong)].filter((x) => x !== correct);
        if (uniqWrong.length < 3) return null;
        const initial = T0.list().map((p) => (T0.isDir(p.slice(2)) ? p + '/' : p)).join('\n');
        const setup = ['cd "$(mktemp -d)"', ...tpl.entries.map((e) => (e.endsWith('/') ? `mkdir -p ${e}` : `touch ${e}`))].join('\n');
        const expl = {
          cp: '`cp` copia; para **diretórios** exige `-r` (sem ele: "omitting directory" e nada é copiado)',
          mv: '`mv` move/renomeia (diretórios não precisam de `-r`)',
          rm: '`rm` só apaga diretórios com `-r`; `rmdir` só remove diretórios **vazios**',
          mkdir: '`mkdir` falha se o diretório-pai não existe, a menos que se use `-p`',
        }[cmd.split(' ')[0]] ?? '';
        const extra = /^cp -r \S+ \S+$/.test(cmd) ? (T0.isDir(cmd.split(' ')[3]) ? ' Como o destino **já existe e é um diretório**, a cópia vai para **dentro** dele (`destino/origem`); se ele não existisse, o destino passaria a ser a cópia.' : ' Como o destino **não existe**, ele é criado como cópia da origem.')
          : /^mv \S+ \S+$/.test(cmd) ? ' Se o destino é um diretório existente, o `mv` põe a origem **dentro** dele; se não existe, apenas **renomeia**.'
            : /\/\*/.test(cmd) ? ' O `*` casa o conteúdo do diretório (sem arquivos ocultos); `cp` sem `-r` pula os subdiretórios, enquanto `rm` sem `-r` se recusa a apagá-los.'
              : /\/\.\s/.test(cmd + ' ') ? ' A origem `dir/.` copia o **conteúdo** do diretório (inclusive ocultos), não o diretório em si.' : '';
        return {
          type: 'unica',
          text: `O diretório de trabalho contém (as entradas terminadas em \`/\` são diretórios):\n\n${block(initial)}\n\nDepois de executar \`${cmd}\`, o que \`find . -mindepth 1 | sort\` mostra? (aqui, separado por espaço; as mensagens de erro, se houver, vão para a tela e não alteram a lista)`,
          options: mcq(rng, correct, uniqWrong, 4),
          explanation: `${expl[0].toUpperCase()}${expl.slice(1)}.${extra} Resultado: ${correct}.`,
          ref: ['101:p.243-252'],
          verify: { sh: `${setup}\n${cmd} 2>/dev/null\nfind . -mindepth 1 | sort | paste -s -d' ' -`, expect: correct },
        };
      });
    },
  },
);

// ------------------------------------------------------------------------------------------
// ls: ordenação, marcadores e tamanhos legíveis; touch: datas; compactadores; cpio; find -exec
// ------------------------------------------------------------------------------------------
function humanSize(s, base1 = 1024) {
  if (s < base1) return String(s);
  const units = base1 === 1024 ? ['K', 'M', 'G', 'T'] : ['k', 'M', 'G', 'T'];
  let v = s; let u = -1;
  while (v >= base1 && u < units.length - 1) { v /= base1; u++; }
  const r = v < 10 ? Math.ceil(v * 10 - 1e-9) / 10 : Math.ceil(v - 1e-9);
  return (v < 10 ? r.toFixed(1) : String(r)) + units[u];
}

generators.push(
  // -------------------------------------------------------------------------------------------
  {
    id: 'fs-ls-order', obj: '103.3', nivel: 2, peso: 3,
    make(rng) {
      return retry(() => {
        const base = rng.sample(['relat', 'notas', 'dados', 'foto', 'script', 'manual', 'tabela', 'cadastro'], 5);
        const exts = rng.sample(['txt', 'csv', 'sh', 'jpg', 'pdf', 'md', 'log'], 5);
        const files = base.map((b, i) => ({ name: `${b}.${exts[i]}`, size: 0, age: 0, kind: 'f' }));
        const sizes = rng.sample([120, 900, 2048, 5000, 12000, 40000, 100000], 5);
        const ages = rng.sample([30, 90, 300, 1000, 3000, 8000, 20000], 5);
        files.forEach((f, i) => { f.size = sizes[i]; f.age = ages[i]; });
        files.push({ name: rng.pick(['arquivos', 'pasta', 'tmp']), size: 4096, age: rng.pick([200, 2000, 6000]), kind: 'd' });
        const exe = rng.int(0, 4);
        files[exe].exec = true;
        files.push({ name: '.' + rng.pick(['config', 'cache', 'rc']), size: 300, age: 700, kind: 'f', hidden: true });
        const vis = files.filter((f) => !f.hidden);
        const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
        const ext = (n) => (n.includes('.') ? n.slice(n.lastIndexOf('.') + 1) : '');
        const ords = {
          '': (L) => [...L].sort(byName),
          '-r': (L) => [...L].sort(byName).reverse(),
          '-t': (L) => [...L].sort((a, b) => a.age - b.age || byName(a, b)),
          '-tr': (L) => [...L].sort((a, b) => b.age - a.age || byName(b, a)),
          '-S': (L) => [...L].sort((a, b) => b.size - a.size || byName(a, b)),
          '-Sr': (L) => [...L].sort((a, b) => a.size - b.size || byName(b, a)),
          '-X': (L) => [...L].sort((a, b) => (ext(a.name) < ext(b.name) ? -1 : ext(a.name) > ext(b.name) ? 1 : byName(a, b))),
        };
        const flag = rng.weighted(['', '-r', '-t', '-tr', '-S', '-Sr', '-X', '-a', '-A', '-F', '-d */'], (x) => ({ '': 1, '-r': 1, '-t': 3, '-tr': 2, '-S': 3, '-Sr': 1, '-X': 2, '-a': 2, '-A': 1, '-F': 2, '-d */': 1 }[x]));
        const mark = (f) => f.name + (f.kind === 'd' ? '/' : f.exec ? '*' : '');
        let out; let why;
        if (flag === '-a') { out = ['.', '..', ...[...files].sort(byName).map((f) => f.name)]; why = '`-a` inclui os arquivos ocultos (que começam com ponto), inclusive `.` e `..`'; } else if (flag === '-A') { out = [...files].sort(byName).map((f) => f.name); why = '`-A` mostra os ocultos mas omite `.` e `..`'; } else if (flag === '-F') { out = [...vis].sort(byName).map(mark); why = '`-F` acrescenta um indicador: `/` para diretórios, `*` para executáveis'; } else if (flag === '-d */') { out = vis.filter((f) => f.kind === 'd').map((f) => f.name + '/'); why = '`*/` é um glob que casa só diretórios; `-d` impede o `ls` de listar o **conteúdo** deles'; } else {
          out = ords[flag](vis).map((f) => f.name);
          why = { '': 'a ordem padrão é alfabética (bytes, na localidade C)', '-r': '`-r` inverte a ordem', '-t': '`-t` ordena pela data de modificação, do **mais novo** para o mais antigo', '-tr': '`-t` ordena por data e `-r` inverte: do mais antigo para o mais novo', '-S': '`-S` ordena pelo tamanho, do maior para o menor', '-Sr': '`-S` ordena por tamanho e `-r` inverte: do menor para o maior', '-X': '`-X` ordena alfabeticamente pela **extensão** do nome (desempate pelo nome)' }[flag];
        }
        const key = (a) => a.join(' ');
        const correct = key(out);
        const alts = [];
        const fl = Object.keys(ords);
        for (const o of fl) if (o !== flag) alts.push(key(ords[o](vis).map((f) => f.name)));
        alts.push(key([...vis].sort(byName).map(mark)), key([...files].sort(byName).map((f) => f.name)), key(['.', '..', ...[...files].sort(byName).map((f) => f.name)]), key(vis.filter((f) => f.kind === 'd').map((f) => f.name)));
        const wrong = [...new Set(alts)].filter((x) => x !== correct && x.trim());
        if (wrong.length < 3) return null;
        const table = [...files].sort(byName).map((f) => `${(f.kind === 'd' ? 'd' : '-') + (f.exec ? 'rwxr-xr-x' : 'rw-r--r--')} ${String(f.size).padStart(6)}  há ${fmtAge(f.age).padEnd(9)} ${f.name}`).join('\n');
        const setup = ['cd "$(mktemp -d)"', ...files.map((f) => (f.kind === 'd' ? `mkdir ${sq(f.name)}; touch -d "${f.age} minutes ago" ${sq(f.name)}` : `truncate -s ${f.size} ${sq(f.name)}; ${f.exec ? 'chmod 755' : 'chmod 644'} ${sq(f.name)}; touch -d "${f.age} minutes ago" ${sq(f.name)}`))].join('\n');
        return {
          type: 'unica',
          text: `O diretório atual contém (incluindo um arquivo oculto e um diretório; \`ls\` ordena em ordem de bytes, como na localidade C):\n\n${block(table)}\n\nQue nomes \`ls ${flag}\` mostra, na ordem? (um por linha; aqui separados por espaço)`,
          options: mcq(rng, correct, wrong, 4),
          explanation: `${why[0].toUpperCase()}${why.slice(1)}. Saída: ${correct}.`,
          ref: ['101:p.243-244', '101:p.250'],
          verify: { sh: `${setup}\nls ${flag} | paste -s -d' ' -`, expect: correct },
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  {
    id: 'fs-ls-human', obj: '103.3', nivel: 3, peso: 2,
    make(rng) {
      return retry(() => {
        const S = rng.pick([1536, 2000, 5000, 10300, 20480, 1000000, 1500000, 5000000, 7340032, 123456789, 2147483648, 3300000, 450, 9000]);
        const si = rng.chance(0.3);
        const flag = si ? '--si' : '-h';
        const correct = humanSize(S, si ? 1000 : 1024);
        const wrong = [humanSize(S, si ? 1024 : 1000), Math.floor(S / (si ? 1000 : 1024) * 10) / 10 + (S < 1000 ? '' : (si ? 'k' : 'K')), humanSize(Math.round(S / 1024) * 1024 / 1.0, 1024), String(S), humanSize(S * 1000, 1024), humanSize(S / 1000, 1024)]
          .map((x) => String(x)).filter((x) => x !== correct && x !== 'NaN' && x.trim() && !x.startsWith('0'));
        const wr = [...new Set(wrong)];
        if (wr.length < 3 || S < 1024 && !si) return null;
        const ex = `${(S / (si ? 1000 : 1024) ** Math.floor(Math.log(S) / Math.log(si ? 1000 : 1024))).toFixed(3)}`;
        return {
          type: 'unica',
          text: `O arquivo \`dados.bin\` tem exatamente **${S} bytes**. Que tamanho aparece na coluna correspondente da saída de \`ls -l ${flag} dados.bin\` (o último arquivo é maior que o menor valor possível, então o resultado é arredondado como o \`ls\` faz)?`,
          options: mcq(rng, correct, wr, 4),
          explanation: `\`-h\` (\`--human-readable\`) usa potências de **1024** (K, M, G), enquanto \`--si\` usa potências de **1000** (k, M, G). O \`ls\` arredonda **para cima**: com uma casa decimal quando o valor é menor que 10, e para um inteiro quando é maior. Aqui ${S} ÷ ${si ? 1000 : 1024}^n ≈ ${ex} → \`${correct}\`.`,
          ref: ['101:p.244'],
          verify: { sh: `cd "$(mktemp -d)"\ntruncate -s ${S} dados.bin\nls -l ${flag} dados.bin | tr -s ' ' | cut -d' ' -f5`, expect: correct },
        };
      });
    },
  },
);
