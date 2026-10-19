// Utilitários compartilhados pelos geradores de questões paramétricas.
//
// Contrato de um gerador (export const generators = [ ... ] em cada arquivo *.mjs desta pasta):
//   { id: 'perm-sym2oct',           // único, kebab-case
//     obj: '104.5',                 // objetivo LPI
//     nivel: 1|2|3,
//     peso: 1,                      // frequência relativa entre geradores do mesmo objetivo
//     make(rng) -> {                // rng = makeRng(semente) (ver ../rng.mjs)
//       type: 'unica'|'multipla'|'lacuna',
//       text: 'enunciado (markdown simples: `código`, ``` blocos ```)',
//       options: [{ t, ok }],       // unica/multipla — NÃO precisa embaralhar (o motor embaralha)
//       answers: ['...'],           // lacuna — respostas aceitas
//       explanation: '...',
//       ref: ['101:p.512'],         // páginas físicas do PDF dentro do objetivo
//       verify: { sh, expect }      // opcional: script bash + stdout esperado, conferido no Docker por
//     }                             //   `node tools/verify-generators.mjs` (nunca vai para o cliente)
//   }

/** Monta `total` opções: a correta + (total-1) erradas sorteadas do pool (sem repetir, sem igualar à correta). */
export function mcq(rng, correct, wrongPool, total = 4) {
  const seen = new Set([String(correct)]);
  const wrong = [];
  for (const w of rng.shuffle(wrongPool)) {
    const k = String(w);
    if (seen.has(k)) continue;
    seen.add(k);
    wrong.push(k);
    if (wrong.length === total - 1) break;
  }
  if (wrong.length < total - 1) throw new Error(`pool de distratores insuficiente para "${correct}"`);
  return [{ t: String(correct), ok: true }, ...wrong.map((t) => ({ t, ok: false }))];
}

/** Várias corretas + erradas. */
export function multi(rng, corrects, wrongPool, nWrong) {
  const seen = new Set(corrects.map(String));
  const wrong = [];
  for (const w of rng.shuffle(wrongPool)) {
    const k = String(w);
    if (seen.has(k)) continue;
    seen.add(k);
    wrong.push(k);
    if (wrong.length === nWrong) break;
  }
  if (wrong.length < nWrong) throw new Error('pool de distratores insuficiente (multi)');
  return [...corrects.map((t) => ({ t: String(t), ok: true })), ...wrong.map((t) => ({ t, ok: false }))];
}

export const code = (s) => '`' + s + '`';
export const block = (s) => '```\n' + s + '\n```';
export const pad = (n, w = 2) => String(n).padStart(w, '0');
