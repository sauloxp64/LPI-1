import { get, post, del, meta } from '../api.js';
import { html, pct, fmtDate, fmtDuration, tone, toast, confirmDialog } from '../util.js';

const AUTO = new Set(['relampago', 'erros']);

async function start(body) {
  try {
    const { id } = await post('/api/exams', body);
    location.hash = `#/prova/${id}`;
  } catch (e) { toast(e.message, 'err'); }
}

export async function render(root, { params }) {
  const modo = params.get('modo');
  // atalhos que iniciam direto (sem formulário)
  if (modo && (AUTO.has(modo) || (modo === 'treino' && params.get('obj')))) {
    root.innerHTML = html`<p class="muted"><span class="spinner"></span> Montando seu simulado…</p>`.s;
    try {
      const { id } = await post('/api/exams', { mode: modo, objetivos: params.get('obj') ? params.get('obj').split(',') : undefined, n: modo === 'treino' ? 10 : undefined });
      location.replace(`#/prova/${id}`);
    } catch (e) {
      root.innerHTML = html`<div class="empty">${e.message}<p><a class="btn" href="#/novo">Ver todos os modos</a></p></div>`.s;
    }
    return;
  }

  const [m, prog, hist] = await Promise.all([meta(), get('/api/progress'), get('/api/exams')]);
  const unlocked = m.objetivos.filter((o) => ['estudando', 'concluido'].includes(prog.status[o.code]));
  const preObj = new Set((params.get('obj') ?? '').split(',').filter(Boolean));
  const hl = (k) => (modo === k || (k === 'oficial' && modo === 'oficial') ? 'border-color:var(--accent)' : '');

  const picker = (name) => html`<div class="stack">
    ${Object.entries(m.topicos).map(([t, info]) => html`<div><label class="small row" style="gap:8px;cursor:pointer"><input type="checkbox" data-topic="${name}:${t}"> <b>${t} · ${info.titulo}</b></label>
      <div class="obj-picker">${m.objetivos.filter((o) => o.topico === t).map((o) => html`<label><input type="checkbox" name="${name}" value="${o.code}" ${preObj.has(o.code) ? 'checked' : ''}><span><b class="mono">${o.code}</b> ${o.titulo}</span></label>`)}</div></div>`)}
  </div>`;

  root.innerHTML = html`
    <div class="page-title"><h1>Simulados</h1><p>Cada simulado é sorteado na hora: questões do banco + variações geradas por código. Refazer nunca repete a mesma prova.</p></div>

    <div class="grid auto">
      ${[['101', 'Simulado oficial 101-500', 'Tópicos 101–104 · distribuição exata dos pesos oficiais (8/12/26/14)', 60, 90],
         ['102', 'Simulado oficial 102-500', 'Tópicos 105–110 · distribuição exata dos pesos oficiais (8/4/12/12/14/10)', 60, 90],
         ['ambos', 'Oficial completo 101 + 102', 'As duas provas em sequência, para testar resistência', 120, 180]].map(([ex, t, d, q, min]) => html`
        <section class="card mode-card" style="${hl('oficial')}"><h3>📝 ${t}</h3><p class="muted small">${d}</p>
          <div class="meta"><span class="chip">${q} questões</span><span class="chip">${min} min</span><span class="chip">cronômetro</span></div>
          <div class="actions"><button class="btn primary" data-start-oficial="${ex}">Iniciar</button></div></section>`)}

      <section class="card mode-card" style="${hl('curso')}"><h3>🎓 Do que já vi no curso</h3>
        <p class="muted small">Sorteia só nos objetivos marcados como <i>Estudando</i> ou <i>Concluído</i> (${unlocked.length} de ${m.objetivos.length}), proporcional aos pesos.</p>
        <label class="field">Questões: <b id="n-curso">40</b></label><input type="range" id="r-curso" min="10" max="60" step="5" value="40">
        <div class="actions">${unlocked.length ? html`<button class="btn primary" data-start="curso">Iniciar</button>` : html`<a class="btn" href="#/curso">Marque seu avanço primeiro</a>`}</div></section>

      <section class="card mode-card" style="${hl('fracos')}"><h3>🎯 Foco nos pontos fracos</h3>
        <p class="muted small">Prioriza os objetivos onde <i>peso × lacuna de domínio</i> é maior e puxa questões que você errou ou não vê há tempo.</p>
        <label class="field">Questões: <b id="n-fracos">30</b></label><input type="range" id="r-fracos" min="10" max="60" step="5" value="30">
        <div class="actions"><button class="btn primary" data-start="fracos">Iniciar</button></div></section>

      <section class="card mode-card"><h3>⚡ Relâmpago</h3><p class="muted small">10 questões em 15 minutos para esquentar ou calibrar o painel. Usa o que você já viu (ou tudo, se nada estiver marcado).</p>
        <div class="meta"><span class="chip">10 questões</span><span class="chip">15 min</span></div>
        <div class="actions"><button class="btn primary" data-start="relampago">Iniciar</button></div></section>

      <section class="card mode-card"><h3>🔁 Caderno de erros</h3><p class="muted small">Questões que você errou por último ou que estão vencidas na repetição espaçada (1, 3, 7, 14, 30 dias).</p>
        <div class="actions"><button class="btn primary" data-start="erros">Iniciar</button></div></section>
    </div>

    <div class="grid c2" style="margin-top:16px;align-items:start">
      <section class="card mode-card" style="${hl('topico')}"><h3>🧩 Por tópico ou objetivo</h3>
        <p class="muted small">Escolha exatamente o que cobrar.</p>
        ${picker('topico')}
        <div class="row"><div style="flex:1"><label class="field">Questões: <b id="n-topico">20</b></label><input type="range" id="r-topico" min="5" max="60" step="5" value="20"></div>
          <label class="small row" style="gap:6px"><input type="checkbox" id="c-timer" checked> cronômetro</label></div>
        <div class="actions"><button class="btn primary" data-start="topico">Iniciar</button></div></section>

      <section class="card mode-card" style="${hl('treino')}"><h3>🏋️ Treino com correção imediata</h3>
        <p class="muted small">Responde e já vê o gabarito, a explicação e a página do material. Ideal logo após cada aula.</p>
        ${picker('treino')}
        <div><label class="field">Questões: <b id="n-treino">10</b></label><input type="range" id="r-treino" min="5" max="40" step="5" value="10"></div>
        <div class="actions"><button class="btn primary" data-start="treino">Iniciar</button></div></section>
    </div>

    <section class="card" style="margin-top:16px"><h2>Histórico</h2>
      ${hist.exames.length ? html`<div style="overflow-x:auto"><table><thead><tr><th>Quando</th><th>Simulado</th><th>Nota</th><th>Tempo</th><th></th></tr></thead><tbody>
        ${hist.exames.map((e) => html`<tr><td class="small">${fmtDate(e.created)}</td><td>${e.title}<div class="muted small">${e.n} questões${e.instant ? ' · treino' : ''}</div></td>
          <td>${e.status === 'finalizado' ? html`<span class="chip ${tone(e.pct)}">${pct(e.pct)}</span> <span class="small muted">${e.correct}/${e.n}</span>` : html`<span class="chip warn">em andamento</span>`}</td>
          <td class="small">${e.tempo != null ? fmtDuration(e.tempo) : '—'}</td>
          <td style="white-space:nowrap">${e.status === 'finalizado' ? html`<a class="btn sm" href="#/resultado/${e.id}">Revisar</a> <button class="btn sm" data-retake="${e.id}" title="Novas questões, mesma configuração">↻ Novo sorteio</button>`
            : html`<a class="btn sm primary" href="#/prova/${e.id}">Continuar</a>`} <button class="btn sm ghost danger" data-del="${e.id}" title="Excluir">✕</button></td></tr>`)}
      </tbody></table></div>` : html`<div class="empty">Seus simulados aparecem aqui.</div>`}
    </section>`.s;

  // sliders
  for (const k of ['curso', 'fracos', 'topico', 'treino']) {
    const r = root.querySelector(`#r-${k}`); const n = root.querySelector(`#n-${k}`);
    if (r) r.oninput = () => { n.textContent = r.value; };
  }
  const chosen = (name) => [...root.querySelectorAll(`input[name=${name}]:checked`)].map((i) => i.value);

  root.onchange = (e) => {
    const t = e.target.closest('[data-topic]');
    if (t) {
      const [name, topic] = t.dataset.topic.split(':');
      m.objetivos.filter((o) => o.topico === topic).forEach((o) => {
        const cb = root.querySelector(`input[name=${name}][value="${o.code}"]`);
        if (cb) cb.checked = t.checked;
      });
    }
  };
  root.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.startOficial) {
      const ex = b.dataset.startOficial;
      const ok = await confirmDialog({ title: 'Iniciar simulado oficial?', body: html`<p>O cronômetro de <b>${ex === 'ambos' ? 180 : 90} minutos</b> começa agora e não pausa. Você pode sair e voltar, mas o tempo continua correndo.</p>`, ok: 'Começar' });
      if (ok) await start({ mode: 'oficial', exame: ex });
    } else if (b.dataset.start) {
      const k = b.dataset.start;
      const body = { mode: k };
      const slider = root.querySelector(`#r-${k}`);
      if (slider) body.n = Number(slider.value);
      if (k === 'topico' || k === 'treino') {
        body.objetivos = chosen(k);
        if (k === 'topico' && !body.objetivos.length) return toast('Escolha ao menos um objetivo.', 'err');
        if (k === 'topico' && !root.querySelector('#c-timer').checked) body.minutes = 0;
      }
      await start(body);
    } else if (b.dataset.retake) {
      try { const { id } = await post(`/api/exams/${b.dataset.retake}/retake`, { same: false }); location.hash = `#/prova/${id}`; } catch (err) { toast(err.message, 'err'); }
    } else if (b.dataset.del) {
      if (await confirmDialog({ title: 'Excluir este simulado?', body: 'As respostas dele deixam de contar nas estatísticas.', ok: 'Excluir', danger: true })) {
        await del(`/api/exams/${b.dataset.del}`); await render(root, { params });
      }
    }
  };
  return () => { root.onclick = null; root.onchange = null; };
}
