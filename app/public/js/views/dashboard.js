import { get, put, meta } from '../api.js';
import { html, raw, pct, fmtDate, tone, toneColor, dots, toast } from '../util.js';

const MODE_NAMES = { oficial: 'Oficial', topico: 'Tópico', curso: 'Curso', fracos: 'Fracos', relampago: 'Relâmpago', treino: 'Treino', erros: 'Erros' };

function ring(value, target) {
  const R = 60; const C = 2 * Math.PI * R;
  const a = (target * 360 - 90) * (Math.PI / 180);
  const tx1 = 75 + (R - 9) * Math.cos(a); const ty1 = 75 + (R - 9) * Math.sin(a);
  const tx2 = 75 + (R + 9) * Math.cos(a); const ty2 = 75 + (R + 9) * Math.sin(a);
  return html`<div class="ring"><svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="Prontidão ${pct(value)}">
      <circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--line)" stroke-width="12"/>
      <circle cx="75" cy="75" r="${R}" fill="none" stroke="${toneColor(value)}" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${(Math.max(0.01, value) * C).toFixed(1)} ${C.toFixed(1)}"/>
      <line x1="${tx1}" y1="${ty1}" x2="${tx2}" y2="${ty2}" stroke="var(--text)" stroke-width="3" transform="rotate(90 75 75)"/>
    </svg><div class="val"><div><b>${Math.round(value * 100)}%</b><br><span>prontidão</span></div></div></div>`;
}

function heatmap(atividade) {
  const byDay = new Map(atividade.map((a) => [a.dia, a]));
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - today.getDay() - 11 * 7);
  const cells = [];
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const a = byDay.get(k);
    const n = a ? a.q + a.lab * 5 : 0;
    const l = n === 0 ? '' : n < 10 ? 'l1' : n < 25 ? 'l2' : n < 50 ? 'l3' : 'l4';
    cells.push(`<i class="${l}" title="${k}: ${a ? `${a.q} questões, ${a.lab} desafios` : 'sem atividade'}"></i>`);
  }
  return raw(`<div class="heat" aria-label="Atividade nas últimas 12 semanas">${cells.join('')}</div>`);
}

function history(exames) {
  const pts = exames.slice(0, 14).reverse();
  if (pts.length < 2) return html`<p class="muted small">Faça ao menos 2 simulados para ver a evolução.</p>`;
  const W = 320; const H = 90; const x = (i) => 8 + (i * (W - 16)) / (pts.length - 1); const y = (v) => H - 8 - v * (H - 16);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');
  return raw(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Evolução das notas">
    <line x1="8" x2="${W - 8}" y1="${y(0.75)}" y2="${y(0.75)}" stroke="var(--accent)" stroke-dasharray="4 4" opacity=".6"/>
    <polyline points="${line}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.pct).toFixed(1)}" r="3.5" fill="${toneColor(p.pct)}"><title>${new Date(p.created).toLocaleDateString('pt-BR')} — ${Math.round(p.pct * 100)}%</title></circle>`).join('')}
  </svg>`);
}


function conquistas(s, P) {
  const t = s.totais;
  const best = Math.max(0, ...s.objetivos.filter((o) => o.n >= 5).map((o) => o.mastery));
  const list = [
    ['🥇', 'Primeiro simulado', 'Finalize um simulado', s.exames.length >= 1],
    ['🔟', '100 questões', 'Responda 100 questões', t.respondidas >= 100],
    ['📚', '500 questões', 'Responda 500 questões', t.respondidas >= 500],
    ['🏛️', '1.000 questões', 'Responda 1.000 questões', t.respondidas >= 1000],
    ['🔥', 'Três dias seguidos', 'Estude 3 dias seguidos', s.streak >= 3],
    ['⚡', 'Uma semana', 'Estude 7 dias seguidos', s.streak >= 7],
    ['🧪', 'Mão na massa', 'Conclua um desafio do laboratório', t.labConcluidos >= 1],
    ['🛠️', 'Sysadmin', 'Conclua 10 desafios do laboratório', t.labConcluidos >= 10],
    ['🎯', 'Dominando', 'Objetivo com 90% de domínio (mín. 5 respostas)', best >= 0.9],
    ['🏁', 'Pronto para o 101', `Prontidão do exame 101 ≥ ${Math.round(P.meta * 100)}%`, P.porExame['101'] >= P.meta],
    ['🏆', 'Pronto para o 102', `Prontidão do exame 102 ≥ ${Math.round(P.meta * 100)}%`, P.porExame['102'] >= P.meta],
  ];
  return html`<section class="card"><h3>Conquistas <span class="muted small">${list.filter((x) => x[3]).length}/${list.length}</span></h3>
    <div class="row" style="gap:8px">${list.map(([e, n, d, on]) => html`<span class="chip ${on ? 'ok' : ''}" title="${d}" style="${on ? '' : 'opacity:.45;filter:grayscale(1)'}">${e} ${n}</span>`)}</div></section>`;
}

export async function render(root) {
  const [m, s, cfg] = await Promise.all([meta(), get('/api/stats'), get('/api/settings')]);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const P = s.prontidao;
  const topicos = Object.entries(m.topicos);
  const byObj = Object.fromEntries(s.objetivos.map((o) => [o.code, o]));
  const rec = s.exames.slice(0, 6);

  root.innerHTML = html`
    <div class="page-title"><h1>${hello}! 👋</h1><p>Prova: ${m.prova.questoes} questões · ${m.prova.minutos} min · aprovação ${m.prova.nota_aprovacao}/800 por exame · exames 101 e 102</p></div>

    <div class="hero">
      <section class="card">
        <h3>Prontidão para a prova</h3>
        <div class="ring-wrap">
          ${ring(P.geral, P.meta)}
          <div class="stack" style="flex:1;min-width:190px">
            <div><span class="chip ${tone(P.geral)}">${P.rotulo}</span> <span class="muted small">meta do app: ${pct(P.meta)}</span></div>
            ${['101', '102'].map((ex) => html`<div><div class="row small"><b>Exame ${ex}</b><span class="right muted">${pct(P.porExame[ex])}</span></div>
              <div class="bar ${tone(P.porExame[ex]) === 'ok' ? '' : tone(P.porExame[ex])}"><i style="width:${Math.round(P.porExame[ex] * 100)}%"></i></div></div>`)}
            <p class="muted small" style="margin:0">Ponderado pelos pesos oficiais. Objetivos sem respostas contam como ${pct(0.35)} (prior conservador).</p>
          </div>
        </div>
      </section>

      <section class="card">
        <h3>Sequência de estudo</h3>
        <div class="row" style="align-items:flex-end"><div class="kpi">${s.streak}</div><div class="muted" style="padding-bottom:6px">${s.streak === 1 ? 'dia seguido' : 'dias seguidos'} 🔥</div></div>
        <div style="margin:12px 0 4px;overflow-x:auto">${heatmap(s.atividade)}</div>
        <p class="muted small" style="margin:0">${s.totais.respondidas} questões respondidas · ${s.totais.acertos} acertos · ${s.totais.labConcluidos} desafios de lab</p>
      </section>

      <section class="card">
        <h3>Começar agora</h3>
        <div class="stack">
          <a class="btn primary" href="#/novo?modo=relampago" style="width:100%">⚡ Relâmpago — 10 questões</a>
          <a class="btn" href="#/novo?modo=oficial&exame=101" style="width:100%">📝 Simulado oficial 101</a>
          <a class="btn" href="#/novo?modo=oficial&exame=102" style="width:100%">📝 Simulado oficial 102</a>
          <a class="btn" href="#/novo?modo=erros" style="width:100%">🔁 Revisar erros${s.totais.devidas ? ` (${s.totais.devidas})` : ''}</a>
        </div>
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <h3>Próximos passos recomendados</h3>
      <div class="grid c2">
        ${s.sugestoes.map((g) => html`<a class="sugg" href="${g.acao}"><span class="em">${g.tipo === 'revisao' ? '🔁' : g.tipo === 'foco' ? '🎯' : g.tipo === 'prova' ? '🏁' : '🧭'}</span>
          <span><b>${g.titulo}</b><br><span class="muted small">${g.texto}</span></span></a>`)}
      </div>
    </section>

    <div class="grid c2" style="margin-top:16px;grid-template-columns:2fr 1fr">
      <section class="card">
        <h3>Mapa de domínio por objetivo</h3>
        <p class="muted small">Cor = domínio estimado (últimas respostas, com peso maior nas recentes). ● = peso do objetivo na prova. Clique para detalhes e treino.</p>
        ${topicos.map(([t, info]) => html`
          <h4 style="margin:14px 0 8px" class="row"><span>${t} · ${info.titulo}</span><span class="chip">peso ${info.peso}</span><span class="chip ${tone(P.porTopico[t])}">${pct(P.porTopico[t])}</span></h4>
          <div class="tiles">${m.objetivos.filter((o) => o.topico === t).map((o) => {
            const st = byObj[o.code];
            return html`<a class="tile" href="#/objetivo/${o.code}" style="--m:${st.mastery.toFixed(2)};--tint:${toneColor(st.mastery)}" title="${o.titulo}">
              <span class="w">${dots(o.peso)}</span><div class="code">${o.code}</div><div class="t">${o.titulo}</div>
              <div class="bar ${tone(st.mastery) === 'ok' ? '' : tone(st.mastery)}"><i style="width:${Math.round(st.mastery * 100)}%"></i></div></a>`;
          })}</div>`)}
      </section>

      <div class="stack">
        <section class="card"><h3>Evolução nos simulados</h3>${history(s.exames)}<p class="muted small" style="margin:6px 0 0">Linha tracejada = meta ${pct(P.meta)}</p></section>
        <section class="card"><h3>Últimos simulados</h3>
          ${rec.length ? rec.map((e) => html`<a class="result-item" href="#/resultado/${e.id}"><div class="row"><b>${e.title}</b><span class="right chip ${tone(e.pct)}">${pct(e.pct)}</span></div>
            <div class="muted small">${fmtDate(e.created)} · ${e.correct}/${e.n} · ${MODE_NAMES[e.mode] ?? e.mode}</div></a>`) : html`<p class="muted">Nenhum simulado finalizado ainda.</p>`}
        </section>
        ${conquistas(s, P)}
        <section class="card"><h3>📅 Data dos exames</h3>
          ${['101', '102'].map((ex) => {
            const d = cfg[`data_${ex}`]; const left = d ? Math.ceil((new Date(`${d}T12:00:00`) - Date.now()) / 864e5) : null;
            return html`<div class="row" style="margin-bottom:8px"><b>${ex}</b><input type="date" data-date="${ex}" value="${d ?? ''}" style="width:auto">
              ${left === null ? html`<span class="muted small">defina para ver a contagem</span>` : left < 0 ? html`<span class="chip">já passou</span>`
                : html`<span class="chip ${left <= 14 && P.porExame[ex] < P.meta ? 'bad' : left <= 30 ? 'warn' : 'ok'}">faltam ${left} dia(s)</span>`}</div>`;
          })}
          <p class="muted small" style="margin:0">Quando faltar pouco e a prontidão estiver abaixo da meta, o chip fica vermelho.</p></section>
        <section class="card"><h3>Banco de questões</h3>
          <p style="margin:0"><b>${s.totais.questoesNoBanco}</b> questões fixas + geradores paramétricos que criam variações novas a cada simulado.</p></section>
      </div>
    </div>`.s;

  root.onchange = async (e) => {
    const i = e.target.closest('[data-date]');
    if (i) { await put('/api/settings', { [`data_${i.dataset.date}`]: i.value || null }); render(root); }
  };
  return () => { root.onchange = null; };
}
