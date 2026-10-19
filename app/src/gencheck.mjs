// Validação estrutural de questões geradas (usada pelo motor de provas e por tools/verify-generators.mjs).
const BANNED = /^(todas as|nenhuma das|ambas as)/i;

export function checkGenerated(q, g, outline = null) {
  const p = [];
  if (!q || typeof q !== 'object') return ['make() não retornou objeto'];
  if (!['unica', 'multipla', 'lacuna'].includes(q.type)) p.push(`tipo inválido: ${q.type}`);
  if (!q.text || q.text.length < 15) p.push('enunciado curto');
  if (!q.explanation || q.explanation.length < 30) p.push('explicação curta');
  if (q.type === 'lacuna') {
    if (!Array.isArray(q.answers) || !q.answers.length) p.push('lacuna sem answers');
    if (q.options?.length) p.push('lacuna não deve ter options');
  } else {
    const o = q.options ?? [];
    const ok = o.filter((x) => x.ok).length;
    const texts = o.map((x) => String(x.t).trim()); // Linux diferencia maiúsculas: -r != -R
    if (new Set(texts).size !== texts.length) p.push('opções repetidas');
    if (o.some((x) => !String(x.t).trim())) p.push('opção vazia');
    if (o.some((x) => BANNED.test(x.t))) p.push('opção proibida');
    if (q.type === 'unica' && (ok !== 1 || o.length < 4 || o.length > 5)) p.push(`unica: ${ok} corretas / ${o.length} opções`);
    if (q.type === 'multipla' && (ok < 2 || ok > 3 || o.length < 5 || o.length > 6)) p.push(`multipla: ${ok} corretas / ${o.length} opções`);
  }
  for (const r of q.ref ?? []) {
    const m = String(r).match(/^(101|102):p\.(\d+)(?:-(\d+))?$/);
    if (!m) { p.push(`ref inválida ${r}`); continue; }
    const ob = outline?.[g.obj];
    if (ob) {
      const a = Number(m[2]); const b = Number(m[3] ?? m[2]);
      if (ob.exam !== m[1] || a < ob.start || b > ob.end || b < a) p.push(`ref ${r} fora de ${g.obj} (p.${ob.start}-${ob.end})`);
    }
  }
  if (!q.ref?.length) p.push('sem ref');
  return p;
}
