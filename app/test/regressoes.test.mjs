import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generators, getGenerator } from '../src/generators/index.mjs';
import { checkGenerated } from '../src/gencheck.mjs';
import { makeRng } from '../src/rng.mjs';
import { viRun, keysOf } from '../src/generators/procs-regex-shell4.mjs';
import { hostGw } from '../src/generators/network3.mjs';
import { outsideGw } from '../src/generators/network4.mjs';
import { oraculos, regressoes, rodarRegressoes, gerarComPrazo, amostrarComPrazo, gatewayCoerente, cronLinhaValida } from '../tools/regressoes.mjs';

// Regressões dos achados B-01 … B-08 da auditoria (gerador + ramo + semente fixos) e dos oráculos que os pegam (B-09).

const gen = (id, seed) => getGenerator(id).make(makeRng(seed));

test('manifesto: todos os casos fixos (gerador+ramo+semente) passam no checkGenerated e no oráculo', () => {
  const falhas = rodarRegressoes({ getGenerator, makeRng });
  assert.deepEqual(falhas.map((f) => `${f.caso.achado} ${f.caso.gerador} ${f.caso.semente}: ${f.problemas.join('; ')}`), []);
  // o manifesto cobre todos os achados B-01..B-08 e só aponta para geradores que existem
  const achados = new Set(regressoes.map((r) => r.achado));
  for (const a of ['B-01', 'B-02', 'B-03', 'B-04', 'B-05', 'B-06', 'B-07', 'B-08']) assert.ok(achados.has(a), `${a} sem caso`);
  for (const r of regressoes) assert.ok(getGenerator(r.gerador), `${r.gerador} não existe`);
});

// ---------------------------------------------------------------- B-01
test('B-01: cron-linha-valida com a semente hangB:21922 termina (Worker com prazo) e gera questão válida', () => {
  const r = gerarComPrazo('cron-linha-valida', 'hangB:21922', 2000 + 3000); // 2 s de laço + folga para subir o Worker
  assert.ok(!r.travou, 'make() não terminou no prazo: laço infinito na desduplicação das linhas');
  assert.ok(!r.erro, r.erro);
  assert.deepEqual(checkGenerated(r.q, getGenerator('cron-linha-valida')), []);
  assert.deepEqual(oraculos.cron(r.q), []);
});

test('B-01: o ajudante de prazo realmente reporta "travou" quando o tempo acaba', () => {
  assert.equal(gerarComPrazo('cron-linha-valida', 'hangB:21922', 1).travou, true);
});

test('B-01: 600 sementes de cron-linha-valida terminam (Worker com prazo), têm linhas distintas e ok coerente com um validador independente', () => {
  const g = getGenerator('cron-linha-valida');
  const r = amostrarComPrazo('cron-linha-valida', Array.from({ length: 600 }, (_, i) => `b01:${i}`), 15000);
  assert.ok(!r.travou && !r.erro, r.erro ?? 'make() não terminou no prazo');
  r.qs.forEach((q, i) => {
    assert.deepEqual(checkGenerated(q, g), [], `semente b01:${i}`);
    assert.deepEqual(oraculos.cron(q), [], `semente b01:${i}`);
  });
});

// ---------------------------------------------------------------- B-02
test('B-02: hostGw — gateway sempre na sub-rede do host (/16 /20 /22 /23 /24 /25; finais 127, 128, 254), host nunca rede/broadcast', () => {
  for (const pfx of [16, 20, 22, 23, 24, 25]) {
    for (const last of [10, 126, 127, 128, 129, 200, 254]) {
      for (const net of ['192.168.0', '192.168.242', '192.168.254']) {
        const { addr, gw } = hostGw(net, last, pfx);
        assert.deepEqual(gatewayCoerente(addr, pfx, gw), [], `${net}.${last}/${pfx} → ${addr} gw ${gw}`);
      }
    }
  }
  // o caso do achado: /25 com host em .179 (sub-rede .128/25) não pode usar o gateway .1
  assert.notEqual(hostGw('192.168.242', 179, 25).gw, '192.168.242.1');
  // quando net.1 serve, o gateway continua sendo net.1 (conteúdo antigo preservado)
  assert.equal(hostGw('192.168.7', 50, 24).gw, '192.168.7.1');
});

test('B-02: outsideGw — gateway "externo" fica mesmo fora da sub-rede, qualquer que seja o prefixo', () => {
  for (const pfx of [16, 20, 22, 23, 24, 25]) {
    for (const ip of ['10.180.0.129', '192.168.243.127', '192.168.243.128', '172.16.0.254', '10.255.255.254']) {
      const gw = outsideGw(ip, pfx);
      assert.notEqual(Math.floor(ipN(gw) / 2 ** (32 - pfx)), Math.floor(ipN(ip) / 2 ** (32 - pfx)), `${ip}/${pfx} → ${gw}`);
    }
  }
});
const ipN = (s) => s.split('.').reduce((a, o) => a * 256 + Number(o), 0);

test('B-02: sementes fixas e amostra ampla de ifupdown-networkd / net-troubleshoot passam no oráculo de rede', () => {
  assert.deepEqual(oraculos.redeConfig(gen('ifupdown-networkd', 'reproB:10')), []);
  assert.deepEqual(oraculos.redeConfig(gen('ifupdown-networkd', 'reproB:97')), []);
  assert.deepEqual(oraculos.redeDiagnostico(gen('net-troubleshoot', 'reproB:3')), []);
  const comGateway = (q) => /[Gg]ateway/.test(q.options.find((o) => o.ok).t) && /\/\d+/.test(q.options.find((o) => o.ok).t);
  let vistos = 0; let gw = 0;
  for (let i = 0; i < 600; i++) {
    const q = gen('ifupdown-networkd', `b02:${i}`);
    if (comGateway(q)) { vistos++; assert.deepEqual(oraculos.redeConfig(q), [], `ifupdown-networkd b02:${i}`); }
    const d = gen('net-troubleshoot', `b02:${i}`);
    assert.deepEqual(oraculos.redeDiagnostico(d), [], `net-troubleshoot b02:${i}`);
    if (/fora da sub-rede/.test(d.options.find((o) => o.ok).t)) gw++;
  }
  assert.ok(vistos > 50 && gw > 10, `amostra pouco representativa (${vistos} configs, ${gw} diagnósticos de gateway)`);
});

// ---------------------------------------------------------------- B-03
test('B-03: at-comandos — nenhum alias de remoção (atrm / at -d / at -r) é alternativa errada', () => {
  const q = gen('at-comandos', 'reproB:54');
  assert.match(q.text, /remove\*\* o job/);
  assert.ok(!q.options.some((o) => o.t === 'at -r 37'), 'at -r 37 não pode aparecer como distrator');
  assert.deepEqual(oraculos.atRemocao(q), []);
  let remocao = 0;
  for (let i = 0; i < 400; i++) {
    const r = gen('at-comandos', `b03:${i}`);
    assert.deepEqual(oraculos.atRemocao(r), [], `b03:${i}`);
    if (/remove\*\* o job/.test(r.text)) remocao++;
  }
  assert.ok(remocao > 20);
});

// ---------------------------------------------------------------- B-04
test('B-04: dns-tool-cmd (getent) — uma única alternativa equivale à correta', () => {
  const q = gen('dns-tool-cmd', 'reproB:0');
  assert.ok(q.options.some((o) => o.t.includes('getent -s dns hosts')));
  assert.ok(!q.options.some((o) => o.t.includes('getent hosts -s dns')), '"getent hosts -s dns" equivale a "getent -s dns hosts" (glibc 2.36)');
  assert.deepEqual(oraculos.getent(q), []);
  let getents = 0;
  for (let i = 0; i < 600; i++) {
    const r = gen('dns-tool-cmd', `b04:${i}`);
    assert.deepEqual(oraculos.getent(r), [], `b04:${i}`);
    if (r.options.some((o) => o.t.includes('getent'))) getents++;
  }
  assert.ok(getents > 30);
});

// ---------------------------------------------------------------- B-05 (valores conferidos com o vim 9.0 real da imagem lpic1-lab)
const J = { k: 'J' }; const X = { k: 'x' };
const ins = (k, t) => ({ k, t });
const saida = (ls, ...toks) => viRun(ls, [...toks, { k: 'exit', how: 'x' }]).saved;
test('B-05: J do simulador do vi não duplica o espaço do fim da linha e posiciona o cursor como o vim', () => {
  const casos = [ // [linhas, tokens, resultado no vim real]
    [['fim ', 'oito'], [J], ['fim oito']], // o caso do achado
    [['fim', 'oito'], [J], ['fim oito']],
    [['fim', '   oito'], [J], ['fim oito']],
    [['fim ', '   oito'], [J], ['fim oito']],
    [['fim', ')oito'], [J], ['fim)oito']],
    [['fim', '\toito'], [J], ['fim oito']],
    [['fim\t', 'oito'], [J], ['fim\toito']],
    [['fim', '   '], [J], ['fim']],
    [['fim ', '   '], [J], ['fim ']],
    [['a ', 'b ', 'c'], [J, J], ['a b c']],
    [['fim ', 'oito', 'nove'], [J, X], ['fim ito', 'nove']], // cursor no início do texto juntado
    [['fim', 'oito', 'nove'], [J, X], ['fimoito', 'nove']], // cursor no espaço inserido
    [['fim', 'oito'], [J, ins('i', 'Q')], ['fimQ oito']],
    [['fim ', 'oito'], [J, ins('a', 'Q')], ['fim oQito']],
    [['um dois', 'tres'], [{ k: '$' }, J, X], ['um doistres']],
  ];
  for (const [ls, toks, esperado] of casos) assert.deepEqual(saida(ls, ...toks), esperado, `${JSON.stringify(ls)} ${toks.map(keysOf).join('')}`);
  assert.deepEqual(saida(['fim ', 'oito'], J), ['fim oito'], 'viRun([fim␠, oito], J) deve salvar "fim oito"');
});

test('B-05: vi-final-text viB:8988 — o gabarito tem um único espaço depois de J', () => {
  const q = gen('vi-final-text', 'viB:8988');
  assert.equal(q.options.find((o) => o.ok).t, '`mar sete tres / fim oito terra quatro / vento terra / nuvem sol`');
  assert.ok(!q.explanation.includes('fim  oito'));
  assert.deepEqual(oraculos.igual('mar sete tres / fim oito terra quatro / vento terra / nuvem sol')(q), []);
});

// ---------------------------------------------------------------- B-06
test('B-06: shs-type — as quatro combinações login/interatividade saem de `$-` e login_shell; `$0` não decide', () => {
  const vistas = new Set();
  const g = getGenerator('shs-type');
  for (let i = 0; i < 500; i++) {
    const q = g.make(makeRng(`b06:${i}`));
    assert.deepEqual(checkGenerated(q, g), [], `b06:${i}`);
    if (/echo "\$-"/.test(q.text)) { assert.deepEqual(oraculos.shellTipo(q), [], `b06:${i}`); vistas.add(q.options.find((o) => o.ok).t); }
    // nenhuma questão deste gerador infere a interatividade só pelo $0
    assert.ok(!/imprime `-?\w*bash`\. Que tipo de shell/.test(q.text), `b06:${i}: enunciado só com $0`);
  }
  assert.equal(vistas.size, 4, `combinações vistas: ${[...vistas].join(' | ')}`);
  // $0 = -bash pode ser interativo ou não: o caso do achado (login não interativo)
  const q = gen('shs-type', 'typeB:12');
  assert.match(q.text, /echo "\$0"\n-bash\n/);
  assert.equal(q.options.find((o) => o.ok).t, 'Shell não interativo de login');
});

// ---------------------------------------------------------------- B-07
test('B-07: fs-find-build reproB:14 descreve -mtime +3 como "pelo menos 4 dias completos"; -mtime +1 = pelo menos 48 h', () => {
  const q = gen('fs-find-build', 'reproB:14');
  assert.match(q.text, /há pelo menos 4 dias completos/);
  assert.ok(!/há mais de \d+ dias/.test(q.text + q.explanation));
  assert.ok(q.options.find((o) => o.ok).t.includes('-mtime +3'));
  assert.deepEqual(oraculos.findMtime(q), []);
  // todas as explicações dos geradores de find usam a redação nova (e nunca "mais de 24 h" para +1)
  for (const id of ['find-tools', 'fs-find-eval', 'fs-find-build']) {
    for (let i = 0; i < 300; i++) {
      const r = gen(id, `b07:${i}`);
      const tudo = `${r.text}\n${r.explanation}`;
      assert.ok(!/`\+1` seria mais de 24 h/.test(tudo), `${id} b07:${i}`);
      assert.ok(!/há mais de \d+ dias/.test(tudo), `${id} b07:${i}`);
      assert.deepEqual(oraculos.findMtime(r), [], `${id} b07:${i}`);
    }
  }
  // as mensagens fixas do find-tools (+1 = 48 h) aparecem quando a questão do -mtime -1 é sorteada
  let achou = false;
  for (let i = 0; i < 800 && !achou; i++) { const r = gen('find-tools', `b07y:${i}`); achou = r.explanation.includes('`-mtime +1` seleciona idades de pelo menos 48 h'); }
  assert.ok(achou, 'explicação corrigida do find-tools não apareceu em 800 sementes');
});

test('B-07: modelo do -mtime nos limites de 24 h / 48 h (idade em minutos; ⌊idade/1440⌋ compara com N)', async () => {
  const { ATOM } = await import('../src/generators/cmdline3.mjs');
  const ok = (sign, n, minutos) => ATOM.mtime(sign, n).ok({ age: minutos });
  // +1 = pelo menos 2 períodos completos: 36 h (2160 min) NÃO casa, 48 h (2880 min) casa
  assert.equal(ok('+', 1, 1440), false); assert.equal(ok('+', 1, 2160), false); assert.equal(ok('+', 1, 2879), false); assert.equal(ok('+', 1, 2880), true); assert.equal(ok('+', 1, 3600), true);
  // 1 = intervalo [1, 2) períodos: de 24 h (inclusive) a 48 h (exclusive)
  assert.equal(ok('', 1, 1439), false); assert.equal(ok('', 1, 1440), true); assert.equal(ok('', 1, 2879), true); assert.equal(ok('', 1, 2880), false);
  // -1 = menos de 1 período
  assert.equal(ok('-', 1, 1439), true); assert.equal(ok('-', 1, 1440), false);
  // o texto do critério acompanha o modelo
  assert.match(ATOM.mtime('+', 3).say, /pelo menos 4 dias completos/);
  assert.match(ATOM.mtime('', 3).say, /3 dia\(s\) completo\(s\).*até menos de 4/);
});

// ---------------------------------------------------------------- B-08
test('B-08: net-proto-facts não afirma "65.535 portas possíveis"; distingue 65.536 valores, 0 a 65535 e porta 0 reservada', () => {
  const q = gen('net-proto-facts', 'reproB:5');
  const fato = q.options.find((o) => o.ok && /16 bits/.test(o.t));
  assert.ok(fato, 'fato dos 16 bits deveria estar entre as corretas desta semente');
  assert.match(fato.t, /65\.536 valores/); assert.match(fato.t, /0 a 65535/); assert.match(fato.t, /0 é reservado/);
  assert.deepEqual(oraculos.portas(q), []);
  for (let i = 0; i < 300; i++) assert.deepEqual(oraculos.portas(gen('net-proto-facts', `b08:${i}`)), [], `b08:${i}`);
});

// ---------------------------------------------------------------- B-09: os oráculos pegam os DADOS ANTIGOS (fixtures em memória do que foi gerado antes das correções)
const Q = (type, text, options, extra = {}) => ({ type, text, options: options.map(([t, ok]) => ({ t, ok })), explanation: 'x'.repeat(40), ref: ['101:p.1'], ...extra });
test('B-09: fixtures pré-correção — checkGenerated aprova, mas o oráculo detecta a falha semântica', () => {
  const g = { obj: '109.2' };
  const casos = [
    ['B-02 gateway fora da /25', oraculos.redeConfig, Q('unica', 'Qual conteúdo configura a interface com `192.168.242.179/25` e gateway `192.168.242.1`?',
      [['`[Match]`\n`Name=enp3s5`\n`[Network]`\n`Address=192.168.242.179/25`\n`Gateway=192.168.242.1`', true], ['a', false], ['b', false], ['c', false]])],
    ['B-02 gateway "externo" dentro da /16', oraculos.redeDiagnostico, Q('unica', 'Host (interface `wlan0`, endereço `10.180.0.129/16`).\n\n```\n$ ip addr show dev wlan0\n    inet 10.180.0.129/16 brd 10.180.255.255 scope global wlan0\n$ ip route add default via 10.180.1.1\nError: Nexthop has invalid gateway.\n```\n',
      [['O gateway 10.180.1.1 está fora da sub-rede do host (10.180.0.129/16): usar um gateway dentro da mesma rede', true], ['a', false], ['b', false], ['c', false]])],
    ['B-03 at -r marcado como errado', oraculos.atRemocao, Q('unica', 'Qual comando **remove** o job `at` de número 37?', [['atrm 37', true], ['atq 37', false], ['at -c 37', false], ['at -r 37', false], ['rm 37', false]])],
    ['B-04 getent -s depois do banco marcado como errado', oraculos.getent, Q('unica', 'Qual comando realiza a tarefa abaixo?', [['`getent -s dns hosts intranet`', true], ['`getent -s files hosts intranet`', false], ['`getent hosts -s dns intranet`', false], ['`getent dns hosts intranet`', false]])],
    ['B-05 J com dois espaços', oraculos.igual('mar sete tres / fim oito terra quatro / vento terra / nuvem sol'), Q('unica', 'Qual o conteúdo do arquivo?', [['`mar sete tres / fim  oito terra quatro / vento terra / nuvem sol`', true], ['a', false], ['b', false], ['c', false]])],
    ['B-06 interatividade só por $0', oraculos.shellTipo, Q('unica', 'Em um shell, o comando `echo $0` imprime `-bash`. Que tipo de shell é esse?', [['Shell interativo de login', true], ['Shell interativo sem login', false], ['Shell não interativo de login', false], ['Shell não interativo sem login', false]])],
    ['B-07 "há mais de N dias"', oraculos.findMtime, Q('unica', 'Qual comando `find` lista:\n\n* foram modificados há mais de 3 dias\n', [["find . -type f -mtime +3 -name '*.pdf'", true], ["find . -mtime -3", false], ['find . -mtime 3', false], ['find . -mtime +4', false]])],
    ['B-08 65.535 portas possíveis', oraculos.portas, Q('multipla', 'Sobre portas TCP/UDP, marque todas as corretas.', [['O campo de porta tem 16 bits; por isso existem 65.535 portas possíveis.', true], ['O NTP usa o UDP por padrão.', true], ['a', false], ['b', false], ['c', false]])],
  ];
  for (const [nome, oraculo, q] of casos) {
    assert.deepEqual(checkGenerated(q, g), [], `${nome}: a fixture deveria ser estruturalmente válida`);
    assert.ok(oraculo(q).length > 0, `${nome}: o oráculo deveria detectar o defeito`);
  }
});

test('B-09: validador de cron independente (faixas, atalhos, nomes isolados, */0)', () => {
  const ok = ['0 5 * * * cmd', '*/15 * * * 1-5 cmd', '0 0 1 jan * cmd', '0 12 * * sun cmd', '@reboot cmd', '30 4 1,15 * 7 cmd'];
  const ruim = ['60 * * * * cmd', '0 24 * * * cmd', '0 0 0 * * cmd', '0 0 * 13 * cmd', '0 0 * * 8 cmd', '*/0 * * * * cmd', '0 * * janeiro * cmd', '0 * * * segunda cmd', '@nunca cmd'];
  for (const l of ok) assert.ok(cronLinhaValida(l), l);
  for (const l of ruim) assert.ok(!cronLinhaValida(l), l);
});

// ---------------------------------------------------------------- compatibilidade com o md() da interface (fs-glob: *no*, *tm*… eram lidos como itálico)
// Texto visível = HTML do md() sem as marcações. Importa o md() real da interface (app/public/js/util.js).
const visivel = (h) => String(h).replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const semMarcas = (t) => t.replace(/`([^`\n]+)`/g, '$1').replace(/\*\*(\S[^*]*?\S|\S)\*\*/g, '$1'); // crases e negrito intencional (**x**)
// O md() antigo da interface aplicava ênfase DENTRO do código (`*lo*` virava "lo"); o novo (WP-3) não. Os testes de renderização
// só valem com o novo: são pulados (e avisam) se o util.js presente ainda for o antigo. A parte estrutural (fs-glob entre crases) roda sempre.
async function carregarMd() {
  const { md } = await import('../public/js/util.js');
  return { md, novo: visivel(md('`*a*`', { inline: true })) === '*a*' };
}
test('md(): toda alternativa/resposta com "*" aparece na tela exatamente como foi gerada (globs entre crases, nunca itálico)', async (t) => {
  const { md, novo } = await carregarMd();
  if (!novo) return t.skip('util.js ainda tem o md() antigo (WP-3 não integrado)');
  const vistos = new Map();
  for (const g of generators) {
    for (let i = 0; i < 60; i++) {
      const q = g.make(makeRng(`md:${g.id}:${i}`));
      for (const t of [...(q.options ?? []).map((o) => o.t), ...(q.answers ?? [])]) {
        if (!String(t).includes('*')) continue;
        const v = visivel(md(t, { inline: true }));
        if (v !== semMarcas(t)) vistos.set(g.id, `md:${g.id}:${i}: "${t}" → "${v}"`);
      }
    }
  }
  assert.deepEqual([...vistos.values()], []);
});

test('fs-glob: alternativas de padrão ficam entre crases (e, com o md() novo, o texto renderizado é o glob original)', async () => {
  const { md, novo } = await carregarMd();
  let globs = 0;
  for (let i = 0; i < 300; i++) {
    const q = gen('fs-glob', `glob:${i}`);
    if (!/Qual padrão/.test(q.text)) continue;
    for (const o of q.options) {
      assert.match(o.t, /^`[^`]+`$/, `glob:${i}: alternativa fora de crases: ${o.t}`);
      if (novo) assert.equal(visivel(md(o.t, { inline: true })), o.t.slice(1, -1), `glob:${i}`);
      if (o.t.includes('*')) globs++;
    }
  }
  assert.ok(globs > 20, `poucos globs com * na amostra (${globs})`);
});

// ---------------------------------------------------------------- consistência com o conteúdo: a umask REMOVE bits (modo & ~umask), não "subtrai"
test('perms.mjs: nenhuma explicação gerada ensina que a umask é "subtraída"', () => {
  const alvo = generators.filter((g) => g.file === 'perms.mjs');
  assert.ok(alvo.length >= 3);
  let umask = 0;
  for (const g of alvo) {
    for (let i = 0; i < 80; i++) {
      const q = g.make(makeRng(`umask:${g.id}:${i}`));
      const tudo = `${q.text}\n${q.explanation}`;
      assert.ok(!/subtra/i.test(tudo), `${g.id} umask:${i}: fala em subtração`);
      assert.ok(!/666\s*[−-]\s*umask/i.test(tudo), `${g.id} umask:${i}: "666 − umask"`);
      if (/umask/i.test(q.explanation)) umask++;
    }
  }
  assert.ok(umask > 20);
  // e a explicação nova diz o que a umask faz
  assert.match(gen('umask-calc', 'umask:0').explanation, /remove\*\* os bits que estão ligados nela/);
});

test('geradores: amostra de 40 sementes por gerador — nenhuma exceção e nenhum make() lento (>1,5 s)', () => {
  for (const g of generators) {
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      const q = g.make(makeRng(`amostra:${g.id}:${i}`));
      assert.ok(performance.now() - t0 < 1500, `${g.id} amostra:${i} demorou`);
      assert.deepEqual(checkGenerated(q, g), [], `${g.id} amostra:${i}`);
    }
  }
});
