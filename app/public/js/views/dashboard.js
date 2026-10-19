import { get, put, meta } from '../api.js';
import { html, raw, pct, fmtDate, tone, toneColor, toneCls, dots, bar, ico, toast } from '../util.js';

const MODE_NAMES = { oficial: 'Oficial', topico: 'Tópico', curso: 'Curso', fracos: 'Fracos', relampago: 'Relâmpago', treino: 'Treino', erros: 'Erros' };
const SUGG_ICON = { revisao: 'repeat', foco: 'target', prova: 'flag' };

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
  return raw(`<div class="heat" role="img" aria-label="Atividade nas últimas 12 semanas">${cells.join('')}</div>`);
}

function history(exames, meta) {
  const pts = exames.slice(0, 14).reverse();
  if (pts.length < 2) return html`<p class="muted small" style="margin:0">Faça ao menos 2 simulados para ver a evolução.</p>`;
  const W = 320; const H = 96; const x = (i) => 8 + (i * (W - 16)) / (pts.length - 1); const y = (v) => H - 8 - v * (H - 16);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');
  return raw(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Evolução das notas nos simulados">
    <line x1="8" x2="${W - 8}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>
    <line x1="8" x2="${W - 8}" y1="${y(meta)}" y2="${y(meta)}" stroke="var(--text)" stroke-opacity=".55" stroke-dasharray="3 4"/>
    <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<rect x="${(x(i) - 3.5).toFixed(1)}" y="${(y(p.pct) - 3.5).toFixed(1)}" width="7" height="7" fill="${toneColor(p.pct)}" stroke="var(--panel)" stroke-width="1.5"><title>${new Date(p.created).toLocaleDateString('pt-BR')}: ${Math.round(p.pct * 100)}%</title></rect>`).join('')}
  </svg>`);
}

function conquistas(s, P) {
  const t = s.totais;
  const best = Math.max(0, ...s.objetivos.filter((o) => o.n >= 5).map((o) => o.mastery));
  const m = Math.round(P.meta * 100);
  const list = [
    ['Primeiro simulado', 'Finalize um simulado', s.exames.length >= 1],
    ['100 questões', 'Responda 100 questões', t.respondidas >= 100],
    ['500 questões', 'Responda 500 questões', t.respondidas >= 500],
    ['1.000 questões', 'Responda 1.000 questões', t.respondidas >= 1000],
    ['Três dias seguidos', 'Estude 3 dias seguidos', s.streak >= 3],
    ['Uma semana', 'Estude 7 dias seguidos', s.streak >= 7],
    ['Mão na massa', 'Conclua um desafio do laboratório', t.labConcluidos >= 1],
    ['Sysadmin', 'Conclua 10 desafios do laboratório', t.labConcluidos >= 10],
    ['Dominando', 'Objetivo com 90% de domínio (mín. 5 respostas)', best >= 0.9],
    ['Pronto para o 101', `Prontidão do exame 101 de ${m}% ou mais`, P.porExame['101'] >= P.meta],
    ['Pronto para o 102', `Prontidão do exame 102 de ${m}% ou mais`, P.porExame['102'] >= P.meta],
  ];
  return html`<section class="card"><h3>Conquistas<span class="muted">${list.filter((x) => x[2]).length}/${list.length}</span></h3>
    <ul class="ach">${list.map(([n, d, on]) => html`<li class="${on ? 'on' : ''}"><span class="bx">${on ? '[x]' : '[ ]'}</span><span>${n}<small>${d}</small></span></li>`)}</ul></section>`;
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
    <div class="page-title"><h1>${hello}</h1><p>Cada exame tem ${m.prova.questoes} questões e ${m.prova.minutos} minutos. A aprovação é ${m.prova.nota_aprovacao} de 800 pontos em cada um dos exames 101 e 102.</p></div>

    <div class="hero">
      <section class="card">
        <h3>Prontidão para a prova</h3>
        <div class="vitals">
          <div class="vital"><span class="big-num">${Math.round(P.geral * 100)}<small>%</small></span>
            <span class="chip ${tone(P.geral)}">${P.rotulo}</span><span class="muted small">meta ${pct(P.meta)}</span></div>
          ${bar(P.geral, { cls: `big ${toneCls(P.geral)}`, target: P.meta })}
          ${['101', '102'].map((ex) => html`<div class="vital-row"><span>Exame ${ex}-500</span>${bar(P.porExame[ex], { cls: `thin ${toneCls(P.porExame[ex])}`, target: P.meta })}<span class="pc">${pct(P.porExame[ex])}</span></div>`)}
        </div>
        <p class="muted small" style="margin:16px 0 0">Ponderado pelos pesos oficiais. A marca vertical é a meta do app. Objetivos sem respostas contam como ${pct(0.35)}, uma estimativa conservadora.</p>
      </section>

      <section class="card">
        <h3>Sequência de estudo</h3>
        <div class="row" style="align-items:baseline;gap:10px"><div class="kpi">${s.streak}</div><div class="muted">${s.streak === 1 ? 'dia seguido' : 'dias seguidos'}</div></div>
        <div style="margin:14px 0 6px;overflow-x:auto">${heatmap(s.atividade)}</div>
        <p class="muted small" style="margin:0">Últimas 12 semanas. ${s.totais.respondidas} questões respondidas, ${s.totais.acertos} acertos, ${s.totais.labConcluidos} desafios de laboratório.</p>
      </section>

      <section class="card">
        <h3>Começar agora</h3>
        <div class="stack">
          <a class="btn primary block" href="#/novo?modo=relampago">${ico('bolt')} Relâmpago, 10 questões</a>
          <a class="btn block" href="#/novo?modo=oficial&exame=101">${ico('exam')} Simulado oficial 101</a>
          <a class="btn block" href="#/novo?modo=oficial&exame=102">${ico('exam')} Simulado oficial 102</a>
          <a class="btn block" href="#/novo?modo=erros">${ico('repeat')} Revisar erros${s.totais.devidas ? ` (${s.totais.devidas})` : ''}</a>
        </div>
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <h3>Próximos passos recomendados</h3>
      <div class="grid c2">
        ${s.sugestoes.map((g) => html`<a class="sugg" href="${g.acao}"><span class="em">${ico(SUGG_ICON[g.tipo] ?? 'compass')}</span>
          <span><b>${g.titulo}</b><br><span class="muted small">${g.texto}</span></span></a>`)}
      </div>
    </section>

    <div class="grid c2" style="margin-top:16px;grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
      <section class="card">
        <h3>Mapa de domínio por objetivo</h3>
        <p class="muted small" style="margin-top:0">A barra mostra o domínio estimado, com mais peso para as respostas recentes. As barrinhas ao lado do título indicam o peso do objetivo na prova. Clique para ver detalhes e treinar.</p>
        ${topicos.map(([t, info]) => html`
          <div class="topic-head"><b>${t} · ${info.titulo}</b><span class="chip">peso ${info.peso}</span><span class="chip ${tone(P.porTopico[t])}">${pct(P.porTopico[t])}</span></div>
          <div class="omap">${m.objetivos.filter((o) => o.topico === t).map((o) => {
            const st = byObj[o.code];
            return html`<a class="orow" href="#/objetivo/${o.code}" title="${o.titulo}"><span class="code">${o.code}</span><span class="ttl">${o.titulo}</span>${dots(o.peso)}${bar(st.mastery, { cls: `thin ${st.n ? toneCls(st.mastery) : 'dim'}` })}<span class="pc">${st.n ? pct(st.mastery) : '—'}</span></a>`;
          })}</div>`)}
      </section>

      <div class="stack">
        <section class="card"><h3>Evolução nos simulados</h3>${history(s.exames, P.meta)}<p class="muted small" style="margin:8px 0 0">A linha tracejada é a meta de ${pct(P.meta)}.</p></section>
        <section class="card"><h3>Últimos simulados</h3>
          ${rec.length ? rec.map((e) => html`<a class="result-item" href="#/resultado/${e.id}"><div class="row"><b>${e.title}</b><span class="right chip ${tone(e.pct)}">${pct(e.pct)}</span></div>
            <div class="muted small">${fmtDate(e.created)}, ${e.correct}/${e.n} certas, modo ${(MODE_NAMES[e.mode] ?? e.mode).toLowerCase()}</div></a>`) : html`<p class="muted" style="margin:0">Nenhum simulado finalizado ainda.</p>`}
        </section>
        ${conquistas(s, P)}
        <section class="card"><h3>Datas dos exames</h3>
          ${['101', '102'].map((ex) => {
            const d = cfg[`data_${ex}`]; const left = d ? Math.ceil((new Date(`${d}T12:00:00`) - Date.now()) / 864e5) : null;
            return html`<div class="row" style="margin-bottom:8px"><b class="mono">${ex}</b><input type="date" data-date="${ex}" value="${d ?? ''}" aria-label="Data do exame ${ex}" style="width:auto">
              ${left === null ? html`<span class="muted small">defina para ver a contagem</span>` : left < 0 ? html`<span class="chip">já passou</span>`
                : html`<span class="chip ${left <= 14 && P.porExame[ex] < P.meta ? 'bad' : left <= 30 ? 'warn' : 'ok'}">faltam ${left} dia(s)</span>`}</div>`;
          })}
          <p class="muted small" style="margin:0">Quando faltar pouco e a prontidão estiver abaixo da meta, o aviso fica vermelho.</p></section>
        <section class="card"><h3>Banco de questões</h3>
          <p style="margin:0"><b>${s.totais.questoesNoBanco}</b> questões fixas e geradores paramétricos que criam variações novas a cada simulado.</p></section>
      </div>
    </div>`.s;

  root.onchange = async (e) => {
    const i = e.target.closest('[data-date]');
    if (i) { await put('/api/settings', { [`data_${i.dataset.date}`]: i.value || null }); render(root); }
  };
  return () => { root.onchange = null; };
}
