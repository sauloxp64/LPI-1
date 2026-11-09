// A-06: encerramento gracioso. Parte 1: a rotina isolada (roda em qualquer sistema). Parte 2: SIGTERM de verdade no servidor
// (só em Linux/macOS: no Windows process.kill('SIGTERM') mata o processo sem chamar o handler).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createShutdown } from '../src/shutdown.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

/** Servidor + rotina de encerramento com banco/saída falsos que registram a ordem dos eventos. */
async function montar({ drainMs = 5000 } = {}) {
  const events = []; const tunnels = new Set();
  let shutdown;
  const srv = http.createServer(async (req, res) => {
    if (shutdown.closing()) res.setHeader('connection', 'close');
    try {
      for await (const c of req) void c; // consome o corpo (a gravação só acontece depois dele)
    } catch { return; } // cliente desconectado no meio: nada a gravar (o server.mjs também captura isto)
    events.push('gravou');
    res.end('ok');
  });
  srv.on('upgrade', (req, socket) => {
    tunnels.add(socket); socket.on('close', () => tunnels.delete(socket));
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  });
  const port = await listen(srv);
  shutdown = createShutdown({ server: srv, tunnels, drainMs, closeDb: () => events.push('banco fechado'), exit: (c) => events.push(`saiu ${c}`), log: () => {} });
  return { srv, port, events, tunnels, shutdown };
}

/** PUT cujos cabeçalhos chegam já e o corpo só quando `fim()` é chamado. */
function putAtrasado(port) {
  const req = http.request({ host: '127.0.0.1', port, method: 'PUT', path: '/', agent: false, headers: { 'content-type': 'application/json', 'content-length': 5 } });
  const resposta = new Promise((resolve) => {
    req.on('response', (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b, conexao: res.headers.connection })); });
    req.on('error', (erro) => resolve({ erro: erro.code ?? String(erro) }));
  });
  req.flushHeaders();
  return { resposta, fim: () => req.end('12345') };
}

test('espera a requisição em andamento (corpo atrasado) e só então fecha o banco e sai', async () => {
  const { port, events, shutdown } = await montar();
  const put = putAtrasado(port);
  await sleep(150); // cabeçalhos já no servidor, corpo ainda não
  const fechando = shutdown('SIGTERM');
  await sleep(300);
  assert.deepEqual(events, [], 'enquanto o corpo não chega, nada é gravado, o banco segue aberto e o processo não sai');
  await assert.rejects(fetch(`http://127.0.0.1:${port}/`), 'novas conexões não são mais aceitas');
  put.fim();
  const r = await put.resposta;
  assert.equal(r.status, 200);
  assert.equal(r.body, 'ok');
  assert.equal(r.conexao, 'close', 'a conexão não é reaproveitada');
  await fechando;
  assert.deepEqual(events, ['gravou', 'banco fechado', 'saiu 0']);
});

test('é idempotente: dois sinais seguidos fecham o banco e saem uma vez só', async () => {
  const { events, shutdown } = await montar();
  const a = shutdown('SIGTERM'); const b = shutdown('SIGINT');
  assert.equal(a, b);
  await a;
  await shutdown('SIGTERM');
  assert.deepEqual(events, ['banco fechado', 'saiu 0']);
});

test('túneis WebSocket abertos são derrubados na hora e não seguram o encerramento', async () => {
  const { port, events, tunnels, shutdown } = await montar({ drainMs: 30_000 });
  const cliente = net.connect(port, '127.0.0.1');
  cliente.write('GET /terminal/ws HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  await new Promise((r) => cliente.once('data', r));
  assert.equal(tunnels.size, 1);
  const fechou = new Promise((r) => cliente.once('close', r));
  const t0 = Date.now();
  await shutdown('SIGTERM');
  await fechou;
  assert.ok(Date.now() - t0 < 3000, `terminou em ${Date.now() - t0} ms (o prazo era de 30 s)`);
  assert.equal(tunnels.size, 0);
  assert.deepEqual(events, ['banco fechado', 'saiu 0']);
});

test('conexão keep-alive ociosa não atrasa o encerramento', async () => {
  const { port, shutdown } = await montar({ drainMs: 30_000 });
  const agent = new http.Agent({ keepAlive: true });
  await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'PUT', path: '/', agent, headers: { 'content-length': 0 } }, (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', reject); req.end();
  });
  const t0 = Date.now();
  await shutdown('SIGTERM');
  agent.destroy();
  assert.ok(Date.now() - t0 < 3000, `terminou em ${Date.now() - t0} ms`);
});

test('prazo: requisição que nunca termina não segura o encerramento além de drainMs', async () => {
  const { port, events, shutdown } = await montar({ drainMs: 400 });
  const put = putAtrasado(port); // o corpo nunca vem
  await sleep(100);
  const t0 = Date.now();
  await shutdown('SIGTERM');
  const dt = Date.now() - t0;
  assert.ok(dt >= 350 && dt < 3000, `terminou em ${dt} ms`);
  assert.ok((await put.resposta).erro, 'o cliente pendurado é desconectado');
  assert.deepEqual(events, ['banco fechado', 'saiu 0']);
});

// ---------- SIGTERM de verdade ----------
const HERE = dirname(fileURLToPath(import.meta.url));
const naoLinux = process.platform === 'win32' ? 'SIGTERM real só existe fora do Windows (rode em Linux/Docker)' : false;
const sobe = async (env) => {
  const dir = mkdtempSync(join(tmpdir(), 'lpic-sig-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(HERE, '../src/server.mjs')], {
    env: { ...process.env, PORT: String(port), DB_PATH: join(dir, 't.db'), LAB_URL: 'http://127.0.0.1:1', LAB_TERMINAL_URL: 'http://127.0.0.1:1', MATERIALS_DIR: join(HERE, '../..'), CHALLENGES_DIR: join(HERE, '../../lab/challenges'), ...env },
    stdio: 'ignore',
  });
  const saiu = new Promise((r) => proc.once('exit', (code, signal) => r({ code, signal })));
  let pronto = false;
  for (let i = 0; i < 80 && !pronto; i++) { try { pronto = (await fetch(`http://127.0.0.1:${port}/api/stats`)).ok; } catch { await sleep(250); } }
  assert.ok(pronto, 'servidor não subiu');
  return { proc, port, dir, saiu, limpar: () => { proc.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }); } };
};
const comTimeout = (p, ms, msg) => Promise.race([p, sleep(ms).then(() => { throw new Error(msg); })]);

test('SIGTERM com PUT de respostas em andamento: a resposta é gravada, o processo sai com 0 e o dado persiste', { skip: naoLinux }, async () => {
  const s = await sobe({});
  try {
    const { id } = await (await fetch(`http://127.0.0.1:${s.port}/api/exams`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'topico', objetivos: ['103.4'], n: 5, minutes: 0 }) })).json();
    const corpo = JSON.stringify({ answers: { 0: [1] } });
    const req = http.request({ host: '127.0.0.1', port: s.port, method: 'PUT', path: `/api/exams/${id}/answers`, agent: false, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(corpo) } });
    const resposta = new Promise((resolve) => {
      req.on('response', (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(b) })); });
      req.on('error', (erro) => resolve({ erro: erro.code ?? String(erro) }));
    });
    req.flushHeaders();
    await sleep(200);
    s.proc.kill('SIGTERM');
    await sleep(500);
    assert.equal(s.proc.exitCode, null, 'o processo não pode sair antes de concluir a requisição');
    await assert.rejects(fetch(`http://127.0.0.1:${s.port}/api/stats`), 'não aceita novas conexões durante o encerramento');
    req.end(corpo);
    const r = await comTimeout(resposta, 5000, 'sem resposta');
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.json.ok, true);
    assert.deepEqual(await comTimeout(s.saiu, 10_000, 'não saiu'), { code: 0, signal: null });
    const db = new DatabaseSync(join(s.dir, 't.db'));
    try { assert.deepEqual(JSON.parse(db.prepare('SELECT answers FROM exams WHERE id = ?').get(id).answers), { 0: [1] }); } finally { db.close(); }
  } finally { s.limpar(); }
});

test('SIGTERM com terminal (WebSocket) aberto: encerra bem antes do prazo de 45 s', { skip: naoLinux }, async () => {
  const ttyd = http.createServer();
  ttyd.on('upgrade', (req, socket) => socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));
  const ttydPort = await listen(ttyd);
  const s = await sobe({ LAB_TERMINAL_URL: `http://127.0.0.1:${ttydPort}` });
  try {
    const cliente = net.connect(s.port, '127.0.0.1');
    cliente.write(`GET /terminal/ws HTTP/1.1\r\nHost: 127.0.0.1:${s.port}\r\nOrigin: http://127.0.0.1:${s.port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
    const dados = await comTimeout(new Promise((r) => cliente.once('data', (d) => r(String(d)))), 5000, 'túnel não abriu');
    assert.match(dados, /101/);
    const t0 = Date.now();
    s.proc.kill('SIGTERM');
    assert.deepEqual(await comTimeout(s.saiu, 10_000, 'não saiu com o terminal aberto'), { code: 0, signal: null });
    assert.ok(Date.now() - t0 < 10_000);
    await comTimeout(new Promise((r) => (cliente.destroyed ? r() : cliente.once('close', r))), 3000, 'o socket do cliente não foi fechado');
  } finally { s.limpar(); ttyd.close(); }
});

test('SIGTERM com requisição que nunca termina: sai no prazo (SHUTDOWN_DRAIN_MS) em vez de pendurar', { skip: naoLinux }, async () => {
  const s = await sobe({ SHUTDOWN_DRAIN_MS: '800' });
  try {
    const req = http.request({ host: '127.0.0.1', port: s.port, method: 'PUT', path: '/api/progress', agent: false, headers: { 'content-type': 'application/json', 'content-length': 50 } });
    req.on('error', () => {});
    req.flushHeaders();
    await sleep(200);
    const t0 = Date.now();
    s.proc.kill('SIGTERM');
    assert.deepEqual(await comTimeout(s.saiu, 10_000, 'não saiu no prazo'), { code: 0, signal: null });
    const dt = Date.now() - t0;
    assert.ok(dt >= 700 && dt < 8000, `saiu em ${dt} ms`);
  } finally { s.limpar(); }
});
