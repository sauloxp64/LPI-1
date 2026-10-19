// Utilitários de interface: templates com escape automático, markdown simples, formatação.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmt(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}
/** Template literal que escapa automaticamente tudo que não for `raw()` ou outro `html```. */
export const html = (strings, ...vals) => new Raw(strings.reduce((acc, s, i) => acc + s + (i < vals.length ? fmt(vals[i]) : ''), ''));

/** Markdown mínimo: ``` blocos ```, `código`, **negrito**, *itálico*, parágrafos. */
export function md(src, { inline = false } = {}) {
  const parts = String(src ?? '').split(/```[^\n`]*\n?([\s\S]*?)```/g);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) { out += `<pre><code>${esc(parts[i].replace(/\n$/, ''))}</code></pre>`; continue; }
    const text = parts[i].trim();
    if (!text) continue;
    const fmtInline = (p) => {
      let s = esc(p).replace(/`([^`\n]+)`/g, '<code>$1</code>');
      s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
      return s.replace(/\n/g, '<br>');
    };
    if (inline) { out += fmtInline(text); continue; }
    for (const para of text.split(/\n{2,}/)) {
      // linhas "* item" / "- item" viram lista; o resto, parágrafo
      let buf = []; let list = [];
      const flush = () => {
        if (buf.length) out += `<p>${fmtInline(buf.join('\n'))}</p>`;
        if (list.length) out += `<ul>${list.map((l) => `<li>${fmtInline(l)}</li>`).join('')}</ul>`;
        buf = []; list = [];
      };
      for (const line of para.split('\n')) {
        const m = line.match(/^\s*[*-]\s+(.*)$/);
        if (m) { if (buf.length) flush(); list.push(m[1]); } else { if (list.length) flush(); buf.push(line); }
      }
      flush();
    }
  }
  return raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 6000 : 3200);
}

export function confirmDialog({ title, body, ok = 'Confirmar', cancel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.innerHTML = `<h3>${esc(title)}</h3><div class="stack">${body?.s ?? esc(body ?? '')}</div>
      <div class="row" style="margin-top:18px;justify-content:flex-end">
      <button class="btn ghost" value="no">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" value="yes">${esc(ok)}</button></div>`;
    document.body.append(d);
    d.addEventListener('click', (e) => { const v = e.target.closest('button')?.value; if (v) d.close(v); });
    d.addEventListener('close', () => { resolve(d.returnValue === 'yes'); d.remove(); });
    d.showModal();
  });
}

export const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}min` : m ? `${m}min${String(s).padStart(2, '0')}s` : `${s}s`;
}
export const clock = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = t % 60;
  return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
};
export const fmtDate = (ts) => new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
export const fmtDay = (ts) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
export const LETTERS = 'ABCDEFGH';
export const tone = (m) => (m >= 0.75 ? 'ok' : m >= 0.55 ? 'warn' : 'bad');
export const toneColor = (m) => (m >= 0.75 ? 'var(--ok)' : m >= 0.55 ? 'var(--warn)' : 'var(--bad)');

// ---------- ícones (traço único, herdam a cor do texto) ----------
const ICONS = {
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9.5h11V10"/><path d="M10 19.5v-5h4v5"/>',
  course: '<path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20"/><path d="m3.8 6.4 1.2 1.2 2.2-2.4M3.8 11.9l1.2 1.2 2.2-2.4M3.8 17.4l1.2 1.2 2.2-2.4"/>',
  exam: '<rect x="4.5" y="3.5" width="15" height="17" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h4.5"/>',
  book: '<path d="M3.5 5.5C6 4.2 9.3 4.4 12 6.3c2.7-1.9 6-2.1 8.5-.8v13c-2.5-1.3-5.8-1.1-8.5.8-2.7-1.9-6-2.1-8.5-.8z"/><path d="M12 6.3v13"/>',
  terminal: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="m7.5 9.5 3 2.5-3 2.5M13 15h4"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  contrast: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  flag: '<path d="M6 21V4"/><path d="M6 5h11.5l-2.5 4 2.5 4H6"/>',
  left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
  redo: '<path d="M20 12a8 8 0 1 1-8-8c2.2 0 4.2.9 5.7 2.3L20 9"/><path d="M20 4v5h-5"/>',
  repeat: '<path d="M4 12v-2a3 3 0 0 1 3-3h12.5M16.5 4l3 3-3 3"/><path d="M20 12v2a3 3 0 0 1-3 3H4.5M7.5 20l-3-3 3-3"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  bolt: '<path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12.5z"/>',
  layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5l8.5 4.5 8.5-4.5"/>',
  checkcircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.4 2.4 4.6-5"/>',
  bulb: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3.5a5.7 5.7 0 0 0-3.4 10.3c.6.5.9 1.3.9 2.2h5c0-.9.3-1.7.9-2.2A5.7 5.7 0 0 0 12 3.5z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  shuffle: '<path d="M16 4h4v4M20 4l-6 6M4 20l6-6M16 20h4v-4M20 20l-5-5M4 4l5 5"/>',
  undo: '<path d="M4 9h10.5a5 5 0 0 1 0 10H8"/><path d="M8 5 4 9l4 4"/>',
  warn: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17v.01"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="1.5"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
};
/** Ícone SVG inline (aria-hidden): use ${ico('check')} dentro de html``. */
export const ico = (name) => raw(`<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] ?? ''}</svg>`);

/** Indicador de peso/dificuldade: n de `de` barrinhas preenchidas (CSS puro, sem símbolos). */
export const pips = (n, de) => {
  const k = Math.max(0, Math.min(de, Number(n) || 0)); // sempre numérico: nada vindo de fora entra no HTML cru
  return raw(`<span class="pips" role="img" aria-label="${k} de ${de}">${Array.from({ length: de }, (_, i) => `<i class="${i < k ? 'on' : ''}"></i>`).join('')}</span>`);
};
export const dots = (n) => pips(n, 5);
export const stars = (n) => pips(n, 3);

/** Marcador de estado no estilo do boot do systemd: [  OK  ] / [FALHOU]. */
export const st = (kind, label) => raw(`<span class="st ${kind}">${esc(label ?? (kind === 'ok' ? 'OK' : kind === 'bad' ? 'FALHOU' : '...'))}</span>`);

/** Medidor segmentado (estilo htop). `v` de 0 a 1; `target` desenha uma marca (ex.: a meta de 75%). */
export const bar = (v, { cls = '', target } = {}) => raw(
  `<div class="bar ${cls}" role="img" aria-label="${Math.round(v * 100)}%"${target != null ? ` style="--t:${(target * 100).toFixed(1)}%"` : ''}><i style="width:${Math.max(0, Math.min(100, v * 100)).toFixed(1)}%"></i></div>`);
/** Classe de cor do medidor conforme o desempenho (vazia = bom). */
export const toneCls = (v) => (tone(v) === 'ok' ? '' : tone(v));
