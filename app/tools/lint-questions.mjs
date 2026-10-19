#!/usr/bin/env node
// Valida o banco de questões. Uso: node tools/lint-questions.mjs [arquivo.txt ...] [--quiet] [--cobertura]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseQuestions, lintQuestions } from '../src/qformat.mjs';
import { loadBank, loadObjectives } from '../src/bank.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const paths = args.filter((a) => !a.startsWith('--'));
const { objetivos, outline } = loadObjectives();
const ctx = { objectives: new Set(objetivos.map((o) => o.code)), outline };

let questions; let errors; let warnings;
if (paths.length) {
  questions = []; errors = []; warnings = [];
  for (const p of paths) {
    const r = parseQuestions(readFileSync(p, 'utf8'), basename(p));
    questions.push(...r.questions); errors.push(...r.errors);
  }
  const l = lintQuestions(questions, ctx);
  errors.push(...l.errors); warnings.push(...l.warnings);
} else {
  const b = loadBank();
  questions = b.all; errors = b.errors; warnings = b.warnings;
}

const fmt = (e) => `  ${e.file}:${e.line}${e.id && e.id !== '-' ? ` [${e.id}]` : ''} ${e.msg}`;
if (errors.length) { console.log(`\x1b[31m${errors.length} ERRO(S)\x1b[0m`); errors.forEach((e) => console.log(fmt(e))); }
if (warnings.length && !flags.has('--quiet')) { console.log(`\x1b[33m${warnings.length} aviso(s)\x1b[0m`); warnings.forEach((e) => console.log(fmt(e))); }

const META = { 1: 10, 2: 14, 3: 20, 4: 26, 5: 32 };
const by = {};
for (const q of questions) {
  const o = (by[q.obj] ??= { n: 0, unica: 0, multipla: 0, lacuna: 0, l1: 0, l2: 0, l3: 0 });
  o.n++; o[q.type]++; o[`l${q.level}`]++;
}
if (paths.length === 0 || flags.has('--cobertura')) {
  console.log('\nobjetivo  peso  total/meta  unica multi lacuna   N1 N2 N3');
  let tot = 0; let faltam = 0;
  for (const o of objetivos) {
    const s = by[o.code] ?? { n: 0, unica: 0, multipla: 0, lacuna: 0, l1: 0, l2: 0, l3: 0 };
    const meta = META[o.peso];
    tot += s.n; if (s.n < meta) faltam += meta - s.n;
    const flag = s.n >= meta ? '✓' : s.n === 0 ? '✗' : '…';
    console.log(`${o.code.padEnd(8)}  ${String(o.peso).padStart(3)}   ${String(s.n).padStart(3)}/${String(meta).padEnd(3)} ${flag}  ${String(s.unica).padStart(4)} ${String(s.multipla).padStart(5)} ${String(s.lacuna).padStart(6)}   ${String(s.l1).padStart(2)} ${String(s.l2).padStart(2)} ${String(s.l3).padStart(2)}`);
  }
  console.log(`total: ${tot} questões${faltam ? ` · faltam ${faltam} para a meta mínima` : ' · meta mínima atingida'}`);
} else {
  console.log(`\n${questions.length} questões lidas: ` +
    Object.entries(by).map(([k, v]) => `${k}=${v.n}(${v.unica}u/${v.multipla}m/${v.lacuna}l)`).join(' '));
}
process.exit(errors.length ? 1 : 0);
