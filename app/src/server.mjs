// Servidor HTTP da área de estudos (Node puro, sem dependências).
import { createServer, request as httpRequest } from 'node:http';
import net from 'node:net';
import { createReadStream, readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { join, extname, normalize, resolve, sep } from 'node:path';
import { loadBank, loadObjectives, APP_ROOT, DATA_DIR } from './bank.mjs';
import { openDb, tx, getSetting, setSetting } from './db.mjs';
import { generators } from './generators/index.mjs';
import { randomSeed } from './rng.mjs';
import {
  buildExam, saveNewExam, loadExam, finishExam, checkOne, contest, publicQuestion, DAY,
} from './exam.mjs';
import { summary, masteryByObjective } from './stats.mjs';
import { PdfIndex } from './pdfindex.mjs';
import { loadChallenges, rollParams, render, labCall, CHALLENGES_DIR } from './lab.mjs';

const PORT = Number(process.env.PORT || 8088);
const DB_PATH = process.env.DB_PATH || join(APP_ROOT, 'data', 'estudos.db');
const MATERIALS_DIR = process.env.MATERIALS_DIR || join(APP_ROOT, '..');
const TERMINAL_PORT = Number(process.env.LAB_TERMINAL_PORT || 7681);
const PUBLIC_DIR = join(APP_ROOT, 'public');
const LAB_TERMINAL = new URL(process.env.LAB_TERMINAL_URL || 'http://lab:7681');
// Defesa contra DNS rebinding: só atende Hosts conhecidos (localhost por padrão). Para abrir na rede local,
// defina ALLOWED_HOSTS="meu-pc.local,192.168.0.10" (ou "*" para desligar a checagem).
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', ...(process.env.ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)]);
const hostName = (h) => (String(h ?? '').toLowerCase().match(/^(\[[^\]]+\]|[^:]+)(?::\d+)?$/) ?? [])[1] ?? '';
const hostAllowed = (req) => ALLOWED_HOSTS.has('*') || ALLOWED_HOSTS.has(hostName(req.headers.host));
/** Sem Origin (ferramentas/GET) passa; com Origin, tem de ser o próprio app (bloqueia CSRF e WebSocket de outros sites). */
const originAllowed = (req) => {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
};

const db = openDb(DB_PATH);
let bank = loadBank();
const meta = loadObjectives();
const course = JSON.parse(readFileSync(join(DATA_DIR, 'course.json'), 'utf8'));
let challenges = loadChallenges();

const pdfFiles = {
  101: meta.outline._files?.['101']?.file ?? 'LPI-Learning-Material-101-500-pt.pdf',
  102: meta.outline._files?.['102']?.file ?? 'LPI-Learning-Material-102-500-pt.pdf',
};
/** Outros PDFs na raiz do projeto viram "complementos" (ex.: apostilas e livros), pesquisáveis e visíveis na aba Material. */
function scanExtras() {
  const known = new Set(Object.values(pdfFiles));
  let names = [];
  try { names = readdirSync(MATERIALS_DIR).filter((f) => /\.pdf$/i.test(f) && !known.has(f)).sort(); } catch { /* pasta ausente */ }
  return names.slice(0, 12).map((f, i) => ({ id: `x${i + 1}`, arquivo: f, titulo: f.replace(/\.pdf$/i, '') }));
}
let extras = scanExtras();
let pdfIndex;
function rebuildPdfIndex() {
  extras = scanExtras();
  pdfIndex = new PdfIndex(MATERIALS_DIR, { ...pdfFiles, ...Object.fromEntries(extras.map((e) => [e.id, e.arquivo])) }, meta.outline);
  pdfIndex.build().then(() => console.log(`[pdf] índice: ${pdfIndex.state}${pdfIndex.error ? ' — ' + pdfIndex.error : ''}${extras.length ? ` · ${extras.length} complemento(s)` : ''}${pdfIndex.semTexto.length ? ` · sem texto/OCR: ${pdfIndex.semTexto.join(',')}` : ''}`));
}
rebuildPdfIndex();
const pdfPath = (id) => (id === '101' || id === '102' ? pdfFiles[id] : extras.find((e) => e.id === id)?.arquivo);

console.log(`[banco] ${bank.questions.length} questões válidas em ${bank.files.length} arquivos; ${bank.errors.length} erros, ${bank.warnings.length} avisos; ${generators.length} geradores; ${challenges.length} desafios de lab`);

// ---------- utilitários ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

const httpError = (status, message) => Object.assign(new Error(message), { status });

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
  res.end(data);
}

async function readBody(req, limit = 8 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw httpError(413, 'corpo grande demais');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  // exige JSON explícito: um formulário de outro site (text/plain) não consegue escrever aqui (CSRF)
  if (!/^application\/json/i.test(req.headers['content-type'] ?? '')) throw httpError(415, 'envie application/json');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError(400, 'JSON inválido'); }
}

const progressMap = () => new Map(db.prepare('SELECT obj, status FROM progress').all().map((r) => [r.obj, r.status]));
const qstatsMap = () => new Map(db.prepare('SELECT * FROM qstats').all().map((r) => [r.qid, r]));
const masteryNumbers = () => new Map([...masteryByObjective(db, meta.objetivos)].map(([k, v]) => [k, v.mastery]));

function examEnv() {
  return { bank, objetivos: meta.objetivos, topicos: meta.topicos, qstats: qstatsMap(), progress: progressMap(), mastery: masteryNumbers(), now: Date.now() };
}

/** Visão da prova para o cliente (sem gabarito enquanto estiver em andamento). */
function examView(exam) {
  const done = exam.status === 'finalizado';
  const base = {
    id: exam.id, title: exam.title, mode: exam.mode, status: exam.status, instant: !!exam.instant, minutes: exam.minutes,
    created: exam.created, deadline: exam.deadline, now: Date.now(), n: exam.questions.length, seed: exam.seed,
    answers: exam.answers, flags: exam.flags, scope: exam.scope, parent: exam.parent,
  };
  if (done) {
    const items = exam.result?.items ?? [];
    return {
      ...base, finished: exam.finished, result: exam.result,
      questions: exam.questions.map((q, i) => ({ ...publicQuestion(q, i, { reveal: true }), ok: items[i]?.ok ?? false, contested: items[i]?.contested ?? false, gen: q.gen ?? null })),
    };
  }
  return {
    ...base, checked: exam.checked,
    questions: exam.questions.map((q, i) => (exam.instant && exam.checked.includes(i)
      ? { ...publicQuestion(q, i, { reveal: true }), ok: undefined }
      : publicQuestion(q, i))),
  };
}

function maybeExpire(exam) {
  if (exam && exam.status === 'andamento' && exam.deadline && Date.now() > exam.deadline + 20_000) {
    return finishExam(db, exam.id);
  }
  return exam;
}

function validateAnswers(exam, answers) {
  const out = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= exam.questions.length) continue;
    if (exam.instant && exam.checked.includes(i)) continue; // já corrigida
    if (typeof v === 'string') out[i] = v.slice(0, 300);
    else if (Number.isInteger(v)) out[i] = v;
    else if (Array.isArray(v)) out[i] = v.filter((x) => Number.isInteger(x)).slice(0, 8);
    else if (v === null) out[i] = null;
  }
  return out;
}

// ---------- rotas ----------
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
};

route('GET', '/api/meta', async () => ({
  prova: meta.prova, exames: meta.exames, topicos: meta.topicos, objetivos: meta.objetivos, mudancas_futuras: meta.mudancas_futuras,
  curso: course, terminalPort: TERMINAL_PORT,
  pdf: {
    arquivos: pdfFiles, indice: pdfIndex.state,
    disponiveis: { ...Object.fromEntries(Object.entries(pdfFiles).map(([k, f]) => [k, existsSync(join(MATERIALS_DIR, f))])), ...Object.fromEntries(extras.map((e) => [e.id, true])) },
    extras: extras.map((e) => ({ ...e, pesquisavel: !pdfIndex.semTexto.includes(e.id) })),
  },
  banco: bankHealth(),
}));

function bankHealth() {
  const porObj = {};
  for (const q of bank.questions) {
    const o = (porObj[q.obj] ??= { n: 0, unica: 0, multipla: 0, lacuna: 0, geradores: 0 });
    o.n++; o[q.type]++;
  }
  for (const g of generators) (porObj[g.obj] ??= { n: 0, unica: 0, multipla: 0, lacuna: 0, geradores: 0 }).geradores++;
  return {
    total: bank.questions.length, geradores: generators.length, desafios: challenges.length,
    erros: bank.errors.slice(0, 30), avisos: bank.warnings.length, porObj,
  };
}

route('POST', '/api/bank/reload', async () => { bank = loadBank(); challenges = loadChallenges(); rebuildPdfIndex(); return bankHealth(); });

route('GET', '/api/stats', async () => summary(db, { objetivos: meta.objetivos, topicos: meta.topicos, bank }));

route('GET', '/api/progress', async () => ({
  status: Object.fromEntries(progressMap()),
  aulas: Object.fromEntries(db.prepare('SELECT key, done FROM lessons').all().map((r) => [r.key, !!r.done])),
}));

route('PUT', '/api/progress', async (req) => {
  const { obj, status } = await readBody(req);
  if (!meta.objetivos.some((o) => o.code === obj)) throw httpError(400, 'objetivo inválido');
  if (!['nao', 'estudando', 'concluido'].includes(status)) throw httpError(400, 'status inválido');
  db.prepare('INSERT INTO progress(obj, status, updated) VALUES(?,?,?) ON CONFLICT(obj) DO UPDATE SET status = excluded.status, updated = excluded.updated').run(obj, status, Date.now());
  return { ok: true };
});

route('PUT', '/api/lessons', async (req) => {
  const { key, done } = await readBody(req);
  if (!/^\d{3}\.\d:\d+$/.test(String(key))) throw httpError(400, 'aula inválida');
  const obj = key.split(':')[0];
  db.prepare('INSERT INTO lessons(key, done, updated) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET done = excluded.done, updated = excluded.updated').run(key, done ? 1 : 0, Date.now());
  // status do objetivo acompanha as aulas marcadas
  const total = course.aulas[obj]?.length ?? 0;
  if (total) {
    const n = db.prepare("SELECT COUNT(*) n FROM lessons WHERE key LIKE ? AND done = 1").get(`${obj}:%`).n;
    const status = n === 0 ? 'nao' : n >= total ? 'concluido' : 'estudando';
    db.prepare('INSERT INTO progress(obj, status, updated) VALUES(?,?,?) ON CONFLICT(obj) DO UPDATE SET status = excluded.status, updated = excluded.updated').run(obj, status, Date.now());
    return { ok: true, status };
  }
  return { ok: true };
});

route('POST', '/api/exams', async (req) => {
  const o = await readBody(req);
  const n = o.n ? Math.min(120, Math.max(1, Number(o.n))) : undefined;
  const minutes = o.minutes !== undefined && o.minutes !== null ? Math.min(240, Math.max(0, Number(o.minutes))) : undefined;
  let built;
  try {
    built = buildExam({ mode: o.mode, exame: o.exame, objetivos: Array.isArray(o.objetivos) ? o.objetivos.slice(0, 60) : undefined, n, minutes, seed: o.seed }, examEnv());
  } catch (e) { throw httpError(400, e.message); }
  const id = saveNewExam(db, built, o.parent ?? null);
  return { id };
});

route('GET', '/api/exams', async () => ({
  exames: db.prepare('SELECT id, created, mode, title, status, n, minutes, instant, result FROM exams ORDER BY created DESC LIMIT 100').all().map((e) => {
    let r = null; try { r = JSON.parse(e.result); } catch { /* ignora */ }
    return { id: e.id, created: e.created, mode: e.mode, title: e.title, status: e.status, n: e.n, instant: !!e.instant, pct: r?.pct ?? null, correct: r?.correct ?? null, tempo: r?.tempo_seg ?? null };
  }),
}));

route('GET', '/api/exams/:id', async (req, res, p) => {
  let exam = loadExam(db, p.id);
  if (!exam) throw httpError(404, 'prova não encontrada');
  exam = maybeExpire(exam);
  return examView(exam);
});

route('PUT', '/api/exams/:id/answers', async (req, res, p) => {
  const body = await readBody(req); // primeiro o corpo: depois daqui nada é assíncrono, então carregar→mesclar→gravar é atômico
  const exam = maybeExpire(loadExam(db, p.id));
  if (!exam) throw httpError(404, 'prova não encontrada');
  if (exam.status !== 'andamento') throw httpError(409, 'prova já finalizada');
  const incoming = validateAnswers(exam, body.answers);
  const answers = { ...exam.answers, ...incoming };
  for (const [k, v] of Object.entries(answers)) if (v === null) delete answers[k];
  const flags = Array.isArray(body.flags) ? [...new Set(body.flags.filter((x) => Number.isInteger(x) && x >= 0 && x < exam.questions.length))] : exam.flags;
  db.prepare('UPDATE exams SET answers = ?, flags = ? WHERE id = ?').run(JSON.stringify(answers), JSON.stringify(flags), exam.id);
  return { ok: true, now: Date.now() };
});

route('POST', '/api/exams/:id/check', async (req, res, p) => {
  const exam = loadExam(db, p.id);
  if (!exam) throw httpError(404, 'prova não encontrada');
  if (!exam.instant) throw httpError(400, 'correção imediata só existe no modo treino');
  if (exam.status !== 'andamento') throw httpError(409, 'prova já finalizada');
  const { i, answer } = await readBody(req);
  const v = validateAnswers({ ...exam, checked: [] }, { [i]: answer })[i];
  return checkOne(db, exam.id, Number(i), v);
});

route('POST', '/api/exams/:id/finish', async (req, res, p) => {
  const body = await readBody(req);
  const exam = loadExam(db, p.id);
  if (!exam) throw httpError(404, 'prova não encontrada');
  const late = exam.deadline && Date.now() > exam.deadline + 20_000; // tolerância de rede; depois disso só valem as respostas já salvas
  if (exam.status === 'andamento' && body.answers && !late) {
    const answers = { ...exam.answers, ...validateAnswers(exam, body.answers) };
    db.prepare('UPDATE exams SET answers = ? WHERE id = ?').run(JSON.stringify(answers), exam.id);
  }
  return examView(finishExam(db, p.id));
});

route('POST', '/api/exams/:id/contest', async (req, res, p) => {
  const { i } = await readBody(req);
  return examView(contest(db, p.id, Number(i)));
});

route('POST', '/api/exams/:id/retake', async (req, res, p) => {
  const { same } = await readBody(req);
  const exam = loadExam(db, p.id);
  if (!exam) throw httpError(404, 'prova não encontrada');
  if (exam.status !== 'finalizado') throw httpError(400, 'finalize a prova antes de refazer');
  let built;
  if (same) {
    // mesmas questões, opções reembaralhadas
    const { makeRng } = await import('./rng.mjs');
    const seed = randomSeed();
    const rng = makeRng(`retake:${seed}`);
    built = {
      seed, title: `${exam.title} (refeito)`, mode: exam.mode, instant: !!exam.instant, minutes: exam.minutes,
      scope: exam.scope, questions: rng.shuffle(exam.questions.map((q) => ({ ...q, options: q.type === 'lacuna' ? [] : rng.shuffle(q.options) }))),
    };
  } else {
    try { built = buildExam({ ...exam.scope, mode: exam.mode, exame: exam.scope.exame, objetivos: exam.scope.objetivos, n: exam.scope.n, minutes: exam.minutes }, examEnv()); } catch (e) { throw httpError(400, e.message); }
  }
  return { id: saveNewExam(db, built, exam.id) };
});

route('POST', '/api/exams/:id/wrong', async (req, res, p) => {
  // novo treino só com as questões erradas desta prova
  const exam = loadExam(db, p.id);
  if (!exam || exam.status !== 'finalizado') throw httpError(400, 'finalize a prova primeiro');
  const wrong = exam.questions.filter((_, i) => !exam.result.items[i].ok);
  if (!wrong.length) throw httpError(400, 'nenhuma questão errada 🎉');
  const { makeRng } = await import('./rng.mjs');
  const seed = randomSeed();
  const rng = makeRng(`wrong:${seed}`);
  const built = {
    seed, title: 'Refazer erradas', mode: 'treino', instant: true, minutes: 0,
    scope: { mode: 'treino', n: wrong.length },
    questions: rng.shuffle(wrong.map((q) => ({ ...q, options: q.type === 'lacuna' ? [] : rng.shuffle(q.options) }))),
  };
  return { id: saveNewExam(db, built, exam.id) };
});

route('DELETE', '/api/exams/:id', async (req, res, p) => {
  tx(db, () => {
    db.prepare('DELETE FROM attempts WHERE exam_id = ?').run(p.id);
    db.prepare('DELETE FROM exams WHERE id = ?').run(p.id);
    // reconstrói estatísticas das questões afetadas
    db.exec('DELETE FROM qstats');
  });
  rebuildAllQstats();
  return { ok: true };
});

function rebuildAllQstats() {
  const rows = db.prepare('SELECT qid, obj, correct, ts FROM attempts ORDER BY ts, id').all();
  const acc = new Map();
  for (const r of rows) {
    const s = acc.get(r.qid) ?? { obj: r.obj, seen: 0, correct: 0, box: 0, last_ts: 0, last_ok: 0 };
    s.seen++; s.correct += r.correct; s.box = r.correct ? Math.min(s.box + 1, 5) : 0; s.last_ts = r.ts; s.last_ok = r.correct;
    acc.set(r.qid, s);
  }
  const days = [0, 1, 3, 7, 14, 30];
  const ins = db.prepare('INSERT INTO qstats(qid, obj, seen, correct, box, last_ts, last_ok, due_ts) VALUES(?,?,?,?,?,?,?,?)');
  for (const [qid, s] of acc) ins.run(qid, s.obj, s.seen, s.correct, s.box, s.last_ts, s.last_ok, s.last_ts + days[s.box] * DAY);
}

route('POST', '/api/report', async (req) => {
  const { qid, examId, note } = await readBody(req);
  db.prepare('INSERT INTO reports(qid, exam_id, note, ts) VALUES(?,?,?,?)').run(String(qid).slice(0, 80), examId ? String(examId).slice(0, 40) : null, String(note ?? '').slice(0, 1000), Date.now());
  return { ok: true };
});

route('GET', '/api/reports', async () => ({ reports: db.prepare('SELECT * FROM reports ORDER BY ts DESC LIMIT 200').all() }));

route('GET', '/api/search', async (req, res, p, url) => ({
  estado: pdfIndex.state,
  resultados: pdfIndex.search(url.searchParams.get('q') ?? '', 30).map((r) => ({ ...r, titulo: extras.find((e) => e.id === r.exame)?.titulo ?? null })),
}));

// ---------- laboratório ----------
route('GET', '/api/lab/status', async () => {
  const h = await labCall('/health', null, { timeout: 2500 });
  return { online: !!h.ok, terminalPort: TERMINAL_PORT, desafios: challenges.length };
});

route('GET', '/api/lab/challenges', async () => {
  const runs = db.prepare('SELECT challenge, MAX(passed) passed, COUNT(*) tentativas, MIN(CASE WHEN passed = 1 THEN passed_ts - started END) melhor FROM lab_runs GROUP BY challenge').all();
  const by = new Map(runs.map((r) => [r.challenge, r]));
  return {
    desafios: challenges.map((c) => ({
      id: c.id, obj: c.obj, titulo: c.titulo, nivel: c.nivel, minutos: c.minutos ?? null,
      concluido: !!by.get(c.id)?.passed, tentativas: by.get(c.id)?.tentativas ?? 0, melhor: by.get(c.id)?.melhor ?? null,
    })),
  };
});

route('POST', '/api/lab/start', async (req) => {
  const { id } = await readBody(req);
  const c = challenges.find((x) => x.id === id);
  if (!c) throw httpError(404, 'desafio não encontrado');
  const seed = randomSeed();
  const params = rollParams(c, seed);
  const r = await labCall('/setup', { challenge: c.id, params });
  if (!r.ok) throw httpError(502, `não foi possível preparar o laboratório: ${r.erro || r.output || 'erro desconhecido'}`);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  db.prepare('INSERT INTO lab_runs(id, challenge, params, started) VALUES(?,?,?,?)').run(run, c.id, JSON.stringify(params), Date.now());
  return {
    run, id: c.id, obj: c.obj, titulo: c.titulo, nivel: c.nivel, enunciado: render(c.enunciado, params),
    verifica: (c.verifica ?? []).map((v) => render(v, params)), dicas: (c.dicas ?? []).length, terminalPort: TERMINAL_PORT,
    setup: r.output ?? '',
  };
});

function getRun(runId) {
  const r = db.prepare('SELECT * FROM lab_runs WHERE id = ?').get(runId);
  if (!r) throw httpError(404, 'tentativa não encontrada');
  const c = challenges.find((x) => x.id === r.challenge);
  if (!c) throw httpError(404, 'desafio removido');
  return { r, c, params: JSON.parse(r.params) };
}

route('POST', '/api/lab/runs/:run/check', async (req, res, p) => {
  const { r, c, params } = getRun(p.run);
  const out = await labCall('/check', { challenge: c.id, params });
  if (out.offline) throw httpError(502, out.erro);
  db.prepare('UPDATE lab_runs SET checks = checks + 1 WHERE id = ?').run(r.id);
  if (out.passed && !r.passed) db.prepare('UPDATE lab_runs SET passed = 1, passed_ts = ? WHERE id = ?').run(Date.now(), r.id);
  return { passed: !!out.passed, results: out.results ?? [], output: out.output ?? '' };
});

route('POST', '/api/lab/runs/:run/hint', async (req, res, p) => {
  const { r, c, params } = getRun(p.run);
  const dicas = c.dicas ?? [];
  const next = Math.min(r.hints, dicas.length - 1);
  if (!dicas.length) return { dica: null };
  db.prepare('UPDATE lab_runs SET hints = hints + 1 WHERE id = ?').run(r.id);
  return { n: next + 1, de: dicas.length, dica: render(dicas[next], params) };
});

route('POST', '/api/lab/runs/:run/solution', async (req, res, p) => {
  const { r, c, params } = getRun(p.run);
  db.prepare('UPDATE lab_runs SET solution_seen = 1 WHERE id = ?').run(r.id);
  return { solucao: render(c.solucao, params) };
});

route('POST', '/api/lab/runs/:run/reset', async (req, res, p) => {
  const { c, params } = getRun(p.run);
  const out = await labCall('/setup', { challenge: c.id, params });
  if (!out.ok) throw httpError(502, out.erro || 'falha ao reiniciar o cenário');
  return { ok: true };
});

// ---------- exportar / importar / zerar ----------
const EXPORT_TABLES = ['progress', 'lessons', 'exams', 'attempts', 'qstats', 'reports', 'lab_runs', 'settings'];
route('GET', '/api/export', async () => {
  const dump = { versao: 1, exportado: new Date().toISOString() };
  for (const t of EXPORT_TABLES) dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
  // provas em andamento carregam o gabarito: ficam fora do backup (basta refazê-las)
  dump.exams = dump.exams.filter((e) => e.status === 'finalizado');
  return dump;
});

const JSON_COLS = { exams: ['scope', 'questions', 'answers', 'flags', 'overrides', 'checked', 'result'] };

/** Valida o arquivo de importação por completo; devolve a mensagem do problema ou null. */
function validateImport(d) {
  if (!d || d.versao !== 1) return 'arquivo de exportação inválido (versao)';
  for (const t of EXPORT_TABLES) {
    if (!Array.isArray(d[t])) return `tabela ausente ou inválida: ${t}`;
    const cols = new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
    for (const row of d[t]) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return `linha inválida em ${t}`;
      for (const [k, v] of Object.entries(row)) {
        if (!cols.has(k)) return `coluna desconhecida em ${t}: ${k}`;
        if (v !== null && typeof v === 'object') return `valor inválido em ${t}.${k}`;
      }
      for (const k of JSON_COLS[t] ?? []) {
        if (row[k] == null) continue;
        try { JSON.parse(row[k]); } catch { return `JSON inválido em ${t}.${k}`; }
      }
    }
  }
  if (!d.progress.every((r) => meta.objetivos.some((o) => o.code === r.obj) && ['nao', 'estudando', 'concluido'].includes(r.status))) return 'progress com objetivo/status inválido';
  return null;
}

route('POST', '/api/import', async (req) => {
  const d = await readBody(req, 64 * 1024 * 1024);
  const problema = validateImport(d);
  if (problema) throw httpError(400, problema);
  tx(db, () => {
    for (const t of EXPORT_TABLES) {
      db.exec(`DELETE FROM ${t}`);
      for (const row of d[t]) {
        const cols = Object.keys(row);
        db.prepare(`INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map((c) => row[c]));
      }
    }
    db.exec('DELETE FROM qstats'); // dado derivado: recalculado a partir das tentativas
  });
  rebuildAllQstats();
  return { ok: true };
});

route('GET', '/api/settings', async () => ({ data_101: getSetting(db, 'data_101'), data_102: getSetting(db, 'data_102') }));
route('PUT', '/api/settings', async (req) => {
  const b = await readBody(req);
  for (const k of ['data_101', 'data_102']) {
    if (!(k in b)) continue;
    if (b[k] !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(b[k]))) throw httpError(400, 'data inválida (use AAAA-MM-DD)');
    setSetting(db, k, b[k]);
  }
  return { ok: true };
});

route('POST', '/api/reset', async (req) => {
  const { confirm } = await readBody(req);
  if (confirm !== 'APAGAR') throw httpError(400, 'confirmação ausente');
  tx(db, () => { for (const t of EXPORT_TABLES) db.exec(`DELETE FROM ${t}`); });
  return { ok: true };
});

// ---------- arquivos estáticos e PDFs ----------
function serveFile(req, res, file, { range = false, type } = {}) {
  let st;
  try { st = statSync(file); } catch { return send(res, 404, { erro: 'não encontrado' }); }
  if (!st.isFile()) return send(res, 404, { erro: 'não encontrado' });
  const ct = type || MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'content-type': ct, 'cache-control': 'no-cache', 'accept-ranges': range ? 'bytes' : 'none' };
  const m = range && req.headers.range ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range) : null;
  if (m) {
    let start = m[1] === '' ? st.size - Number(m[2]) : Number(m[1]);
    let end = m[1] !== '' && m[2] !== '' ? Number(m[2]) : st.size - 1;
    end = Math.min(end, st.size - 1);
    if (!(start >= 0) || start > end) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'content-length': st.size });
  if (req.method === 'HEAD') return res.end();
  return createReadStream(file).pipe(res);
}

function servePublic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !extname(rel)) rel = '/index.html';
  const file = resolve(PUBLIC_DIR, '.' + normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + sep) || !existsSync(file)) {
    if (!extname(pathname)) return serveFile(req, res, join(PUBLIC_DIR, 'index.html'));
    return send(res, 404, { erro: 'não encontrado' });
  }
  return serveFile(req, res, file);
}

// ---------- terminal do laboratório: proxy reverso (mesma origem, mesma checagem de Host/Origin) ----------
function proxyTerminal(req, res) {
  const up = httpRequest({ hostname: LAB_TERMINAL.hostname, port: LAB_TERMINAL.port, path: req.url, method: req.method, headers: req.headers }, (pr) => {
    res.writeHead(pr.statusCode, pr.headers);
    pr.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) send(res, 502, { erro: 'laboratório indisponível (docker compose up -d lab)' }); else res.destroy(); });
  req.pipe(up);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (!hostAllowed(req)) return send(res, 403, { erro: 'host não permitido (veja ALLOWED_HOSTS no docker-compose.yml)' });
    if (req.method !== 'GET' && req.method !== 'HEAD' && !originAllowed(req)) return send(res, 403, { erro: 'origem não permitida' });
    if (url.pathname === '/terminal') { res.writeHead(302, { location: '/terminal/' }); return res.end(); }
    if (url.pathname.startsWith('/terminal/')) return proxyTerminal(req, res);
    const pm = /^\/pdf\/(101|102|x\d+)$/.exec(url.pathname);
    if (pm && (req.method === 'GET' || req.method === 'HEAD')) {
      const f = pdfPath(pm[1]); // só nomes conhecidos pelo servidor: nunca um caminho vindo da URL
      return f ? serveFile(req, res, join(MATERIALS_DIR, f), { range: true, type: 'application/pdf' }) : send(res, 404, { erro: 'PDF não encontrado' });
    }
    if (url.pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const out = await r.handler(req, res, params, url);
        return send(res, 200, out);
      }
      return send(res, 404, { erro: 'rota inexistente' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { erro: 'método não permitido' });
    return servePublic(req, res, url.pathname);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[erro]', req.method, req.url, e);
    send(res, status, { erro: e.message || 'erro interno' });
  }
});

// WebSocket do terminal (ttyd): mesma checagem de Host/Origin e túnel TCP até o container do lab
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/terminal/') || !hostAllowed(req) || !originAllowed(req)) { socket.end('HTTP/1.1 403 Forbidden\r\nconnection: close\r\n\r\n'); return; }
  const up = net.connect(Number(LAB_TERMINAL.port), LAB_TERMINAL.hostname, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head?.length) up.write(head);
    socket.pipe(up); up.pipe(socket);
  });
  const close = () => { socket.destroy(); up.destroy(); };
  up.on('error', close); socket.on('error', close); up.on('close', close); socket.on('close', close);
});

server.listen(PORT, '0.0.0.0', () => console.log(`[web] http://localhost:${PORT}`));
process.on('SIGTERM', () => { server.close(); db.close(); process.exit(0); });
process.on('SIGINT', () => { server.close(); db.close(); process.exit(0); });
