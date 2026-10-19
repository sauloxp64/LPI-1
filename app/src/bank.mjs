import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseQuestions, lintQuestions } from './qformat.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = join(HERE, '..');
export const DATA_DIR = join(APP_ROOT, 'data');
export const QUESTIONS_DIR = process.env.QUESTIONS_DIR || join(APP_ROOT, 'content', 'questions');

export function loadObjectives() {
  const base = JSON.parse(readFileSync(join(DATA_DIR, 'objectives.json'), 'utf8'));
  const outlinePath = join(DATA_DIR, 'pdf-outline.json');
  const outline = existsSync(outlinePath) ? JSON.parse(readFileSync(outlinePath, 'utf8')) : {};
  const objetivos = base.objetivos.map((o) => ({
    ...o,
    exame: base.topicos[o.topico].exame,
    pdf: outline[o.code]
      ? { arquivo: outline[o.code].file, inicio: outline[o.code].start, fim: outline[o.code].end, secoes: outline[o.code].sections }
      : null,
  }));
  return { ...base, objetivos, outline };
}

/** Lê todos os arquivos .txt do banco. */
export function loadBank({ lint = true } = {}) {
  const { objetivos, outline } = loadObjectives();
  const files = existsSync(QUESTIONS_DIR)
    ? readdirSync(QUESTIONS_DIR).filter((f) => f.endsWith('.txt')).sort()
    : [];
  const questions = [];
  const errors = [];
  const warnings = [];
  for (const f of files) {
    const { questions: qs, errors: es } = parseQuestions(readFileSync(join(QUESTIONS_DIR, f), 'utf8'), f);
    questions.push(...qs);
    errors.push(...es);
  }
  if (lint) {
    const r = lintQuestions(questions, { objectives: new Set(objetivos.map((o) => o.code)), outline });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  // Questões com erro de validação ficam fora das provas.
  const bad = new Set(errors.filter((e) => e.id).map((e) => e.id));
  const valid = questions.filter((q) => !bad.has(q.id));
  return { questions: valid, all: questions, errors, warnings, objetivos, files };
}
