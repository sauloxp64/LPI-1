export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method, headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) throw Object.assign(new Error(data?.erro || `Erro ${res.status}`), { status: res.status });
  return data;
}
export const get = (p) => api(p);
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const put = (p, body = {}) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });

let metaCache = null;
export async function meta(force = false) {
  if (!metaCache || force) {
    metaCache = await get('/api/meta');
    metaCache.byCode = Object.fromEntries(metaCache.objetivos.map((o) => [o.code, o]));
  }
  return metaCache;
}
