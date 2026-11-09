import { get, put, post } from '../api.js';
import { html, raw, md, clock, LETTERS, stars, toast, confirmDialog, esc, ico } from '../util.js';

// Contrato com o servidor para salvar e finalizar (o lado do servidor é o mergeRevisions, em server.mjs):
//  · cada edição leva a sua revisão (`ver[i]`, `flagsVer`); ao reabrir, a numeração continua da do servidor (`ex.vers`);
//  · PUT /answers responde 200; `ignored`/`flagsIgnored` = edição recusada (revisão antiga ou conflito). A tela ADOTA `current` + `vers`
//    do servidor e avisa o usuário: nunca reenvia a edição recusada como se fosse nova;
//  · 409 no PUT = prova já finalizada (jamais "salvo"): consulta a prova e abre o resultado se esta tela ainda for a atual;
//  · POST /finish leva o estado completo + revisões e NÃO espera o autosave; 409 = respostas desatualizadas (mesmo formato de
//    `ignored`/`current`): ressincroniza e o usuário finaliza de novo;
//  · tela descartada (`disposed`) não envia, não reagenda e não eleva revisões; ao sair manda uma última cópia idempotente do que não foi confirmado.
const SAVE_TIMEOUT = 15000;   // PUT de respostas: sem resposta nesse prazo conta como falha e tenta de novo
const FINISH_TIMEOUT = 20000; // POST /finish e consulta do estado da prova

export async function render(root, { args, isCurrent = () => true }) {
  const id = args[0];
  const ex = await get(`/api/exams/${id}`);
  if (!isCurrent()) return; // o usuário já saiu desta tela: não redireciona nem registra efeitos globais
  if (ex.status === 'finalizado') { location.replace(`#/resultado/${id}`); return; }

  const offset = ex.now - Date.now();
  const answers = { ...ex.answers };
  const flags = new Set(ex.flags);
  const feedback = {}; // i -> resposta de /check (modo treino)
  // ?q= inválido (fora da prova, não inteiro, Infinity...) abre a primeira questão e normaliza a URL
  let cur = Number((new URLSearchParams(location.hash.split('?')[1] ?? '')).get('q') ?? 0);
  if (!Number.isInteger(cur) || cur < 0 || cur >= ex.questions.length) { cur = 0; history.replaceState(null, '', `#/prova/${id}?q=0`); }
  let saveTimer = null; let pending = new Set(); let inflight = new Set(); let tick = null;
  let finishing = false; let done = false; let disposed = false; let blocked = false; let finishRetryAt = 0; let timeUp = false;

  const isBlank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  const answeredCount = () => ex.questions.reduce((s, _, i) => s + (isBlank(answers[i]) ? 0 : 1), 0);
  const editable = () => !(disposed || done || finishing || blocked); // durante a finalização (ou depois de recusada) a tela não aceita edição

  let saving = Promise.resolve();
  // revisões por resposta/flags: o servidor recusa edições antigas ou conflitantes. Ao reabrir a prova a numeração continua da do servidor.
  const ver = { ...(ex.vers ?? {}) }; delete ver.flags; let flagsVer = Number(ex.vers?.flags) || 0;
  const checking = new Set(); // questões com correção em andamento (treino): não aceitam edição
  const setSaveState = (t, err = false) => { const el = root.querySelector('#savestate'); if (el) { el.textContent = t; el.classList.toggle('err', err); } };
  const snapshot = (keys) => {
    const batch = {}; const vers = {};
    keys.forEach((i) => { batch[i] = isBlank(answers[i]) ? null : answers[i]; vers[i] = ver[i] ?? 0; });
    return { answers: batch, vers, flags: [...flags], fv: flagsVer };
  };
  // adota o estado do servidor no que ele recusou (a não ser que já exista edição local mais nova: essa segue na fila, com revisão maior)
  function resync(out, sent, sentFv) {
    let redraw = false;
    for (const i of out.ignored ?? []) {
      if ((ver[i] ?? 0) !== sent[i]) continue;
      const v = out.current?.answers?.[i];
      if (isBlank(v)) delete answers[i]; else answers[i] = v;
      ver[i] = Math.max(ver[i] ?? 0, Number(out.vers?.[i]) || 0);
      if (i === cur) redraw = true;
    }
    if (out.flagsIgnored && flagsVer === sentFv) {
      flags.clear(); (out.current?.flags ?? []).forEach((f) => flags.add(f));
      flagsVer = Math.max(flagsVer, Number(out.vers?.flags) || 0); redraw = true;
    }
    drawHead(); drawNav(); if (redraw) drawQuestion();
  }
  async function sendPending() {
    if (!editable() || !pending.size) return; // confere de novo na hora de enviar: a fila pode ter ficado velha
    const keys = [...pending]; pending = new Set(); inflight = new Set(keys);
    const body = snapshot(keys);
    let out;
    try {
      out = await put(`/api/exams/${id}/answers`, body, { timeout: SAVE_TIMEOUT });
    } catch (e) {
      inflight = new Set();
      if (disposed || done) return;
      keys.forEach((i) => pending.add(i)); // não descarta: o lote seguinte já leva o valor mais recente
      if (e.status === 409) return remoteFinished(); // 409 = prova já finalizada: não é "salvo" e não se tenta de novo
      setSaveState('não salvo, tentando de novo', true);
      if (!finishing) { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 3000); }
      return;
    }
    inflight = new Set();
    if (disposed || done) return;
    if (out?.ignored?.length || out?.flagsIgnored) {
      resync(out, body.vers, body.fv);
      setSaveState('atualizado com a versão do servidor');
      toast('Outra janela alterou esta prova: atualizei as respostas com a versão salva no servidor.');
      return;
    }
    setSaveState('salvo');
  }
  const flush = () => {
    clearTimeout(saveTimer); saveTimer = null;
    if (!editable() || !pending.size) return saving;
    saving = saving.then(sendPending).catch(() => {}); // a fila nunca rejeita: um erro não pode travar os envios seguintes
    return saving;
  };
  const scheduleSave = () => { if (disposed || done || finishing) return; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 450); };
  /** Última cópia ao sair (da tela ou da página): fila + lote em voo, sem tratar a resposta. O servidor aceita a repetição de uma edição já aplicada. */
  const sendExit = () => {
    if (done) return;
    const keys = new Set([...pending, ...inflight]);
    if (keys.size) put(`/api/exams/${id}/answers`, snapshot(keys), { keepalive: true }).catch(() => {});
  };
  // o servidor recusou a edição com 409: a prova foi finalizada em outro lugar. Bloqueia a edição, consulta o estado e abre o resultado
  async function remoteFinished() {
    if (blocked || finishing) return;
    blocked = true; clearTimeout(saveTimer);
    setSaveState('alteração recusada: a prova já foi finalizada', true);
    try {
      const atual = await get(`/api/exams/${id}`, { timeout: FINISH_TIMEOUT });
      if (disposed || !isCurrent()) return;
      if (atual.status === 'finalizado') { done = true; clearInterval(tick); location.replace(`#/resultado/${id}`); return; }
    } catch { if (disposed) return; }
    blocked = false; // não deu para confirmar: libera a edição (o próximo salvamento tenta de novo; sem retentativa automática)
  }

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

  /** Como achar de novo, depois de redesenhar, o controle que está com o foco (null = não é um controle da prova). */
  function focusKey(el) {
    if (el.id === 'lac') return '#lac';
    const o = el.closest('[data-opt]'); if (o) return `[data-opt="${o.dataset.opt}"] input`;
    const g = el.closest('[data-go]'); if (g) return `#nav [data-go="${g.dataset.go}"]`;
    const b = ['prev', 'flag', 'check', 'next', 'report'].find((a) => a in el.dataset);
    return b ? `[data-${b}]` : null;
  }

  // `moved`: mudou de questão, então o foco vai explicitamente para o cabeçalho da nova questão (ou o campo da lacuna);
  // nos demais redesenhos o foco volta ao mesmo controle (ou ao feedback, se o controle sumiu por causa da correção)
  function drawQuestion({ moved = false } = {}) {
    const q = ex.questions[cur];
    const fb = feedback[cur];
    const locked = ex.instant && (fb || ex.checked?.includes(cur));
    const sel = new Set(Array.isArray(answers[cur]) ? answers[cur] : []);
    const gab = fb?.gabarito ? new Set(fb.gabarito) : null;
    const ativo = document.activeElement;
    const keep = !moved && ativo && root.contains(ativo) ? focusKey(ativo) : null;
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
      <div class="row qmeta" tabindex="-1"><b>Questão ${cur + 1} de ${ex.n}</b>${ex.instant ? html`<span class="lvl" title="dificuldade">dificuldade ${stars(q.level)}</span>` : ''}
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
    const alvo = moved ? (lac && !locked ? lac : qwrap.querySelector('.qmeta'))
      : keep ? (root.querySelector(keep) ?? (fb ? qwrap.querySelector('.feedback') : null))
        : (lac && !locked ? lac : null);
    alvo?.focus({ preventScroll: true });
  }

  /** Marca/desmarca as alternativas e as classes NO LUGAR: refazer a questão destruiria o controle que está com o foco do teclado. */
  function paintSelection() {
    const sel = new Set(Array.isArray(answers[cur]) ? answers[cur] : []);
    qwrap.querySelectorAll('[data-opt]').forEach((label) => {
      const on = sel.has(Number(label.dataset.opt));
      label.classList.toggle('sel', on);
      const inp = label.querySelector('input'); if (inp) inp.checked = on;
    });
  }

  function feedbackBox(fb) {
    return html`<div class="feedback ${fb.ok ? 'ok' : 'no'}" tabindex="-1"><h4>${fb.ok ? html`${ico('check')} Resposta correta` : html`${ico('x')} Resposta incorreta`}</h4>
      ${md(fb.explanation)}
      <div class="row small" style="margin-top:8px"><span class="chip mono">${fb.obj}</span>
        ${(fb.ref ?? []).map((r) => html`<a class="chip" target="_blank" rel="noopener" href="${refUrl(r)}">${ico('book')} material ${r.replace(/^(\d+):p\./, '$1 · p.')}</a>`)}
        <button class="btn sm ghost right" data-report>${ico('flag')} Reportar erro</button></div></div>`;
  }

  const refUrl = (r) => { const m = /^(\d+):p\.(\d+)/.exec(r); return m ? `/pdf/${m[1]}#page=${m[2]}` : '#'; };

  async function check() {
    if (!editable()) return;
    const i = cur; // fixa o índice: o usuário pode avançar antes de a resposta do servidor chegar
    if (checking.has(i)) return;
    if (isBlank(answers[i])) return toast('Responda antes de corrigir.');
    checking.add(i);
    try {
      const out = await post(`/api/exams/${id}/check`, { i, answer: answers[i] });
      if (disposed) return;
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
    cur = n; await ensureFeedback();
    if (disposed) return; // a tela foi descartada durante a espera: não mexe na URL da tela atual
    drawQuestion({ moved: true });
    history.replaceState(null, '', `#/prova/${id}?q=${cur}`);
  };

  function toggleFlag() {
    if (!editable()) return;
    flags.has(cur) ? flags.delete(cur) : flags.add(cur);
    flagsVer++; pending.add(cur); scheduleSave(); drawQuestion();
  }

  function setAnswer(v) {
    ver[cur] = (ver[cur] ?? 0) + 1;
    answers[cur] = v; pending.add(cur); scheduleSave(); drawHead();
    navEl.querySelector(`[data-go="${cur}"]`)?.classList.toggle('done', !isBlank(v));
  }

  const finishLabel = ex.instant ? 'Encerrar treino' : 'Finalizar';
  const setFinishUi = (busy) => { const b = root.querySelector('#finish'); if (b) { b.disabled = busy; b.textContent = busy ? 'Finalizando…' : finishLabel; } };
  const openResult = () => { done = true; clearInterval(tick); location.hash = `#/resultado/${id}`; };

  // o relógio NÃO para durante a finalização: o prazo do servidor continua correndo, e em falha os controles voltam
  async function finish(auto = false) {
    if (finishing || disposed || done) return; finishing = true;
    if (!auto) {
      const blank = ex.n - answeredCount();
      const ok = await confirmDialog({
        title: ex.instant ? 'Encerrar treino?' : 'Finalizar o simulado?',
        body: html`<p>${blank ? html`Você tem <b>${blank}</b> questão(ões) em branco. ` : 'Todas as questões foram respondidas. '}${flags.size ? html`<b>${flags.size}</b> marcada(s) para revisão.` : ''}</p><p class="muted small">Depois de finalizar não dá para alterar as respostas.</p>`,
        ok: 'Finalizar',
      });
      if (!ok || disposed) { finishing = false; if (!disposed) scheduleSave(); return; }
    }
    clearTimeout(saveTimer); setFinishUi(true);
    // estado COMPLETO e suas revisões (inclusive respostas apagadas, null, e marcações); não depende do autosave, que pode estar preso
    const body = {
      answers: Object.fromEntries(ex.questions.map((_, i) => [i, isBlank(answers[i]) ? null : answers[i]])),
      vers: Object.fromEntries(ex.questions.map((_, i) => [i, ver[i] ?? 0])), flags: [...flags], fv: flagsVer,
    };
    try {
      await post(`/api/exams/${id}/finish`, body, { timeout: FINISH_TIMEOUT });
      if (disposed) return; // saiu da tela no meio: não puxa o usuário de volta
      openResult();
    } catch (e) {
      if (!disposed) await finishFailed(e, body, auto);
    }
  }

  async function finishFailed(e, body, auto) {
    if (e.status === 409 && e.data?.current) {
      // respostas desatualizadas (outra janela alterou a prova): adota o estado do servidor e o usuário revisa e finaliza de novo
      resync(e.data, body.vers, body.fv);
      toast('Outra janela alterou esta prova: atualizei as respostas com a versão salva. Revise e finalize de novo.', 'err');
      if (auto) finishRetryAt = Date.now() + 1000;
    } else {
      try { // resultado incerto (rede, prazo, erro do servidor): antes de repetir, consulta o estado da prova
        const atual = await get(`/api/exams/${id}`, { timeout: FINISH_TIMEOUT });
        if (disposed) return;
        if (atual.status === 'finalizado') return openResult();
      } catch { if (disposed) return; }
      if (auto) { finishRetryAt = Date.now() + 5000; setSaveState('não foi possível finalizar, tentando de novo', true); } else toast(e.message, 'err');
    }
    finishing = false; setFinishUi(false);
    if (pending.size) scheduleSave();
  }

  root.onclick = (e) => {
    const t = e.target;
    const opt = t.closest('[data-opt]');
    if (opt) {
      const q = ex.questions[cur];
      if ((ex.instant && (feedback[cur] || ex.checked?.includes(cur))) || checking.has(cur) || !editable()) { e.preventDefault(); return; } // correção em andamento/prova bloqueada: a tela não diverge do enviado
      if (t.tagName !== 'INPUT') e.preventDefault(); // clique no rótulo: o navegador não repete o clique no controle; vindo do controle (teclado) deixa a alternância nativa
      const k = Number(opt.dataset.opt);
      const atual = Array.isArray(answers[cur]) ? answers[cur] : [];
      if (q.type === 'unica') { if (!(atual.length === 1 && atual[0] === k)) setAnswer([k]); }
      else { const s = new Set(atual); s.has(k) ? s.delete(k) : s.add(k); setAnswer([...s].sort((a, b) => a - b)); }
      paintSelection();
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
    if (checking.has(cur) || !editable()) { e.target.value = typeof answers[cur] === 'string' ? answers[cur] : ''; return; }
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
  const onHide = () => sendExit();

  // descarte: encerra timers e listeners (idempotente) e manda a última cópia do que não foi confirmado
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(saveTimer); clearInterval(tick);
    document.removeEventListener('keydown', onKey); window.removeEventListener('pagehide', onHide);
    root.onclick = null; root.oninput = null;
    sendExit();
  };

  // a primeira renderização vem ANTES dos efeitos globais; se algo lançar, nada fica ativo (o roteador não receberia o descarte)
  try {
    await ensureFeedback();
    if (!isCurrent()) { dispose(); return; }
    drawQuestion();
    document.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onHide);
    if (ex.minutes) {
      const timerEl = root.querySelector('#timer');
      const update = () => {
        const left = ex.deadline - (Date.now() + offset);
        timerEl.textContent = clock(left);
        timerEl.classList.toggle('low', left < 10 * 60e3);
        timerEl.classList.toggle('crit', left < 2 * 60e3);
        if (left <= 0 && !finishing && !done && Date.now() >= finishRetryAt) {
          if (!timeUp) { timeUp = true; toast('Tempo esgotado — finalizando…', 'err'); }
          finish(true);
        }
      };
      update(); tick = setInterval(update, 500);
    }
  } catch (e) { dispose(); throw e; }

  return dispose;
}
