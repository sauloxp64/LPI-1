import { get, post, meta } from '../api.js';
import { html, pct, tone, dots, ico, toast } from '../util.js';

export async function render(root, { args }) {
  const code = args[0];
  const [m, st, lab, prog] = await Promise.all([meta(), get('/api/stats'), get('/api/lab/challenges').catch(() => ({ desafios: [] })), get('/api/progress')]);
  const o = m.byCode[code];
  if (!o) { root.innerHTML = '<div class="empty">Objetivo não encontrado.</div>'; return; }
  const s = st.objetivos.find((x) => x.code === code);
  const b = m.banco.porObj[code] ?? { n: 0, unica: 0, multipla: 0, lacuna: 0, geradores: 0 };
  const topico = m.topicos[o.topico];
  const labs = lab.desafios.filter((d) => d.obj === code);
  const secoes = (o.pdf?.secoes ?? []).filter((x) => !/Respostas aos/.test(x.title));
  const status = prog.status[code] ?? 'nao';

  root.innerHTML = html`
    <div class="page-title"><h1><span class="mono">${code}</span>${o.titulo}</h1></div>
    <div class="row" style="margin:0 0 18px"><span class="chip">Exame ${o.exame}-500</span><span class="chip">Tópico ${o.topico}: ${topico.titulo}</span>
      <span class="chip warn" title="peso na prova: quantidade aproximada de questões">peso ${o.peso} ${dots(o.peso)}</span>
      <span class="chip ${status === 'concluido' ? 'ok' : status === 'estudando' ? 'warn' : ''}">curso: ${{ nao: 'não vi', estudando: 'estudando', concluido: 'concluído' }[status]}</span></div>

    <div class="grid c2" style="grid-template-columns:1.4fr 1fr;align-items:start">
      <div class="stack">
        <section class="card"><h3>O que a LPI cobra neste objetivo</h3>
          <ul style="margin:0;padding-left:20px">${o.areas.map((a) => html`<li>${a}</li>`)}</ul>
          <h4 style="margin-top:16px">Comandos, arquivos e termos-chave</h4>
          <div class="row" style="gap:6px">${o.utils.map((u) => html`<code>${u}</code>`)}</div>
          ${['109.2', '109.3', '110.2'].includes(code) ? html`<p class="muted small" style="margin-top:12px">${ico('warn')} A LPI já anunciou a futura retirada de: ${m.mudancas_futuras.join('; ')}. Ainda cai na versão 5.0.</p>` : ''}
        </section>

        <section class="card"><h3>Onde estudar no material oficial</h3>
          ${o.pdf ? html`<div class="stack">${secoes.map((x) => html`<div class="row small"><a href="#/material?obj=${code}&p=${x.page}">${x.title}</a><span class="right chip mono">p.${x.page}</span></div>`)}</div>` : html`<p class="muted">PDF não mapeado.</p>`}
        </section>
      </div>

      <div class="stack">
        <section class="card"><h3>Seu desempenho</h3>
          <div class="row"><div class="kpi">${s.n ? pct(s.mastery) : '—'}</div><span class="chip ${s.n ? tone(s.mastery) : ''}">${s.n ? 'domínio estimado' : 'sem respostas'}</span></div>
          <p class="muted small">${s.n} respostas · ${s.acc !== null ? pct(s.acc) : '—'} de acerto no total</p>
          <div class="stack">
            <button class="btn primary block" data-train="10">${ico('target')} Treinar 10 questões</button>
            <button class="btn block" data-train="25">${ico('checkcircle')} Treinar 25 questões</button>
            <button class="btn block" data-quiz="1">${ico('exam')} Simulado deste objetivo (cronometrado)</button>
            <a class="btn block" href="#/material?obj=${code}">${ico('book')} Abrir material (p.${o.pdf?.inicio ?? '?'} a ${o.pdf?.fim ?? '?'})</a>
          </div></section>
        <section class="card"><h3>Banco de questões</h3>
          <p style="margin:0"><b>${b.n}</b> fixas (${b.unica} de resposta única, ${b.multipla} de múltipla escolha, ${b.lacuna} de lacuna) e <b>${b.geradores}</b> gerador(es) paramétrico(s).</p></section>
        <section class="card"><h3>Laboratório</h3>
          ${labs.length ? labs.map((d) => html`<a class="result-item" href="#/lab/${d.id}"><div class="row"><b>${d.titulo}</b><span class="right chip ${d.concluido ? 'ok' : ''}">${d.concluido ? 'concluído' : `nível ${d.nivel}`}</span></div></a>`) : html`<p class="muted small" style="margin:0">Ainda sem desafios práticos para este objetivo.</p>`}
        </section>
      </div>
    </div>`.s;

  root.onclick = async (e) => {
    const t = e.target.closest('button');
    if (!t || (!t.dataset.train && !t.dataset.quiz)) return;
    try {
      const body = t.dataset.train ? { mode: 'treino', objetivos: [code], n: Number(t.dataset.train) } : { mode: 'topico', objetivos: [code], n: 15 };
      const { id } = await post('/api/exams', body);
      location.hash = `#/prova/${id}`;
    } catch (err) { toast(err.message, 'err'); }
  };
  return () => { root.onclick = null; };
}
