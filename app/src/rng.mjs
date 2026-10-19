// Gerador pseudoaleatório com semente (sfc32): mesma semente => mesma sequência.
// Usado para montar provas e instanciar questões paramétricas de forma reproduzível.

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff).toString(36) + Date.now().toString(36).slice(-4);
}

export function makeRng(seed) {
  const s = xmur3(String(seed));
  let a = s(); let b = s(); let c = s(); let d = s();
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) next();
  const rng = {
    next,
    /** inteiro em [min, max] */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** n elementos distintos */
    sample(arr, n) { return rng.shuffle(arr).slice(0, n); },
    /** escolha ponderada: weightFn(item) => número >= 0 */
    weighted(items, weightFn) {
      const ws = items.map(weightFn);
      const total = ws.reduce((x, y) => x + y, 0);
      if (total <= 0) return rng.pick(items);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= ws[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    fork: (label) => makeRng(`${seed}/${label}`),
  };
  return rng;
}
