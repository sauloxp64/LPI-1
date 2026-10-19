import { get, meta } from '../api.js';
import { html, esc } from '../util.js';

export async function render(root, { params }) {
  const m = await meta();
  const extras = m.pdf.extras ?? [];
  const extraById = Object.fromEntries(extras.map((e) => [e.id, e]));
  const isExtra = (ex) => Object.hasOwn(extraById, ex);
  const label = (ex) => (isExtra(ex) ? extraById[ex].titulo : `Exame ${ex}`);
  const shortLabel = (ex) => (isExtra(ex) ? `📘 ${extraById[ex].titulo.replace(/\s*\(.*$/, '').slice(0, 26)}` : `Exame ${ex}`);

  // parâmetros da URL vêm de fora: só aceitamos valores conhecidos (evita XSS/injeção em innerHTML)
  const objRaw = params.get('obj');
  const objParam = objRaw && Object.hasOwn(m.byCode, objRaw) ? objRaw : null; // hasOwn: 'constructor' etc. não são objetivos
  const validExams = ['101', '102', ...extras.map((e) => e.id)];
  let exam = validExams.includes(params.get('exame')) ? params.get('exame') : (objParam ? m.byCode[objParam].exame : '101');
  let page = Math.min(2000, Math.max(1, Number(params.get('p') ?? (objParam ? m.byCode[objParam].pdf?.inicio : 2)) || 2));

  const semPdf = !m.pdf.disponiveis?.['101'] && !m.pdf.disponiveis?.['102'] && !extras.length;
  if (semPdf) {
    root.innerHTML = html`<div class="page-title"><h1>Material oficial da LPI</h1></div>
      <div class="card stack"><h3>Os PDFs da LPI ainda não estão na pasta do projeto</h3>
        <p>O material de estudo é gratuito, mas pertence à LPI (licença CC BY-NC-ND) e por isso não vem junto com o código. Baixe no portal <b>learning.lpi.org</b> (Learning Materials → LPIC-1 → 101-500 e 102-500, em português) e salve na <b>raiz do projeto</b> com estes nomes:</p>
        <pre><code>${m.pdf.arquivos['101']}
${m.pdf.arquivos['102']}</code></pre>
        <p class="muted small" style="margin:0">Depois recarregue esta página. Qualquer outro PDF que você colocar na mesma pasta aparece aqui como <i>complemento</i>. Todo o resto do app (simulados, laboratório, curso) funciona sem os PDFs; só os links "📖 material" e a busca dependem deles.</p></div>`.s;
    return;
  }

  const officialTree = (ex) => Object.entries(m.topicos).filter(([, t]) => t.exame === ex).map(([t, info]) => html`
    <details ${objParam && m.byCode[objParam]?.topico === t ? 'open' : ''}><summary>${t} · ${info.titulo}</summary>
      ${m.objetivos.filter((o) => o.topico === t).map((o) => html`<details ${objParam === o.code ? 'open' : ''}><summary style="font-weight:500"><span class="mono">${o.code}</span> ${o.titulo}</summary>
        ${(o.pdf?.secoes ?? []).filter((s) => !/^Respostas aos/.test(s.title)).map((s) => html`<a class="sec" href="#" data-open="${ex}:${s.page}"><span>${s.title}</span><span class="p">${s.page}</span></a>`)}
      </details>`)}
    </details>`);

  const extraPanel = (ex) => html`<div class="stack small">
      <p style="margin:0"><b>${extraById[ex].titulo}</b></p>
      <p class="muted" style="margin:0">Material complementar (fora do conteúdo oficial v5.0 da LPI — pode estar desatualizado em relação aos objetivos atuais). ${extraById[ex].pesquisavel ? 'A busca acima também varre este PDF.' : html`Sem texto pesquisável: rode <code>scripts/ocr-pdf.sh</code> para gerar o OCR.`}</p>
      <form data-goto class="row"><label class="muted" for="gp">Ir para a página</label><input id="gp" type="number" min="1" max="2000" value="${page}" style="width:90px"><button class="btn sm" type="submit">Ir</button></form></div>`;

  const tree = (ex) => (isExtra(ex) ? extraPanel(ex) : officialTree(ex));

  root.innerHTML = html`
    <div class="page-title"><h1>Material de estudo</h1><p>Os PDFs oficiais da LPI com índice por objetivo${extras.length ? ' e os complementos da pasta' : ''}, com busca em texto completo.</p></div>
    <div class="split">
      <aside class="card tree">
        <input type="search" id="q" placeholder="Buscar no material… (ex.: umask, fstab, cron)" aria-label="Buscar no material">
        <div id="results" class="hidden" style="margin-top:8px"></div>
        <div id="toc" style="margin-top:10px">
          <div class="seg" style="margin-bottom:8px;flex-wrap:wrap">${validExams.map((ex) => html`<button data-ex="${ex}" class="${exam === ex ? 'on' : ''}" title="${label(ex)}">${shortLabel(ex)}</button>`)}</div>
          <div id="tree">${tree(exam)}</div>
        </div>
      </aside>
      <div class="pdf" style="min-height:0;display:flex;flex-direction:column;gap:8px">
        <div class="row small muted" id="where"></div>
        <div id="frame" style="flex:1;min-height:0"></div>
      </div>
    </div>`.s;

  const frame = root.querySelector('#frame');
  const where = root.querySelector('#where');
  function open(ex, p, term = '') {
    if (!validExams.includes(ex)) return;
    exam = ex; page = p;
    if (!m.pdf.disponiveis?.[ex]) { frame.innerHTML = `<div class="empty">PDF do exame ${esc(ex)} não encontrado na pasta do projeto (${esc(m.pdf.arquivos[ex] ?? '')}).</div>`; where.innerHTML = ''; return; }
    const src = `/pdf/${ex}#page=${p}${term ? `&search=${encodeURIComponent(term)}` : ''}`;
    frame.innerHTML = `<iframe src="${esc(src)}" title="PDF ${esc(label(ex))}"></iframe>`;
    const o = isExtra(ex) ? null : m.objetivos.find((x) => x.exame === ex && x.pdf && p >= x.pdf.inicio && p <= x.pdf.fim);
    where.innerHTML = `<span>${esc(label(ex))} · página ${p}${o ? ` · <a href="#/objetivo/${o.code}">${o.code} ${esc(o.titulo)}</a>` : ''}</span>
      <a class="right" href="${esc(src)}" target="_blank" rel="noopener">abrir em nova aba ↗</a>`;
    history.replaceState(null, '', `#/material?exame=${ex}&p=${p}${objParam ? `&obj=${objParam}` : ''}`);
  }
  open(exam, page);

  const treeEl = root.querySelector('#tree');
  root.querySelectorAll('[data-ex]').forEach((b) => {
    b.onclick = () => {
      root.querySelectorAll('[data-ex]').forEach((x) => x.classList.toggle('on', x === b));
      treeEl.innerHTML = html`${tree(b.dataset.ex)}`.s;
      if (isExtra(b.dataset.ex)) open(b.dataset.ex, 1); // complementos não têm índice: abre na primeira página
    };
  });

  root.onclick = (e) => {
    const a = e.target.closest('[data-open]');
    if (!a) return;
    e.preventDefault();
    const [ex, p, term] = a.dataset.open.split(':');
    open(ex, Number(p), term ? decodeURIComponent(term) : '');
  };
  root.onsubmit = (e) => {
    if (!e.target.matches('[data-goto]')) return;
    e.preventDefault();
    open(exam, Math.min(2000, Math.max(1, Number(e.target.querySelector('input').value) || 1)));
  };

  // busca em texto completo
  const q = root.querySelector('#q'); const results = root.querySelector('#results'); const toc = root.querySelector('#toc');
  let timer = null;
  q.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const term = q.value.trim();
      if (term.length < 2) { results.classList.add('hidden'); toc.classList.remove('hidden'); return; }
      const r = await get(`/api/search?q=${encodeURIComponent(term)}`);
      toc.classList.add('hidden'); results.classList.remove('hidden');
      const words = term.split(/\s+/).filter((t) => t.length > 1).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const re = new RegExp(`(${words.join('|')})`, 'gi');
      results.innerHTML = r.estado !== 'pronto' ? `<p class="muted small">Índice ${esc(r.estado)}…</p>`
        : r.resultados.length ? r.resultados.map((x) => `<a class="result-item" href="#" data-open="${esc(x.exame)}:${Number(x.pagina)}:${encodeURIComponent(term)}">
            <div class="row small"><b>${esc(x.titulo ? `📘 ${x.titulo.replace(/\s*\(.*$/, '')}` : `Exame ${x.exame}`)} · p.${Number(x.pagina)}</b>${x.obj ? `<span class="chip mono">${esc(x.obj)}</span>` : ''}</div>
            <div class="small muted">…${esc(x.trecho).replace(re, '<mark>$1</mark>')}…</div></a>`).join('')
          : '<p class="muted small">Nada encontrado.</p>';
    }, 250);
  };
  return () => { root.onclick = null; root.onsubmit = null; };
}
