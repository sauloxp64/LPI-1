import { get, post, meta } from '../api.js';
import { html, toast, fmtDate, confirmDialog } from '../util.js';

const TARGET = { 1: 10, 2: 14, 3: 20, 4: 26, 5: 32 };

export async function render(root) {
  const [m, reports, lab] = await Promise.all([meta(true), get('/api/reports'), get('/api/lab/status')]);
  const b = m.banco;
  const rows = m.objetivos.map((o) => {
    const s = b.porObj[o.code] ?? { n: 0, unica: 0, multipla: 0, lacuna: 0, geradores: 0 };
    return { o, s, meta: TARGET[o.peso], ok: s.n >= TARGET[o.peso] };
  });

  root.innerHTML = html`
    <div class="page-title"><h1>Configurações</h1><p>Dados, banco de questões e saúde do sistema.</p></div>
    <div class="grid c2" style="align-items:start">
      <section class="card stack"><h3>Seus dados</h3>
        <p class="muted small" style="margin:0">Tudo fica no volume Docker <code>dados</code> (SQLite) — nada sai do seu computador.</p>
        <div class="row"><a class="btn" href="/api/export" download="lpic1-progresso.json">⬇ Exportar progresso</a>
          <label class="btn">⬆ Importar<input type="file" id="imp" accept="application/json" class="sr-only"></label></div>
        <hr style="border:0;border-top:1px solid var(--line);width:100%">
        <button class="btn danger" id="reset">Apagar todo o progresso…</button></section>

      <section class="card stack"><h3>Sistema</h3>
        <div class="row"><span class="chip ${lab.online ? 'ok' : 'bad'}">laboratório ${lab.online ? 'online' : 'offline'}</span>
          <span class="chip ${m.pdf.indice === 'pronto' ? 'ok' : 'warn'}">busca nos PDFs: ${m.pdf.indice}</span>
          <span class="chip">${b.total} questões</span><span class="chip">${b.geradores} geradores</span><span class="chip">${b.desafios} desafios</span></div>
        <div class="row"><button class="btn" id="reload">↻ Recarregar banco e desafios</button></div>
        <p class="muted small" style="margin:0">Para acrescentar questões suas, edite <code>app/content/questions/*.txt</code> (formato em <code>app/content/FORMATO.md</code>) e recarregue.</p>
        ${b.erros.length ? html`<div class="feedback no"><b>${b.erros.length} erro(s) de validação</b><ul class="small">${b.erros.map((e) => html`<li><code>${e.file}:${e.line}</code> ${e.id ?? ''} ${e.msg}</li>`)}</ul></div>` : ''}
        ${b.avisos ? html`<p class="muted small" style="margin:0">${b.avisos} aviso(s) de qualidade — rode <code>node app/tools/lint-questions.mjs</code>.</p>` : ''}
      </section>
    </div>

    <section class="card" style="margin-top:16px"><h3>Cobertura do banco por objetivo</h3>
      <p class="muted small">Meta mínima proporcional ao peso (10/14/20/26/32). Geradores criam variações ilimitadas por cima disso.</p>
      <div style="overflow-x:auto"><table><thead><tr><th>Obj.</th><th>Peso</th><th>Fixas</th><th>única</th><th>múlt.</th><th>lacuna</th><th>Geradores</th><th></th></tr></thead><tbody>
        ${rows.map(({ o, s, meta: mt, ok }) => html`<tr><td><a href="#/objetivo/${o.code}" class="mono">${o.code}</a> <span class="muted small">${o.titulo}</span></td><td>${o.peso}</td><td>${s.n}/${mt}</td><td>${s.unica}</td><td>${s.multipla}</td><td>${s.lacuna}</td><td>${s.geradores}</td><td>${ok ? '✓' : '…'}</td></tr>`)}
      </tbody></table></div></section>

    <section class="card" style="margin-top:16px"><h3>Questões reportadas</h3>
      ${reports.reports.length ? html`<table><thead><tr><th>Quando</th><th>Questão</th><th>Nota</th></tr></thead><tbody>${reports.reports.map((r) => html`<tr><td class="small">${fmtDate(r.ts)}</td><td class="mono small">${r.qid}</td><td>${r.note}</td></tr>`)}</tbody></table>`
        : html`<p class="muted">Nenhuma. Use "🚩 Reportar erro" durante a revisão se achar um gabarito duvidoso.</p>`}</section>

    <section class="card" style="margin-top:16px"><h3>Sobre</h3>
      <p class="small muted" style="margin:0">Material de estudo: <i>LPI Learning Material</i> (LPIC-1 101-500 e 102-500, pt-BR), © Linux Professional Institute, licença CC BY-NC-ND 4.0 — os PDFs ficam apenas no seu repositório e são servidos localmente. Objetivos: <a href="https://www.lpi.org/pt-br/exam-101-102-objectives/" target="_blank" rel="noopener">lpi.org</a> (versão 5.0). Este app não é afiliado à LPI; confirme formato, preço e regras da prova no site oficial / Pearson VUE.</p></section>`.s;

  root.querySelector('#reload').onclick = async () => { await post('/api/bank/reload'); toast('Banco recarregado.'); await render(root); };
  root.querySelector('#imp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!(await confirmDialog({ title: 'Importar progresso?', body: 'Isso substitui todo o progresso atual.', ok: 'Importar', danger: true }))) return;
    try { await post('/api/import', JSON.parse(await f.text())); toast('Progresso importado.'); } catch (err) { toast(err.message, 'err'); }
  };
  root.querySelector('#reset').onclick = async () => {
    const typed = prompt('Isto apaga TODO o progresso (provas, estatísticas, avanço no curso). Digite APAGAR para confirmar:');
    if (typed !== 'APAGAR') return;
    await post('/api/reset', { confirm: 'APAGAR' }); toast('Progresso apagado.'); location.hash = '#/';
  };
}
