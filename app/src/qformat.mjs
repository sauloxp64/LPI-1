// Parser e validador do formato de questões (.txt) do banco de simulados.
// Especificação para autores: app/content/FORMATO.md

const HEADER = /^###\s+(\d{3}\.\d)-([A-Za-z0-9]+)\s*\|\s*(unica|multipla|lacuna)\s*\|\s*([123])\s*$/;
const BANNED_OPTION = /^(todas as (alternativas|anteriores|opções)|nenhuma das (alternativas|anteriores|opções)|ambas as (alternativas|anteriores))/i;
const LONG_WORD_LIMIT = 400;

/** Converte o conteúdo de um arquivo em questões + erros de sintaxe. */
export function parseQuestions(source, file = '<memória>') {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const questions = [];
  const errors = [];
  let cur = null;
  let inFence = false;
  let phase = 'text'; // text | options | expl

  const finish = () => {
    if (!cur) return;
    cur.text = cur.textLines.join('\n').trim();
    cur.explanation = cur.explLines.join('\n').trim();
    delete cur.textLines;
    delete cur.explLines;
    questions.push(cur);
    cur = null;
  };

  lines.forEach((raw, i) => {
    const ln = i + 1;
    const h = raw.match(HEADER);
    if (h) {
      finish();
      inFence = false;
      phase = 'text';
      cur = {
        id: `${h[1]}-${h[2]}`, obj: h[1], type: h[3], level: Number(h[4]),
        ref: [], tags: [], textLines: [], options: [], answers: [], explLines: [],
        file, line: ln,
      };
      return;
    }
    if (raw.startsWith('###')) {
      errors.push({ file, line: ln, msg: `cabeçalho inválido: "${raw.trim()}" (use "### 103.4-001 | unica | 2")` });
      return;
    }
    if (!cur) {
      if (raw.trim() && !raw.startsWith('//') && !raw.startsWith('#')) {
        errors.push({ file, line: ln, msg: 'texto fora de um bloco de questão' });
      }
      return;
    }
    if (phase === 'text') {
      const meta = raw.match(/^(ref|tags):\s*(.*)$/);
      if (meta && !cur.textLines.some((l) => l.trim()) && !inFence) {
        const vals = meta[2].split(',').map((s) => s.trim()).filter(Boolean);
        if (meta[1] === 'ref') cur.ref.push(...vals); else cur.tags.push(...vals);
        return;
      }
      if (raw.trimStart().startsWith('```')) inFence = !inFence;
      if (!inFence && /^(=|-) /.test(raw)) {
        phase = 'options';
      } else if (!inFence && /^>( |$)/.test(raw)) {
        phase = 'expl';
      } else {
        cur.textLines.push(raw);
        return;
      }
    }
    if (phase === 'options') {
      if (/^(=|-) /.test(raw)) {
        const ok = raw[0] === '=';
        cur.options.push({ t: raw.slice(2).trim(), ok });
        return;
      }
      if (/^\s{2,}\S/.test(raw) && cur.options.length) {
        cur.options[cur.options.length - 1].t += '\n' + raw.trim();
        return;
      }
      if (!raw.trim()) return;
      if (/^>( |$)/.test(raw)) {
        phase = 'expl';
      } else {
        errors.push({ file, line: ln, id: cur.id, msg: `linha inesperada entre as opções e a explicação: "${raw.trim().slice(0, 50)}"` });
        return;
      }
    }
    if (phase === 'expl') {
      if (/^>( |$)/.test(raw)) cur.explLines.push(raw.slice(2));
      else if (raw.trim()) errors.push({ file, line: ln, id: cur.id, msg: 'a explicação deve usar linhas iniciadas por "> "' });
    }
  });
  finish();

  for (const q of questions) {
    if (q.type === 'lacuna') {
      q.answers = q.options.filter((o) => o.ok).map((o) => o.t);
      q.wrong = q.options.filter((o) => !o.ok).map((o) => o.t);
      q.options = [];
    }
  }
  return { questions, errors };
}

/** Normaliza resposta de lacuna para comparação. */
export function normalizeAnswer(s) {
  return String(s ?? '')
    .trim()
    .replace(/^(\$|#)\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/^["'`](.*)["'`]$/, '$1')
    .trim();
}

/**
 * Regras de qualidade. `ctx` = { objectives:Set<string>, outline:object|null }
 * Retorna { errors:[], warnings:[] } para as questões dadas.
 */
export function lintQuestions(questions, ctx = {}) {
  const errors = [];
  const warnings = [];
  const seen = new Map();
  const err = (q, msg) => errors.push({ file: q.file, line: q.line, id: q.id, msg });
  const warn = (q, msg) => warnings.push({ file: q.file, line: q.line, id: q.id, msg });

  for (const q of questions) {
    if (seen.has(q.id)) err(q, `id duplicado (também em ${seen.get(q.id)})`);
    seen.set(q.id, `${q.file}:${q.line}`);
    if (ctx.objectives && !ctx.objectives.has(q.obj)) err(q, `objetivo inexistente: ${q.obj}`);
    if (q.text.length < 15) err(q, 'enunciado curto demais');
    if (q.text.length > 1800) warn(q, 'enunciado muito longo');
    if (q.explanation.length < 30) err(q, 'explicação obrigatória (mín. 30 caracteres)');
    if (/\bQ:|\bPergunta:/i.test(q.text)) warn(q, 'enunciado contém rótulo "Q:/Pergunta:"');

    const good = q.options.filter((o) => o.ok);
    const bad = q.options.filter((o) => !o.ok);
    if (q.type === 'unica') {
      if (good.length !== 1) err(q, `tipo unica exige exatamente 1 opção "=" (tem ${good.length})`);
      if (q.options.length < 4 || q.options.length > 5) err(q, `tipo unica exige 4 ou 5 opções (tem ${q.options.length})`);
    } else if (q.type === 'multipla') {
      if (good.length < 2 || good.length > 3) err(q, `tipo multipla exige 2 ou 3 opções "=" (tem ${good.length})`);
      if (q.options.length < 5 || q.options.length > 6) err(q, `tipo multipla exige 5 ou 6 opções no total (tem ${q.options.length})`);
      if (/escolha|selecione|marque/i.test(q.text)) warn(q, 'não escreva "escolha N" no enunciado: a interface mostra isso sozinha');
    } else if (q.type === 'lacuna') {
      if (!q.answers.length) err(q, 'tipo lacuna exige ao menos uma resposta aceita com "= "');
      if (q.wrong?.length) err(q, 'tipo lacuna não usa opções "- "');
      for (const a of q.answers) {
        if (a !== a.trim()) err(q, `resposta com espaços nas pontas: "${a}"`);
        if (a.length > 80) err(q, 'resposta de lacuna longa demais: peça algo curto (um comando, opção, caminho ou número)');
      }
      if (!/_{3,}/.test(q.text) && !/\?\s*$/m.test(q.text) && !/:\s*$/m.test(q.text)) {
        warn(q, 'lacuna: use "____" no enunciado ou termine com "?" / ":"');
      }
    }
    if (q.type !== 'lacuna') {
      const norm = q.options.map((o) => o.t.trim()); // maiúsculas importam (-r != -R)
      if (new Set(norm).size !== norm.length) err(q, 'opções repetidas');
      for (const o of q.options) {
        if (!o.t) err(q, 'opção vazia');
        if (BANNED_OPTION.test(o.t)) err(q, `opção proibida: "${o.t.slice(0, 40)}"`);
        if (o.t.length > LONG_WORD_LIMIT) warn(q, 'opção muito longa');
      }
    }

    // Referência ao material: "101:p.285" ou "102:p.12-14"
    if (!q.ref.length) {
      warn(q, 'sem ref: (página do PDF) — recomendado para estudo');
    } else if (ctx.outline) {
      for (const r of q.ref) {
        const m = r.match(/^(101|102):p\.(\d+)(?:-(\d+))?$/);
        if (!m) { err(q, `ref inválida: "${r}" (use 101:p.285 ou 102:p.12-14)`); continue; }
        const o = ctx.outline[q.obj];
        if (!o) continue;
        if (o.exam !== m[1]) err(q, `ref aponta para o PDF ${m[1]} mas o objetivo ${q.obj} está no PDF ${o.exam}`);
        const a = Number(m[2]);
        const b = Number(m[3] ?? m[2]);
        if (a < o.start || b > o.end || b < a) err(q, `ref ${r} fora das páginas do objetivo ${q.obj} (p.${o.start}-${o.end})`);
      }
    }
  }

  // Viés: resposta correta quase sempre a mais longa
  const unicas = questions.filter((q) => q.type === 'unica' && q.options.length);
  if (unicas.length >= 8) {
    const longest = unicas.filter((q) => {
      const max = Math.max(...q.options.map((o) => o.t.length));
      const ok = q.options.find((o) => o.ok);
      return ok && ok.t.length === max;
    }).length;
    if (longest / unicas.length > 0.5) {
      warnings.push({ file: unicas[0].file, line: 0, id: '-', msg: `viés: a resposta correta é a mais longa em ${Math.round((100 * longest) / unicas.length)}% das questões "unica" — equilibre o tamanho das opções` });
    }
  }
  return { errors, warnings };
}
