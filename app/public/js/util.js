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
export const toneColor = (m) => (m >= 0.75 ? 'var(--accent)' : m >= 0.55 ? 'var(--amber)' : 'var(--red)');
export const dots = (n) => '●'.repeat(n);
export const stars = (n) => '▮'.repeat(n) + '▯'.repeat(3 - n);
