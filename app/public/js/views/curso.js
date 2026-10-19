import { get, put, post, meta } from '../api.js';
import { html, pct, dots, tone, toast } from '../util.js';

const STATUS = [['nao', 'Não vi'], ['estudando', 'Estudando'], ['concluido', 'Concluído']];

export async function render(root) {
  const [m, prog, st] = await Promise.all([meta(), get('/api/progress'), get('/api/stats')]);
  const mastery = Object.fromEntries(st.objetivos.map((o) => [o.code, o]));
  const total = m.objetivos.reduce((s, o) => s + o.peso, 0);
  const done = m.objetivos.reduce((s, o) => s + o.peso * ({ concluido: 1, estudando: 0.5 }[prog.status[o.code]] ?? 0), 0);
  const unlocked = m.objetivos.filter((o) => ['estudando', 'concluido'].includes(prog.status[o.code]));
  const aulas = m.curso.aulas ?? {};
  const open = new Set(JSON.parse(sessionStorage.getItem('cursoAbertos') ?? 'null') ?? Object.keys(m.topicos));

  root.innerHTML = html`
    <div class="page-title"><h1>Meu avanço no curso</h1>
      <p><a href="${m.curso.url}" target="_blank" rel="noopener">${m.curso.nome} — ${m.curso.plataforma} ↗</a></p></div>

    <section class="card">
      <div class="row">
        <div style="flex:1;min-width:240px">
          <div class="row small"><b>Conteúdo visto (ponderado pelos pesos da prova)</b><span class="right">${pct(done / total)}</span></div>
          <div class="bar"><i style="width:${Math.round((100 * done) / total)}%"></i></div>
          <p class="muted small" style="margin:8px 0 0">Marque o status de cada objetivo conforme avança nas aulas. Os simulados <b>"do que já vi"</b> usam só o que está <i>Estudando</i> ou <i>Concluído</i>, então o banco acompanha o curso — e o painel considera todo o resto como ainda não estudado.</p>
        </div>
        <div class="stack">
          <a class="btn primary ${unlocked.length ? '' : 'hidden'}" href="#/novo?modo=curso">📝 Simulado do que já vi (${unlocked.length} obj.)</a>
          <div class="row"><button class="btn sm" data-bulk="topico">Marcar tópicos vistos…</button></div>
        </div>
      </div>
    </section>

    <div class="stack" style="margin-top:16px">
    ${Object.entries(m.topicos).map(([t, info]) => {
      const objs = m.objetivos.filter((o) => o.topico === t);
      const nDone = objs.filter((o) => prog.status[o.code] === 'concluido').length;
      return html`<details class="card" data-topic="${t}" ${open.has(t) ? 'open' : ''}>
        <summary class="row" style="cursor:pointer;list-style:none"><h2 style="margin:0">Tópico ${t} · ${info.titulo}</h2>
          <span class="chip">peso ${info.peso}</span><span class="chip ${nDone === objs.length ? 'ok' : ''}">${nDone}/${objs.length} concluídos</span><span class="chip">Exame ${info.exame}</span></summary>
        <div class="stack" style="margin-top:12px">
        ${objs.map((o) => {
          const cur = prog.status[o.code] ?? 'nao';
          const mm = mastery[o.code];
          const lessons = aulas[o.code] ?? [];
          return html`<div class="card tight" style="background:var(--panel-2)">
            <div class="row">
              <div style="flex:1;min-width:230px"><a href="#/objetivo/${o.code}"><b class="mono">${o.code}</b> ${o.titulo}</a>
                <div class="row small muted" style="margin-top:3px"><span title="peso na prova">${dots(o.peso)} peso ${o.peso}</span>
                  <span class="chip ${mm.n ? tone(mm.mastery) : ''}">${mm.n ? `domínio ${pct(mm.mastery)}` : 'sem respostas'}</span></div></div>
              <div class="seg" role="group" aria-label="Status de ${o.code}">${STATUS.map(([v, l]) => html`<button data-set="${o.code}" data-v="${v}" class="${cur === v ? 'on' : ''} ${v === 'estudando' ? 'mid' : ''}">${l}</button>`)}</div>
            </div>
            ${lessons.length ? html`<div class="row" style="margin-top:10px;gap:6px 14px">${lessons.map((a, i) => html`<label class="small row" style="gap:6px;cursor:pointer">
              <input type="checkbox" data-lesson="${o.code}:${i}" ${prog.aulas[`${o.code}:${i}`] ? 'checked' : ''}> ${a}</label>`)}</div>` : ''}
            <div class="row" style="margin-top:10px">
              <a class="btn sm" href="#/material?obj=${o.code}">📖 Material (p.${o.pdf?.inicio ?? '?'})</a>
              <button class="btn sm" data-train="${o.code}">🎯 Treinar 10</button>
              <a class="btn sm ghost" href="#/lab">🧪 Lab</a>
            </div></div>`;
        })}
        </div></details>`;
    })}
    </div>`.s;

  const again = async () => { const y = window.scrollY; await render(root); window.scrollTo(0, y); };

  root.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.set) {
      await put('/api/progress', { obj: b.dataset.set, status: b.dataset.v });
      return again();
    }
    if (b.dataset.train) {
      try { const { id } = await post('/api/exams', { mode: 'treino', objetivos: [b.dataset.train], n: 10 }); location.hash = `#/prova/${id}`; } catch (err) { toast(err.message, 'err'); }
    }
    if (b.dataset.bulk) {
      const quais = prompt('Até qual tópico você já viu no curso? (ex.: 103 marca 101, 102 e 103 como concluídos)', '103');
      if (!quais || !/^1\d\d$/.test(quais.trim())) return;
      const lim = Number(quais.trim());
      for (const o of m.objetivos.filter((x) => Number(x.topico) <= lim)) await put('/api/progress', { obj: o.code, status: 'concluido' });
      return again();
    }
  };
  root.onchange = async (e) => {
    const c = e.target.closest('[data-lesson]');
    if (!c) return;
    await put('/api/lessons', { key: c.dataset.lesson, done: c.checked });
    return again();
  };
  root.ontoggle = () => {
    sessionStorage.setItem('cursoAbertos', JSON.stringify([...root.querySelectorAll('details[data-topic][open]')].map((d) => d.dataset.topic)));
  };
  root.querySelectorAll('details[data-topic]').forEach((d) => d.addEventListener('toggle', root.ontoggle));
  return () => { root.onclick = null; root.onchange = null; };
}
