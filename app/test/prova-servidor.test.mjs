// Contrato de revisões do salvamento/finalização da prova (PUT /answers e POST /finish), com o servidor de verdade
// (porta aleatória, banco temporário). Cobre o achado A-02 da auditoria: versão igual com conteúdo divergente é
// conflito, a finalização passa pelo mesmo controle (409 antes de finalizar) e as revisões sobrevivem a reinício.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../src/db.mjs';
import { Servidor } from './falsos.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'lpic-rev-'));
const DB = join(dir, 't.db');
let proc; let BASE;

const startServer = async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  BASE = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(HERE, '../src/server.mjs')], {
    env: { ...process.env, PORT: String(port), DB_PATH: DB, LAB_URL: 'http://127.0.0.1:1', LAB_TERMINAL_URL: 'http://127.0.0.1:1', MATERIALS_DIR: join(HERE, '../..'), CHALLENGES_DIR: join(HERE, '../../lab/challenges') },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/api/stats`)).ok) return; } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('servidor não subiu');
};
const stopServer = async () => {
  if (!proc) return;
  const p = proc; proc = null;
  await new Promise((r) => { p.once('exit', r); p.kill(); });
};

const call = async (path, method = 'GET', body) => {
  const r = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const novaProva = async (extra = {}) => (await call('/api/exams', 'POST', { mode: 'topico', objetivos: ['103.4'], n: 6, minutes: 0, ...extra })).json.id;
const salvar = (id, body) => call(`/api/exams/${id}/answers`, 'PUT', body);
const finalizar = (id, body) => call(`/api/exams/${id}/finish`, 'POST', body);
const ver = async (id) => (await call(`/api/exams/${id}`)).json;

before(startServer);
after(async () => { await stopServer(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } });

test('revisão igual com conteúdo divergente é conflito e preserva a primeira escrita', async () => {
  const id = await novaProva();
  const a = (await salvar(id, { answers: { 0: [0] }, vers: { 0: 6 } })).json;
  assert.deepEqual(a.ignored, []);
  const b = (await salvar(id, { answers: { 0: [1] }, vers: { 0: 6 } })).json; // outra aba, mesma revisão-base
  assert.deepEqual(b.ignored, [0], 'a segunda escrita tem de ser recusada');
  assert.deepEqual(b.conflicts, [0], 'e identificada como conflito (revisão igual, conteúdo diferente)');
  assert.deepEqual(b.current.answers[0], [0], 'o servidor devolve o valor vigente para o cliente ressincronizar');
  assert.equal(b.vers['0'], 6);
  assert.deepEqual((await ver(id)).answers[0], [0], 'a primeira escrita foi preservada');
});

test('repetir o mesmo valor com a mesma revisão é idempotente', async () => {
  const id = await novaProva();
  await salvar(id, { answers: { 0: [0], 1: 'tee' }, vers: { 0: 3, 1: 1 }, flags: [2], fv: 1 });
  const r = (await salvar(id, { answers: { 0: [0], 1: 'tee' }, vers: { 0: 3, 1: 1 }, flags: [2], fv: 1 })).json;
  assert.deepEqual(r.ignored, []);
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.flagsIgnored, false);
  assert.deepEqual((await ver(id)).answers, { 0: [0], 1: 'tee' });
});

test('revisão antiga com valor diferente é ignorada, mas não é conflito', async () => {
  const id = await novaProva();
  await salvar(id, { answers: { 0: [1] }, vers: { 0: 5 } });
  const r = (await salvar(id, { answers: { 0: [0] }, vers: { 0: 3 } })).json;
  assert.deepEqual(r.ignored, [0]);
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual((await ver(id)).answers[0], [1]);
});

test('as marcações seguem a mesma regra (fv igual com lista diferente = conflito)', async () => {
  const id = await novaProva();
  await salvar(id, { answers: {}, flags: [1], fv: 4 });
  const b = (await salvar(id, { answers: {}, flags: [2], fv: 4 })).json;
  assert.equal(b.flagsIgnored, true);
  assert.deepEqual(b.current.flags, [1]);
  assert.deepEqual((await ver(id)).flags, [1], 'a primeira marcação foi preservada');
  const igual = (await salvar(id, { answers: {}, flags: [1], fv: 4 })).json;
  assert.equal(igual.flagsIgnored, false, 'repetição idempotente');
  const nova = (await salvar(id, { answers: {}, flags: [2], fv: 5 })).json;
  assert.equal(nova.flagsIgnored, false);
  assert.deepEqual((await ver(id)).flags, [2]);
});

test('edições de questões diferentes continuam sendo mescladas', async () => {
  const id = await novaProva();
  await salvar(id, { answers: { 0: [0] }, vers: { 0: 1 } });
  const r = (await salvar(id, { answers: { 1: [1] }, vers: { 1: 1 } })).json;
  assert.deepEqual(r.ignored, []);
  assert.deepEqual((await ver(id)).answers, { 0: [0], 1: [1] });
});

test('finalizar com revisão antiga e resposta divergente: 409 antes de finalizar; nada muda e nenhuma tentativa é criada', async () => {
  const id = await novaProva();
  const antes = (await call('/api/stats')).json.totais.respondidas;
  await salvar(id, { answers: { 0: [0] }, vers: { 0: 8 } }); // resposta recente confirmada pelo servidor
  const r = await finalizar(id, { answers: { 0: [1], 1: [0] }, vers: { 0: 6, 1: 1 }, flags: [3], fv: 1 }); // aba desatualizada
  assert.equal(r.status, 409);
  assert.deepEqual(r.json.ignored, [0]);
  assert.deepEqual(r.json.current.answers[0], [0]);
  assert.equal(r.json.vers['0'], 8);
  const v = await ver(id);
  assert.equal(v.status, 'andamento', 'a prova continua em andamento');
  assert.deepEqual(v.answers, { 0: [0] }, 'a resposta recente foi preservada e nada do lote recusado foi gravado');
  assert.deepEqual(v.flags, []);
  assert.equal((await call('/api/stats')).json.totais.respondidas, antes, 'nenhuma tentativa registrada');
});

test('finalizar com a mesma revisão e conteúdo divergente também é 409', async () => {
  const id = await novaProva();
  await salvar(id, { answers: { 0: [0] }, vers: { 0: 2 } });
  const r = await finalizar(id, { answers: { 0: [1] }, vers: { 0: 2 } });
  assert.equal(r.status, 409);
  assert.deepEqual(r.json.conflicts, [0]);
  assert.equal((await ver(id)).status, 'andamento');
});

test('finalizar com revisões em dia grava o estado completo, finaliza e repetir é idempotente', async () => {
  const id = await novaProva();
  await salvar(id, { answers: { 0: [0] }, vers: { 0: 2 }, flags: [1], fv: 1 });
  const full = { 0: [0], 1: [1], 2: null, 3: null, 4: null, 5: null };
  const vers = { 0: 2, 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 };
  const fin = await finalizar(id, { answers: full, vers, flags: [1], fv: 1 });
  assert.equal(fin.status, 200);
  assert.equal(fin.json.status, 'finalizado');
  assert.equal(fin.json.result.respondidas, 2);
  assert.equal((await finalizar(id, { answers: full, vers, flags: [1], fv: 1 })).status, 200, 'finalizar de novo devolve a prova já finalizada');
  assert.equal((await salvar(id, { answers: { 0: [1] }, vers: { 0: 9 } })).status, 409, 'PUT numa prova finalizada continua 409');
});

test('cliente sem revisões (formato antigo) continua funcionando como antes', async () => {
  const id = await novaProva();
  await salvar(id, { answers: { 0: [0] } });
  await salvar(id, { answers: { 0: [1] } });
  assert.deepEqual((await ver(id)).answers[0], [1]);
  const fin = (await finalizar(id, { answers: { 0: null, 1: [0] }, flags: [2] })).json;
  assert.equal(fin.result.respondidas, 1);
});

test('exclusão de prova com revisões persistidas funciona', async () => {
  const id = await novaProva();
  await salvar(id, { answers: { 0: [0] }, vers: { 0: 1 } });
  assert.equal((await call(`/api/exams/${id}`, 'DELETE')).status, 200);
  assert.equal((await call(`/api/exams/${id}`)).status, 404);
});

test('as revisões ficam no SQLite: reiniciar o processo não elimina o controle', async () => {
  const id = await novaProva();
  await salvar(id, { answers: { 0: [1] }, vers: { 0: 5 }, flags: [2], fv: 3 });
  await stopServer();
  await startServer();
  const v = await ver(id);
  assert.equal(v.vers['0'], 5);
  assert.equal(v.vers.flags, 3);
  const velho = (await salvar(id, { answers: { 0: [0] }, vers: { 0: 4 }, flags: [9], fv: 2 })).json;
  assert.deepEqual(velho.ignored, [0], 'depois do reinício a escrita antiga continua recusada');
  assert.equal(velho.flagsIgnored, true);
  assert.deepEqual((await ver(id)).answers[0], [1]);
});

test('exportar e importar levam as revisões; backup antigo (sem a coluna) é lido com valor padrão', async () => {
  const id = await novaProva();
  await salvar(id, { answers: { 0: [0] }, vers: { 0: 4 } });
  await finalizar(id, { answers: { 0: [0] }, vers: { 0: 4 } });
  const exp = (await call('/api/export')).json;
  const linha = exp.exams.find((e) => e.id === id);
  assert.ok(linha, 'prova finalizada está no backup');
  assert.equal(JSON.parse(linha.vers)['0'], 4, 'a revisão é exportada junto com a prova');
  assert.equal((await call('/api/import', 'POST', exp)).status, 200, 'ida e volta');
  // backup antigo: linhas sem `vers`
  const antigo = JSON.parse(JSON.stringify(exp));
  for (const e of antigo.exams) delete e.vers;
  assert.equal((await call('/api/import', 'POST', antigo)).status, 200, 'backup sem revisões continua importável');
  const db = new DatabaseSync(DB);
  assert.equal(db.prepare('SELECT vers FROM exams WHERE id = ?').get(id).vers, '{}');
  db.close();
  // valor inválido na coluna nova é recusado
  const ruim = JSON.parse(JSON.stringify(exp)); ruim.exams[0].vers = '[1]';
  assert.equal((await call('/api/import', 'POST', ruim)).status, 400);
});

test('o servidor simulado dos testes do front-end segue o mesmo contrato do servidor real', async () => {
  const fake = new Servidor(); fake.addExam({ id: 'x', n: 3 });
  const id = await novaProva({ n: 3 });
  const passos = [
    ['PUT', 'answers', { answers: { 0: [0] }, vers: { 0: 1 }, flags: [1], fv: 1 }],
    ['PUT', 'answers', { answers: { 0: [1] }, vers: { 0: 1 }, flags: [2], fv: 1 }], // conflito
    ['PUT', 'answers', { answers: { 0: [1] }, vers: { 0: 0 } }], // antiga
    ['PUT', 'answers', { answers: { 0: null, 1: 'x' }, vers: { 0: 2, 1: 1 } }],
    ['PUT', 'answers', { answers: { 1: 'x' }, vers: { 1: 1 }, flags: [1], fv: 1 }], // idempotente
    ['POST', 'finish', { answers: { 0: [2], 1: 'x', 2: null }, vers: { 0: 2, 1: 1, 2: 0 }, flags: [1], fv: 1 }], // 409: Q0 igual a 2 com valor novo
    ['POST', 'finish', { answers: { 0: null, 1: 'x', 2: null }, vers: { 0: 2, 1: 1, 2: 0 }, flags: [1], fv: 1 }],
  ];
  const forma = (r) => ({ status: r.status, ...Object.fromEntries(['ignored', 'conflicts', 'flagsIgnored', 'vers', 'current'].filter((k) => k in (r.json ?? {})).map((k) => [k, r.json[k]])) });
  for (const [metodo, acao, corpo] of passos) {
    const real = await call(`/api/exams/${id}/${acao}`, metodo, corpo);
    const r = await fake.fetch(`/api/exams/x/${acao}`, { method: metodo, body: JSON.stringify(corpo) });
    const simulado = { status: r.status, json: await r.json() };
    if (metodo === 'POST' && real.status === 200) { assert.equal(simulado.status, 200); assert.equal(real.json.status, 'finalizado'); continue; }
    assert.deepEqual(forma(simulado), forma(real), `${metodo} ${acao} ${JSON.stringify(corpo)}`);
  }
});

test('migração: banco criado antes da coluna `vers` ganha o valor padrão sem perder provas', () => {
  const p = join(dir, 'antigo.db');
  const d1 = openDb(p);
  d1.prepare("INSERT INTO exams(id, created, mode, questions) VALUES('e1', 1, 'topico', '[]')").run();
  d1.exec('ALTER TABLE exams DROP COLUMN vers; PRAGMA user_version = 1');
  d1.close();
  const d2 = openDb(p); // reabre: aplica a migração nova
  assert.equal(d2.prepare('SELECT vers FROM exams WHERE id = ?').get('e1').vers, '{}');
  assert.equal(d2.prepare('PRAGMA user_version').get().user_version, 2);
  d2.close();
});
