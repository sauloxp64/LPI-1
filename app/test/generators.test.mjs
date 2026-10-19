import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generators, loadErrors } from '../src/generators/index.mjs';
import { checkGenerated } from '../src/gencheck.mjs';
import { loadObjectives } from '../src/bank.mjs';
import { makeRng } from '../src/rng.mjs';

const { outline, objetivos } = loadObjectives();

test('nenhum arquivo de gerador falhou ao carregar', () => {
  assert.deepEqual(loadErrors, []);
});

test('ids únicos e objetivos válidos', () => {
  const ids = generators.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  const codes = new Set(objetivos.map((o) => o.code));
  for (const g of generators) {
    assert.ok(codes.has(g.obj), `${g.id}: objetivo ${g.obj} inexistente`);
    assert.ok([1, 2, 3].includes(g.nivel), `${g.id}: nivel inválido`);
  }
});

test('cada gerador produz questões estruturalmente válidas em 30 sementes', () => {
  for (const g of generators) {
    for (let i = 0; i < 30; i++) {
      const q = g.make(makeRng(`unit:${g.id}:${i}`));
      const issues = checkGenerated(q, g, outline);
      assert.deepEqual(issues, [], `${g.id} semente ${i}: ${issues.join('; ')}`);
    }
  }
});

test('mesma semente produz a mesma questão; sementes diferentes variam', () => {
  for (const g of generators) {
    const a = JSON.stringify(g.make(makeRng('s1')));
    const b = JSON.stringify(g.make(makeRng('s1')));
    assert.equal(a, b, `${g.id} não é determinístico`);
  }
  // pelo menos 80% dos geradores variam o texto entre 12 sementes
  let varied = 0;
  for (const g of generators) {
    const texts = new Set(Array.from({ length: 12 }, (_, i) => g.make(makeRng(`v${i}`)).text));
    if (texts.size >= 4) varied++;
  }
  assert.ok(varied / generators.length >= 0.8, `só ${varied}/${generators.length} geradores variam de verdade`);
});
