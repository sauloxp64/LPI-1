// Laboratório: catálogo de desafios (meta.json) e cliente do verificador que roda dentro do container "lab".
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRng } from './rng.mjs';

export const LAB_URL = process.env.LAB_URL || 'http://lab:8099';
export const CHALLENGES_DIR = process.env.CHALLENGES_DIR || '/lab/challenges';

export function loadChallenges(dir = CHALLENGES_DIR) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const p = join(dir, d.name, 'meta.json');
    if (!existsSync(p)) continue;
    try {
      const m = JSON.parse(readFileSync(p, 'utf8'));
      if (m.id !== d.name) throw new Error(`id (${m.id}) difere do nome da pasta (${d.name})`);
      out.push(m);
    } catch (e) {
      console.error(`[lab] desafio inválido ${d.name}: ${e.message}`);
    }
  }
  return out.sort((a, b) => a.obj.localeCompare(b.obj, 'en', { numeric: true }) || a.nivel - b.nivel || a.id.localeCompare(b.id));
}

/** Sorteia os parâmetros do desafio ({param: {escolha:[...]} | {faixa:[a,b]}}). */
export function rollParams(meta, seed) {
  const rng = makeRng(`lab:${meta.id}:${seed}`);
  const params = {};
  for (const [k, spec] of Object.entries(meta.params ?? {})) {
    if (spec.escolha) params[k] = String(rng.pick(spec.escolha));
    else if (spec.faixa) params[k] = String(rng.int(spec.faixa[0], spec.faixa[1]));
  }
  // parâmetros "distintos": garante que dois campos não caiam no mesmo valor quando declarado
  for (const group of meta.distintos ?? []) {
    const seen = new Set();
    for (const k of group) {
      let tries = 0;
      while (seen.has(params[k]) && tries++ < 20) {
        const spec = meta.params[k];
        params[k] = String(spec.escolha ? rng.pick(spec.escolha) : rng.int(spec.faixa[0], spec.faixa[1]));
      }
      seen.add(params[k]);
    }
  }
  return params;
}

export const render = (tpl, params) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));

export async function labCall(path, body, { timeout = 40000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(`${LAB_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { ok: false, erro: text.slice(0, 300) }; }
    if (!res.ok) json.ok = false;
    return json;
  } catch (e) {
    return { ok: false, offline: true, erro: e.name === 'AbortError' ? 'o laboratório não respondeu a tempo' : 'laboratório indisponível' };
  } finally { clearTimeout(t); }
}
