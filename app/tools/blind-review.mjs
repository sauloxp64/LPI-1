#!/usr/bin/env node
// Revisão cega do banco de questões: um revisor responde SEM ver o gabarito; as divergências apontam erros do gabarito ou ambiguidades.
//   node tools/blind-review.mjs dump  <arquivo.txt> [--from=N --to=M]     imprime as questões sem gabarito (opções embaralhadas de forma estável)
//   node tools/blind-review.mjs score <arquivo.txt> <respostas.txt>        compara respostas com o gabarito e lista divergências
// Formato do arquivo de respostas (uma por linha):   103.4-001: B     103.4-002: A,C     103.4-003: tee
// Linhas em branco e comentários (# ou //) são ignorados. Saída do score: 0 = tudo coincide · 1 = há divergências ·
// 2 = entrada inválida (nenhuma resposta comparável, ID desconhecido ou linha malformada — nunca "passa" sem comparar nada).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseQuestions, normalizeAnswer } from '../src/qformat.mjs';
import { makeRng } from '../src/rng.mjs';

const LET = 'ABCDEFGH';

// ordem embaralhada e estável por questão
const view = (q) => {
  if (q.type === 'lacuna') return { q, order: [] };
  const order = makeRng(`blind:${q.id}`).shuffle(q.options.map((_, i) => i));
  return { q, order };
};

/** Lê o arquivo de respostas. Devolve { ans: Map(id → texto), invalid: [mensagens] }. */
export function parseAnswers(source) {
  const ans = new Map();
  const invalid = [];
  source.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || /^\s*(#|\/\/)/.test(line)) return;
    const m = line.match(/^\s*([\d.]+-\w+)\s*:\s*(.*?)\s*$/);
    if (!m || !m[2]) { invalid.push(`linha ${i + 1} inválida: "${line.trim().slice(0, 80)}" (use "103.4-001: B")`); return; }
    ans.set(m[1], m[2]);
  });
  return { ans, invalid };
}

export function main(argv = process.argv.slice(2), deps = {}) {
  const { out = console.log, read = (p) => readFileSync(p, 'utf8') } = deps;
  const [cmd, file, answersFile] = argv.filter((a) => !a.startsWith('--'));
  const flag = (k) => Number((argv.find((a) => a.startsWith(`--${k}=`)) ?? '').split('=')[1]) || null;
  if (!['dump', 'score'].includes(cmd) || !file || (cmd === 'score' && !answersFile)) {
    out('uso: blind-review.mjs dump|score <arquivo.txt> [respostas.txt]');
    return 2;
  }
  let source;
  try { source = read(file); } catch (e) { out(`erro: não foi possível ler ${file}: ${e.code ?? e.message}`); return 2; }
  const { questions } = parseQuestions(source, file);

  if (cmd === 'dump') {
    const from = flag('from') ?? 1; const to = flag('to') ?? questions.length;
    questions.slice(from - 1, to).forEach((q) => {
      const { order } = view(q);
      out(`\n## ${q.id} [${q.type === 'unica' ? 'uma resposta' : q.type === 'multipla' ? `escolha ${q.options.filter((o) => o.ok).length}` : 'lacuna: resposta curta'}]`);
      out(q.text);
      order.forEach((oi, k) => out(`  ${LET[k]}) ${q.options[oi].t}`));
    });
    return 0;
  }

  // score
  let respostas;
  try { respostas = read(answersFile); } catch (e) { out(`erro: não foi possível ler ${answersFile}: ${e.code ?? e.message}`); return 2; }
  const { ans, invalid } = parseAnswers(respostas);
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const [id, given] of ans) {
    const q = byId.get(id);
    if (!q) { invalid.push(`${id}: ID não existe em ${file}`); continue; }
    if (q.type !== 'lacuna') {
      const letras = given.split(/[,\s]+/).filter(Boolean);
      const ruim = letras.filter((l) => { const k = LET.indexOf(l.toUpperCase()); return l.length !== 1 || k < 0 || k >= q.options.length; });
      if (!letras.length || ruim.length) invalid.push(`${id}: alternativa inválida "${given}" (use as letras A–${LET[q.options.length - 1]})`);
    }
  }
  if (invalid.length) {
    out(`${invalid.length} problema(s) no arquivo de respostas — nada foi comparado:`);
    invalid.forEach((m) => out(`  ${m}`));
    return 2;
  }
  if (!ans.size) { out('erro: o arquivo de respostas não contém nenhuma resposta; 0 comparações'); return 2; }

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
  out(`${ok}/${total} coincidem com o gabarito (${total ? Math.round((100 * ok) / total) : 0}%) — ${questions.length - total} sem resposta\n`);
  for (const { q, given, order } of miss) {
    out(`✗ ${q.id} (linha ${q.line}) revisor: ${given}`);
    out(q.text.split('\n').slice(0, 6).join('\n'));
    if (q.type === 'lacuna') out(`   gabarito: ${q.answers.join(' | ')}`);
    else order.forEach((oi, k) => out(`   ${LET[k]}) ${q.options[oi].ok ? '[GABARITO] ' : ''}${q.options[oi].t}`));
    out(`   explicação: ${q.explanation.split('\n')[0].slice(0, 220)}\n`);
  }
  return miss.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
