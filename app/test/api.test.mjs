// Teste de integração: sobe o servidor de verdade (porta aleatória, banco temporário) e exercita a API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
let proc; let dir;

const call = async (path, method = 'GET', body) => {
  const r = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'lpic-api-'));
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(HERE, '../src/server.mjs')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: join(dir, 't.db'), LAB_URL: 'http://127.0.0.1:1', MATERIALS_DIR: join(HERE, '../..'), CHALLENGES_DIR: join(HERE, '../../lab/challenges') },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/stats`)).ok) return; } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('servidor não subiu');
});
after(() => { proc?.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } });

test('meta e estatísticas iniciais', async () => {
  const m = await call('/api/meta');
  assert.equal(m.status, 200);
  assert.equal(m.json.objetivos.length, 42);
  assert.equal(m.json.exames['101'].peso, 60);
  const s = await call('/api/stats');
  assert.equal(s.json.totais.respondidas, 0);
  assert.ok(s.json.prontidao.geral > 0 && s.json.prontidao.geral < 0.5);
});

test('progresso do curso e aulas', async () => {
  assert.equal((await call('/api/progress', 'PUT', { obj: '103.4', status: 'estudando' })).status, 200);
  assert.equal((await call('/api/progress', 'PUT', { obj: '999.9', status: 'estudando' })).status, 400);
  const r = await call('/api/lessons', 'PUT', { key: '103.6:0', done: true });
  assert.equal(r.json.status, 'estudando');
  await call('/api/lessons', 'PUT', { key: '103.6:1', done: true });
  assert.equal((await call('/api/progress')).json.status['103.6'], 'concluido');
});

test('prova não vaza gabarito enquanto em andamento; finalizar revela e corrige', async () => {
  const { json: { id } } = await call('/api/exams', 'POST', { mode: 'topico', objetivos: ['103.4'], n: 6 });
  const run = (await call(`/api/exams/${id}`)).json;
  assert.equal(run.status, 'andamento');
  const serial = JSON.stringify(run.questions);
  assert.ok(!/explanation|gabarito|"ok"/.test(serial), 'gabarito/explicação vazaram na prova em andamento');
  assert.equal((await call(`/api/exams/${id}/answers`, 'PUT', { answers: { 0: [0], 1: 'tee' } })).status, 200);
  const fin = (await call(`/api/exams/${id}/finish`, 'POST', {})).json;
  assert.equal(fin.status, 'finalizado');
  assert.ok(fin.questions[0].explanation && Array.isArray(fin.questions[0].gabarito));
  assert.equal((await call(`/api/exams/${id}/answers`, 'PUT', { answers: { 0: [1] } })).status, 409);
  const st = (await call('/api/stats')).json;
  assert.equal(st.totais.respondidas, 6);
});

test('treino: correção imediata uma vez por questão; erradas viram novo treino', async () => {
  const { json: { id } } = await call('/api/exams', 'POST', { mode: 'treino', objetivos: ['103.4'], n: 4 });
  const r = await call(`/api/exams/${id}/check`, 'POST', { i: 0, answer: [0] });
  assert.equal(r.status, 200);
  assert.ok('explanation' in r.json && 'ok' in r.json);
  const again = await call(`/api/exams/${id}/check`, 'POST', { i: 0, answer: [1] });
  assert.equal(again.json.ok, r.json.ok, 'segunda correção deve devolver o resultado já registrado');
});

test('modo "do que já vi" só usa objetivos liberados', async () => {
  const { json: { id } } = await call('/api/exams', 'POST', { mode: 'curso', n: 20 });
  const fin = (await call(`/api/exams/${id}/finish`, 'POST', {})).json;
  const objs = new Set(fin.questions.map((q) => q.obj));
  for (const o of objs) assert.ok(['103.4', '103.6'].includes(o), `objetivo ${o} não estava liberado`);
});

test('validações: modo inválido, corpo inválido, rota inexistente', async () => {
  assert.equal((await call('/api/exams', 'POST', { mode: 'xyz' })).status, 400);
  const bad = await fetch(`${BASE}/api/exams`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(bad.status, 400);
  // CSRF: formulário de outro site só consegue enviar text/plain — deve ser recusado
  const csrf = await fetch(`${BASE}/api/reset`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"confirm":"APAGAR"}' });
  assert.equal(csrf.status, 415);
  assert.equal((await call('/api/nada')).status, 404);
  assert.equal((await call('/api/exams/inexistente')).status, 404);
});

test('PDF (com ou sem os arquivos), exportar/importar e reset', async () => {
  const meta = (await call('/api/meta')).json;
  if (meta.pdf.disponiveis['101']) {
    // PDFs presentes: serve com Range e a busca em texto completo encontra conteúdo
    const h = await fetch(`${BASE}/pdf/101`, { headers: { range: 'bytes=0-9' } });
    assert.equal(h.status, 206);
    assert.equal(h.headers.get('content-type'), 'application/pdf');
    assert.equal((await h.arrayBuffer()).byteLength, 10);
    for (let i = 0; i < 40; i++) { // índice é montado em segundo plano
      if ((await call('/api/search?q=umask')).json.estado === 'pronto') break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const sr = (await call('/api/search?q=umask')).json;
    if (sr.estado === 'pronto') assert.ok(sr.resultados.length > 0);
  } else {
    // clone limpo (PDFs da LPI não são versionados): 404 limpo e o app segue funcionando
    assert.equal((await fetch(`${BASE}/pdf/101`)).status, 404);
    assert.equal((await call('/api/search?q=umask')).status, 200);
  }
  const exp = (await call('/api/export')).json;
  assert.equal(exp.versao, 1);
  assert.ok(exp.attempts.length >= 6);
  assert.equal((await call('/api/reset', 'POST', { confirm: 'nao' })).status, 400);
  assert.equal((await call('/api/reset', 'POST', { confirm: 'APAGAR' })).status, 200);
  assert.equal((await call('/api/stats')).json.totais.respondidas, 0);
  assert.equal((await call('/api/import', 'POST', exp)).status, 200);
  assert.ok((await call('/api/stats')).json.totais.respondidas >= 6);
});

test('estáticos: SPA e proteção contra path traversal', async () => {
  const idx = await fetch(`${BASE}/`);
  assert.equal(idx.status, 200);
  assert.match(await idx.text(), /LPIC-1/);
  const trav = await fetch(`${BASE}/..%2f..%2fpackage.json`);
  assert.notEqual((await trav.text()).includes('lpic1-estudos'), true);
});

// ---------- regressões apontadas na revisão do Codex ----------
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const raw = (path, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path, method, headers }, (res) => {
    let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d }));
  });
  req.on('error', reject); if (body) req.write(body); req.end();
});

test('DNS rebinding: Host desconhecido e Origin cruzada são recusados', async () => {
  assert.equal((await raw('/api/stats', { headers: { host: 'evil.example:8088' } })).status, 403);
  assert.equal((await raw('/api/stats', { headers: { host: `127.0.0.1:${PORT}` } })).status, 200);
  const body = JSON.stringify({ confirm: 'nao' });
  const evil = await raw('/api/reset', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body });
  assert.equal(evil.status, 403);
  const same = await raw('/api/reset', { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${PORT}` }, body });
  assert.equal(same.status, 400); // passou pelas barreiras; falha só por "confirm" errado
});

test('cronômetro desmarcado (minutes: 0) é respeitado', async () => {
  const { json: { id } } = await call('/api/exams', 'POST', { mode: 'topico', objetivos: ['103.4'], n: 5, minutes: 0 });
  const e = (await call(`/api/exams/${id}`)).json;
  assert.equal(e.minutes, 0);
  assert.equal(e.deadline, null);
});

test('salvamentos concorrentes não perdem respostas (corpo atrasado)', async () => {
  const { json: { id } } = await call('/api/exams', 'POST', { mode: 'topico', objetivos: ['103.4'], n: 8, minutes: 0 });
  const delayed = (i, ms) => new Promise((resolve, reject) => {
    const body = JSON.stringify({ answers: { [i]: [0] } });
    const req = http.request({ host: '127.0.0.1', port: PORT, path: `/api/exams/${id}/answers`, method: 'PUT', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.flushHeaders();
    setTimeout(() => { req.write(body); req.end(); }, ms);
  });
  // A manda os cabeçalhos primeiro mas o corpo só depois; B e C chegam e terminam no meio
  const codes = await Promise.all([delayed(0, 250), delayed(1, 20), delayed(2, 120)]);
  assert.deepEqual(codes, [200, 200, 200]);
  const e = (await call(`/api/exams/${id}`)).json;
  assert.deepEqual(Object.keys(e.answers).sort(), ['0', '1', '2']);
});

test('exportação não vaza provas em andamento e retake exige prova finalizada', async () => {
  const { json: { id } } = await call('/api/exams', 'POST', { mode: 'topico', objetivos: ['103.5'], n: 5 });
  const exp = (await call('/api/export')).json;
  assert.ok(!exp.exams.some((x) => x.id === id), 'prova em andamento apareceu na exportação');
  assert.equal((await call(`/api/exams/${id}/retake`, 'POST', { same: true })).status, 400);
  assert.equal((await call(`/api/exams/${id}/retake`, 'POST', { same: false })).status, 400);
});

test('finalizar depois do prazo ignora respostas novas', async () => {
  const { json: { id } } = await call('/api/exams', 'POST', { mode: 'topico', objetivos: ['103.4'], n: 5, minutes: 5 });
  const db = new DatabaseSync(join(dir, 't.db'));
  db.prepare('UPDATE exams SET deadline = ? WHERE id = ?').run(Date.now() - 3600e3, id);
  db.close();
  const fin = (await call(`/api/exams/${id}/finish`, 'POST', { answers: { 0: [0], 1: [0], 2: [0] } })).json;
  assert.equal(fin.status, 'finalizado');
  assert.equal(fin.result.respondidas, 0, 'respostas enviadas após o prazo foram aceitas');
});

test('importação inválida ou incompleta é recusada sem apagar o progresso', async () => {
  const antes = (await call('/api/stats')).json.totais.respondidas;
  assert.ok(antes > 0);
  assert.equal((await call('/api/import', 'POST', { versao: 1 })).status, 400);
  assert.equal((await call('/api/import', 'POST', { versao: 1, progress: [{ obj: '103.4', status: 'estudando', hack: 1 }], lessons: [], exams: [], attempts: [], qstats: [], reports: [], lab_runs: [], settings: [] })).status, 400);
  assert.equal((await call('/api/stats')).json.totais.respondidas, antes);
});

test('configurações: data dos exames', async () => {
  assert.equal((await call('/api/settings', 'PUT', { data_101: '2026-12-10' })).status, 200);
  assert.equal((await call('/api/settings')).json.data_101, '2026-12-10');
  assert.equal((await call('/api/settings', 'PUT', { data_101: 'amanhã' })).status, 400);
  assert.equal((await call('/api/settings', 'PUT', { data_101: null })).status, 200);
});

// ---------- regressões da segunda revisão do Codex ----------
import net from 'node:net';

const rawSocket = (payload, ms = 2500) => new Promise((resolve) => {
  const s = net.connect(PORT, '127.0.0.1', () => s.write(payload));
  let d = ''; const t = setTimeout(() => { s.destroy(); resolve(d); }, ms);
  s.on('data', (c) => { d += c; if (d.includes('\r\n\r\n')) { clearTimeout(t); s.destroy(); resolve(d); } });
  s.on('error', () => { clearTimeout(t); resolve(d || 'erro'); });
  s.on('close', () => { clearTimeout(t); resolve(d); });
});
const statusLine = (r) => r.split('\r\n')[0];

test('URL malformada não derruba o servidor (GET //%) e devolve 400', async () => {
  const r = await rawSocket(`GET //% HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`);
  assert.match(statusLine(r), /400/);
  const r2 = await rawSocket(`GET //evil.example/x HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`);
  assert.match(statusLine(r2), /400/);
  assert.equal((await call('/api/stats')).status, 200, 'o servidor tem de continuar de pé');
});

test('Host duplicado e Origin fora do padrão são recusados', async () => {
  const dupHost = await rawSocket(`GET /api/stats HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nHost: evil.example\r\nConnection: close\r\n\r\n`);
  assert.match(statusLine(dupHost), /40[03]/);
  for (const origin of [`ftp://127.0.0.1:${PORT}`, `http://127.0.0.1:${PORT}/`, `http://user@127.0.0.1:${PORT}`, 'null']) {
    const r = await rawSocket(`POST /api/reset HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nOrigin: ${origin}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}`);
    assert.match(statusLine(r), /403/, `Origin ${origin} deveria ser recusada`);
  }
});

test('terminal: sem laboratório responde 502 e handshake WebSocket inválido é recusado (sem derrubar o servidor)', async () => {
  const r = await rawSocket(`GET /terminal/ HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`, 6000);
  assert.match(statusLine(r), /502/);
  const hs = (extra) => `GET /terminal/ws HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nOrigin: http://127.0.0.1:${PORT}\r\nConnection: Upgrade\r\n${extra}\r\n`;
  // protocolo arbitrário
  assert.match(statusLine(await rawSocket(hs('Upgrade: foo\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n'))), /400/);
  // sem chave
  assert.match(statusLine(await rawSocket(hs('Upgrade: websocket\r\nSec-WebSocket-Version: 13\r\n'))), /400/);
  // Origin de outro site
  assert.match(statusLine(await rawSocket(hs('Upgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n').replace(`Origin: http://127.0.0.1:${PORT}`, 'Origin: http://evil.example'))), /403/);
  // dados "pegando carona" no handshake (head não vazio)
  const smuggle = hs('Upgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n') + `GET /api/export HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\n\r\n`;
  assert.match(statusLine(await rawSocket(smuggle)), /400/);
  assert.equal((await call('/api/stats')).status, 200);
});

test('importação: números fora do intervalo e JSON de tipo errado são recusados sem tocar no banco', async () => {
  const antes = (await call('/api/export')).json;
  const base = () => ({ versao: 1, progress: [], lessons: [], exams: [], attempts: [], qstats: [], reports: [], lab_runs: [], settings: [] });
  const ruim1 = base(); ruim1.attempts = [{ exam_id: 'x', idx: 0, qid: 'q', obj: '103.4', correct: 1, ts: 9007199254740992 }];
  assert.equal((await call('/api/import', 'POST', ruim1)).status, 400);
  const ruim2 = base(); ruim2.exams = [{ id: 'e1', created: 1, mode: 'topico', status: 'finalizado', questions: '{}' }];
  assert.equal((await call('/api/import', 'POST', ruim2)).status, 400);
  const ruim3 = base(); ruim3.lab_runs = [{ id: 'r1', challenge: 'c', params: '{oops', started: 1 }];
  assert.equal((await call('/api/import', 'POST', ruim3)).status, 400);
  const ruim4 = base(); ruim4.progress = [{ obj: '103.4' }];
  assert.equal((await call('/api/import', 'POST', ruim4)).status, 400);
  const depois = (await call('/api/export')).json;
  assert.equal(depois.attempts.length, antes.attempts.length);
  // e o arquivo exportado pelo próprio app continua importável (ida e volta)
  assert.equal((await call('/api/import', 'POST', antes)).status, 200);
  assert.equal((await call('/api/export')).json.attempts.length, antes.attempts.length);
});

test('salvamento fora de ordem: versão antiga não sobrescreve a mais nova', async () => {
  const { json: { id } } = await call('/api/exams', 'POST', { mode: 'topico', objetivos: ['103.4'], n: 5, minutes: 0 });
  await call(`/api/exams/${id}/answers`, 'PUT', { answers: { 0: [1] }, vers: { 0: 5 } });
  await call(`/api/exams/${id}/answers`, 'PUT', { answers: { 0: [0] }, vers: { 0: 3 } }); // atrasado
  assert.deepEqual((await call(`/api/exams/${id}`)).json.answers[0], [1]);
});

test('finalizar com estado completo: null apaga a resposta e as marcações são gravadas', async () => {
  const { json: { id } } = await call('/api/exams', 'POST', { mode: 'topico', objetivos: ['103.4'], n: 5, minutes: 0 });
  await call(`/api/exams/${id}/answers`, 'PUT', { answers: { 0: [0], 1: [0] } });
  const fin = (await call(`/api/exams/${id}/finish`, 'POST', { answers: { 0: null, 1: [0], 2: null }, flags: [1] })).json;
  assert.equal(fin.result.respondidas, 1, 'a resposta apagada (null) não pode continuar valendo');
  assert.deepEqual(fin.flags, [1]);
});
