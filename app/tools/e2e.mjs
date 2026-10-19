#!/usr/bin/env node
// Teste ponta a ponta no Chrome headless (DevTools Protocol, sem dependências).
// Percorre todas as telas, responde questões, finaliza provas e falha se houver erro de JS/console.
//   node tools/e2e.mjs [--base=http://localhost:18088] [--shots=pasta] [--chrome=caminho]
// ATENÇÃO: grava dados de teste (provas, progresso) — rode contra um servidor com banco descartável, não o seu de estudo.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? '').split('=').slice(1).join('=') || d;
const BASE = arg('base', 'http://localhost:18088');
const SHOTS = arg('shots', '');
const CANDIDATES = [arg('chrome', ''), process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const CHROME = CANDIDATES.find((p) => existsSync(p));
if (!CHROME) { console.log('Chrome/Edge não encontrado (use --chrome=...) — E2E pulado'); process.exit(0); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const PORT = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'lpic-e2e-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu',
  '--hide-scrollbars', '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* ainda subindo */ }
    await sleep(250);
  }
  throw new Error('não consegui conectar ao Chrome');
}

const ws = new WebSocket(await connect());
await new Promise((r) => { ws.onopen = r; });
let seq = 0; const pending = new Map(); const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(`exceção: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon|Failed to load resource.*(404|net::ERR)/i.test(m.params.entry.text + (m.params.entry.url ?? ''))) errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`avaliação falhou: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}\n${expr.slice(0, 160)}`);
  return r.result.value;
};
const waitFor = async (expr, what, ms = 12000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return; } catch { /* ainda carregando */ } await sleep(150); }
  const snap = await evalJs(`(document.querySelector('#view')?.innerText ?? '').slice(0, 240)`).catch(() => '');
  throw new Error(`timeout esperando: ${what} [${expr}] — tela: ${JSON.stringify(snap)}`);
};
const goto = async (hash) => { await evalJs(`location.hash = ${JSON.stringify(hash)}; 0`); await sleep(120); };
const shot = async (name) => {
  if (!SHOTS) return;
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
};
const post = (p, body = {}) => evalJs(`fetch(${JSON.stringify(p)}, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${JSON.stringify(body)})}).then(r=>r.json())`);

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Page.navigate', { url: `${BASE}/#/` });
let step = 0; const ok = (m) => console.log(`✓ ${++step}. ${m}`);

try {
  await waitFor(`!!document.querySelector('.hero')`, 'dashboard');
  await post('/api/reset', { confirm: 'APAGAR' }); // começa sempre de um banco limpo
  await evalJs('location.reload(); 0'); await sleep(500);
  await waitFor(`!!document.querySelector('.hero')`, 'dashboard (após reset)');
  ok('dashboard renderiza'); await shot('01-dashboard');

  await goto('#/curso'); await waitFor(`!!document.querySelector('[data-set]')`, 'curso');
  await evalJs(`document.querySelector('[data-set="103.4"][data-v="estudando"]').click(); 0`);
  await waitFor(`document.querySelector('[data-set="103.4"][data-v="estudando"]').classList.contains('on')`, 'status marcado');
  await evalJs(`document.querySelector('[data-lesson="103.5:0"]').click(); 0`);
  await waitFor(`document.querySelector('[data-lesson="103.5:0"]').checked`, 'aula marcada');
  ok('curso: status e aulas persistem'); await shot('02-curso');

  await goto('#/novo'); await waitFor(`!!document.querySelector('[data-start="fracos"]')`, 'novo');
  ok('simulados: lista de modos'); await shot('03-novo');

  // treino com correção imediata
  await goto('#/novo?modo=treino&obj=103.4');
  await waitFor(`!!document.querySelector('.qcard')`, 'treino iniciou');
  await waitFor(`!!document.querySelector('[data-check]')`, 'botão corrigir');
  await evalJs(`(document.querySelector('[data-opt]') ?? {click(){}}).click(); const l=document.querySelector('#lac'); if(l){ l.value='x'; l.dispatchEvent(new Event('input',{bubbles:true})); } 0`);
  await evalJs(`document.querySelector('[data-check]').click(); 0`);
  await waitFor(`!!document.querySelector('.feedback')`, 'feedback do treino');
  ok('treino: corrige e mostra explicação'); await shot('04-treino');
  await evalJs(`document.querySelector('[data-next]').click(); 0`);
  await waitFor(`document.querySelector('.qcard b')?.textContent.includes('Questão 2')`, 'próxima questão');

  // simulado oficial completo: responde tudo e finaliza
  const { id } = await post('/api/exams', { mode: 'oficial', exame: '102' });
  await goto(`#/prova/${id}`); await waitFor(`!!document.querySelector('.qcard') && !!document.querySelector('#timer')`, 'prova oficial');
  const n = await evalJs(`document.querySelectorAll('#nav button').length`);
  for (let i = 0; i < n; i++) {
    await evalJs(`(()=>{ const o=document.querySelector('[data-opt]'); if(o) o.click(); const l=document.querySelector('#lac'); if(l){ l.value='ls'; l.dispatchEvent(new Event('input',{bubbles:true})); } if (${i} % 7 === 3) document.querySelector('[data-flag]').click(); return 0; })()`);
    if (i < n - 1) await evalJs(`document.querySelector('[data-next]').click(); 0`);
  }
  await shot('05-prova');
  await evalJs(`document.querySelector('#finish').click(); 0`);
  await waitFor(`!!document.querySelector('dialog[open]')`, 'diálogo de confirmação');
  await evalJs(`document.querySelector('dialog button[value=yes]').click(); 0`);
  await waitFor(`!!document.querySelector('.verdict')`, 'resultado');
  ok(`prova oficial 102: ${n} questões respondidas e finalizadas`); await shot('06-resultado');
  await evalJs(`document.querySelector('[data-f="erradas"]').click(); 0`);
  await waitFor(`location.hash.includes('f=erradas')`, 'filtro de revisão');
  await waitFor(`!!document.querySelector('.rv')`, 'cartões de revisão');
  await evalJs(`document.querySelector('[data-contest]')?.click(); 0`);
  await sleep(300);
  await evalJs(`document.querySelector('dialog button[value=yes]')?.click(); 0`);
  ok('resultado: revisão por filtro e contestação');

  await goto('#/objetivo/103.4'); await waitFor(`!!document.querySelector('[data-train]')`, 'objetivo'); ok('página do objetivo'); await shot('07-objetivo');
  await goto('#/material?obj=103.4'); await waitFor(`!!document.querySelector('#frame iframe')`, 'material');
  await evalJs(`const q=document.querySelector('#q'); q.value='umask'; q.dispatchEvent(new Event('input',{bubbles:true})); 0`);
  await waitFor(`document.querySelectorAll('#results .result-item').length > 0`, 'busca no PDF', 15000);
  ok('material: PDF embutido e busca em texto completo'); await shot('08-material');
  // alternar entre os índices dos dois exames (regressão: o índice sumia ao trocar)
  await goto('#/material?obj=103.4'); await waitFor(`!!document.querySelector('[data-ex="102"]')`, 'abas de exame');
  await evalJs(`document.querySelector('[data-ex="102"]').click(); 0`);
  await waitFor(`document.querySelector('#tree').textContent.includes('Shells e scripts')`, 'índice do exame 102');
  await evalJs(`document.querySelector('[data-ex="101"]').click(); 0`);
  await waitFor(`document.querySelector('#tree').textContent.includes('Arquitetura de Sistema')`, 'índice do exame 101');
  ok('material: alternar índice 101 ↔ 102');
  // XSS por parâmetro de URL (regressão)
  await goto('#/material?exame=%3Cimg%20src%3Dx%20onerror%3Dwindow.__xss%3D1%3E&p=2'); await sleep(900);
  if (await evalJs(`!!window.__xss || !!document.querySelector('#view img[onerror]')`)) errors.push('XSS via parâmetro "exame" em #/material');
  else ok('material: parâmetros de URL não injetam HTML');
  // PDFs complementares (qualquer .pdf extra na raiz do projeto), se houver
  await goto('#/material?obj=103.4'); await waitFor(`!!document.querySelector('[data-ex]')`, 'abas do material');
  if (await evalJs(`!!document.querySelector('[data-ex^="x"]')`)) {
    await evalJs(`document.querySelector('[data-ex^="x"]').click(); 0`);
    await waitFor(`document.querySelector('#frame iframe')?.getAttribute('src')?.startsWith('/pdf/x1')`, 'complemento aberto no visualizador');
    await evalJs(`const f=document.querySelector('[data-goto] input'); f.value='12'; document.querySelector('[data-goto]').requestSubmit(); 0`);
    await waitFor(`document.querySelector('#frame iframe')?.getAttribute('src')?.includes('#page=12')`, 'ir para a página 12');
    ok('material: complemento abre e navega por página');
  }
  await goto('#/lab'); await waitFor(`!!document.querySelector('.page-title')`, 'lab'); await sleep(500); ok('laboratório: lista'); await shot('09-lab');
  await goto('#/config'); await waitFor(`!!document.querySelector('#reload')`, 'config'); ok('configurações'); await shot('10-config');
  await goto('#/'); await waitFor(`document.querySelector('.hero') && document.body.textContent.includes('Últimos simulados')`, 'dashboard com dados');
  await waitFor(`document.querySelectorAll('.result-item').length > 0`, 'histórico no dashboard');
  ok('dashboard reflete o histórico'); await shot('11-dashboard-dados');

  // responsivo (celular)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await goto('#/'); await sleep(600); await shot('12-mobile-dashboard');
  await goto(`#/prova/${(await post('/api/exams', { mode: 'treino', objetivos: ['103.1'], n: 5 })).id}`); await waitFor(`!!document.querySelector('.qcard')`, 'prova mobile'); await shot('13-mobile-prova');
  const overflow = await evalJs(`document.documentElement.scrollWidth > window.innerWidth + 2`);
  if (overflow) errors.push('layout mobile com rolagem horizontal');
  ok('layout mobile sem rolagem horizontal');
} catch (e) {
  errors.push(String(e.message));
}

ws.close(); chrome.kill();
if (errors.length) { console.log(`\n✗ ${errors.length} problema(s):`); [...new Set(errors)].forEach((e) => console.log('  - ' + e)); process.exit(1); }
console.log('\n✓ E2E completo sem erros de JavaScript');
process.exit(0);
