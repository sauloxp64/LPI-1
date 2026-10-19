// 104.5 — permissões, umask, chmod simbólico/octal, acesso efetivo.
import { mcq, code, pad } from './util.mjs';

/** 0o755 -> 'rwxr-xr-x' (com s/S/t/T quando há bits especiais). */
export function symbolic(mode) {
  const suid = mode & 0o4000; const sgid = mode & 0o2000; const stk = mode & 0o1000;
  let s = '';
  for (let i = 0; i < 3; i++) {
    const b = (mode >> (6 - 3 * i)) & 7;
    let x = b & 1 ? 'x' : '-';
    if (i === 0 && suid) x = b & 1 ? 's' : 'S';
    if (i === 1 && sgid) x = b & 1 ? 's' : 'S';
    if (i === 2 && stk) x = b & 1 ? 't' : 'T';
    s += (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + x;
  }
  return s;
}

export const octal = (mode) => (mode > 0o777 ? pad(mode.toString(8), 4) : pad(mode.toString(8), 3));

/** chmod simbólico sem bits especiais: clauses = [{who:'ug', op:'+', perms:'rx'}] */
export function applyChmod(mode, clauses) {
  const bit = { r: 4, w: 2, x: 1 };
  const shift = { u: 6, g: 3, o: 0 };
  let m = mode;
  for (const { who, op, perms } of clauses) {
    const targets = who === 'a' ? ['u', 'g', 'o'] : who.split('');
    for (const t of targets) {
      let v = 0;
      for (const p of perms) v |= bit[p];
      const sh = shift[t];
      if (op === '+') m |= v << sh;
      else if (op === '-') m &= ~(v << sh);
      else { m &= ~(7 << sh); m |= v << sh; }
    }
  }
  return m;
}


/** Todas as umasks (3 e 4 dígitos) que produzem `fileMode` para arquivos: o bit x da umask não influencia (666 não tem x). */
function umasksFor(fileMode) {
  const out = [];
  for (let u = 0; u <= 0o777; u++) if ((0o666 & ~u) === fileMode) out.push(pad(u.toString(8), 3), pad(u.toString(8), 4));
  return out;
}

const permWords = { r: 'leitura', w: 'escrita', x: 'execução' };
const whoWords = { u: 'dono (u)', g: 'grupo (g)', o: 'outros (o)', a: 'todos (a)' };

function perturb(rng, mode, n = 8) {
  const out = new Set();
  const digits = [(mode >> 6) & 7, (mode >> 3) & 7, mode & 7];
  let guard = 0;
  while (out.size < n && guard++ < 200) {
    const d = digits.slice();
    const i = rng.int(0, 2);
    d[i] = (d[i] + rng.int(1, 7)) % 8;
    if (rng.chance(0.3)) { const j = rng.int(0, 2); d[j] = (d[j] ^ rng.pick([1, 2, 4])) & 7; }
    const v = (d[0] << 6) | (d[1] << 3) | d[2];
    if (v !== mode) out.add(v);
  }
  return [...out];
}

function randomMode(rng, special = false) {
  const common = [0o644, 0o640, 0o600, 0o755, 0o750, 0o700, 0o664, 0o660, 0o444, 0o555, 0o775, 0o770, 0o666, 0o777, 0o711, 0o740, 0o754, 0o751, 0o620, 0o707, 0o574];
  let m = rng.chance(0.7) ? rng.pick(common) : (rng.int(0, 7) << 6) | (rng.int(0, 7) << 3) | rng.int(0, 7);
  if (special) m |= rng.pick([0o4000, 0o2000, 0o1000, 0o6000, 0o4000, 0o2000, 0o1000]);
  return m;
}

const NAMES = ['relatorio.txt', 'backup.sh', 'dados.csv', 'script.sh', 'notas.md', 'config.ini', 'deploy.sh', 'chave.pem', 'agenda.ods', 'log.txt'];
const USERS = ['ana', 'bruno', 'carla', 'diego', 'elisa', 'fabio', 'gabi', 'hugo'];
const GROUPS = ['dev', 'ops', 'vendas', 'rh', 'suporte', 'staff'];

export const generators = [
  {
    id: 'perm-sym2oct', obj: '104.5', nivel: 2, peso: 2,
    make(rng) {
      const mode = randomMode(rng, rng.chance(0.45));
      const isDir = rng.chance(0.3);
      const name = isDir ? rng.pick(['publico', 'projetos', 'tmp', 'compartilhado']) : rng.pick(NAMES);
      const line = `${isDir ? 'd' : '-'}${symbolic(mode)}`;
      const correct = octal(mode);
      const pool = perturb(rng, mode & 0o777).map((p) => octal((mode & 0o7000) | p));
      if (mode & 0o7000) pool.push(octal(mode & 0o777), octal((mode & 0o777) | ((mode & 0o7000) ^ 0o7000)));
      const options = mcq(rng, correct, pool);
      return {
        type: 'unica',
        text: `Um arquivo aparece em \`ls -l\` com as permissões abaixo. Qual é o modo equivalente em notação octal?\n\n\`\`\`\n${line}  1 ana dev 4096 mar  3 10:15 ${name}\n\`\`\``,
        options,
        explanation: `Cada trio vira um dígito (r=4, w=2, x=1): \`${symbolic(mode)}\` → ${octal(mode & 0o777)}.` +
          (mode & 0o7000 ? ` Os bits especiais ficam no dígito inicial: SUID=4, SGID=2, sticky=1 (aqui ${(mode >> 9) & 7}). Um \`s\`/\`t\` minúsculo indica que o bit de execução também está ligado; \`S\`/\`T\` maiúsculo, que não está.` : ''),
        ref: ['101:p.506-509'],
        verify: { sh: `cd "$(mktemp -d)" && touch f && chmod ${octal(mode)} f && ls -l f | cut -c2-10`, expect: symbolic(mode) },
      };
    },
  },
  {
    id: 'perm-oct2sym', obj: '104.5', nivel: 2, peso: 2,
    make(rng) {
      const mode = randomMode(rng, rng.chance(0.4));
      const correct = symbolic(mode);
      const pool = perturb(rng, mode & 0o777).map((p) => symbolic((mode & 0o7000) | p));
      if (mode & 0o7000) pool.push(symbolic(mode & 0o777), symbolic(mode ^ 0o1000), symbolic(mode ^ 0o4000));
      return {
        type: 'unica',
        text: `Qual das saídas de \`ls -l\` (apenas a coluna de permissões) corresponde ao comando \`chmod ${octal(mode)} arquivo\`?`,
        options: mcq(rng, correct, pool),
        explanation: `${octal(mode)} → ${[...octal(mode)].map((d) => d).join(' | ')}: cada dígito é a soma de r=4, w=2, x=1 para dono, grupo e outros. Resultado: \`${correct}\`.` +
          (mode & 0o7000 ? ' O dígito extra à esquerda controla SUID (4), SGID (2) e sticky (1), exibidos como s/s/t nas posições de execução.' : ''),
        ref: ['101:p.508-511'],
        verify: { sh: `cd "$(mktemp -d)" && touch f && chmod ${octal(mode)} f && ls -l f | cut -c2-10`, expect: correct },
      };
    },
  },
  {
    id: 'chmod-sym', obj: '104.5', nivel: 3, peso: 3,
    make(rng) {
      const start = rng.pick([0o644, 0o640, 0o600, 0o755, 0o750, 0o700, 0o664, 0o444, 0o666, 0o751, 0o640, 0o711]);
      const nClauses = rng.int(1, 3);
      const clauses = [];
      const whos = ['u', 'g', 'o', 'a', 'ug', 'go', 'uo'];
      for (let i = 0; i < nClauses; i++) {
        const op = rng.pick(['+', '-', '=', '+', '-']);
        let perms = rng.sample(['r', 'w', 'x'], rng.int(op === '=' ? 0 : 1, 3)).sort((a, b) => 'rwx'.indexOf(a) - 'rwx'.indexOf(b)).join('');
        if (op !== '=' && !perms) perms = 'x';
        clauses.push({ who: rng.pick(whos), op, perms });
      }
      const cmd = clauses.map((c) => `${c.who}${c.op}${c.perms}`).join(',');
      const result = applyChmod(start, clauses);
      const naive = applyChmod(start, clauses.map((c) => ({ ...c, op: c.op === '+' ? '=' : c.op === '=' ? '+' : '+' })));
      const pool = [octal(naive), ...perturb(rng, result).map(octal)];
      const correct = octal(result);
      return {
        type: 'unica',
        text: `Um arquivo tem o modo \`${octal(start)}\` (\`${symbolic(start)}\`). Qual será o modo (octal) depois de executar o comando abaixo?\n\n\`\`\`\nchmod ${cmd} arquivo\n\`\`\``,
        options: mcq(rng, correct, pool),
        explanation: `Partindo de \`${symbolic(start)}\`, as cláusulas são aplicadas da esquerda para a direita (\`+\` liga bits, \`-\` desliga, \`=\` substitui todos os bits da classe). Resultado: \`${symbolic(result)}\` = ${correct}.`,
        ref: ['101:p.508-511'],
        verify: { sh: `cd "$(mktemp -d)" && touch f && chmod ${octal(start)} f && chmod ${cmd} f && printf '%03d' "$(stat -c %a f)"`, expect: correct },
      };
    },
  },
  {
    id: 'umask-calc', obj: '104.5', nivel: 2, peso: 3,
    make(rng) {
      const um = rng.pick([0o022, 0o002, 0o027, 0o077, 0o007, 0o037, 0o026, 0o012, 0o023, 0o072, 0o033, 0o057]);
      const kind = rng.pick(['arquivo', 'diretorio']);
      const base = kind === 'arquivo' ? 0o666 : 0o777;
      const mode = base & ~um;
      const correct = symbolic(mode);
      const wrongBase = kind === 'arquivo' ? 0o777 : 0o666;
      const pool = [symbolic(wrongBase & ~um), symbolic(um), symbolic(~um & 0o777), symbolic(base ^ um & 0o777), ...perturb(rng, mode).map(symbolic)];
      const isFile = kind === 'arquivo';
      return {
        type: 'unica',
        text: `Com \`umask ${pad(um.toString(8), 3)}\` ativo, quais serão as permissões de ${isFile ? 'um **arquivo** recém-criado com `touch`' : 'um **diretório** recém-criado com `mkdir`'}?`,
        options: mcq(rng, correct, pool),
        explanation: `A umask é *subtraída* (bits desligados) do modo máximo: ${isFile ? 'arquivos começam em 666 (não recebem x automaticamente)' : 'diretórios começam em 777'}. ${octal(base)} AND NOT ${pad(um.toString(8), 3)} = ${octal(mode)} → \`${correct}\`.`,
        ref: ['101:p.512-514'],
        verify: { sh: `cd "$(mktemp -d)" && umask ${pad(um.toString(8), 3)} && touch f && mkdir d && ls -ld ${isFile ? 'f' : 'd'} | cut -c2-10`, expect: correct },
      };
    },
  },
  {
    id: 'umask-goal', obj: '104.5', nivel: 3, peso: 2,
    make(rng) {
      const um = rng.pick([0o022, 0o002, 0o027, 0o077, 0o007, 0o037, 0o026, 0o012, 0o023, 0o072]);
      const fileMode = 0o666 & ~um;
      return {
        type: 'lacuna',
        text: `Que valor de umask (3 dígitos octais) faz com que **arquivos** novos sejam criados com o modo \`${octal(fileMode)}\` (\`${symbolic(fileMode)}\`)? \`umask ____\``,
        answers: umasksFor(fileMode),
        explanation: `modo do arquivo = 666 − umask (bit a bit). Para obter ${octal(fileMode)}, a umask típica é ${pad(um.toString(8), 3)} (o dígito de execução da umask não afeta arquivos, então valores como ${pad((um | 0o111).toString(8), 3)} também servem). Para diretórios, ${pad(um.toString(8), 3)} resultaria em ${octal(0o777 & ~um)}.`,
        ref: ['101:p.512-514'],
        verify: { sh: `cd "$(mktemp -d)" && umask ${pad(um.toString(8), 3)} && touch f && stat -c %a f`, expect: octal(fileMode).replace(/^0+(?=\d{3})/, '') },
      };
    },
  },
  {
    id: 'chmod-goal', obj: '104.5', nivel: 2, peso: 2,
    make(rng) {
      const mode = rng.pick([0o750, 0o640, 0o700, 0o755, 0o644, 0o600, 0o660, 0o754, 0o740, 0o711, 0o444, 0o664]);
      const d = [(mode >> 6) & 7, (mode >> 3) & 7, mode & 7];
      const phr = (v) => {
        const p = [v & 4 && 'leitura', v & 2 && 'escrita', v & 1 && 'execução'].filter(Boolean);
        return p.length ? p.join(', ') : 'nenhum acesso';
      };
      return {
        type: 'lacuna',
        text: `Complete com o modo octal de 3 dígitos para que o dono tenha ${phr(d[0])}; o grupo, ${phr(d[1])}; e os outros, ${phr(d[2])}:\n\n\`chmod ____ script.sh\``,
        answers: [octal(mode)],
        explanation: `r=4, w=2, x=1. Dono: ${d[0]}, grupo: ${d[1]}, outros: ${d[2]} → ${octal(mode)} (\`${symbolic(mode)}\`).`,
        ref: ['101:p.508-511'],
      };
    },
  },
  {
    id: 'access-check', obj: '104.5', nivel: 3, peso: 3,
    make(rng) {
      const owner = rng.pick(USERS);
      const grp = rng.pick(GROUPS);
      const mode = rng.pick([0o640, 0o750, 0o604, 0o460, 0o064, 0o755, 0o700, 0o670, 0o604, 0o744, 0o470]);
      const who = rng.pick(['dono', 'grupo', 'outro']);
      let user; let userGroups;
      if (who === 'dono') { user = owner; userGroups = [rng.pick(GROUPS)]; }
      else if (who === 'grupo') { user = rng.pick(USERS.filter((u) => u !== owner)); userGroups = [grp, rng.pick(GROUPS.filter((g) => g !== grp))]; }
      else { user = rng.pick(USERS.filter((u) => u !== owner)); userGroups = rng.sample(GROUPS.filter((g) => g !== grp), 2); }
      const cls = who === 'dono' ? 0 : who === 'grupo' ? 1 : 2;
      const bits = (mode >> (6 - 3 * cls)) & 7;
      const fmt = (b) => `${b & 4 ? 'ler' : ''}${b & 2 ? (b & 4 ? ', escrever' : 'escrever') : ''}${b & 1 ? (b & 6 ? ', executar' : 'executar') : ''}` || 'nenhum acesso';
      const correct = fmt(bits);
      const pool = [0, 1, 2, 3, 4, 5, 6, 7].filter((b) => b !== bits).map(fmt);
      const otherClsBits = [0, 1, 2].filter((c) => c !== cls).map((c) => fmt((mode >> (6 - 3 * c)) & 7)).filter((x) => x !== correct);
      return {
        type: 'unica',
        text: `Considere o arquivo e o usuário abaixo:\n\n\`\`\`\n${'-' + symbolic(mode)} 1 ${owner} ${grp} 1024 mai 12 09:30 dados.bin\n\nusuário: ${user}   grupos: ${userGroups.join(', ')}\n\`\`\`\n\nO que o usuário \`${user}\` pode fazer com o arquivo (sem ser root)?`,
        options: mcq(rng, correct, [...otherClsBits, ...pool]),
        explanation: `O kernel aplica **apenas uma** classe, na ordem dono → grupo → outros. ${user} ${who === 'dono' ? `é o dono (${owner}), então vale o trio do dono` : who === 'grupo' ? `não é o dono, mas pertence ao grupo ${grp}, então vale o trio do grupo` : `não é o dono nem pertence ao grupo ${grp}, então vale o trio "outros"`}: \`${symbolic(mode).slice(cls * 3, cls * 3 + 3)}\` → ${correct}.`,
        ref: ['101:p.506-508'],
      };
    },
  },
  {
    id: 'chmod-special', obj: '104.5', nivel: 3, peso: 2,
    make(rng) {
      const base = rng.pick([0o755, 0o750, 0o644, 0o775, 0o700, 0o777]);
      const special = rng.pick([['u+s', 0o4000], ['g+s', 0o2000], ['+t', 0o1000], ['u+s,g+s', 0o6000], ['u+s,+t', 0o5000]]);
      const mode = base | special[1];
      const correct = symbolic(mode);
      const wrong = [symbolic(base | (special[1] ^ 0o7000 & 0o7000)), symbolic(base), symbolic(mode & ~0o111), ...perturb(rng, mode & 0o777).map((p) => symbolic((mode & 0o7000) | p))];
      return {
        type: 'unica',
        text: `Um arquivo está com o modo \`${octal(base)}\`. Depois de \`chmod ${special[0]} arquivo\`, qual é a coluna de permissões mostrada por \`ls -l\`?`,
        options: mcq(rng, correct, wrong),
        explanation: `\`u+s\` liga o SUID (4000), \`g+s\` liga o SGID (2000) e \`+t\` liga o sticky bit (1000). Quando o bit de execução correspondente já está ligado, \`ls -l\` mostra \`s\`/\`t\` minúsculos; sem execução apareceriam \`S\`/\`T\`. Resultado: \`${correct}\` (${octal(mode)}).`,
        ref: ['101:p.515-517'],
        verify: { sh: `cd "$(mktemp -d)" && touch f && chmod ${octal(base)} f && chmod ${special[0]} f && ls -l f | cut -c2-10`, expect: correct },
      };
    },
  },
];
