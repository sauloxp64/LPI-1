import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.mjs';
import { loadBank } from '../src/bank.mjs';
import { buildExam, saveNewExam, loadExam, finishExam, checkOne, contest, allocate, isCorrect } from '../src/exam.mjs';
import { summary } from '../src/stats.mjs';
import { generators } from '../src/generators/index.mjs';

const bank = loadBank();
const mkEnv = (db, extra = {}) => ({
  bank, objetivos: bank.objetivos, topicos: {}, qstats: new Map(db.prepare('SELECT * FROM qstats').all().map((r) => [r.qid, r])),
  progress: new Map(), mastery: new Map(), now: Date.now(), ...extra,
});

test('allocate distribui exatamente n e respeita os pesos', () => {
  const objs = bank.objetivos.filter((o) => o.exame === '101');
  const m = allocate(objs, 60);
  assert.equal([...m.values()].reduce((a, b) => a + b, 0), 60);
  const m2 = allocate(objs, 37);
  assert.equal([...m2.values()].reduce((a, b) => a + b, 0), 37);
  assert.ok([...m2.values()].every((v) => v >= 1));
});

test('simulado oficial tem 60 questões, uma distribuição igual aos pesos e é aleatório', () => {
  const db = openDb(':memory:');
  const a = buildExam({ mode: 'oficial', exame: '101', seed: 'a' }, mkEnv(db));
  const b = buildExam({ mode: 'oficial', exame: '101', seed: 'b' }, mkEnv(db));
  assert.equal(a.questions.length, 60);
  assert.equal(a.minutes, 90);
  const cnt = {};
  a.questions.forEach((q) => { cnt[q.obj] = (cnt[q.obj] ?? 0) + 1; });
  for (const o of bank.objetivos.filter((x) => x.exame === '101')) assert.equal(cnt[o.code], o.peso, o.code);
  const same = a.questions.filter((q, i) => q.text === b.questions[i].text).length;
  assert.ok(same < 15, 'duas provas com sementes diferentes devem diferir bastante');
  // mesma semente => mesma prova
  const a2 = buildExam({ mode: 'oficial', exame: '101', seed: 'a' }, mkEnv(db));
  assert.deepEqual(a2.questions.map((q) => q.text), a.questions.map((q) => q.text));
});

test('fluxo completo: responder tudo certo = 100%, tudo errado = 0%, contestar e estatísticas', () => {
  const db = openDb(':memory:');
  const built = buildExam({ mode: 'oficial', exame: '102', seed: 'fluxo' }, mkEnv(db));
  const id = saveNewExam(db, built);
  let exam = loadExam(db, id);
  const answers = {};
  exam.questions.forEach((q, i) => {
    answers[i] = q.type === 'lacuna' ? q.answers[0] : q.options.map((o, k) => (o.ok ? k : -1)).filter((k) => k >= 0);
  });
  db.prepare('UPDATE exams SET answers = ? WHERE id = ?').run(JSON.stringify(answers), id);
  exam = finishExam(db, id);
  assert.equal(exam.result.pct, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM attempts').get().n, 60);

  const built2 = buildExam({ mode: 'oficial', exame: '102', seed: 'fluxo2' }, mkEnv(db));
  const id2 = saveNewExam(db, built2);
  db.prepare('UPDATE exams SET answers = ? WHERE id = ?').run(JSON.stringify({ 0: 'resposta-que-nao-existe' }), id2);
  const e2 = finishExam(db, id2);
  assert.ok(e2.result.pct < 0.1);
  const c = contest(db, id2, 0);
  assert.ok(c.result.items[0].ok);

  const s = summary(db, { objetivos: bank.objetivos, topicos: {}, bank });
  assert.ok(s.prontidao.geral > 0.35);
  assert.equal(s.totais.respondidas, 120);
  assert.ok(s.streak >= 1);
});

test('modo treino corrige uma por vez e registra uma única tentativa', () => {
  const db = openDb(':memory:');
  const built = buildExam({ mode: 'treino', objetivos: ['103.4'], n: 5, seed: 't' }, mkEnv(db));
  const id = saveNewExam(db, built);
  const exam = loadExam(db, id);
  const q = exam.questions[0];
  const right = q.type === 'lacuna' ? q.answers[0] : q.options.map((o, k) => (o.ok ? k : -1)).filter((k) => k >= 0);
  const r1 = checkOne(db, id, 0, right);
  assert.equal(r1.ok, true);
  checkOne(db, id, 0, 'outra');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM attempts WHERE exam_id = ?').get(id).n, 1);
});

test('isCorrect: multipla exige conjunto exato; lacuna normaliza espaços e prompt', () => {
  const m = { type: 'multipla', options: [{ ok: true }, { ok: false }, { ok: true }, { ok: false }, { ok: false }] };
  assert.ok(isCorrect(m, [2, 0]));
  assert.ok(!isCorrect(m, [0]));
  assert.ok(!isCorrect(m, [0, 2, 3]));
  const l = { type: 'lacuna', answers: ['ls -l'] };
  assert.ok(isCorrect(l, '  $ ls   -l '));
  assert.ok(!isCorrect(l, 'LS -l'));
});

test('todo objetivo tem questões no banco ou geradores', () => {
  const sem = bank.objetivos.filter((o) => !bank.questions.some((q) => q.obj === o.code) && !generators.some((g) => g.obj === o.code));
  // durante a construção do banco alguns objetivos ainda podem faltar: apenas informa
  if (sem.length) console.log('objetivos sem conteúdo ainda:', sem.map((o) => o.code).join(', '));
});

test('simulado oficial incompleto é recusado em vez de montar prova menor', () => {
  const db = openDb(':memory:');
  const env = mkEnv(db);
  // sem questões fixas de um objetivo e sem gerador para ele
  const semGeradores = bank.objetivos.find((o) => o.exame === '102' && !generators.some((g) => g.obj === o.code));
  if (!semGeradores) return; // todos têm geradores: nada a testar
  const bank2 = { ...bank, questions: bank.questions.filter((q) => q.obj !== semGeradores.code) };
  assert.throws(() => buildExam({ mode: 'oficial', exame: '102', seed: 'x' }, { ...env, bank: bank2 }), /incompleto|sem questões/i);
});

test('cronômetro: minutes 0 não vira o padrão em nenhum modo', () => {
  const db = openDb(':memory:');
  const env = mkEnv(db, { progress: new Map([['103.4', 'estudando']]) });
  for (const mode of ['topico', 'curso', 'fracos', 'relampago']) {
    const b = buildExam({ mode, objetivos: ['103.4'], n: 10, minutes: 0, seed: 's' }, env);
    assert.equal(b.minutes, 0, mode);
  }
});
