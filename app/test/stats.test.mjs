import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.mjs';
import { loadBank } from '../src/bank.mjs';
import { summary } from '../src/stats.mjs';

const bank = loadBank();
const NOW = new Date(2026, 5, 15, 14, 30).getTime(); // 15/06/2026, 14h30 locais
/** Meio-dia local de `back` dias antes de NOW, por calendário (não por múltiplos de 24 h). */
const noon = (back) => new Date(2026, 5, 15 - back, 12).getTime();
const streakOf = (db) => summary(db, { objetivos: bank.objetivos, topicos: {}, bank, now: NOW }).streak;

function seed(days) {
  const db = openDb(':memory:');
  const ins = db.prepare('INSERT INTO attempts(exam_id, idx, qid, obj, type, level, correct, ts) VALUES(?,?,?,?,?,?,?,?)');
  for (const d of days) ins.run('e', 0, `q${d}`, '103.4', 'unica', 1, 1, noon(d));
  return db;
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('sequência: 150 dias seguidos contam 150 (a janela de 120 dias só limita o que é exibido)', () => {
  const db = seed(range(0, 149));
  const s = summary(db, { objetivos: bank.objetivos, topicos: {}, bank, now: NOW });
  assert.equal(s.streak, 150);
  assert.ok(s.atividade.length <= 121, 'a atividade exibida continua limitada a 120 dias');
});

test('sequência: a primeira lacuna encerra a contagem', () => {
  assert.equal(streakOf(seed(range(0, 149).filter((d) => d !== 17))), 17);
  assert.equal(streakOf(seed(range(0, 4))), 5);
  // lacuna exatamente na fronteira de um lote de busca
  assert.equal(streakOf(seed(range(0, 240).filter((d) => d !== 120))), 120);
  assert.equal(streakOf(seed(range(0, 240).filter((d) => d !== 121))), 121);
});

test('sequência: sem atividade hoje, mas com ontem, mantém a tolerância (hoje ainda pode ser preenchido)', () => {
  assert.equal(streakOf(seed(range(1, 150))), 150);
  assert.equal(streakOf(seed(range(2, 40))), 0, 'ontem sem atividade: a sequência acabou');
  assert.equal(streakOf(seed([])), 0);
});

test('sequência: desafios do laboratório concluídos também contam, inclusive além da janela', () => {
  const db = seed(range(0, 99));
  const ins = db.prepare('INSERT INTO lab_runs(id, challenge, params, started, passed, passed_ts) VALUES(?,?,?,?,1,?)');
  for (const d of range(100, 139)) ins.run(`r${d}`, 'c', '{}', noon(d), noon(d));
  assert.equal(streakOf(db), 140);
});
