/**
 * Cliente HTTP. Opções além de method/body:
 *  - `timeout` (ms): aborta e rejeita com `{ timeout: true }`; sem ele a requisição não tem prazo (como antes).
 *  - `signal` (AbortSignal): cancelamento pelo chamador; rejeita com `{ aborted: true }`.
 *  - `keepalive`: deixa a requisição sobreviver à saída da página (a resposta pode não ser lida).
 * Em resposta de erro a exceção leva `status` e `data` (o corpo JSON, se houver; ex.: o 409 da finalização traz o estado para ressincronizar).
 */
export async function api(path, { method = 'GET', body, timeout, signal, keepalive } = {}) {
  const ctl = new AbortController();
  let expirou = false;
  const timer = timeout > 0 ? setTimeout(() => { expirou = true; ctl.abort(); }, timeout) : null;
  const cancela = () => ctl.abort();
  if (signal?.aborted) ctl.abort(); else signal?.addEventListener('abort', cancela, { once: true });
  try {
    const res = await fetch(path, {
      method, headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl.signal, ...(keepalive ? { keepalive: true } : {}),
    });
    let data = null;
    try { data = await res.json(); } catch { /* sem corpo */ }
    if (!res.ok) throw Object.assign(new Error(data?.erro || `Erro ${res.status}`), { status: res.status, data });
    return data;
  } catch (e) {
    if (e?.status !== undefined) throw e;
    if (expirou) throw Object.assign(new Error('Tempo de espera esgotado'), { timeout: true });
    if (ctl.signal.aborted) throw Object.assign(new Error('Requisição cancelada'), { aborted: true });
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancela);
  }
}
export const get = (p, opts) => api(p, opts);
export const post = (p, body = {}, opts) => api(p, { method: 'POST', body, ...opts });
export const put = (p, body = {}, opts) => api(p, { method: 'PUT', body, ...opts });
export const del = (p) => api(p, { method: 'DELETE' });

let metaCache = null;
export async function meta(force = false) {
  if (!metaCache || force) {
    metaCache = await get('/api/meta');
    metaCache.byCode = Object.fromEntries(metaCache.objetivos.map((o) => [o.code, o]));
  }
  return metaCache;
}
