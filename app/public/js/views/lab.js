import { get, post, meta } from '../api.js';
import { html, md, toast, fmtDuration, ico, st as stMark } from '../util.js';

const LEVELS = { 1: 'fácil', 2: 'médio', 3: 'difícil' };
const store = {
  get: (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* ok */ } },
  del: (k) => { try { sessionStorage.removeItem(k); } catch { /* ok */ } },
};

export async function render(root, ctx) {
  return ctx.args[0] ? runView(root, ctx.args[0]) : listView(root);
}

async function listView(root) {
  const [m, st, list] = await Promise.all([meta(), get('/api/lab/status'), get('/api/lab/challenges')]);
  const done = list.desafios.filter((d) => d.concluido).length;
  root.innerHTML = html`
    <div class="page-title"><h1>Laboratório</h1><p>Um Debian de verdade no navegador. Cada desafio sorteia nomes, números e arquivos novos e confere o resultado de verdade, rodando comandos no sistema.</p></div>
    <section class="card row">
      <span class="chip ${st.online ? 'ok' : 'bad'}">laboratório ${st.online ? 'online' : 'offline'}</span>
      <span class="muted small">${done}/${list.desafios.length} desafios concluídos</span>
      ${st.online ? '' : html`<span class="small">Suba o container: <code>docker compose up -d lab</code></span>`}
    </section>
    ${list.desafios.length ? Object.entries(m.topicos).map(([t, info]) => {
      const ds = list.desafios.filter((d) => m.byCode[d.obj]?.topico === t);
      if (!ds.length) return '';
      return html`<section class="card" style="margin-top:16px"><h3>${t} · ${info.titulo}</h3>
        <div class="omap">${ds.map((d) => html`<a class="challenge" href="#/lab/${d.id}">${stMark(d.concluido ? 'ok' : 'wait', d.concluido ? 'FEITO' : 'ABERTO')}<b>${d.titulo}</b>
          <span class="meta"><span class="mono">${d.obj}</span>, ${LEVELS[d.nivel] ?? ''}${d.minutos ? `, cerca de ${d.minutos} min` : ''}${d.tentativas ? `, ${d.tentativas} tentativa(s)` : ''}${d.melhor ? `, melhor tempo ${fmtDuration(d.melhor / 1000)}` : ''}</span></a>`)}</div></section>`;
    }) : html`<div class="empty" style="margin-top:16px">Nenhum desafio encontrado em <code>lab/challenges</code>.</div>`}`.s;
}

async function runView(root, id) {
  const key = `labrun:${id}`;
  let run = store.get(key);
  const st = await get('/api/lab/status');
  if (!st.online) {
    root.innerHTML = html`<div class="card"><h2>Laboratório offline</h2><p>O container do laboratório não está respondendo. Suba-o com:</p><pre><code>docker compose up -d lab</code></pre><a class="btn" href="#/lab">Voltar</a></div>`.s;
    return;
  }
  if (!run) {
    try { run = await post('/api/lab/start', { id }); store.set(key, run); } catch (e) {
      root.innerHTML = html`<div class="card"><h2>Não foi possível iniciar</h2><p class="muted">${e.message}</p><a class="btn" href="#/lab">Voltar</a></div>`.s; return;
    }
  }
  const termUrl = '/terminal/'; // proxy do próprio app (mesma origem, com checagem de Host/Origin)
  let hintsShown = 0;

  root.innerHTML = html`
    <div class="row" style="margin-bottom:12px"><a class="btn sm ghost" href="#/lab">${ico('left')} Desafios</a><h2 style="margin:0">${run.titulo}</h2>
      <span class="chip mono">${run.obj}</span><span class="chip">${LEVELS[run.nivel] ?? ''}</span></div>
    <div class="lab-split">
      <aside class="card side-panel">
        <div class="qtext">${md(run.enunciado)}</div>
        ${run.verifica.length ? html`<h4>O que será verificado</h4><ul style="margin:0 0 12px;padding-left:20px">${run.verifica.map((v) => html`<li class="small">${md(v, { inline: true })}</li>`)}</ul>` : ''}
        <div class="row">
          <button class="btn primary" data-act="check">${ico('check')} Verificar</button>
          <button class="btn" data-act="hint" ${run.dicas ? '' : 'disabled'}>${ico('bulb')} Dica</button>
          <button class="btn" data-act="solution">${ico('eye')} Solução</button>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="btn sm ghost" data-act="reset" title="Recria os arquivos/usuários do cenário">${ico('undo')} Reiniciar cenário</button>
          <button class="btn sm ghost" data-act="new" title="Sorteia novos nomes e valores">${ico('shuffle')} Novo sorteio</button>
        </div>
        <div id="out" style="margin-top:14px"></div>
      </aside>
      <div style="display:flex;flex-direction:column;gap:8px;min-height:0">
        <div class="term-frame"><div class="term-title">${ico('terminal')} aluno@lpic-lab: ~</div>
          <iframe src="${termUrl}" title="Terminal do laboratório" allow="clipboard-read; clipboard-write"></iframe></div>
        <p class="muted small" style="margin:0">Terminal como usuário <code>aluno</code> (com <code>sudo</code>) num container descartável — nada aqui afeta o seu computador. Não abre? <a href="${termUrl}" target="_blank" rel="noopener">abra em outra aba</a>.</p>
      </div>
    </div>`.s;

  const out = root.querySelector('#out');
  const busy = (b, on) => { b.disabled = on; };

  root.onclick = async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    try {
      busy(b, true);
      if (act === 'check') {
        out.innerHTML = '<span class="spinner"></span> Conferindo no laboratório…';
        const r = await post(`/api/lab/runs/${run.run}/check`);
        out.innerHTML = html`<h4>${r.passed ? 'Desafio concluído' : 'Ainda não'}</h4>
          ${r.results.map((x) => html`<div class="check"><span class="b">${stMark(x.ok ? 'ok' : 'bad')}</span><span>${x.msg}</span></div>`)}
          ${r.passed ? html`<div class="row" style="margin-top:10px"><a class="btn primary" href="#/lab">Próximo desafio</a></div>` : ''}`.s;
        if (r.passed) toast('Desafio concluído.');
      } else if (act === 'hint') {
        const r = await post(`/api/lab/runs/${run.run}/hint`);
        if (r.dica) {
          hintsShown++;
          const box = document.createElement('div'); box.className = 'feedback'; box.style.marginTop = '10px';
          box.innerHTML = `<b>Dica ${r.n}/${r.de}</b>${md(r.dica).s}`;
          out.prepend(box);
          if (r.n >= r.de) b.dataset.exhausted = '1'; // última dica: mantém desabilitado
        }
      } else if (act === 'solution') {
        const r = await post(`/api/lab/runs/${run.run}/solution`);
        const box = document.createElement('div'); box.className = 'feedback'; box.style.marginTop = '10px';
        box.innerHTML = `<b>Solução</b>${md(r.solucao).s}`;
        out.prepend(box);
      } else if (act === 'reset') {
        await post(`/api/lab/runs/${run.run}/reset`);
        toast('Cenário reiniciado.');
      } else if (act === 'new') {
        store.del(key);
        await render(root, { args: [id] });
        return;
      }
    } catch (err) { toast(err.message, 'err'); } finally { if (!b.dataset.exhausted) busy(b, false); }
  };
  return () => { root.onclick = null; };
}
