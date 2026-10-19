import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(HERE).filter((f) => f.endsWith('.mjs') && f !== 'index.mjs' && f !== 'util.mjs').sort();

/** Todos os geradores registrados. Um arquivo quebrado é ignorado (e registrado em `loadErrors`), nunca derruba o app. */
export const generators = [];
export const loadErrors = [];
for (const f of files) {
  try {
    const mod = await import(pathToFileURL(join(HERE, f)).href);
    for (const g of mod.generators ?? []) {
      if (generators.some((x) => x.id === g.id)) { loadErrors.push({ file: f, msg: `gerador duplicado: ${g.id}` }); continue; }
      generators.push({ ...g, file: f });
    }
  } catch (e) {
    loadErrors.push({ file: f, msg: String(e.message || e) });
    console.error(`[geradores] ${f} ignorado: ${e.message}`);
  }
}

export const generatorsByObj = new Map();
for (const g of generators) {
  if (!generatorsByObj.has(g.obj)) generatorsByObj.set(g.obj, []);
  generatorsByObj.get(g.obj).push(g);
}
export const getGenerator = (id) => generators.find((g) => g.id === id);
