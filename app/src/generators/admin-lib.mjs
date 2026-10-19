// Biblioteca compartilhada dos geradores admin*.mjs (objetivos 107.1, 107.2, 107.3, 108.1, 108.2 e 110.1).
// Não exporta geradores; o índice apenas a importa.
import { pad } from './util.mjs';

/** Aspas simples seguras para shell. */
export const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** Embaralha e devolve `n` itens distintos de um pool, sem repetir os de `exclude`. */
export const distinct = (rng, pool, n, exclude = []) => rng.shuffle([...new Set(pool.map(String))].filter((x) => !exclude.map(String).includes(x))).slice(0, n);

export const USERS = ['ana', 'bruno', 'carla', 'diego', 'elisa', 'fabio', 'gabi', 'hugo', 'iara', 'jorge', 'kelly', 'lucas', 'marta', 'nuno', 'olga', 'paulo', 'rita', 'sergio', 'tania', 'vitor', 'wagner', 'yara'];
export const FULLNAME = { ana: 'Ana Souza', bruno: 'Bruno Lima', carla: 'Carla Dias', diego: 'Diego Rocha', elisa: 'Elisa Campos', fabio: 'Fabio Nunes', gabi: 'Gabriela Reis', hugo: 'Hugo Prado', iara: 'Iara Moura', jorge: 'Jorge Braga', kelly: 'Kelly Alves', lucas: 'Lucas Melo', marta: 'Marta Vaz', nuno: 'Nuno Pires', olga: 'Olga Costa', paulo: 'Paulo Gomes', rita: 'Rita Faria', sergio: 'Sergio Neves', tania: 'Tania Lopes', vitor: 'Vitor Cunha', wagner: 'Wagner Reis', yara: 'Yara Teles' };
// 'staff' e 'backup' já existem na imagem Docker; ficam de fora porque os verificadores criam/removem grupos.
export const GROUPS = ['dev', 'ops', 'vendas', 'rh', 'suporte', 'ti', 'financeiro', 'web', 'admins', 'projetos', 'redes', 'dados', 'qa'];

// ---------------------------------------------------------------- datas
export const DOW_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const DOW_AB = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_EN_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MON_EN_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** dias desde 1970-01-01 (UTC) */
export const toDays = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);
export const fromDays = (n) => { const dt = new Date(n * 86400000); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() }; };
export const isoDays = (n) => { const { y, m, d } = fromDays(n); return `${y}-${pad(m)}-${pad(d)}`; };
/** formato de `chage -l` (locale C): "Mar 08, 2024" */
export const chageDays = (n) => { const { y, m, d } = fromDays(n); return `${MON_EN[m - 1]} ${pad(d)}, ${y}`; };

/** minutos desde a época, "relógio de parede" ingênuo (UTC) */
export const toMin = (y, m, d, h, mi) => Math.floor(Date.UTC(y, m - 1, d, h, mi) / 60000);
export const fromMin = (t) => { const dt = new Date(t * 60000); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: dt.getUTCHours(), mi: dt.getUTCMinutes(), dow: dt.getUTCDay() }; };
export const fmtMin = (t) => { const x = fromMin(t); return `${x.y}-${pad(x.m)}-${pad(x.d)} ${pad(x.h)}:${pad(x.mi)}`; };
export const fmtMinDow = (t) => { const x = fromMin(t); return `${DOW_AB[x.dow]} ${x.y}-${pad(x.m)}-${pad(x.d)} ${pad(x.h)}:${pad(x.mi)}`; };

/** Lista em português: "a, b e c". */
export const listPt = (a, conj = 'e') => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} ${conj} ${a[a.length - 1]}`);

/** Sequência aleatória de caracteres (para hashes de mentirinha). */
export const randStr = (rng, n, alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./') => Array.from({ length: n }, () => alphabet[rng.int(0, alphabet.length - 1)]).join('');
export const fakeHash = (rng) => `$6$${randStr(rng, 8)}$${randStr(rng, 86)}`;

// ---------------------------------------------------------------- motor de cron (Vixie)
const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DOW3 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseField(str, lo, hi, names, base) {
  const set = new Set();
  const tok = (t) => { const i = names ? names.indexOf(t.toLowerCase()) : -1; return i >= 0 ? i + base : Number(t); };
  for (const part of str.split(',')) {
    const [range, stepS] = part.split('/');
    const step = stepS ? Number(stepS) : 1;
    let a; let b;
    if (range === '*') { a = lo; b = hi; } else if (range.includes('-')) { [a, b] = range.split('-').map(tok); } else { a = tok(range); b = stepS ? hi : a; }
    if (!(a >= lo && b <= hi && a <= b && step >= 1)) throw new Error(`campo cron inválido: ${str}`);
    for (let v = a; v <= b; v += step) set.add(v);
  }
  return set;
}

export function parseCron(expr) {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron precisa de 5 campos: ${expr}`);
  const dow = parseField(f[4], 0, 7, DOW3, 0);
  if (dow.has(7)) dow.add(0);
  return {
    min: parseField(f[0], 0, 59), hour: parseField(f[1], 0, 23), dom: parseField(f[2], 1, 31), mon: parseField(f[3], 1, 12, MON3, 1), dow,
    domStar: f[2].startsWith('*'), dowStar: f[4].startsWith('*'),
  };
}

const dayOk = (c, x) => {
  if (!c.mon.has(x.m)) return false;
  const a = c.dom.has(x.d); const b = c.dow.has(x.dow);
  return c.domStar || c.dowStar ? a && b : a || b; // regra do cron: se ambos restritos, vale "ou"
};

/** primeira execução ESTRITAMENTE depois do minuto `t` (busca por dia/hora/minuto). */
export function cronNext(expr, t) {
  const c = parseCron(expr);
  const hours = [...c.hour].sort((a, b) => a - b); const mins = [...c.min].sort((a, b) => a - b);
  const day0 = Math.floor(t / 1440);
  for (let day = day0; day < day0 + 366 * 8; day++) {
    if (!dayOk(c, fromDays(day))) continue;
    for (const h of hours) for (const m of mins) { const cand = day * 1440 + h * 60 + m; if (cand > t) return cand; }
  }
  return null;
}

/** mesma coisa, mas minuto a minuto (implementação independente, usada nos testes). */
export function cronNextBrute(expr, t) {
  const c = parseCron(expr);
  for (let u = t + 1; u < t + 1440 * 366 * 8; u++) {
    const x = fromMin(u);
    if (c.min.has(x.mi) && c.hour.has(x.h) && dayOk(c, x)) return u;
  }
  return null;
}

/** última execução ESTRITAMENTE antes de `t` (minuto a minuto). */
export function cronPrev(expr, t) {
  const c = parseCron(expr);
  for (let u = t - 1; u > t - 1440 * 366 * 8; u--) {
    const x = fromMin(u);
    if (c.min.has(x.mi) && c.hour.has(x.h) && dayOk(c, x)) return u;
  }
  return null;
}

/** Valores de um campo cron como lista ordenada. kind: min | hour | dom | mon | dow (dow normalizado: 7 vira 0). */
export function cronValues(str, kind) {
  const spec = { min: [0, 59], hour: [0, 23], dom: [1, 31], mon: [1, 12, MON3, 1], dow: [0, 7, DOW3, 0] }[kind];
  const set = parseField(str, spec[0], spec[1], spec[2], spec[3]);
  if (kind === 'dow' && set.has(7)) { set.delete(7); set.add(0); }
  return [...set].sort((x, y) => x - y);
}

/** Script Python independente: imprime, para cada expressão, as próximas N execuções (AAAA-MM-DD HH:MM, separadas por vírgula) a partir de uma data. */
export const PY_CRON = `import sys, datetime
ref, n = sys.argv[1], int(sys.argv[2])
MON = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']; DOW = ['sun','mon','tue','wed','thu','fri','sat']
def tok(t, names, base):
    t = t.lower()
    return names.index(t) + base if names and t in names else int(t)
def fld(s, lo, hi, names=None, base=0):
    out = set()
    for p in s.split(','):
        r, sep, st = p.partition('/'); st = int(st) if st else 1
        if r == '*': a, b = lo, hi
        elif '-' in r: a, b = [tok(x, names, base) for x in r.split('-')]
        else: a = tok(r, names, base); b = hi if sep else a
        out.update(range(a, b + 1, st))
    return out
def fires(expr):
    f = expr.split()
    mi, ho, dm, mo, dw = fld(f[0],0,59), fld(f[1],0,23), fld(f[2],1,31), fld(f[3],1,12,MON,1), fld(f[4],0,7,DOW,0)
    if 7 in dw: dw.add(0)
    ds, ws = f[2].startswith('*'), f[4].startswith('*')
    t = datetime.datetime.strptime(ref, '%Y-%m-%d %H:%M') + datetime.timedelta(minutes=1)
    out = []
    while len(out) < n:
        wd = (t.weekday() + 1) % 7
        a, b = t.day in dm, wd in dw
        ok = t.month in mo and ((a and b) if (ds or ws) else (a or b))
        if not ok:
            t = (t + datetime.timedelta(days=1)).replace(hour=0, minute=0); continue
        if t.hour not in ho:
            t = (t + datetime.timedelta(hours=1)).replace(minute=0); continue
        if t.minute in mi:
            out.append(t.strftime('%Y-%m-%d %H:%M'))
        t += datetime.timedelta(minutes=1)
    return out
for e in sys.argv[3:]:
    print(','.join(fires(e)))
`;

/** Trecho de shell que roda PY_CRON: expressões, ref ('AAAA-MM-DD HH:MM'), n. Imprime uma linha por expressão. */
export const pyCron = (exprs, ref, n) => `python3 - ${sq(ref)} ${n} ${[].concat(exprs).map(sq).join(' ')} <<'PY'\n${PY_CRON}PY`;

/** Remove (se existir) a conta de teste e o grupo privado homônimo que pode sobrar. */
export const rmU = (u) => `sudo userdel -r ${u} 2>/dev/null; sudo groupdel ${u} 2>/dev/null`;
