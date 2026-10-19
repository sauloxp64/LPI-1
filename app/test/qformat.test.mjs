import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuestions, lintQuestions, normalizeAnswer } from '../src/qformat.mjs';
import { loadBank } from '../src/bank.mjs';

const SAMPLE = `### 103.4-001 | unica | 2
ref: 101:p.285
Qual comando duplica a saída?

\`\`\`
= isto dentro de bloco não é opção
\`\`\`
= tee
- cat
- xargs
- tail
> \`tee\` lê a entrada padrão e escreve na saída e em arquivos; os demais não duplicam a saída.

### 103.4-002 | lacuna | 1
Complete: ____
= xargs
= /usr/bin/xargs
> Explicação com mais de trinta caracteres para passar no lint.
`;

test('parser: blocos, fences, opções e explicação', () => {
  const { questions, errors } = parseQuestions(SAMPLE, 't.txt');
  assert.deepEqual(errors, []);
  assert.equal(questions.length, 2);
  const [a, b] = questions;
  assert.equal(a.options.length, 4);
  assert.equal(a.options.filter((o) => o.ok).length, 1);
  assert.match(a.text, /isto dentro de bloco/);
  assert.deepEqual(a.ref, ['101:p.285']);
  assert.deepEqual(b.answers, ['xargs', '/usr/bin/xargs']);
});

test('lint: detecta gabarito ausente, opções repetidas e ref fora do objetivo', () => {
  const ruim = SAMPLE.replace('= tee', '- tee2').replace('- cat', '- cat\n- cat');
  const { questions } = parseQuestions(ruim, 't.txt');
  const { errors } = lintQuestions(questions, { objectives: new Set(['103.4']), outline: { '103.4': { exam: '101', start: 281, end: 303 } } });
  assert.ok(errors.some((e) => /exatamente 1/.test(e.msg)));
  const { questions: q2 } = parseQuestions(SAMPLE.replace('101:p.285', '101:p.10'), 't.txt');
  const r2 = lintQuestions(q2, { objectives: new Set(['103.4']), outline: { '103.4': { exam: '101', start: 281, end: 303 } } });
  assert.ok(r2.errors.some((e) => /fora das páginas/.test(e.msg)));
});

test('maiúsculas importam nas opções (-r != -R)', () => {
  const src = `### 103.3-001 | unica | 1
Qual opção copia recursivamente preservando tudo?
= \`cp -R\`
- \`cp -r\`
- \`cp -p\`
- \`cp -u\`
> Em \`cp\`, \`-R\` e \`-r\` são sinônimos; aqui apenas ilustra que a comparação respeita maiúsculas.
`;
  const { questions } = parseQuestions(src);
  assert.equal(lintQuestions(questions, {}).errors.filter((e) => /repetidas/.test(e.msg)).length, 0);
});

test('normalizeAnswer', () => {
  assert.equal(normalizeAnswer('  $  ls   -l  '), 'ls -l');
  assert.equal(normalizeAnswer('"tee"'), 'tee');
  assert.notEqual(normalizeAnswer('LS'), normalizeAnswer('ls'));
});

test('banco real: sem erros de validação e cobre os objetivos já escritos', () => {
  const b = loadBank();
  assert.deepEqual(b.errors, [], JSON.stringify(b.errors.slice(0, 5)));
  const ids = b.all.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'ids duplicados no banco');
  assert.ok(b.questions.length > 500);
});
