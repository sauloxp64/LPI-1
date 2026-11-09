// A-05: erro no stream de arquivo (PDF/estático) não pode derrubar o servidor. Testa o helper isolado, sem subir o server.mjs.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { Readable } from 'node:stream';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeFile } from '../src/pipefile.mjs';

const uncaught = [];
process.on('uncaughtException', (e) => uncaught.push(e));
const dir = mkdtempSync(join(tmpdir(), 'lpic-pipe-'));
after(() => { rmSync(dir, { recursive: true, force: true }); });
const FILE = join(dir, 'a.txt');
writeFileSync(FILE, 'abcdefghij');

/** Servidor com um handler que usa o helper como o server.mjs usa (cabeçalhos só quando o arquivo abriu). */
async function withServer(opts, fn) {
  const calls = { fail: [], open: [] };
  const srv = createServer((req, res) => {
    const range = req.headers['x-range'] ? { start: 2, end: 4 } : undefined;
    pipeFile(res, opts.file ?? FILE, {
      range,
      open: opts.open && ((f, r) => { calls.open.push([f, r]); return opts.open(f, r); }),
      head: () => res.writeHead(range ? 206 : 200, { 'content-type': 'text/plain' }),
      fail: (err) => { calls.fail.push(err); res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"erro":"x"}'); },
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try { return await fn(srv.address().port, calls); } finally { srv.closeAllConnections(); srv.close(); }
}

/** GET que resolve com {status, body} ou {erro} se a conexão cair antes de terminar. */
const get = (port, headers = {}) => new Promise((resolve) => {
  const req = httpRequest({ host: '127.0.0.1', port, path: '/', headers, agent: false }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    res.on('error', (erro) => resolve({ status: res.statusCode, erro }));
    res.on('aborted', () => resolve({ status: res.statusCode, erro: 'aborted' }));
  });
  req.on('error', (erro) => resolve({ erro }));
  req.setTimeout(3000, () => { resolve({ erro: 'resposta pendurada' }); req.destroy(); }); // sem listener de erro o cliente ficaria esperando
  req.end();
});

/** Stream que falha com EACCES no próximo tick, sem nunca abrir (o caso do achado: statSync ok, abertura falha). */
const failsOnOpen = (holder) => () => {
  const rs = new Readable({ read() {} });
  holder.rs = rs;
  process.nextTick(() => rs.destroy(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })));
  return rs;
};
const noUncaught = () => assert.deepEqual(uncaught.map(String), [], 'nenhum erro sem tratamento');

test('arquivo existente: resposta integral e Range', async () => {
  await withServer({}, async (port) => {
    assert.deepEqual(await get(port), { status: 200, body: 'abcdefghij' });
    assert.deepEqual(await get(port, { 'x-range': '1' }), { status: 206, body: 'cde' });
  });
  noUncaught();
});

test('arquivo que some depois do statSync (ENOENT real): erro controlado e o servidor segue de pé', async () => {
  await withServer({ file: join(dir, 'nao-existe.pdf') }, async (port, calls) => {
    for (const h of [{}, { 'x-range': '1' }]) {
      const r = await get(port, h);
      assert.equal(r.status, 500, JSON.stringify(h));
      assert.match(r.body, /erro/);
    }
    assert.equal(calls.fail.length, 2);
    assert.equal(calls.fail[0].code, 'ENOENT');
  });
  noUncaught();
});

test('stream que emite EACCES no próximo tick: integral e Range encerram a resposta e liberam o stream', async () => {
  for (const h of [{}, { 'x-range': '1' }]) {
    const holder = {};
    await withServer({ open: failsOnOpen(holder) }, async (port, calls) => {
      const r = await get(port, h);
      assert.equal(r.status, 500, JSON.stringify(h));
      assert.equal(calls.fail.length, 1);
      assert.equal(calls.fail[0].code, 'EACCES');
      assert.equal(holder.rs.destroyed, true, 'stream liberado');
      assert.deepEqual(calls.open[0][1], h['x-range'] ? { start: 2, end: 4 } : undefined, 'o intervalo chega ao stream');
      assert.equal((await get(port)).status, 500, 'a próxima requisição também é atendida');
    });
  }
  noUncaught();
});

test('sem callback fail: o padrão é 500 vazio, nunca uma exceção', async () => {
  const srv = createServer((req, res) => pipeFile(res, join(dir, 'nao-existe.pdf')));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try { assert.deepEqual(await get(srv.address().port), { status: 500, body: '' }); } finally { srv.closeAllConnections(); srv.close(); }
  noUncaught();
});

test('erro depois de a resposta começar: a conexão é derrubada (sem travar o cliente) e o stream é liberado', async () => {
  const holder = {};
  const open = () => {
    const rs = new Readable({ read() {} });
    holder.rs = rs;
    process.nextTick(() => { rs.emit('open', 3); rs.push('parcial'); setTimeout(() => rs.destroy(new Error('EIO')), 20); });
    return rs;
  };
  await withServer({ open }, async (port, calls) => {
    const r = await get(port);
    assert.ok(r.erro, 'o cliente percebe a queda em vez de ficar pendurado');
    assert.equal(calls.fail.length, 0, 'depois dos cabeçalhos não dá para mudar o status');
    assert.equal(holder.rs.destroyed, true);
    assert.ok((await get(port)).erro, 'o servidor segue de pé: uma nova requisição é atendida (e cai do mesmo jeito)');
  });
  noUncaught();
});

test('cliente que desconecta no meio: o stream é destruído (o descritor do arquivo não vaza)', async () => {
  const holder = {};
  const open = () => {
    const rs = new Readable({ read() { this.push(Buffer.alloc(64 * 1024, 97)); } });
    holder.rs = rs;
    process.nextTick(() => rs.emit('open', 3));
    return rs;
  };
  await withServer({ open }, async (port) => {
    await new Promise((resolve) => {
      const req = httpRequest({ host: '127.0.0.1', port, path: '/', agent: false }, (res) => { res.once('data', () => { req.destroy(); resolve(); }); });
      req.on('error', () => {});
      req.end();
    });
    for (let i = 0; i < 40 && !holder.rs.destroyed; i++) await new Promise((r) => setTimeout(r, 25));
    assert.equal(holder.rs.destroyed, true);
  });
  noUncaught();
});
