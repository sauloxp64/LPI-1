#!/usr/bin/env node
// Instancia cada gerador com várias sementes, valida a estrutura e confere os gabaritos
// contra ferramentas REAIS (bash/GNU coreutils) dentro da imagem do laboratório.
//   node tools/verify-generators.mjs [--n=40] [--only=id1,id2] [--no-docker] [--image=lpic-lab:latest]
import { spawnSync } from 'node:child_process';
import { generators } from '../src/generators/index.mjs';
import { checkGenerated } from '../src/gencheck.mjs';
import { loadObjectives } from '../src/bank.mjs';
import { makeRng } from '../src/rng.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? '').split('=')[1] ?? d;
const N = Number(arg('n', 40));
const only = arg('only', '') ? arg('only').split(',') : null;
const hasImage = (n) => spawnSync('docker', ['image', 'inspect', n], { stdio: 'ignore' }).status === 0;
const image = arg('image', ['lpic1-lab:latest', 'lpic-lab:latest'].find(hasImage) ?? 'lpic1-lab:latest'); // a imagem do compose ou a de desenvolvimento
const useDocker = !process.argv.includes('--no-docker');
const { outline } = loadObjectives();

let problems = 0;
const snippets = [];
const stats = {};
for (const g of generators) {
  if (only && !only.includes(g.id)) continue;
  stats[g.id] = { ok: 0, bad: 0, verified: 0 };
  for (let i = 1; i <= N; i++) {
    const seed = `verify:${g.id}:${i}`;
    let q;
    try { q = g.make(makeRng(seed)); } catch (e) {
      console.log(`✗ ${g.id} seed=${seed}: exceção ${e.message}`); stats[g.id].bad++; problems++; continue;
    }
    const issues = checkGenerated(q, g, outline);
    if (issues.length) { console.log(`✗ ${g.id} seed=${seed}: ${issues.join('; ')}`); stats[g.id].bad++; problems++; continue; }
    stats[g.id].ok++;
    if (q.verify) snippets.push({ g: g.id, seed, ...q.verify });
  }
}

if (useDocker && snippets.length) {
  let script = 'export LC_ALL=C\n';
  snippets.forEach((s, i) => {
    script += `v_${i}() {\n${s.sh}\n}\necho "@@BEGIN ${i}"; ( cd /tmp; v_${i} ) 2>&1 </dev/null; echo "@@END ${i}"\n`;
  });
  const r = spawnSync('docker', ['run', '--rm', '-i', '-u', 'aluno', image, 'bash', '-c', 'cat > /tmp/run.sh; bash /tmp/run.sh'], { input: script, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 && !r.stdout) { console.log('docker falhou:', r.stderr); process.exit(2); }
  const out = new Map();
  for (const m of r.stdout.matchAll(/@@BEGIN (\d+)\n([\s\S]*?)@@END \1\n/g)) out.set(Number(m[1]), m[2].replace(/\n$/, ''));
  snippets.forEach((s, i) => {
    const got = out.get(i);
    stats[s.g].verified++;
    if (got === undefined || got.trim() !== String(s.expect).trim()) {
      problems++; stats[s.g].bad++;
      console.log(`✗ ${s.g} seed=${s.seed}\n    esperado: ${JSON.stringify(s.expect)}\n    obtido:   ${JSON.stringify(got)}\n    script:   ${s.sh.replace(/\n/g, ' ; ').slice(0, 200)}`);
    }
  });
} else if (snippets.length) {
  console.log(`(${snippets.length} verificações Docker puladas)`);
}

console.log('\ngerador'.padEnd(26) + 'ok   ruins  verificadas-no-docker');
for (const [id, s] of Object.entries(stats)) console.log(`${id.padEnd(25)} ${String(s.ok).padStart(3)} ${String(s.bad).padStart(5)}  ${s.verified}`);
console.log(problems ? `\n${problems} problema(s)` : `\n✓ ${generators.length} geradores, ${N} sementes cada — tudo certo`);
process.exit(problems ? 1 : 0);
