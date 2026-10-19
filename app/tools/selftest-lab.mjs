#!/usr/bin/env node
// Autoteste dos desafios do laboratório: para cada desafio e várias sorteios de parâmetros,
//   setup  -> check deve FALHAR (o cenário não pode vir resolvido)
//   solve  -> check deve PASSAR
//   setup  -> check deve FALHAR de novo (o setup reinicia o cenário)
// Requer o lab rodando com LAB_ALLOW_SOLVE=1. Rode dentro do container web:
//   LAB_ALLOW_SOLVE=1 docker compose up -d lab && docker compose exec web node tools/selftest-lab.mjs [--n=3] [--only=id]
import { loadChallenges, rollParams, render, labCall } from '../src/lab.mjs';
import { loadObjectives } from '../src/bank.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? '').split('=')[1] ?? d;
const N = Number(arg('n', 3));
const only = arg('only', '');
const objs = new Set(loadObjectives().objetivos.map((o) => o.code));
const challenges = loadChallenges().filter((c) => !only || only.split(',').includes(c.id));
if (!challenges.length) { console.log('nenhum desafio encontrado'); process.exit(1); }

let bad = 0;
const fail = (c, msg) => { bad++; console.log(`  ✗ ${c.id}: ${msg}`); };

for (const c of challenges) {
  console.log(`• ${c.id} (${c.obj}, nível ${c.nivel})`);
  // metadados
  if (!objs.has(c.obj)) fail(c, `objetivo inexistente ${c.obj}`);
  if (![1, 2, 3].includes(c.nivel)) fail(c, 'nivel deve ser 1, 2 ou 3');
  if (!c.titulo || !c.enunciado || c.enunciado.length < 60) fail(c, 'título/enunciado ausentes ou curtos');
  if (!(c.verifica ?? []).length) fail(c, 'faltou "verifica" (lista do que é conferido)');
  if ((c.dicas ?? []).length < 2) fail(c, 'precisa de ao menos 2 dicas progressivas');
  if (!c.solucao || c.solucao.length < 30) fail(c, 'solução ausente');
  const declared = new Set(Object.keys(c.params ?? {}));
  for (const field of ['enunciado', 'solucao']) {
    for (const m of String(c[field]).matchAll(/\{(\w+)\}/g)) if (!declared.has(m[1])) fail(c, `${field} usa {${m[1]}} sem declarar em params`);
  }
  for (const [k, spec] of Object.entries(c.params ?? {})) {
    if (!/^[a-z][a-z0-9_]*$/.test(k)) fail(c, `nome de parâmetro inválido: ${k}`);
    if (!spec.escolha && !spec.faixa) fail(c, `parâmetro ${k} sem escolha/faixa`);
    for (const v of spec.escolha ?? []) if (!/^[A-Za-z0-9_.@:+/-]{1,80}$/.test(String(v))) fail(c, `valor inválido em ${k}: ${v}`);
  }
  // execução
  for (let i = 0; i < N; i++) {
    const params = rollParams(c, `selftest-${i}`);
    const call = (a) => labCall(`/${a}`, { challenge: c.id, params });
    const s1 = await call('setup');
    if (!s1.ok) { fail(c, `setup falhou (${JSON.stringify(params)}): ${s1.erro ?? s1.output}`); continue; }
    const c1 = await call('check');
    if (c1.passed) fail(c, `o cenário já nasce resolvido (${JSON.stringify(params)})`);
    if (!c1.results?.length) fail(c, `check não imprimiu resultados OK|/FALHA| (saída: ${String(c1.output).slice(0, 200)})`);
    const sv = await call('solve');
    if (!sv.ok) { fail(c, `solve falhou: ${sv.erro ?? sv.output}`); continue; }
    const c2 = await call('check');
    if (!c2.passed) fail(c, `depois do solve o check não passou (${JSON.stringify(params)}): ${JSON.stringify(c2.results?.filter((r) => !r.ok))} ${String(c2.output).slice(0, 300)}`);
    await call('setup');
    const c3 = await call('check');
    if (c3.passed) fail(c, 'o setup não reiniciou o cenário (check passou logo após novo setup)');
    // textos renderizados sem placeholders sobrando
    for (const f of ['enunciado', 'solucao']) if (/\{\w+\}/.test(render(c[f], params))) fail(c, `${f} tem placeholder não resolvido`);
  }
}
console.log(bad ? `\n${bad} problema(s)` : `\n✓ ${challenges.length} desafio(s) OK (${N} sorteios cada)`);
process.exit(bad ? 1 : 0);
