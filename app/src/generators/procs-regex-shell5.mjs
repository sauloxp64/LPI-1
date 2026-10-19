// 105.1 — ambiente do shell: arquivos de inicialização, tipos de shell, escopo de variáveis, aliases e funções.
import { mcq, multi, code, block } from './util.mjs';
import { sq, chooseVerify, juntar } from './procs-regex-shell.mjs';

const prep = (lines) => `cd "$(mktemp -d)"\nprintf '%s\\n' ${lines.map(sq).join(' ')} > s.sh`;

// ---------------------------------------------------------------- ordem de leitura dos arquivos de inicialização
const PROFILES = ['.bash_profile', '.bash_login', '.profile'];
const INVS = [
  { id: 'login', txt: 'faz **login** em um console de texto (shell interativo de login) e ainda não digitou `exit`', sh: (d) => `HOME=${d} bash -li </dev/null 2>&1 | grep '^\\['`, login: true, logout: false },
  { id: 'login-exit', txt: 'faz **login** em um console de texto e depois digita `exit` (a saída do shell de login é incluída)', sh: (d) => `HOME=${d} bash -li </dev/null 2>&1 | grep '^\\['`, login: true, logout: true },
  { id: 'su-l', txt: 'troca de usuário com `su - ana` (shell interativo de login) e ainda não saiu', sh: (d) => `HOME=${d} bash -li </dev/null 2>&1 | grep '^\\['`, login: true, logout: false },
  { id: 'interativo', txt: 'abre um **terminal gráfico** (shell interativo sem login)', sh: (d) => `HOME=${d} bash -i </dev/null 2>&1 | grep '^\\['`, login: false, logout: false },
  { id: 'bash', txt: 'digita `bash` em um shell já aberto (novo shell interativo sem login)', sh: (d) => `HOME=${d} bash -i </dev/null 2>&1 | grep '^\\['`, login: false, logout: false },
  { id: 'script', txt: 'executa `bash script.sh` (shell não interativo e sem login)', sh: (d) => `HOME=${d} bash s2.sh 2>&1 | grep '^\\['`, login: false, logout: false, script: true },
  { id: 'login-script', txt: 'executa `bash -l script.sh` (shell **não interativo** forçado a ser de login)', sh: (d) => `HOME=${d} bash -l s2.sh 2>&1 | grep '^\\['`, login: true, logout: false, script: true },
];
function simula(arqs, inv, regra = {}) {
  const out = []; const roda = (n) => { out.push(n); for (const s of arqs.get(n).src) if (arqs.has(s)) roda(s); };
  if (inv.login) {
    const cand = regra.todos ? PROFILES.filter((p) => arqs.has(p)) : [PROFILES.find((p) => arqs.has(p))].filter(Boolean);
    const lista = regra.profileFirst ? [['.profile', '.bash_profile', '.bash_login'].find((p) => arqs.has(p))].filter(Boolean) : cand;
    for (const n of lista) roda(n);
    if (regra.bashrcAlways && arqs.has('.bashrc') && !out.includes('.bashrc')) roda('.bashrc');
  } else if (!inv.script) {
    if (arqs.has('.bashrc')) roda('.bashrc');
    if (regra.profileInteractive) { const f = PROFILES.find((p) => arqs.has(p)); if (f) roda(f); }
  } else if (regra.bashrcScript && arqs.has('.bashrc')) roda('.bashrc');
  if (inv.logout && arqs.has('.bash_logout') && !(regra.noLogout)) roda('.bash_logout');
  return out;
}
const shsOrder = {
  id: 'shs-order', obj: '105.1', nivel: 3, peso: 3,
  make(rng) {
    for (let t = 0; t < 100; t++) {
      const inv = rng.pick(INVS);
      const arqs = new Map();
      const nProf = rng.pick([1, 1, 2, 3]); for (const p of rng.sample(PROFILES, nProf)) arqs.set(p, { src: [] });
      if (rng.chance(0.85)) arqs.set('.bashrc', { src: [] });
      if (rng.chance(0.5)) arqs.set('.bash_logout', { src: [] });
      for (const p of ['.bash_profile', '.profile']) if (arqs.has(p) && arqs.has('.bashrc') && rng.chance(0.6)) arqs.get(p).src.push('.bashrc');
      if (arqs.has('.bash_profile') && arqs.has('.profile') && rng.chance(0.3)) arqs.get('.bash_profile').src.unshift('.profile');
      const real = simula(arqs, inv);
      if (inv.login === false && !arqs.has('.bashrc')) continue;
      const rules = [{ todos: true }, { profileFirst: true }, { bashrcAlways: true }, { profileInteractive: true }, { bashrcScript: true }, { noLogout: true }];
      const key = (a) => (a.length ? a.map((x) => `\`${x}\``).join(' → ') : 'nenhum arquivo do diretório pessoal é lido');
      const alts = [...new Set(rules.map((r) => key(simula(arqs, inv, r))))].filter((x) => x !== key(real));
      if (alts.length < 3) { if (alts.length < 2) continue; alts.push(key([...real].reverse())); }
      const opts = [...new Set(alts.concat(real.length > 1 ? [key([...real].reverse())] : []))].filter((x) => x !== key(real));
      if (opts.length < 3) continue;
      const mostra = [...arqs.entries()].map(([n, v]) => `# ~/${n}\necho "[${n}]"${v.src.map((s) => `\n. ~/${s}`).join('')}`).join('\n\n');
      const mk = [...arqs.entries()].filter(([n]) => n !== '.bash_logout' || inv.logout).map(([n, v]) => `printf '%s\n' ${[`echo "[${n}]"`, ...v.src.map((s) => `. ~/${s}`)].map(sq).join(' ')} > "$d/${n}"`).join('\n');
      const sh = `d="$(mktemp -d)"\n${mk}\n${inv.script ? 'echo : > "$d/s2.sh"; cd "$d"\n' : ''}${inv.sh('"$d"')}`;
      return {
        type: 'unica',
        text: `No diretório pessoal de um usuário existem apenas os arquivos abaixo (cada um imprime o próprio nome entre colchetes; ignore qualquer arquivo em \`/etc\`):\n\n${block(mostra)}\n\nO usuário ${inv.txt}. Quais arquivos do diretório pessoal são lidos, e em que ordem?`,
        options: mcq(rng, key(real), opts),
        explanation: 'Shell de **login**: lê `/etc/profile` e depois **somente o primeiro** que existir entre `~/.bash_profile`, `~/.bash_login` e `~/.profile` (nessa ordem); ao sair, `~/.bash_logout`. Shell **interativo sem login**: lê `~/.bashrc` (e `/etc/bash.bashrc` no Debian). Shell **não interativo** (scripts): não lê nenhum desses arquivos (só `$BASH_ENV`). Um arquivo só chama outro se tiver o comando `. arquivo` (ou `source`) — por isso o `~/.bashrc` normalmente é chamado de dentro do `~/.profile`/`~/.bash_profile`. Aqui: ' + (real.length ? real.map((x) => '`' + x + '`').join(' → ') : 'nada') + '.',
        ref: ['102:p.19-24'],
        verify: { sh, expect: real.map((x) => `[${x}]`).join('\n') },
      };
    }
    throw new Error('shs-order');
  },
};

// ---------------------------------------------------------------- tipos de shell (login/interativo)
const CHECK = `shopt -q login_shell && printf login || printf nologin; case $- in *i*) echo ' interativo';; *) echo ' nao-interativo';; esac`;
const TIPOS = {
  'login interativo': 'shell interativo de login', 'nologin interativo': 'shell interativo sem login',
  'login nao-interativo': 'shell não interativo de login', 'nologin nao-interativo': 'shell não interativo sem login',
};
const INVOC = [
  { txt: 'digitar `bash -l` em um terminal (stdin é o terminal)', k: 'login interativo', sh: `bash -l -i -c ${sq(CHECK)} 2>/dev/null | tail -n 1` },
  { txt: 'digitar `bash` em um terminal já aberto', k: 'nologin interativo', sh: `bash -i -c ${sq(CHECK)} 2>/dev/null | tail -n 1` },
  { txt: 'executar `bash script.sh`', k: 'nologin nao-interativo', sh: `printf '%s\\n' ${sq(CHECK)} > s.sh; bash s.sh` },
  { txt: 'executar `bash -c \'comando\'`', k: 'nologin nao-interativo', sh: `bash -c ${sq(CHECK)}` },
  { txt: 'executar `bash -l script.sh`', k: 'login nao-interativo', sh: `printf '%s\\n' ${sq(CHECK)} > s.sh; bash -l s.sh` },
  { txt: 'executar `bash --login -c \'comando\'`', k: 'login nao-interativo', sh: `bash --login -c ${sq(CHECK)}` },
  { txt: 'o programa `login` iniciar o bash com `argv[0]` igual a `-bash` (como num console de texto)', k: 'login interativo', sh: `bash -c ${sq(`exec -a -bash bash -i -c ${sq(CHECK)}`)} 2>/dev/null | tail -n 1` },
  { txt: 'fazer login em um console de texto (tty1)', k: 'login interativo', sh: null },
  { txt: 'abrir um emulador de terminal gráfico (gnome-terminal, konsole...)', k: 'nologin interativo', sh: null },
  { txt: 'executar `su - ana`', k: 'login interativo', sh: null }, { txt: 'executar `su ana`', k: 'nologin interativo', sh: null },
  { txt: 'executar `sudo -i`', k: 'login interativo', sh: null }, { txt: 'executar `sudo -s`', k: 'nologin interativo', sh: null },
  { txt: 'um script agendado no cron que é executado sem terminal', k: 'nologin nao-interativo', sh: null },
  { txt: 'conectar com `ssh usuario@servidor` e receber um prompt', k: 'login interativo', sh: null },
];
const shsTipo = {
  id: 'shs-type', obj: '105.1', nivel: 2, peso: 3,
  make(rng) {
    const fmt = rng.pick(['tipo', 'tipo', 'dolar0', 'flag']);
    const ref = ['102:p.15-18'];
    if (fmt === 'dolar0') {
      const c = rng.pick([['-bash', 'login interativo'], ['-su', 'login interativo'], ['bash', 'nologin interativo'], ['/bin/bash', 'nologin interativo'], ['./script.sh', 'nologin nao-interativo'], ['script.sh', 'nologin nao-interativo']]);
      return {
        type: 'unica', text: `Em um shell, o comando \`echo $0\` imprime \`${c[0]}\`. Que tipo de shell é esse?`,
        options: Object.entries(TIPOS).map(([k, v]) => ({ t: caps(v), ok: k === c[1] })),
        explanation: 'O valor de `$0` revela como o shell foi iniciado: **`-bash`/`-su`** (com hífen) = shell de **login** (o `login`/`su -` coloca um `-` em `argv[0]`); **`bash`** ou **`/bin/bash`** = shell interativo **sem login**; o **nome do script** = shell não interativo executando um script.',
        ref,
        verify: c[0].startsWith('-') ? { sh: `bash -c ${sq(`exec -a ${c[0]} bash -c 'echo $0'`)}`, expect: c[0] } : undefined,
      };
    }
    if (fmt === 'flag') {
      const it = rng.pick([
        { q: 'Qual opção faz um bash de login **ignorar** `/etc/profile`, `~/.bash_profile`, `~/.bash_login` e `~/.profile`?', a: '--noprofile', w: ['--norc', '--rcfile', '--login', '--posix'], sh: (d) => `HOME=${d} bash --noprofile -li </dev/null 2>&1 | grep '^\\[' ; echo ok`, ex: 'ok', files: ['.bash_profile', '.bashrc'] },
        { q: 'Qual opção faz um bash interativo **ignorar** `/etc/bash.bashrc` e `~/.bashrc`?', a: '--norc', w: ['--noprofile', '--login', '--noediting', '--restricted'], sh: (d) => `HOME=${d} bash --norc -i </dev/null 2>&1 | grep '^\\[' ; echo ok`, ex: 'ok', files: ['.bashrc'] },
        { q: 'Qual opção faz um bash interativo usar outro arquivo no lugar de `~/.bashrc`?', a: '--rcfile arquivo', w: ['--init arquivo', '--noprofile arquivo', '--login arquivo', '-f arquivo'], sh: (d) => `printf '%s\\n' 'echo "[outro]"' > ${d}/outro; HOME=${d} bash --rcfile ${d}/outro -i </dev/null 2>&1 | grep '^\\['`, ex: '[outro]', files: ['.bashrc'] },
        { q: 'Qual opção força o bash a se comportar como um shell de **login**?', a: '-l (ou --login)', w: ['-i', '-s', '-c', '--noprofile'], sh: (d) => `bash -l -c ${sq(CHECK)} 2>/dev/null | tail -n 1`, ex: 'login nao-interativo', files: [] },
        { q: 'Qual opção torna o bash **interativo**?', a: '-i', w: ['-l', '-c', '--norc', '-x'], sh: () => `bash -i -c ${sq(CHECK)} 2>/dev/null | tail -n 1`, ex: 'nologin interativo', files: [] },
      ]);
      const sh = `d="$(mktemp -d)"\n${it.files.map((f) => `printf '%s\\n' ${sq(`echo "[${f}]"`)} > "$d/${f}"`).join('\n')}\n${it.sh('"$d"')}`;
      const caps0 = (s) => s;
      return {
        type: 'unica', text: it.q, options: mcq(rng, caps0(it.a), it.w),
        explanation: '`bash --noprofile` e `--norc` pulam os arquivos de inicialização de shells de login e interativos, respectivamente; `--rcfile arq` usa `arq` no lugar de `~/.bashrc`; `-l`/`--login` simula um shell de login e `-i` um shell interativo.',
        ref, verify: { sh, expect: it.ex },
      };
    }
    const it = rng.pick(INVOC);
    return {
      type: 'unica', text: `Que tipo de shell resulta de: ${it.txt}?`,
      options: Object.entries(TIPOS).map(([k, v]) => ({ t: caps(v), ok: k === it.k })),
      explanation: `${caps(TIPOS[it.k])}. **Login** = o usuário se autentica (console, \`su -\`, \`sudo -i\`, \`ssh\`, \`bash -l\`); **interativo** = há um terminal com prompt lendo comandos; scripts, \`bash -c\` e cron são **não interativos**. Terminais gráficos, \`bash\`, \`su\` sem hífen e \`sudo -s\` são **sem login**.`,
      ref, verify: it.sh ? { sh: `cd "$(mktemp -d)"\n${it.sh}`, expect: it.k } : undefined,
    };
  },
};
function caps(s) { return s[0].toUpperCase() + s.slice(1); }

// ---------------------------------------------------------------- escopo de variáveis
const NOMES = ['NOME', 'CIDADE', 'LINGUA', 'MODO', 'COR', 'PAIS', 'TIPO'];
const VALS = ['ana', 'bruno', 'recife', 'rapido', 'azul', 'norte', 'beta', 'x7', 'dev'];
const ESCOPO = [
  (rng) => { const v = rng.pick(NOMES); const a = rng.pick(VALS); const ord = rng.chance(0.5);
    const prog = ord ? [`${v}=${a}`, `bash -c 'echo "1:[$${v}]"'`, `export ${v}`, `bash -c 'echo "2:[$${v}]"'`] : [`export ${v}=${a}`, `bash -c 'echo "1:[$${v}]"'`, `unset ${v}`, `bash -c 'echo "2:[$${v}]"'`];
    const out = ord ? ['1:[]', `2:[${a}]`] : [`1:[${a}]`, '2:[]'];
    return { prog, out, wrong: [[`1:[${a}]`, `2:[${a}]`], ['1:[]', '2:[]'], ord ? [`1:[${a}]`, '2:[]'] : ['1:[]', `2:[${a}]`]], why: 'Uma variável só é herdada pelos processos filhos (como `bash -c`) depois de **exportada** (`export`). Variáveis apenas do shell não passam para o filho, e `unset` a remove também do ambiente.' }; },
  (rng) => { const v = rng.pick(['X', 'N', 'T']); const a = rng.int(1, 9); const b = rng.int(10, 99); const sub = rng.chance(0.6);
    const prog = [`${v}=${a}`, sub ? `( ${v}=${b}; echo "dentro:$${v}" )` : `{ ${v}=${b}; echo "dentro:$${v}"; }`, `echo "fora:$${v}"`];
    const out = [`dentro:${b}`, `fora:${sub ? a : b}`];
    return { prog, out, wrong: [[`dentro:${b}`, `fora:${sub ? b : a}`], [`dentro:${a}`, `fora:${a}`], [`dentro:${a}`, `fora:${b}`]], why: sub ? '`( ... )` executa os comandos em um **subshell**: as atribuições feitas lá dentro não afetam o shell pai.' : '`{ ...; }` agrupa comandos no **mesmo** shell, então a atribuição persiste depois do bloco.' }; },
  (rng) => { const a = rng.pick(['p', 'q']); const loc = rng.chance(0.5); const v1 = rng.int(1, 4); const v2 = rng.int(5, 9);
    const prog = [`V=${v1}`, `f() { ${loc ? 'local ' : ''}V=${v2}; echo "f:$V"; }`, 'f', 'echo "fora:$V"'];
    const out = [`f:${v2}`, `fora:${loc ? v1 : v2}`];
    return { prog, out, wrong: [[`f:${v2}`, `fora:${loc ? v2 : v1}`], [`f:${v1}`, `fora:${v1}`], [`f:${v1}`, `fora:${v2}`]], why: loc ? 'Dentro de uma função, `local V=...` cria uma variável local: a global `V` não muda.' : 'Sem `local`, a atribuição dentro da função altera a variável global.', _a: a }; },
  (rng) => { const v = rng.pick(NOMES); const a = rng.pick(VALS); const b = rng.pick(VALS.filter((x) => x !== a));
    const prog = [`${v}=${a}`, `${v}=${b} bash -c 'echo "filho:$${v}"'`, `echo "pai:$${v}"`];
    return { prog, out: [`filho:${b}`, `pai:${a}`], wrong: [[`filho:${a}`, `pai:${a}`], [`filho:${b}`, `pai:${b}`], ['filho:', `pai:${a}`]], why: 'Uma atribuição **antes do comando** (`VAR=valor comando`) vale apenas para o ambiente desse comando; o valor anterior no shell permanece.' }; },
  (rng) => { const v = rng.pick(['Z', 'W']); const a = rng.pick(VALS); const b = rng.pick(VALS.filter((x) => x !== a)); const cmd = rng.pick(['.', 'source']);
    const prog = [`${v}=${a}`, 'bash lib.sh', `echo "A:$${v}"`, `${cmd} lib.sh`, `echo "B:$${v}"`];
    return { prog, out: [`A:${a}`, `B:${b}`], files: { 'lib.sh': [`${v}=${b}`] }, wrong: [[`A:${b}`, `B:${b}`], [`A:${a}`, `B:${a}`], [`A:${b}`, `B:${a}`]], why: '`bash lib.sh` roda o arquivo em um processo filho (as variáveis dele somem ao terminar); `source lib.sh` (ou `. lib.sh`) executa no shell atual e as variáveis persistem.' }; },
  (rng) => { const v = rng.pick(['P', 'Q']); const a = rng.int(1, 4); const b = rng.int(5, 9);
    const prog = [`export ${v}=${a}`, `bash -c '${v}=${b}; echo "filho:$${v}"'`, `echo "pai:$${v}"`];
    return { prog, out: [`filho:${b}`, `pai:${a}`], wrong: [[`filho:${b}`, `pai:${b}`], [`filho:${a}`, `pai:${a}`], [`filho:${a}`, `pai:${b}`]], why: 'O filho recebe uma **cópia** da variável exportada; alterá-la lá não muda a variável do pai.' }; },
  (rng) => { const v = rng.pick(NOMES); const a = rng.pick(VALS); const how = rng.pick(['export -n', 'unset']);
    const prog = [`export ${v}=${a}`, `${how} ${v}`, `bash -c 'echo "filho:[$${v}]"'`, `echo "pai:[$${v}]"`];
    const out = how === 'unset' ? ['filho:[]', 'pai:[]'] : ['filho:[]', `pai:[${a}]`];
    return { prog, out, wrong: [[`filho:[${a}]`, `pai:[${a}]`], ['filho:[]', `pai:[${how === 'unset' ? a : ''}]`], [`filho:[${a}]`, 'pai:[]']], why: how === 'unset' ? '`unset` apaga a variável do shell e, portanto, também do ambiente dos processos filhos.' : '`export -n` retira o atributo de exportação: a variável continua existindo no shell atual, mas deixa de ir para os processos filhos.' }; },
  (rng) => { const v = rng.pick(['A', 'B']); const a = rng.int(1, 5); const b = rng.int(6, 9);
    const prog = [`${v}=${a}`, `R=$( ${v}=${b}; echo $${v} )`, `echo "R=$R ${v}=$${v}"`];
    return { prog, out: [`R=${b} ${v}=${a}`], wrong: [[`R=${b} ${v}=${b}`], [`R=${a} ${v}=${a}`], [`R=${a} ${v}=${b}`]], why: 'A substituição de comando `$( ... )` roda em um subshell: o valor impresso é capturado, mas a atribuição feita lá dentro não afeta o shell atual.' }; },
  (rng) => { const w = rng.pick(['teste', 'alfa', 'dado']);
    const prog = [`echo ${w} | read V`, 'echo "[$V]"'];
    return { prog, out: ['[]'], wrong: [[`[${w}]`], ['[V]'], ['[ ]']], why: 'Cada comando de um pipeline roda em um subshell (no bash padrão): o `read` altera `V` apenas nesse subshell, e o shell principal continua com `V` vazia.' }; },
  (rng) => { const v = rng.pick(['LANG_X', 'TEMA']); const a = rng.pick(VALS);
    const prog = [`env ${v}=${a} bash -c 'echo "filho:$${v}"'`, `echo "pai:[$${v}]"`];
    return { prog, out: [`filho:${a}`, 'pai:[]'], wrong: [[`filho:${a}`, `pai:[${a}]`], ['filho:', 'pai:[]'], ['filho:', `pai:[${a}]`]], why: '`env VAR=valor comando` coloca a variável apenas no ambiente do comando executado; o shell atual não é alterado.' }; },
];
const shsEscopo = {
  id: 'shs-var-scope', obj: '105.1', nivel: 3, peso: 3,
  make(rng) {
    for (let t = 0; t < 30; t++) {
      const s = rng.pick(ESCOPO)(rng);
      const txt = (o) => o.map((l) => `\`${l}\``).join(' e ');
      const alts = [...new Set(s.wrong.map(txt))].filter((x) => x !== txt(s.out));
      if (alts.length < 3) alts.push(txt(s.out.map((l) => l.replace(/\[.*\]/, '[?]'))), txt([...s.out].reverse()));
      const options = mcq(rng, txt(s.out), alts.filter((x) => x !== txt(s.out)));
      const lines = [...(s.files ? Object.entries(s.files).flatMap(([n, c]) => [`# conteúdo de ${n}`, ...c, '']) : []), ...s.prog];
      const files = s.files ? `printf '%s\\n' ${s.files['lib.sh'].map(sq).join(' ')} > lib.sh\n` : '';
      return {
        type: 'unica', text: `Um script \`s.sh\` é executado com \`bash s.sh\`${s.files ? ' (o arquivo `lib.sh` está no mesmo diretório)' : ''}:\n\n${block(lines.join('\n'))}\n\nQuais linhas são impressas, nessa ordem?`,
        options, explanation: s.why, ref: ['102:p.38-55'],
        verify: { sh: `${prep(s.prog)}\n${files}bash s.sh`, expect: s.out.join('\n') },
      };
    }
    throw new Error('shs-var-scope');
  },
};

// ---------------------------------------------------------------- aliases, funções e type
const aliasCasos = [
  (rng) => { // função definida antes do alias
    const n = rng.pick(['ola', 'info', 'rel']); const fx = rng.pick(['funcao', 'f1']); const ax = rng.pick(['alias', 'a1']);
    const prog = [`${n}() { echo ${fx}; }`, `alias ${n}='echo ${ax}'`, n, `\\${n}`, `unalias ${n}`, n, `type -t ${n}`];
    return { prog, out: [ax, fx, fx, 'function'], wrong: [[fx, fx, fx, 'function'], [ax, ax, fx, 'alias'], [ax, fx, ax, 'alias'], [ax, fx, fx, 'alias']], why: 'Ordem de busca do bash: **alias → função → builtin → arquivo no PATH**. Por isso o alias esconde a função de mesmo nome; a barra invertida (`\\nome`) desativa o alias e `unalias` o remove, deixando a função aparecer. `type -t` informa o tipo (alias, function, builtin, file, keyword).' }; },
  (rng) => { const m = rng.pick(['[A]', '[ALIAS]', 'A:']);
    const prog = [`alias echo='echo ${m}'`, 'echo teste', '\\echo teste', 'command echo teste', 'unalias echo', 'echo teste'];
    return { prog, out: [`${m} teste`, 'teste', 'teste', 'teste'], wrong: [[`${m} teste`, `${m} teste`, 'teste', 'teste'], [`${m} teste`, 'teste', `${m} teste`, 'teste'], [`${m} teste`, `${m} teste`, `${m} teste`, `${m} teste`], ['teste', 'teste', 'teste', 'teste']], why: 'O alias tem precedência sobre o comando original, mas pode ser contornado com `\\comando`, `command comando` (ou aspas, como `"echo"`). `unalias` remove o alias.' }; },
  (rng) => { const v1 = rng.pick(['um', 'sol', 'aqui']); const v2 = rng.pick(['dois', 'lua', 'ali']); const n = rng.pick(['dyn', 'a1']); const m = rng.pick(['sta', 'a2']);
    const prog = [`V=${v1}`, `alias ${n}='echo $V'`, `alias ${m}="echo $V"`, `V=${v2}`, n, m];
    return { prog, out: [v2, v1], wrong: [[v1, v2], [v1, v1], [v2, v2]], why: 'Com **aspas simples**, `$V` só é expandida quando o alias é executado (expansão dinâmica); com **aspas duplas**, `$V` é expandida já na definição do alias (expansão estática).' }; },
  (rng) => { const a = rng.pick(['emacs', 'nano', 'vim']); const f = rng.chance(0.5);
    const prog = f ? [`ed() { echo "$1 é ótimo"; }`, `ed ${a}`] : [`alias ed='echo "$1 é ótimo"'`, `ed ${a}`];
    return { prog, out: [f ? `${a} é ótimo` : ` é ótimo ${a}`.trim()], wrong: [[f ? ` é ótimo ${a}`.trim() : `${a} é ótimo`], [`${a}`], ['é ótimo']], why: f ? 'Funções recebem argumentos em `$1`, `$2`, ... (parâmetros posicionais).' : 'Um **alias não recebe parâmetros posicionais**: o que se digita depois do nome é simplesmente **anexado ao final** do comando expandido; `$1` aqui é o parâmetro do shell (vazio), resultando em `echo " é ótimo" emacs`.' }; },
  (rng) => { const a = rng.pick(['ls', 'cd', 'if', 'ola']); const nome = a === 'ola' ? 'ola' : a;
    const prog = a === 'ola' ? ["ola() { echo oi; }", 'type -t ola', 'type -t cd', 'type -t ls', 'type -t if'] : ["alias ll='ls -l'", 'type -t ll', 'type -t cd', 'type -t ls', 'type -t if'];
    return { prog, out: [a === 'ola' ? 'function' : 'alias', 'builtin', 'file', 'keyword'], wrong: [[a === 'ola' ? 'alias' : 'function', 'builtin', 'file', 'keyword'], [a === 'ola' ? 'function' : 'alias', 'file', 'builtin', 'keyword'], [a === 'ola' ? 'function' : 'alias', 'builtin', 'file', 'builtin'], [a === 'ola' ? 'function' : 'alias', 'builtin', 'builtin', 'keyword']], why: '`type -t` imprime `alias`, `function`, `builtin`, `file` ou `keyword`. `cd` é builtin do shell, `ls` é um arquivo executável em `/bin`, `if` é palavra reservada (keyword).', _n: nome }; },
];
const shsAlias = {
  id: 'shs-alias-func', obj: '105.1', nivel: 3, peso: 2,
  make(rng) {
    const s = rng.pick(aliasCasos)(rng);
    const txt = (o) => o.map((l) => '`' + l + '`').join(', ');
    const alts = [...new Set(s.wrong.map(txt))].filter((x) => x !== txt(s.out));
    if (alts.length < 3) alts.push(txt([...s.out].reverse()), txt(s.out.map(() => 'erro')));
    const shown = s.prog.map((l) => l);
    return {
      type: 'unica', text: `Em um shell interativo bash (onde os aliases estão habilitados), as linhas abaixo são digitadas, uma por vez:\n\n${block(shown.join('\n'))}\n\nQuais saídas aparecem, na ordem? (uma por linha de saída, separadas por vírgula)`,
      options: mcq(rng, txt(s.out), alts), explanation: s.why, ref: ['102:p.68-72'],
      verify: { sh: `cd "$(mktemp -d)"\nprintf '%s\\n' 'shopt -s expand_aliases' ${s.prog.map(sq).join(' ')} > s.sh\nbash s.sh 2>&1`, expect: s.out.join('\n') },
    };
  },
};

// ---------------------------------------------------------------- onde configurar (conceito)
const ONDE = [
  { q: 'Definir uma variável de ambiente (por exemplo `EDITOR`) para **todos os usuários** que abrem shells de login', a: '`/etc/profile` (ou um arquivo `*.sh` em `/etc/profile.d/`)', w: ['`~/.bashrc`', '`~/.bash_logout`', '`/etc/hostname`', '`~/.bash_aliases`'] },
  { q: 'Guardar aliases e funções **pessoais** que valem em shells interativos sem login', a: '`~/.bashrc` (ou `~/.bash_aliases`, lido por ele)', w: ['`~/.bash_logout`', '`/etc/profile`', '`~/.bash_login`', '`/etc/shells`'] },
  { q: 'Executar comandos de limpeza (por exemplo, apagar arquivos temporários) quando um shell de login termina', a: '`~/.bash_logout`', w: ['`~/.bash_profile`', '`~/.bashrc`', '`/etc/profile.d/`', '`~/.profile`'] },
  { q: 'Qual arquivo o bash lê em um shell de login quando `~/.bash_profile` e `~/.bash_login` **não** existem?', a: '`~/.profile`', w: ['`~/.bashrc`', '`/etc/bash.bashrc`', '`~/.bash_logout`', '`~/.bash_aliases`'] },
  { q: 'Qual variável aponta para o arquivo que um shell **não interativo** (script) executa antes de rodar o script?', a: '`BASH_ENV`', w: ['`ENV_FILE`', '`BASHRC`', '`PROMPT_COMMAND`', '`SHELLOPTS`'] },
  { q: 'Como aplicar imediatamente, no shell atual, as mudanças feitas em `~/.bashrc` sem fazer logout?', a: '`source ~/.bashrc` (ou `. ~/.bashrc`)', w: ['`bash ~/.bashrc`', '`exec ~/.bashrc`', '`export ~/.bashrc`', '`./~/.bashrc`'] },
  { q: 'Qual é o arquivo de configuração **global** para shells bash interativos em sistemas Debian?', a: '`/etc/bash.bashrc`', w: ['`/etc/bashrc.conf`', '`/etc/profile.conf`', '`/etc/bash_profile`', '`/etc/environment.d`'] },
  { q: 'Em um shell de login, quais dos arquivos `~/.bash_profile`, `~/.bash_login` e `~/.profile` o bash lê?', a: 'Somente o primeiro que existir, nessa ordem', w: ['Os três, nessa ordem', 'Somente o `~/.profile`, sempre', 'Os dois primeiros, se ambos existirem', 'Nenhum: só `/etc/profile` é lido'] },
  { q: 'Por que o `~/.profile` padrão do Debian contém um trecho `if [ -f "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi`?', a: 'Para que shells de login também carreguem as configurações do `~/.bashrc`', w: ['Para criar o `~/.bashrc` se ele não existir', 'Para impedir que o `~/.bashrc` seja lido', 'Para executar o `~/.bashrc` em um subshell isolado', 'Para trocar o shell do usuário para bash'] },
];
const shsOnde = {
  id: 'shs-where', obj: '105.1', nivel: 1, peso: 2,
  make(rng) {
    const it = rng.pick(ONDE);
    return { type: 'unica', text: `${it.q}${it.q.endsWith('?') ? '' : ': onde configurar?'}`, options: mcq(rng, it.a, it.w), explanation: 'Resumo: **login** → `/etc/profile` e depois o primeiro entre `~/.bash_profile`, `~/.bash_login`, `~/.profile`; **interativo sem login** → `/etc/bash.bashrc` e `~/.bashrc`; **ao sair do login** → `~/.bash_logout`; **script (não interativo)** → só `$BASH_ENV`. `~/.profile` costuma chamar o `~/.bashrc`. Use `source`/`.` para reler um arquivo no shell atual.', ref: ['102:p.19-27'] };
  },
};

export const generators = [shsOrder, shsTipo, shsEscopo, shsAlias, shsOnde];
