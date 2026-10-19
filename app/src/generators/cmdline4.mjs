// 103.4 — fluxos, pipes e redirecionamentos: tabela de descritores, noclobber, tee, xargs,
// substituição de comando e here document/here string. Todos os gabaritos vêm de um modelo em JS
// conferido contra o bash/GNU reais via `verify`.
import { mcq, multi, code, block } from './util.mjs';

const sq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

/** Repete `fn` até devolver algo verdadeiro (distratores insuficientes etc.). */
function retry(fn, tries = 80) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try { const r = fn(i); if (r) return r; } catch (e) { last = e; }
  }
  throw last ?? new Error('retry esgotado');
}

// ---------------------------------------------------------------------------------------------
// Modelo da tabela de descritores (fd 1 = stdout, fd 2 = stderr) para redirecionamentos de saída.
// ---------------------------------------------------------------------------------------------
const rd = {
  out: (file, fd) => ({ op: '>', fd, file }),
  app: (file, fd) => ({ op: '>>', fd, file }),
  dup: (fd, to) => ({ op: 'dup', fd, to }),
  both: (file) => ({ op: '&>', file }),
  bothApp: (file) => ({ op: '&>>', file }),
};

function renderRedirs(rs, { spaced = false, explicit = false } = {}) {
  const sp = spaced ? ' ' : '';
  return rs.map((r) => {
    const f = r.fd ?? (explicit ? 1 : '');
    switch (r.op) {
      case '>': return `${f}>${sp}${r.file}`;
      case '>>': return `${f}>>${sp}${r.file}`;
      case 'dup': return `${r.fd === 1 && !explicit ? '' : r.fd}>&${r.to}`;
      case '&>': return `&>${sp}${r.file}`;
      case '&>>': return `&>>${sp}${r.file}`;
      default: throw new Error('op?');
    }
  }).join(' ');
}

/** Executa o modelo: devolve as entradas (tela, arquivos na ordem em que foram abertos) e a rota de cada fluxo. */
function simulate(rs, sc, opt = {}) {
  const NULL = { t: 'null' }; const TELA = { t: 'tela' }; const PIPE = { t: 'pipe' };
  const fds = { 1: opt.pipe ? PIPE : TELA, 2: opt.pipeErr ? PIPE : TELA };
  const dests = new Map();
  dests.set('tela', { old: false, out: false, err: false });
  const open = (file, append) => {
    if (file === '/dev/null') return NULL;
    let d = dests.get(file);
    if (!d) { d = { old: sc.pre.has(file), out: false, err: false }; dests.set(file, d); }
    if (!append) { d.old = false; d.out = false; d.err = false; }
    return { t: 'file', file };
  };
  for (const r of rs) {
    if (r.op === '>') fds[r.fd ?? 1] = open(r.file, false);
    else if (r.op === '>>') fds[r.fd ?? 1] = open(r.file, true);
    else if (r.op === 'dup') fds[r.fd] = fds[r.to];
    else if (r.op === '&>') { const o = open(r.file, false); fds[1] = o; fds[2] = o; }
    else if (r.op === '&>>') { const o = open(r.file, true); fds[1] = o; fds[2] = o; }
  }
  let pipeLines = 0;
  const route = {};
  for (const [fd, kind] of [[1, 'out'], [2, 'err']]) {
    const t = fds[fd];
    route[kind] = t.t === 'file' ? t.file : t.t;
    if (t.t === 'tela') dests.get('tela')[kind] = true;
    else if (t.t === 'file') dests.get(t.file)[kind] = true;
    else if (t.t === 'pipe') pipeLines++;
  }
  const entries = [...dests].map(([name, d]) => ({ name, tokens: [d.old && 'antigo', d.out && 'stdout', d.err && 'stderr'].filter(Boolean) }))
    .sort((a, b) => (a.name === 'tela' ? -1 : b.name === 'tela' ? 1 : a.name < b.name ? -1 : 1));
  return { entries, route, pipeLines: opt.pipe || opt.pipeErr ? pipeLines : null, fds };
}

const clsText = (e) => `${e.name}: ${e.tokens.join(' ') || 'vazio'}`;
const outcomeKey = (sim) => sim.entries.map(clsText).join('|') + (sim.pipeLines === null ? '' : `|wc:${sim.pipeLines}`);

/** Descrição em português de um desfecho. */
function outcomeText(sim) {
  const w = { antigo: 'conteúdo antigo', stdout: 'stdout', stderr: 'stderr' };
  const parts = sim.entries.map((e) => {
    const nm = e.name === 'tela' ? 'tela' : e.name;
    return `${nm}: ${e.tokens.length ? e.tokens.map((t) => w[t]).join(' + ') : 'nada'}`;
  });
  if (sim.pipeLines !== null) parts.push(`o wc -l conta ${sim.pipeLines} linha${sim.pipeLines === 1 ? '' : 's'}`);
  return parts.join('; ');
}

/** Script de verificação: executa o comando de verdade e imprime a classificação de cada destino. */
function shellProbe(sc, redirText, entries, opt = {}) {
  const lines = ['cd "$(mktemp -d)"'];
  if (sc.cmd.kind === 'ls') lines.push(`touch ${sc.ok}`);
  else lines.push(`echo alfa > ${sc.ok}`);
  for (const f of sc.pre) lines.push(`echo velho > ${f}`);
  lines.push('cls() { r=""; [ -f "$1" ] || return 0; grep -q velho "$1" && r="$r antigo"; ' +
    `grep -q ${sq(sc.cmd.kind === 'ls' ? '^' + sc.ok + '$' : 'alfa')} "$1" && r="$r stdout"; grep -q 'No such file' "$1" && r="$r stderr"; echo "$2:\${r:- vazio}"; }`);
  const base = `${sc.cmd.text} ${redirText}`.trim();
  if (opt.pipe) lines.push(`{ N=$(${base} ${opt.pipeOp ?? '|'} wc -l); echo "N=$N"; } > .t 2>&1`);
  else lines.push(`{ ${base}; } > .t 2>&1`);
  for (const e of entries) lines.push(e.name === 'tela' ? 'cls .t tela' : `cls ${e.name} ${e.name}`);
  if (opt.pipe) lines.push(`echo "wc:$(grep -o '^N=[0-9]*' .t | cut -d= -f2)"`);
  return lines.join('\n');
}

/** Constrói a expectativa textual do probe a partir do modelo. */
function probeExpect(sim) {
  const l = sim.entries.map(clsText);
  if (sim.pipeLines !== null) l.push(`wc:${sim.pipeLines}`);
  return l.join('\n');
}

const OKS = ['notas.txt', 'dados.csv', 'lista.txt', 'relatorio.txt', 'agenda.txt', 'clientes.csv'];
const MISSING = ['falta.txt', 'ausente.txt', 'nada.csv', 'inexistente.txt', 'perdido.txt'];
const LOGS = ['log.txt', 'saida.txt', 'resultado.log', 'out.txt', 'registro.log'];
const LOGS2 = ['erros.txt', 'err.log', 'falhas.txt', 'problemas.log'];

function mkScenario(rng) {
  const ok = rng.pick(OKS); const miss = rng.pick(MISSING);
  const kind = rng.pick(['ls', 'ls', 'cat']);
  const L = rng.pick(LOGS); const M = rng.pick(LOGS2);
  return { ok, miss, L, M, cmd: kind === 'ls' ? { kind, text: `ls ${ok} ${miss}` } : { kind, text: `cat ${ok} ${miss}` }, pre: new Set() };
}

/** Catálogo de padrões de redirecionamento sobre os arquivos L e M. */
function catalog(L, M) {
  return [
    { id: 'o', rs: [rd.out(L)] },
    { id: 'e', rs: [rd.out(L, 2)] },
    { id: 'oe', rs: [rd.out(L), rd.dup(2, 1)] },
    { id: 'eo', rs: [rd.dup(2, 1), rd.out(L)] },
    { id: 'both', rs: [rd.both(L)] },
    { id: 'o-e', rs: [rd.out(L), rd.out(M, 2)] },
    { id: 'e-o', rs: [rd.out(M, 2), rd.out(L)] },
    { id: 'app', rs: [rd.app(L)] },
    { id: 'eapp', rs: [rd.app(L, 2)] },
    { id: 'app-e', rs: [rd.app(L), rd.dup(2, 1)] },
    { id: 'bothapp', rs: [rd.bothApp(L)] },
    { id: 'o-null-e', rs: [rd.out(L), rd.out('/dev/null', 2)] },
    { id: 'null-e', rs: [rd.out('/dev/null', 2)] },
    { id: 'null-all', rs: [rd.out('/dev/null'), rd.dup(2, 1)] },
    { id: 'null-eo', rs: [rd.dup(2, 1), rd.out('/dev/null')] },
    { id: 'e-only', rs: [rd.out(L, 2), rd.out('/dev/null')] },
    { id: 'o-to-e', rs: [rd.dup(1, 2)] },
    { id: 'e-then-o2e', rs: [rd.out(L, 2), rd.dup(1, 2)] },
    { id: 'o2e-then', rs: [rd.dup(1, 2), rd.out(L, 2)] },
    { id: 'app-e-file', rs: [rd.app(L), rd.app(M, 2)] },
    { id: 'e-as-1', rs: [rd.out('1', 2)] },
    { id: 'swap', rs: [rd.out(M, 2), rd.dup(1, 2), rd.out(L)] },
  ];
}

const filesOf = (rs) => new Set(rs.filter((r) => r.file && r.file !== '/dev/null').map((r) => r.file));
const EXOTIC = new Set(['e-then-o2e', 'o2e-then', 'swap', 'o-to-e', 'e-as-1']);

/** Padrões candidatos a distratores: só arquivos que já aparecem no comando correto; os exóticos entram raramente. */
function candidates(rng, cat, pick, L) {
  const allowed = filesOf(pick.rs).size ? filesOf(pick.rs) : new Set([L]);
  const ok = cat.filter((c) => c.id !== pick.id && [...filesOf(c.rs)].every((f) => allowed.has(f)));
  const common = rng.shuffle(ok.filter((c) => !EXOTIC.has(c.id)));
  const exotic = rng.shuffle(ok.filter((c) => EXOTIC.has(c.id)));
  return rng.chance(0.3) ? rng.shuffle([...common, ...exotic.slice(0, 1)]) : [...common, ...exotic];
}

/** Rastro passo a passo da tabela de descritores (para a explicação). */
function trace(rs, spaced, explicit) {
  const where = { 1: 'tela', 2: 'tela' };
  const lines = [`Início: 1 → tela, 2 → tela.`];
  for (const r of rs) {
    const t = renderRedirs([r], { spaced, explicit });
    if (r.op === '>' || r.op === '>>') where[r.fd ?? 1] = r.file === '/dev/null' ? '/dev/null (descarta)' : r.file;
    else if (r.op === 'dup') where[r.fd] = where[r.to];
    else { where[1] = r.file; where[2] = r.file; }
    const note = r.op === 'dup' ? ` (copia o destino ATUAL do fd ${r.to})` : r.op === '>>' || r.op === '&>>' ? ' (acrescenta ao fim)' : r.file === '1' ? ' (cria um ARQUIVO chamado 1)' : '';
    lines.push(`\`${t}\`${note}: 1 → ${where[1]}, 2 → ${where[2]}.`);
  }
  return lines.join('\n');
}

function sceneIntro(sc) {
  const pre = [...sc.pre];
  return `No diretório atual existe \`${sc.ok}\`, mas **não** existe \`${sc.miss}\`${pre.length ? `; o arquivo \`${pre[0]}\` já existe e contém a linha \`velho\`` : ''}. ` +
    (sc.cmd.kind === 'ls'
      ? `O comando \`ls\` escreve o nome \`${sc.ok}\` na saída padrão (**stdout**) e uma mensagem de erro na saída de erro (**stderr**).`
      : `O comando \`cat\` escreve o conteúdo de \`${sc.ok}\` na saída padrão (**stdout**) e uma mensagem de erro na saída de erro (**stderr**).`);
}

const ROUTE_WORDS = (kind, dest, old, fileApp) => {
  const nm = kind === 'out' ? 'a stdout' : 'a stderr';
  if (dest === 'tela') return `${nm} continua aparecendo na tela`;
  if (dest === 'null') return `${nm} é descartada`;
  if (dest === 'pipe') return `${nm} segue pelo pipe`;
  return fileApp ? `${nm} é acrescentada ao final de \`${dest}\` (o conteúdo anterior é mantido)` : `${nm} é gravada em \`${dest}\``;
};

export const generators = [
  // ---------------------------------------------------------------------------------------------
  {
    id: 'io-redir-outcome', obj: '103.4', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const sc = mkScenario(rng);
        const cat = catalog(sc.L, sc.M);
        const weights = { oe: 3, eo: 3, 'o-e': 2, both: 1, app: 1, 'app-e': 2, 'null-all': 1, 'null-eo': 2, 'e-as-1': 1, 'e-then-o2e': 1, 'o2e-then': 1, swap: 1, bothapp: 1, 'o-null-e': 1, 'e-only': 1, 'o-to-e': 1 };
        const pick = rng.weighted(cat.filter((c) => weights[c.id]), (c) => weights[c.id]);
        const usesApp = pick.rs.some((r) => r.op === '>>' || r.op === '&>>');
        if (usesApp || rng.chance(0.25)) sc.pre.add(sc.L);
        const spaced = rng.chance(0.3); const explicit = rng.chance(0.3);
        const withPipe = !usesApp && rng.chance(0.3);
        const opt = withPipe ? { pipe: true } : {};
        const sim = simulate(pick.rs, sc, opt);
        const correct = outcomeText(sim);
        const pool = [];
        const seen = new Set([outcomeKey(sim)]);
        for (const c of candidates(rng, cat, pick, sc.L)) {
          const s2 = simulate(c.rs, sc, opt);
          const k = outcomeKey(s2);
          if (seen.has(k)) continue;
          seen.add(k); pool.push(outcomeText(s2));
        }
        const redirText = renderRedirs(pick.rs, { spaced, explicit });
        const full = `${sc.cmd.text} ${redirText}${withPipe ? ' | wc -l' : ''}`;
        return {
          type: 'unica',
          text: `${sceneIntro(sc)}${withPipe ? ' O comando `wc -l` conta as linhas que chegam à sua entrada padrão.' : ''}\n\nO comando abaixo é executado no Bash:\n\n${block('$ ' + full)}\n\nDepois da execução, para onde foi cada saída? (\`tela\` = o terminal)`,
          options: mcq(rng, correct, pool, 4),
          explanation: `O Bash processa os redirecionamentos **da esquerda para a direita**, copiando a tabela de descritores a cada passo (\`2>&1\` faz o fd 2 apontar para onde o fd 1 aponta *naquele momento*).\n${trace(pick.rs, spaced, explicit)}\nResultado: ${correct}.` +
            (withPipe ? ' O pipe só carrega o que está no fd 1 quando o comando começa; sem `2>&1` antes do `|`, o stderr não passa pelo `wc`.' : '') +
            (usesApp ? ' `>>` não apaga o conteúdo antigo; `>` trunca o arquivo antes da execução.' : ''),
          ref: ['101:p.283-285'],
          verify: { sh: shellProbe(sc, redirText, sim.entries, withPipe ? { pipe: true } : {}), expect: probeExpect(sim) },
        };
      });
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'io-redir-goal', obj: '103.4', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const sc = mkScenario(rng);
        const cat = catalog(sc.L, sc.M);
        const goals = ['oe', 'eo', 'both', 'o-e', 'e', 'o', 'app-e', 'null-all', 'null-e', 'e-only', 'o-null-e', 'bothapp', 'app', 'eapp', 'app-e-file'];
        const pick = cat.find((c) => c.id === rng.pick(goals));
        const usesApp = pick.rs.some((r) => r.op === '>>' || r.op === '&>>');
        const appFiles = new Set(pick.rs.filter((r) => r.op === '>>' || r.op === '&>>').map((r) => r.file));
        if (usesApp) for (const f of appFiles) sc.pre.add(f);
        else if (rng.chance(0.2)) sc.pre.add(sc.L);
        const spaced = rng.chance(0.3); const explicit = false;
        const sim = simulate(pick.rs, sc);
        const key = outcomeKey(sim);
        // objetivo descrito pela rota de cada fluxo
        const fileOf = (kind) => sim.route[kind];
        const isApp = (dest) => sim.entries.find((e) => e.name === dest)?.tokens.includes('antigo');
        let goalTxt;
        if (sim.route.out === sim.route.err && sim.route.out !== 'tela' && sim.route.out !== 'null') {
          goalTxt = isApp(sim.route.out)
            ? `a stdout e a stderr são acrescentadas juntas ao final de \`${sim.route.out}\` (o conteúdo anterior é mantido) e nada aparece na tela`
            : `a stdout e a stderr são gravadas juntas em \`${sim.route.out}\` e nada aparece na tela`;
        } else if (sim.route.out === sim.route.err && sim.route.out === 'null') {
          goalTxt = 'toda a saída (stdout e stderr) é descartada';
        } else if (sim.route.out === sim.route.err) {
          goalTxt = 'a stdout e a stderr aparecem na tela';
        } else {
          goalTxt = `${ROUTE_WORDS('out', fileOf('out'), false, isApp(fileOf('out')))}; ${ROUTE_WORDS('err', fileOf('err'), false, isApp(fileOf('err')))}`;
        }
        if (sim.route.out === 'tela' && sim.route.err === 'tela') goalTxt = 'a stdout e a stderr aparecem na tela';
        const correctText = `${sc.cmd.text} ${renderRedirs(pick.rs, { spaced, explicit })}`;
        const pool = []; const seen = new Set([correctText]);
        const prefer = ({ oe: ['eo', 'o', 'e', 'both'], eo: ['oe', 'o', 'e'], 'o-e': ['e-o', 'o', 'oe'], both: ['o', 'eo', 'e'], 'app-e': ['oe', 'eo', 'app'] }[pick.id] ?? []).filter((id) => [...filesOf(cat.find((c) => c.id === id).rs)].every((f) => (filesOf(pick.rs).size ? filesOf(pick.rs) : new Set([sc.L])).has(f)));
        const consider = (c) => {
          const s2 = simulate(c.rs, sc);
          const same = s2.route.out === sim.route.out && s2.route.err === sim.route.err && outcomeKey(s2) === key;
          if (same) return;
          const t = `${sc.cmd.text} ${renderRedirs(c.rs, { spaced, explicit })}`;
          if (seen.has(t)) return;
          seen.add(t); pool.push(t);
        };
        for (const id of prefer) consider(cat.find((c) => c.id === id));
        for (const c of candidates(rng, cat, pick, sc.L)) consider(c);
        const prefOrder = pool.slice(0, prefer.length);
        const rest = rng.shuffle(pool.slice(prefer.length));
        const options = mcq(rng, correctText, [...prefOrder, ...rest].slice(0, 6), 4);
        // verificação: executa as 4 opções e confere o desfecho de cada uma
        const probes = options.map((o, i) => {
          const redirText = o.t.slice(sc.cmd.text.length + 1);
          const c = cat.find((cc) => `${sc.cmd.text} ${renderRedirs(cc.rs, { spaced, explicit })}` === o.t);
          const s2 = simulate(c.rs, sc);
          return { probe: shellProbe(sc, redirText, s2.entries), expect: probeExpect(s2), i };
        });
        return {
          type: 'unica',
          text: `${sceneIntro(sc)}\n\nQual dos comandos abaixo produz este resultado: ${goalTxt}?\n\n(\`tela\` = o terminal)`,
          options,
          explanation: `Os redirecionamentos valem da esquerda para a direita. ${trace(pick.rs, spaced, explicit).replace(/\n/g, ' ')} Por isso \`${correctText}\` cumpre o objetivo. Nas outras opções a ordem ou o operador mudam o destino de algum fluxo: por exemplo, \`2>&1 >arquivo\` copia o destino do fd 1 (ainda a tela) antes de ele ir para o arquivo, e \`>\` apaga o arquivo antes enquanto \`>>\` preserva o conteúdo antigo.`,
          ref: ['101:p.283-285'],
          verify: {
            sh: probes.map((p) => `( ${p.probe.replace(/\n/g, '\n')}\n)`).join('\n'),
            expect: probes.map((p) => p.expect).join('\n'),
          },
        };
      });
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'io-noclobber', obj: '103.4', nivel: 3, peso: 2,
    make(rng) {
      return retry(() => {
        const f = rng.pick(['dados.txt', 'lista.txt', 'nota.txt', 'teste.txt', 'saida.txt', 'rascunho.txt']);
        const W = rng.shuffle(['um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito']);
        const exists0 = rng.chance(0.5);
        const style = rng.pick([['set -o noclobber', 'set +o noclobber'], ['set -C', 'set +C']]);
        const nSteps = rng.int(4, 6);
        const onAt = rng.int(0, 1);
        const steps = [];
        let wi = 0; let isOn = false;
        for (let i = 0; i < nSteps; i++) {
          if (i === onAt) { steps.push({ k: 'on', t: style[0] }); isOn = true; continue; }
          const opts = ['out', 'out', 'out', 'app', 'force', 'null'];
          if (isOn && i >= 3) opts.push('off');
          const k = rng.pick(opts);
          if (k === 'off') { steps.push({ k, t: style[1] }); isOn = false; continue; }
          const w = W[wi++];
          steps.push({ k, w, t: k === 'out' ? `echo ${w} > ${f}` : k === 'app' ? `echo ${w} >> ${f}` : k === 'force' ? `echo ${w} >| ${f}` : `echo ${w} > /dev/null` });
        }
        if (!steps.some((s) => ['out', 'app', 'force'].includes(s.k))) return null;
        const run = (flags = {}, log = null) => {
          let exists = exists0; let lines = exists0 ? ['base'] : []; let nc = false;
          if (log && exists0) log.push(`\`echo base > ${f}\` → cria o arquivo: base.`);
          for (const s of steps) {
            const before = exists ? lines.join(' / ') : 'inexistente';
            let note = '';
            if (s.k === 'on') { nc = true; note = 'liga o noclobber'; }
            else if (s.k === 'off') { nc = false; note = 'desliga o noclobber'; }
            else if (s.k === 'out') { if (!(nc && !flags.ignore && exists)) { lines = [s.w]; exists = true; note = `grava; o arquivo passa a ter: ${s.w}`; } else note = `FALHA (noclobber ligado e o arquivo existe); continua: ${before}`; }
            else if (s.k === 'app') { if (!(nc && flags.appBlocked && exists)) { lines = [...lines, s.w]; exists = true; note = `acrescenta; agora: ${lines.join(' / ')}`; } }
            else if (s.k === 'force') { if (!(nc && flags.forceBlocked && exists)) { lines = [s.w]; exists = true; note = `\`>|\` ignora o noclobber e sobrescreve; agora: ${s.w}`; } }
            else note = 'vai para /dev/null (não afeta o arquivo)';
            if (log) log.push(`\`${s.t}\` → ${note}.`);
          }
          return exists ? lines : null;
        };
        const txt = (l) => (l === null ? 'o arquivo não existe' : l.length ? l.join(' / ') : 'arquivo vazio');
        const traceLog = [];
        const res = run({}, traceLog);
        const correct = txt(res);
        const pool = [run({ ignore: true }), run({ appBlocked: true }), run({ forceBlocked: true }), run({ ignore: true, appBlocked: true }), run({ appBlocked: true, forceBlocked: true })]
          .map(txt);
        const lastStep = res && res.length > 1 ? res.slice(0, -1) : null;
        if (lastStep) pool.push(txt(lastStep));
        if (res && res.length) pool.push(txt([...res].reverse()), txt(res.slice(1).length ? res.slice(1) : ['base']));
        const prog = [...(exists0 ? [`echo base > ${f}`] : []), ...steps.map((s) => s.t)];
        const script = [`cd "$(mktemp -d)"`, ...(exists0 ? [`echo base > ${f}`] : []), ...steps.map((s) => (s.k === 'on' || s.k === 'off' ? s.t : `{ ${s.t}; } 2>/dev/null`)),
          `if [ -s ${f} ]; then paste -s -d/ ${f}; else echo vazio; fi`].join('\n');
        const expect = res === null ? 'vazio' : res.length ? res.join('/') : 'vazio';
        return {
          type: 'unica',
          text: `Os comandos abaixo são digitados, na ordem, em uma mesma sessão do Bash (o arquivo \`${f}\` não existia antes do primeiro comando). Qual é o conteúdo final de \`${f}\`, isto é, o que \`cat ${f}\` mostra? (as linhas aparecem separadas por \`/\`)\n\n${block(prog.map((l) => '$ ' + l).join('\n'))}`,
          options: mcq(rng, correct, pool, 4),
          explanation: `Com \`noclobber\` ligado (\`set -C\` ou \`set -o noclobber\`), o redirecionamento \`>\` **falha** se o arquivo já existe (mensagem "cannot overwrite existing file") e o arquivo permanece como estava. Continuam funcionando: \`>>\` (acrescenta), \`>|\` (força a sobrescrita), \`> /dev/null\` (arquivo especial) e qualquer \`>\` enquanto o arquivo ainda não existe. \`set +C\` desliga a proteção. Passo a passo:
${traceLog.join('\n')}\nResultado: ${correct}.`,
          ref: ['101:p.284-285'],
          verify: { sh: script, expect },
        };
      });
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'io-tee', obj: '103.4', nivel: 2, peso: 3,
    make(rng) {
      return retry(() => {
        const pool = ['ana', 'bia', 'caio', 'dani', 'edu', 'fabi', 'gui', 'hugo', 'ivo', 'lia'];
        const words = rng.sample(pool, rng.int(3, 5));
        if (rng.chance(0.4)) words.splice(rng.int(0, words.length), 0, rng.pick(words));
        const f = rng.pick(['saida.txt', 'copia.txt', 'registro.txt', 'tee.out']);
        const stagesDef = {
          sort: { t: 'sort', fn: (l) => [...l].sort() },
          'sort -r': { t: 'sort -r', fn: (l) => [...l].sort().reverse() },
          tac: { t: 'tac', fn: (l) => [...l].reverse() },
          up: { t: "tr a-z A-Z", fn: (l) => l.map((x) => x.toUpperCase()) },
          uniq: { t: 'sort | uniq', fn: (l) => [...new Set(l)].sort() },
          'head2': { t: 'head -n 2', fn: (l) => l.slice(0, 2) },
          'tail2': { t: 'tail -n 2', fn: (l) => l.slice(-2) },
          wc: { t: 'wc -l', fn: (l) => [String(l.length)] },
        };
        const preIds = rng.shuffle([rng.pick(['sort', 'sort -r', 'tac', 'uniq']), ...(rng.chance(0.4) ? ['up'] : [])]);
        const postId = rng.pick([null, null, 'wc', 'head2', 'tail2', 'up', 'null']);
        const append = rng.chance(0.4);
        const hasOld = append || rng.chance(0.3);
        let cur = [...words];
        for (const id of preIds) cur = stagesDef[id].fn(cur);
        const fileNew = cur;
        const fileLines = append ? ['velho', ...fileNew] : fileNew;
        let screen = cur;
        let post = '';
        if (postId === 'null') { screen = []; post = ' > /dev/null'; } else if (postId) { screen = stagesDef[postId].fn(cur); post = ` | ${stagesDef[postId].t}`; }
        const teeCmd = `tee ${append ? '-a ' : ''}${f}`;
        const src = `printf '%s\\n' ${words.join(' ')}`;
        const pipeline = `${src} | ${preIds.map((id) => stagesDef[id].t).join(' | ')} | ${teeCmd}${post}`;
        const fmt = (file, scr) => `${f}: ${file.length ? file.join(' ') : 'vazio'}; tela: ${scr.length ? scr.join(' ') : 'nada'}`;
        const correct = fmt(fileLines, screen);
        const alt = [];
        // erros típicos: tee antes/depois do filtro, esquecer -a, achar que tee não mostra, achar que o arquivo recebe a saída final
        alt.push(fmt(append ? fileNew : ['velho', ...fileNew], screen)); // confunde -a
        if (postId && postId !== 'null') alt.push(fmt(screen.length ? (append ? ['velho', ...screen] : screen) : fileLines, screen)); // arquivo recebe a saída final do pipeline
        alt.push(fmt(fileLines, [])); // tee não mostra na tela
        alt.push(fmt([], screen)); // arquivo vazio
        alt.push(fmt(append ? ['velho', ...words] : words, screen)); // arquivo recebe a entrada original
        alt.push(fmt(fileLines, words));
        alt.push(fmt(fileLines, [...screen].reverse()));
        const oldSetup = hasOld ? `printf 'velho\\n' > ${f}\n` : '';
        const note = hasOld ? `O arquivo \`${f}\` já existe e contém a linha \`velho\`.\n\n` : '';
        const verifySh = `cd "$(mktemp -d)"\n${oldSetup}scr=$(${pipeline} | tr '\\n' ' ' | sed 's/ $//')\nfl=$(tr '\\n' ' ' < ${f} | sed 's/ $//')\necho "${f}: \${fl:-vazio}; tela: \${scr:-nada}"`;
        return {
          type: 'unica',
          text: `${note}Considere o pipeline abaixo e responda: depois da execução, qual é o conteúdo de \`${f}\` e o que aparece na tela? (itens separados por espaço)\n\n${block('$ ' + pipeline)}`,
          options: mcq(rng, correct, alt, 4),
          explanation: `\`tee\` copia sua entrada padrão para **a saída padrão e para o(s) arquivo(s)**. Ele grava exatamente o que *chega* até ele, ou seja, o resultado dos filtros que vêm **antes** dele (${preIds.map((id) => '`' + stagesDef[id].t + '`').join(', ')}): ${fileNew.join(' ')}. ${append ? 'Com `-a` o conteúdo é acrescentado ao que já existia; sem `-a` o arquivo seria sobrescrito. ' : hasOld ? 'Sem `-a` o arquivo é sobrescrito (a linha `velho` desaparece). ' : ''}O que vem **depois** do \`tee\` só afeta a tela${postId === 'null' ? ' (aqui `> /dev/null` descarta a saída, então nada aparece)' : postId ? ` (\`${stagesDef[postId].t}\` → ${screen.join(' ') || 'nada'})` : ''}. Resultado: ${correct}.`,
          ref: ['101:p.294-295'],
          verify: { sh: verifySh, expect: correct },
        };
      });
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'io-xargs', obj: '103.4', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const W = ['alfa', 'beta', 'gama', 'delta', 'epsilon', 'zeta', 'eta', 'teta', 'iota', 'kapa', 'lambda', 'mi'];
        const nLines = rng.int(2, 4);
        const lines = Array.from({ length: nLines }, () => rng.sample(W, rng.int(1, 3)).join(' '));
        const words = lines.flatMap((l) => l.split(' '));
        const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
        const run = (m) => {
          let groups;
          if (m.mode === 'n') groups = m.n ? chunk(words, m.n) : (words.length ? [words] : []);
          else if (m.mode === 'L') groups = chunk(lines, m.k).map((g) => g.flatMap((l) => l.split(' ')));
          else if (m.mode === 'I') groups = lines.map((l) => [l]);
          else groups = m.n ? chunk(lines, m.n) : [lines]; // 'd'
          if (m.mode === 'I') return groups.map((g) => m.tpl.replace('{}', g[0]));
          return groups.map((g) => g.join(' '));
        };
        const mode = rng.weighted(['n', 'L', 'I', 'd', 'empty'], (x) => ({ n: 4, L: 3, I: 3, d: 2, empty: 1 }[x]));
        let m; let cmd; let setup = ''; let show;
        const f = rng.pick(['lista.txt', 'nomes.txt', 'itens.txt', 'entrada.txt']);
        if (mode === 'empty') {
          const r = rng.chance(0.5);
          const w = rng.pick(['oi', 'ok', 'feito']);
          const out = r ? [] : [w];
          const alt = [r ? [w] : [], ['erro: entrada vazia']];
          const asks = rng.chance(0.5) ? 'saida' : 'qtd';
          const cmdl = `printf '' | xargs ${r ? '-r ' : ''}echo ${w}`;
          if (asks === 'qtd') {
            return {
              type: 'lacuna',
              text: `Quantas vezes o comando \`echo\` é executado pelo \`xargs\` no pipeline abaixo? (GNU xargs)\n\n${block('$ ' + cmdl)}`,
              answers: [String(out.length)],
              explanation: `A entrada é vazia. O \`xargs\` do GNU, **sem** \`-r\` (\`--no-run-if-empty\`), executa o comando **uma vez** mesmo sem argumentos (imprimindo \`${w}\`). Com \`-r\` ele não executa nada. Aqui: ${r ? 'há `-r`, então 0 execuções' : 'não há `-r`, então 1 execução'}.`,
              ref: ['101:p.296-297'],
              verify: { sh: `${cmdl} | wc -l`, expect: String(out.length) },
            };
          }
          const txt = (o) => (o.length ? o.join(' | ') : 'nenhuma saída');
          return {
            type: 'unica',
            text: `Qual é a saída do pipeline abaixo? (GNU xargs; a entrada é vazia)\n\n${block('$ ' + cmdl)}`,
            options: mcq(rng, txt(out), [txt(alt[0]), txt(alt[1]), `${w} ${w}`, 'xargs: no input'], 4),
            explanation: `Sem \`-r\`, o GNU \`xargs\` executa o comando uma vez mesmo quando a entrada é vazia (\`echo ${w}\` → \`${w}\`). Com \`-r\` (\`--no-run-if-empty\`) ele não executa nada. ${r ? 'Aqui há `-r`: nenhuma saída.' : 'Aqui não há `-r`: aparece `' + w + '`.'}`,
            ref: ['101:p.296-297'],
            verify: { sh: `${cmdl} | paste -s -d'|' -`, expect: out.join('|') },
          };
        }
        if (mode === 'n') {
          const n = rng.pick([null, 1, 2, 2, 3]);
          m = { mode, n }; cmd = `xargs${n ? ` -n ${n}` : ''} echo < ${f}`;
        } else if (mode === 'L') {
          const k = rng.pick([1, 1, 2]);
          m = { mode, k }; cmd = `xargs -L ${k} echo < ${f}`;
        } else if (mode === 'I') {
          const ph = rng.pick(['{}', '%', 'ARQ']);
          const tpl = rng.pick([`item-${ph}`, `<${ph}>`, `[${ph}]`, `${ph}.bak`]);
          m = { mode, tpl: tpl.split(ph).join('{}') };
          cmd = `xargs -I ${ph} echo ${tpl.includes('<') || tpl.includes('[') ? `"${tpl}"` : tpl} < ${f}`;
          m.tplOut = tpl.split(ph).join('{}');
        } else {
          const n = rng.pick([null, 1, 2]);
          m = { mode, n }; cmd = `xargs -d '\\n'${n ? ` -n ${n}` : ''} echo < ${f}`;
        }
        const out = run(m);
        if (out.length < 2 && mode !== 'd' && mode !== 'n') return null;
        const joined = (o) => o.join(' | ');
        const alts = [];
        // alternativas por mal-entendidos
        alts.push(run({ mode: 'n', n: null })); // tudo numa linha
        alts.push(run({ mode: 'n', n: 1 }));
        alts.push(run({ mode: 'n', n: 2 }));
        alts.push(run({ mode: 'L', k: 1 }));
        alts.push(run({ mode: 'L', k: 2 }));
        alts.push(run({ mode: 'd', n: null }));
        alts.push(run({ mode: 'd', n: 1 }));
        alts.push(run({ mode: 'I', tpl: m.tpl ?? 'x-{}' }));
        if (m.mode === 'n' && m.n) alts.push(run({ mode: 'n', n: m.n + 1 }), run({ mode: 'n', n: m.n - 1 || 3 }));
        if (m.mode === 'L') alts.push(run({ mode: 'L', k: m.k + 1 }));
        const asks = rng.chance(0.4) ? 'qtd' : 'saida';
        const catText = `$ cat ${f}\n${lines.join('\n')}`;
        const verifySh = `cd "$(mktemp -d)"\nprintf '%s\\n' ${lines.map(sq).join(' ')} > ${f}\n${cmd}`;
        if (asks === 'qtd') {
          const correct = String(out.length);
          const poolN = new Set(alts.map((a) => String(a.length)));
          poolN.delete(correct);
          const extra = [out.length + 1, out.length - 1, out.length + 2, 1].map(String);
          extra.forEach((e) => { if (e !== correct && Number(e) > 0) poolN.add(e); });
          return {
            type: 'unica',
            text: `O arquivo \`${f}\` tem o conteúdo abaixo. Quantas vezes o comando \`echo\` é executado pelo \`xargs\` em \`${cmd}\`?\n\n${block(catText.replace('$ cat ' + f + '\n', ''))}`,
            options: mcq(rng, correct, [...poolN], 4),
            explanation: modeExplain(m, lines, out),
            ref: ['101:p.296-297'],
            verify: { sh: `${verifySh} | wc -l`, expect: correct },
          };
        }
        const correct = joined(out);
        const pool = alts.map(joined);
        return {
          type: 'unica',
          text: `O arquivo \`${f}\` tem o conteúdo abaixo. Qual é a saída de \`${cmd}\`? (cada execução do \`echo\` gera uma linha; aqui as linhas aparecem separadas por \` | \`)\n\n${block(lines.join('\n'))}`,
          options: mcq(rng, correct, pool, 4),
          explanation: modeExplain(m, lines, out),
          ref: ['101:p.296-297'],
          verify: { sh: `${verifySh} | paste -s -d'|' - | sed 's/|/ | /g'`, expect: correct },
        };
      });
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'io-cmdsub-args', obj: '103.4', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const K = () => rng.int(2, 5);
        const kinds = [
          (k) => ({ src: `$(seq ${k})`, parts: [{ t: 'cs', n: k }] }),
          (k) => ({ src: `"$(seq ${k})"`, parts: [{ t: 'cs', n: k, q: 'd' }] }),
          (k) => ({ src: `'$(seq ${k})'`, parts: [{ t: 'cs', n: k, q: 's' }] }),
          (k) => ({ src: `\`seq ${k}\``, parts: [{ t: 'cs', n: k }] }),
          (k) => { const ws = rng.sample(['a', 'b', 'c', 'd', 'e'], Math.min(k, 4)); return { src: `$(echo ${ws.join(' ')})`, parts: [{ t: 'cs', n: ws.length }] }; },
          (k) => { const ws = rng.sample(['a', 'b', 'c', 'd', 'e'], Math.min(k, 4)); return { src: `"$(echo ${ws.join(' ')})"`, parts: [{ t: 'cs', n: ws.length, q: 'd' }] }; },
          () => ({ src: '$(printf \'\')', parts: [{ t: 'cs', n: 0 }] }),
          () => ({ src: '"$(printf \'\')"', parts: [{ t: 'cs', n: 0, q: 'd' }] }),
          (k) => ({ src: `x$(seq ${k})`, parts: [{ t: 'lit' }, { t: 'cs', n: k }] }),
          (k) => ({ src: `"x$(seq ${k})"`, parts: [{ t: 'lit', q: 'd' }, { t: 'cs', n: k, q: 'd' }] }),
          () => ({ src: 'lpic', parts: [{ t: 'lit' }] }),
        ];
        // semânticas: correta e erros típicos
        const count = (arg, sem) => {
          const q = (p) => (sem.quotesIgnored ? undefined : p.q);
          const hasSingle = arg.parts.some((p) => p.q === 's');
          if (hasSingle) return sem.singleExpands ? arg.parts[0].n : 1;
          const anyQuoted = arg.parts.some((p) => q(p) === 'd');
          if (arg.parts.length === 1 && arg.parts[0].t === 'cs') {
            const n = arg.parts[0].n;
            if (anyQuoted) return sem.emptyQuotedDrops && n === 0 ? 0 : 1;
            return sem.noSplit ? 1 : n;
          }
          if (arg.parts.length === 1 && arg.parts[0].t === 'lit') return 1;
          // lit + cs
          const n = arg.parts[1].n;
          if (anyQuoted) return 1;
          return sem.noSplit ? 1 : (n === 0 ? 1 : n);
        };
        const nCalls = rng.int(3, 4);
        const calls = []; const used = new Set();
        while (calls.length < nCalls) {
          const i = rng.int(0, kinds.length - 1);
          const a = kinds[i](K());
          if (used.has(a.src)) continue;
          used.add(a.src);
          calls.push(rng.chance(0.25) ? [a, kinds[rng.int(0, kinds.length - 1)](K())] : [a]);
        }
        const render = (c) => `contar ${c.map((a) => a.src).join(' ')}`;
        const sems = {
          ok: {},
          noSplit: { noSplit: true },
          quotesIgnored: { quotesIgnored: true },
          singleExpands: { singleExpands: true },
          emptyDrops: { emptyQuotedDrops: true },
          mixed: { quotesIgnored: true, singleExpands: true },
        };
        const seq = (sem) => calls.map((c) => c.reduce((s, a) => s + count(a, sem), 0)).join(' ');
        const correct = seq(sems.ok);
        const pool = Object.entries(sems).filter(([k]) => k !== 'ok').map(([, s]) => seq(s));
        const lens = calls.map((c) => c.reduce((s, a) => s + count(a, {}), 0));
        pool.push(lens.map((x) => x + 1).join(' '), lens.map((x) => Math.max(0, x - 1)).join(' '), [...lens].reverse().join(' '));
        const script = `contar() { echo "$#"; }\n${calls.map(render).join('\n')}`;
        return {
          type: 'unica',
          text: `Foi definida a função abaixo, que imprime quantos argumentos recebeu. Quais números são impressos pelas chamadas seguintes, na ordem?\n\n${block('$ contar() { echo "$#"; }\n' + calls.map((c) => '$ ' + render(c)).join('\n'))}`,
          options: mcq(rng, correct, pool, 4),
          explanation: 'Contagem de argumentos de cada chamada:\n' + block(calls.map((c) => `${render(c)}   →  ${c.reduce((s, a) => s + count(a, {}), 0)}`).join('\n')) + '\nRegras: a substituição de comando **sem aspas** passa pela divisão em palavras (cada palavra da saída vira um argumento; saída vazia some); **entre aspas duplas** a saída inteira vira **um único** argumento (mesmo vazia); entre **aspas simples** nada é expandido, então `$(...)` é texto literal (1 argumento). Crases `` `cmd` `` e `$(cmd)` funcionam igual.',
          ref: ['101:p.295-296'],
          verify: { sh: `{
${script}
} | paste -s -d' ' -`, expect: correct },
        };
      });
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'io-cmdsub-value', obj: '103.4', nivel: 2, peso: 3,
    make(rng) {
      return retry(() => {
        const n = rng.int(3, 8);
        const word = rng.pick(['linux', 'shell', 'kernel', 'tux', 'debian', 'bash', 'pipe']);
        const path = rng.pick(['/var/log/auth.log', '/etc/ssh/sshd_config', '/usr/local/bin/backup.sh', '/home/ana/docs/nota.txt', '/srv/www/index.html']);
        const base = path.split('/').pop();
        const dir = path.slice(0, path.lastIndexOf('/'));
        const ext = base.includes('.') ? '.' + base.split('.').pop() : '';
        const dirBase = dir.split('/').pop();
        const ws = rng.sample(['um', 'dois', 'tres', 'quatro', 'cinco', 'seis'], rng.int(2, 5));
        const items = [
          { cmd: `seq 1 ${n} | wc -l`, val: String(n), wrong: [String(n - 1), String(n + 1), '1'] },
          { cmd: `seq 1 ${n} | tail -n 1`, val: String(n), wrong: ['1', String(n - 1), String(n + 1)] },
          { cmd: `echo ${ws.join(' ')} | wc -w`, val: String(ws.length), wrong: ['1', String(ws.length + 1), String(ws.join(' ').length)] },
          { cmd: `basename ${path}`, val: base, wrong: [dir, dirBase, path] },
          { cmd: `dirname ${path}`, val: dir, wrong: [base, dirBase, '.'] },
          { cmd: `echo ${word} | tr a-z A-Z`, val: word.toUpperCase(), wrong: [word, word.toUpperCase().split('').reverse().join(''), word[0].toUpperCase() + word.slice(1)] },
          { cmd: `echo ${word} | rev`, val: [...word].reverse().join(''), wrong: [word, word.toUpperCase(), String(word.length)] },
          { cmd: `echo ${word} | wc -c`, val: String(word.length + 1), wrong: [String(word.length), String(word.length + 2), '1'] },
          { cmd: 'uname -s', val: 'Linux', wrong: ['x86_64', 'GNU/Linux', 'linux'] },
        ];
        if (ext) items.push({ cmd: `basename ${path} ${ext}`, val: base.slice(0, -ext.length), wrong: [base, dir, path] });
        const it = rng.pick(items);
        const label = rng.pick(['Resultado', 'Valor', 'Total', 'Saída']);
        const form = rng.weighted(['var', 'dq', 'bt', 'sq', 'esc', 'nest'], (x) => ({ var: 3, dq: 3, bt: 2, sq: 3, esc: 2, nest: 2 }[x]));
        let line; let correct; let extraWrong = [];
        const literal = `$(${it.cmd})`;
        if (form === 'var') { line = `RES=$(${it.cmd}); echo "${label}: $RES"`; correct = `${label}: ${it.val}`; extraWrong = [`${label}: $RES`, `${label}: ${literal}`, `${label}: `]; }
        else if (form === 'dq') { line = `echo "${label}: $(${it.cmd})"`; correct = `${label}: ${it.val}`; extraWrong = [`${label}: ${literal}`, `${label}: ${it.cmd}`, `${label}: `]; }
        else if (form === 'bt') { line = `echo "${label}: \`${it.cmd}\`"`; correct = `${label}: ${it.val}`; extraWrong = [`${label}: \`${it.cmd}\``, `${label}: ${literal}`, `${label}: `]; }
        else if (form === 'sq') { line = `echo '${label}: $(${it.cmd})'`; correct = `${label}: ${literal}`; extraWrong = [`${label}: ${it.val}`, `${label}: `, `${label}: ${it.cmd}`]; }
        else if (form === 'esc') { line = `echo "${label}: \\$(${it.cmd})"`; correct = `${label}: ${literal}`; extraWrong = [`${label}: ${it.val}`, `${label}: \\${literal}`, `${label}: `]; }
        else {
          line = `echo $(basename $(dirname ${path}))`; correct = dirBase; extraWrong = [base, dir, dirBase.toUpperCase(), path.split('/')[1]];
          it.wrong = [];
        }
        const pool = [...extraWrong, ...it.wrong.map((w) => (form === 'nest' ? w : `${label}: ${w}`))];
        const options = mcq(rng, correct, pool, 4);
        const expl = form === 'sq' ? 'Entre **aspas simples** nada é expandido: o Bash imprime o texto literal `$(...)`, sem executar o comando.'
          : form === 'esc' ? 'A barra invertida antes do `$` o torna literal, mesmo entre aspas duplas: o comando não é executado e `$(...)` é impresso como texto.'
            : form === 'nest' ? '`$(...)` pode ser aninhado: o mais interno (`dirname`) roda primeiro e sua saída vira argumento do `basename`.'
              : 'O Bash executa o comando entre `$(...)` (ou crases), substitui o trecho pela **saída padrão** do comando (sem o `\\n` final) e só então executa o `echo`.';
        return {
          type: 'unica',
          text: `Qual é a saída da linha de comando abaixo?\n\n${block('$ ' + line)}`,
          options,
          explanation: `${expl} Neste caso: \`${form === 'nest' ? 'dirname ' + path + '` → `' + dir + '`; `basename ' + dir : it.cmd}\` → ${form === 'nest' ? dirBase : it.val}. Saída: ${correct}.`,
          ref: ['101:p.295-296'],
          verify: { sh: line, expect: correct },
        };
      });
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'io-here', obj: '103.4', nivel: 3, peso: 3,
    make(rng) {
      return retry(() => {
        const fmt = rng.weighted(['hs-count', 'hd-count', 'hd-expand', 'hs-filter'], (x) => ({ 'hs-count': 3, 'hd-count': 3, 'hd-expand': 4, 'hs-filter': 2 }[x]));
        const bytes = (s) => new TextEncoder().encode(s).length;
        const WORDS = ['linux', 'shell', 'pipe', 'kernel', 'root', 'bash', 'texto', 'dados', 'grep', 'tux'];
        if (fmt === 'hs-count') {
          const s = rng.sample(WORDS, rng.int(2, 5)).join(' ');
          const mode = rng.pick(['-c', '-w', '-l']);
          const correct = mode === '-c' ? s.length + 1 : mode === '-w' ? s.split(' ').length : 1;
          const pool = mode === '-c' ? [s.length, s.length + 2, s.split(' ').length, s.length - 1] : mode === '-w' ? [s.split(' ').length + 1, s.split(' ').length - 1, s.length, 1] : [0, 2, s.split(' ').length, s.length];
          return {
            type: 'unica',
            text: `Qual é a saída do comando abaixo?\n\n${block(`$ wc ${mode} <<< "${s}"`)}`,
            options: mcq(rng, String(correct), pool.map(String), 4),
            explanation: mode === '-c' ? `A *here string* envia o texto **mais um \`\\n\` final** para o stdin do comando. "${s}" tem ${s.length} caracteres, e o newline acrescentado faz \`wc -c\` contar **${s.length + 1}** bytes.` : mode === '-w' ? `\`wc -w\` conta palavras: a here string "${s}" tem ${correct}.` : '`wc -l` conta quebras de linha: a here string envia o texto seguido de um único `\\n`, logo 1.',
            ref: ['101:p.286-287'],
            verify: { sh: `wc ${mode} <<< "${s}"`, expect: String(correct) },
          };
        }
        if (fmt === 'hd-count') {
          const nl = rng.int(2, 4);
          const ls = Array.from({ length: nl }, () => rng.sample(WORDS, rng.int(1, 3)).join(' '));
          const mode = rng.pick(['-c', '-l', '-w']);
          const body = ls.join('\n') + '\n';
          const correct = mode === '-c' ? bytes(body) : mode === '-l' ? nl : ls.join(' ').split(' ').length;
          const pool = mode === '-c' ? [bytes(body) - 1, bytes(body) - nl, bytes(body) + 1, bytes(ls.join('')) ] : mode === '-l' ? [nl + 1, nl - 1, nl + 2] : [nl, correct + 1, correct - 1, bytes(body)];
          const term = rng.pick(['EOF', 'FIM', 'END']);
          return {
            type: 'unica',
            text: `Quanto imprime o comando abaixo (*here document*)?\n\n${block(`$ wc ${mode} <<${term}\n${ls.join('\n')}\n${term}`)}`,
            options: mcq(rng, String(correct), pool.map(String), 4),
            explanation: `O *here document* envia ao stdin todas as linhas entre \`<<${term}\` e a linha que contém só \`${term}\`, **cada uma terminada por \`\\n\`** (o termo final não entra). Texto enviado: ${JSON.stringify(body)}. ${mode === '-c' ? `Bytes = ${bytes(body)} (letras + espaços + ${nl} newlines).` : mode === '-l' ? `São ${nl} linhas.` : `São ${correct} palavras.`}`,
            ref: ['101:p.286-287'],
            verify: { sh: `wc ${mode} <<${term}\n${ls.join('\n')}\n${term}`, expect: String(correct) },
          };
        }
        if (fmt === 'hd-expand') {
          const name = rng.pick(['Ana', 'Bruno', 'Carla', 'Diego']);
          const varn = rng.pick(['NOME', 'USUARIO', 'CLIENTE']);
          const delimKind = rng.pick(['plain', 'single', 'double', 'back']);
          const term = rng.pick(['EOF', 'FIM', 'TEXTO']);
          const delim = { plain: term, single: `'${term}'`, double: `"${term}"`, back: `\\${term}` }[delimKind];
          const pieces = rng.sample(['v', 'vb', 'esc', 'cs'], 2);
          const mk = (p) => ({ v: ['$' + varn, name], vb: ['${' + varn + '}s', name + 's'], esc: ['\\$' + varn, '$' + varn], cs: ['$(echo ok)', 'ok'] }[p]);
          const srcLine = `Ola ${mk(pieces[0])[0]} e ${mk(pieces[1])[0]}`;
          const expandedLine = `Ola ${mk(pieces[0])[1]} e ${mk(pieces[1])[1]}`;
          const literalLine = srcLine; // com delimitador entre aspas nada é expandido (inclusive a barra invertida)
          const quoted = delimKind !== 'plain';
          const correct = quoted ? literalLine : expandedLine;
          const pool = [quoted ? expandedLine : literalLine, srcLine.replace(/\\\$/g, '$'), `Ola ${name} e ${name}`, `Ola e`, srcLine.replace(/\$\(echo ok\)/, 'echo ok'), expandedLine.replace(/ok/g, '$(echo ok)')];
          return {
            type: 'unica',
            text: `Com a variável definida, qual é a saída do *here document* abaixo?\n\n${block(`$ ${varn}=${name}\n$ cat <<${delim}\n${srcLine}\n${term}`)}`,
            options: mcq(rng, correct, pool, 4),
            explanation: quoted ? `Quando o termo de fim vem **entre aspas** (ou com barra invertida) — \`<<${delim}\` — o Bash **não expande nada** no texto: variáveis, \`$(...)\` e até a barra invertida ficam literais. Saída: \`${correct}\`.`
              : `Com o termo de fim **sem aspas**, o texto do *here document* sofre expansão de variáveis e de \`$(...)\`; \`\\$\` impede a expansão (sai \`$\`). Saída: \`${correct}\`.`,
            ref: ['101:p.286-287'],
            verify: { sh: `${varn}=${name}\ncat <<${delim}\n${srcLine}\n${term}`, expect: correct },
          };
        }
        // hs-filter
        const w = rng.sample(WORDS, rng.int(1, 2)).join(' ');
        const filt = rng.pick([
          { c: 'tr a-z A-Z', f: (s) => s.toUpperCase() },
          { c: 'rev', f: (s) => [...s].reverse().join('') },
          { c: 'cut -c1-3', f: (s) => s.slice(0, 3) },
          { c: 'tr -d aeiou', f: (s) => s.replace(/[aeiou]/g, '') },
          { c: 'sed s/o/0/g', f: (s) => s.replace(/o/g, '0') },
          { c: 'tr " " _', f: (s) => s.replace(/ /g, '_') },
        ]);
        const correct = filt.f(w);
        const wrongs = [w, filt.f(w).toUpperCase(), w.toUpperCase(), [...w].reverse().join(''), w.slice(0, 3), `${correct}\n`.trim() + ' '].filter((x) => x.trim() !== correct);
        if (new Set(wrongs).size < 3) return null;
        return {
          type: 'unica',
          text: `Qual é a saída do comando abaixo?\n\n${block(`$ ${filt.c} <<< "${w}"`)}`,
          options: mcq(rng, correct, wrongs, 4),
          explanation: `A *here string* \`<<< "${w}"\` alimenta o stdin do filtro com o texto (mais uma quebra de linha); \`${filt.c}\` transforma esse texto e imprime \`${correct}\`.`,
          ref: ['101:p.286-287'],
          verify: { sh: `${filt.c} <<< "${w}"`, expect: correct },
        };
      });
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'io-wc-forms', obj: '103.4', nivel: 2, peso: 2,
    make(rng) {
      return retry(() => {
        const f = rng.pick(['dados.txt', 'notas.txt', 'lista.txt', 'itens.txt']);
        const g = rng.pick(['outro.txt', 'extra.txt', 'mais.txt']);
        const nl = rng.int(3, 9);
        const only = [
          { t: `wc -l < ${f}`, ok: true, why: 'o `<` faz o `wc` ler o stdin: ele não sabe o nome do arquivo e imprime só o número' },
          { t: `cat ${f} | wc -l`, ok: true, why: 'o `wc` lê o pipe (stdin) e, sem nome de arquivo, imprime só o número' },
          { t: `sed -n '$=' ${f}`, ok: true, why: '`$=` imprime o número da última linha, sem nome de arquivo' },
          { t: `grep -c '' ${f}`, ok: true, why: '`grep -c` com um único arquivo imprime só a contagem de linhas' },
        ];
        const bad = [
          { t: `wc -l ${f}`, why: 'com um nome de arquivo como argumento o `wc` imprime `N arquivo`' },
          { t: `wc -l ${f} ${g}`, why: 'com dois arquivos imprime uma linha por arquivo e uma linha `total`' },
          { t: `wc ${f}`, why: 'sem opções imprime linhas, palavras, bytes e o nome do arquivo' },
          { t: `nl ${f}`, why: '`nl` numera as linhas e as imprime, não conta' },
          { t: `grep -c '' ${f} ${g}`, why: 'com dois arquivos o `grep -c` prefixa cada contagem com o nome (`arquivo:N`)' },
          { t: `wc -lw < ${f}`, why: 'imprime dois números (linhas e palavras)' },
          { t: `cat -n ${f}`, why: '`cat -n` mostra o conteúdo numerado' },
        ];
        const nOk = rng.int(2, 3);
        const oks = rng.sample(only, nOk);
        const nWrong = rng.int(5, 6) - nOk;
        const bads = rng.sample(bad, nWrong);
        const options = multi(rng, oks.map((o) => o.t), bads.map((b) => b.t), nWrong);
        const all = [...oks, ...bads];
        const shown = options.map((o) => o.t);
        const probes = shown.map((t) => `o=$({ ${t}; } 2>&1); [[ "$o" =~ ^[0-9]+$ ]] && echo S || echo N`);
        const expectLines = options.map((o) => (o.ok ? 'S' : 'N'));
        return {
          type: 'multipla',
          text: `O arquivo \`${f}\` tem ${nl} linhas e \`${g}\` também existe. Quais comandos imprimem **somente o número de linhas** do arquivo \`${f}\` (apenas um número, sem nome de arquivo nem outras colunas)?`,
          options,
          explanation: `Quando o programa recebe o arquivo como **argumento**, ele conhece o nome e o imprime junto; quando lê o **stdin** (\`<\` ou pipe), não há nome. ` +
            all.filter((a) => shown.includes(a.t)).map((a) => `\`${a.t}\`: ${a.why}.`).join(' '),
          ref: ['101:p.285', '101:p.293-294'],
          verify: {
            sh: `cd "$(mktemp -d)"\nfor i in $(seq 1 ${nl}); do echo "linha $i"; done > ${f}\nprintf 'a\\n' > ${g}\n${probes.join('\n')}`,
            expect: expectLines.join('\n'),
          },
        };
      });
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'io-self-overwrite', obj: '103.4', nivel: 3, peso: 2,
    make(rng) {
      return retry(() => {
        const f = rng.pick(['nomes.txt', 'lista.txt', 'itens.txt', 'dados.txt']);
        const lines = rng.sample(['pera', 'uva', 'maca', 'kiwi', 'figo', 'lima', 'manga', 'caju'], rng.int(3, 5));
        const filters = [
          { c: 'sort', fn: (l) => [...l].sort(), o: true },
          { c: 'sort -r', fn: (l) => [...l].sort().reverse(), o: true },
          { c: 'tac', fn: (l) => [...l].reverse(), o: false },
          { c: 'head -n 2', fn: (l) => l.slice(0, 2), o: false },
          { c: 'tail -n 2', fn: (l) => l.slice(-2), o: false },
        ];
        const fl = rng.pick(filters);
        const forms = [
          { t: `${fl.c} ${f} > ${f}`, res: () => [] , why: 'o `>` trunca o arquivo **antes** de o comando ler: o programa lê um arquivo já vazio e o resultado é vazio' },
          { t: `${fl.c} < ${f} > ${f}`, res: () => [], why: 'o shell abre (e trunca) o arquivo de saída antes de executar o comando, mesmo que a entrada seja o mesmo arquivo' },
          { t: `${fl.c} ${f} >> ${f}`, res: (l) => [...l, ...fl.fn(l)], why: '`>>` não trunca; o comando lê todo o arquivo e a saída é acrescentada ao final' },
          { t: `${fl.c} ${f} > tmp.txt && mv tmp.txt ${f}`, res: (l) => fl.fn(l), why: 'a saída vai para um arquivo temporário, que depois substitui o original' },
        ];
        if (fl.o) forms.push({ t: `sort ${fl.c.includes('-r') ? '-r ' : ''}-o ${f} ${f}`, res: (l) => fl.fn(l), why: 'a opção `-o` do `sort` grava o resultado no arquivo só depois de ler toda a entrada' });
        const form = rng.pick(forms);
        const res = form.res(lines);
        const txt = (l) => (l.length ? l.join(' ') : 'o arquivo fica vazio (0 bytes)');
        const correct = txt(res);
        const pool = [txt(lines), txt(fl.fn(lines)), txt([...lines, ...fl.fn(lines)]), txt([]), txt([...fl.fn(lines), ...lines]), txt(fl.fn(lines).slice(0, 1))];
        return {
          type: 'unica',
          text: `O arquivo \`${f}\` contém, uma por linha, as palavras: ${lines.map((l) => '`' + l + '`').join(', ')} (nessa ordem). Depois do comando abaixo, qual é o conteúdo de \`${f}\`?\n\n${block('$ ' + form.t)}`,
          options: mcq(rng, correct, pool, 4),
          explanation: `${form.why[0].toUpperCase()}${form.why.slice(1)}. Resultado: ${correct}. Regra geral: **nunca** use o mesmo arquivo como entrada e saída de um redirecionamento \`>\`; use um arquivo temporário (ou \`sort -o\`, \`sed -i\`).`,
          ref: ['101:p.284-285'],
          verify: {
            sh: `cd "$(mktemp -d)"\nprintf '%s\\n' ${lines.join(' ')} > ${f}\n${form.t} 2>/dev/null\nif [ -s ${f} ]; then paste -s -d' ' ${f}; else echo 'o arquivo fica vazio (0 bytes)'; fi`,
            expect: correct,
          },
        };
      });
    },
  },
];

function modeExplain(m, lines, out) {
  const base = `O arquivo tem ${lines.length} linha${lines.length === 1 ? '' : 's'} (${lines.join(' / ')}). `;
  if (m.mode === 'n') return `${base}Por padrão o \`xargs\` divide a entrada em **palavras** (espaços e quebras de linha são separadores) e as junta em argumentos de \`echo\`; \`-n N\` limita a N argumentos por execução. Saída: ${out.map((o) => '`' + o + '`').join(' | ')} (${out.length} ${out.length === 1 ? 'execução' : 'execuções'}).`;
  if (m.mode === 'L') return `${base}\`-L ${m.k}\` usa ${m.k} **linha${m.k > 1 ? 's' : ''} de entrada** por execução (todas as palavras dessas linhas viram argumentos). Saída: ${out.map((o) => '`' + o + '`').join(' | ')}.`;
  if (m.mode === 'I') return `${base}Com \`-I\`, cada **linha inteira** da entrada (inclusive os espaços internos) vira um argumento que substitui o marcador, e o comando roda uma vez por linha. Saída: ${out.map((o) => '`' + o + '`').join(' | ')}.`;
  return `${base}\`-d '\\n'\` faz o \`xargs\` usar só a quebra de linha como separador: cada linha (com os espaços) é **um** argumento${m.n ? `; \`-n ${m.n}\` limita a ${m.n} por execução` : ''}. Saída: ${out.map((o) => '`' + o + '`').join(' | ')}.`;
}
