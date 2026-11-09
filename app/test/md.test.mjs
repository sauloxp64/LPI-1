// D-01: o Markdown caseiro (public/js/util.js, md()) não pode alterar expressões técnicas.
// Roda em memória, sem navegador: util.js só toca o DOM dentro de funções que o teste não chama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { md, esc } from '../public/js/util.js';
import { loadBank } from '../src/bank.mjs';
import { generators } from '../src/generators/index.mjs';
import { makeRng } from '../src/rng.mjs';

const inline = (s) => md(s, { inline: true }).s;
const block = (s) => md(s).s;

/** Expressões em que o asterisco é parte do conteúdo (cron, systemd, regex, glob). */
const LITERAIS = ['*/20 * * * *', '*-*-*', '\\(.*\\) \\(.*\\)', '*.*', 'OnCalendar=Sat,Sun *-*-* 05:00:00', '15 3 * * * root /opt/backup.sh'];

/** As tags geradas precisam abrir e fechar na ordem certa (ignora <br>). */
function bemAninhado(h) {
  const pilha = [];
  for (const m of h.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) {
    if (m[2] === 'br') continue;
    if (m[1]) { if (pilha.pop() !== m[2]) return false; } else pilha.push(m[2]);
  }
  return pilha.length === 0;
}
/** Dentro de <code> só pode haver texto escapado: nenhuma tag de ênfase. */
const codigoLimpo = (h) => [...h.matchAll(/<code>([\s\S]*?)<\/code>/g)].every((m) => !m[1].includes('<'));

test('md: código entre crases preserva os asteriscos (inline e em bloco)', () => {
  for (const s of LITERAIS) {
    assert.equal(inline(`\`${s}\``), `<code>${esc(s)}</code>`, s);
    assert.equal(block(`\`${s}\``), `<p><code>${esc(s)}</code></p>`, s);
  }
});

test('md: o mesmo texto SEM crases também não vira ênfase', () => {
  for (const s of LITERAIS) {
    assert.equal(inline(s), esc(s), s);
    assert.equal(block(s), `<p>${esc(s)}</p>`, s);
  }
  // no meio de uma frase
  assert.equal(inline('Use 15 3 * * * root /opt/backup.sh e depois *-*-* 05:00'), 'Use 15 3 * * * root /opt/backup.sh e depois *-*-* 05:00');
  // padrão entre aspas num comando (glob) também é literal
  assert.equal(inline("find . -type f -name '*ota*' -o -iname \"*CES*\""), 'find . -type f -name &#39;*ota*&#39; -o -iname &quot;*CES*&quot;');
  assert.equal(inline('cp -r origem/*.* destino'), 'cp -r origem/*.* destino');
});

test('md: dois trechos de código na mesma linha não se unem (find -name `*.txt` -o -name `*.log`)', () => {
  const h = inline('find -name `*.txt` -o -name `*.log`');
  assert.equal(h, 'find -name <code>*.txt</code> -o -name <code>*.log</code>');
  assert.ok(bemAninhado(h));
  assert.equal(block('Comando: find -name `*.txt` -o -name `*.log`'), '<p>Comando: find -name <code>*.txt</code> -o -name <code>*.log</code></p>');
});

test('md: blocos ``` recebem só escape HTML', () => {
  assert.equal(block('```\n*/20 * * * * <b>x</b>\n```'), '<pre><code>*/20 * * * * &lt;b&gt;x&lt;/b&gt;</code></pre>');
  assert.equal(block('antes\n\n```sh\nfind . -name *.txt -o -name *.log\n```\n\ndepois *ok*'),
    '<p>antes</p><pre><code>find . -name *.txt -o -name *.log</code></pre><p>depois <em>ok</em></p>');
});

test('md: HTML continua escapado (nenhuma inserção de HTML cru)', () => {
  for (const s of ['<img src=x onerror=alert(1)>', '`<img src=x onerror=alert(1)>`', '**<img src=x onerror=alert(1)>**', '*<script>alert(1)</script>*', '"><svg/onload=alert(1)>']) {
    for (const h of [inline(s), block(s)]) {
      assert.ok(!/<(img|script|svg)/i.test(h), `${s} => ${h}`);
      assert.ok(h.includes('&lt;'), h);
    }
  }
  assert.equal(inline('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(inline('**<b>x</b>**'), '<strong>&lt;b&gt;x&lt;/b&gt;</strong>');
});

test('md: negrito, itálico, código e listas legítimos continuam funcionando', () => {
  assert.equal(inline('**x**'), '<strong>x</strong>');
  assert.equal(inline('*x*'), '<em>x</em>');
  assert.equal(inline('Isso é **muito** importante e *talvez* útil'), 'Isso é <strong>muito</strong> importante e <em>talvez</em> útil');
  assert.equal(inline('(*yank*) e **depois**.'), '(<em>yank</em>) e <strong>depois</strong>.');
  assert.equal(inline('Só *não* aceita'), 'Só <em>não</em> aceita');
  assert.equal(inline('**um** e **dois**, *três* e *quatro*'), '<strong>um</strong> e <strong>dois</strong>, <em>três</em> e <em>quatro</em>');
  assert.equal(inline('use `ls -l` com **cuidado**'), 'use <code>ls -l</code> com <strong>cuidado</strong>');
  assert.equal(inline('`a` *b* `c`'), '<code>a</code> <em>b</em> <code>c</code>');
  assert.equal(inline('X busca o comando **mais recente que *começa* com** Y'), 'X busca o comando <strong>mais recente que <em>começa</em> com</strong> Y');
  assert.equal(inline('*a **b** c*'), '*a <strong>b</strong> c*'); // itálico em volta de negrito: não é suportado, mas nunca quebra o HTML
  assert.equal(block('* item um\n* item **dois**\n* `*.txt`'), '<ul><li>item um</li><li>item <strong>dois</strong></li><li><code>*.txt</code></li></ul>');
  assert.equal(block('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(block('Primeiro.\n\nSegundo *aqui*.'), '<p>Primeiro.</p><p>Segundo <em>aqui</em>.</p>');
  assert.equal(inline('linha 1\nlinha 2'), 'linha 1<br>linha 2');
});

test('md: ênfase pode envolver um trecho de código inteiro (como no laboratório)', () => {
  assert.equal(inline('**`x`**'), '<strong><code>x</code></strong>');
  assert.equal(inline('*`x`*'), '<em><code>x</code></em>');
  assert.equal(inline('Crie **`backup-loja.tar.gz`** e **`*.tmp`**'), 'Crie <strong><code>backup-loja.tar.gz</code></strong> e <strong><code>*.tmp</code></strong>');
  assert.equal(inline('**use `ls *` aqui**'), '<strong>use <code>ls *</code> aqui</strong>');
  assert.equal(inline('**`*/20 * * * *`** é a frase'), '<strong><code>*/20 * * * *</code></strong> é a frase');
});

test('md: ênfase não atravessa trechos de código nem aceita só espaços', () => {
  // o * de dentro do código não fecha o itálico que abriu fora dele
  assert.equal(inline('*abre `a*b` fecha'), '*abre <code>a*b</code> fecha');
  assert.equal(inline('**abre `a**b` fecha'), '**abre <code>a**b</code> fecha');
  // conteúdo só de espaços não é ênfase
  assert.equal(inline('a ** ** b'), 'a ** ** b');
  assert.equal(inline('a *  * b'), 'a *  * b');
  assert.equal(inline('* * *'), '* * *');
  assert.equal(inline('**'), '**');
});

test('md: caracteres de uso interno no texto de entrada não forjam trechos de código', () => {
  assert.equal(inline('\uE0000\uE001 e `x`'), '0 e <code>x</code>');
  assert.equal(inline('\uE000\uE001'), '');
});

test('md: resultado sempre bem aninhado, com código só de texto escapado', () => {
  const amostras = [...LITERAIS, 'find -name `*.txt` -o -name `*.log`', '`a` * `b` *c* **d** `*-*-*`', '*x `y` z*', '**x** *y* `z*`', '2 * 3 * 4', 'rm *.txt; ls *.log', '**a *b** c*', '*a **b* c**', '***x***', '**a** *b* **c *d* e**'];
  for (const s of amostras) {
    for (const h of [inline(s), block(s), block(`* ${s}`)]) {
      assert.ok(bemAninhado(h), `${s} => ${h}`);
      assert.ok(codigoLimpo(h), `${s} => ${h}`);
    }
  }
});

// ---------- o que o aluno efetivamente vê: banco de questões e geradores ----------

/** Trechos entre crases (uma linha) de um texto, na ordem em que aparecem. */
const trechosDeCodigo = (s) => [...String(s).replace(/```[^\n`]*\n?[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
const codigosRenderizados = (h) => [...h.matchAll(/<code>([\s\S]*?)<\/code>/g)].map((m) => m[1]);

function confereQuestao(q, onde) {
  const campos = [['enunciado', q.text, block], ['explicação', q.explanation, block], ...q.options.map((o, k) => [`alternativa ${k + 1}`, o.t, inline])];
  for (const [nome, src, fn] of campos) {
    if (!src) continue;
    const h = fn(src);
    const real = trechosDeCodigo(src);
    // sem blocos ``` no texto, cada trecho de código deve sair exatamente igual (só com escape)
    if (!/```/.test(src)) assert.deepEqual(codigosRenderizados(h), real.map(esc), `${onde} ${nome}: ${src}`);
    assert.ok(bemAninhado(h), `${onde} ${nome} mal aninhado: ${h}`);
    assert.ok(codigoLimpo(h), `${onde} ${nome} com tag dentro de <code>: ${h}`);
  }
}

test('banco real: todo trecho entre crases é exibido intacto e o HTML é bem aninhado', () => {
  const { questions } = loadBank();
  assert.ok(questions.length > 500);
  for (const q of questions) confereQuestao(q, q.id);
});

test('questões com alternativas técnicas (D-01): o texto de cada alternativa, inclusive a correta, aparece intacto', () => {
  const { questions } = loadBank();
  const visivel = (h) => h.replace(/<[^>]+>/g, '').replace(/&(#39|quot|lt|gt|amp);/g, (_, e) => ({ '#39': "'", quot: '"', lt: '<', gt: '>', amp: '&' }[e]));
  for (const id of ['103.1-043', '103.3-012', '107.2-002', '107.2-009', '107.2-042', '108.2-018']) {
    const q = questions.find((x) => x.id === id);
    assert.ok(q, id);
    assert.ok(q.options.some((o) => o.ok), `${id} sem alternativa correta`);
    for (const o of q.options) {
      const h = inline(o.t);
      assert.ok(!/<(em|strong)>/.test(h), `${id}: ênfase indevida em "${o.t}" => ${h}`);
      assert.equal(visivel(h), o.t.replaceAll('`', ''), `${id}: "${o.t}"`); // com ou sem crases, o texto visível é o mesmo
    }
  }
});

test('geradores: todo trecho entre crases é exibido intacto e o HTML é bem aninhado', () => {
  let n = 0;
  for (const g of generators) {
    for (let i = 0; i < 3; i++) {
      const q = g.make(makeRng(`unit:${g.id}:${i}`));
      confereQuestao({ text: q.text, explanation: q.explanation, options: q.options ?? [] }, `${g.id}#${i}`);
      n++;
    }
  }
  assert.ok(n > 300);
});
