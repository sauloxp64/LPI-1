// Manifesto de regressão dos geradores (achados B-01 … B-08 da auditoria): cada caso fixa gerador + ramo + semente
// e traz um ORÁCULO independente do código do gerador (parser/aritmética próprios) que confere a propriedade que
// já foi violada. `checkGenerated()` só olha a estrutura; os oráculos olham o conteúdo.
// Usado por test/regressoes.test.mjs e por tools/verify-generators.mjs (que também roda os fatos `docker`, no mesmo
// contêiner descartável dos demais scripts).
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';
import { checkGenerated } from '../src/gencheck.mjs';

// ------------------------------------------------------------------ geração com prazo (B-01: laço síncrono infinito)
const WORKER_SRC = `
const { workerData } = require('node:worker_threads');
(async () => {
  const { port, flag, idx, rng, id, seeds } = workerData;
  try {
    const { getGenerator } = await import(idx); const { makeRng } = await import(rng);
    port.postMessage({ qs: seeds.map((s) => getGenerator(id).make(makeRng(s))) });
  } catch (e) { port.postMessage({ erro: String(e && e.message || e) }); }
  Atomics.store(flag, 0, 1); Atomics.notify(flag, 0);
})();`;
/**
 * Gera `make(makeRng(semente))` para cada semente num Worker e desiste depois de `ms`: um laço síncrono num gerador
 * não pode travar o chamador (nem um timeout assíncrono o interromperia). Síncrono. -> { qs } | { travou } | { erro }
 */
export function amostrarComPrazo(id, seeds, ms = 4000) {
  const flag = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  const w = new Worker(WORKER_SRC, {
    eval: true, transferList: [port2],
    workerData: { port: port2, flag, id, seeds, idx: new URL('../src/generators/index.mjs', import.meta.url).href, rng: new URL('../src/rng.mjs', import.meta.url).href },
  });
  try {
    if (Atomics.wait(flag, 0, 0, ms) === 'timed-out') return { travou: true };
    return receiveMessageOnPort(port1)?.message ?? { erro: 'sem resposta do worker' };
  } finally { w.terminate(); port1.close(); }
}
/** Uma semente só: -> { q } | { travou } | { erro } */
export function gerarComPrazo(id, seed, ms = 4000) {
  const r = amostrarComPrazo(id, [seed], ms);
  return r.qs ? { q: r.qs[0] } : r;
}

// ------------------------------------------------------------------ utilidades dos oráculos (independentes dos helpers dos geradores)
const ipn = (s) => s.split('.').reduce((a, o) => a * 256 + Number(o), 0);
const bloco = (ip, p) => Math.floor(ipn(ip) / 2 ** (32 - p)); // identifica a sub-rede
const nomes = (q) => q.options.map((o) => o.t.replace(/`/g, ''));
const certa = (q) => q.options.find((o) => o.ok);

/** Host utilizável (nem rede nem broadcast) e gateway na MESMA sub-rede, diferente do host. */
export function gatewayCoerente(host, pfx, gw) {
  const p = [];
  const sz = 2 ** (32 - pfx); const net = Math.floor(ipn(host) / sz) * sz;
  if (ipn(host) === net || ipn(host) === net + sz - 1) p.push(`host ${host}/${pfx} é endereço de rede/broadcast`);
  if (bloco(gw, pfx) !== bloco(host, pfx)) p.push(`gateway ${gw} fora da sub-rede de ${host}/${pfx}`);
  if (gw === host) p.push('gateway igual ao host');
  return p;
}

const MESES = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const SEMANA = 'sun mon tue wed thu fri sat'.split(' ');
function campoCron(f, lo, hi, nomesOk = null) {
  if (nomesOk && nomesOk.includes(f.toLowerCase())) return true; // o crontab aceita nomes isolados (não em listas/faixas)
  return f.split(',').every((parte) => {
    const m = parte.match(/^([^/]+)(?:\/(\d+))?$/);
    if (!m || (m[2] !== undefined && Number(m[2]) < 1)) return false;
    if (m[1] === '*') return true;
    const ext = m[1].split('-');
    return ext.length <= 2 && ext.every((x) => /^\d+$/.test(x) && Number(x) >= lo && Number(x) <= hi);
  });
}
/** Linha de crontab de usuário aceita? (5 campos ou @atalho, mais o comando) */
export function cronLinhaValida(linha) {
  const t = linha.trim().split(/\s+/);
  if (t[0].startsWith('@')) return ['@reboot', '@hourly', '@daily', '@midnight', '@weekly', '@monthly', '@yearly', '@annually'].includes(t[0]) && t.length > 1;
  return t.length > 5 && campoCron(t[0], 0, 59) && campoCron(t[1], 0, 23) && campoCron(t[2], 1, 31) && campoCron(t[3], 1, 12, MESES) && campoCron(t[4], 0, 7, SEMANA);
}

// ------------------------------------------------------------------ oráculos
export const oraculos = {
  /** B-01/cron: cada alternativa marcada coerentemente com a validade real da linha (unica = aceita; multipla = rejeitada). */
  cron(q) {
    const p = [];
    for (const o of q.options) {
      const valida = cronLinhaValida(o.t.replace(/`/g, ''));
      if ((q.type === 'multipla' ? !valida : valida) !== o.ok) p.push(`"${o.t}" ${valida ? 'é válida' : 'é inválida'}, mas ok=${o.ok}`);
    }
    return p;
  },
  /** B-02/ifupdown-networkd: host utilizável e gateway dentro da sub-rede (endereço/prefixo e gateway lidos da alternativa correta). */
  redeConfig(q) {
    const t = certa(q).t.replace(/`/g, '');
    const a = t.match(/(\d+\.\d+\.\d+\.\d+)\/(\d+)/); const g = t.match(/[Gg]ateway[= ](\d+\.\d+\.\d+\.\d+)/);
    if (!a || !g) return ['alternativa correta sem endereço/prefixo/gateway reconhecíveis'];
    return gatewayCoerente(a[1], Number(a[2]), g[1]);
  },
  /** B-02/net-troubleshoot: "gateway fora da sub-rede" só se estiver mesmo fora; o host nunca é rede/broadcast. */
  redeDiagnostico(q) {
    const p = [];
    const a = q.text.match(/inet (\d+\.\d+\.\d+\.\d+)\/(\d+)/) ?? q.text.match(/endereço `?(\d+\.\d+\.\d+\.\d+)\/(\d+)/);
    if (!a) return p;
    const sz = 2 ** (32 - Number(a[2])); const net = Math.floor(ipn(a[1]) / sz) * sz;
    if (ipn(a[1]) === net || ipn(a[1]) === net + sz - 1) p.push(`host ${a[1]}/${a[2]} é endereço de rede/broadcast`);
    const via = q.text.match(/via (\d+\.\d+\.\d+\.\d+)/);
    if (via && /fora da sub-rede/.test(certa(q).t)) {
      if (bloco(via[1], Number(a[2])) === bloco(a[1], Number(a[2]))) p.push(`gateway ${via[1]} está DENTRO de ${a[1]}/${a[2]}, mas a resposta diz que está fora`);
    }
    return p;
  },
  /** B-03: nenhum alias de remoção (atrm N, at -d N, at -r N) pode estar marcado como errado. */
  atRemocao(q) {
    if (!/remove\*\* o job/.test(q.text)) return [];
    return q.options.filter((o) => /^(atrm|at -[dr]) \d+$/.test(o.t.trim()) && !o.ok).map((o) => `"${o.t}" remove o job, mas está marcada como errada`);
  },
  /** B-04: o getent aceita opções antes ou depois do banco; exatamente uma alternativa equivale à correta. */
  getent(q) {
    const sem = (cmd) => {
      const t = cmd.replace(/`/g, '').trim().split(/\s+/); if (t[0] !== 'getent') return null;
      let s = null; const pos = [];
      for (let i = 1; i < t.length; i++) { if (t[i] === '-s') s = t[++i]; else if (t[i].startsWith('-')) return null; else pos.push(t[i]); }
      return `${s}|${pos.join(' ')}`;
    };
    const alvo = sem(certa(q).t);
    if (!alvo) return [];
    const iguais = q.options.filter((o) => sem(o.t) === alvo);
    return iguais.length === 1 ? [] : [`${iguais.length} alternativas equivalem à correta: ${iguais.map((o) => o.t).join(' | ')}`];
  },
  /** B-05: resultado final do vi conferido com um valor obtido no vim real. */
  igual: (esperado) => (q) => (certa(q).t.replace(/`/g, '') === esperado ? [] : [`gabarito "${certa(q).t}" difere do vim real "${esperado}"`]),
  /** B-06: a classificação sai de `$-` (letra i) e de login_shell, não de `$0`. */
  shellTipo(q) {
    const m = q.text.match(/echo "\$-"\n(\w+)\nshopt -q login_shell && echo login \|\| echo nologin\n(\w+)/);
    if (!m) return ['evidência insuficiente: faltam `$-` e login_shell no enunciado'];
    const esperado = `Shell ${/i/.test(m[1]) ? '' : 'não '}interativo ${m[2] === 'login' ? 'de login' : 'sem login'}`;
    return certa(q).t === esperado ? [] : [`gabarito "${certa(q).t}" ≠ "${esperado}" (de $-=${m[1]}, ${m[2]})`];
  },
  /** B-07: o critério em texto bate com o -mtime do comando correto. */
  findMtime(q) {
    const p = [];
    const cmd = certa(q).t; const mt = cmd.match(/-mtime ([+-]?)(\d+)/);
    if (/há mais de \d+ dias/.test(q.text)) p.push('texto antigo "há mais de N dias" para -mtime');
    if (!mt) return p;
    const n = Number(mt[2]);
    const dizMais = q.text.match(/há pelo menos (\d+) dias completos/); const dizUlt = q.text.match(/nos últimos (\d+) dias/); const dizIgual = q.text.match(/há (\d+) dia\(s\) completo/);
    if (mt[1] === '+' && dizMais && Number(dizMais[1]) !== n + 1) p.push(`-mtime +${n} descrito como "pelo menos ${dizMais[1]} dias completos" (esperado ${n + 1})`);
    if (mt[1] === '-' && dizUlt && Number(dizUlt[1]) !== n) p.push(`-mtime -${n} descrito como "últimos ${dizUlt[1]} dias"`);
    if (mt[1] === '' && dizIgual && Number(dizIgual[1]) !== n) p.push(`-mtime ${n} descrito como "${dizIgual[1]} dias"`);
    if (mt[1] === '+' && !dizMais && /mtime/.test(cmd)) p.push('-mtime +N sem a descrição "pelo menos N+1 dias completos"');
    return p;
  },
  /** B-08: ninguém afirma "65.535 portas possíveis" como verdade. */
  portas(q) {
    return q.options.filter((o) => o.ok && /65\.?535 portas poss/.test(o.t)).map((o) => `afirmação falsa marcada correta: "${o.t}"`);
  },
};

// ------------------------------------------------------------------ o manifesto
// `semente`: usada em getGenerator(gerador).make(makeRng(semente)). `ramo`: o que a semente exercita. `prazo`: gerar num Worker com limite.
// `docker(q)` (opcional): fato do mundo real conferido pelo verify-generators no contêiner descartável -> { sh, expect }.
const py = (src) => `python3 -I - <<'PYEOF'\n${src}\nPYEOF`;
export const regressoes = [
  { achado: 'B-01', gerador: 'cron-linha-valida', ramo: 'multipla: três linhas "boas", duas iguais a @reboot', semente: 'hangB:21922', prazo: true, oraculo: oraculos.cron },
  { achado: 'B-02', gerador: 'ifupdown-networkd', ramo: 'nd-static, /25 com host em .179 (sub-rede .128/25)', semente: 'reproB:10', oraculo: oraculos.redeConfig,
    docker: (q) => { const t = certa(q).t.replace(/`/g, ''); const a = t.match(/(\d+\.\d+\.\d+\.\d+\/\d+)/)[1]; const g = t.match(/[Gg]ateway[= ](\d+\.\d+\.\d+\.\d+)/)[1];
      return { sh: py(`import ipaddress as I\ni = I.ip_interface('${a}'); g = I.ip_address('${g}')\nprint(g in i.network and g != i.ip and i.ip not in (i.network.network_address, i.network.broadcast_address))`), expect: 'True' }; } },
  { achado: 'B-02', gerador: 'ifupdown-networkd', ramo: 'static (/etc/network/interfaces), /25 com host em .175', semente: 'reproB:97', oraculo: oraculos.redeConfig },
  { achado: 'B-02', gerador: 'net-troubleshoot', ramo: 'gw: gateway "fora da sub-rede" com /16', semente: 'reproB:3', oraculo: oraculos.redeDiagnostico,
    docker: (q) => { const a = q.text.match(/inet (\d+\.\d+\.\d+\.\d+\/\d+)/)[1]; const v = q.text.match(/via (\d+\.\d+\.\d+\.\d+)/)[1];
      return { sh: py(`import ipaddress as I\nprint(I.ip_address('${v}') in I.ip_interface('${a}').network)`), expect: 'False' }; } },
  { achado: 'B-03', gerador: 'at-comandos', ramo: 'remover o job 37 (atrm / at -d / at -r)', semente: 'reproB:54', oraculo: oraculos.atRemocao,
    docker: () => ({ sh: 'echo date > /tmp/zzat.sh; for op in atrm "at -d" "at -r"; do at -f /tmp/zzat.sh now + 1 hour >/dev/null 2>&1; j=$(atq | cut -f1 | head -1); $op $j; echo "$op:$(atq | wc -l)"; done; rm -f /tmp/zzat.sh', expect: 'atrm:0\nat -d:0\nat -r:0' }) },
  { achado: 'B-04', gerador: 'dns-tool-cmd', ramo: 'getent: resolver somente pela fonte dns', semente: 'reproB:0', oraculo: oraculos.getent,
    docker: () => ({ sh: 'a=$(getent -s files hosts localhost; echo rc=$?); b=$(getent hosts -s files localhost; echo rc=$?); [ "$a" = "$b" ] && echo equivalentes || echo diferentes', expect: 'equivalentes' }) },
  { achado: 'B-05', gerador: 'vi-final-text', ramo: 'ofim x1<Esc>x2xJ: J depois de linha que termina em espaço', semente: 'viB:8988', oraculo: oraculos.igual('mar sete tres / fim oito terra quatro / vento terra / nuvem sol') },
  { achado: 'B-06', gerador: 'shs-type', ramo: 'diag: login interativo ($0=-bash, $-=himBHs)', semente: 'typeB:5', oraculo: oraculos.shellTipo },
  { achado: 'B-06', gerador: 'shs-type', ramo: 'diag: login NÃO interativo com $0=-bash e $-=hBc (sem i)', semente: 'typeB:12', oraculo: oraculos.shellTipo },
  { achado: 'B-06', gerador: 'shs-type', ramo: 'diag: sem login interativo', semente: 'typeB:45', oraculo: oraculos.shellTipo },
  { achado: 'B-06', gerador: 'shs-type', ramo: 'diag: sem login não interativo', semente: 'typeB:28', oraculo: oraculos.shellTipo },
  { achado: 'B-07', gerador: 'fs-find-build', ramo: '-mtime +3 descrito como "pelo menos 4 dias completos"', semente: 'reproB:14', oraculo: oraculos.findMtime,
    docker: () => ({ sh: 'cd "$(mktemp -d)"; touch -d "36 hours ago" a36; touch -d "60 hours ago" a60; echo "$(find . -type f -mtime +1 | sort | paste -s -d" " -)"', expect: './a60' }) },
  // achados da amostragem ampla (230 mil gerações): exceções raras (~1 em 1000 sementes) que o motor de provas só contornava com nova tentativa
  { achado: 'ROB', gerador: 'grep-lines', ramo: 'linhas: viradas aleatórias repetidas deixavam menos de 3 distratores', semente: 'big:grep-lines:466', oraculo: () => [] },
  { achado: 'ROB', gerador: 'cl-var-scope', ramo: 'amostragem por rejeição esgotava as 80 tentativas', semente: 'big:cl-var-scope:788', oraculo: () => [] },
  { achado: 'B-08', gerador: 'net-proto-facts', ramo: 'multipla: fato sobre os 16 bits do campo de porta', semente: 'reproB:5', oraculo: oraculos.portas },
];

/**
 * Executa os casos (filtrados por gerador, se `ids` vier). Devolve [{ caso, problemas }] só dos que falharam.
 * `gerar(id, seed, prazo)` -> { q } | { travou } | { erro }; por padrão: Worker se `prazo`, senão direto.
 */
export function rodarRegressoes({ getGenerator, makeRng, outline = null, ids = null, casos = regressoes, coletarDocker = null }) {
  const falhas = [];
  for (const caso of casos) {
    if (ids && !ids.includes(caso.gerador)) continue;
    const g = getGenerator(caso.gerador);
    const problemas = [];
    if (!g) problemas.push('gerador não existe');
    else {
      let r;
      if (caso.prazo) r = gerarComPrazo(caso.gerador, caso.semente);
      else { try { r = { q: g.make(makeRng(caso.semente)) }; } catch (e) { r = { erro: e.message }; } }
      if (r.travou) problemas.push('make() não terminou no prazo (laço infinito?)');
      else if (r.erro) problemas.push(`exceção: ${r.erro}`);
      else {
        problemas.push(...checkGenerated(r.q, g, outline), ...caso.oraculo(r.q));
        if (coletarDocker && caso.docker) coletarDocker.push({ achado: caso.achado, gerador: caso.gerador, semente: caso.semente, ...caso.docker(r.q) });
      }
    }
    if (problemas.length) falhas.push({ caso, problemas });
  }
  return falhas;
}
