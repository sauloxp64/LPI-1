// 107.2 — agendamento: cron (crontab, /etc/crontab, cron.d), at/atq/atrm, cron.allow/deny, at.allow/deny e timers do systemd.
import { mcq, multi, block, pad } from './util.mjs';
import { sq, USERS, pyCron, cronNext, cronPrev, cronValues, toMin, fromMin, fmtMin, fmtMinDow, listPt, MON_PT } from './admin-lib.mjs';

const hm = (h, m) => `${pad(h)}:${pad(m)}`;
const DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const todo = (d) => `${d === 0 || d === 6 ? 'todo' : 'toda'} ${DIA[d]}`;
const isRun = (a) => a.length > 1 && a.every((v, i) => i === 0 || v === a[i - 1] + 1);

// ------------------------------------------------------------------ descrição em português de uma expressão cron
function timePart(fm, fh) {
  const M = cronValues(fm, 'min'); const H = cronValues(fh, 'hour');
  const stepM = /^\*\/(\d+)$/.exec(fm); const stepH = /^\*\/(\d+)$/.exec(fh);
  if (fm === '*' && fh === '*') return 'a cada minuto';
  if (stepM && fh === '*') return `a cada ${stepM[1]} minutos`;
  if (fh === '*') return M.length === 1 ? `no minuto ${M[0]} de cada hora` : `nos minutos ${listPt(M)} de cada hora`;
  if (fm === '*') return `a cada minuto, entre ${hm(H[0], 0)} e ${hm(H[H.length - 1], 59)}`;
  if (stepM) return `a cada ${stepM[1]} minutos, das ${hm(H[0], 0)} às ${hm(H[H.length - 1], 59)}`;
  if (stepH) return M.length === 1 ? `no minuto ${M[0]}, de ${stepH[1]} em ${stepH[1]} horas (a partir de 00h)` : `nos minutos ${listPt(M)}, de ${stepH[1]} em ${stepH[1]} horas`;
  if (M.length === 1 && isRun(H)) return `no minuto ${M[0]} de cada hora, das ${hm(H[0], M[0])} às ${hm(H[H.length - 1], M[0])}`;
  const times = H.flatMap((h) => M.map((m) => hm(h, m)));
  return times.length <= 6 ? `às ${listPt(times)}` : `nas horas ${listPt(H)}, nos minutos ${listPt(M)}`;
}
function dayPart(fd, fo, fw) {
  const D = cronValues(fd, 'dom'); const O = cronValues(fo, 'mon'); const W = cronValues(fw, 'dow');
  const months = fo === '*' ? '' : listPt(O.map((m) => MON_PT[m - 1]));
  if (fd === '*' && fw === '*') return months ? `todos os dias, em ${months}` : 'todos os dias';
  let day;
  if (fd === '*') {
    if (W.length === 1) day = todo(W[0]);
    else if (W.join() === '1,2,3,4,5') day = 'de segunda a sexta-feira';
    else if (W.join() === '0,6') day = 'aos sábados e domingos';
    else if (isRun(W)) day = `de ${DIA[W[0]]} a ${DIA[W[W.length - 1]]}`;
    else day = listPt(W.map(todo));
    return months ? `${day}, em ${months}` : day;
  }
  if (D.length === 1) day = `no dia ${D[0]}`; else if (isRun(D)) day = `do dia ${D[0]} ao dia ${D[D.length - 1]}`; else day = `nos dias ${listPt(D)}`;
  return months ? `${day}, em ${months}` : `${day} de cada mês`;
}
export function describeCron(expr) {
  const [fm, fh, fd, fo, fw] = expr.trim().split(/\s+/);
  return `${timePart(fm, fh)}, ${dayPart(fd, fo, fw)}`;
}

// ------------------------------------------------------------------ modelos de expressão (com um "oráculo" independente: pred)
const MINS = [0, 5, 10, 15, 20, 30, 45];
const NAMES3 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TEMPLATES = [
  (r) => { const m = r.pick(MINS); const h = r.int(0, 23); return { expr: `${m} ${h} * * *`, alts: [`${pad(m)} ${pad(h)} * * *`], pred: (x) => x.mi === m && x.h === h }; },
  (r) => { const m = r.pick(MINS); const h = r.int(5, 22); return { expr: `${m} ${h} * * 1-5`, alts: [`${m} ${h} * * mon-fri`, `${m} ${h} * * 1,2,3,4,5`, `${m} ${h} * * Mon-Fri`], pred: (x) => x.mi === m && x.h === h && x.dow >= 1 && x.dow <= 5 }; },
  (r) => { const m = r.pick(MINS); const h = r.int(0, 23); return { expr: `${m} ${h} * * 6,0`, alts: [`${m} ${h} * * 0,6`, `${m} ${h} * * sat,sun`, `${m} ${h} * * 6,7`], pred: (x) => x.mi === m && x.h === h && (x.dow === 0 || x.dow === 6) }; },
  (r) => { const m = r.pick(MINS); const h = r.int(0, 23); const days = r.sample([0, 1, 2, 3, 4, 5, 6], r.int(2, 3)).sort((a, b) => a - b); return { expr: `${m} ${h} * * ${days.join(',')}`, alts: [`${m} ${h} * * ${days.map((d) => NAMES3[d]).join(',')}`], pred: (x) => x.mi === m && x.h === h && days.includes(x.dow) }; },
  (r) => { const m = r.pick(MINS); const h = r.int(0, 23); const d = r.int(0, 6); return { expr: `${m} ${h} * * ${d}`, alts: [`${m} ${h} * * ${NAMES3[d]}`, ...(d === 0 ? [`${m} ${h} * * 7`] : [])], pred: (x) => x.mi === m && x.h === h && x.dow === d }; },
  (r) => { const n = r.pick([5, 10, 15, 20, 30]); const alt = { 30: ['0,30 * * * *'], 15: ['0,15,30,45 * * * *'], 20: ['0,20,40 * * * *'], 10: ['0,10,20,30,40,50 * * * *'] }[n] ?? []; return { expr: `*/${n} * * * *`, alts: alt, pred: (x) => x.mi % n === 0 }; },
  (r) => { const a = r.pick([7, 8, 9]); const b = r.pick([17, 18, 19]); return { expr: `0 ${a}-${b} * * 1-5`, alts: [`0 ${a}-${b} * * mon-fri`, `0 ${a}-${b} * * 1,2,3,4,5`], pred: (x) => x.mi === 0 && x.h >= a && x.h <= b && x.dow >= 1 && x.dow <= 5 }; },
  (r) => { const n = r.pick([2, 3, 4, 6, 8, 12]); const alt = { 12: ['0 0,12 * * *'], 6: ['0 0,6,12,18 * * *'], 8: ['0 0,8,16 * * *'], 4: ['0 0,4,8,12,16,20 * * *'] }[n] ?? []; return { expr: `0 */${n} * * *`, alts: alt, pred: (x) => x.mi === 0 && x.h % n === 0 }; },
  (r) => { const m = r.pick(MINS); const h = r.int(0, 23); const d = r.pick([1, 5, 10, 15, 20, 25, 28]); return { expr: `${m} ${h} ${d} * *`, alts: [], pred: (x) => x.mi === m && x.h === h && x.d === d }; },
  (r) => { const m = r.pick(MINS); const h = r.int(0, 23); const [a, b] = r.pick([[1, 15], [10, 25], [5, 20], [1, 16]]); return { expr: `${m} ${h} ${a},${b} * *`, alts: [], pred: (x) => x.mi === m && x.h === h && (x.d === a || x.d === b) }; },
  (r) => { const m = r.pick(MINS); const h = r.int(0, 23); const d = r.int(1, 28); const mo = r.int(1, 12); return { expr: `${m} ${h} ${d} ${mo} *`, alts: [`${m} ${h} ${d} ${MON3[mo - 1]} *`], pred: (x) => x.mi === m && x.h === h && x.d === d && x.m === mo }; },
  (r) => { const m = r.pick(MINS); const h = r.int(0, 23); return { expr: `${m} ${h} 1 1,4,7,10 *`, alts: [`${m} ${h} 1 */3 *`, `${m} ${h} 1 jan,apr,jul,oct *`], pred: (x) => x.mi === m && x.h === h && x.d === 1 && [1, 4, 7, 10].includes(x.m) }; },
  (r) => { const n = r.pick([10, 15, 20, 30]); const a = r.pick([8, 9]); const b = r.pick([17, 18]); return { expr: `*/${n} ${a}-${b} * * 1-5`, alts: [`*/${n} ${a}-${b} * * mon-fri`], pred: (x) => x.mi % n === 0 && x.h >= a && x.h <= b && x.dow >= 1 && x.dow <= 5 }; },
  (r) => { const h = r.int(0, 23); return { expr: `0,15,30,45 ${h} * * *`, alts: [`*/15 ${h} * * *`], pred: (x) => x.h === h && x.mi % 15 === 0 }; },
  (r) => { const m = r.pick(MINS); const [h1, h2] = r.pick([[8, 20], [6, 18], [9, 21], [7, 19]]); const d = r.int(0, 6); return { expr: `${m} ${h1},${h2} * * ${d}`, alts: [`${m} ${h1},${h2} * * ${NAMES3[d]}`], pred: (x) => x.mi === m && (x.h === h1 || x.h === h2) && x.dow === d }; },
];
const mkTemplate = (rng) => rng.pick(TEMPLATES)(rng);

/** Variações plausíveis de uma expressão: um erro típico por vez. */
function neighbors(expr) {
  const f = expr.split(' '); const out = [];
  const put = (o) => f.map((v, i) => (i in o ? o[i] : v)).join(' ');
  const num = (s) => /^\d+$/.test(s);
  const step = (s) => /^\*\/(\d+)$/.exec(s);
  const day = f[2] === '*' && f[4] === '*';
  if (num(f[0]) && num(f[1]) && Number(f[0]) <= 23 && Number(f[1]) <= 23 && f[0] !== f[1]) out.push(put({ 0: f[1], 1: f[0] })); // minuto <-> hora
  if (f[4] !== '*' && /^[\d,-]+$/.test(f[4])) for (const k of [1, -1]) out.push(put({ 4: f[4].replace(/\d+/g, (v) => String(((Number(v) + k) % 7 + 7) % 7)) })); // 0 = domingo x 1 = segunda
  if (f[2] === '*' && f[4] !== '*') out.push(put({ 4: '*' })); // esqueceu a restrição de dia da semana
  if (f[2] === '*' && num(f[4])) out.push(put({ 2: f[4], 4: '*' })); // dia da semana no campo do dia do mês
  if (f[4] === '*' && num(f[2]) && Number(f[2]) <= 6) out.push(put({ 2: '*', 4: f[2] })); // dia do mês no campo do dia da semana
  if (f[2] !== '*' && f[4] === '*') out.push(put({ 2: '*' }));
  if (num(f[2]) && num(f[3]) && Number(f[2]) <= 12 && f[2] !== f[3]) out.push(put({ 2: f[3], 3: f[2] })); // dia <-> mês
  if (day) out.push(put({ 4: '1-5' }), put({ 4: '0' }), put({ 2: '1' }));
  let m = step(f[0]); if (m && f[1] === '*') out.push(put({ 0: m[1] }), put({ 0: '*/' + String(Number(m[1]) * 2) }), put({ 0: '*/' + String(Math.max(1, Math.floor(Number(m[1]) / 2))) }));
  m = step(f[1]); if (m) out.push(put({ 1: m[1] }), put({ 1: '*/' + String(Number(m[1]) * 2) }));
  if (f[0] === '0' && num(f[1])) out.push(put({ 1: '*' }));
  if (f[0] === '0' && f[1] === '*') out.push(put({ 1: '0' }));
  m = /^(\d+)-(\d+)$/.exec(f[1]); if (m) out.push(put({ 1: `${m[1]}-${Number(m[2]) + (Number(m[2]) < 22 ? 2 : -2)}` }), put({ 1: `${Number(m[1]) + 1}-${m[2]}` }));
  if (num(f[0]) && num(f[1])) out.push(put({ 0: '*' }));
  if (num(f[1])) out.push(put({ 1: String((Number(f[1]) + 12) % 24) })); // AM x PM
  if (/^\d+(,\d+)+$/.test(f[0])) out.push(put({ 0: '*/' + (Number(f[0].split(',')[1]) - Number(f[0].split(',')[0])) * 2 }));
  return out.filter((e) => e !== expr);
}
const fireKey = (e, t0) => { const a = []; let t = t0; for (let i = 0; i < 80 && t !== null && t < t0 + 1440 * 400; i++) { t = cronNext(e, t); a.push(t); } return a.join(); };
/** descrições de vizinhos que realmente se comportam de forma diferente */
function wrongExprs(rng, expr, ref = toMin(2026, 3, 4, 10, 7)) {
  const base = fireKey(expr, ref); const seen = new Set([describeCron(expr)]); const out = [];
  for (const e of rng.shuffle(neighbors(expr))) {
    try { const d = describeCron(e); if (seen.has(d) || fireKey(e, ref) === base) continue; seen.add(d); out.push({ expr: e, desc: d }); } catch { /* expressão inválida: ignora */ }
  }
  return out;
}

const REFS = ['102:p.212-214', '102:p.224-225'];
const refTime = (rng) => toMin(2026, rng.int(1, 12), rng.int(1, 28), rng.int(0, 23), rng.int(0, 59));

/** verificação: o python (independente) deve gerar as mesmas próximas execuções que o oráculo (pred) do modelo */
function cronVerify(tpl, exprs, ref, n = 6) {
  const out = []; let t = ref;
  for (let guard = 0; out.length < n && guard < 60 * 24 * 366 * 7; guard++) { t++; if (tpl.pred(fromMin(t))) out.push(fmtMin(t)); }
  return { sh: pyCron(exprs, fmtMin(ref), n), expect: exprs.map(() => out.join(',')).join('\n') };
}

const gCronExplain = {
  id: 'cron-expressao-descricao', obj: '107.2', nivel: 2, peso: 3,
  make(rng) {
    const ref = toMin(2026, 3, 4, 10, 7);
    let tpl; let wrong = [];
    for (let tries = 0; tries < 10 && wrong.length < 3; tries++) { tpl = mkTemplate(rng); wrong = wrongExprs(rng, tpl.expr); }
    if (wrong.length < 3) throw new Error('poucos vizinhos');
    const desc = describeCron(tpl.expr);
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    if (rng.chance(0.5)) {
      return {
        type: 'unica',
        text: `Em um crontab de usuário (\`crontab -e\`) aparece a entrada:\n\n${block(`${tpl.expr} /home/ana/rotina.sh`)}\n\nQuando o script é executado? (campos: minuto hora dia-do-mês mês dia-da-semana)`,
        options: mcq(rng, cap(desc), wrong.map((w) => cap(w.desc))),
        explanation: `Os cinco primeiros campos são **minuto (0-59), hora (0-23), dia do mês (1-31), mês (1-12) e dia da semana (0-7, com 0 e 7 = domingo)**; o resto da linha é o comando. \`${tpl.expr}\` → ${desc}. Operadores: \`*\` qualquer valor, \`,\` lista, \`-\` intervalo, \`/\` passo (\`*/15\` = a cada 15).`,
        ref: REFS, verify: cronVerify(tpl, [tpl.expr], ref),
      };
    }
    return {
      type: 'unica',
      text: `Qual entrada de crontab de usuário executa o script **${desc}**?`,
      options: mcq(rng, `${tpl.expr} /home/ana/rotina.sh`, wrong.map((w) => `${w.expr} /home/ana/rotina.sh`)),
      explanation: `Ordem dos campos: minuto, hora, dia do mês, mês, dia da semana. Para "${desc}" a expressão é \`${tpl.expr}\`. Armadilhas: trocar minuto e hora, confundir dia do mês (3º) com dia da semana (5º, onde 0 e 7 = domingo e 1 = segunda), e confundir \`*/N\` (a cada N) com o valor fixo \`N\`.`,
      ref: REFS, verify: cronVerify(tpl, [tpl.expr], ref),
    };
  },
};

const gCronWrite = {
  id: 'cron-escrever-expressao', obj: '107.2', nivel: 2, peso: 2,
  make(rng) {
    const tpl = mkTemplate(rng); const ref = refTime(rng);
    const all = [...new Set([tpl.expr, ...tpl.alts])];
    return {
      type: 'lacuna',
      text: `Complete os **cinco campos de tempo** da entrada de crontab para que o comando rode **${describeCron(tpl.expr)}**:\n\n\`____ /usr/local/bin/tarefa.sh\``,
      answers: all,
      explanation: `Ordem: minuto, hora, dia do mês, mês, dia da semana. Uma resposta correta é \`${tpl.expr}\`${all.length > 1 ? `; formas equivalentes aceitas: ${all.slice(1).map((a) => `\`${a}\``).join(', ')}` : ''}. Lembre: no 5º campo 0 e 7 são domingo, 1 = segunda … 6 = sábado.`,
      ref: REFS, verify: cronVerify(tpl, all, ref),
    };
  },
};

const gCronNext = {
  id: 'cron-proxima-execucao', obj: '107.2', nivel: 3, peso: 3,
  make(rng) {
    const tpl = mkTemplate(rng); const ref = refTime(rng);
    const sec = rng.int(0, 59);
    const nx = cronNext(tpl.expr, ref); const nx2 = cronNext(tpl.expr, nx); const pv = cronPrev(tpl.expr, ref + 1);
    const alt = wrongExprs(rng, tpl.expr, ref).map((w) => cronNext(w.expr, ref));
    const xr = fromMin(ref);
    const pool = [pv, nx2, ...alt, nx + 1440, nx - 1440, nx + 60].filter((v) => v && v !== nx);
    const fmtRef = `${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][xr.dow]}-feira`.replace('domingo-feira', 'domingo').replace('sábado-feira', 'sábado');
    return {
      type: 'unica',
      text: `Em um servidor, o \`cron\` tem a seguinte entrada no crontab de um usuário:\n\n${block(`${tpl.expr} /home/ana/rotina.sh`)}\n\nAgora são **${fmtMin(ref).slice(0, 10)} ${hm(xr.h, xr.mi)}:${pad(sec)}** (${fmtRef}). Quando ocorrerá a **próxima** execução?`,
      options: mcq(rng, fmtMinDow(nx), pool.map(fmtMinDow)),
      explanation: `Interpretação: ${describeCron(tpl.expr)}. Procurando a primeira data/hora **posterior a ${hm(xr.h, xr.mi)}:${pad(sec)}** que satisfaça os cinco campos, o resultado é **${fmtMinDow(nx)}**. A execução anterior foi ${fmtMinDow(pv)} e a seguinte será ${fmtMinDow(nx2)}. Lembre: dia da semana 0/7 = domingo, 1 = segunda.`,
      ref: REFS, verify: cronVerify(tpl, [tpl.expr], ref, 3).sh ? { sh: pyCron(tpl.expr, fmtMin(ref), 1), expect: fmtMin(nx) } : null,
    };
  },
};

// ------------------------------------------------------------------ linhas válidas/ inválidas (verificadas com o crontab real)
const CMDS = ['/usr/local/bin/backup.sh', '/home/ana/relatorio.sh', '/opt/scripts/limpa.sh >/dev/null 2>&1', 'tar czf /backup/home.tgz /home', '/usr/bin/php /var/www/cron.php'];
function badLine(rng, cmd) {
  const k = rng.int(0, 7);
  const f = ['0', '*', '*', '*', '*'];
  const pick = {
    0: () => { f[0] = String(rng.int(60, 75)); f[1] = String(rng.int(0, 23)); return `minuto ${f[0]} (o máximo é 59)`; },
    1: () => { f[0] = '0'; f[1] = String(rng.int(24, 30)); return `hora ${f[1]} (o máximo é 23)`; },
    2: () => { f[0] = '0'; f[1] = String(rng.int(0, 23)); f[2] = rng.pick(['0', '32', '35']); return `dia do mês ${f[2]} (vai de 1 a 31)`; },
    3: () => { f[0] = '0'; f[1] = String(rng.int(0, 23)); f[3] = rng.pick(['0', '13', '14']); return `mês ${f[3]} (vai de 1 a 12)`; },
    4: () => { f[0] = '0'; f[1] = String(rng.int(0, 23)); f[4] = rng.pick(['8', '9']); return `dia da semana ${f[4]} (vai de 0 a 7)`; },
    5: () => { f[0] = '*/0'; return 'passo `*/0` no minuto'; },
    6: () => { f[0] = '0'; f[1] = '*'; f[3] = 'janeiro'; return 'mês escrito por extenso (só as 3 primeiras letras em inglês: jan, feb…)'; },
    7: () => { f[0] = '0'; f[1] = '*'; f[4] = 'segunda'; return 'dia da semana em português (só mon, tue… em inglês)'; },
  }[k]();
  return { line: `${f.join(' ')} ${cmd}`, why: pick };
}
function goodLine(rng, cmd) {
  const e = rng.pick([() => { const t = mkTemplate(rng); return t.expr; }, () => rng.pick(['@daily', '@reboot', '@hourly', '@weekly', '@monthly'])])();
  return `${e} ${cmd}`;
}
function crontabVerify(lines) {
  const sh = lines.map((l, i) => `printf '%s\\n' ${sq(l.line)} > /tmp/zzc${i}; if crontab /tmp/zzc${i} >/dev/null 2>&1; then echo ok; else echo erro; fi`).join('\n') + '\ncrontab -r 2>/dev/null; rm -f /tmp/zzc*';
  return { sh, expect: lines.map((l) => (l.ok ? 'ok' : 'erro')).join('\n') };
}
const gCronValid = {
  id: 'cron-linha-valida', obj: '107.2', nivel: 2, peso: 2,
  make(rng) {
    const cmd = rng.pick(CMDS);
    if (rng.chance(0.5)) {
      const good = { line: goodLine(rng, cmd), ok: true };
      const bads = []; const whys = new Set();
      while (bads.length < 3) { const b = badLine(rng, cmd); if (!whys.has(b.why.slice(0, 6))) { whys.add(b.why.slice(0, 6)); bads.push({ ...b, ok: false }); } }
      const lines = [good, ...bads];
      return {
        type: 'unica',
        text: `Qual das linhas abaixo é **aceita** pelo comando \`crontab\` (por exemplo, ao salvar com \`crontab -e\`)?`,
        options: lines.map((l) => ({ t: l.line, ok: l.ok })),
        explanation: `Faixas válidas dos campos: minuto 0-59, hora 0-23, dia do mês 1-31, mês 1-12 (ou jan…dec) e dia da semana 0-7 (ou sun…sat; 0 e 7 = domingo). Atalhos como \`@daily\`, \`@hourly\`, \`@reboot\` substituem os cinco campos. Problemas nas outras: ${bads.map((b) => b.why).join('; ')}.`,
        ref: REFS, verify: crontabVerify(lines),
      };
    }
    const goods = [{ line: goodLine(rng, cmd), ok: true }, { line: goodLine(rng, cmd), ok: true }, { line: goodLine(rng, cmd), ok: true }];
    const gl = new Set(); goods.forEach((g, i) => { while (gl.has(g.line)) g.line = `${i + 3} ${i + 5} * * * ${cmd}`; gl.add(g.line); });
    const bads = []; const whys = new Set();
    const nb = rng.int(2, 3);
    while (bads.length < nb) { const b = badLine(rng, cmd); if (!whys.has(b.why.slice(0, 6))) { whys.add(b.why.slice(0, 6)); bads.push({ ...b, ok: false }); } }
    const lines = [...bads, ...goods.slice(0, 5 - nb)];
    return {
      type: 'multipla',
      text: `Quais das linhas abaixo seriam **rejeitadas** pelo \`crontab\` ao instalar o arquivo (erro de sintaxe)?`,
      options: lines.map((l) => ({ t: l.line, ok: !l.ok })),
      explanation: `Faixas válidas: minuto 0-59, hora 0-23, dia do mês 1-31, mês 1-12 (ou jan…dec) e dia da semana 0-7 (ou sun…sat). As rejeitadas: ${bads.map((b) => `\`${b.line.split(' ').slice(0, 5).join(' ')}\` (${b.why})`).join('; ')}.`,
      ref: REFS, verify: crontabVerify(lines),
    };
  },
};

// ------------------------------------------------------------------ crontab de sistema × de usuário
const gCronSys = {
  id: 'cron-formato-sistema', obj: '107.2', nivel: 2, peso: 2,
  make(rng) {
    const m = rng.pick(MINS); const h = rng.int(0, 23); const cmd = rng.pick(['/usr/local/bin/backup.sh', '/root/limpa.sh >> /var/log/limpa.log 2>&1', '/opt/app/rotina.sh']);
    const user = rng.pick(['root', 'root', 'www-data', 'backup']);
    const kind = rng.pick(['sistema', 'sistema', 'usuario']);
    const t = `${m} ${h} * * *`;
    const withUser = `${t} ${user} ${cmd}`; const noUser = `${t} ${cmd}`;
    if (kind === 'sistema') {
      const file = rng.pick(['/etc/crontab', '/etc/cron.d/backup']);
      return {
        type: 'unica',
        text: `Qual linha está no formato correto para ser colocada em \`${file}\` e executar o comando todo dia às ${hm(h, m)} como \`${user}\`?`,
        options: mcq(rng, withUser, [noUser, `${user} ${t} ${cmd}`, `${m} ${h} * * * ${cmd} ${user}`, `0 ${m} ${h} * * * ${user} ${cmd}`]),
        explanation: `Os crontabs de **sistema** (\`/etc/crontab\` e os arquivos de \`/etc/cron.d/\`) têm **sete campos** antes do comando: minuto, hora, dia do mês, mês, dia da semana, **usuário** e comando. Já o crontab de usuário (editado com \`crontab -e\`, guardado em /var/spool/cron) não tem o campo de usuário — o job roda como o dono do crontab. Para este caso: \`${withUser}\`.`,
        ref: ['102:p.213-214', '102:p.216'],
      };
    }
    return {
      type: 'unica',
      text: `Qual linha está no formato correto para o crontab de **usuário** (\`crontab -e\`, executando como o próprio dono) rodar o comando todo dia às ${hm(h, m)}?`,
      options: mcq(rng, noUser, [withUser, `${user} ${t} ${cmd}`, `${t} ${cmd} ${user}`, `${m} ${h} * * ${cmd}`]),
      explanation: `O crontab de usuário (criado/editado com \`crontab -e\`, armazenado em /var/spool/cron) tem **cinco campos de tempo + comando**, sem campo de usuário: o job roda sempre com os privilégios do dono. O campo extra de usuário só existe em \`/etc/crontab\` e nos arquivos de \`/etc/cron.d/\`. Colocar o nome do usuário num crontab de usuário faria o cron tentar executar "${user}" como se fosse o comando.`,
      ref: ['102:p.212-214', '102:p.216'],
    };
  },
};

// ------------------------------------------------------------------ atalhos, diretórios e opções do crontab (conceitual)
const SHORT = [['@hourly', '0 * * * *', 'a cada hora, no minuto 0'], ['@daily', '0 0 * * *', 'todo dia à meia-noite'], ['@midnight', '0 0 * * *', 'todo dia à meia-noite'], ['@weekly', '0 0 * * 0', 'todo domingo à meia-noite'], ['@monthly', '0 0 1 * *', 'no dia 1 de cada mês, à meia-noite'], ['@yearly', '0 0 1 1 *', 'em 1º de janeiro, à meia-noite'], ['@annually', '0 0 1 1 *', 'em 1º de janeiro, à meia-noite']];
const ONCAL = [['hourly', '*-*-* *:00:00', 'no início de cada hora'], ['daily', '*-*-* 00:00:00', 'todo dia à meia-noite'], ['weekly', 'Mon *-*-* 00:00:00', 'toda segunda-feira à meia-noite'], ['monthly', '*-*-01 00:00:00', 'no dia 1 de cada mês, à meia-noite'], ['yearly', '*-01-01 00:00:00', 'em 1º de janeiro, à meia-noite']];
const gCronShort = {
  id: 'cron-atalhos-diretorios', obj: '107.2', nivel: 1, peso: 2,
  make(rng) {
    const fmt = rng.pick(['atalho', 'atalho', 'oncalendar', 'diretorios', 'semana']);
    if (fmt === 'atalho') {
      const s = rng.pick(SHORT);
      const pool = SHORT.filter((x) => x[1] !== s[1]).map((x) => x[1]);
      if (rng.chance(0.5)) {
        return {
          type: 'unica',
          text: `Em um crontab, o atalho \`${s[0]}\` equivale a qual especificação de tempo (minuto hora dia mês dia-da-semana)?`,
          options: mcq(rng, s[1], [...pool, '0 0 * * 1', '0 0 1 1 0', '@reboot']),
          explanation: `Atalhos do cron: \`@hourly\` = \`0 * * * *\`; \`@daily\`/\`@midnight\` = \`0 0 * * *\`; \`@weekly\` = \`0 0 * * 0\` (domingo); \`@monthly\` = \`0 0 1 * *\`; \`@yearly\`/\`@annually\` = \`0 0 1 1 *\`; \`@reboot\` roda uma vez na inicialização do sistema. Aqui \`${s[0]}\` → \`${s[1]}\` (${s[2]}).`,
          ref: ['102:p.214', '102:p.224'],
        };
      }
      return {
        type: 'unica',
        text: `Qual atalho de crontab executa a tarefa **${s[2]}**?`,
        options: mcq(rng, s[0], SHORT.filter((x) => x[1] !== s[1]).map((x) => x[0]).concat(['@reboot', '@boot'])),
        explanation: `\`@hourly\` = \`0 * * * *\`; \`@daily\` = \`0 0 * * *\`; \`@weekly\` = \`0 0 * * 0\`; \`@monthly\` = \`0 0 1 * *\`; \`@yearly\` = \`0 0 1 1 *\`. "${s[2]}" corresponde a \`${s[0]}\` (\`${s[1]}\`).`,
        ref: ['102:p.214', '102:p.224'],
      };
    }
    if (fmt === 'oncalendar') {
      const s = rng.pick(ONCAL);
      return {
        type: 'unica',
        text: `Em um arquivo \`.timer\` do systemd, a diretiva \`OnCalendar=${s[0]}\` equivale a qual forma normalizada (longa)?`,
        options: mcq(rng, s[1], ONCAL.filter((x) => x[1] !== s[1]).map((x) => x[1]).concat(['Sun *-*-* 00:00:00'])),
        explanation: `Expressões especiais de \`OnCalendar=\`: hourly = \`*-*-* *:00:00\`; daily = \`*-*-* 00:00:00\`; weekly = \`Mon *-*-* 00:00:00\` (segunda-feira!); monthly = \`*-*-01 00:00:00\`; yearly = \`*-01-01 00:00:00\`. Atenção: o \`@weekly\` do cron roda no **domingo**, o \`weekly\` do systemd na **segunda**.`,
        ref: ['102:p.218-219', '102:p.224'],
      };
    }
    if (fmt === 'semana') {
      const cron = rng.chance(0.5);
      return {
        type: 'unica',
        text: cron ? 'Em que dia da semana o atalho `@weekly` de um crontab dispara (à meia-noite)?' : 'Em que dia da semana a diretiva `OnCalendar=weekly` de um timer do systemd dispara (à meia-noite)?',
        options: mcq(rng, cron ? 'Domingo' : 'Segunda-feira', ['Domingo', 'Segunda-feira', 'Sábado', 'Sexta-feira'].filter((x) => x !== (cron ? 'Domingo' : 'Segunda-feira')).concat(['Quarta-feira'])),
        explanation: `\`@weekly\` no cron equivale a \`0 0 * * 0\` → domingo. Já \`OnCalendar=weekly\` no systemd equivale a \`Mon *-*-* 00:00:00\` → segunda-feira. É uma pegadinha clássica: os dois "semanais" não coincidem.`,
        ref: ['102:p.214', '102:p.219'],
      };
    }
    const facts = [
      ['Em qual diretório ficam os crontabs dos usuários criados com `crontab -e` (em várias distribuições)?', '/var/spool/cron (ou subdiretório, como /var/spool/cron/crontabs)', ['/etc/cron.d', '/etc/crontab', '/etc/cron.daily', '/home/<usuario>/.cron']],
      ['Que arquivo e que diretório guardam os crontabs de **sistema**, que têm o campo extra de usuário?', '/etc/crontab e os arquivos de /etc/cron.d/', ['/var/spool/cron e /etc/cron.daily', '/etc/cron.allow e /etc/cron.deny', '/etc/cron.hourly e /etc/at.deny', '/var/spool/cron/crontabs apenas']],
      ['Um script executável precisa rodar uma vez por dia sem escrever uma linha de crontab. Onde colocá-lo?', 'em /etc/cron.daily/', ['em /etc/cron.d/', 'em /var/spool/cron/', 'em /etc/cron.allow', 'em /etc/crontab.daily/']],
      ['Qual comando do usuário comum **edita** o próprio crontab?', 'crontab -e', ['crontab -l', 'crontab -r', 'crontab -u', 'cron -e']],
      ['Qual comando **lista** o crontab do próprio usuário?', 'crontab -l', ['crontab -e', 'crontab -r', 'crontab -s', 'cron -l']],
      ['Qual comando **remove** o crontab inteiro do usuário atual?', 'crontab -r', ['crontab -d', 'crontab -e', 'crontab -l', 'crontab -x']],
      ['Como o root lista o crontab do usuário `ana`?', 'crontab -u ana -l', ['crontab -l ana', 'crontab ana -l', 'crontab -e ana', 'su -c cron ana']],
      ['O que significa `MAILTO=""` no início de um crontab?', 'a saída dos jobs não será enviada por e-mail a ninguém', ['os jobs não executarão', 'o e-mail irá para o root', 'os jobs executarão como usuário vazio', 'o crontab será ignorado']],
      ['Qual variável do crontab define o shell usado para executar os comandos (padrão /bin/sh)?', 'SHELL', ['HOME', 'MAILTO', 'PATH', 'USER']],
      ['O que o atalho `@reboot` faz?', 'executa o comando uma vez, quando o sistema é inicializado', ['executa o comando a cada reinicialização do cron a cada minuto', 'executa todo domingo à meia-noite', 'executa antes do shutdown', 'só funciona em /etc/crontab']],
    ];
    const f = rng.pick(facts);
    return {
      type: 'unica', text: f[0], options: mcq(rng, f[1], f[2]),
      explanation: `Crontab de usuário: \`crontab -e\` (editar), \`-l\` (listar), \`-r\` (remover), \`-u usuário\` (apenas root). Os arquivos de usuário ficam sob /var/spool/cron; os de sistema são /etc/crontab e /etc/cron.d/*, e os scripts periódicos ficam em /etc/cron.{hourly,daily,weekly,monthly}/. Resposta: ${f[1]}.`,
      ref: ['102:p.213-217'],
    };
  },
};

// ------------------------------------------------------------------ crontab: opções (verificado)
const gCrontabOpt = {
  id: 'cron-opcoes-crontab', obj: '107.2', nivel: 2, peso: 1,
  make(rng) {
    const u = rng.pick(USERS); const cmd = rng.pick(['/opt/rotina.sh', '/usr/bin/date >> /tmp/data.txt']);
    const asks = [
      { q: `O root precisa **listar** o crontab do usuário \`${u}\`. Qual comando usar?`, ok: `crontab -u ${u} -l`, bad: [`crontab -l ${u}`, `crontab -e ${u}`, `crontab ${u} -l`, `cat /etc/crontab | grep ${u}`], run: `sudo crontab -u ${u} -l | grep -c rotina`, expect: '1' },
      { q: `O root precisa **remover** todo o crontab do usuário \`${u}\`. Qual comando usar?`, ok: `crontab -u ${u} -r`, bad: [`crontab -r ${u}`, `crontab -d ${u}`, `rm /etc/crontab ${u}`, `crontab -e -r ${u}`], run: `sudo crontab -u ${u} -r; sudo crontab -u ${u} -l 2>&1 | grep -c 'no crontab'`, expect: '1' },
    ];
    const a = rng.pick(asks);
    const sh = [`${rmUsr(u)}; sudo useradd -M ${u} 2>/dev/null`, `printf '* * * * * /opt/rotina.sh\\n' > /tmp/zzc.cron`, `sudo crontab -u ${u} /tmp/zzc.cron`, a.run, `sudo crontab -u ${u} -r 2>/dev/null; ${rmUsr(u)}; rm -f /tmp/zzc.cron`].join('\n');
    return {
      type: 'unica', text: a.q, options: mcq(rng, a.ok, a.bad),
      explanation: `A opção \`-u usuário\` (somente root) vem **antes** da ação: \`crontab -u ana -l\` lista, \`crontab -u ana -e\` edita e \`crontab -u ana -r\` remove. Sem \`-u\`, as ações valem para o crontab do próprio usuário que executa o comando.`,
      ref: ['102:p.216'], verify: { sh, expect: a.expect },
    };
  },
};
const rmUsr = (u) => `sudo userdel -r ${u} 2>/dev/null; sudo groupdel ${u} 2>/dev/null`;

// ------------------------------------------------------------------ acesso: cron.allow/deny e at.allow/deny (verificado)
const gAcesso = {
  id: 'sched-allow-deny', obj: '107.2', nivel: 3, peso: 3,
  make(rng) {
    const svc = rng.pick(['cron', 'at']);
    const users = rng.sample(USERS, 4);
    const state = rng.pick(['allow', 'allow', 'deny', 'deny', 'ambos', 'deny-vazio', 'allow-vazio']);
    const sub = (n) => rng.sample(users, n);
    let A = null; let D = null;
    if (state === 'allow') A = sub(rng.int(1, 3));
    if (state === 'deny') D = sub(rng.int(1, 3));
    if (state === 'ambos') { A = sub(2); D = rng.shuffle([A[0], users.find((x) => !A.includes(x))]); }
    if (state === 'deny-vazio') D = [];
    if (state === 'allow-vazio') A = [];
    const rule = (a, d, both) => users.filter((u) => (a ? a.includes(u) : d ? !d.includes(u) : true) && (both && d ? !d.includes(u) : true));
    const ok = users.filter((u) => (A ? A.includes(u) : !D.includes(u)));
    const fmtSet = (s) => (s.length === 0 ? 'ninguém (somente o root)' : s.length === users.length ? 'todos os quatro' : listPt(s.map((x) => `\`${x}\``)));
    const cmd = svc === 'cron' ? 'crontab' : 'at';
    const pool = [];
    if (A && D) { pool.push(users.filter((u) => A.includes(u) && !D.includes(u)), users.filter((u) => A.includes(u) || !D.includes(u))); }
    pool.push(users.filter((u) => !ok.includes(u)), users, []);
    if (A && !D) pool.push(users.filter((u) => !A.includes(u)));
    if (D && !A) pool.push(D);
    const key = (s) => [...s].sort().join();
    const wrong = []; const seen = new Set([key(ok)]);
    for (const s of rng.shuffle(pool)) if (!seen.has(key(s))) { seen.add(key(s)); wrong.push(s); }
    for (const s of rng.shuffle([rng.sample(users, 1), rng.sample(users, 2), rng.sample(users, 3)])) if (!seen.has(key(s))) { seen.add(key(s)); wrong.push(s); }
    const files = [A && `/etc/${svc}.allow` + (A.length ? ` contém: ${A.join(', ')}` : ' existe, mas está **vazio**'), D && `/etc/${svc}.deny` + (D.length ? ` contém: ${D.join(', ')}` : ' existe, mas está **vazio**')].filter(Boolean);
    const sh = [
      svc === 'at' ? '[ -f /tmp/zz.at.deny.bak ] || sudo cp -p /etc/at.deny /tmp/zz.at.deny.bak 2>/dev/null; sudo rm -f /etc/at.allow /etc/at.deny' : 'sudo rm -f /etc/cron.allow /etc/cron.deny',
      `for u in ${users.join(' ')}; do ${rmUsr('$u')}; sudo useradd -M $u 2>/dev/null; done`,
      A ? `printf '%s\\n' ${A.map(sq).join(' ')} | sudo tee /etc/${svc}.allow >/dev/null${A.length ? '' : '; sudo truncate -s0 /etc/' + svc + '.allow'}` : '',
      D ? `printf '%s\\n' ${D.map(sq).join(' ')} | sudo tee /etc/${svc}.deny >/dev/null${D.length ? '' : '; sudo truncate -s0 /etc/' + svc + '.deny'}` : '',
      `for u in ${users.join(' ')}; do if sudo -u $u ${svc === 'cron' ? 'crontab -l' : 'atq'} 2>&1 | grep -qE 'not allowed|permission'; then echo "$u=nao"; else echo "$u=sim"; fi; done | paste -sd' ' -`,
      svc === 'at' ? 'sudo rm -f /etc/at.allow /etc/at.deny; [ -f /tmp/zz.at.deny.bak ] && sudo cp -p /tmp/zz.at.deny.bak /etc/at.deny' : 'sudo rm -f /etc/cron.allow /etc/cron.deny',
      `for u in ${users.join(' ')}; do ${rmUsr('$u')}; done`,
    ].filter(Boolean).join('\n');
    const expect = users.map((u) => `${u}=${ok.includes(u) ? 'sim' : 'nao'}`).join(' ');
    return {
      type: 'unica',
      text: `Em um servidor Linux, existem os usuários comuns ${users.map((u) => `\`${u}\``).join(', ')}. Situação dos arquivos de controle de acesso ao \`${cmd}\`: ${files.join('; ')}${state === 'allow' || state === 'deny' || state === 'deny-vazio' || state === 'allow-vazio' ? '. O outro arquivo não existe' : ''}.\n\nQuais desses usuários conseguem agendar tarefas com \`${cmd}\`?`,
      options: mcq(rng, fmtSet(ok), wrong.map(fmtSet)),
      explanation: `Regra de ${svc}.allow/${svc}.deny: (1) se **${svc}.allow existir**, só os usuários listados nele podem usar o ${cmd} (e o ${svc}.deny é ignorado); (2) se não existir ${svc}.allow mas existir **${svc}.deny**, todos podem, exceto os listados; um ${svc}.deny **vazio** libera todos; (3) um ${svc}.allow vazio bloqueia todos os usuários comuns. O **root** nunca é barrado. Resultado aqui: ${fmtSet(ok)}.`,
      ref: svc === 'cron' ? ['102:p.217'] : ['102:p.231'],
      verify: { sh, expect },
    };
  },
};

// ------------------------------------------------------------------ at: especificações de tempo (verificado)
const AT_OK = ['now + 5 minutes', 'now + 90 minutes', 'now + 2 hours', 'now + 3 days', 'now + 2 weeks', 'teatime', 'noon', 'midnight', 'noon tomorrow', 'teatime tomorrow', '4pm', '16:00', '9am tomorrow', '10:30 AM October 31', '10:30 AM 31 October', '08:30 AM next week', '21:50 31.12.27', '10:30 2027-12-31', '10:30 12/31/27', '4pm + 3 days', '20:00 tomorrow', '10:00 Friday', '8pm today'];
const AT_BAD = ['midday', 'tomorrow noon', 'tomorrow 08:30 AM', 'tomorrow 20:00', '01-01-2020 07:30 PM', '10:15 PM 31/03/2031', 'now 5 minutes', '5 minutes', 'now tomorrow', '13pm', '4pm yesterday', '25:00'];
const gAtSpec = {
  id: 'at-especificacao-tempo', obj: '107.2', nivel: 2, peso: 3,
  make(rng) {
    const check = (list) => list.map((s, i) => `echo date > /tmp/zzat.sh; if at -f /tmp/zzat.sh ${s} >/tmp/zzat.out 2>&1; then echo ok; else echo erro; fi`).join('\n') + "\nfor j in $(atq | cut -f1); do atrm $j; done; rm -f /tmp/zzat.*";
    const exp = (list, okSet) => list.map((s) => (okSet.includes(s) ? 'ok' : 'erro')).join('\n');
    if (rng.chance(0.5)) {
      const good = rng.pick(AT_OK); const bads = rng.sample(AT_BAD, 3);
      const list = [good, ...bads];
      return {
        type: 'unica',
        text: `Qual das especificações de horário abaixo é **válida** para o comando \`at\` (ex.: \`at <especificação>\`)?`,
        options: list.map((s) => ({ t: s, ok: s === good })),
        explanation: `O \`at\` aceita a **hora primeiro** (HH:MM, 4pm, 9:30 AM, noon, midnight, teatime = 16:00), depois uma data opcional (\`October 31\`, \`2027-12-31\`, \`12/31/27\` MM/DD/YY, \`31.12.27\` DD.MM.YY, \`tomorrow\`, \`next week\`) e, por fim, um incremento \`+ N minutes|hours|days|weeks\`. Inválidas aqui: ${bads.map((b) => `\`${b}\``).join(', ')} (ordem errada — "tomorrow" vem *depois* da hora —, palavras inexistentes como "midday" ou formatos de data que o at não conhece, como DD/MM/AAAA e DD-MM-AAAA).`,
        ref: ['102:p.231', '102:p.236'], verify: { sh: check(list), expect: exp(list, [good]) },
      };
    }
    const goods = rng.sample(AT_OK, rng.int(2, 3)); const bads = rng.sample(AT_BAD, 5 - goods.length);
    const list = [...goods, ...bads];
    return {
      type: 'multipla',
      text: `Quais das especificações abaixo o comando \`at\` **aceita**?`,
      options: list.map((s) => ({ t: s, ok: goods.includes(s) })),
      explanation: `Formato geral: **hora** [data] [+ incremento]. Aceitas: ${goods.map((b) => `\`${b}\``).join(', ')}. As demais falham ("Garbled time"): ${bads.map((b) => `\`${b}\``).join(', ')} — palavras desconhecidas (midday), data antes da hora (tomorrow 08:30), formato de data não suportado (DD/MM/AAAA, DD-MM-AAAA) ou sintaxe de incremento incorreta (sem \`now +\`).`,
      ref: ['102:p.231', '102:p.236'], verify: { sh: check(list), expect: exp(list, goods) },
    };
  },
};

const AT_TIMES = [['teatime', '16:00'], ['noon', '12:00'], ['midnight', '00:00'], ['4pm', '16:00'], ['4:30pm', '16:30'], ['9am tomorrow', '09:00'], ['noon tomorrow', '12:00'], ['teatime tomorrow', '16:00'], ['8:15 PM', '20:15'], ['11 AM', '11:00'], ['12:00 AM', '00:00'], ['12:00 PM', '12:00'], ['7pm Friday', '19:00'], ['6:45 AM next week', '06:45'], ['10pm + 2 days', '22:00']];
const gAtHora = {
  id: 'at-hora-do-job', obj: '107.2', nivel: 2, peso: 2,
  make(rng) {
    const [spec, time] = rng.pick(AT_TIMES);
    const pool = ['16:00', '12:00', '00:00', '04:00', '09:00', '20:15', '08:15', '23:00', '16:30', '11:00', '06:45', '18:00', '19:00'].filter((x) => x !== time);
    const sh = `echo date > /tmp/zzat.sh; at -f /tmp/zzat.sh ${spec} 2>&1 | sed -n 's/^job [0-9]* at .* \\([0-9][0-9]:[0-9][0-9]\\):00 .*/\\1/p'; for j in $(atq | cut -f1); do atrm $j; done; rm -f /tmp/zzat.sh`;
    return {
      type: 'unica',
      text: `Um administrador executa \`at ${spec}\` e digita um comando no prompt. Em que **hora do dia** o job será executado?`,
      options: mcq(rng, time, pool),
      explanation: `\`teatime\` = 16:00, \`noon\` = 12:00 e \`midnight\` = 00:00. Com AM/PM: 12:00 AM é meia-noite (00:00), 12:00 PM é meio-dia, 4pm = 16:00. Palavras de data (\`tomorrow\`, \`next week\`, \`Friday\`, \`+ 2 days\`) só mudam o **dia**, não a hora. Para \`${spec}\` → **${time}**.`,
      ref: ['102:p.231'], verify: { sh, expect: time },
    };
  },
};

const gAtCmd = {
  id: 'at-comandos', obj: '107.2', nivel: 1, peso: 2,
  make(rng) {
    const n = rng.int(3, 40);
    const items = [
      { q: 'Qual comando **lista** os jobs `at` pendentes do usuário?', ok: 'atq', bad: ['atrm', 'at -c', 'batch', 'atd -l'], also: 'at -l é um alias de atq' },
      { q: `Qual comando **remove** o job \`at\` de número ${n}?`, ok: `atrm ${n}`, bad: [`atq ${n}`, `at -c ${n}`, `at -r ${n}`, `rm ${n}`], also: 'at -d é alias de atrm' },
      { q: `Qual comando **exibe os comandos** (e o ambiente) do job \`at\` ${n}?`, ok: `at -c ${n}`, bad: [`atq ${n}`, `at -l ${n}`, `atrm -c ${n}`, `at -s ${n}`], also: '' },
      { q: 'Qual opção do `at` lê os comandos do job a partir de um **arquivo** em vez da entrada padrão?', ok: 'at -f arquivo', bad: ['at -r arquivo', 'at -c arquivo', 'at -i arquivo', 'at -l arquivo'], also: '' },
      { q: 'Qual comando é semelhante ao `at`, mas só executa o job quando a **carga do sistema** está baixa?', ok: 'batch', bad: ['atq', 'nice', 'cron', 'atrm'], also: '' },
      { q: 'Qual daemon precisa estar em execução para que os jobs do `at` sejam executados?', ok: 'atd', bad: ['crond', 'atq', 'systemd-run', 'anacron'], also: '' },
      { q: 'Qual comando do systemd é a alternativa moderna ao `at` para uma tarefa única (ex.: daqui a 2 minutos)?', ok: 'systemd-run --on-active=2m comando', bad: ['systemctl at 2m comando', 'systemd-at 2m comando', 'systemctl start --in 2m comando'], also: '' },
    ];
    const it = rng.pick(items);
    let verify;
    if (it.ok.startsWith('atrm')) verify = { sh: `echo 'echo marcador' > /tmp/zzat.sh; at -f /tmp/zzat.sh now + 1 hour >/dev/null 2>&1; j=$(atq | cut -f1 | head -1); atrm $j; atq | wc -l; rm -f /tmp/zzat.sh`, expect: '0' };
    else if (it.ok.startsWith('at -c')) verify = { sh: `echo 'echo marcador' > /tmp/zzat.sh; at -f /tmp/zzat.sh now + 1 hour >/dev/null 2>&1; j=$(atq | cut -f1 | head -1); at -c $j | tail -n 2 | grep -c marcador; atrm $j; rm -f /tmp/zzat.sh`, expect: '1' };
    else if (it.ok === 'atq') verify = { sh: `echo date > /tmp/zzat.sh; at -f /tmp/zzat.sh now + 1 hour >/dev/null 2>&1; atq | wc -l; at -l | wc -l; atrm $(atq | cut -f1); rm -f /tmp/zzat.sh`, expect: '1\n1' };
    return {
      type: 'unica', text: it.q, options: mcq(rng, it.ok, it.bad),
      explanation: `Comandos do at: \`at\` agenda (hora + comandos até Ctrl+D), \`atq\` (= \`at -l\`) lista, \`atrm N\` (= \`at -d N\`) remove, \`at -c N\` mostra o conteúdo, \`at -f arquivo\` lê de um arquivo, \`batch\` espera a carga baixar; o daemon \`atd\` executa os jobs. Alternativa moderna: \`systemd-run\` (--on-calendar / --on-active). Resposta: \`${it.ok}\`.${it.also ? ' ' + it.also[0].toUpperCase() + it.also.slice(1) + '.' : ''}`,
      ref: ['102:p.229-230', '102:p.231-232'], ...(verify ? { verify } : {}),
    };
  },
};

// ------------------------------------------------------------------ timers do systemd (conceitual)
const CAL_PATTERNS = [
  (r) => { const h = r.int(0, 23); const m = r.pick([0, 15, 30, 45]); return { expr: `*-*-* ${hm(h, m)}:00`, desc: `todos os dias às ${hm(h, m)}`, wrong: () => [`*-*-* ${hm(m % 24, h % 60)}:00`, `Mon *-*-* ${hm(h, m)}:00`] }; },
  (r) => { const h = r.int(0, 23); return { expr: `Sat,Sun *-*-* ${hm(h, 0)}:00`, desc: `aos sábados e domingos às ${hm(h, 0)}`, wrong: () => [`Mon..Fri *-*-* ${hm(h, 0)}:00`, `*-*-* ${hm(h, 0)}:00`] }; },
  (r) => { const h = r.int(0, 23); return { expr: `Mon..Fri *-*-* ${hm(h, 30)}:00`, desc: `de segunda a sexta-feira às ${hm(h, 30)}`, wrong: () => [`Mon,Fri *-*-* ${hm(h, 30)}:00`, `Sat,Sun *-*-* ${hm(h, 30)}:00`] }; },
  (r) => { const h = r.int(0, 23); const m = r.pick([0, 15, 30]); return { expr: `*-*-01 ${hm(h, m)}:00`, desc: `no dia 1 de cada mês, às ${hm(h, m)}`, wrong: () => [`*-01-* ${hm(h, m)}:00`, `Mon *-*-1..7 ${hm(h, m)}:00`] }; },
  (r) => { const h = r.int(0, 23); return { expr: `*-*-01,15 ${hm(h, 0)}:00`, desc: `nos dias 1 e 15 de cada mês, às ${hm(h, 0)}`, wrong: () => [`*-01,15-* ${hm(h, 0)}:00`, `*-*-01..15 ${hm(h, 0)}:00`] }; },
  (r) => { const h = r.int(0, 23); return { expr: `Mon *-*-1..7 ${hm(h, 30)}:00`, desc: `na primeira segunda-feira de cada mês, às ${hm(h, 30)}`, wrong: () => [`Mon *-*-* ${hm(h, 30)}:00`, `*-*-01 ${hm(h, 30)}:00`] }; },
  (r) => { const n = r.pick([5, 10, 15, 20, 30]); return { expr: `*-*-* *:00/${pad(n)}:00`.replace(`00/${pad(n)}`, `00/${pad(n)}`), desc: `a cada ${n} minutos`, wrong: () => [`*-*-* 00/${pad(n)}:00:00`, `*-*-* *:${pad(n)}:00`] }; },
  (r) => { const n = r.pick([2, 3, 4, 6, 8, 12]); return { expr: `*-*-* 00/${n}:00:00`, desc: `a cada ${n} horas, a partir das 00:00 (no minuto 0)`, wrong: () => [`*-*-* *:00/${pad(n)}:00`, `*-*-* ${pad(n)}:00:00`] }; },
  (r) => { const mm = r.int(1, 12); return { expr: `*-${pad(mm)}-01 00:00:00`, desc: `em 1º de ${MON_PT[mm - 1]}, à meia-noite`, wrong: () => [`*-01-${pad(mm)} 00:00:00`, `*-*-${pad(mm)} 00:00:00`] }; },
  (r) => { const h = r.int(0, 23); return { expr: `Fri *-09..12-* ${hm(h, 20)}:00`, desc: `às ${hm(h, 20)} de toda sexta-feira de setembro a dezembro`, wrong: () => [`Fri *-*-09..12 ${hm(h, 20)}:00`, `*-09..12-* ${hm(h, 20)}:00`] }; },
];
const gTimerCal = {
  id: 'timer-oncalendar', obj: '107.2', nivel: 3, peso: 2,
  make(rng) {
    const p = rng.pick(CAL_PATTERNS)(rng);
    const wrong = [...new Set(p.wrong())].filter((x) => x !== p.expr);
    const ex = `Formato: \`DiaDaSemana Ano-Mês-Dia Hora:Minuto:Segundo\` (dia da semana opcional). \`*\` = qualquer valor, \`,\` lista, \`..\` intervalo contíguo, \`/\` passo (\`00/5\` = de 5 em 5 a partir de 0). Para "${p.desc}" a expressão é \`${p.expr}\`.`;
    if (rng.chance(0.5)) {
      return {
        type: 'unica',
        text: `Qual valor de \`OnCalendar=\` em um arquivo \`.timer\` dispara o serviço **${p.desc}**?`,
        options: mcq(rng, p.expr, [...wrong, 'Mon *-*-* 00:00:00', '*-*-* 00:00:00', '*-*-01 00:00:00', 'Sun *-*-* 12:00:00']),
        explanation: `${ex} Note que no systemd o intervalo usa \`..\` (não \`-\`) e que o mês vem *antes* do dia na data \`Ano-Mês-Dia\`.`,
        ref: ['102:p.217-218', '102:p.224-225'],
      };
    }
    const descs = [p.desc];
    const others = CAL_PATTERNS.filter((f) => f !== null).map((f) => f(rng).desc).filter((d) => d !== p.desc);
    return {
      type: 'unica',
      text: `Em um timer do systemd aparece:\n\n${block(`[Timer]\nOnCalendar=${p.expr}\nPersistent=true`)}\n\nQuando o serviço associado é disparado?`,
      options: mcq(rng, descs[0][0].toUpperCase() + descs[0].slice(1), others.map((d) => d[0].toUpperCase() + d.slice(1))),
      explanation: `${ex} \`Persistent=true\` faz o systemd executar uma disparo perdido (máquina desligada) assim que o sistema voltar.`,
      ref: ['102:p.217-218', '102:p.224-225'],
    };
  },
};

const gTimerFatos = {
  id: 'timer-conceitos', obj: '107.2', nivel: 1, peso: 1,
  make(rng) {
    const facts = [
      ['Qual diretiva de um `.timer` define um disparo em **tempo real** (calendário), como o cron?', 'OnCalendar=', ['OnBootSec=', 'OnActiveSec=', 'OnUnitActiveSec=', 'OnStartupSec=']],
      ['Qual diretiva de um `.timer` dispara **algum tempo depois da inicialização** do sistema (timer monotônico)?', 'OnBootSec=', ['OnCalendar=', 'OnLogin=', 'OnShutdownSec=', 'Persistent=']],
      ['Por padrão, um timer `backup.timer` ativa qual unidade?', 'backup.service', ['backup.target', 'backup.timer.service', 'backup.sh', 'backup.socket']],
      ['Qual comando lista os timers ativos ordenados pelo próximo disparo?', 'systemctl list-timers', ['systemctl timers --active', 'timedatectl list-timers', 'systemctl list-units --type=cron', 'journalctl --timers']],
      ['Qual opção faz `systemctl list-timers` mostrar também os timers **inativos**?', '--all', ['-a-inactive', '--inactive', '--full', '-i']],
      ['Qual sequência habilita o timer `foobar.timer` para iniciar no boot **e** o inicia agora?', 'systemctl enable foobar.timer && systemctl start foobar.timer', ['systemctl start foobar.service && systemctl enable foobar.service', 'systemctl enable foobar.service', 'systemctl daemon-reload foobar.timer', 'systemctl timer foobar enable']],
      ['O que `Persistent=true` faz em um timer com `OnCalendar=`?', 'executa o serviço assim que possível se o disparo foi perdido enquanto o sistema estava desligado', ['impede que o timer seja desativado', 'repete o serviço indefinidamente', 'mantém o serviço sempre em execução', 'grava o log do timer em disco']],
      ['Em um servidor com systemd, qual comando agenda `./foo.sh` para **daqui a 2 minutos**, sem criar arquivos de unidade?', 'systemd-run --on-active=2m ./foo.sh', ['systemd-run --on-calendar=2m ./foo.sh', 'systemctl run --after 2m ./foo.sh', 'at +2m ./foo.sh', 'systemd-timer 2m ./foo.sh']],
      ['Qual opção deve ser usada com `systemctl` e `journalctl` por um usuário comum para consultar timers e logs do **seu** gerenciador de usuário?', '--user', ['--local', '--self', '--session-only', '-u']],
      ['Depois de editar o valor de `OnCalendar=` em um arquivo `.timer`, o que é preciso fazer para o systemd reler a configuração?', 'systemctl daemon-reload', ['reiniciar o cron', 'crontab -e', 'atq', 'systemctl list-timers --reload']],
    ];
    const f = rng.pick(facts);
    return {
      type: 'unica', text: f[0], options: mcq(rng, f[1], f[2]),
      explanation: `Timers do systemd: arquivos \`.timer\` com seção \`[Timer]\` e (por padrão) um \`.service\` de mesmo nome. \`OnCalendar=\` é tempo real (calendário); \`OnBootSec=\`/\`OnActiveSec=\`/\`OnUnitActiveSec=\` são monotônicos. Gerenciamento: \`systemctl enable|start foobar.timer\`, \`systemctl list-timers [--all]\`, \`systemctl daemon-reload\` após editar, \`journalctl\` para ver o log (\`--user\` para usuário comum). Alternativa ao at: \`systemd-run\`. Resposta: ${f[1]}.`,
      ref: ['102:p.217-218', '102:p.231-232'],
    };
  },
};

export const generators = [gCronExplain, gCronWrite, gCronNext, gCronValid, gCronSys, gCronShort, gCrontabOpt, gAcesso, gAtSpec, gAtHora, gAtCmd, gTimerCal, gTimerFatos];
