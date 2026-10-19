// Montagem, correção e registro de simulados.
import { makeRng, randomSeed } from './rng.mjs';
import { normalizeAnswer } from './qformat.mjs';
import { generatorsByObj, getGenerator } from './generators/index.mjs';
import { checkGenerated } from './gencheck.mjs';
import { tx } from './db.mjs';

export const DAY = 86400e3;
const BOX_DAYS = [0, 1, 3, 7, 14, 30];

/** Distribui n questões entre objetivos proporcionalmente ao peso (maiores restos). */
export function allocate(objs, n) {
  const total = objs.reduce((s, o) => s + o.peso, 0);
  const quotas = objs.map((o) => (n * o.peso) / total);
  const counts = quotas.map(Math.floor);
  let rest = n - counts.reduce((a, b) => a + b, 0);
  const order = quotas.map((q, i) => ({ i, frac: q - Math.floor(q), peso: objs[i].peso })).sort((a, b) => b.frac - a.frac || b.peso - a.peso);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) counts[order[k].i]++;
  if (n >= objs.length) {
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] === 0) {
        const j = counts.indexOf(Math.max(...counts));
        if (counts[j] > 1) { counts[j]--; counts[i]++; }
      }
    }
  }
  return new Map(objs.map((o, i) => [o.code, counts[i]]));
}

function freshness(qs, now, weak) {
  if (!qs) return 0.7;
  let b = 0;
  if (!qs.last_ok) b += weak ? 1.6 : 0.6;
  if (qs.due_ts != null && qs.due_ts <= now) b += 0.25;
  if (qs.last_ok && now - qs.last_ts < 2 * DAY) b -= 0.5;
  if (qs.box >= 4) b -= 0.3;
  if (weak) b += (1 - qs.correct / Math.max(1, qs.seen)) * 0.8;
  return b;
}

function materializeBank(q, rng) {
  return {
    qid: q.id, src: 'bank', obj: q.obj, type: q.type, level: q.level, text: q.text,
    options: q.type === 'lacuna' ? [] : rng.shuffle(q.options.map((o) => ({ t: o.t, ok: o.ok }))),
    answers: q.answers ?? [], explanation: q.explanation, ref: q.ref ?? [], tags: q.tags ?? [],
  };
}

function materializeGen(g, rng) {
  for (let t = 0; t < 6; t++) {
    try {
      const raw = g.make(rng.fork(`g${t}`));
      if (checkGenerated(raw, g).length) continue;
      return {
        qid: `gen:${g.id}`, src: 'gen', obj: g.obj, type: raw.type, level: g.nivel ?? 2, text: raw.text,
        options: raw.type === 'lacuna' ? [] : rng.shuffle(raw.options.map((o) => ({ t: o.t, ok: !!o.ok }))),
        answers: raw.answers ?? [], explanation: raw.explanation, ref: raw.ref ?? [], tags: [], gen: g.id,
      };
    } catch { /* tenta outra variação */ }
  }
  return null;
}

/** Escolhe k questões de um objetivo. */
function pickForObjective(rng, obj, k, ctx) {
  const bank = ctx.bankByObj.get(obj) ?? [];
  const gens = generatorsByObj.get(obj) ?? [];
  let nGen = 0;
  if (gens.length) {
    if (!bank.length) nGen = k;
    else for (let i = 0; i < k; i++) if (rng.chance(ctx.genShare)) nGen++;
  }
  let nBank = k - nGen;
  if (nBank > bank.length && gens.length) { nGen += nBank - bank.length; nBank = bank.length; }
  const out = [];
  const scored = bank
    .map((q) => ({ q, s: rng.next() + (ctx.freshness ? freshness(ctx.qstats.get(q.id), ctx.now, ctx.weak) : 0) }))
    .sort((a, b) => b.s - a.s);
  for (let i = 0; i < nBank; i++) {
    const pick = scored[i % scored.length]; // se o banco acabar, repete (com opções reembaralhadas)
    if (pick) out.push(materializeBank(pick.q, rng.fork(`b${out.length}`)));
  }
  for (let i = 0; i < nGen; i++) {
    const g = rng.weighted(gens, (x) => (x.peso ?? 1) / (1 + 2 * (ctx.genUsed.get(x.id) ?? 0)));
    ctx.genUsed.set(g.id, (ctx.genUsed.get(g.id) ?? 0) + 1);
    const m = materializeGen(g, rng.fork(`n${i}`));
    if (m) out.push(m);
  }
  // gerador que falhou (ou banco menor que o pedido): completa com questões fixas, repetindo se preciso
  for (let i = 0; out.length < k && scored.length; i++) {
    out.push(materializeBank(scored[i % scored.length].q, rng.fork(`f${i}`)));
  }
  return out;
}

/**
 * Cria a lista de questões de um simulado.
 * opts: { mode, exame:'101'|'102'|'ambos', objetivos?:string[], n?, minutes?, seed? }
 * env:  { bank, objetivos, topicos, qstats:Map, progress:Map(obj->status), mastery:Map(obj->0..1), now }
 */
export function buildExam(opts, env) {
  const seed = opts.seed || randomSeed();
  const rng = makeRng(`exam:${seed}`);
  const now = env.now ?? Date.now();
  const all = env.objetivos;
  const mode = opts.mode;
  let set; let counts; let n = opts.n; let minutes = opts.minutes; let instant = false; let title;

  const expand = (codes) => {
    const out = new Set();
    for (const c of codes ?? []) {
      if (/^\d{3}$/.test(c)) all.filter((o) => o.topico === c).forEach((o) => out.add(o.code));
      else if (all.some((o) => o.code === c)) out.add(c);
    }
    return all.filter((o) => out.has(o.code));
  };

  if (mode === 'oficial') {
    const ex = opts.exame ?? '101';
    set = all.filter((o) => (ex === 'ambos' ? true : o.exame === ex));
    counts = new Map(set.map((o) => [o.code, o.peso]));
    n = set.reduce((s, o) => s + o.peso, 0);
    minutes = ex === 'ambos' ? 180 : 90;
    title = ex === 'ambos' ? 'Simulado oficial 101 + 102' : `Simulado oficial ${ex}-500`;
  } else if (mode === 'topico') {
    set = expand(opts.objetivos);
    if (!set.length) throw new Error('Escolha ao menos um objetivo ou tópico.');
    n = n || Math.min(60, Math.max(10, set.reduce((s, o) => s + o.peso, 0) * 2));
    minutes ??= Math.ceil(n * 1.5);
    title = set.length === 1 ? `Objetivo ${set[0].code}` : `Tópicos selecionados (${set.length} objetivos)`;
  } else if (mode === 'curso') {
    set = all.filter((o) => ['estudando', 'concluido'].includes(env.progress.get(o.code)));
    if (!set.length) throw new Error('Marque seu avanço no curso (aba Curso) para gerar simulados do que você já viu.');
    n = n || 40;
    minutes ??= Math.ceil(n * 1.5);
    title = 'Simulado do que já vi no curso';
  } else if (mode === 'fracos') {
    const ranked = all
      .map((o) => ({ o, gap: o.peso * (1 - (env.mastery.get(o.code) ?? 0.35)) }))
      .sort((a, b) => b.gap - a.gap);
    n = n || 30;
    set = ranked.slice(0, Math.max(4, Math.ceil(n / 4))).map((r) => r.o);
    minutes ??= Math.ceil(n * 1.5);
    title = 'Foco nos pontos fracos';
  } else if (mode === 'relampago') {
    const unlocked = all.filter((o) => ['estudando', 'concluido'].includes(env.progress.get(o.code)));
    set = opts.objetivos?.length ? expand(opts.objetivos) : unlocked.length ? unlocked : all;
    n = n || 10;
    minutes ??= 15;
    title = 'Relâmpago';
  } else if (mode === 'treino') {
    set = opts.objetivos?.length ? expand(opts.objetivos) : all.filter((o) => ['estudando', 'concluido'].includes(env.progress.get(o.code)));
    if (!set.length) set = all;
    n = n || 10;
    minutes = 0;
    instant = true;
    title = set.length === 1 ? `Treino ${set[0].code}` : 'Treino com correção imediata';
  } else if (mode === 'erros') {
    return buildReview(opts, env, seed, rng, now);
  } else {
    throw new Error(`Modo desconhecido: ${mode}`);
  }

  if (!counts) counts = allocate(set, n);
  const bankByObj = new Map();
  for (const q of env.bank.questions) {
    if (!bankByObj.has(q.obj)) bankByObj.set(q.obj, []);
    bankByObj.get(q.obj).push(q);
  }
  const ctx = {
    bankByObj, qstats: env.qstats, now, weak: mode === 'fracos' || mode === 'treino',
    freshness: true, genShare: mode === 'fracos' ? 0.35 : 0.3, genUsed: new Map(),
  };
  let questions = [];
  for (const o of set) questions.push(...pickForObjective(rng.fork(`o:${o.code}`), o.code, counts.get(o.code) ?? 0, ctx));
  if (mode === 'oficial') {
    const got = {};
    for (const q of questions) got[q.obj] = (got[q.obj] ?? 0) + 1;
    const falta = set.filter((o) => (got[o.code] ?? 0) < o.peso).map((o) => `${o.code} (${got[o.code] ?? 0}/${o.peso})`);
    if (falta.length) throw new Error(`Banco incompleto para o simulado oficial — questões insuficientes em: ${falta.join(', ')}`);
  }
  questions = rng.shuffle(questions);
  if (!questions.length) throw new Error('Sem questões disponíveis para esse escopo.');
  return {
    seed, title, mode, instant, minutes: minutes || 0, questions,
    scope: { mode, exame: opts.exame, objetivos: set.map((o) => o.code), n: questions.length },
  };
}

/** Caderno de erros: questões que você errou por último ou que estão vencidas na repetição espaçada. */
function buildReview(opts, env, seed, rng, now) {
  const n = opts.n || 20;
  const byId = new Map(env.bank.questions.map((q) => [q.id, q]));
  const rows = [...env.qstats.values()].filter((s) => !s.last_ok || (s.due_ts != null && s.due_ts <= now));
  rows.sort((a, b) => (a.last_ok - b.last_ok) || (a.due_ts - b.due_ts));
  const questions = [];
  for (const s of rows) {
    if (questions.length >= n) break;
    if (s.qid.startsWith('gen:')) {
      const g = getGenerator(s.qid.slice(4));
      const m = g && materializeGen(g, rng.fork(`r${questions.length}`));
      if (m) questions.push(m);
    } else if (byId.has(s.qid)) {
      questions.push(materializeBank(byId.get(s.qid), rng.fork(`r${questions.length}`)));
    }
  }
  if (!questions.length) throw new Error('Nada para revisar: você não tem erros recentes nem revisões vencidas. 🎉');
  return {
    seed, title: 'Caderno de erros e revisões', mode: 'erros', instant: false,
    minutes: Math.ceil(questions.length * 1.5), questions: rng.shuffle(questions),
    scope: { mode: 'erros', n: questions.length },
  };
}

/** Questão correta? `ans`: índice(s) das opções (unica/multipla) ou texto (lacuna). */
export function isCorrect(q, ans) {
  if (ans === undefined || ans === null || ans === '') return false;
  if (q.type === 'lacuna') {
    const a = normalizeAnswer(ans);
    return !!a && q.answers.some((x) => normalizeAnswer(x) === a);
  }
  const sel = new Set([].concat(ans).map(Number).filter(Number.isInteger));
  const want = q.options.map((o, i) => (o.ok ? i : -1)).filter((i) => i >= 0);
  return sel.size === want.length && want.every((i) => sel.has(i));
}

/** Versão da questão para o cliente enquanto a prova está em andamento (sem gabarito). */
export function publicQuestion(q, i, { reveal = false } = {}) {
  const base = {
    i, type: q.type, level: q.level, text: q.text,
    options: q.options.map((o) => o.t),
    escolhas: q.options.filter((o) => o.ok).length,
  };
  if (reveal) {
    base.obj = q.obj; base.qid = q.qid; base.explanation = q.explanation; base.ref = q.ref;
    base.gabarito = q.type === 'lacuna' ? q.answers : q.options.map((o, idx) => (o.ok ? idx : -1)).filter((idx) => idx >= 0);
  }
  return base;
}

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

export function loadExam(db, id) {
  const r = db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
  if (!r) return null;
  return {
    ...r,
    scope: parse(r.scope, {}), questions: parse(r.questions, []), answers: parse(r.answers, {}),
    flags: parse(r.flags, []), overrides: parse(r.overrides, []), checked: parse(r.checked, []), result: parse(r.result, null),
  };
}

export function saveNewExam(db, built, parent = null) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();
  db.prepare(`INSERT INTO exams(id, created, mode, title, scope, seed, minutes, instant, deadline, questions, n, parent)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, now, built.mode, built.title, JSON.stringify(built.scope), built.seed, built.minutes, built.instant ? 1 : 0,
    built.minutes ? now + built.minutes * 60e3 : null, JSON.stringify(built.questions), built.questions.length, parent,
  );
  return id;
}

/** Grava tentativas + atualiza repetição espaçada para os índices dados (uma vez por índice). */
function recordAttempts(db, exam, idxs, ts) {
  const ins = db.prepare('INSERT INTO attempts(exam_id, idx, qid, obj, type, level, correct, ts) VALUES(?,?,?,?,?,?,?,?)');
  for (const i of idxs) {
    const q = exam.questions[i];
    const ok = isCorrect(q, exam.answers[i]) || exam.overrides.includes(i) ? 1 : 0;
    ins.run(exam.id, i, q.qid, q.obj, q.type, q.level, ok, ts);
    upsertQstat(db, q.qid, q.obj, ok, ts);
    if (!exam.checked.includes(i)) exam.checked.push(i);
  }
  db.prepare('UPDATE exams SET checked = ? WHERE id = ?').run(JSON.stringify(exam.checked), exam.id);
}

function upsertQstat(db, qid, obj, ok, ts) {
  const cur = db.prepare('SELECT * FROM qstats WHERE qid = ?').get(qid);
  const box = ok ? Math.min((cur?.box ?? 0) + 1, 5) : 0;
  const row = { seen: (cur?.seen ?? 0) + 1, correct: (cur?.correct ?? 0) + ok, box, last_ts: ts, last_ok: ok, due_ts: ts + BOX_DAYS[box] * DAY };
  db.prepare(`INSERT INTO qstats(qid, obj, seen, correct, box, last_ts, last_ok, due_ts) VALUES(?,?,?,?,?,?,?,?)
              ON CONFLICT(qid) DO UPDATE SET seen=excluded.seen, correct=excluded.correct, box=excluded.box,
              last_ts=excluded.last_ts, last_ok=excluded.last_ok, due_ts=excluded.due_ts`)
    .run(qid, obj, row.seen, row.correct, row.box, row.last_ts, row.last_ok, row.due_ts);
}

/** Recalcula qstats de um qid a partir do histórico (depois de contestações). */
export function rebuildQstat(db, qid) {
  const rows = db.prepare('SELECT correct, ts, obj FROM attempts WHERE qid = ? ORDER BY ts, id').all(qid);
  if (!rows.length) { db.prepare('DELETE FROM qstats WHERE qid = ?').run(qid); return; }
  let box = 0; let correct = 0;
  for (const r of rows) { box = r.correct ? Math.min(box + 1, 5) : 0; correct += r.correct; }
  const last = rows[rows.length - 1];
  db.prepare(`INSERT INTO qstats(qid, obj, seen, correct, box, last_ts, last_ok, due_ts) VALUES(?,?,?,?,?,?,?,?)
              ON CONFLICT(qid) DO UPDATE SET seen=excluded.seen, correct=excluded.correct, box=excluded.box,
              last_ts=excluded.last_ts, last_ok=excluded.last_ok, due_ts=excluded.due_ts`)
    .run(qid, last.obj, rows.length, correct, box, last.ts, last.correct, last.ts + BOX_DAYS[box] * DAY);
}

export function computeResult(exam) {
  const items = exam.questions.map((q, i) => {
    const given = exam.answers[i];
    const answered = !(given === undefined || given === null || given === '' || (Array.isArray(given) && !given.length));
    return { i, ok: isCorrect(q, given) || exam.overrides.includes(i), answered, contested: exam.overrides.includes(i) };
  });
  const por_obj = {};
  items.forEach((it) => {
    const o = (por_obj[exam.questions[it.i].obj] ??= { n: 0, ok: 0 });
    o.n++; if (it.ok) o.ok++;
  });
  const correct = items.filter((x) => x.ok).length;
  return {
    n: items.length, correct, pct: items.length ? correct / items.length : 0,
    respondidas: items.filter((x) => x.answered).length, por_obj, items,
    tempo_seg: Math.round(((exam.finished ?? Date.now()) - exam.created) / 1000),
  };
}

export function finishExam(db, id) {
  return tx(db, () => {
    const exam = loadExam(db, id);
    if (!exam) throw Object.assign(new Error('Prova não encontrada'), { status: 404 });
    if (exam.status === 'finalizado') return exam;
    const ts = Date.now();
    const pending = exam.questions.map((_, i) => i).filter((i) => !exam.checked.includes(i));
    recordAttempts(db, exam, pending, ts);
    exam.finished = ts;
    const result = computeResult(exam);
    db.prepare("UPDATE exams SET status = 'finalizado', finished = ?, result = ? WHERE id = ?").run(ts, JSON.stringify(result), id);
    return loadExam(db, id);
  });
}

/** Correção imediata de uma questão (modo treino). */
export function checkOne(db, id, i, answer) {
  return tx(db, () => {
    const exam = loadExam(db, id);
    if (!exam) throw Object.assign(new Error('Prova não encontrada'), { status: 404 });
    const q = exam.questions[i];
    if (!q) throw Object.assign(new Error('Questão inexistente'), { status: 400 });
    if (!exam.checked.includes(i)) {
      exam.answers[i] = answer;
      db.prepare('UPDATE exams SET answers = ? WHERE id = ?').run(JSON.stringify(exam.answers), id);
      recordAttempts(db, exam, [i], Date.now());
    }
    return { ok: isCorrect(q, exam.answers[i]) || exam.overrides.includes(i), given: exam.answers[i], ...publicQuestion(q, i, { reveal: true }) };
  });
}

/** O usuário discorda do gabarito (ex.: lacuna equivalente): conta como certa. */
export function contest(db, id, i) {
  return tx(db, () => {
    const exam = loadExam(db, id);
    if (!exam || exam.status !== 'finalizado') throw Object.assign(new Error('Só é possível contestar após finalizar'), { status: 400 });
    if (!exam.questions[i]) throw Object.assign(new Error('Questão inexistente'), { status: 400 });
    if (!exam.overrides.includes(i)) exam.overrides.push(i);
    db.prepare('UPDATE exams SET overrides = ? WHERE id = ?').run(JSON.stringify(exam.overrides), id);
    db.prepare('UPDATE attempts SET correct = 1 WHERE exam_id = ? AND idx = ?').run(id, i);
    rebuildQstat(db, exam.questions[i].qid);
    exam.finished = exam.finished ?? Date.now();
    db.prepare('UPDATE exams SET result = ? WHERE id = ?').run(JSON.stringify(computeResult(exam)), id);
    return loadExam(db, id);
  });
}
