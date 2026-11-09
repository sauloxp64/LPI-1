// Tela da prova (app/public/js/views/prova.js) rodando de verdade no Node, com DOM, timers, `fetch` e servidor simulados em memória
// (ver falsos.mjs). Cobre os achados D-02, D-03, D-04, D-06 e D-09 da auditoria, cada um com a sequência de reprodução do relatório.
// PROVA_VIEW=<caminho> aponta para outra cópia da tela (usado só para provar que os testes falham sem a correção).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Servidor, instalar, settle } from './falsos.mjs';

const VIEW = process.env.PROVA_VIEW ? pathToFileURL(process.env.PROVA_VIEW).href : new URL('../public/js/views/prova.js', import.meta.url).href;
const CSS = readFileSync(new URL('../public/css/style.css', import.meta.url), 'utf8');

/** Monta o ambiente, roda `fn` e restaura os globais, passe o que passar. */
const cenario = async (opts, fn) => {
  const servidor = new Servidor(); const exam = servidor.addExam(opts.exam ?? {});
  const env = instalar({ servidor, hash: opts.hash ?? '#/prova/e1' });
  env.exam = exam;
  try { await fn(env, servidor); } finally { env.desfazer(); }
};
const abrir = async (env, { root = env.root, isCurrent } = {}) => (await import(VIEW)).render(root, { args: ['e1'], isCurrent });
const novoRoot = (env) => { const r = env.doc.createElement('div'); env.doc.body.append(r); return r; };
const opt = (root, k) => root.querySelector(`[data-opt="${k}"]`);
const ctl = (root, k) => root.querySelector(`[data-opt="${k}"] input`);
const escolher = (root, k) => opt(root, k).click();
const estado = (root) => root.querySelector('#savestate').textContent;
const confirmar = (env) => env.doc.body.querySelector('dialog button[value=yes]').click();
const finalizarPelaTela = async (env) => { env.root.querySelector('#finish').click(); await settle(); confirmar(env); await settle(); };
const ehPutDeTela = (r) => r.method === 'PUT' && !r.keepalive;
// compara por identidade: a mensagem de falha do assert.equal tentaria imprimir o grafo circular do DOM inteiro
const focoEm = (env, el, msg = 'o foco está no elemento esperado') => assert.ok(env.doc.activeElement === el && el !== null, `${msg} (ativo: ${env.doc.activeElement?.tag}${env.doc.activeElement?.id ? '#' + env.doc.activeElement.id : ''})`);

// ---------- D-02 ----------
test('D-02: tela descartada não retoma salvamentos: A/1 → descarte → B/2 → falha tardia → B/2 permanece', () => cenario({ exam: { n: 2 } }, async (env, s) => {
  const gate = s.segurar(ehPutDeTela, 1); // a resposta do primeiro PUT fica pendente (o servidor já gravou)
  const a = await abrir(env);
  escolher(env.root, 0);
  await env.relogio.avancar(500);
  assert.equal(gate.held.length, 1, 'o PUT A/1 está em voo');
  assert.deepEqual(env.exam.answers[0], [0], 'e o servidor já o gravou');

  a(); // o usuário sai da tela
  const saida = s.puts('e1').at(-1);
  assert.equal(saida.keepalive, true, 'a saída manda uma última cópia');
  assert.deepEqual(saida.body.answers, { 0: [0] }, 'com o lote que estava em voo (A/1), não só com a fila');
  assert.deepEqual(saida.body.vers, { 0: 1 });

  const root2 = novoRoot(env); // reabre a prova: a nova tela parte do estado do servidor
  await abrir(env, { root: root2 });
  escolher(root2, 1); // B
  await env.relogio.avancar(500);
  assert.deepEqual(env.exam.answers[0], [1]);
  assert.equal(env.exam.vers[0], 2);

  gate.held[0].falha(); // a requisição antiga falha tarde
  await settle();
  assert.equal(env.relogio.timers.size, 0, 'a tela descartada não agenda retentativa');
  await env.relogio.avancar(30_000);
  assert.deepEqual(env.exam.answers[0], [1], 'B/2 permanece');
  assert.equal(env.exam.vers[0], 2);
  assert.ok(s.puts('e1').every((r) => !(r.body.vers[0] > 2)), 'nenhuma elevação de versão (A/3) saiu da tela descartada');
}));

test('D-02: resposta "ignored" que chega depois do descarte não eleva a versão nem reenvia', () => cenario({ exam: { n: 2 } }, async (env, s) => {
  const gate = s.segurar(ehPutDeTela, 1);
  const a = await abrir(env);
  env.exam.answers = { 0: [3] }; env.exam.vers = { 0: 5 }; // outra aba já gravou uma revisão mais nova
  escolher(env.root, 0); // esta tela está na revisão 1
  await env.relogio.avancar(500);
  assert.equal(gate.held.length, 1, 'o servidor recusou (ignored) mas a resposta ainda não chegou');
  a(); // o usuário sai
  const antes = s.puts('e1').length;
  gate.held[0].entrega(); await settle(); // a resposta "ignored" chega à tela descartada
  await env.relogio.avancar(30_000);
  assert.equal(s.puts('e1').length, antes, 'nada de ressincronização, elevação de versão nem reenvio');
  assert.deepEqual(env.exam.answers[0], [3]);
  assert.equal(env.exam.vers[0], 5);
  assert.deepEqual(env.doc.historico, [], 'e a tela descartada não exibe avisos por cima da tela atual');
}));

// ---------- D-03 ----------
test('D-03: finalizar não espera um PUT preso: /finish sai logo com o estado completo', () => cenario({ exam: { n: 3 } }, async (env, s) => {
  s.segurar(ehPutDeTela); // todo PUT fica sem resposta
  await abrir(env);
  escolher(env.root, 0);
  await env.relogio.avancar(500); // o PUT está preso
  await finalizarPelaTela(env);
  assert.equal(s.finishes('e1').length, 1, '/finish foi enviado apesar do PUT pendente');
  const corpo = s.finishes('e1')[0].body;
  assert.deepEqual(corpo.answers, { 0: [0], 1: null, 2: null });
  assert.equal(corpo.vers[0], 1);
  assert.deepEqual(env.loc.navegou.at(-1), ['hash', '#/resultado/e1']);
}));

test('D-03: /finish falha uma vez: relógio continua, controles voltam e a nova tentativa conclui com o estado correto', () => cenario({ exam: { n: 2, minutes: 10, deadline: 1_700_000_000_000 + 10 * 60e3 } }, async (env, s) => {
  await abrir(env);
  escolher(env.root, 1);
  s.derrubar((r) => r.url.endsWith('/finish'), 1);
  const antes = env.root.querySelector('#timer').textContent;
  await finalizarPelaTela(env);
  assert.equal(s.finishes('e1').length, 1);
  assert.equal(env.relogio.intervalos(), 1, 'o intervalo do relógio continua ativo');
  await env.relogio.avancar(5_000);
  assert.notEqual(env.root.querySelector('#timer').textContent, antes, 'e o relógio continua avançando');
  const botao = env.root.querySelector('#finish');
  assert.equal(botao.disabled, false, 'o botão volta');
  assert.equal(botao.textContent, 'Finalizar');
  assert.ok(s.log.some((r) => r.method === 'GET' && r.url === '/api/exams/e1' && s.log.indexOf(r) > 1), 'antes de repetir, o estado da prova foi consultado');
  assert.ok(env.doc.toasts.length > 0, 'o usuário foi avisado');
  escolher(env.root, 0); // volta a poder editar
  await finalizarPelaTela(env);
  assert.equal(s.finishes('e1').length, 2);
  assert.deepEqual(s.finishes('e1')[1].body.answers, { 0: [0], 1: null }, 'a nova tentativa leva o estado atual completo');
  assert.deepEqual(env.loc.navegou.at(-1), ['hash', '#/resultado/e1']);
  assert.equal(env.relogio.intervalos(), 0, 'concluída a finalização, o relógio para');
}));

test('D-03: durante o envio final a tela não aceita edições nem dispara autosave', () => cenario({ exam: { n: 2 } }, async (env, s) => {
  const gate = s.segurar((r) => r.url.endsWith('/finish'));
  await abrir(env);
  escolher(env.root, 0);
  await finalizarPelaTela(env); // /finish enviado e sem resposta
  assert.equal(env.root.querySelector('#finish').disabled, true);
  const puts = s.puts('e1').length;
  escolher(env.root, 1); // tentativa de editar durante o envio
  await env.relogio.avancar(5_000);
  assert.equal(s.puts('e1').length, puts, 'nenhum autosave durante a finalização');
  assert.equal(opt(env.root, 1).classList.contains('sel'), false, 'a edição foi recusada');
  assert.equal(gate.held.length, 1);
}));

test('D-03: /finish sem resposta termina por prazo (timeout) e devolve os controles', () => cenario({ exam: { n: 2 } }, async (env, s) => {
  const gate = s.segurar((r) => r.url.endsWith('/finish'), 1, { aplicar: false }); // a requisição se perde
  await abrir(env);
  await finalizarPelaTela(env);
  assert.equal(env.root.querySelector('#finish').disabled, true);
  await env.relogio.avancar(25_000);
  assert.equal(gate.held[0].req.signal.aborted, true, 'a requisição foi cancelada pelo prazo');
  assert.equal(env.root.querySelector('#finish').disabled, false, 'controles restaurados');
  assert.ok(env.doc.toasts.some((t) => /esgotado/i.test(t)));
}));

test('D-03: /finish aplicado mas com a resposta perdida: consulta o estado e abre o resultado em vez de repetir', () => cenario({ exam: { n: 2 } }, async (env, s) => {
  const gate = s.segurar((r) => r.url.endsWith('/finish'), 1); // o servidor finaliza, mas a resposta nunca chega
  await abrir(env);
  escolher(env.root, 0);
  await finalizarPelaTela(env);
  await env.relogio.avancar(25_000);
  assert.equal(gate.held[0].req.signal.aborted, true);
  assert.equal(env.exam.status, 'finalizado');
  assert.equal(s.finishes('e1').length, 1, 'não repetiu a finalização');
  assert.deepEqual(env.loc.navegou.at(-1), ['hash', '#/resultado/e1']);
}));

test('D-03: PUT de autosave sem resposta é cancelado pelo prazo e tentado de novo', () => cenario({ exam: { n: 2 } }, async (env, s) => {
  const gate = s.segurar(ehPutDeTela, 1);
  await abrir(env);
  escolher(env.root, 0);
  await env.relogio.avancar(500);
  assert.equal(gate.held.length, 1);
  await env.relogio.avancar(16_000);
  assert.equal(gate.held[0].req.signal.aborted, true);
  assert.match(estado(env.root), /não salvo/);
  await env.relogio.avancar(5_000);
  assert.equal(estado(env.root), 'salvo', 'a retentativa levou o valor');
  assert.deepEqual(env.exam.answers[0], [0]);
}));

test('D-03: tempo esgotado com falha na rede: tenta de novo com intervalo e sem repetir o aviso', () => cenario({ exam: { n: 2, minutes: 1, deadline: 1_700_000_000_000 + 2_000 } }, async (env, s) => {
  await abrir(env);
  s.derrubar((r) => r.url.endsWith('/finish'), 1);
  await env.relogio.avancar(3_000); // passou do prazo: finalização automática, que falha uma vez
  assert.equal(s.finishes('e1').length, 1);
  await env.relogio.avancar(2_000); // ainda dentro do intervalo de espera: não tenta a cada 500 ms
  assert.equal(s.finishes('e1').length, 1);
  await env.relogio.avancar(5_000);
  assert.equal(s.finishes('e1').length, 2);
  assert.deepEqual(env.loc.navegou.at(-1), ['hash', '#/resultado/e1']);
  assert.equal(env.doc.historico.filter((t) => /Tempo esgotado/.test(t)).length, 1, 'o aviso aparece uma vez só');
}));

test('D-03: conflito (409) na finalização ressincroniza e não finaliza; o usuário finaliza de novo', () => cenario({ exam: { n: 2 } }, async (env, s) => {
  env.exam.answers = { 0: [0] }; env.exam.vers = { 0: 4 };
  await abrir(env); // parte de answers {0:[0]}, vers {0:4}
  env.exam.answers = { 0: [2] }; env.exam.vers = { 0: 5 }; // outra aba alterou depois
  await finalizarPelaTela(env);
  assert.equal(env.exam.status, 'andamento');
  assert.equal(s.finishes('e1').length, 1);
  assert.equal(opt(env.root, 2).classList.contains('sel'), true, 'a tela adotou a resposta do servidor');
  assert.equal(opt(env.root, 0).classList.contains('sel'), false);
  assert.equal(env.root.querySelector('#finish').disabled, false);
  await env.relogio.avancar(30_000);
  assert.equal(s.finishes('e1').length, 1, 'nada é reenviado automaticamente');
  await finalizarPelaTela(env);
  assert.equal(env.exam.status, 'finalizado');
  assert.deepEqual(env.exam.answers[0], [2]);
}));

// ---------- D-04 ----------
test('D-04: PUT com 409 não é "salvo": bloqueia edição, consulta a prova e abre o resultado', () => cenario({ exam: { n: 2 } }, async (env, s) => {
  await abrir(env);
  env.exam.status = 'finalizado'; // outra aba finalizou
  escolher(env.root, 0);
  await env.relogio.avancar(500);
  assert.notEqual(estado(env.root), 'salvo');
  assert.match(estado(env.root), /recusada/);
  assert.ok(s.log.some((r) => r.method === 'GET' && r.url === '/api/exams/e1' && s.log.indexOf(r) > 0), 'consultou o estado da prova');
  assert.deepEqual(env.loc.navegou.at(-1), ['replace', '#/resultado/e1']);
  const puts = s.puts('e1').length;
  escolher(env.root, 1); // edição depois da recusa
  await env.relogio.avancar(120_000);
  assert.equal(s.puts('e1').length, puts, 'sem retentativas (nem infinitas)');
  assert.equal(opt(env.root, 1).classList.contains('sel'), false, 'edição bloqueada');
}));

test('D-04: 409 chegando depois de a tela ser trocada não abre o resultado por cima da tela atual', () => cenario({ exam: { n: 2 } }, async (env, s) => {
  let atual = true;
  await abrir(env, { isCurrent: () => atual });
  env.exam.status = 'finalizado';
  const consulta = s.segurar((r) => r.method === 'GET', 1);
  escolher(env.root, 0);
  await env.relogio.avancar(500);
  assert.equal(consulta.held.length, 1);
  atual = false; // o usuário foi para outra tela
  consulta.held[0].entrega(); await settle();
  assert.equal(env.loc.navegou.length, 0, 'nenhuma navegação');
}));

test('D-04: edição recusada por conflito (200 + ignored) é ressincronizada, não reenviada, e a próxima edição vale', () => cenario({ exam: { n: 2 } }, async (env, s) => {
  env.exam.vers = { 0: 5 };
  await abrir(env);
  env.exam.answers = { 0: [2] }; env.exam.vers = { 0: 6 }; // outra aba gravou a revisão 6
  escolher(env.root, 1); // esta aba também chega à revisão 6, com outro valor
  await env.relogio.avancar(500);
  assert.equal(opt(env.root, 2).classList.contains('sel'), true, 'adotou o valor do servidor');
  assert.equal(opt(env.root, 1).classList.contains('sel'), false);
  assert.match(estado(env.root), /atualizado/);
  const puts = s.puts('e1').length;
  await env.relogio.avancar(30_000);
  assert.equal(s.puts('e1').length, puts, 'a edição recusada não é reenviada como se fosse nova');
  escolher(env.root, 3); // nova decisão do usuário
  await env.relogio.avancar(500);
  assert.deepEqual(env.exam.answers[0], [3]);
  assert.equal(env.exam.vers[0], 7);
}));

// ---------- D-06 ----------
for (const q of ['999', '-1', '0.5', 'Infinity', 'abc']) {
  test(`D-06: ?q=${q} abre uma questão válida e normaliza a URL`, () => cenario({ exam: { n: 2 }, hash: `#/prova/e1?q=${q}` }, async (env) => {
    const limpar = await abrir(env);
    assert.match(env.root.querySelector('.qcard b').textContent, /Questão 1 de 2/);
    assert.equal(env.hist.chamadas.at(-1), '#/prova/e1?q=0');
    limpar();
  }));
}
test('D-06: sem ?q= e com ?q= válido a URL não é mexida', () => cenario({ exam: { n: 3 } }, async (env) => {
  const limpar = await abrir(env);
  assert.match(env.root.querySelector('.qcard b').textContent, /Questão 1 de 3/);
  limpar();
  env.loc._h = '#/prova/e1?q=2';
  const root2 = novoRoot(env);
  const limpar2 = await abrir(env, { root: root2 });
  assert.match(root2.querySelector('.qcard b').textContent, /Questão 3 de 3/);
  assert.equal(env.hist.chamadas.length, 0);
  limpar2();
}));

test('D-06: falha na renderização inicial não deixa interval nem listener órfãos', () => cenario({ exam: { n: 1, minutes: 5, deadline: 1_700_000_000_000 + 300_000 } }, async (env) => {
  env.exam.questions[0].options = null; // drawQuestion lança
  await assert.rejects(abrir(env));
  assert.equal(env.doc.listeners('keydown'), 0);
  assert.equal(env.win.listeners('pagehide'), 0);
  assert.equal(env.relogio.intervalos(), 0);
}));

test('D-06: falha DEPOIS de instalar os efeitos também desfaz tudo', () => cenario({ exam: { n: 1, minutes: 5 } }, async (env) => {
  env.exam.deadline = 10n; // BigInt: a primeira atualização do relógio lança, já com os listeners instalados
  await assert.rejects(abrir(env));
  assert.equal(env.doc.listeners('keydown'), 0);
  assert.equal(env.win.listeners('pagehide'), 0);
  assert.equal(env.relogio.intervalos(), 0);
}));

test('descartar a tela remove listeners, intervalo e handlers, e é idempotente', () => cenario({ exam: { n: 1, minutes: 5, deadline: 1_700_000_000_000 + 300_000 } }, async (env) => {
  const limpar = await abrir(env);
  assert.equal(env.doc.listeners('keydown'), 1);
  assert.equal(env.relogio.intervalos(), 1);
  limpar(); limpar();
  assert.equal(env.doc.listeners('keydown'), 0);
  assert.equal(env.win.listeners('pagehide'), 0);
  assert.equal(env.relogio.intervalos(), 0);
  assert.equal(env.root.onclick, null);
}));

// ---------- D-09 ----------
test('D-09: ativar uma alternativa múltipla por teclado mantém o foco no controle e permite marcar a seguinte', () => cenario({ exam: { n: 2, type: 'multipla' } }, async (env) => {
  await abrir(env);
  const a = ctl(env.root, 0);
  a.focus();
  focoEm(env, a);
  a.click(); // Espaço no checkbox focado
  focoEm(env, a, 'o foco continua no mesmo controle');
  assert.equal(a.isConnected, true, 'o controle não foi destruído');
  assert.equal(a.checked, true, 'e continua marcado');
  const b = ctl(env.root, 1);
  b.focus(); b.click(); // Tab + Espaço
  focoEm(env, b);
  assert.equal(a.checked && b.checked, true, 'as duas seleções são preservadas');
  assert.equal(opt(env.root, 0).classList.contains('sel') && opt(env.root, 1).classList.contains('sel'), true);
  b.click(); // desmarca
  assert.equal(b.checked, false);
  assert.equal(opt(env.root, 1).classList.contains('sel'), false);
  focoEm(env, b);
  await env.relogio.avancar(500);
  assert.deepEqual(env.exam.answers[0], [0], 'e o salvamento leva o conjunto final');
}));

test('D-09: alternativa única por teclado e clique no rótulo (mouse) também mantêm foco e estado', () => cenario({ exam: { n: 2 } }, async (env) => {
  await abrir(env);
  const r1 = ctl(env.root, 1);
  r1.focus(); r1.click();
  focoEm(env, r1);
  assert.equal(r1.checked, true);
  opt(env.root, 2).click(); // clique no rótulo
  assert.equal(ctl(env.root, 2).checked, true);
  assert.equal(ctl(env.root, 1).checked, false);
  assert.equal(opt(env.root, 2).classList.contains('sel'), true);
  await env.relogio.avancar(500);
  assert.deepEqual(env.exam.answers[0], [2], 'o rótulo não alterna duas vezes');
}));

test('D-09: "Marcar para revisão" devolve o foco ao botão; "Próxima" e "Anterior" levam o foco ao cabeçalho da nova questão', () => cenario({ exam: { n: 3 } }, async (env) => {
  await abrir(env);
  const marcar = env.root.querySelector('[data-flag]');
  marcar.focus(); marcar.click();
  focoEm(env, env.root.querySelector('[data-flag]'));
  assert.match(env.doc.activeElement.textContent, /Desmarcar/, 'o botão novo está com o foco');
  assert.equal(env.doc.activeElement.isConnected, true);
  const prox = env.root.querySelector('[data-next]');
  prox.focus(); prox.click(); await settle();
  focoEm(env, env.root.querySelector('.qmeta'));
  assert.match(env.doc.activeElement.textContent, /Questão 2 de 3/);
  const ant = env.root.querySelector('[data-prev]');
  ant.focus(); ant.click(); await settle();
  focoEm(env, env.root.querySelector('.qmeta'));
  assert.match(env.doc.activeElement.textContent, /Questão 1 de 3/);
  assert.equal(env.hist.chamadas.at(-1), '#/prova/e1?q=0');
}));

test('D-09: questão de lacuna recebe o foco no campo ao chegar', () => cenario({ exam: { n: 2, type: 'lacuna' } }, async (env) => {
  await abrir(env);
  focoEm(env, env.root.querySelector('#lac'));
  env.root.querySelector('[data-next]').click(); await settle();
  focoEm(env, env.root.querySelector('#lac'));
}));

test('D-09: o rótulo da alternativa tem indicador de foco visível (o controle é invisível)', () => {
  assert.match(CSS, /\.opt:has\(input:focus-visible\)\s*\{[^}]*outline:/, 'foco do teclado visível no rótulo');
  assert.match(CSS, /@supports not selector\(:has\(\*\)\)\s*\{\s*\.opt:focus-within\s*\{[^}]*outline:/, 'e alternativa para navegadores sem :has');
});
