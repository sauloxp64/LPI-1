// 105.2 — scripts simples: encadeamento, códigos de saída, test, laços/aritmética, argumentos, case/read, execução.
import { mcq, multi, code, block } from './util.mjs';
import { sq, juntar, numOpts } from './procs-regex-shell.mjs';

const prep = (lines, extra = '') => `cd "$(mktemp -d)"\n${extra}printf '%s\\n' ${lines.map(sq).join(' ')} > s.sh`;
const tk = (o) => `\`${o}\``;
const uniqueWrong = (cand, ok) => [...new Set(cand)].filter((x) => x !== ok);

// ---------------------------------------------------------------- && || ;
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const FALHAS = [{ t: 'false', st: 1 }, { t: '[ 2 -gt 5 ]', st: 1 }, { t: 'test -f /nao/existe', st: 1 }, { t: 'grep -q zzzz /etc/passwd', st: 1 }];
const SUCESSOS = [{ t: 'true', st: 0 }, { t: '[ 7 -gt 5 ]', st: 0 }, { t: 'test -d /tmp', st: 0 }, { t: 'grep -q root /etc/passwd', st: 0 }];
function avalia(lista, modo = 'ok') { // lista: [{atoms:[a0, [op,a]...]}] separados por ';'
  let out = ''; let st = 0;
  const roda = (a) => { out += a.pr ?? ''; st = a.st; };
  for (const grupo of lista) {
    if (modo === 'dir') { // agrupamento errado: a op1 (b op2 c)
      const calc = (i) => { // retorna status após avaliar do índice i em diante
        const [a, ...resto] = grupo.slice(i);
        void a; void resto;
      };
      void calc;
      const seq = grupo; let s0 = null;
      const ev = (idx) => { // direita-associativo
        if (idx === seq.length - 1) { roda(seq[idx].a); return st; }
        roda(seq[idx].a); const s = st; const op = seq[idx + 1].op;
        if ((op === '&&' && s === 0) || (op === '||' && s !== 0)) { return ev(idx + 1); }
        if (op === '&&') return s; // falhou: pula tudo (grupo)
        return s;
      };
      void s0; ev(0);
      continue;
    }
    roda(grupo[0].a);
    for (let i = 1; i < grupo.length; i++) {
      const op = grupo[i].op;
      if (modo === 'todos' || (op === '&&' && st === 0) || (op === '||' && st !== 0)) roda(grupo[i].a);
    }
  }
  return { out, st };
}
const shChain = {
  id: 'sh-chain', obj: '105.2', nivel: 2, peso: 3,
  make(rng) {
    for (let t = 0; t < 100; t++) {
      const nGrupos = rng.pick([1, 1, 2]); const letras = rng.shuffle(LETRAS); let li = 0;
      const grupos = []; let texto = '';
      for (let g = 0; g < nGrupos; g++) {
        const n = rng.int(3, 4); const gr = [];
        for (let i = 0; i < n; i++) {
          const pr = rng.chance(0.65);
          const a = pr ? { t: `printf ${letras[li]}`, st: 0, pr: letras[li++] } : rng.pick(rng.chance(0.5) ? FALHAS : SUCESSOS);
          gr.push({ op: i === 0 ? null : rng.pick(['&&', '||', '&&', '||']), a });
        }
        grupos.push(gr);
        texto += (g ? '; ' : '') + gr.map((x, i) => (i ? ` ${x.op} ` : '') + x.a.t).join('');
      }
      if (li < 2) continue;
      const comStatus = rng.chance(0.6);
      const prog = `${texto}; ${comStatus ? 'echo "[$?]"' : 'echo'}`;
      const fmt = (r) => `${r.out}${comStatus ? `[${r.st}]` : ''}` || '(nada)';
      const ok = avalia(grupos); const real = fmt(ok);
      const all = avalia(grupos, 'todos');
      const wrong = [fmt(all), fmt(avalia(grupos, 'dir')), fmt({ out: ok.out, st: ok.st === 0 ? 1 : 0 }), fmt({ out: [...ok.out].reverse().join(''), st: ok.st }), fmt({ out: ok.out.slice(0, -1), st: ok.st })].filter((x) => x !== real);
      const opts = [...new Set(wrong)];
      if (opts.length < 3) continue;
      return {
        type: 'unica',
        text: `Qual é a saída do comando abaixo no bash? (\`printf X\` imprime X sem quebra de linha e termina com sucesso; ${comStatus ? '`echo "[$?]"` mostra o status do último comando executado' : 'o `echo` final só termina a linha'}.)\n\n${block(prog)}`,
        options: mcq(rng, real, opts),
        explanation: '`A && B` só executa B se A tiver status 0; `A || B` só executa B se A falhar (status ≠ 0); `;` executa sempre o próximo comando. `&&` e `||` têm a mesma precedência e são avaliados da **esquerda para a direita**; quando um comando é pulado, o status continua sendo o do último que rodou. Resultado: ' + tk(real) + '.',
        ref: ['102:p.104'],
        verify: { sh: `bash -c ${sq(prog)}`, expect: real === '(nada)' ? '' : real },
      };
    }
    throw new Error('sh-chain');
  },
};

// ---------------------------------------------------------------- códigos de saída
const EXITCASOS = [
  (rng) => { const n = rng.pick([0, 1, 2, 3, 7, 42, 100, 127, 255, 256, 257, 300, 512, -1, -2]); const r = ((n % 256) + 256) % 256;
    return { prog: [`bash -c 'exit ${n}'`, 'echo $?'], out: r, pool: [n < 0 ? -n : n, n < 0 ? n : n % 255, 0, 1, 255, 127], why: `O status de saída tem 8 bits: \`exit N\` devolve N módulo 256 (${n} → ${r}); valores negativos viram 256 − |N|.` }; },
  (rng) => { const c = rng.pick(['comando_que_nao_existe', 'ls_foo', 'gerar-relatorio']);
    return { prog: [c, 'echo $?'], out: 127, pool: [1, 2, 126, 128, 255, 0], why: 'Comando não encontrado no PATH → status **127**. Comando encontrado, mas sem permissão de execução (ou diretório) → **126**.', stderr: true }; },
  (rng) => { const k = rng.pick(['sem_x.sh', 'rotina.sh', 'tarefa']);
    return { prog: [`echo 'echo oi' > ${k}`, `chmod 644 ${k}`, `./${k}`, 'echo $?'], out: 126, pool: [1, 2, 127, 128, 255, 0], why: 'O arquivo existe, mas não tem permissão de execução: o shell responde "Permission denied" com status **126** (127 seria "comando não encontrado").', stderr: true }; },
  (rng) => { const sig = rng.pick([['KILL', 9], ['TERM', 15], ['INT', 2], ['HUP', 1]]);
    return { prog: [`bash -c 'kill -${sig[0]} $$'`, 'echo $?'], out: 128 + sig[1], pool: [sig[1], 128, 127 + sig[1], 130, 137, 143, 1].filter((x) => x !== 128 + sig[1]), why: `Quando um processo morre por um sinal N, o status é 128 + N: SIG${sig[0]} é o sinal ${sig[1]}, logo ${128 + sig[1]}.`, stderr: true }; },
  (rng) => { const c = rng.pick([['ls /nao/existe', 2], ['grep -q zzzzz /etc/passwd', 1], ['grep -q root /etc/passwd', 0], ['grep -q root /nao/existe', 2], ['test -d /tmp', 0], ['[ -f /tmp ]', 1], ['false', 1], ['true', 0], ['! true', 1], ['! false', 0]]);
    return { prog: [`${c[0]} 2>/dev/null`, 'echo $?'], out: c[1], pool: [0, 1, 2, 126, 127, 255], why: 'Convenção: 0 = sucesso; 1 = falha/“não encontrado” (grep sem resultado, `test` falso); 2 = erro de uso ou de arquivo (grep/ls com arquivo inexistente); `!` inverte o status.' }; },
  (rng) => { const a = rng.pick(['false', 'ls /nao/existe 2>/dev/null', 'grep -q zzzz /etc/passwd']); const st = a === 'false' ? 1 : a.startsWith('ls') ? 2 : 1;
    return { prog: [a, 'echo $?; echo $?'], out: `${st} 0`, multi: true, pool: [`${st} ${st}`, `0 0`, `0 ${st}`, `${st} 1`, '1 2'], why: 'O primeiro `echo $?` mostra o status do comando anterior; como o próprio `echo` termina com sucesso, o segundo `echo $?` mostra 0.' }; },
  (rng) => { const p = rng.pick([['false | true', 0, ''], ['true | false', 1, ''], ['false | true', 1, 'set -o pipefail'], ['true | false | true', 0, ''], ['true | false | true', 1, 'set -o pipefail']]);
    return { prog: [...(p[2] ? [p[2]] : []), p[0], 'echo $?'], out: p[1], pool: [0, 1, 2, 127, 255], why: 'O status de um pipeline é o do **último** comando; com `set -o pipefail` passa a ser o do último comando que falhou (se algum falhar).' }; },
  (rng) => { const n = rng.int(2, 9); const f = rng.pick(['(exit N)', 'f() { return N; }; f']);
    return { prog: [f.replace('N', String(n)), 'echo $?'], out: n, pool: [0, 1, n + 1, n - 1, 127, 255], why: '`exit N` em um subshell `( )` e `return N` em uma função definem o status do comando; `$?` mostra esse valor.' }; },
];
const shExit = {
  id: 'sh-exitcodes', obj: '105.2', nivel: 3, peso: 3,
  make(rng) {
    const c = rng.pick(EXITCASOS)(rng); const out = String(c.out);
    const options = c.multi ? mcq(rng, out.replace(' ', ' e '), c.pool.map((x) => String(x).replace(' ', ' e '))) : numOpts(rng, c.out, c.pool, 0, 255);
    return {
      type: 'unica', text: `Qual é a saída do script abaixo (\`bash s.sh\`)? ${c.multi ? 'Os valores aparecem em linhas separadas; responda com os dois valores.' : ''}\n\n${block(c.prog.join('\n'))}`,
      options, explanation: c.why, ref: ['102:p.101-105'],
      verify: { sh: `${prep(c.prog)}\nbash s.sh 2>/dev/null`, expect: out.replace(' ', '\n') },
    };
  },
};

// ---------------------------------------------------------------- test / [ ]
const FS_SETUP = ["echo oi > a", ': > e', 'mkdir d', 'ln -s a l', "printf '#!/bin/sh\\n' > x", 'chmod +x x'];
const FS_DESC = 'a: arquivo regular com conteúdo; e: arquivo regular vazio; d: diretório; l: link simbólico para `a`; x: script com permissão de execução; n: **não existe**';
const fsTest = { a: { e: 1, f: 1, d: 0, s: 1, x: 0, L: 0 }, e: { e: 1, f: 1, d: 0, s: 0, x: 0, L: 0 }, d: { e: 1, f: 0, d: 1, s: 1, x: 1, L: 0 }, l: { e: 1, f: 1, d: 0, s: 1, x: 0, L: 1 }, x: { e: 1, f: 1, d: 0, s: 1, x: 1, L: 0 }, n: { e: 0, f: 0, d: 0, s: 0, x: 0, L: 0 } };
const TESTES = [
  (rng) => { const op = rng.pick(['e', 'f', 'd', 's', 'x', 'L']); const nm = rng.pick(['a', 'e', 'd', 'l', 'x', 'n']); const neg = rng.chance(0.2);
    const v = fsTest[nm][op]; return { cmd: `[ ${neg ? '! ' : ''}-${op} ${nm} ]`, st: neg ? (v ? 1 : 0) : (v ? 0 : 1), fs: true, why: `\`-e\` existe; \`-f\` arquivo regular (segue links); \`-d\` diretório; \`-s\` tamanho > 0 (um diretório tem tamanho > 0); \`-x\` executável (diretórios têm o bit x); \`-L\` link simbólico. ${neg ? '`!` nega o resultado.' : ''}` }; },
  (rng) => { const a = rng.int(2, 20); const b = rng.int(2, 20); const op = rng.pick(['-lt', '-gt', '-eq', '-ne', '-le', '-ge']);
    const f = { '-lt': a < b, '-gt': a > b, '-eq': a === b, '-ne': a !== b, '-le': a <= b, '-ge': a >= b }[op];
    return { cmd: `[ ${a} ${op} ${b} ]`, st: f ? 0 : 1, why: 'Comparações **numéricas** usam `-lt -le -gt -ge -eq -ne`.' }; },
  (rng) => { const a = rng.int(2, 9); const b = rng.int(10, 30); const op = rng.pick(['\\>', '\\<']);
    return { cmd: `[ ${a} ${op} ${b} ]`, st: (op === '\\>' ? String(a) > String(b) : String(a) < String(b)) ? 0 : 1, why: '`\\>` e `\\<` dentro de `[ ]` comparam **texto** (ordem alfabética), não números: "9" vem depois de "10" porque "9" > "1". Para números, use `-gt`/`-lt`.' }; },
  (rng) => { const a = rng.int(2, 9);
    return rng.chance(0.5) ? { cmd: `[ ${a} = ${a}.0 ]`, st: 1, why: '`=` compara texto: "5" e "5.0" são strings diferentes.' } : { cmd: `[ ${a} -eq ${a}.0 ]`, st: 2, why: '`-eq` exige inteiros; "5.0" não é inteiro, então o `[` falha com "integer expression expected" e status **2**.' }; },
  (rng) => { const k = rng.pick([['V=""; [ -n $V ]', 0, 'Sem aspas, `$V` vazia some e o teste vira `[ -n ]`, que é verdadeiro (um único argumento não vazio). Por isso se deve usar `[ -n "$V" ]`.'], ['V=""; [ -n "$V" ]', 1, 'Com aspas, `[ -n "" ]` testa uma string vazia e é falso.'], ['V=""; [ -z "$V" ]', 0, '`-z` é verdadeiro para string de tamanho zero.'], ['V=""; [ $V = x ]', 2, 'Sem aspas, `$V` vazia some e sobra `[ = x ]`, erro de sintaxe ("unary operator expected"): status **2**.'], ['V=abc; [ -n "$V" ]', 0, '`-n` é verdadeiro quando a string não está vazia.'], ['V=abc; [ "$V" = "abc" ]', 0, 'Strings iguais.'], ['V=abc; [ "$V" != "abc" ]', 1, '`!=` é falso quando as strings são iguais.'], ['[ "" ]', 1, 'Um único argumento vazio é falso.'], ['[ abc ]', 0, 'Um único argumento não vazio é verdadeiro.']]);
    return { cmd: k[0], st: k[1], why: k[2] }; },
  (rng) => { const a = rng.pick(['-d d', '-f a', '-e n', '-s e', '-x x']); const b = rng.pick(['-f a', '-d d', '-e l', '-s a', '-x a']); const sym = rng.pick(['-a', '-o', '&&', '||']);
    const ev = (e) => { const [o, n] = e.split(' '); return fsTest[n][o.slice(1)] === 1; };
    const A = ev(a); const B = ev(b);
    const r = sym === '-a' || sym === '&&' ? A && B : A || B;
    const cmd = sym === '&&' || sym === '||' ? `[ ${a} ] ${sym} [ ${b} ]` : `[ ${a} ${sym} ${b} ]`;
    return { cmd, st: r ? 0 : 1, fs: true, why: '`-a`/`-o` (ou `&&`/`||` entre dois `[ ]`) combinam testes como E e OU lógicos.' }; },
  (rng) => { const a = rng.pick(['abc', 'dois', 'zeta']); const b = rng.pick(['abd', 'um', 'alfa']); const op = rng.pick(['\\<', '\\>', '=', '!=']);
    const r = { '\\<': a < b, '\\>': a > b, '=': a === b, '!=': a !== b }[op];
    return { cmd: `[ ${a} ${op} ${b} ]`, st: r ? 0 : 1, why: '`<` e `>` comparam texto em ordem alfabética (precisam de `\\` para não serem redirecionamentos); `=` e `!=` testam igualdade de texto.' }; },
];
const shTest = {
  id: 'sh-test', obj: '105.2', nivel: 3, peso: 3,
  make(rng) {
    const s = rng.pick(TESTES)(rng);
    const prog = s.cmd.includes('; ') ? s.cmd.split('; ').concat(['echo $?']) : [s.cmd, 'echo $?'];
    const fs = s.fs ? `\n\nNo diretório atual existem: ${FS_DESC}.` : '';
    return {
      type: 'unica', text: `Qual valor é impresso pelo script abaixo?${fs}\n\n${block(prog.join('\n'))}`,
      options: numOpts(rng, s.st, [0, 1, 2, 127, 126], 0, 3),
      explanation: `${s.why} O status 0 significa verdadeiro, 1 falso e 2 erro de sintaxe/uso do \`test\`. Resultado: ${s.st}.`, ref: ['102:p.113-117'],
      verify: { sh: `cd "$(mktemp -d)"\n${s.fs ? FS_SETUP.join('\n') + '\n' : ''}printf '%s\\n' ${prog.map(sq).join(' ')} > s.sh\nbash s.sh 2>/dev/null`, expect: String(s.st) },
    };
  },
};

// ---------------------------------------------------------------- laços e aritmética
const seqL = (a, s, b) => { const o = []; if (s > 0) for (let x = a; x <= b; x += s) o.push(x); else for (let x = a; x >= b; x += s) o.push(x); return o; };
const idiv = (a, b) => Math.trunc(a / b); const imod = (a, b) => a - b * Math.trunc(a / b);
const LACOS = [
  (rng) => { const a = rng.int(1, 6); const s = rng.int(1, 4); const b = a + s * rng.int(2, 5) + rng.int(0, s - 1);
    const out = seqL(a, s, b).join(' '); const prog = [`for i in $(seq ${a} ${s} ${b}); do echo -n "$i "; done; echo`];
    return { prog, out, wrong: [seqL(a, s, b - 1).slice(0, -1).join(' '), seqL(a, 1, b).join(' '), seqL(a, s, b).concat([b + s]).join(' '), seqL(a + s, s, b).join(' ')], why: '`seq INÍCIO PASSO FIM` gera INÍCIO, INÍCIO+PASSO, ... enquanto não passar de FIM (o fim é incluído se for atingido).' }; },
  (rng) => { const b = rng.int(3, 9); const a = rng.int(1, 2); const sep = rng.pick([',', '-', ':']); const w = rng.chance(0.4);
    const nums = seqL(a, 1, b + (w ? 9 : 0)); const out = w ? nums.map((x) => String(x).padStart(2, '0')).join(sep) : nums.join(sep);
    const prog = [`seq ${w ? '-w ' : ''}-s '${sep}' ${a} ${b + (w ? 9 : 0)}`];
    return { prog, out, wrong: [nums.join(' '), nums.join(sep).replace(new RegExp(`\\${sep}`, 'g'), ' '), seqL(a, 1, b - 1).join(sep)], why: '`seq -s SEP` troca o separador (por padrão é a quebra de linha); `-w` completa com zeros à esquerda para igualar a largura.' }; },
  (rng) => { const a = rng.int(1, 4); const b = rng.int(5, 9); const k = rng.int(2, 5); let s = 0; for (let i = a; i <= b; i++) s += i * k;
    return { prog: ['s=0', `for i in $(seq ${a} ${b}); do`, `  s=$((s + i * ${k}))`, 'done', 'echo $s'], out: String(s), wrong: [s - k * a, s + k * (b + 1), (b - a + 1) * k, s - k * b, seqL(a, 1, b).reduce((x, y) => x + y, 0)], why: 'O laço soma i×k para i de A até B (inclusive). Dentro de `$(( ))` as variáveis não precisam de `$`.' }; },
  (rng) => { const n = rng.int(10, 30); const st = rng.int(3, 7); let c = 0; let x = n; while (x > 0) { x -= st; c++; }
    return { prog: [`n=${n}`, 'c=0', 'while [ $n -gt 0 ]; do', `  n=$((n - ${st}))`, '  c=$((c + 1))', 'done', 'echo "$c $n"'], out: `${c} ${x}`, wrong: [`${c - 1} ${x + st}`, `${c + 1} ${x - st}`, `${c} ${x + st}`, `${c - 1} ${x}`], why: '`while` repete enquanto o teste for verdadeiro; aqui o valor de `n` desce de passo em passo até ficar ≤ 0 (pode ficar negativo).' }; },
  (rng) => { const a = rng.int(0, 5); const b = rng.int(8, 20); const st = rng.int(2, 5); let i = a; while (!(i >= b)) i += st;
    return { prog: [`i=${a}`, `until [ $i -ge ${b} ]; do`, `  i=$((i + ${st}))`, 'done', 'echo $i'], out: String(i), wrong: [i - st, i + st, b, a, b - 1], why: '`until` repete **até** o teste ficar verdadeiro (o oposto de `while`): sai assim que `i` é ≥ ' + b + '.' }; },
  (rng) => { const k = rng.pick([['a + b * c', (a, b, c) => a + b * c], ['(a + b) * c', (a, b, c) => (a + b) * c], ['a * b % c', (a, b, c) => imod(a * b, c)], ['a / b + c', (a, b, c) => idiv(a, b) + c], ['a ** 2 - b', (a, b, c) => a ** 2 - b + 0 * c]]);
    const a = rng.int(5, 20); const b = rng.int(2, 6); const c = rng.int(2, 9);
    const e = k[0].replace(/a/g, a).replace(/b/g, b).replace(/c/g, c); const v = k[1](a, b, c);
    return { prog: [`echo $(( ${e} ))`], out: String(v), wrong: [Math.round(a / b * 100) / 100 + c, (a + b) * c, a + b * c, a * b + c, a ** 2 + b, v + 1, v - 1], why: 'A aritmética do shell é de **inteiros**, com a precedência usual (`**` antes de `* / %`, e estes antes de `+ -`); a divisão trunca.' }; },
  (rng) => { const a = rng.int(7, 30); const b = rng.int(2, 6); const neg = rng.chance(0.5); const op = rng.pick(['/', '%']);
    const x = neg ? -a : a; const v = op === '/' ? idiv(x, b) : imod(x, b);
    return { prog: [`echo $(( ${neg ? '-' : ''}${a} ${op} ${b} ))`], out: String(v), wrong: [op === '/' ? Math.floor(x / b) : ((x % b) + b) % b, op === '/' ? Math.round(x / b) : -v, v + 1, op === '/' ? idiv(a, b) * (neg ? 1 : -1) : a % b + 1], why: '`/` e `%` do shell seguem a aritmética do C: o quociente é truncado em direção a zero e o resto tem o sinal do dividendo.' }; },
  (rng) => { const a = rng.int(3, 9); const pre = rng.chance(0.5);
    return { prog: [`i=${a}`, pre ? 'echo $(( ++i )) $i' : 'echo $(( i++ )) $i'], out: pre ? `${a + 1} ${a + 1}` : `${a} ${a + 1}`, wrong: [pre ? `${a} ${a + 1}` : `${a + 1} ${a + 1}`, `${a} ${a}`, `${a + 1} ${a}`], why: '`i++` (pós-incremento) devolve o valor **antes** de somar; `++i` (pré-incremento) soma primeiro e devolve o valor novo. Em ambos os casos `i` termina valendo a+1.' }; },
  (rng) => { const n = rng.int(3, 5); let c = 0; for (let i = 1; i <= n; i++) for (let j = 1; j <= i; j++) c++;
    return { prog: ['c=0', `for i in $(seq 1 ${n}); do`, '  for j in $(seq 1 $i); do', '    c=$((c + 1))', '  done', 'done', 'echo $c'], out: String(c), wrong: [n * n, n * (n - 1) / 2, c + n, c - 1, n], why: 'O laço interno roda i vezes para cada i de 1 a ' + n + ': 1+2+...+' + n + ' = ' + c + '.' }; },
  (rng) => { const n = rng.int(7, 12); const k = rng.int(2, 3); const m = rng.int(5, n - 1); const o = [];
    for (let i = 1; i <= n; i++) { if (i % k === 0) continue; if (i > m) break; o.push(i); }
    return { prog: [`for i in $(seq 1 ${n}); do`, `  [ $((i % ${k})) -eq 0 ] && continue`, `  [ $i -gt ${m} ] && break`, '  echo -n "$i "', 'done', 'echo'], out: o.join(' '), wrong: [seqL(1, 1, m).join(' '), o.concat([m + 1]).join(' '), seqL(1, 1, n).filter((i) => i % k === 0 && i <= m).join(' '), o.slice(0, -1).join(' ')], why: '`continue` pula para a próxima volta (aqui ignora os múltiplos de ' + k + ') e `break` encerra o laço quando `i` passa de ' + m + '.' }; },
  (rng) => { const a = rng.int(0, 3); const b = rng.int(5, 9); const st = rng.int(1, 3); const o = []; for (let i = a; i < b; i += st) o.push(i);
    return { prog: [`for (( i=${a}; i<${b}; i+=${st} )); do echo -n "$i "; done; echo`], out: o.join(' '), wrong: seqL(a, st, b).join(' ') === o.join(' ') ? [o.concat([b]).join(' '), o.slice(1).join(' '), seqL(a, 1, b).join(' ')] : [seqL(a, st, b).join(' '), o.slice(1).join(' '), seqL(a, 1, b).join(' ')], why: 'No `for ((ini; teste; passo))` estilo C, o teste `i<' + b + '` é estrito: o valor final não entra.' }; },
];
const shLoop = {
  id: 'sh-loop-arith', obj: '105.2', nivel: 3, peso: 3,
  make(rng) {
    for (let t = 0; t < 30; t++) {
      const s = rng.pick(LACOS)(rng); const out = String(s.out).trim();
      const pool = uniqueWrong(s.wrong.map((x) => String(x).trim()), out).filter((x) => x !== '');
      if (pool.length < 3) continue;
      return {
        type: 'unica', text: `Qual é a saída do script abaixo (\`bash s.sh\`)? (\`echo -n\` não quebra a linha.)\n\n${block(s.prog.join('\n'))}`,
        options: mcq(rng, out, pool), explanation: `${s.why} Resultado: ${tk(out)}.`, ref: ['102:p.103-104', '102:p.119-121'],
        verify: { sh: `${prep(s.prog)}\nbash s.sh 2>&1`, expect: out },
      };
    }
    throw new Error('sh-loop-arith');
  },
};

// ---------------------------------------------------------------- argumentos
const PAL = ['alfa', 'beta', 'gama', 'delta', 'rio', 'mar', 'sol', 'lua'];
const ARGS_T = [
  (a) => ({ body: ['echo "$#"', 'shift', 'echo "$# $1"'], out: [String(a.length), `${a.length - 1} ${a[1] ?? ''}`.trim()], why: '`$#` é o número de argumentos; `shift` descarta `$1` e desloca os demais (`$2` vira `$1`), diminuindo `$#`.' }),
  (a) => ({ body: ['for x in "$@"; do echo -n "[$x]"; done', 'echo'], out: [a.map((x) => `[${x}]`).join('')], why: '`"$@"` preserva cada argumento como uma palavra (mesmo com espaços).' }),
  (a) => ({ body: ['for x in $*; do echo -n "[$x]"; done', 'echo'], out: [a.flatMap((x) => x.split(' ')).map((x) => `[${x}]`).join('')], why: '`$*` sem aspas é reaberto pelo shell e dividido por espaços: um argumento como "b c" vira duas palavras.' }),
  (a) => ({ body: ['for x in "$*"; do echo -n "[$x]"; done', 'echo'], out: [`[${a.join(' ')}]`], why: '`"$*"` junta todos os argumentos em **uma** única palavra (separada pelo primeiro caractere de IFS).' }),
  (a) => ({ body: ['shift 2', 'echo "$# $1"'], out: [`${a.length - 2} ${a[2]}`], need: 3, why: '`shift 2` descarta os dois primeiros argumentos; `$1` passa a ser o antigo `$3`.' }),
  (a) => ({ body: ['echo "${1:-padrao} ${4:-nada}"'], out: [`${a[0] ?? 'padrao'} ${a[3] ?? 'nada'}`], why: '`${N:-valor}` usa `valor` quando o parâmetro N está vazio ou não existe.' }),
  (a) => ({ body: ['echo "$0 $# $2"'], out: [`./s.sh ${a.length} ${a[1] ?? ''}`.trim()], why: '`$0` é o nome do script como foi chamado; `$#` conta os argumentos; `$2` é o segundo.' }),
  (a) => ({ body: ['set -- x y z', 'echo "$# $2 $1"'], out: ['3 y x'], why: '`set -- ...` redefine os parâmetros posicionais do script.' }),
];
const shArgs = {
  id: 'sh-args-shift', obj: '105.2', nivel: 3, peso: 2,
  make(rng) {
    for (let t = 0; t < 30; t++) {
      const n = rng.int(3, 4); const a = rng.sample(PAL, n); if (rng.chance(0.6)) a[1] = `${a[1]} ${rng.pick(PAL.filter((x) => !a.includes(x)))}`;
      const s = rng.pick(ARGS_T)(a); if (s.need && a.length < s.need) continue;
      const chamada = `./s.sh ${a.map((x) => (x.includes(' ') ? `"${x}"` : x)).join(' ')}`;
      const out = s.out.join('\n');
      // distratores: saídas de outros corpos com os mesmos argumentos
      const outros = ARGS_T.map((f) => f(a)).filter((r) => !(r.need && a.length < r.need)).map((r) => r.out.join('\n')).filter((x) => x !== out);
      const pool = [...new Set(outros)];
      if (pool.length < 3) continue;
      const body = ['#!/bin/bash', ...s.body];
      return {
        type: 'unica', text: `O script \`s.sh\` (com permissão de execução) tem o conteúdo abaixo e é chamado como mostrado. Quais linhas ele imprime?\n\n${block(body.join('\n'))}\n\n${block(chamada)}`,
        options: mcq(rng, out.replace(/\n/g, ' ⏎ '), pool.map((x) => x.replace(/\n/g, ' ⏎ '))), explanation: `${s.why} (O símbolo ⏎ separa linhas de saída.) Saída: ${out.replace(/\n/g, ' ⏎ ')}.`, ref: ['102:p.100-101'],
        verify: { sh: `${prep(body)}\nchmod +x s.sh\n${chamada}`, expect: out },
      };
    }
    throw new Error('sh-args-shift');
  },
};

// ---------------------------------------------------------------- case e read
const CASE_PAT = [['[0-9]*', 'numero'], ['*.txt', 'texto'], ['*.md|*.rst', 'doc'], ['[A-Z]*', 'maiuscula'], ['?', 'um'], ['??', 'dois'], ['a*', 'comeca_a'], ['*[0-9]', 'termina_num'], ['dev|ops', 'equipe'], ['-*', 'opcao'], ['s|S|sim', 'sim']];
const globRe = (p) => new RegExp('^(?:' + p.split('|').map((x) => x.replace(/[.+^${}()\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')).join('|') + ')$');
const shCase = {
  id: 'sh-case-read', obj: '105.2', nivel: 3, peso: 2,
  make(rng) {
    if (rng.chance(0.6)) {
      for (let t = 0; t < 60; t++) {
        const pats = rng.sample(CASE_PAT, rng.int(3, 4)); const entradas = ['2024', 'nota.txt', 'Zeta', 'x', 'ab', 'abc', 'dev', 'ops', 'sim', 'S', 'README.md', '-v', 'a1', 'ano9', 'guia.rst', 'a'];
        const inp = rng.pick(entradas);
        const lab = (x) => { for (const [p, l] of pats) if (globRe(p).test(x)) return l; return 'outro'; };
        const real = lab(inp); const todos = [...pats.map((p) => p[1]), 'outro'];
        const alt = (() => { for (const [p, l] of [...pats].reverse()) if (globRe(p).test(inp)) return l; return 'outro'; })();
        const pool = [...new Set([...todos, alt])].filter((x) => x !== real);
        if (pool.length < 3) continue;
        const prog = ['#!/bin/bash', 'case "$1" in', ...pats.map(([p, l]) => `  ${p}) echo ${l} ;;`), '  *) echo outro ;;', 'esac'];
        return {
          type: 'unica', text: `Qual é a saída de \`./s.sh ${inp}\` para o script abaixo?\n\n${block(prog.join('\n'))}`,
          options: mcq(rng, real, pool), explanation: 'O `case` compara o valor com cada padrão (globbing: `*`, `?`, `[...]`, e `|` para alternativas) **na ordem** e executa só o primeiro que casar, terminando em `;;`. O padrão `*)` final é o "senão". Aqui o valor `' + inp + '` casa primeiro com: ' + real + '.', ref: ['102:p.117-118'],
          verify: { sh: `${prep(prog)}\nchmod +x s.sh\n./s.sh ${sq(inp)}`, expect: real },
        };
      }
    }
    const k = rng.pick(['lin', 'ifs', 'curta', 'reply', 'while']);
    let prog; let out; let why; let pool;
    if (k === 'lin') {
      const w = rng.sample(PAL, rng.int(4, 5)); prog = ['read A B C <<< "' + w.join(' ') + '"', 'echo "$A|$B|$C"']; out = `${w[0]}|${w[1]}|${w.slice(2).join(' ')}`;
      why = '`read` divide a linha em palavras (separadas por IFS) e atribui uma a cada variável; o que sobrar vai todo para a **última** variável.';
      pool = [`${w[0]}|${w[1]}|${w[2]}`, `${w[2]}|${w[1]}|${w[0]}`, `${w[0]} ${w[1]}|${w[2]}|${w.slice(3).join(' ')}`, `${w[0]}|${w[1]}|`, `${w.join(' ')}||`, `${w[0]}|${w.slice(1).join(' ')}|`];
    } else if (k === 'ifs') {
      const f = rng.sample(PAL, 4); prog = ['IFS=: read U P R <<< "' + f.join(':') + '"', 'echo "$U|$P|$R"']; out = `${f[0]}|${f[1]}|${f.slice(2).join(':')}`;
      why = 'Com `IFS=:` só o dois-pontos separa campos; a última variável recebe o restante da linha (incluindo os `:`).';
      pool = [`${f[0]}|${f[1]}|${f[2]}`, `${f[0]}|${f[1]}|${f[3]}`, `${f.join(':')}||`, `${f[2]}|${f[1]}|${f[0]}`, `${f[0]}|${f[1]}|`];
    } else if (k === 'curta') {
      const w = rng.sample(PAL, 2); prog = ['read A B C <<< "' + w.join(' ') + '"', 'echo "[$A][$B][$C]"']; out = `[${w[0]}][${w[1]}][]`;
      why = 'Se houver menos palavras que variáveis, as variáveis restantes ficam vazias.';
      pool = [`[${w[0]}][${w[1]}]`, `[${w[1]}][${w[0]}][]`, `[${w[0]}][][${w[1]}]`, `[${w[0]}][${w[1]}][${w[1]}]`, `[${w.join(' ')}][][]`];
    } else if (k === 'reply') {
      const w = rng.sample(PAL, 3); prog = ['read <<< "' + w.join(' ') + '"', 'echo "$REPLY"']; out = w.join(' ');
      why = 'Sem nome de variável, `read` guarda a linha inteira em `REPLY`.';
      pool = [w[0], w[2], w.slice(0, 2).join(' '), [...w].reverse().join(' ')];
    } else {
      const w = rng.sample(PAL, 4); prog = [`printf '%s %s\n' ${w.map((x) => `'${x}'`).join(' ')} | while read X Y; do echo "$Y-$X"; done`]; out = `${w[1]}-${w[0]}\n${w[3]}-${w[2]}`;
      why = 'O `while read X Y` lê uma linha por volta e separa em duas palavras: aqui `$Y-$X` inverte a ordem delas.';
      pool = [`${w[0]}-${w[1]}\n${w[2]}-${w[3]}`, `${w[3]}-${w[2]}\n${w[1]}-${w[0]}`, `${w[1]}-${w[0]}`, `${w[0]}-${w[1]}`, `${w[1]} ${w[0]}\n${w[3]} ${w[2]}`];
    }
    const options = mcq(rng, out.replace(/\n/g, ' ⏎ '), [...new Set(pool.filter((x) => x.trim() && x !== out).map((x) => x.replace(/\n/g, ' ⏎ ')).concat(['(vazio)']))]);
    return {
      type: 'unica', text: `Qual é a saída do script abaixo?${k === 'while' ? ' (O símbolo ⏎ separa linhas de saída.)' : ''}\n\n${block(prog.join('\n'))}`,
      options, explanation: why, ref: ['102:p.101'],
      verify: { sh: `${prep(prog)}\nbash s.sh 2>&1`, expect: out },
    };
  },
};
function w0(o) { return o.split('\n').map((l) => l.replace('-', ' ')).join('\n'); }

// ---------------------------------------------------------------- execução de scripts (shebang, permissão, PATH)
const shExec = {
  id: 'sh-exec', obj: '105.2', nivel: 3, peso: 3,
  make(rng) {
    let shebang = rng.pick(['#!/bin/bash', '#!/bin/bash', '']); const x = rng.chance(0.5);
    const inv = rng.pick(['./ola.sh', 'bash ola.sh', 'ola.sh', '. ola.sh', 'sh ola.sh', 'PATH=$PATH:. ola.sh', 'source ola.sh']);
    if (inv.startsWith('PATH=') && shebang === '#!/bin/naoexiste') shebang = '#!/bin/bash';
    const base = inv.replace(/^PATH=\$PATH:\. /, '');
    let res; // 'ok' | '126' | '127' | '126i'
    if (inv === 'ola.sh') res = '127';
    else if (['bash ola.sh', '. ola.sh', 'sh ola.sh', 'source ola.sh'].includes(inv)) res = 'ok';
    else if (!x) res = '126';
    else res = shebang === '#!/bin/naoexiste' ? '126i' : 'ok';
    void base;
    const T = { ok: 'Imprime `ola` e termina com status 0', 126: 'Falha com "Permission denied" (status 126)', 127: 'Falha com "command not found" (status 127)', '126i': 'Falha com "No such file or directory" (status 2)' };
    const options = ['ok', '126', '127', '126i'].map((k) => ({ t: T[k], ok: k === res }));
    const modo = x ? 'com permissão de execução (`chmod +x`)' : 'sem permissão de execução (modo 644)';
    const conteudo = [shebang, 'echo ola'].filter(Boolean);
    const setup = `printf '%s\\n' ${conteudo.map(sq).join(' ')} > ola.sh\nchmod ${x ? 755 : 644} ola.sh\n`;
    const expect = res === 'ok' ? 'ola\nrc=0' : res === '127' ? 'rc=127' : 'rc=126';
    const expl = {
      ok: 'Ao passar o arquivo como argumento de um interpretador (`bash ola.sh`, `sh ola.sh`) ou ao usar `source`/`.`, basta permissão de **leitura**; o shebang é ignorado ou irrelevante. Com `./ola.sh` o kernel precisa do bit de execução e de um interpretador válido no shebang (sem shebang, o bash roda o arquivo como script do próprio shell).',
      126: '`./ola.sh` (ou um nome encontrado via PATH) exige o bit de execução. Sem ele o shell diz "Permission denied" e devolve **126**.',
      127: 'O diretório atual **não** está no PATH: `ola.sh` sozinho não é encontrado ("command not found", status **127**), mesmo que o arquivo seja executável. É preciso `./ola.sh` ou incluir `.` no PATH.',
      '126i': 'O arquivo é executável, mas o shebang aponta para um interpretador que não existe: "bad interpreter: No such file or directory", status **126**. Com `bash ola.sh` o shebang seria só um comentário.',
    };
    return {
      type: 'unica',
      text: `O arquivo \`ola.sh\` está no diretório atual (que **não** está no PATH), ${modo}, e tem o seguinte conteúdo:\n\n${block(conteudo.join('\n'))}\n\nO que acontece ao executar \`${inv}\` em um shell bash?`,
      options, explanation: `${expl[res]} Aqui: ${T[res]}.`, ref: ['102:p.98-100'],
      verify: { sh: `cd "$(mktemp -d)"\n${setup}${inv} 2>/dev/null\necho "rc=$?"`, expect },
    };
  },
};

export const generators = [shChain, shExit, shTest, shLoop, shArgs, shCase, shExec];
