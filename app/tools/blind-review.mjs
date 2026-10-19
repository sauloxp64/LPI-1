#!/usr/bin/env node
// Revisão cega do banco de questões: um revisor responde SEM ver o gabarito; as divergências apontam erros do gabarito ou ambiguidades.
//   node tools/blind-review.mjs dump  <arquivo.txt> [--from=N --to=M]     imprime as questões sem gabarito (opções embaralhadas de forma estável)
//   node tools/blind-review.mjs score <arquivo.txt> <respostas.txt>        compara respostas com o gabarito e lista divergências
// Formato do arquivo de respostas (uma por linha):   103.4-001: B     103.4-002: A,C     103.4-003: tee
import { readFileSync } from 'node:fs';
import { parseQuestions, normalizeAnswer } from '../src/qformat.mjs';
import { makeRng } from '../src/rng.mjs';

const [cmd, file, answersFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (k) => Number((process.argv.find((a) => a.startsWith(`--${k}=`)) ?? '').split('=')[1]) || null;
const { questions } = parseQuestions(readFileSync(file, 'utf8'), file);
const LET = 'ABCDEFGH';

// ordem embaralhada e estável por questão
const view = (q) => {
  if (q.type === 'lacuna') return { q, order: [] };
  const order = makeRng(`blind:${q.id}`).shuffle(q.options.map((_, i) => i));
  return { q, order };
};

if (cmd === 'dump') {
  const from = flag('from') ?? 1; const to = flag('to') ?? questions.length;
  questions.slice(from - 1, to).forEach((q) => {
    const { order } = view(q);
    console.log(`\n## ${q.id} [${q.type === 'unica' ? 'uma resposta' : q.type === 'multipla' ? `escolha ${q.options.filter((o) => o.ok).length}` : 'lacuna: resposta curta'}]`);
    console.log(q.text);
    order.forEach((oi, k) => console.log(`  ${LET[k]}) ${q.options[oi].t}`));
  });
} else if (cmd === 'score') {
  const ans = new Map();
  for (const line of readFileSync(answersFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\d.]+-\w+)\s*:\s*(.*?)\s*$/);
    if (m) ans.set(m[1], m[2]);
  }
  let ok = 0; let total = 0; const miss = [];
  for (const q of questions) {
    if (!ans.has(q.id)) continue;
    total++;
    const given = ans.get(q.id);
    const { order } = view(q);
    let right;
    if (q.type === 'lacuna') right = q.answers.some((a) => normalizeAnswer(a) === normalizeAnswer(given));
    else {
      const chosen = new Set(given.split(/[,\s]+/).filter(Boolean).map((l) => order[LET.indexOf(l.toUpperCase())]));
      const want = new Set(q.options.map((o, i) => (o.ok ? i : -1)).filter((i) => i >= 0));
      right = chosen.size === want.size && [...want].every((i) => chosen.has(i));
    }
    if (right) ok++; else miss.push({ q, given, order });
  }
  console.log(`${ok}/${total} coincidem com o gabarito (${total ? Math.round((100 * ok) / total) : 0}%) — ${questions.length - total} sem resposta\n`);
  for (const { q, given, order } of miss) {
    console.log(`✗ ${q.id} (linha ${q.line}) revisor: ${given}`);
    console.log(q.text.split('\n').slice(0, 6).join('\n'));
    if (q.type === 'lacuna') console.log(`   gabarito: ${q.answers.join(' | ')}`);
    else order.forEach((oi, k) => console.log(`   ${LET[k]}) ${q.options[oi].ok ? '[GABARITO] ' : ''}${q.options[oi].t}`));
    console.log(`   explicação: ${q.explanation.split('\n')[0].slice(0, 220)}\n`);
  }
  process.exit(miss.length ? 1 : 0);
} else {
  console.log('uso: blind-review.mjs dump|score <arquivo.txt> [respostas.txt]');
  process.exit(2);
}
