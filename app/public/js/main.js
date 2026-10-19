import { html, esc, toast } from './util.js';
import { meta } from './api.js';

const ROUTES = [
  [/^\/?$/, () => import('./views/dashboard.js')],
  [/^\/curso$/, () => import('./views/curso.js')],
  [/^\/novo$/, () => import('./views/novo.js')],
  [/^\/prova\/([\w-]+)$/, () => import('./views/prova.js')],
  [/^\/resultado\/([\w-]+)$/, () => import('./views/resultado.js')],
  [/^\/objetivo\/([\d.]+)$/, () => import('./views/objetivo.js')],
  [/^\/material$/, () => import('./views/material.js')],
  [/^\/lab$/, () => import('./views/lab.js')],
  [/^\/lab\/([\w-]+)$/, () => import('./views/lab.js')],
  [/^\/config$/, () => import('./views/config.js')],
];

const NAV = [
  ['#/', '🏠', 'Início'],
  ['#/curso', '🎓', 'Curso'],
  ['#/novo', '📝', 'Simulados'],
  ['#/material', '📚', 'Material'],
  ['#/lab', '🧪', 'Laboratório'],
  ['#/config', '⚙️', 'Configurações'],
];

const view = document.getElementById('view');
let cleanup = null;

function renderNav(path) {
  document.getElementById('nav').innerHTML = NAV.map(([href, ico, label]) => {
    const p = href.slice(1);
    const active = p === '/' ? path === '/' || path === '' : path.startsWith(p) || (p === '/novo' && /^\/(prova|resultado)\//.test(path));
    return `<a href="${href}" class="${active ? 'active' : ''}"><span class="ico">${ico}</span>${esc(label)}</a>`;
  }).join('');
  document.getElementById('foot').innerHTML = `<button class="btn sm ghost" id="tema" title="Alternar tema claro/escuro">🌓 Tema</button>`;
  document.getElementById('tema').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('tema', next); } catch (e) { /* ok */ }
  };
}

let navId = 0;
async function route() {
  const myNav = ++navId;
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = hash.split('?');
  const params = new URLSearchParams(query);
  document.getElementById('side').classList.remove('open');
  renderNav(path);
  if (cleanup) { try { cleanup(); } catch (e) { /* ignora */ } cleanup = null; }
  // cada navegação ganha seu próprio contêiner: uma tela antiga que termine de renderizar depois
  // (ex.: após "Contestar") escreve num elemento já descartado e não sobrescreve a tela atual
  const holder = document.createElement('div');
  view.replaceChildren(holder);
  for (const [re, loader] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    try {
      holder.innerHTML = '<p class="muted"><span class="spinner"></span> Carregando…</p>';
      await meta();
      const mod = await loader();
      const out = await mod.render(holder, { args: m.slice(1), params, path });
      if (myNav !== navId) { // o usuário já foi para outra tela: encerra os efeitos (timers, listeners) desta e não toca no estado atual
        if (typeof out === 'function') { try { out(); } catch (e) { /* ignora */ } }
        return;
      }
      if (typeof out === 'function') cleanup = out;
      if (holder.isConnected) { view.focus({ preventScroll: true }); window.scrollTo(0, 0); }
    } catch (e) {
      console.error(e);
      if (holder.isConnected) holder.innerHTML = html`<div class="card"><h2>Algo deu errado</h2><p class="muted">${e.message}</p><a class="btn" href="#/">Voltar ao início</a></div>`.s;
    }
    return;
  }
  holder.innerHTML = '<div class="empty">Página não encontrada. <a href="#/">Início</a></div>';
}

document.getElementById('menu').onclick = () => document.getElementById('side').classList.toggle('open');
window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || 'Erro inesperado', 'err'));
route();
