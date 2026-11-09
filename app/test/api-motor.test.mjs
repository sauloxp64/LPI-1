// Regressões do motor (A-03 importação, A-04 exclusão): sobe o servidor de verdade (porta aleatória, banco temporário).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
let proc; let dir;

const call = async (path, method = 'GET', body) => {
  const r = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
/** Abre o banco do servidor por outra conexão (para conferir o estado e injetar falhas). */
const withDb = (fn) => { const d = new DatabaseSync(join(dir, 't.db')); d.exec('PRAGMA busy_timeout = 5000'); try { return fn(d); } finally { d.close(); } };

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'lpic-motor-'));
  // materiais fictícios (os PDFs da LPI não são versionados): um "PDF" de 10 bytes e um caminho que é pasta
  mkdirSync(join(dir, 'mat'));
  writeFileSync(join(dir, 'mat', 'LPI-Learning-Material-101-500-pt.pdf'), '0123456789');
  mkdirSync(join(dir, 'mat', 'LPI-Learning-Material-102-500-pt.pdf'));
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(HERE, '../src/server.mjs')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: join(dir, 't.db'), LAB_URL: 'http://127.0.0.1:1', LAB_TERMINAL_URL: 'http://127.0.0.1:1', MATERIALS_DIR: join(dir, 'mat'), CHALLENGES_DIR: join(HERE, '../../lab/challenges') },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/stats`)).ok) return; } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('servidor não subiu');
});
after(() => { proc?.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } });

// ---------- A-05: arquivos servidos por stream (o helper em si é testado em pipefile.test.mjs) ----------
test('A-05: PDF servido por stream — integral, Range, sufixo e HEAD; o que não é arquivo dá 404', async () => {
  const todo = await fetch(`${BASE}/pdf/101`);
  assert.equal(todo.status, 200);
  assert.equal(todo.headers.get('content-length'), '10');
  assert.equal(todo.headers.get('content-type'), 'application/pdf');
  assert.equal(await todo.text(), '0123456789');
  const meio = await fetch(`${BASE}/pdf/101`, { headers: { range: 'bytes=2-4' } });
  assert.equal(meio.status, 206);
  assert.equal(meio.headers.get('content-range'), 'bytes 2-4/10');
  assert.equal(await meio.text(), '234');
  assert.equal(await (await fetch(`${BASE}/pdf/101`, { headers: { range: 'bytes=-3' } })).text(), '789');
  assert.equal((await fetch(`${BASE}/pdf/101`, { headers: { range: 'bytes=99-' } })).status, 416);
  const head = await fetch(`${BASE}/pdf/101`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '10');
  assert.equal((await fetch(`${BASE}/pdf/102`)).status, 404, 'pasta com nome de PDF');
  assert.equal((await call('/api/stats')).status, 200, 'o servidor continua de pé');
});

// ---------- A-04: exclusão atômica ----------
test('A-04: se a reconstrução das estatísticas falhar na exclusão, nada é apagado; sem a falha, tudo é confirmado', async () => {
  const { json: { id: feita } } = await call('/api/exams', 'POST', { mode: 'topico', objetivos: ['103.4'], n: 6, minutes: 0 });
  await call(`/api/exams/${feita}/finish`, 'POST', {});
  const { json: { id: vazia } } = await call('/api/exams', 'POST', { mode: 'topico', objetivos: ['103.4'], n: 5, minutes: 0 });
  const estado = () => withDb((d) => ({
    qstats: d.prepare('SELECT * FROM qstats ORDER BY qid').all().map((r) => ({ ...r })),
    attempts: d.prepare('SELECT COUNT(*) n FROM attempts').get().n,
    exams: d.prepare('SELECT id FROM exams ORDER BY id').all().map((r) => r.id),
  }));
  const antes = estado();
  assert.ok(antes.qstats.length >= 2, 'o cenário precisa de ao menos duas questões com histórico');
  assert.ok(antes.exams.includes(vazia) && antes.exams.includes(feita));

  // a segunda inserção em qstats falha (a primeira passa): o que sobrava fora da transação ficava pela metade
  withDb((d) => d.exec("CREATE TRIGGER falha_qstats BEFORE INSERT ON qstats WHEN (SELECT COUNT(*) FROM qstats) >= 1 BEGIN SELECT RAISE(ABORT, 'falha injetada'); END"));
  try {
    assert.equal((await call(`/api/exams/${vazia}`, 'DELETE')).status, 500);
    assert.deepEqual(estado(), antes, 'prova, tentativas e estatísticas ficam exatamente como estavam');
    assert.equal((await call(`/api/exams/${vazia}`)).status, 200, 'a prova continua existindo');
  } finally { withDb((d) => d.exec('DROP TRIGGER falha_qstats')); }

  assert.equal((await call(`/api/exams/${vazia}`, 'DELETE')).status, 200);
  const depois = estado();
  assert.deepEqual(depois.exams, antes.exams.filter((x) => x !== vazia));
  assert.equal(depois.attempts, antes.attempts);
  assert.deepEqual(depois.qstats, antes.qstats, 'as estatísticas reconstruídas são as mesmas (a prova excluída não tinha tentativas)');
  assert.equal((await call(`/api/exams/${vazia}`)).status, 404);
});

// ---------- A-03: invariantes da importação ----------
const OBJ = '103.4';
const dump = (over = {}) => ({ versao: 1, progress: [], lessons: [], exams: [], attempts: [], qstats: [], reports: [], lab_runs: [], settings: [], ...over });
const opts = (...oks) => oks.map((ok, i) => ({ t: `alt ${i}`, ok }));
const unica = (over = {}) => ({ qid: 'bank:u1', src: 'bank', obj: OBJ, type: 'unica', level: 1, text: 'Qual comando?', options: opts(true, false, false, false), answers: [], explanation: 'x'.repeat(40), ref: [], tags: [], ...over });
const multipla = (over = {}) => ({ ...unica({ qid: 'bank:m1', type: 'multipla', options: opts(true, true, false, false, false) }), ...over });
const lacuna = (over = {}) => ({ ...unica({ qid: 'bank:l1', type: 'lacuna', options: [], answers: ['tee'] }), ...over });
/** Linha da tabela exams (colunas JSON em texto). */
const prova = (qs, over = {}) => ({
  id: 'ex1', created: 1_000_000, mode: 'topico', title: 'Prova importada', scope: '{}', seed: 's', minutes: 0, instant: 0, status: 'finalizado',
  questions: JSON.stringify(qs), answers: '{}', flags: '[]', overrides: '[]', checked: '[]', result: null, finished: 1_060_000, n: qs.length, parent: null, ...over,
});
const tent = (examId, idx, correct, over = {}) => ({ exam_id: examId, idx, qid: `bank:t${idx}`, obj: OBJ, type: 'unica', level: 1, correct, ts: 1_050_000, ...over });
const snapshot = async () => { const e = (await call('/api/export')).json; delete e.exportado; return e; };

async function recusa(d, rotulo) {
  const antes = await snapshot();
  const r = await call('/api/import', 'POST', d);
  assert.equal(r.status, 400, `${rotulo}: ${JSON.stringify(r.json)}`);
  assert.deepEqual(await snapshot(), antes, `${rotulo}: o banco anterior continua intacto`);
}

test('A-03: gabarito impossível é recusado (nenhuma correta, várias corretas em questão única, lacuna sem resposta)', async () => {
  // o caso do achado: quatro alternativas falsas e resposta vazia -> hoje daria 100% sem responder nada
  await recusa(dump({ exams: [prova([unica({ options: opts(false, false, false, false) })], { answers: '{"0":[]}' })] }), 'unica sem correta');
  await recusa(dump({ exams: [prova([unica({ options: opts(true, true, false, false) })])] }), 'unica com duas corretas');
  await recusa(dump({ exams: [prova([multipla({ options: opts(false, false, false, false, false) })])] }), 'multipla sem corretas');
  await recusa(dump({ exams: [prova([multipla({ options: opts(true, false, false, false, false) })])] }), 'multipla com uma só correta');
  await recusa(dump({ exams: [prova([multipla({ options: opts(true, true, true, true, true) })])] }), 'multipla toda correta');
  await recusa(dump({ exams: [prova([lacuna({ answers: [] })])] }), 'lacuna sem resposta aceita');
  await recusa(dump({ exams: [prova([lacuna({ answers: ['  '] })])] }), 'lacuna com resposta em branco');
  await recusa(dump({ exams: [prova([lacuna({ options: opts(true, false) })])] }), 'lacuna com alternativas');
});

test('A-03: índices e respostas inconsistentes são recusados', async () => {
  const q = [unica(), lacuna()];
  await recusa(dump({ exams: [prova(q, { flags: '[5]' })] }), 'flags fora da prova');
  await recusa(dump({ exams: [prova(q, { flags: '[1,1]' })] }), 'flags repetidos');
  await recusa(dump({ exams: [prova(q, { overrides: '[-1]' })] }), 'overrides negativo');
  await recusa(dump({ exams: [prova(q, { checked: '[0.5]' })] }), 'checked fracionário');
  await recusa(dump({ exams: [prova(q, { answers: '{"7":[0]}' })] }), 'resposta de questão inexistente');
  await recusa(dump({ exams: [prova(q, { answers: '{"0":{"x":1}}' })] }), 'resposta com formato inválido');
  await recusa(dump({ exams: [prova(q, { finished: null })] }), 'finalizada sem data de término');
});

test('A-03: prova em andamento — corrigidas só em treino e só se houver a tentativa correspondente; sem contestações', async () => {
  const q = [unica(), lacuna()];
  // não instantânea com `checked` (o caso do achado): finalizar registraria zero tentativas
  await recusa(dump({ exams: [prova(q, { status: 'andamento', finished: null, checked: '[0]' })], attempts: [tent('ex1', 0, 1)] }), 'checked em prova sem correção imediata');
  await recusa(dump({ exams: [prova(q, { status: 'andamento', finished: null, instant: 1, checked: '[0]' })] }), 'treino com checked e nenhuma tentativa');
  await recusa(dump({ exams: [prova(q, { status: 'andamento', finished: null, instant: 1 })], attempts: [tent('ex1', 1, 1)] }), 'treino com tentativa sem checked');
  await recusa(dump({ exams: [prova(q, { status: 'andamento', finished: null, instant: 1, overrides: '[0]' })] }), 'contestação em prova em andamento');
  // o consistente é aceito
  const ok = dump({ exams: [prova(q, { id: 'tr1', status: 'andamento', finished: null, instant: 1, checked: '[0]', answers: '{"0":[0]}' })], attempts: [tent('tr1', 0, 1)] });
  assert.equal((await call('/api/import', 'POST', ok)).status, 200);
  assert.equal((await call('/api/exams/tr1')).json.status, 'andamento');
});

test('A-03: `result` é dado derivado — resultado adulterado é recalculado a partir do snapshot', async () => {
  const q = [unica()]; // correta: índice 0
  const adulterado = { n: 1, correct: 1, pct: 1, respondidas: 1, por_obj: { [OBJ]: { n: 1, ok: 1 } }, items: [{ i: 0, ok: true, answered: true, contested: false }], tempo_seg: 1 };
  const d = dump({ exams: [prova(q, { id: 'forj', answers: '{"0":[1]}', result: JSON.stringify(adulterado) })], attempts: [tent('forj', 0, 0)] });
  assert.equal((await call('/api/import', 'POST', d)).status, 200);
  const v = (await call('/api/exams/forj')).json;
  assert.equal(v.questions[0].ok, false, 'a revisão não contradiz o gabarito');
  assert.deepEqual(v.questions[0].gabarito, [0]);
  assert.equal(v.result.correct, 0);
  assert.equal(v.result.pct, 0);
  const lista = (await call('/api/exams')).json.exames.find((e) => e.id === 'forj');
  assert.equal(lista.pct, 0, 'a listagem também usa o resultado recalculado');
  // contestação continua valendo no recálculo
  const c = dump({ exams: [prova(q, { id: 'forj', answers: '{"0":[1]}', overrides: '[0]', result: JSON.stringify(adulterado) })], attempts: [tent('forj', 0, 1)] });
  assert.equal((await call('/api/import', 'POST', c)).status, 200);
  assert.equal((await call('/api/exams/forj')).json.result.correct, 1);
});

test('A-03: `result` vazio ou ausente é reconstruído e revisão e "refazer erradas" funcionam', async () => {
  for (const result of ['{}', null]) {
    const d = dump({ exams: [prova([unica(), lacuna()], { id: 'sem', answers: '{"0":[1],"1":"errado"}', result })], attempts: [tent('sem', 0, 0), tent('sem', 1, 0, { type: 'lacuna' })] });
    assert.equal((await call('/api/import', 'POST', d)).status, 200, String(result));
    const v = (await call('/api/exams/sem')).json;
    assert.equal(v.result.n, 2);
    assert.deepEqual(v.questions.map((x) => x.ok), [false, false]);
    const w = await call('/api/exams/sem/wrong', 'POST', {});
    assert.equal(w.status, 200, `${result}: ${JSON.stringify(w.json)}`);
    assert.equal((await call(`/api/exams/${w.json.id}`)).json.n, 2);
  }
});

test('A-03: ida e volta de exportação legítima, inclusive tentativas de treino em andamento e respostas de formatos variados', async () => {
  // prova finalizada com respostas "esquisitas" que a API aceita (texto, número, lista) + contestação
  const { json: { id: fin } } = await call('/api/exams', 'POST', { mode: 'topico', objetivos: [OBJ], n: 6, minutes: 0 });
  await call(`/api/exams/${fin}/answers`, 'PUT', { answers: { 0: 'tee', 1: [0], 2: 3, 3: [0, 2], 4: null }, flags: [1, 4] });
  await call(`/api/exams/${fin}/finish`, 'POST', {});
  await call(`/api/exams/${fin}/contest`, 'POST', { i: 0 });
  // treino em andamento: fica de fora da exportação, mas as tentativas dele entram
  const { json: { id: tr } } = await call('/api/exams', 'POST', { mode: 'treino', objetivos: [OBJ], n: 4 });
  await call(`/api/exams/${tr}/check`, 'POST', { i: 0, answer: [0] });
  await call(`/api/exams/${tr}/check`, 'POST', { i: 1, answer: 'tee' });
  const exp = (await call('/api/export')).json;
  assert.ok(exp.exams.some((e) => e.id === fin) && !exp.exams.some((e) => e.id === tr));
  assert.ok(exp.attempts.some((a) => a.exam_id === tr), 'tentativas do treino em andamento estão na exportação');

  const antes = await snapshot();
  assert.equal((await call('/api/import', 'POST', exp)).status, 200);
  const depois = await snapshot();
  assert.deepEqual(depois.exams, antes.exams, 'provas e resultados idênticos depois da ida e volta (o recálculo reproduz o original)');
  assert.deepEqual(depois.attempts, antes.attempts);
  assert.deepEqual(depois.qstats, antes.qstats);
  assert.equal((await call('/api/import', 'POST', depois)).status, 200, 'segunda ida e volta');
});
