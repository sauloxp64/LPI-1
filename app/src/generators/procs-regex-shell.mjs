// 103.5 / 103.6 — sinais, jobs, ps, kill/pkill, screen/tmux, nice/renice, PR x NI.
// Este arquivo também exporta helpers usados por procs-regex-shell2/3/4.mjs.
import { mcq, multi, code, block } from './util.mjs';

/** Aspas simples para o shell. */
export const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
/** "a, b e c" */
export const juntar = (a, sep = ', ', e = ' e ') => (a.length < 2 ? a.join('') : a.slice(0, -1).join(sep) + e + a[a.length - 1]);
/** mcq numérico: completa o pool com inteiros aleatórios de [lo, hi] se faltar distrator. */
export function numOpts(rng, correct, pool, lo = 0, hi = 19, total = 4) {
  const set = new Set(pool.map(String)); set.delete(String(correct));
  let g = 0; while (set.size < total - 1 && g++ < 300) { const v = String(rng.int(lo, hi)); if (v !== String(correct)) set.add(v); }
  return mcq(rng, String(correct), [...set], total);
}
/** Verificação "qual comando produz `target`": imprime 1 (saída == target) ou 0 para cada comando; o correto deve ser o primeiro. */
export function chooseVerify(setup, cmds, target) {
  const exp = target === '' ? ': > .exp' : `printf '%s\\n' ${sq(target)} > .exp`;
  return {
    sh: `cd "$(mktemp -d)"\n${setup}\n${exp}\nr() { ( eval "$1" ) 2>&1 | cmp -s - .exp && printf 1 || printf 0; }\n${cmds.map((c) => `r ${sq(c)}`).join('\n')}\necho`,
    expect: '1' + '0'.repeat(cmds.length - 1),
  };
}

// ---------------------------------------------------------------- sinais
const SIGS = [
  ['HUP', 1, 'o terminal de controle foi fechado (hangup); daemons costumam relê a configuração'],
  ['INT', 2, 'interrupção pelo teclado (Ctrl+C)'],
  ['QUIT', 3, 'saída pelo teclado (Ctrl+\\), com core dump'],
  ['KILL', 9, 'encerramento imediato e incondicional, que não pode ser capturado nem ignorado'],
  ['USR1', 10, 'sinal 1 definido pelo usuário/aplicação'],
  ['SEGV', 11, 'violação de segmento (acesso inválido à memória)'],
  ['USR2', 12, 'sinal 2 definido pelo usuário/aplicação'],
  ['PIPE', 13, 'escrita em um pipe sem leitor'],
  ['ALRM', 14, 'o temporizador de alarm() expirou'],
  ['TERM', 15, 'pedido de término educado; é o sinal padrão de kill, killall e pkill'],
  ['CHLD', 17, 'um processo filho terminou ou foi parado'],
  ['CONT', 18, 'retomar um processo parado'],
  ['STOP', 19, 'parar (suspender) o processo, sem possibilidade de captura ou de ser ignorado'],
  ['TSTP', 20, 'parada pelo teclado (Ctrl+Z); pode ser capturado'],
];
const sigByName = Object.fromEntries(SIGS.map((s) => [s[0], s]));
const SIGCMD_KILL = (name, p) => ({ // formas equivalentes de pedir o mesmo sinal
  num: `kill -${sigByName[name][1]} ${p}`, nome: `kill -${name} ${p}`, sig: `kill -SIG${name} ${p}`, s: `kill -s ${name} ${p}`, sn: `kill -s ${sigByName[name][1]} ${p}`,
});

const sigNumName = {
  id: 'sig-num-name', obj: '103.5', nivel: 1, peso: 2,
  make(rng) {
    const fmt = rng.pick(['num2nome', 'nome2num', 'desc', 'status']);
    const s = rng.pick(SIGS); const [name, num, desc] = s;
    const nomes = (ex) => SIGS.filter((x) => x[0] !== ex).map((x) => `SIG${x[0]}`);
    if (fmt === 'num2nome') {
      return {
        type: 'unica',
        text: `Qual sinal é enviado ao processo pelo comando abaixo?\n\n${block(`kill -${num} 2310`)}`,
        options: mcq(rng, `SIG${name}`, nomes(name)),
        explanation: `\`kill -l\` lista os sinais: ${num} corresponde a SIG${name} — ${desc}. Um número depois do hífen em \`kill\` é sempre o número do sinal (e não um PID).`,
        ref: ['101:p.312-314'],
        verify: { sh: `kill -l ${num}`, expect: name },
      };
    }
    if (fmt === 'nome2num') {
      return {
        type: 'lacuna',
        text: `Qual é o número do sinal \`SIG${name}\` no Linux (como mostrado por \`kill -l\`)? Responda apenas com o número.`,
        answers: [String(num)],
        explanation: `Em \`kill -l\`, ${num}) SIG${name}. Equivalentes: \`kill -${num} PID\`, \`kill -${name} PID\`, \`kill -SIG${name} PID\` e \`kill -s ${name} PID\`. Significado: ${desc}.`,
        ref: ['101:p.312-314'],
        verify: { sh: `kill -l SIG${name}`, expect: String(num) },
      };
    }
    if (fmt === 'desc') {
      const opts = mcq(rng, `SIG${name} (${num})`, SIGS.filter((x) => x[0] !== name).map((x) => `SIG${x[0]} (${x[1]})`));
      return {
        type: 'unica',
        text: `Qual sinal tem o seguinte significado: ${desc}?`,
        options: opts,
        explanation: `${desc[0].toUpperCase() + desc.slice(1)} é o SIG${name}, número ${num} (veja \`kill -l\`). Guarde os principais: 1 HUP, 2 INT, 3 QUIT, 9 KILL, 15 TERM, 18 CONT, 19 STOP, 20 TSTP.`,
        ref: ['101:p.312-314'],
        verify: { sh: `kill -l ${num}`, expect: name },
      };
    }
    const sinal = rng.pick(SIGS.filter((x) => [1, 2, 3, 9, 10, 12, 14, 15].includes(x[1])));
    const st = 128 + sinal[1];
    return {
      type: 'unica',
      text: `Um script verifica o status de saída de um programa e encontra \`$?\` igual a ${st}. Qual é a explicação mais provável?`,
      options: mcq(rng, `O programa foi encerrado pelo sinal SIG${sinal[0]} (${st} = 128 + ${sinal[1]})`, [
        `O programa terminou normalmente e retornou o valor ${st} com \`exit ${st}\` por acaso, pois valores acima de 127 indicam sucesso`,
        `O programa não foi encontrado no PATH (comando inexistente)`,
        `O programa foi encontrado, mas não tinha permissão de execução`,
        `O programa foi encerrado pelo sinal SIG${(SIGS.find((x) => x[1] === sinal[1] + 1) ?? SIGS[0])[0]} (${st} = ${sinal[1] + 1} + 128 - 1)`,
        `O programa terminou com erro de sintaxe do shell`,
      ]),
      explanation: `Quando um processo morre por um sinal N, o shell relata o status 128+N. Aqui ${st} − 128 = ${sinal[1]}, ou seja, SIG${sinal[0]} (\`kill -l ${st}\` também mostra ${sinal[0]}). Comando não encontrado é 127 e sem permissão de execução é 126.`,
      ref: ['101:p.312-314'],
      verify: { sh: `kill -l ${st}`, expect: sinal[0] },
    };
  },
};

const CATCH = ['HUP', 'INT', 'QUIT', 'USR1', 'USR2', 'ALRM', 'TERM', 'TSTP'];
const trapOut = (name) => name === 'KILL' ? 'status=137' : name === 'STOP' ? 'after\nstatus=0' : null;
const sigCatch = {
  id: 'sig-catch', obj: '103.5', nivel: 2, peso: 2,
  make(rng) {
    const fmt = rng.pick(['nao', 'multi-pode', 'multi-nao', 'comportamento']);
    const nCatch = (n) => rng.sample(CATCH, n);
    const trapSh = (n) => `bash -c 'trap "echo caught" ${n}; kill -${n} $$; echo after' | paste -sd' ' -`;
    const killStop = (n) => (n === 'KILL'
      ? `out=$( { bash -c 'trap "echo caught" KILL; kill -KILL $$; echo after'; echo "status=$?"; } 2>/dev/null ); echo "$out"`
      : `bash -c 'trap "echo caught" STOP; kill -STOP $$; echo after' & p=$!; sleep 0.3; kill -CONT $p; wait $p; echo "status=$?"`);
    const expl = 'Os sinais SIGKILL (9) e SIGSTOP (19) são tratados diretamente pelo kernel: não podem ser capturados (trap/handler) nem ignorados. Todos os outros (HUP, INT, QUIT, USR1, USR2, ALRM, TERM, TSTP, CONT...) podem. Por isso `kill -9` é o último recurso, mas impede qualquer limpeza pelo processo.';
    if (fmt === 'nao') {
      const bad = rng.pick(['KILL', 'STOP']); const good = nCatch(3);
      return {
        type: 'unica',
        text: 'Qual dos sinais abaixo **não** pode ser capturado nem ignorado por um processo comum?',
        options: mcq(rng, `SIG${bad}`, good.map((g) => `SIG${g}`), 4),
        explanation: expl,
        ref: ['101:p.312-314'],
        verify: { sh: `${killStop(bad)}\n${good.map((g) => trapSh(g)).join('\n')}`, expect: `${trapOut(bad)}\n${good.map(() => 'caught after').join('\n')}` },
      };
    }
    if (fmt === 'multi-pode' || fmt === 'multi-nao') {
      const inv = fmt === 'multi-nao'; const good = nCatch(3);
      const verifySh = `${killStop('KILL')}\n${killStop('STOP')}\n${good.map((g) => trapSh(g)).join('\n')}`;
      return {
        type: 'multipla',
        text: inv ? 'Quais dos sinais abaixo **não** podem ser capturados nem ignorados? (escolha todos)' : 'Quais dos sinais abaixo **podem** ser capturados com `trap` (ou tratados por um handler) pelo processo? (escolha todos)',
        options: inv ? multi(rng, ['SIGKILL', 'SIGSTOP'], good.map((g) => `SIG${g}`), 3) : multi(rng, good.map((g) => `SIG${g}`), ['SIGKILL', 'SIGSTOP'], 2),
        explanation: expl,
        ref: ['101:p.312-314'],
        verify: { sh: verifySh, expect: `${trapOut('KILL')}\n${trapOut('STOP')}\n${good.map(() => 'caught after').join('\n')}` },
      };
    }
    const alvo = rng.pick(['KILL', ...CATCH.filter((c) => c !== 'TSTP'), 'KILL']);
    const kill = alvo === 'KILL';
    const text = `Considere o script abaixo, executado por \`bash script.sh\`:\n\n${block(`trap 'echo recebi' ${alvo}\nkill -${alvo} $$\necho depois`)}\n\nO que acontece?`;
    const A = '`recebi` e, em seguida, `depois` são impressos (o sinal é tratado e o script continua)';
    const B = 'Apenas `depois` é impresso (o sinal é ignorado)';
    const C = '`recebi` é impresso e o script termina sem imprimir `depois`';
    const D = 'O script é encerrado imediatamente, sem imprimir nada';
    return {
      type: 'unica', text,
      options: [{ t: A, ok: !kill }, { t: B, ok: false }, { t: C, ok: false }, { t: D, ok: kill }],
      explanation: kill ? `SIGKILL não pode ser capturado: o \`trap\` é inútil, o shell morre na hora (status 137 = 128+9) e nem \`recebi\` nem \`depois\` aparecem.` : `SIG${alvo} pode ser capturado. O \`trap\` executa \`echo recebi\` quando o sinal chega e, como o handler não encerra o shell, o script segue e imprime \`depois\`.`,
      ref: ['101:p.312-314'],
      verify: kill ? { sh: killStop('KILL'), expect: 'status=137' } : { sh: `${trapSh(alvo).replace('caught', 'recebi').replace('echo after', 'echo depois')}`.replace('after', 'depois'), expect: 'recebi depois' },
    };
  },
};

// ---------------------------------------------------------------- controle de jobs
function jobsSim(ops) {
  const J = new Map(); let cur = null; let prev = null;
  const st = (i) => J.get(i)?.state === 'Stopped';
  const desc = () => [...J.keys()].sort((a, b) => b - a);
  const setCurrent = (j) => {
    if (cur !== j) { prev = cur; cur = j; }
    if (prev !== cur && prev != null && J.has(prev) && st(prev)) return;
    let c = desc().find((i) => st(i) && i !== cur);
    if (c !== undefined) { prev = c; return; }
    c = desc().find((i) => i !== cur);
    prev = c ?? null;
  };
  const reset = () => {
    let c = null;
    if (cur != null && J.has(cur) && st(cur)) c = cur;
    else {
      if (prev != null && J.has(prev) && st(prev)) c = prev;
      if (c == null) c = desc().find((i) => st(i)) ?? null;
      if (c == null) c = desc().find((i) => J.get(i).state === 'Running') ?? null;
    }
    if (c != null) setCurrent(c); else { cur = null; prev = null; }
  };
  for (const op of ops) {
    if (op.k === 'bg') {
      let id = 1; while (J.has(id)) id++;
      J.set(id, { state: 'Running', cmd: op.cmd });
      if (cur == null || !st(cur)) setCurrent(id); else if (prev == null || !st(prev)) prev = id;
      op.id = id;
    } else if (op.k === 'stop') { J.get(op.id).state = 'Stopped'; setCurrent(op.id); }
    else if (op.k === 'resume') { const id = op.id ?? cur; op.id = id; J.get(id).state = 'Running'; reset(); }
    else if (op.k === 'kill') { J.delete(op.id); if (op.id === cur || op.id === prev) reset(); }
  }
  return { J, cur, prev };
}

const JOB_CMDS = ['sleep 300', 'sleep 500', 'ping -c 100 localhost', 'tar czf bkp.tgz /home', 'find / -name "*.log"', 'sort grande.txt', 'cp img.iso /mnt/usb', 'top -b'];
const jobsSeq = { id: 'jobs-seq', obj: '103.5', nivel: 3, peso: 2, make: (rng) => makeJobs(rng, JOB_CMDS) };
function makeJobs(rng, CMDS) {
  // monta a sequência passo a passo, mantendo o simulador atualizado
  const cmds = rng.sample(CMDS, 4);
  const total = rng.int(3, 4);
  const ops = []; const lines = []; let used = 0;
  const run = () => { const o = ops.map((x) => ({ ...x })); const s = jobsSim(o); return { s, o }; };
  const aliveIds = () => [...run().s.J.keys()];
  const stateOf = (id) => run().s.J.get(id)?.state;
  // primeiros jobs
  for (let i = 0; i < total; i++) {
    const c = cmds[used++];
    if (rng.chance(0.4)) {
      ops.push({ k: 'bg', cmd: c });
      const id = run().o.filter((x) => x.k === 'bg').pop().id;
      ops.push({ k: 'stop', id });
      lines.push(`$ ${c}`, '^Z', `[${id}]+  Stopped                 ${c}`);
    } else {
      ops.push({ k: 'bg', cmd: c });
      const id = run().o.filter((x) => x.k === 'bg').pop().id;
      lines.push(`$ ${c} &`, `[${id}] ${1000 + id * 17}`);
    }
  }
  // 1 a 2 ações extras
  const extra = rng.int(1, 2);
  for (let e = 0; e < extra; e++) {
    const ids = aliveIds(); const { s } = run();
    const stoppedIds = ids.filter((i) => s.J.get(i).state === 'Stopped');
    const runIds = ids.filter((i) => s.J.get(i).state === 'Running');
    const choices = [];
    if (stoppedIds.length) choices.push('bg-id', 'bg', 'kill-stopped');
    if (runIds.length) choices.push('kill', 'kill', 'tstp');
    if (ids.length >= 2) choices.push('kill');
    const a = rng.pick(choices);
    if (a === 'bg-id') { const id = rng.pick(stoppedIds); ops.push({ k: 'resume', id }); lines.push(`$ bg %${id}`); }
    else if (a === 'bg') { ops.push({ k: 'resume', id: null }); lines.push('$ bg'); }
    else if (a === 'kill-stopped') { const id = rng.pick(stoppedIds); ops.push({ k: 'kill', id }); lines.push(`$ kill %${id}`); }
    else if (a === 'kill') { const id = rng.pick(runIds); ops.push({ k: 'kill', id }); lines.push(`$ kill %${id}`); }
    else { const id = rng.pick(runIds); ops.push({ k: 'stop', id }); lines.push(`$ kill -STOP %${id}`); }
  }
  const { s } = run();
  const ids = [...s.J.keys()].sort((a, b) => a - b);
  if (!ids.length) return makeJobs(rng, CMDS);
  const flag = (id) => (id === s.cur ? '+' : id === s.prev ? '-' : ' ');
  const lst = ids.map((id) => `${id}${flag(id).trim()} ${s.J.get(id).state}`);
  // script de verificação com bash real (job control ligado)
  const inner = `exec 2>/dev/null\nset -m\nw() { sleep 0.15; jobs >/dev/null; }\n` + ops.map((o) => {
    if (o.k === 'bg') return `sleep ${1000 + o.cmd.length * 7} & w`;
    if (o.k === 'stop') return `kill -STOP %${o.id}; w`;
    if (o.k === 'resume') return o.id == null ? 'bg >/dev/null; w' : `bg %${o.id} >/dev/null; w`;
    return `kill %${o.id}; w`;
  }).join('\n') + `\njobs | sed -E 's/^\\[([0-9]+)\\]([+-]?) +([A-Za-z]+).*/\\1\\2 \\3/' | tr '\\n' ';'\nkill -9 $(jobs -p) ; echo`;
  const sh = `bash -c ${sq(inner)}`;
  const fmt = rng.pick(['estado', 'fg', 'contagem', 'pm']);
  const transcr = block(lines.join('\n'));
  const ref = ['101:p.306-310'];
  const baseExpl = 'Regras: `cmd &` cria um job em segundo plano (Running); Ctrl+Z suspende o job em primeiro plano (Stopped) e o torna o job atual (`+`); `bg` (sem argumento) retoma o job atual em segundo plano; `kill %n` envia SIGTERM ao job n (o bash também o acorda se estiver parado) e ele some da lista; o job marcado com `+` é o padrão de `fg`/`bg`, e `-` é o anterior.';
  const detalhe = `Estado final de \`jobs\`: ${lst.map((x) => '[' + x.replace(' ', '] ')).join('; ')}.`;
  const verify = { sh, expect: lst.join(';') + ';' };
  if (fmt === 'estado') {
    const id = rng.pick(ids); const real = s.J.get(id).state;
    return {
      type: 'unica', text: `Em um shell interativo com controle de jobs, a sequência abaixo foi digitada (a saída de \`jobs\` ainda não foi pedida):\n\n${transcr}\n\nQual é o estado do job \`[${id}]\` (**${s.J.get(id).cmd}**) na próxima execução de \`jobs\`?`,
      options: mcq(rng, real, ['Running', 'Stopped', 'Done', 'Terminated', 'Detached'].filter((x) => x !== real), 4),
      explanation: `${baseExpl} ${detalhe}`, ref, verify,
    };
  }
  if (fmt === 'fg') {
    const cur = s.cur;
    const wrongs = ids.filter((i) => i !== cur).map((i) => `O job [${i}] (${s.J.get(i).cmd})`);
    wrongs.push('Nenhum: `fg` exige sempre um argumento (%n)', 'O job de maior número, sempre', 'O job de menor número, sempre');
    return {
      type: 'unica', text: `Em um shell interativo com controle de jobs, a sequência abaixo foi digitada:\n\n${transcr}\n\nQual job será trazido para o primeiro plano por um \`fg\` **sem argumentos**?`,
      options: mcq(rng, `O job [${cur}] (${s.J.get(cur).cmd})`, wrongs, 4),
      explanation: `${baseExpl} ${detalhe} O job atual (marcado com \`+\`) é o [${cur}].`, ref, verify,
    };
  }
  if (fmt === 'contagem') {
    const parados = ids.filter((i) => s.J.get(i).state === 'Stopped').length;
    return {
      type: 'lacuna', text: `Em um shell interativo com controle de jobs, a sequência abaixo foi digitada:\n\n${transcr}\n\nQuantos jobs aparecem como \`Stopped\` em \`jobs -s\` (ou em \`jobs\`)? Responda com um número.`,
      answers: [String(parados)], explanation: `${baseExpl} ${detalhe} Parados: ${parados}.`, ref, verify,
    };
  }
  const plus = s.cur; const alvo = s.J.get(plus);
  return {
    type: 'unica', text: `Em um shell interativo com controle de jobs, a sequência abaixo foi digitada:\n\n${transcr}\n\nNa listagem de \`jobs\`, qual job aparece marcado com \`+\` e em que estado?`,
    options: mcq(rng, `[${plus}] ${alvo.state}`, [...ids, ids[ids.length - 1] + 1].flatMap((i) => ['Running', 'Stopped'].map((x) => `[${i}] ${x}`)), 4),
    explanation: `${baseExpl} ${detalhe}`, ref, verify,
  };
}

// ---------------------------------------------------------------- ps, pgrep/pkill/killall, STAT
const HDR = { // cabeçalhos reais do procps (Debian 12)
  pid: 'PID', ppid: 'PPID', user: 'USER', uid: 'UID', ni: 'NI', pcpu: '%CPU', pmem: '%MEM', vsz: 'VSZ', rss: 'RSS', stat: 'STAT', etime: 'ELAPSED', comm: 'COMMAND', cmd: 'CMD', pri: 'PRI', tty: 'TT',
};
const SIMIL = { user: 'uid', uid: 'user', pcpu: 'pmem', pmem: 'pcpu', vsz: 'rss', rss: 'vsz', comm: 'cmd', cmd: 'comm', ni: 'pri', pri: 'ni', pid: 'ppid', ppid: 'pid', stat: 'tty', tty: 'stat', etime: 'stat' };
const PSFORM = [
  ['ps aux', 'USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND'],
  ['ps -ef', 'UID PID PPID C STIME TTY TIME CMD'],
  ['ps -el', 'F S UID PID PPID C PRI NI ADDR SZ WCHAN TTY TIME CMD'],
  ['ps', 'PID TTY TIME CMD'],
  ['ps ax', 'PID TTY STAT TIME COMMAND'],
];
const psCols = {
  id: 'ps-cols', obj: '103.5', nivel: 2, peso: 2,
  make(rng) {
    if (rng.chance(0.5)) {
      const keys = rng.sample(Object.keys(HDR).filter((k) => k !== 'cmd'), rng.int(3, 4));
      const header = keys.map((k) => HDR[k]).join(' ');
      const mk = (ks) => `ps -o ${ks.join(',')} -p 1`;
      const pool = [];
      for (let i = 0; i < keys.length; i++) {
        const sw = keys.slice(); const j = (i + 1) % keys.length; [sw[i], sw[j]] = [sw[j], sw[i]]; pool.push(mk(sw));
        if (SIMIL[keys[i]] && !keys.includes(SIMIL[keys[i]]) && HDR[SIMIL[keys[i]]] !== HDR[keys[i]]) { const rp = keys.slice(); rp[i] = SIMIL[keys[i]]; pool.push(mk(rp)); }
      }
      pool.push(`ps -O ${keys.join(',')} -p 1`, `ps -p 1 -o ${keys.slice().reverse().join(',')}`);
      const options = mcq(rng, mk(keys), pool.filter((p) => p !== mk(keys)));
      const ordered = [options.find((o) => o.ok), ...options.filter((o) => !o.ok)].map((o) => `${o.t} | head -1 | tr -s ' ' | sed 's/^ //'`);
      return {
        type: 'unica',
        text: `Qual comando mostra, para o processo de PID 1, **somente** as colunas abaixo, nesta ordem (primeira linha da saída)?\n\n${block(header)}`,
        options,
        explanation: `\`ps -o col1,col2,...\` imprime exatamente as colunas pedidas, na ordem em que aparecem. Nomes de coluna: ${keys.map((k) => `\`${k}\` → ${HDR[k]}`).join(', ')}. \`-O\` apenas *acrescenta* colunas ao formato padrão, e colunas parecidas (como \`user\`/\`uid\`, \`comm\`/\`cmd\`, \`pcpu\`/\`pmem\`) têm cabeçalhos diferentes.`,
        ref: ['101:p.326', '101:p.319-322'],
        verify: chooseVerify('', ordered, header),
      };
    }
    const colunas = [['%MEM', ['ps aux']], ['STIME', ['ps -ef']], ['NI', ['ps -el']], ['WCHAN', ['ps -el']], ['VSZ', ['ps aux']], ['START', ['ps aux']], ['USER', ['ps aux']], ['PRI', ['ps -el']], ['C', ['ps -ef', 'ps -el']], ['PPID', ['ps -ef', 'ps -el']], ['STAT', ['ps aux', 'ps ax']]];
    const [col, ok] = rng.pick(colunas.filter((c) => c[1].length === 1));
    const hasCol = (cmd) => PSFORM.find((f) => f[0] === cmd)[1].split(' ').includes(col);
    const wrongs = PSFORM.map((f) => f[0]).filter((c) => !hasCol(c));
    const options = mcq(rng, ok[0], wrongs);
    const ordered = [options.find((o) => o.ok), ...options.filter((o) => !o.ok)].map((o) => o.t);
    return {
      type: 'unica',
      text: `Qual dos comandos abaixo produz uma listagem que inclui a coluna \`${col}\`?`,
      options,
      explanation: `Cabeçalhos reais: ${PSFORM.map((f) => `\`${f[0]}\` → ${f[1]}`).join('; ')}. Só \`${ok[0]}\` tem a coluna ${col}. Em resumo: \`ps aux\` (estilo BSD) mostra USER, %CPU, %MEM, VSZ, RSS, STAT e START; \`ps -ef\` (UNIX) mostra PPID e STIME; \`ps -el\` mostra PRI, NI e WCHAN.`,
      ref: ['101:p.319-322'],
      verify: { sh: ordered.map((c) => `${c} | head -1 | tr -s ' ' | tr ' ' '\\n' | grep -qxF -- ${sq(col)} && printf 1 || printf 0`).join('\n') + '\necho', expect: '1' + '0'.repeat(ordered.length - 1) },
    };
  },
};

const NOMES_PROC = ['backupd', 'syncer', 'indexer', 'worker', 'rotatord', 'mailq', 'collectd', 'webcache'];
const killByName = {
  id: 'kill-by-name', obj: '103.5', nivel: 2, peso: 2,
  make(rng) {
    const n = rng.pick(NOMES_PROC);
    const corretos = rng.sample([`pkill ${n}`, `killall ${n}`, `kill $(pgrep ${n})`, `kill $(pidof ${n})`], 3);
    const errados = [`kill ${n}`, `kill -9 ${n}`, `pgrep ${n}`, `pidof ${n}`, `kill %${n}`];
    const options = multi(rng, corretos, errados, rng.int(2, 3));
    const all = options.map((o) => o.t);
    const sh = `exec 2>/dev/null\ncd "$(mktemp -d)"\ncp "$(command -v sleep)" ${n}\nt() { ./${n} 300 & ./${n} 301 & sleep 0.3; ( eval "$1" ) >/dev/null 2>&1; sleep 0.3; printf '%s ' "$(pgrep -c -x ${n})"; pkill -9 -x ${n}; wait; }\n${all.map((c) => `t ${sq(c)}`).join('\n')}\necho`;
    const expect = options.map((o) => (o.ok ? '0' : '2')).join(' ');
    return {
      type: 'multipla',
      text: `Existem dois processos chamados \`${n}\` em execução e você não sabe os PIDs. Quais comandos os encerram (com o sinal padrão SIGTERM)? (escolha todos)`,
      options,
      explanation: `\`pkill NOME\` e \`killall NOME\` localizam os processos pelo nome e enviam o sinal (SIGTERM por padrão). \`kill\` só aceita PIDs ou jobspecs (%n), então é preciso descobrir os PIDs antes com \`pgrep NOME\` ou \`pidof NOME\` e usar substituição de comando: \`kill $(pgrep ${n})\`. \`pgrep\` e \`pidof\` apenas listam PIDs; \`kill ${n}\` e \`kill %${n}\` falham (não há PID nem job com esse nome).`,
      ref: ['101:p.312-314'],
      verify: { sh, expect },
    };
  },
};

const psStat = {
  id: 'ps-stat', obj: '103.5', nivel: 2, peso: 1,
  make(rng) {
    const caso = rng.pick([
      { d: 'um processo `sleep 300` iniciado em segundo plano que está apenas aguardando', a: 'S', sh: 'exec 2>/dev/null; sleep 300 & p=$!; sleep 0.3; ps -o stat= -p $p; kill $p' },
      { d: 'um job suspenso com Ctrl+Z (parado por um sinal de controle de job)', a: 'T', sh: 'exec 2>/dev/null; sleep 300 & p=$!; kill -STOP $p; sleep 0.3; ps -o stat= -p $p; kill -9 $p' },
      { d: 'um processo filho que já terminou, mas cujo pai ainda não leu seu status de saída (zumbi)', a: 'Z', sh: 'exec 2>/dev/null; bash -c \'sleep 0.1 & exec sleep 3\' & q=$!; sleep 0.6; ps -o stat= --ppid $q; kill $q' },
      { d: 'um `sleep 300` iniciado com `nice -n 5` (prioridade menor que a convencional) e aguardando', a: 'SN', sh: 'exec 2>/dev/null; nice -n 5 sleep 300 & p=$!; sleep 0.3; ps -o stat= -p $p; kill $p' },
    ]);
    const pool = ['S', 'R', 'D', 'T', 'Z', 'I', 'SN', 'S<', 'S+', 'Ss'].filter((x) => x !== caso.a);
    const inverso = rng.chance(0.4);
    const letras = 'R = executando ou pronto; S = dormindo (interrompível); D = dormindo sem interrupção (E/S); T = parado por sinal de controle; Z = zumbi; < = prioridade maior que a convencional; N = prioridade menor que a convencional; + = grupo de processos em primeiro plano.';
    if (inverso) {
      const m = { S: 'dormindo, aguardando um evento (interrompível)', T: 'parado (suspenso) por um sinal de controle', Z: 'zumbi (terminou, mas o pai ainda não recolheu o status)', SN: 'dormindo, com prioridade menor que a convencional (nice positivo)' };
      return {
        type: 'unica', text: `Na coluna \`STAT\` de \`ps\`, o que indica o valor \`${caso.a}\`?`,
        options: mcq(rng, m[caso.a], Object.values(m).filter((x) => x !== m[caso.a]).concat(['executando ou pronto para executar (running)', 'dormindo sem possibilidade de interrupção, normalmente em E/S', 'processo em primeiro plano no terminal'])),
        explanation: `Códigos de STAT: ${letras}`, ref: ['101:p.321'], verify: { sh: caso.sh, expect: caso.a },
      };
    }
    return {
      type: 'unica', text: `Qual valor a coluna \`STAT\` de \`ps\` mostra para ${caso.d}?`,
      options: mcq(rng, caso.a, pool), explanation: `Códigos de STAT: ${letras} Aqui: \`${caso.a}\`.`, ref: ['101:p.321'], verify: { sh: caso.sh, expect: caso.a },
    };
  },
};

// ---------------------------------------------------------------- screen / tmux
const MUX = [
  // [ferramenta, ação, tecla, verificador]
  ['tmux', 'criar uma nova janela', 'c', ['c', 'new-window']], ['tmux', 'ir para a próxima janela', 'n', ['n', 'next-window']],
  ['tmux', 'ir para a janela anterior', 'p', ['p', 'previous-window']], ['tmux', 'listar as janelas para escolher uma', 'w', ['w', 'choose-tree -Zw']],
  ['tmux', 'desanexar (detach) da sessão atual', 'd', ['d', 'detach-client']], ['tmux', 'listar/trocar entre sessões', 's', ['s', 'choose-tree -Zs']],
  ['tmux', 'dividir a janela horizontalmente (painéis um sobre o outro)', '"', ['"', 'split-window']], ['tmux', 'dividir a janela verticalmente (painéis lado a lado)', '%', ['%', 'split-window -h']],
  ['tmux', 'fechar o painel atual (com confirmação)', 'x', ['x', 'kill-pane']], ['tmux', 'fechar a janela atual (com confirmação)', '&', ['&', 'kill-window']],
  ['tmux', 'renomear a janela atual', ',', [',', 'rename-window']], ['tmux', 'renomear a sessão atual', '$', ['$', 'rename-session']],
  ['tmux', 'ampliar/restaurar o painel atual (zoom)', 'z', ['z', 'resize-pane -Z']], ['tmux', 'entrar no modo de cópia (rolagem)', '[', ['[', 'copy-mode']],
  ['tmux', 'transformar o painel atual em uma janela', '!', ['!', 'break-pane']],
  ['screen', 'criar uma nova janela', 'c', ['C-a c,[ ]+\\(screen\\)']], ['screen', 'desanexar (detach) a sessão', 'd', ['C-a d,[ ]+\\(detach\\)']],
  ['screen', 'eliminar a janela atual (com confirmação)', 'k', ['C-a k,[ ]+\\(kill\\)']], ['screen', 'listar as janelas na parte inferior da tela', 'w', ['C-a w,[ ]+\\(windows\\)']],
  ['screen', 'renomear a janela atual', 'A', ['C-a A[ ]+\\(title\\)']], ['screen', 'dividir a tela horizontalmente (regiões)', 'S', ['C-a S[ ]+\\(split\\)']],
  ['screen', 'dividir a tela verticalmente (regiões)', '|', ['C-a \\|[ ]+\\(split -v\\)']], ['screen', 'encerrar todas as regiões, exceto a atual', 'Q', ['C-a Q[ ]+\\(only\\)']],
  ['screen', 'encerrar a região atual (a janela continua existindo)', 'X', ['C-a X[ ]+\\(remove\\)']], ['screen', 'mover o foco para a próxima região', 'Tab', ['C-a tab[ ]+\\(focus\\)']],
  ['screen', 'listar todas as janelas para escolher uma', '"', ['C-a "[ ]+\\(windowlist -b\\)']], ['screen', 'entrar no modo de cópia/rolagem', '[', ['C-a \\[,[ ]+\\(copy\\)']],
  ['screen', 'ir para a próxima janela', 'n', null], ['screen', 'ir para a janela anterior', 'p', null],
];
const PREFIX = { tmux: 'Ctrl+b', screen: 'Ctrl+a' };
const CMDS_MUX = [
  ['tmux', 'listar as sessões existentes', 'tmux ls', ['tmux list', 'tmux -ls', 'tmux sessions', 'screen -ls']], ['tmux', 'criar uma sessão chamada `web`', 'tmux new -s web', ['tmux -S web', 'tmux session web', 'screen -S web']],
  ['tmux', 'reanexar à sessão `web`', 'tmux attach -t web', ['tmux resume web', 'tmux -r web', 'screen -r web']], ['tmux', 'eliminar a sessão `web`', 'tmux kill-session -t web', ['tmux kill web', 'tmux exit -t web', 'screen -S web -X quit']],
  ['screen', 'listar as sessões existentes', 'screen -ls', ['screen -list-all', 'screen ls', 'tmux ls']], ['screen', 'criar uma sessão chamada `web`', 'screen -S web', ['screen -n web', 'screen new web', 'tmux new -s web']],
  ['screen', 'reanexar à sessão `web`', 'screen -r web', ['screen -a web', 'screen attach -t web', 'tmux attach -t web']], ['screen', 'iniciar uma sessão já desanexada', 'screen -d -m', ['screen -D -r', 'screen -m -a', 'screen -dm -x']],
];
const termMux = {
  id: 'term-mux', obj: '103.5', nivel: 1, peso: 2,
  make(rng) {
    const fmt = rng.pick(['tecla', 'acao', 'cmd', 'prefixo']);
    const ref = ['101:p.335-351'];
    const expl = 'GNU Screen usa o prefixo **Ctrl+a** (c nova janela, n/p navegar, w listar, k eliminar, A renomear, d desanexar, S/| dividir, [ copiar) e o tmux usa **Ctrl+b** (c nova janela, n/p navegar, w listar, & fechar janela, , renomear, d desanexar, " e % dividir, [ copiar). As sessões sobrevivem ao desanexar: `screen -r` / `tmux attach` reconectam.';
    const verOf = (it) => {
      if (!it[3]) return undefined;
      if (it[0] === 'tmux') return { sh: `tmux -f /dev/null new-session -d \\; list-keys -T prefix ${sq(it[3][0])} 2>&1 | grep -cF ${sq(it[3][1])}`, expect: '1' };
      return { sh: `man -P cat screen 2>/dev/null | grep -cE ${sq(it[3][0])} | sed 's/^[1-9][0-9]*$/ok/'`, expect: 'ok' };
    };
    if (fmt === 'prefixo') {
      const t = rng.pick(['tmux', 'screen']);
      return {
        type: 'unica', text: `Qual é a tecla de prefixo (chave de comando) **padrão** do ${t === 'tmux' ? 'tmux' : 'GNU Screen'}?`,
        options: mcq(rng, PREFIX[t], [PREFIX[t === 'tmux' ? 'screen' : 'tmux'], 'Ctrl+x', 'Ctrl+s', 'Ctrl+z', 'Alt+b']), explanation: expl, ref,
        verify: t === 'tmux' ? { sh: `tmux -f /dev/null new-session -d \\; show-options -g prefix`, expect: 'prefix C-b' } : { sh: `man -P cat screen 2>/dev/null | grep -cE 'C-a c,[ ]+\\(screen\\)' | sed 's/^[1-9][0-9]*$/ok/'`, expect: 'ok' },
      };
    }
    if (fmt === 'cmd') {
      const it = rng.pick(CMDS_MUX);
      return { type: 'unica', text: `Qual comando deve ser usado no shell para ${it[1]} no ${it[0] === 'tmux' ? 'tmux' : 'GNU Screen'}?`, options: mcq(rng, it[2], it[3].concat(it[3].length < 3 ? ['tmux ls'] : [])), explanation: expl, ref };
    }
    const it = rng.pick(MUX); const ou = it[0] === 'tmux' ? 'screen' : 'tmux';
    const nome = it[0] === 'tmux' ? 'tmux' : 'GNU Screen';
    const keyTxt = (t, k) => `${PREFIX[t]} e depois ${k === 'Tab' ? 'Tab' : '`' + k + '`'}`;
    if (fmt === 'tecla') {
      const same = MUX.filter((m) => m[0] === it[0] && m[2] !== it[2]);
      const pool = [keyTxt(ou, it[2]), ...rng.sample(same, 3).map((m) => keyTxt(it[0], m[2]))];
      return { type: 'unica', text: `No ${nome}, qual sequência de teclas deve ser usada para ${it[1]}?`, options: mcq(rng, keyTxt(it[0], it[2]), pool), explanation: `${expl} Neste caso: ${keyTxt(it[0], it[2])}.`, ref, verify: verOf(it) };
    }
    const same = MUX.filter((m) => m[0] === it[0] && m[1] !== it[1]);
    return { type: 'unica', text: `No ${nome}, o que faz a sequência ${keyTxt(it[0], it[2])}?`, options: mcq(rng, it[1][0].toUpperCase() + it[1].slice(1), rng.sample(same, 4).map((m) => m[1][0].toUpperCase() + m[1].slice(1))), explanation: `${expl} Neste caso: ${keyTxt(it[0], it[2])} → ${it[1]}.`, ref, verify: verOf(it) };
  },
};

// ---------------------------------------------------------------- 103.6 — nice / renice / PR x NI
const niceCalc = {
  id: 'nice-calc', obj: '103.6', nivel: 3, peso: 3,
  make(rng) {
    const forma = rng.pick(['soma', 'soma', 'padrao', 'negativo', 'legado']);
    const S = rng.int(0, 9); const ref = ['101:p.368'];
    const base = S ? `nice -n ${S} bash -c ` : 'bash -c ';
    const intro = S ? `Um shell \`bash\` foi iniciado com \`nice -n ${S} bash\` (portanto roda com niceness ${S}) por um **usuário comum**. Nele é executado:` : 'Um usuário **comum** (não root) está em um shell com niceness 0 e executa:';
    const wrapSh = (inner) => (S ? `nice -n ${S} bash -c ${sq(inner)}` : inner);
    const expl = 'O niceness vai de −20 (mais prioridade) a 19 (menos). `nice -n N cmd` **soma** N ao niceness atual do shell (e não substitui); `nice cmd` sem `-n` soma 10; o valor é limitado a 19; usuário comum não pode usar valores negativos (o `nice` avisa `cannot set niceness: Permission denied`, mas executa o comando mesmo assim sem alterar a prioridade).';
    if (forma === 'soma') {
      const k = rng.int(2, 3); const adj = Array.from({ length: k }, () => rng.int(1, 9));
      const cmd = adj.map((a) => `nice -n ${a}`).join(' ') + ' nice';
      const total = Math.min(19, S + adj.reduce((x, y) => x + y, 0));
      return {
        type: 'unica', text: `${intro}\n\n${block(cmd)}\n\nQue valor o último \`nice\` (sem argumentos, que imprime o niceness atual) escreve na tela?`,
        options: numOpts(rng, total, [adj.reduce((x, y) => x + y, 0), adj[adj.length - 1], S, 10, Math.min(19, S + 10), adj[0] + S].map((x) => String(Math.min(19, x)))),
        explanation: `${expl} Cálculo: ${[S, ...adj].join(' + ')} = ${S + adj.reduce((x, y) => x + y, 0)}${S + adj.reduce((x, y) => x + y, 0) > 19 ? ', limitado a 19' : ''}. Resposta: ${total}.`, ref,
        verify: { sh: wrapSh(cmd), expect: String(total) },
      };
    }
    if (forma === 'padrao') {
      const k = rng.int(1, 2); const cmd = 'nice '.repeat(k) + 'nice';
      const total = Math.min(19, S + 10 * k);
      return {
        type: 'unica', text: `${intro}\n\n${block(cmd)}\n\nQue valor é impresso pelo último \`nice\`?`,
        options: numOpts(rng, total, [10, 5, S, S + 10, 19, 20, 0].map((x) => String(Math.min(19, x)))),
        explanation: `${expl} Sem \`-n\`, cada \`nice\` soma 10: ${S} + ${'10 + '.repeat(k).slice(0, -3)} = ${S + 10 * k}${S + 10 * k > 19 ? ' → limitado a 19' : ''}.`, ref, verify: { sh: wrapSh(cmd), expect: String(total) },
      };
    }
    if (forma === 'negativo') {
      const a = rng.int(1, 20); const cmd = `nice -n -${a} nice`;
      return {
        type: 'unica', text: `${intro}\n\n${block(cmd)}\n\nO que acontece?`,
        options: mcq(rng, `\`nice\` avisa "Permission denied", mas executa o comando; ele imprime ${S}`, [
          `O niceness cai para ${Math.max(-20, S - a)}, que é impresso`, `O comando não é executado e nada é impresso`, `O niceness é fixado em −${a}`, `Imprime ${S + a}, pois o sinal de menos é ignorado`, `O niceness é limitado a 0 e o comando imprime 0`,
        ].filter((x) => !(S === 0 && x.includes('limitado a 0')))),
        explanation: `${expl} Usuário comum só pode aumentar o niceness; ao pedir −${a}, o \`nice\` escreve "nice: cannot set niceness: Permission denied" no erro padrão e roda o comando com o niceness herdado (${S}).`, ref,
        verify: { sh: wrapSh(cmd), expect: `nice: cannot set niceness: Permission denied\n${S}` },
      };
    }
    const a = rng.int(2, 9); const cmd = `nice -${a} nice`;
    return {
      type: 'unica', text: `${intro}\n\n${block(cmd)}\n\n(Sintaxe antiga, sem a opção \`-n\`.) Que valor é impresso?`,
      options: numOpts(rng, Math.min(19, S + a), [S, -a, S - a, Math.min(19, S + 10), 10, a + 1].map(String)),
      explanation: `${expl} O GNU nice ainda aceita a forma obsoleta \`-N\`, que equivale a \`-n N\` (soma ${a}, **não** subtrai). Para um ajuste negativo seria preciso \`--${a}\` (ou \`-n -${a}\`), permitido só ao root. Resultado: ${S} + ${a} = ${S + a}.`, ref,
      verify: { sh: wrapSh(cmd), expect: String(Math.min(19, S + a)) },
    };
  },
};

const reniceCalc = {
  id: 'renice-calc', obj: '103.6', nivel: 3, peso: 2,
  make(rng) {
    const S = rng.int(0, 8); const n = rng.int(2, 3); const ref = ['101:p.368'];
    const vals = Array.from({ length: n }, () => rng.int(0, 19));
    let cur = S; const log = [];
    for (const v of vals) { if (v >= cur) { log.push(`PID (process ID) old priority ${cur}, new priority ${v}`); cur = v; } else log.push('renice: failed to set priority for PID (process ID): Permission denied'); }
    const cmds = vals.map((v) => `renice -n ${v} -p 4321`);
    const sh = `exec 2>/dev/null\n${S ? `nice -n ${S} ` : ''}sleep 30 & p=$!; sleep 0.3\n` + vals.map((v) => `renice -n ${v} -p $p 2>&1 | sed "s/$p/PID/g"`).join('\n') + `\nps -o ni= -p $p | tr -d ' '\nkill $p`;
    const alt = (arr) => { let c = S; for (const v of arr) c = c + v; return Math.min(19, c); };
    const wrongPool = [alt(vals), vals[vals.length - 1], Math.min(...vals), S, Math.max(...vals), vals[0]];
    return {
      type: 'unica',
      text: `Um processo de PID 4321 foi iniciado${S ? ` com \`nice -n ${S}\` (niceness ${S})` : ' com o niceness padrão (0)'} por um usuário comum. Esse usuário executa, em sequência:\n\n${block(cmds.join('\n'))}\n\nQual é o niceness do processo depois dos comandos?`,
      options: numOpts(rng, cur, wrongPool),
      explanation: `\`renice -n N -p PID\` define o niceness como o valor **absoluto** N (não soma). Um usuário comum só pode aumentar o niceness; tentar reduzir dá "Permission denied" e o valor não muda. Passo a passo: ${vals.map((v, i) => `${cmds[i].slice(0, 9)} ${v} → ${log[i].startsWith('renice') ? `negado (continua ${[S, ...vals].slice(0, i + 1).reduce((c, x) => (x >= c ? x : c), S)})` : 'ok'}`).join('; ')}. Final: ${cur}.`,
      ref, verify: { sh, expect: log.join('\n') + `\n${cur}` },
    };
  },
};

const prNi = {
  id: 'pr-ni', obj: '103.6', nivel: 2, peso: 3,
  make(rng) {
    const ni = rng.int(0, 19); const ref = ['101:p.367-369'];
    const forms = [
      { n: 'top', col: '`PR` do `top`', f: (x) => 20 + x, sh: (x) => `exec 2>/dev/null; nice -n ${x} sleep 30 & p=$!; sleep 0.3; top -b -n1 -p $p | tail -1 | awk '{print $3}'; kill $p`, e: 'No `top`, PR = 20 + NI para processos normais (PR varia de 0 a 39).' },
      { n: 'psl', col: '`PRI` de `ps -l`/`ps -el`', f: (x) => 80 + x, sh: (x) => `exec 2>/dev/null; nice -n ${x} sleep 30 & p=$!; sleep 0.3; ps -l -p $p | tail -1 | awk '{print $7}'; kill $p`, e: 'Em `ps -l`/`ps -el`, PRI = 80 + NI para processos normais (o niceness 0 aparece como 80).' },
      { n: 'sched', col: 'prioridade estática `prio` em `/proc/PID/sched`', f: (x) => 120 + x, sh: (x) => `exec 2>/dev/null; nice -n ${x} sleep 30 & p=$!; sleep 0.3; grep '^prio' /proc/$p/sched | awk '{print $NF}'; kill $p`, e: 'A prioridade estática de processos normais vai de 100 a 139 e o padrão é 120: prioridade = 120 + NI (é o valor `prio` em `/proc/PID/sched`).' },
    ];
    const f = rng.pick(forms);
    const rev = rng.chance(0.4);
    const val = f.f(ni);
    const tabela = 'Resumo para processos de política normal: NI vai de −20 a 19; PR (top) = 20 + NI (0 a 39); PRI (ps -l) = 80 + NI (60 a 99); prioridade estática do kernel = 120 + NI (100 a 139). Quanto **menor** o número, **maior** a prioridade. Processos em tempo real aparecem no top com PR negativo ou `rt`.';
    if (rev) {
      return {
        type: 'unica', text: `Um processo mostra ${f.col} igual a **${val}**. Qual é o seu valor nice (NI)?`,
        options: mcq(rng, String(ni), [20, 80, 120, 40, 100].map((b) => val - b).concat([-ni, 10, 0, 5]).map(String)),
        explanation: `${f.e} Logo NI = ${val} − ${f.f(0)} = ${ni}. ${tabela}`, ref, verify: { sh: f.sh(ni), expect: String(val) },
      };
    }
    return {
      type: 'unica', text: `Um processo normal tem valor nice (NI) igual a **${ni}**. Qual é o seu ${f.col}?`,
      options: mcq(rng, String(val), [20 + ni, 80 + ni, 120 + ni, ni, 40 + ni, 100 + ni, 120 - ni, 20 - ni].map(String)),
      explanation: `${f.e} Cálculo: ${f.f(0)} + ${ni} = ${val}. ${tabela}`, ref, verify: { sh: f.sh(ni), expect: String(val) },
    };
  },
};

const prRt = {
  id: 'pr-rt', obj: '103.6', nivel: 3, peso: 1,
  make(rng) {
    const rt = rng.int(1, 99); const ref = ['101:p.367-368'];
    return {
      type: 'lacuna', text: `Um processo de tempo real com prioridade estática ${rt} (escala 1–99, maior = mais urgente) aparece no \`top\` com a coluna PR igual a quê? (Use a fórmula do top; responda só o número, com sinal.)`,
      answers: [String(-1 - rt)],
      explanation: `Para destacar os processos de tempo real, o top mostra PR = −1 − prioridade_rt, ou seja, sempre negativo (às vezes mostra o texto \`rt\`). Aqui: −1 − ${rt} = ${-1 - rt}. Processos normais vão de 0 a 39 no top; qualquer processo de tempo real tem precedência sobre os normais, e o nice não os afeta.`, ref,
    };
  },
};

export const generators = [sigNumName, sigCatch, jobsSeq, psCols, killByName, psStat, termMux, niceCalc, reniceCalc, prNi, prRt];
