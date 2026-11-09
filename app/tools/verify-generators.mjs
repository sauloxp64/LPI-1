#!/usr/bin/env node
// Instancia cada gerador com várias sementes, valida a estrutura e confere os gabaritos
// contra ferramentas REAIS (bash/GNU coreutils) dentro da imagem do laboratório.
//   node tools/verify-generators.mjs [--n=40] [--only=id1,id2] [--no-docker] [--image=lpic-lab:latest]
// Saída: 0 = tudo certo · 1 = problemas nos geradores · 2 = uso inválido / Docker indisponível
// (nunca "tudo certo" sem ter verificado nada: N inválido, --only desconhecido ou seleção vazia viram erro 2).
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { generators } from '../src/generators/index.mjs';
import { checkGenerated } from '../src/gencheck.mjs';
import { loadObjectives } from '../src/bank.mjs';
import { makeRng } from '../src/rng.mjs';
import { regressoes, rodarRegressoes } from './regressoes.mjs';

const OPCOES = new Set(['n', 'only', 'image', 'no-docker']);

/** Lê e valida os argumentos. Devolve { erro } em vez de seguir com valores sem sentido. */
export function parseArgs(argv, ids = generators.map((g) => g.id)) {
  const o = {};
  for (const a of argv) {
    const m = a.match(/^--([\w-]+)(?:=([\s\S]*))?$/);
    if (!m || !OPCOES.has(m[1])) return { erro: `argumento desconhecido: ${a}` };
    if (m[1] === 'no-docker' ? m[2] !== undefined : m[2] === undefined) return { erro: `uso incorreto de --${m[1]}` };
    o[m[1]] = m[2] ?? true;
  }
  const raw = o.n ?? '40';
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n) || n < 1) return { erro: `--n deve ser um inteiro positivo (recebido "${raw}")` };
  let only = null;
  if (o.only !== undefined) {
    only = o.only.split(',').map((s) => s.trim()).filter(Boolean);
    if (!only.length) return { erro: '--only vazio: nenhum gerador selecionado' };
    const desconhecidos = only.filter((id) => !ids.includes(id));
    if (desconhecidos.length) return { erro: `gerador(es) desconhecido(s) em --only: ${desconhecidos.join(', ')}` };
  }
  return { n, only, image: o.image ?? null, useDocker: !o['no-docker'] };
}

/**
 * Executa a verificação. `deps` existe para os testes (gerar sem Docker, espiar subprocessos).
 * Devolve o código de saída.
 */
export function main(argv = process.argv.slice(2), deps = {}) {
  const {
    spawn = spawnSync, gens = generators, out = console.log,
    outline = loadObjectives().outline, rngFactory = makeRng, casos = regressoes,
  } = deps;
  const args = parseArgs(argv, gens.map((g) => g.id));
  if (args.erro) { out(`erro: ${args.erro}`); return 2; }
  const { n: N, only, useDocker } = args;
  const selected = gens.filter((g) => !only || only.includes(g.id));
  if (!selected.length) { out('erro: nenhum gerador selecionado'); return 2; }

  let problems = 0;
  let generated = 0;
  const snippets = [];
  const stats = {};
  for (const g of selected) {
    stats[g.id] = { ok: 0, bad: 0, verified: 0, sem: 0 };
    for (let i = 1; i <= N; i++) {
      const seed = `verify:${g.id}:${i}`;
      let q;
      generated++;
      try { q = g.make(rngFactory(seed)); } catch (e) {
        out(`✗ ${g.id} seed=${seed}: exceção ${e.message}`); stats[g.id].bad++; problems++; continue;
      }
      const issues = checkGenerated(q, g, outline);
      if (issues.length) { out(`✗ ${g.id} seed=${seed}: ${issues.join('; ')}`); stats[g.id].bad++; problems++; continue; }
      stats[g.id].ok++;
      if (q.verify) snippets.push({ g: g.id, seed, ...q.verify }); else stats[g.id].sem++;
    }
  }

  // regressões conhecidas (B-01…B-08): gerador+ramo+semente fixos, conferidos por oráculos independentes; os fatos do mundo real (docker) entram no mesmo contêiner
  const selecionadas = casos.filter((c) => selected.some((g) => g.id === c.gerador));
  const fatos = [];
  const falhas = rodarRegressoes({ getGenerator: (id) => gens.find((g) => g.id === id), makeRng: rngFactory, outline, casos: selecionadas, coletarDocker: fatos });
  for (const f of falhas) { problems++; stats[f.caso.gerador].bad++; out(`✗ regressão ${f.caso.achado} ${f.caso.gerador} semente=${f.caso.semente} (${f.caso.ramo}): ${f.problemas.join('; ')}`); }
  snippets.push(...fatos.map((f) => ({ ...f, g: f.gerador, seed: `${f.achado}:${f.semente}` })));

  let verified = 0; let fatosVerificados = 0;
  if (useDocker && snippets.length) {
    // a imagem só é procurada quando o Docker vai ser usado (--no-docker não toca no Docker)
    const hasImage = (nome) => spawn('docker', ['image', 'inspect', nome], { stdio: 'ignore' }).status === 0;
    const image = args.image ?? ['lpic1-lab:latest', 'lpic-lab:latest'].find(hasImage) ?? 'lpic1-lab:latest'; // a imagem do compose ou a de desenvolvimento
    let script = 'export LC_ALL=C\n';
    snippets.forEach((s, i) => {
      script += `v_${i}() {\n${s.sh}\n}\necho "@@BEGIN ${i}"; ( cd /tmp; v_${i} ) 2>&1 </dev/null; echo "@@END ${i}"\n`;
    });
    // contêiner descartável (--rm) e sem volumes do host: só roda os scripts dos geradores. Fica na rede padrão de propósito:
    // `--network none` quebra verificadores legítimos (sudo precisa resolver o hostname; ip-cmd usa a interface eth0).
    const r = spawn('docker', ['run', '--rm', '-i', '-u', 'aluno', image, 'bash', '-c', 'cat > /tmp/run.sh; bash /tmp/run.sh'], { input: script, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0 && !r.stdout) { out(`docker falhou: ${r.stderr || r.error?.message || `status ${r.status}`}`); return 2; }
    const porIndice = new Map();
    for (const m of r.stdout.matchAll(/@@BEGIN (\d+)\n([\s\S]*?)@@END \1\n/g)) porIndice.set(Number(m[1]), m[2].replace(/\n$/, ''));
    snippets.forEach((s, i) => {
      const got = porIndice.get(i);
      if (s.achado) fatosVerificados++; else { stats[s.g].verified++; verified++; }
      const igual = got !== undefined && (s.exato ? got === String(s.expect) : got.trim() === String(s.expect).trim()); // exato: whitespace faz parte da resposta (vi, por ex.)
      if (!igual) {
        problems++; stats[s.g].bad++;
        out(`✗ ${s.g} seed=${s.seed}\n    esperado: ${JSON.stringify(s.expect)}\n    obtido:   ${JSON.stringify(got)}\n    script:   ${s.sh.replace(/\n/g, ' ; ').slice(0, 200)}`);
      }
    });
  } else if (snippets.length) {
    out(`(${snippets.length} verificações Docker puladas)`);
  }

  out('\ngerador'.padEnd(26) + 'ok   ruins  verificadas-no-docker  sem-script');
  for (const [id, s] of Object.entries(stats)) out(`${id.padEnd(25)} ${String(s.ok).padStart(3)} ${String(s.bad).padStart(5)}  ${String(s.verified).padEnd(21)} ${s.sem}`);
  // níveis de confiança do relatório: (1) estrutura válida, (2) com script conferido na ferramenta real, (3) regressões conhecidas com oráculo
  const semScript = Object.values(stats).reduce((a, s) => a + s.sem, 0);
  out(`\n${generated} geração(ões) em ${selected.length} gerador(es): ${semScript} só com validação estrutural (sem script de verificação), ${verified} conferida(s) por script${useDocker ? ' no Docker' : ' (puladas: --no-docker)'}`);
  out(`regressões conhecidas: ${selecionadas.length - falhas.length}/${selecionadas.length} passaram nos oráculos${fatos.length ? `; ${fatosVerificados}/${fatos.length} fato(s) do mundo real conferido(s) no Docker${useDocker ? '' : ' (pulados: --no-docker)'}` : ''}`);
  out(problems ? `${problems} problema(s)` : `✓ ${selected.length} geradores, ${N} sementes cada — tudo certo`);
  return problems ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
