// Ambiente falso mínimo para rodar as telas do front-end (ES modules) no Node, sem navegador nem dependências:
// DOM com parser de HTML e seletores simples, foco, eventos, relógio/timers controlados, `fetch` e um servidor em memória.
// Não é um navegador: cobre só o que as telas da prova usam. Este arquivo não tem testes (é importado pelos *.test.mjs).

import { inspect } from 'node:util';

const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link']);
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));

class Txt { constructor(text) { this.text = text; this.parent = null; this.nodeType = 3; } }

// ---------- seletores: tag#id.classe[attr][attr=v], descendentes por espaço, grupos por vírgula ----------
function parseCompound(src) {
  const m = /^([a-zA-Z][\w-]*|\*)?(.*)$/.exec(src);
  const c = { tag: m[1] && m[1] !== '*' ? m[1].toLowerCase() : null, id: null, classes: [], attrs: [] };
  for (const t of m[2].matchAll(/#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=("?)([^\]"]*)\4)?\]/g)) {
    if (t[1]) c.id = t[1]; else if (t[2]) c.classes.push(t[2]); else c.attrs.push({ name: t[3], val: t[5] });
  }
  return c;
}
const parseSelector = (sel) => sel.split(',').map((g) => g.trim().split(/\s+/).map(parseCompound));
function matchCompound(e, c) {
  if (e.nodeType === 3) return false;
  if (c.tag && e.tag !== c.tag) return false;
  if (c.id && e.id !== c.id) return false;
  if (c.classes.some((k) => !e.classList.contains(k))) return false;
  return c.attrs.every((a) => a.name in e.attrs && (a.val === undefined || e.attrs[a.name] === a.val));
}
function matchChain(e, chain, i = chain.length - 1) {
  if (!matchCompound(e, chain[i])) return false;
  if (i === 0) return true;
  for (let p = e.parent; p; p = p.parent) if (matchChain(p, chain, i - 1)) return true;
  return false;
}

const focusable = (e) => ['input', 'button', 'textarea', 'select'].includes(e.tag) || 'tabindex' in e.attrs || (e.tag === 'a' && 'href' in e.attrs);

export class El {
  constructor(tag, doc) {
    this.tag = tag.toLowerCase(); this.doc = doc; this.attrs = {}; this.kids = []; this.parent = null; this.nodeType = 1;
    this.handlers = {}; this._value = undefined; this._checked = undefined; this._disabled = undefined; this.returnValue = '';
  }
  [inspect.custom]() { return `<${this.tag}${this.id ? '#' + this.id : ''}${this.className ? '.' + this.className.replace(/ +/g, '.') : ''}>`; } // mensagens de falha curtas (o grafo do DOM é circular e enorme)
  get tagName() { return this.tag.toUpperCase(); }
  get id() { return this.attrs.id ?? ''; }
  get className() { return this.attrs.class ?? ''; }
  set className(v) { this.attrs.class = String(v); }
  get classList() {
    const el = this; const list = () => (el.attrs.class ?? '').split(/\s+/).filter(Boolean); const save = (l) => { el.attrs.class = l.join(' '); };
    return {
      contains: (c) => list().includes(c),
      add: (c) => { const l = list(); if (!l.includes(c)) save([...l, c]); },
      remove: (c) => save(list().filter((x) => x !== c)),
      toggle(c, force) { const has = list().includes(c); const on = force ?? !has; if (on && !has) save([...list(), c]); else if (!on && has) save(list().filter((x) => x !== c)); return on; },
    };
  }
  get dataset() {
    const el = this; const key = (k) => `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    return new Proxy({}, {
      has: (_, k) => typeof k === 'string' && key(k) in el.attrs,
      get: (_, k) => (typeof k === 'string' && key(k) in el.attrs ? el.attrs[key(k)] : undefined),
      set: (_, k, v) => { el.attrs[key(k)] = String(v); return true; },
    });
  }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  hasAttribute(n) { return n in this.attrs; }
  get children() { return this.kids.filter((k) => k.nodeType === 1); }
  get checked() { return this._checked ?? ('checked' in this.attrs); }
  set checked(v) { this._checked = !!v; }
  get disabled() { return this._disabled ?? ('disabled' in this.attrs); }
  set disabled(v) { this._disabled = !!v; }
  get value() { return this._value ?? this.attrs.value ?? ''; }
  set value(v) { this._value = String(v); }
  get type() { return this.attrs.type ?? ''; }
  get isConnected() { for (let n = this; n; n = n.parent) if (n === this.doc.body) return true; return false; }
  get textContent() { return this.kids.map((k) => (k.nodeType === 3 ? k.text : k.textContent)).join(''); }
  set textContent(t) { this._clear(); this._add(new Txt(String(t))); }
  get innerHTML() { return this._html ?? ''; }
  set innerHTML(h) {
    this._clear(); this._html = String(h);
    const stack = [this];
    for (const m of String(h).matchAll(/<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g)) {
      const top = stack[stack.length - 1];
      if (m[1]) { const i = stack.map((e) => e.tag).lastIndexOf(m[1].toLowerCase()); if (i > 0) stack.length = i; continue; }
      if (m[2]) {
        const el = new El(m[2], this.doc);
        for (const a of m[3].matchAll(/([^\s=>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) el.attrs[a[1]] = decode(a[2] ?? a[3] ?? a[4] ?? '');
        top._add(el);
        if (!VOID.has(el.tag) && !m[4]) stack.push(el);
        continue;
      }
      if (m[5]) top._add(new Txt(decode(m[5])));
    }
  }
  _add(n) { n.parent = this; this.kids.push(n); }
  _clear() {
    const a = this.doc.activeElement;
    if (a && a !== this && this.contains(a)) this.doc.activeElement = this.doc.body; // foco some junto com o elemento removido
    for (const k of this.kids) k.parent = null;
    this.kids = []; this._html = undefined;
  }
  append(...ns) { for (const n of ns) { n.parent?.removeChild?.(n); this._add(n); } }
  removeChild(n) { this.kids = this.kids.filter((k) => k !== n); n.parent = null; }
  remove() {
    const a = this.doc.activeElement;
    if (a && this.contains(a)) this.doc.activeElement = this.doc.body;
    this.parent?.removeChild(this);
  }
  contains(n) { for (let x = n; x; x = x.parent) if (x === this) return true; return false; }
  * _walk() { for (const k of this.kids) if (k.nodeType === 1) { yield k; yield* k._walk(); } }
  querySelectorAll(sel) { const g = parseSelector(sel); return [...this._walk()].filter((e) => g.some((c) => matchChain(e, c))); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  matches(sel) { return parseSelector(sel).some((c) => matchChain(this, c)); }
  closest(sel) { for (let n = this; n; n = n.parent) if (n.nodeType === 1 && n.matches(sel)) return n; return null; }
  focus() { if (this.isConnected && !this.disabled && focusable(this)) this.doc.activeElement = this; }
  blur() { if (this.doc.activeElement === this) this.doc.activeElement = this.doc.body; }
  addEventListener(t, f) { (this.handlers[t] ??= []).push(f); }
  removeEventListener(t, f) { this.handlers[t] = (this.handlers[t] ?? []).filter((x) => x !== f); }
  /** Dispara um evento que sobe do alvo até o documento (propriedades onclick/oninput e addEventListener). */
  fire(type, extra = {}) {
    const ev = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
    for (let n = this; n; n = n.parent) { ev.currentTarget = n; n[`on${type}`]?.(ev); for (const f of n.handlers[type] ?? []) f(ev); }
    for (const f of this.doc.handlers[type] ?? []) f(ev);
    return ev;
  }
  /** Como o navegador: marca/desmarca o controle ANTES do clique; se o clique for cancelado (preventDefault), desfaz depois. */
  click() {
    if (this.disabled) return;
    const isCtl = this.tag === 'input' && ['checkbox', 'radio'].includes(this.type);
    let undo = null;
    if (isCtl) {
      let top = this; while (top.parent) top = top.parent;
      const group = this.type === 'radio' ? top.querySelectorAll('input').filter((r) => r.type === 'radio' && r.attrs.name === this.attrs.name) : [this];
      const antes = group.map((r) => [r, r.checked]);
      undo = () => antes.forEach(([r, c]) => { r.checked = c; });
      if (this.type === 'radio') group.forEach((r) => { r.checked = r === this; }); else this.checked = !this.checked;
    }
    const ev = this.fire('click');
    if (ev.defaultPrevented) { undo?.(); return; }
    if (this.tag === 'label') this.querySelector('input')?.click(); // ativação do rótulo: clique no controle
  }
  // <dialog>
  showModal() { this.attrs.open = ''; }
  close(v) { delete this.attrs.open; this.returnValue = v ?? ''; for (const f of this.handlers.close ?? []) f({ type: 'close' }); }
}

export class Doc {
  constructor() {
    this.handlers = {}; this.body = new El('body', this); this.activeElement = this.body; this.historico = []; // historico: textos de todos os avisos já exibidos
    const anexa = this.body.append.bind(this.body);
    this.body.append = (...ns) => { for (const n of ns) if (n.className?.startsWith('toast')) this.historico.push(n.textContent); anexa(...ns); };
  }
  createElement(t) { return new El(t, this); }
  addEventListener(t, f) { (this.handlers[t] ??= []).push(f); }
  removeEventListener(t, f) { this.handlers[t] = (this.handlers[t] ?? []).filter((x) => x !== f); }
  listeners(t) { return (this.handlers[t] ?? []).length; }
  fire(type, extra = {}) { const ev = { type, target: this.activeElement, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; for (const f of this.handlers[type] ?? []) f(ev); return ev; }
  get toasts() { return this.body.children.filter((e) => e.className.startsWith('toast')).map((e) => e.textContent); }
}

// ---------- relógio e timers controlados ----------
export class Relogio {
  constructor(t0 = 1_700_000_000_000) { this.now = t0; this.seq = 0; this.timers = new Map(); }
  setTimeout = (fn, ms = 0) => { const id = ++this.seq; this.timers.set(id, { at: this.now + Math.max(0, ms), fn, every: 0 }); return id; };
  setInterval = (fn, ms = 0) => { const id = ++this.seq; this.timers.set(id, { at: this.now + ms, fn, every: Math.max(1, ms) }); return id; };
  clear = (id) => { this.timers.delete(id); };
  intervalos() { return [...this.timers.values()].filter((t) => t.every).length; }
  /** Avança o relógio executando os timers na ordem; entre eles deixa as promessas resolverem. */
  async avancar(ms) {
    const alvo = this.now + ms;
    await settle();
    for (;;) {
      const prox = [...this.timers.entries()].filter(([, t]) => t.at <= alvo).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!prox) break;
      const [id, t] = prox;
      this.now = Math.max(this.now, t.at);
      if (t.every) t.at += t.every; else this.timers.delete(id);
      t.fn();
      await settle();
    }
    this.now = alvo;
    await settle();
  }
}
export const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); await new Promise((r) => setImmediate(r)); };

// ---------- servidor em memória (mesmo contrato de revisões do server.mjs) ----------
const blank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
const canon = (v) => (blank(v) ? '' : JSON.stringify(Array.isArray(v) ? [...v].sort((a, b) => a - b) : v));
const rev = (x) => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : null);

export class Servidor {
  constructor() { this.exams = new Map(); this.log = []; this.gates = []; this.falhas = []; }
  addExam({ id = 'e1', n = 3, type = 'unica', minutes = 0, instant = false, deadline = null, answers = {}, flags = [], vers = {} } = {}) {
    const questions = Array.from({ length: n }, (_, i) => ({ i, type, level: 1, text: `Pergunta ${i + 1}`, options: ['alfa', 'beta', 'gama', 'delta'], escolhas: type === 'multipla' ? 2 : 1 }));
    const e = { id, title: 'Prova de teste', mode: 'topico', status: 'andamento', instant, minutes, deadline, n, questions, answers, flags, vers, checked: [], mudou: 0 };
    this.exams.set(id, e); return e;
  }
  view(e) {
    const base = { id: e.id, title: e.title, mode: e.mode, status: e.status, instant: e.instant, minutes: e.minutes, deadline: e.deadline, now: Date.now(), n: e.n, answers: e.answers, flags: e.flags };
    return e.status === 'finalizado' ? { ...base, result: { respondidas: Object.values(e.answers).filter((v) => !blank(v)).length }, questions: e.questions } : { ...base, vers: e.vers, checked: e.checked, questions: e.questions };
  }
  /** Mesma regra do mergeRevisions do servidor real (revisão maior aplica; igual/menor só passa se o valor for o mesmo). */
  merge(e, body) {
    const vers = { ...e.vers }; const answers = { ...e.answers }; const ignored = []; const conflicts = [];
    for (const [k, v] of Object.entries(body.answers ?? {})) {
      const r = rev(body.vers?.[k]);
      if (r !== null && vers[k] !== undefined && r <= vers[k] && canon(v) !== canon(answers[k])) { ignored.push(Number(k)); if (r === vers[k]) conflicts.push(Number(k)); continue; }
      if (v === null) delete answers[k]; else answers[k] = v;
      if (r !== null && (vers[k] === undefined || r > vers[k])) vers[k] = r;
    }
    let flags = e.flags; let flagsIgnored = false;
    if (Array.isArray(body.flags)) {
      const fr = rev(body.fv);
      if (fr !== null && vers.flags !== undefined && fr <= vers.flags && canon(body.flags) !== canon(e.flags)) flagsIgnored = true;
      else { flags = [...new Set(body.flags)]; if (fr !== null && (vers.flags === undefined || fr > vers.flags)) vers.flags = fr; }
    }
    return { answers, flags, vers, ignored, conflicts, flagsIgnored };
  }
  sync(e, m, vers = m.vers) {
    return { ignored: m.ignored, conflicts: m.conflicts, flagsIgnored: m.flagsIgnored, vers, current: { answers: Object.fromEntries(m.ignored.map((i) => [i, e.answers[i] ?? null])), ...(m.flagsIgnored ? { flags: e.flags } : {}) } };
  }
  handle(req) {
    const m = /^\/api\/exams\/([\w-]+)(?:\/(\w+))?$/.exec(req.url);
    const e = m && this.exams.get(m[1]);
    if (!m || !e) return { status: 404, json: { erro: 'não encontrado' } };
    const acao = m[2];
    if (!acao && req.method === 'GET') return { status: 200, json: this.view(e) };
    if (acao === 'answers' && req.method === 'PUT') {
      if (e.status !== 'andamento') return { status: 409, json: { erro: 'prova já finalizada' } };
      const r = this.merge(e, req.body);
      const resp = { ok: true, now: Date.now(), ...this.sync(e, r) };
      Object.assign(e, { answers: r.answers, flags: r.flags, vers: r.vers }); e.mudou++;
      return { status: 200, json: resp };
    }
    if (acao === 'finish' && req.method === 'POST') {
      if (e.status === 'andamento' && req.body.answers) {
        const r = this.merge(e, req.body);
        if (r.ignored.length || r.flagsIgnored) return { status: 409, json: { erro: 'respostas desatualizadas', ok: false, ...this.sync(e, r, e.vers) } };
        Object.assign(e, { answers: r.answers, flags: r.flags, vers: r.vers });
      }
      e.status = 'finalizado';
      return { status: 200, json: this.view(e) };
    }
    if (acao === 'check' && req.method === 'POST') {
      if (!e.checked.includes(req.body.i)) { e.checked.push(req.body.i); e.answers[req.body.i] = req.body.answer; }
      return { status: 200, json: { ok: true, given: e.answers[req.body.i], i: req.body.i, qid: `q${req.body.i}`, obj: '103.1', explanation: 'porque sim', ref: [], gabarito: [0] } };
    }
    return { status: 404, json: { erro: 'rota inexistente' } };
  }
  /** Segura a RESPOSTA das requisições que casam (por padrão o servidor já aplicou o efeito; aplicar:false = a requisição nem chegou): `liberar()` entrega, `falhar()` simula queda de rede. */
  segurar(match, vezes = Infinity, { aplicar = true } = {}) { const g = { match, held: [], restam: vezes, aplicar }; this.gates.push(g); return g; }
  /** Faz as próximas `vezes` requisições que casam falharem na rede, sem chegar ao servidor. */
  derrubar(match, vezes = 1) { this.falhas.push({ match, vezes }); }
  fetch = (url, init = {}) => {
    const req = { method: init.method ?? 'GET', url, body: init.body ? JSON.parse(init.body) : undefined, keepalive: !!init.keepalive, signal: init.signal };
    this.log.push(req);
    const queda = this.falhas.find((f) => f.vezes > 0 && f.match(req));
    if (queda) { queda.vezes--; return Promise.reject(new TypeError('Failed to fetch')); }
    const gate = this.gates.find((g) => g.restam > 0 && g.match(req));
    if (gate) gate.restam--;
    const out = gate && !gate.aplicar ? { status: 200, json: {} } : this.handle(req); // aplicar:false = a requisição se perde antes de chegar ao servidor
    return new Promise((resolve, reject) => {
      const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (req.signal?.aborted) return abort();
      req.signal?.addEventListener('abort', abort, { once: true });
      const entrega = () => resolve({ ok: out.status < 400, status: out.status, json: async () => structuredClone(out.json) });
      if (gate) gate.held.push({ req, entrega, falha: () => reject(new TypeError('Failed to fetch')) }); else entrega();
    });
  };
  puts(id) { return this.log.filter((r) => r.method === 'PUT' && r.url === `/api/exams/${id}/answers`); }
  finishes(id) { return this.log.filter((r) => r.url === `/api/exams/${id}/finish`); }
}

/** Instala os globais que as telas usam; `desfazer()` restaura tudo. */
export function instalar({ servidor, hash = '#/prova/e1' } = {}) {
  const doc = new Doc(); const relogio = new Relogio(); const win = new Doc();
  const loc = {
    _h: hash, navegou: [], // navegou: tudo o que a tela mandou o navegador fazer com a URL (['hash'|'replace', destino])
    get hash() { return this._h; }, set hash(v) { this._h = v; this.navegou.push(['hash', v]); },
    replace(h) { this._h = h; this.navegou.push(['replace', h]); },
  };
  const hist = { chamadas: [], replaceState(_s, _t, url) { this.chamadas.push(url); loc._h = url; } };
  const salvos = {};
  const set = (k, v) => { salvos[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); };
  set('document', doc); set('window', win); set('location', loc); set('history', hist);
  set('fetch', servidor.fetch); set('setTimeout', relogio.setTimeout); set('clearTimeout', relogio.clear);
  set('setInterval', relogio.setInterval); set('clearInterval', relogio.clear);
  const dateNow = Date.now; Date.now = () => relogio.now;
  const root = doc.createElement('div'); doc.body.append(root);
  return {
    doc, win, relogio, loc, hist, root, servidor,
    desfazer() {
      Date.now = dateNow;
      for (const [k, d] of Object.entries(salvos)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
    },
  };
}
