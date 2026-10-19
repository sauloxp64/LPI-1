import { get, post, meta } from '../api.js';
import { html, md, pct, fmtDuration, fmtDate, LETTERS, tone, toneCls, bar, ico, toast, confirmDialog } from '../util.js';

const refUrl = (r) => { const m = /^(\d+):p\.(\d+)/.exec(r); return m ? `/pdf/${m[1]}#page=${m[2]}` : '#'; };

export async function render(root, { args, params, isCurrent = () => true }) {
  const id = args[0];
  const [ex, m] = await Promise.all([get(`/api/exams/${id}`), meta()]);
  if (!isCurrent()) return;
  if (ex.status !== 'finalizado') { location.replace(`#/prova/${id}`); return; }
  const r = ex.result;
  const filter = params.get('f') ?? 'todas';
  const flagged = new Set(ex.flags);
  const blank = (i) => !r.items[i].answered;
  const wrongN = r.items.filter((x) => !x.ok).length;

  const verdict = ex.instant ? { cls: 'mid', t: 'Treino concluído' }
    : r.pct >= 0.75 ? { cls: 'ok', t: 'Acima da meta — aprovado com folga' }
      : r.pct >= 0.62 ? { cls: 'mid', t: 'Na margem — revise os pontos fracos' }
        : { cls: 'no', t: 'Abaixo da meta — ainda precisa estudar' };

  // por tópico e por objetivo
  const porTopico = {};
  for (const [code, v] of Object.entries(r.por_obj)) {
    const t = m.byCode[code]?.topico ?? '?';
    const a = (porTopico[t] ??= { n: 0, ok: 0 });
    a.n += v.n; a.ok += v.ok;
  }
  const objsRuins = Object.entries(r.por_obj).map(([code, v]) => ({ code, ...v, acc: v.ok / v.n })).filter((x) => x.acc < 1).sort((a, b) => a.acc - b.acc || b.n - a.n);

  const given = (q, i) => {
    const a = ex.answers[i];
    if (q.type === 'lacuna') return typeof a === 'string' && a ? html`<code>${a}</code>` : html`<i class="muted">em branco</i>`;
    const sel = new Set(Array.isArray(a) ? a : a === undefined ? [] : [a]);
    return sel.size ? [...sel].sort().map((k) => LETTERS[k]).join(', ') : html`<i class="muted">em branco</i>`;
  };

  const shown = ex.questions.map((q, i) => ({ q, i })).filter(({ q, i }) => filter === 'todas' ? true
    : filter === 'erradas' ? !r.items[i].ok : filter === 'marcadas' ? flagged.has(i) : blank(i));

  root.innerHTML = html`
    <div class="page-title"><h1>${ex.title}</h1><p>${fmtDate(ex.created)}, em ${fmtDuration(r.tempo_seg)}${ex.minutes ? ` de ${ex.minutes} min` : ''}</p></div>

    <div class="grid c2" style="grid-template-columns:1.1fr 1fr">
      <section class="card"><h3>Resultado</h3>
        <div class="score"><span class="big-num">${Math.round(r.pct * 100)}<small>%</small></span><div class="verdict ${verdict.cls}">${verdict.t}</div></div>
        ${bar(r.pct, { cls: `big ${toneCls(r.pct)}`, target: ex.instant ? undefined : 0.75 })}
        <div class="stack" style="margin-top:14px">
          <div><b>${r.correct}</b> de <b>${r.n}</b> corretas, ${r.n - r.respondidas} em branco</div>
          <p class="muted small" style="margin:0">A LPI usa nota escalonada (aprovação com 500 de 800) e não publica a fórmula. O app usa ${pct(0.75)} como margem de segurança, marcada na barra.</p></div>
        <div class="row" style="margin-top:16px">
          <button class="btn primary" data-act="retake">${ico('redo')} Novo sorteio</button>
          <button class="btn" data-act="same" title="As mesmas questões, com alternativas embaralhadas">${ico('shuffle')} Mesma prova, embaralhada</button>
          ${wrongN ? html`<button class="btn" data-act="wrong">${ico('target')} Treinar as ${wrongN} erradas</button>` : ''}
          <a class="btn ghost" href="#/novo">Outros modos</a>
        </div></section>

      <section class="card"><h3>Por tópico</h3>
        ${Object.entries(porTopico).sort().map(([t, v]) => html`<div style="margin-bottom:9px"><div class="row small"><b>${t} · ${m.topicos[t]?.titulo ?? ''}</b><span class="right">${v.ok}/${v.n}</span></div>
          <div class="bar ${tone(v.ok / v.n) === 'ok' ? '' : tone(v.ok / v.n)}"><i style="width:${Math.round((100 * v.ok) / v.n)}%"></i></div></div>`)}
      </section>
    </div>

    ${objsRuins.length ? html`<section class="card" style="margin-top:16px"><h3>Onde focar agora</h3>
      <div class="grid auto">${objsRuins.slice(0, 6).map((o) => html`<div class="card tight" style="background:var(--panel-2)"><div class="row"><b class="mono">${o.code}</b><span class="chip bad">${o.ok}/${o.n}</span></div>
        <div class="small muted" style="margin:4px 0 8px">${m.byCode[o.code]?.titulo}</div>
        <div class="row"><a class="btn sm" href="#/material?obj=${o.code}">${ico('book')} Material</a><a class="btn sm" href="#/novo?modo=treino&obj=${o.code}">${ico('target')} Treinar</a></div></div>`)}</div></section>` : ''}

    <section style="margin-top:20px">
      <div class="row" style="margin-bottom:12px"><h2 style="margin:0">Revisão das questões</h2>
        <div class="seg">${[['todas', `Todas (${ex.n})`], ['erradas', `Erradas (${wrongN})`], ['marcadas', `Marcadas (${flagged.size})`], ['brancas', `Em branco (${r.n - r.respondidas})`]]
          .map(([k, l]) => html`<button data-f="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`)}</div></div>
      ${shown.length ? shown.map(({ q, i }) => {
        const it = r.items[i];
        return html`<article class="card rv ${it.ok ? 'ok' : blank(i) ? 'blank' : 'no'}">
          <header><b>Questão ${i + 1}</b><span class="chip mono">${q.obj}</span><span class="chip">${q.type === 'unica' ? 'uma resposta' : q.type === 'multipla' ? `${q.escolhas} respostas` : 'lacuna'}</span>
            <span class="chip ${it.ok ? 'ok' : blank(i) ? 'warn' : 'bad'}">${it.ok ? (it.contested ? 'contestada' : 'correta') : blank(i) ? 'em branco' : 'errada'}</span>
            ${q.gen ? html`<span class="chip" title="Questão gerada por código: os números mudam a cada simulado">gerada por código</span>` : ''}
            ${flagged.has(i) ? html`<span class="chip warn">${ico('flag')} marcada</span>` : ''}</header>
          <div class="qtext">${md(q.text)}</div>
          ${q.type === 'lacuna'
            ? html`<p>Sua resposta: ${given(q, i)}<br>Aceitas: ${q.gabarito.map((a) => html`<code>${a}</code> `)}</p>`
            : html`<div class="opts">${q.options.map((t, k) => {
                const good = q.gabarito.includes(k);
                const sel = Array.isArray(ex.answers[i]) ? ex.answers[i].includes(k) : ex.answers[i] === k;
                return html`<div class="opt locked ${good ? 'good' : ''} ${sel && !good ? 'bad' : ''} ${sel ? 'sel' : ''}"><span class="key">${LETTERS[k]}</span><span class="txt">${md(t, { inline: true })}</span>
                  <span class="mark">${good ? html`${ico('check')} ${sel ? 'sua resposta' : 'correta'}` : sel ? html`${ico('x')} sua resposta` : ''}</span></div>`;
              })}</div>`}
          <div class="feedback" style="margin-top:12px"><h4>Explicação</h4>${md(q.explanation)}
            <div class="row small" style="margin-top:8px">${(q.ref ?? []).map((rf) => html`<a class="chip" target="_blank" rel="noopener" href="${refUrl(rf)}">${ico('book')} ${rf.replace(/^(\d+):p\./, '$1 · p.')}</a>`)}
              <span class="right row">${!it.ok ? html`<button class="btn sm ghost" data-contest="${i}" title="Minha resposta está certa (ex.: variação equivalente)">Contestar</button>` : ''}
              <button class="btn sm ghost" data-report="${i}">${ico('flag')} Reportar erro</button></span></div></div>
        </article>`;
      }) : html`<div class="empty">Nada nesta categoria.</div>`}
    </section>`.s;

  root.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.f) { location.hash = `#/resultado/${id}?f=${b.dataset.f}`; return; }
      if (b.dataset.act === 'retake') { const { id: nid } = await post(`/api/exams/${id}/retake`, { same: false }); location.hash = `#/prova/${nid}`; }
      else if (b.dataset.act === 'same') { const { id: nid } = await post(`/api/exams/${id}/retake`, { same: true }); location.hash = `#/prova/${nid}`; }
      else if (b.dataset.act === 'wrong') { const { id: nid } = await post(`/api/exams/${id}/wrong`); location.hash = `#/prova/${nid}`; }
      else if (b.dataset.contest !== undefined) {
        if (await confirmDialog({ title: 'Contestar esta questão?', body: 'Ela passará a contar como correta nas suas estatísticas. Use quando sua resposta for equivalente ao gabarito.', ok: 'Contar como correta' })) {
          await post(`/api/exams/${id}/contest`, { i: Number(b.dataset.contest) }); await render(root, { args, params }); toast('Contestação registrada.');
        }
      } else if (b.dataset.report !== undefined) {
        const note = prompt('O que está errado nesta questão?');
        if (note === null) return;
        const q = ex.questions[Number(b.dataset.report)];
        await post('/api/report', { qid: q.qid, examId: id, note });
        toast('Registrado para revisão do banco.');
      }
    } catch (err) { toast(err.message, 'err'); }
  };
  return () => { root.onclick = null; };
}
