// Front-end (D-05, D-07, D-08, D-10): as telas reais de public/js/views rodam em memória, com DOM,
// fetch, location e sessionStorage simulados — sem navegador, sem servidor, sem rede.
import { describe, test, mock, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ---------- ambiente simulado ----------
class El {
  constructor(over = {}) {
    this.dataset = {}; this.disabled = false; this.value = ''; this.checked = false; this.innerHTML = ''; this.listeners = {};
    this.cls = new Set();
    Object.assign(this, over);
    this.classList = {
      add: (c) => this.cls.add(c), remove: (c) => this.cls.delete(c), contains: (c) => this.cls.has(c),
      toggle: (c, f) => ((f ?? !this.cls.has(c)) ? this.cls.add(c) : this.cls.delete(c)),
    };
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener(t, f) { (this.listeners[t] ??= []).push(f); }
  append() {} remove() {} focus() {}
  showModal() { this.returnValue = 'yes'; queueMicrotask(() => (this.listeners.close ?? []).forEach((f) => f())); } // confirmDialog: sempre "sim"
}
/** Raiz de uma tela: `sel` mapeia seletor -> elemento (ou lista) que a tela vai pedir. */
function makeRoot(sel = {}) {
  const root = new El();
  root.querySelector = (s) => (Array.isArray(sel[s]) ? sel[s][0] : sel[s]) ?? null;
  root.querySelectorAll = (s) => [].concat(sel[s] ?? (s.startsWith('button') ? sel.button ?? [] : [])); // 'button...' sem entrada própria usa sel.button
  return root;
}
/** Dispara o clique que a tela registrou em `root.onclick`, como se `btn` fosse o botão clicado. */
const click = (root, btn) => root.onclick({ target: { closest: () => btn }, preventDefault() {} });
const btn = (dataset) => new El({ dataset });
const flush = () => new Promise((r) => setImmediate(r)); // deixa as promessas pendentes andarem

function defer() {
  const d = {};
  d.promise = new Promise((res, rej) => { d.resolve = res; d.reject = rej; });
  return d;
}
const reply = (status, data) => ({ __reply: true, status, data });

const store = new Map();
const sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
const defineGlobal = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
const loc = { hash: '', replaced: [], replace(u) { this.replaced.push(u); this.hash = u; } };

let calls = []; // { method, path, body }
let handlers = {}; // 'METHOD /caminho' -> (body) => dados | reply() | Promise
const fakeFetch = async (path, { method = 'GET', body } = {}) => {
  const b = body === undefined ? undefined : JSON.parse(body);
  calls.push({ method, path, body: b });
  const h = handlers[`${method} ${path}`];
  assert.ok(h, `requisição sem handler no teste: ${method} ${path}`);
  let r = await h(b);
  if (!r?.__reply) r = reply(200, r);
  return { ok: r.status < 400, status: r.status, json: async () => r.data };
};
const posts = (path) => calls.filter((c) => c.method === 'POST' && c.path === path);

// Os globais simulados valem só enquanto estes testes rodam (com --test-isolation=none o processo é compartilhado).
const GLOBAIS = ['sessionStorage', 'document', 'history', 'prompt', 'location', 'fetch'];
const guardados = new Map();
function instalar() {
  for (const k of GLOBAIS) guardados.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
  defineGlobal('sessionStorage', sessionStorage);
  defineGlobal('document', { createElement: (tag) => new El({ tag }), body: new El() });
  defineGlobal('history', { replaceState() {} });
  defineGlobal('prompt', () => 'APAGAR');
  defineGlobal('location', loc);
  defineGlobal('fetch', fakeFetch);
  mock.timers.enable({ apis: ['setTimeout'] }); // debounce da busca e sumiço dos toasts ficam sob controle do teste
}
function restaurar() {
  mock.timers.reset();
  for (const k of GLOBAIS) {
    const d = guardados.get(k);
    if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
  }
}

const META = {
  topicos: { 103: { titulo: 'Comandos GNU', peso: 5, exame: '101' }, 104: { titulo: 'Discos', peso: 4, exame: '101' } },
  objetivos: [
    { code: '103.1', topico: '103', titulo: 'Linha de comando', peso: 4, exame: '101', areas: ['a'], utils: ['ls'], pdf: null },
    { code: '104.1', topico: '104', titulo: 'Partições', peso: 2, exame: '101', areas: ['a'], utils: ['fdisk'], pdf: null },
  ],
  curso: { url: 'http://curso.test', nome: 'Curso', plataforma: 'Plataforma', aulas: {} },
  banco: { total: 2, geradores: 0, desafios: 0, erros: [], avisos: 0, porObj: {} },
  pdf: { disponiveis: { 101: true, 102: true }, arquivos: { 101: 'a.pdf', 102: 'b.pdf' }, extras: [], indice: 'pronto' },
  mudancas_futuras: [],
};
const STATS = { objetivos: META.objetivos.map((o) => ({ code: o.code, n: 0, mastery: 0, acc: null })) };

function reset(extra = {}) {
  calls = []; loc.hash = ''; loc.replaced = []; store.clear();
  handlers = {
    'GET /api/meta': () => META,
    'GET /api/progress': () => ({ status: {}, aulas: {} }),
    'GET /api/stats': () => STATS,
    'GET /api/exams': () => ({ exames: [] }),
    'GET /api/lab/status': () => ({ online: true }),
    'GET /api/lab/challenges': () => ({ desafios: [] }),
    'GET /api/reports': () => ({ reports: [] }),
    ...extra,
  };
}
const load = (v) => import(`../public/js/views/${v}.js`);

describe('telas em memória (D-05, D-07, D-08, D-10)', () => {
  before(instalar);
  after(restaurar);

  // ---------- D-05: criação de provas ----------

  test('D-05 novo: clique duplo em Relâmpago cria uma única prova e trava os botões enquanto espera', async () => {
    const pend = defer();
    reset({ 'POST /api/exams': () => pend.promise });
    const todos = [btn({ start: 'relampago' }), btn({ start: 'erros' })];
    const root = makeRoot({ button: todos });
    const { render } = await load('novo');
    await render(root, { params: new URLSearchParams(), isCurrent: () => true });
    const b = todos[0];
    const p1 = click(root, b);
    const p2 = click(root, b);
    await flush();
    assert.equal(posts('/api/exams').length, 1, 'dois cliques geraram duas provas');
    assert.ok(todos.every((x) => x.disabled), 'controles de criação deveriam ficar desabilitados durante o pedido');
    pend.resolve({ id: 'exam-1' });
    await Promise.all([p1, p2]);
    assert.equal(loc.hash, '#/prova/exam-1');
  });

  test('D-05 novo: se o usuário saiu da tela, a resposta tardia não redireciona', async () => {
    const pend = defer();
    reset({ 'POST /api/exams': () => pend.promise });
    let atual = true;
    const root = makeRoot();
    const { render } = await load('novo');
    await render(root, { params: new URLSearchParams(), isCurrent: () => atual });
    const p = click(root, btn({ start: 'relampago' }));
    await flush();
    loc.hash = '#/material'; // navegou para outra tela antes da resposta
    atual = false;
    pend.resolve({ id: 'exam-2' });
    await p;
    assert.equal(loc.hash, '#/material');
  });

  test('D-05 novo: falha na criação libera a trava para nova tentativa', async () => {
    let n = 0;
    reset({ 'POST /api/exams': () => (++n === 1 ? reply(500, { erro: 'falhou' }) : { id: 'exam-3' }) });
    const todos = [btn({ start: 'relampago' })];
    const root = makeRoot({ button: todos });
    const { render } = await load('novo');
    await render(root, { params: new URLSearchParams(), isCurrent: () => true });
    await click(root, todos[0]);
    assert.equal(loc.hash, '', 'não deveria redirecionar após falha');
    assert.equal(todos[0].disabled, false, 'controles devem voltar após a falha');
    await click(root, todos[0]);
    assert.equal(posts('/api/exams').length, 2);
    assert.equal(loc.hash, '#/prova/exam-3');
  });

  test('D-05 novo: "Novo sorteio" do histórico também aceita um único clique e respeita a tela atual', async () => {
    const pend = defer();
    reset({ 'POST /api/exams/e1/retake': () => pend.promise });
    let atual = true;
    const root = makeRoot();
    const { render } = await load('novo');
    await render(root, { params: new URLSearchParams(), isCurrent: () => atual });
    const b = btn({ retake: 'e1' });
    const p1 = click(root, b);
    const p2 = click(root, b);
    await flush();
    assert.equal(posts('/api/exams/e1/retake').length, 1);
    atual = false;
    pend.resolve({ id: 'exam-4' });
    await Promise.all([p1, p2]);
    assert.equal(loc.hash, '', 'tela já descartada: sem redirecionamento');
  });

  const EXAME = {
    id: 'e1', status: 'finalizado', title: 'Teste', created: 1700000000000, minutes: 0, instant: false, n: 1, flags: [], answers: { 0: [0] },
    questions: [{ qid: 'q1', obj: '103.1', type: 'unica', text: 'Pergunta?', options: ['a', 'b'], gabarito: [0], explanation: 'Porque sim.', ref: [] }],
    result: { pct: 1, correct: 1, n: 1, respondidas: 1, tempo_seg: 30, por_obj: { '103.1': { n: 1, ok: 1 } }, items: [{ ok: true, answered: true }] },
  };

  test('D-05 resultado: refazer (novo sorteio / mesma prova / erradas) é uma operação por vez e respeita isCurrent', async () => {
    for (const [act, path] of [['retake', '/api/exams/e1/retake'], ['same', '/api/exams/e1/retake'], ['wrong', '/api/exams/e1/wrong']]) {
      const pend = defer();
      reset({ 'GET /api/exams/e1': () => EXAME, [`POST ${path}`]: () => pend.promise });
      let atual = true;
      const root = makeRoot();
      const { render } = await load('resultado');
      await render(root, { args: ['e1'], params: new URLSearchParams(), isCurrent: () => atual });
      const b = btn({ act });
      const p1 = click(root, b);
      const p2 = click(root, b);
      await flush();
      assert.equal(posts(path).length, 1, `${act}: dois cliques geraram duas provas`);
      atual = false;
      loc.hash = '#/material';
      pend.resolve({ id: 'exam-5' });
      await Promise.all([p1, p2]);
      assert.equal(loc.hash, '#/material', `${act}: redirecionou depois de sair da tela`);
    }
  });

  test('D-05 resultado: com a tela atual, redireciona para a prova criada', async () => {
    reset({ 'GET /api/exams/e1': () => EXAME, 'POST /api/exams/e1/retake': () => ({ id: 'exam-6' }) });
    const root = makeRoot();
    const { render } = await load('resultado');
    await render(root, { args: ['e1'], params: new URLSearchParams(), isCurrent: () => true });
    await click(root, btn({ act: 'retake' }));
    assert.equal(loc.hash, '#/prova/exam-6');
  });

  test('D-05 curso: "Treinar 10" cria uma única prova e não redireciona se a tela mudou', async () => {
    const pend = defer();
    reset({ 'POST /api/exams': () => pend.promise });
    let atual = true;
    const root = makeRoot();
    const { render } = await load('curso');
    await render(root, { isCurrent: () => atual });
    const b = btn({ train: '103.1' });
    const p1 = click(root, b);
    const p2 = click(root, b);
    await flush();
    assert.equal(posts('/api/exams').length, 1);
    assert.deepEqual(posts('/api/exams')[0].body, { mode: 'treino', objetivos: ['103.1'], n: 10 });
    atual = false;
    pend.resolve({ id: 'exam-7' });
    await Promise.all([p1, p2]);
    assert.equal(loc.hash, '');
  });

  test('D-05 objetivo: treinar/simulado cria uma única prova e não redireciona se a tela mudou', async () => {
    for (const dataset of [{ train: '10' }, { quiz: '1' }]) {
      const pend = defer();
      reset({ 'POST /api/exams': () => pend.promise });
      let atual = true;
      const root = makeRoot();
      const { render } = await load('objetivo');
      await render(root, { args: ['103.1'], isCurrent: () => atual });
      const b = btn(dataset);
      const p1 = click(root, b);
      const p2 = click(root, b);
      await flush();
      assert.equal(posts('/api/exams').length, 1, JSON.stringify(dataset));
      atual = false;
      pend.resolve({ id: 'exam-8' });
      await Promise.all([p1, p2]);
      assert.equal(loc.hash, '', JSON.stringify(dataset));
    }
  });

  // ---------- D-07: busca do material ----------

  function materialPronto(extra) {
    reset(extra);
    const q = new El({ tag: 'input' });
    const results = new El(); results.cls.add('hidden');
    const toc = new El();
    const root = makeRoot({ '#q': q, '#results': results, '#toc': toc, '#frame': new El(), '#where': new El(), '#tree': new El() });
    return { q, results, toc, root };
  }
  const digita = (q, v) => { q.value = v; q.oninput(); };
  const achado = (txt) => ({ estado: 'pronto', resultados: [{ exame: '101', pagina: 7, titulo: null, obj: '103.1', trecho: txt }] });

  test('D-07 material: respostas fora de ordem — só a consulta mais recente aparece', async () => {
    const cron = defer(); const systemd = defer();
    const { q, results, root } = materialPronto({
      'GET /api/search?q=cron': () => cron.promise, 'GET /api/search?q=systemd': () => systemd.promise,
    });
    const { render } = await load('material');
    await render(root, { params: new URLSearchParams(), isCurrent: () => true });
    digita(q, 'cron'); mock.timers.tick(250); await flush();
    digita(q, 'systemd'); mock.timers.tick(250); await flush();
    systemd.resolve(achado('o systemd inicia'));
    await flush();
    assert.match(results.innerHTML, /systemd/);
    cron.resolve(achado('o cron agenda'));
    await flush();
    assert.match(results.innerHTML, /systemd/, 'resposta antiga apagou a atual');
    assert.doesNotMatch(results.innerHTML, /cron agenda/);
  });

  test('D-07 material: limpar o campo durante a busca mantém o índice visível', async () => {
    const umask = defer();
    const { q, results, toc, root } = materialPronto({ 'GET /api/search?q=umask': () => umask.promise });
    const { render } = await load('material');
    await render(root, { params: new URLSearchParams(), isCurrent: () => true });
    digita(q, 'umask'); mock.timers.tick(250); await flush();
    digita(q, ''); mock.timers.tick(250); await flush();
    assert.equal(toc.classList.contains('hidden'), false);
    umask.resolve(achado('umask define permissões'));
    await flush();
    assert.equal(toc.classList.contains('hidden'), false, 'resposta antiga escondeu o índice');
    assert.equal(results.classList.contains('hidden'), true, 'resposta antiga reapareceu depois de limpar o campo');
  });

  test('D-07 material: sair da tela cancela a busca agendada e ignora a resposta em voo', async () => {
    const pend = defer();
    const { q, results, root } = materialPronto({ 'GET /api/search?q=cron': () => pend.promise, 'GET /api/search?q=vim': () => achado('vim') });
    const { render } = await load('material');
    const cleanup = await render(root, { params: new URLSearchParams(), isCurrent: () => true });
    assert.equal(typeof cleanup, 'function');
    digita(q, 'vim'); // ainda dentro do debounce
    cleanup();
    mock.timers.tick(250); await flush();
    assert.equal(calls.filter((c) => c.path.startsWith('/api/search')).length, 0, 'buscou depois de sair da tela');
    // resposta em voo
    const r2 = await load('material');
    const t = materialPronto({ 'GET /api/search?q=cron': () => pend.promise });
    const cleanup2 = await r2.render(t.root, { params: new URLSearchParams(), isCurrent: () => true });
    digita(t.q, 'cron'); mock.timers.tick(250); await flush();
    cleanup2();
    pend.resolve(achado('o cron agenda'));
    await flush();
    assert.equal(t.results.innerHTML, '', 'atualizou a tela depois do cleanup');
    assert.equal(results.innerHTML, '');
  });

  // ---------- D-08: tentativas de laboratório no navegador ----------

  const RUN = { run: 'r1', id: 'ch1', obj: '103.1', titulo: 'Desafio', nivel: 1, enunciado: 'Faça `ls`.', verifica: [], dicas: 0 };

  test('D-08 lab + config: apagar o progresso invalida as tentativas e o desafio reabre com /start', async () => {
    let n = 0;
    reset({ 'POST /api/lab/start': () => ({ ...RUN, run: `r${++n}` }), 'POST /api/reset': () => ({ ok: true }) });
    const lab = await load('lab');
    await lab.render(makeRoot({ '#out': new El() }), { args: ['ch1'], isCurrent: () => true });
    assert.equal(posts('/api/lab/start').length, 1);
    assert.ok(store.has('labrun:ch1'));
    // reabrir sem reset reaproveita a tentativa
    await lab.render(makeRoot({ '#out': new El() }), { args: ['ch1'], isCurrent: () => true });
    assert.equal(posts('/api/lab/start').length, 1);
    // apaga o progresso
    const reset_ = new El();
    const cfg = await load('config');
    await cfg.render(makeRoot({ '#reload': new El(), '#imp': new El(), '#reset': reset_ }));
    await reset_.onclick();
    assert.equal(posts('/api/reset').length, 1);
    assert.equal(store.has('labrun:ch1'), false, 'reset não invalidou a tentativa guardada');
    await lab.render(makeRoot({ '#out': new El() }), { args: ['ch1'], isCurrent: () => true });
    assert.equal(posts('/api/lab/start').length, 2, 'o desafio reutilizou uma tentativa que o servidor já apagou');
  });

  test('D-08 config: importação bem-sucedida invalida as tentativas; importação recusada não toca nelas', async () => {
    reset({ 'POST /api/import': () => ({ ok: true }) });
    store.set('labrun:ch1', JSON.stringify(RUN));
    store.set('labrun:ch2', JSON.stringify(RUN));
    store.set('cursoAbertos', '["103"]'); // não é do laboratório: fica
    const imp = new El();
    const cfg = await load('config');
    await cfg.render(makeRoot({ '#reload': new El(), '#imp': imp, '#reset': new El() }));
    const arquivo = { text: async () => '{"versao":1}' };
    // recusada pelo servidor
    handlers['POST /api/import'] = () => reply(400, { erro: 'backup inválido' });
    await imp.onchange({ target: { files: [arquivo] } });
    assert.ok(store.has('labrun:ch1') && store.has('labrun:ch2'), 'importação com erro não pode apagar tentativas válidas');
    // aceita
    handlers['POST /api/import'] = () => ({ ok: true });
    await imp.onchange({ target: { files: [arquivo] } });
    assert.equal(store.has('labrun:ch1'), false);
    assert.equal(store.has('labrun:ch2'), false);
    assert.ok(store.has('cursoAbertos'), 'só as chaves labrun: devem ser invalidadas');
  });

  test('D-08 config: reset recusado não invalida as tentativas', async () => {
    reset({ 'POST /api/reset': () => reply(500, { erro: 'falhou' }) });
    store.set('labrun:ch1', JSON.stringify(RUN));
    const r = new El();
    const cfg = await load('config');
    await cfg.render(makeRoot({ '#reload': new El(), '#imp': new El(), '#reset': r }));
    await assert.rejects(() => r.onclick());
    assert.ok(store.has('labrun:ch1'));
  });

  test('D-08 lab: 404 da tentativa remove a chave e o próximo acesso inicia outra; offline/erro 5xx preservam o cache', async () => {
    let n = 0;
    reset({
      'POST /api/lab/start': () => ({ ...RUN, run: `n${++n}` }),
      'POST /api/lab/runs/r1/check': () => reply(404, { erro: 'tentativa não encontrada' }),
      'POST /api/lab/runs/r1/hint': () => reply(502, { erro: 'laboratório indisponível' }),
    });
    store.set('labrun:ch1', JSON.stringify(RUN));
    const out = new El();
    const root = makeRoot({ '#out': out });
    const lab = await load('lab');
    await lab.render(root, { args: ['ch1'], isCurrent: () => true });
    assert.equal(posts('/api/lab/start').length, 0);
    // falha de infraestrutura: o cache continua valendo
    await click(root, btn({ act: 'hint' }));
    assert.ok(store.has('labrun:ch1'), '5xx não deve apagar a tentativa');
    // 404: a tentativa não existe mais
    await click(root, btn({ act: 'check' }));
    assert.equal(store.has('labrun:ch1'), false, '404 deveria remover a tentativa inválida');
    assert.match(out.innerHTML, /nova tentativa|não existe mais/i, 'sem orientação de recuperação para o aluno');
    assert.equal(loc.hash, '', 'não deve redirecionar sozinho');
    await lab.render(makeRoot({ '#out': new El() }), { args: ['ch1'], isCurrent: () => true });
    assert.equal(posts('/api/lab/start').length, 1, 'o próximo acesso deveria iniciar uma tentativa nova');
  });

  test('D-08 lab: laboratório offline não apaga as tentativas guardadas', async () => {
    reset({ 'GET /api/lab/status': () => ({ online: false }) });
    store.set('labrun:ch1', JSON.stringify(RUN));
    const lab = await load('lab');
    await lab.render(makeRoot(), { args: ['ch1'], isCurrent: () => true });
    assert.ok(store.has('labrun:ch1'));
  });

  // ---------- D-10: preferência de expansão do curso ----------

  const abertos = (root) => [...root.innerHTML.matchAll(/data-topic="(\d+)"\s+(open)?/g)].filter((m) => m[2]).map((m) => m[1]);

  test('D-10 curso: valor ausente, corrompido ou de tipo errado abre a tela com todos os tópicos expandidos', async () => {
    const { render } = await load('curso');
    for (const bruto of [null, '{', '{}', '"103"', '42', 'null', 'true']) {
      reset();
      if (bruto !== null) store.set('cursoAbertos', bruto);
      const root = makeRoot();
      await render(root, { isCurrent: () => true });
      assert.deepEqual(abertos(root), ['103', '104'], `valor guardado: ${bruto}`);
    }
  });

  test('D-10 curso: lista válida é respeitada e tópicos desconhecidos são ignorados', async () => {
    const { render } = await load('curso');
    for (const [bruto, esperado] of [['["103"]', ['103']], ['["103","999",7,null]', ['103']], ['[]', []], ['["104","103"]', ['103', '104']]]) {
      reset();
      store.set('cursoAbertos', bruto);
      const root = makeRoot();
      await render(root, { isCurrent: () => true });
      assert.deepEqual(abertos(root), esperado, bruto);
    }
  });

  test('D-10 curso: armazenamento que lança exceção (SecurityError/Quota) não impede abrir nem alternar tópicos', async () => {
    const { render } = await load('curso');
    const original = globalThis.sessionStorage;
    const quebrado = { getItem() { throw new DOMException('negado', 'SecurityError'); }, setItem() { throw new DOMException('cheio', 'QuotaExceededError'); }, removeItem() {}, key: () => null, length: 0 };
    defineGlobal('sessionStorage', quebrado);
    try {
      reset();
      const root = makeRoot({ 'details[data-topic][open]': [new El({ dataset: { topic: '103' } })] });
      await render(root, { isCurrent: () => true });
      assert.deepEqual(abertos(root), ['103', '104']);
      assert.doesNotThrow(() => root.ontoggle());
    } finally { defineGlobal('sessionStorage', original); }
  });

  test('D-10 curso: alternar tópicos grava a preferência (ida e volta)', async () => {
    reset();
    const { render } = await load('curso');
    const root = makeRoot({ 'details[data-topic][open]': [new El({ dataset: { topic: '104' } })] });
    await render(root, { isCurrent: () => true });
    root.ontoggle();
    assert.equal(store.get('cursoAbertos'), '["104"]');
    const root2 = makeRoot();
    await render(root2, { isCurrent: () => true });
    assert.deepEqual(abertos(root2), ['104']);
  });
});
