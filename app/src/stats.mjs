// Domínio por objetivo, prontidão para a prova, sequência de estudo e recomendações.
import { DAY } from './exam.mjs';

const PRIOR_MEAN = 0.35; // objetivo sem dados conta como "provavelmente não sei" (visão conservadora)
const PRIOR_WEIGHT = 2;
const DECAY = 0.93;
const WINDOW = 30;
export const TARGET = 0.75; // meta de segurança do app (a LPI não publica a fórmula de nota)

/** Map(obj -> {mastery, n, acc}) usando as últimas respostas com peso decrescente. */
export function masteryByObjective(db, objetivos) {
  const rows = db.prepare('SELECT obj, correct FROM attempts ORDER BY ts DESC, id DESC LIMIT 20000').all();
  const by = new Map();
  for (const r of rows) {
    const a = by.get(r.obj) ?? [];
    if (a.length < WINDOW) a.push(r.correct);
    by.set(r.obj, a);
  }
  const total = new Map();
  for (const r of db.prepare('SELECT obj, COUNT(*) n, SUM(correct) c FROM attempts GROUP BY obj').all()) total.set(r.obj, r);
  const out = new Map();
  for (const o of objetivos) {
    const a = by.get(o.code) ?? [];
    let num = 0; let den = 0;
    a.forEach((c, k) => { const w = DECAY ** k; num += w * c; den += w; });
    const mastery = (num + PRIOR_WEIGHT * PRIOR_MEAN) / (den + PRIOR_WEIGHT);
    const t = total.get(o.code);
    out.set(o.code, { mastery, n: t?.n ?? 0, acc: t?.n ? t.c / t.n : null, recent: a.length });
  }
  return out;
}

export function readinessLabel(r) {
  if (r >= TARGET) return 'Pronto para agendar';
  if (r >= 0.62) return 'Quase lá';
  if (r >= 0.45) return 'Evoluindo';
  return 'Iniciando';
}

const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function summary(db, { objetivos, topicos, bank, now = Date.now() }) {
  const mastery = masteryByObjective(db, objetivos);
  const weightOf = (list) => list.reduce((s, o) => s + o.peso, 0);
  const calc = (list) => weightOf(list) ? list.reduce((s, o) => s + o.peso * mastery.get(o.code).mastery, 0) / weightOf(list) : 0;

  const porExame = {};
  for (const ex of ['101', '102']) porExame[ex] = calc(objetivos.filter((o) => o.exame === ex));
  const porTopico = {};
  for (const t of Object.keys(topicos)) porTopico[t] = calc(objetivos.filter((o) => o.topico === t));

  // atividade diária (tentativas + desafios do lab)
  const since = now - 120 * DAY;
  const act = new Map();
  for (const r of db.prepare('SELECT ts, correct FROM attempts WHERE ts >= ?').all(since)) {
    const k = dayKey(r.ts);
    const a = act.get(k) ?? { q: 0, ok: 0, lab: 0 };
    a.q++; a.ok += r.correct; act.set(k, a);
  }
  for (const r of db.prepare('SELECT passed_ts ts FROM lab_runs WHERE passed = 1 AND passed_ts >= ?').all(since)) {
    const k = dayKey(r.ts);
    const a = act.get(k) ?? { q: 0, ok: 0, lab: 0 };
    a.lab++; act.set(k, a);
  }
  let streak = 0;
  for (let d = 0; d < 400; d++) {
    const k = dayKey(now - d * DAY);
    if (act.has(k)) streak++;
    else if (d === 0) continue; // hoje ainda pode ser preenchido
    else break;
  }
  const atividade = [...act.entries()].map(([dia, v]) => ({ dia, ...v }));

  const exames = db.prepare("SELECT id, created, mode, title, n, result, minutes FROM exams WHERE status = 'finalizado' ORDER BY created DESC LIMIT 60").all()
    .map((e) => {
      let r = null; try { r = JSON.parse(e.result); } catch { /* ignora */ }
      return { id: e.id, created: e.created, mode: e.mode, title: e.title, n: e.n, pct: r?.pct ?? 0, correct: r?.correct ?? 0, tempo: r?.tempo_seg ?? 0 };
    });

  const totals = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(correct),0) c FROM attempts').get();
  const devidas = db.prepare('SELECT COUNT(*) n FROM qstats WHERE due_ts <= ? OR last_ok = 0').get(now).n;
  const labPassed = db.prepare('SELECT COUNT(DISTINCT challenge) n FROM lab_runs WHERE passed = 1').get().n;

  const progress = new Map(db.prepare('SELECT obj, status FROM progress').all().map((r) => [r.obj, r.status]));
  const sugestoes = recommend({ objetivos, mastery, progress, devidas, totals, now });

  const objs = objetivos.map((o) => ({ code: o.code, ...mastery.get(o.code) }));
  const geral = calc(objetivos);
  return {
    prontidao: { geral, rotulo: readinessLabel(geral), meta: TARGET, porExame, porTopico },
    objetivos: objs, streak, atividade, exames,
    totais: { respondidas: totals.n, acertos: totals.c, devidas, labConcluidos: labPassed, questoesNoBanco: bank.questions.length },
    sugestoes,
  };
}

function recommend({ objetivos, mastery, progress, devidas, totals }) {
  const out = [];
  const unlocked = objetivos.filter((o) => ['estudando', 'concluido'].includes(progress.get(o.code)));
  if (!totals.n && !unlocked.length) {
    out.push({ tipo: 'inicio', titulo: 'Comece marcando onde você está no curso', texto: 'Assim os simulados "do que já vi" usam só o conteúdo liberado. Depois faça um Relâmpago de 10 questões para calibrar o painel.', acao: '#/curso' });
    return out;
  }
  if (devidas > 0) {
    out.push({ tipo: 'revisao', titulo: `${devidas} questão(ões) para revisar`, texto: 'Erros recentes e itens vencidos da repetição espaçada. Dez minutos de revisão rendem mais que um simulado novo.', acao: '#/novo?modo=erros' });
  }
  const pool = (unlocked.length ? unlocked : objetivos)
    .map((o) => ({ o, gap: o.peso * (TARGET - mastery.get(o.code).mastery) }))
    .filter((x) => x.gap > 0).sort((a, b) => b.gap - a.gap);
  for (const { o } of pool.slice(0, 2)) {
    const m = mastery.get(o.code);
    out.push({
      tipo: 'foco', obj: o.code,
      titulo: `Treine ${o.code} — ${o.titulo}`,
      texto: m.n ? `Domínio estimado de ${Math.round(m.mastery * 100)}% com peso ${o.peso} na prova.` : `Ainda sem respostas neste objetivo (peso ${o.peso} na prova).`,
      acao: `#/novo?modo=treino&obj=${o.code}`,
    });
  }
  if (!pool.length) out.push({ tipo: 'prova', titulo: 'Você está acima da meta em tudo que liberou', texto: 'Hora de um simulado oficial completo, com cronômetro.', acao: '#/novo?modo=oficial&exame=101' });
  return out;
}
