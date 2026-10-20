import { get, put, post } from '../api.js';
import { html, raw, md, clock, LETTERS, stars, toast, confirmDialog, esc, ico } from '../util.js';

export async function render(root, { args, isCurrent = () => true }) {
  const id = args[0];
  const ex = await get(`/api/exams/${id}`);
  if (!isCurrent()) return; // o usuário já saiu desta tela: não redireciona nem registra efeitos globais
  if (ex.status === 'finalizado') { location.replace(`#/resultado/${id}`); return; }

  const offset = ex.now - Date.now();
  const answers = { ...ex.answers };
  const flags = new Set(ex.flags);
  const feedback = {}; // i -> resposta de /check (modo treino)
  let cur = Number((new URLSearchParams(location.hash.split('?')[1] ?? '')).get('q') ?? 0) || 0;
  let saveTimer = null; let pending = new Set(); let tick = null; let finishing = false; let done = false;

  const isBlank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  const answeredCount = () => ex.questions.reduce((s, _, i) => s + (isBlank(answers[i]) ? 0 : 1), 0);

  let saving = Promise.resolve();
  // versões por resposta/flags: o servidor ignora lotes antigos que chegam fora de ordem. Ao reabrir a prova a numeração continua da do servidor.
  const ver = { ...(ex.vers ?? {}) }; delete ver.flags; let flagsVer = Number(ex.vers?.flags) || 0;
  const checking = new Set(); // questões com correção em andamento (treino): não aceitam edição
  const setSaveState = (t, err = false) => { const el = root.querySelector('#savestate'); if (el) { el.textContent = t; el.classList.toggle('err', err); } };
  const flush = (keepalive = false) => {
    clearTimeout(saveTimer);
    if (done) return Promise.resolve(); // prova finalizada: o servidor recusa novas respostas
    if (!pending.size && !keepalive) return saving;
    const keys = [...pending]; pending = new Set();
    const send = () => {
      const batch = {}; const vers = {};
      keys.forEach((i) => { batch[i] = isBlank(answers[i]) ? null : answers[i]; vers[i] = ver[i] ?? 0; });
      return fetch(`/api/exams/${id}/answers`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, keepalive,
        body: JSON.stringify({ answers: batch, vers, flags: [...flags], fv: flagsVer }),
      }).then(async (r) => {
        if (!r.ok && r.status !== 409) throw new Error(`HTTP ${r.status}`);
        const out = r.ok && !keepalive ? await r.json().catch(() => null) : null;
        // o servidor descartou edições por já ter versão mais nova (ex.: outra aba aberta): assume a numeração dele e reenvia o que o usuário vê agora
        if (out && (out.ignored?.length || out.flagsIgnored) && !done) {
          for (const i of out.ignored ?? []) { ver[i] = Math.max(ver[i] ?? 0, Number(out.vers?.[i]) || 0) + 1; pending.add(i); }
          if (out.flagsIgnored) { flagsVer = Math.max(flagsVer, Number(out.vers?.flags) || 0) + 1; pending.add(cur); }
          setSaveState('sincronizando'); scheduleSave();
          return;
        }
        setSaveState('salvo');
      }).catch(() => {
        // não descarta: devolve à fila e tenta de novo (o lote seguinte já leva o valor mais recente)
        keys.forEach((i) => pending.add(i));
        setSaveState('não salvo, tentando de novo', true);
        if (!keepalive && !done) { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 3000); }
      });
    };
    saving = keepalive ? send() : saving.then(send); // lotes chegam ao servidor na ordem em que foram gerados
    return saving;
  };
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 450); };

  root.innerHTML = html`
    <div class="exam-head">
      <div class="row">
        <h2 style="margin:0">${ex.title}</h2>
        <span class="chip" id="prog"></span><span class="small muted" id="savestate" aria-live="polite"></span>
        ${ex.minutes ? html`<span class="timer right" id="timer" title="Tempo restante">--:--</span>` : html`<span class="chip right">sem cronômetro</span>`}
        <button class="btn primary" id="finish">${ex.instant ? 'Encerrar treino' : 'Finalizar'}</button>
      </div>
    </div>
    <div class="exam">
      <div id="qwrap"></div>
      <aside class="card tight" style="position:sticky;top:78px">
        <h3>Navegação</h3>
        <div class="navgrid" id="nav"></div>
        <p class="legend"><span><i class="l-flag"></i>marcada</span><span><i class="l-done"></i>respondida</span></p>
        <p class="small muted" style="margin:10px 0 0;line-height:1.9"><kbd>setas</kbd> navegar<br><kbd>1</kbd> a <kbd>5</kbd> ou <kbd>A</kbd> a <kbd>E</kbd> escolher<br><kbd>F</kbd> marcar${ex.instant ? html`<br><kbd>Enter</kbd> corrigir` : ''}</p>
      </aside>
    </div>`.s;

  const qwrap = root.querySelector('#qwrap');
  const navEl = root.querySelector('#nav');

  function drawHead() {
    root.querySelector('#prog').textContent = `${answeredCount()}/${ex.n} respondidas, ${flags.size} marcadas`;
  }

  function drawNav() {
    navEl.innerHTML = ex.questions.map((q, i) => {
      const fb = feedback[i] ?? (ex.instant && ex.checked?.includes(i) ? { ok: undefined } : null);
      const cls = [!isBlank(answers[i]) ? 'done' : '', i === cur ? 'cur' : '', flags.has(i) ? 'flag' : '', fb?.ok === true ? 'ok' : fb?.ok === false ? 'no' : ''].join(' ');
      return `<button data-go="${i}" class="${cls}" aria-label="Questão ${i + 1}">${i + 1}</button>`;
    }).join('');
  }

  function drawQuestion() {
    const q = ex.questions[cur];
    const fb = feedback[cur];
    const locked = ex.instant && (fb || ex.checked?.includes(cur));
    const sel = new Set(Array.isArray(answers[cur]) ? answers[cur] : []);
    const gab = fb?.gabarito ? new Set(fb.gabarito) : null;
    let body;
    if (q.type === 'lacuna') {
      body = html`<input type="text" class="mono" id="lac" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Digite a resposta" value="${typeof answers[cur] === 'string' ? answers[cur] : ''}" ${locked ? 'disabled' : ''} aria-label="Resposta">
        ${fb ? html`<p class="small muted" style="margin-top:8px">Respostas aceitas: ${(fb.gabarito || []).map((a) => html`<code>${a}</code> `)}</p>` : html`<p class="small muted" style="margin-top:8px">Distingue maiúsculas de minúsculas, como no Linux.</p>`}`;
    } else {
      body = html`<div class="opts" role="${q.type === 'unica' ? 'radiogroup' : 'group'}">${q.options.map((t, k) => {
        const on = sel.has(k);
        const cls = ['opt', q.type === 'multipla' ? 'multi' : '', on ? 'sel' : '', locked ? 'locked' : '',
          gab && gab.has(k) ? 'good' : '', gab && on && !gab.has(k) ? 'bad' : ''].join(' ');
        return html`<label class="${cls}" data-opt="${k}"><input type="${q.type === 'unica' ? 'radio' : 'checkbox'}" name="q" ${on ? 'checked' : ''} ${locked ? 'disabled' : ''}>
          <span class="key">${LETTERS[k]}</span><span class="txt">${md(t, { inline: true })}</span>${gab ? html`<span class="mark">${gab.has(k) ? html`${ico('check')} correta` : on ? html`${ico('x')} sua resposta` : ''}</span>` : ''}</label>`;
      })}</div>`;
    }
    qwrap.innerHTML = html`<section class="card qcard">
      <div class="row qmeta"><b>Questão ${cur + 1} de ${ex.n}</b>${ex.instant ? html`<span class="lvl" title="dificuldade">dificuldade ${stars(q.level)}</span>` : ''}
        ${flags.has(cur) ? html`<span class="chip warn">${ico('flag')} marcada</span>` : ''}</div>
      ${q.type === 'multipla' ? html`<div class="qhint">Selecione ${q.escolhas} respostas.</div>` : q.type === 'lacuna' ? html`<div class="qhint">Preencha a lacuna.</div>` : ''}
      <div class="qtext">${md(q.text)}</div>
      ${body}
      ${fb ? feedbackBox(fb) : ''}
      <div class="row" style="margin-top:18px">
        <button class="btn" data-prev ${cur === 0 ? 'disabled' : ''}>${ico('left')} Anterior</button>
        <button class="btn ghost" data-flag>${ico('flag')} ${flags.has(cur) ? 'Desmarcar' : 'Marcar para revisão'}</button>
        ${ex.instant && !locked ? html`<button class="btn primary right" data-check>Corrigir</button>` : ''}
        <button class="btn ${ex.instant && !locked ? '' : 'primary'} ${ex.instant && !locked ? '' : 'right'}" data-next>${cur === ex.n - 1 ? 'Revisar e finalizar' : html`Próxima ${ico('right')}`}</button>
      </div></section>`.s;
    drawHead(); drawNav();
    const lac = qwrap.querySelector('#lac');
    if (lac && !locked) lac.focus({ preventScroll: true });
  }

  function feedbackBox(fb) {
    return html`<div class="feedback ${fb.ok ? 'ok' : 'no'}"><h4>${fb.ok ? html`${ico('check')} Resposta correta` : html`${ico('x')} Resposta incorreta`}</h4>
      ${md(fb.explanation)}
      <div class="row small" style="margin-top:8px"><span class="chip mono">${fb.obj}</span>
        ${(fb.ref ?? []).map((r) => html`<a class="chip" target="_blank" rel="noopener" href="${refUrl(r)}">${ico('book')} material ${r.replace(/^(\d+):p\./, '$1 · p.')}</a>`)}
        <button class="btn sm ghost right" data-report>${ico('flag')} Reportar erro</button></div></div>`;
  }

  const refUrl = (r) => { const m = /^(\d+):p\.(\d+)/.exec(r); return m ? `/pdf/${m[1]}#page=${m[2]}` : '#'; };

  async function check() {
    const i = cur; // fixa o índice: o usuário pode avançar antes de a resposta do servidor chegar
    if (checking.has(i)) return;
    if (isBlank(answers[i])) return toast('Responda antes de corrigir.');
    checking.add(i);
    try {
      const out = await post(`/api/exams/${id}/check`, { i, answer: answers[i] });
      answers[i] = out.given ?? answers[i]; // o servidor é a fonte da verdade sobre o que foi corrigido
      feedback[i] = out; ex.checked = [...new Set([...(ex.checked ?? []), i])];
      if (cur === i) drawQuestion(); else drawNav();
    } catch (e) { toast(e.message, 'err'); } finally { checking.delete(i); }
  }

  async function ensureFeedback() {
    const i = cur;
    if (ex.instant && ex.checked?.includes(i) && !feedback[i]) {
      try { feedback[i] = await post(`/api/exams/${id}/check`, { i, answer: answers[i] ?? '' }); } catch { /* ignora */ }
    }
  }

  const go = async (n) => {
    if (n < 0 || n >= ex.n) return;
    cur = n; await ensureFeedback(); drawQuestion();
    history.replaceState(null, '', `#/prova/${id}?q=${cur}`);
  };

  function toggleFlag() {
    flags.has(cur) ? flags.delete(cur) : flags.add(cur);
    flagsVer++; pending.add(cur); scheduleSave(); drawQuestion();
  }

  function setAnswer(v) {
    ver[cur] = (ver[cur] ?? 0) + 1;
    answers[cur] = v; pending.add(cur); scheduleSave(); drawHead();
    navEl.querySelector(`[data-go="${cur}"]`)?.classList.toggle('done', !isBlank(v));
  }

  async function finish(auto = false) {
    if (finishing) return; finishing = true;
    if (!auto) {
      const blank = ex.n - answeredCount();
      const ok = await confirmDialog({
        title: ex.instant ? 'Encerrar treino?' : 'Finalizar o simulado?',
        body: html`<p>${blank ? html`Você tem <b>${blank}</b> questão(ões) em branco. ` : 'Todas as questões foram respondidas. '}${flags.size ? html`<b>${flags.size}</b> marcada(s) para revisão.` : ''}</p><p class="muted small">Depois de finalizar não dá para alterar as respostas.</p>`,
        ok: 'Finalizar',
      });
      if (!ok) { finishing = false; return; }
    }
    clearInterval(tick);
    try {
      await flush(); // melhor esforço (não rejeita): o estado COMPLETO vai junto, inclusive respostas apagadas (null) e marcações
      const full = Object.fromEntries(ex.questions.map((_, i) => [i, isBlank(answers[i]) ? null : answers[i]]));
      await post(`/api/exams/${id}/finish`, { answers: full, flags: [...flags] });
      done = true;
      location.hash = `#/resultado/${id}`;
    } catch (e) { finishing = false; toast(e.message, 'err'); }
  }

  root.onclick = (e) => {
    const t = e.target;
    const opt = t.closest('[data-opt]');
    if (opt) {
      e.preventDefault();
      const q = ex.questions[cur];
      if (ex.instant && (feedback[cur] || ex.checked?.includes(cur))) return;
      if (checking.has(cur)) return; // correção em andamento: não deixa a tela divergir do que foi enviado
      const k = Number(opt.dataset.opt);
      if (q.type === 'unica') setAnswer([k]);
      else { const s = new Set(Array.isArray(answers[cur]) ? answers[cur] : []); s.has(k) ? s.delete(k) : s.add(k); setAnswer([...s].sort((a, b) => a - b)); }
      drawQuestion();
      return;
    }
    const b = t.closest('button');
    if (!b) return;
    if (b.dataset.go !== undefined) go(Number(b.dataset.go));
    else if ('prev' in b.dataset) go(cur - 1);
    else if ('next' in b.dataset) { cur === ex.n - 1 ? finish() : go(cur + 1); }
    else if ('flag' in b.dataset) toggleFlag();
    else if ('check' in b.dataset) check();
    else if ('report' in b.dataset) reportQ();
    else if (b.id === 'finish') finish();
  };
  root.oninput = (e) => {
    if (e.target.id !== 'lac') return;
    if (checking.has(cur)) { e.target.value = typeof answers[cur] === 'string' ? answers[cur] : ''; return; }
    setAnswer(e.target.value);
  };

  async function reportQ() {
    const note = prompt('O que está errado nesta questão? (gabarito, enunciado, ambiguidade…)');
    if (note === null) return;
    const fb = feedback[cur];
    await post('/api/report', { qid: fb?.qid ?? `${id}#${cur}`, examId: id, note });
    toast('Obrigado! Registrei para revisão do banco.');
  }

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const inText = e.target.matches?.('input[type=text], textarea');
    if (e.key === 'Enter' && inText && e.target.id === 'lac') { e.preventDefault(); ex.instant && !feedback[cur] ? check() : go(cur + 1); return; }
    if (inText) return;
    const q = ex.questions[cur];
    if (e.key === 'ArrowRight') go(cur + 1);
    else if (e.key === 'ArrowLeft') go(cur - 1);
    else if (e.key.toLowerCase() === 'f') toggleFlag();
    else if (e.key === 'Enter' && ex.instant) { feedback[cur] ? go(cur + 1) : check(); }
    else if (q.type !== 'lacuna') {
      const k = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : LETTERS.indexOf(e.key.toUpperCase());
      if (k >= 0 && k < q.options.length) root.querySelector(`[data-opt="${k}"]`)?.click();
    }
  };
  document.addEventListener('keydown', onKey);

  if (ex.minutes) {
    const timerEl = root.querySelector('#timer');
    const update = () => {
      const left = ex.deadline - (Date.now() + offset);
      timerEl.textContent = clock(left);
      timerEl.classList.toggle('low', left < 10 * 60e3);
      timerEl.classList.toggle('crit', left < 2 * 60e3);
      if (left <= 0) { toast('Tempo esgotado — finalizando…', 'err'); finish(true); }
    };
    update(); tick = setInterval(update, 500);
  }
  const onHide = () => flush(true);
  window.addEventListener('pagehide', onHide);

  await ensureFeedback();
  drawQuestion();

  return () => {
    clearInterval(tick); document.removeEventListener('keydown', onKey); window.removeEventListener('pagehide', onHide);
    root.onclick = null; root.oninput = null; flush(true);
  };
}
