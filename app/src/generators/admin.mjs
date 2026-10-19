// 107.1 — contas de usuário e grupos: /etc/passwd, /etc/shadow, /etc/group, useradd/usermod/userdel, chage, passwd.
import { mcq, multi, block } from './util.mjs';
import { sq, rmU, USERS, FULLNAME, GROUPS, toDays, isoDays, chageDays, randStr, fakeHash } from './admin-lib.mjs';

const SYS_NAMES = ['svcapp', 'tomcat', 'nginx', 'redis', 'grafana', 'jenkins', 'prometheus', 'zabbix', 'gitsvc'];

// ------------------------------------------------------------------ /etc/passwd
function passwdSpec(rng, system = rng.chance(0.4), avoid = []) {
  if (system) {
    const login = rng.pick(SYS_NAMES.filter((x) => !avoid.includes(x))); const uid = rng.int(100, 999);
    return { login, uid, gid: rng.chance(0.7) ? uid : rng.int(100, 999), system: true, shell: rng.pick(['/usr/sbin/nologin', '/bin/false', '/usr/sbin/nologin']),
      gecos: rng.pick(['', `Servico ${login}`, `${login} daemon`]), home: rng.pick([`/var/lib/${login}`, '/nonexistent', `/opt/${login}`]) };
  }
  const login = rng.pick(USERS.filter((x) => !avoid.includes(x))); const uid = rng.int(1000, 1999);
  return { login, uid, gid: rng.chance(0.75) ? uid : rng.int(1000, 1999), system: false, shell: rng.pick(['/bin/bash', '/bin/bash', '/bin/sh', '/bin/zsh']),
    gecos: rng.chance(0.8) ? FULLNAME[login] + (rng.chance(0.25) ? ',Sala 12,,' : '') : '', home: `/home/${login}` };
}
const passwdLine = (p) => `${p.login}:x:${p.uid}:${p.gid}:${p.gecos}:${p.home}:${p.shell}`;
const passwdFields = (p) => [p.login, 'x', String(p.uid), String(p.gid), p.gecos, p.home, p.shell];
const FIELD_NAMES = ['nome de login', 'senha (x = o hash está em /etc/shadow)', 'UID', 'GID do grupo primário', 'GECOS (comentário / nome completo)', 'diretório home', 'shell de login'];

/** Cria as contas no container com os mesmos dados e imprime o que `getent passwd` devolve. */
function passwdVerify(list) {
  const sh = list.map((p, i) => [
    `getent passwd ${p.login} >/dev/null && echo "EXISTE ${p.login}"`,
    `sudo groupadd -o -g ${p.gid} zzg${i} 2>/dev/null`,
    `sudo useradd -o -M -u ${p.uid} -g ${p.gid} -c ${sq(p.gecos)} -d ${sq(p.home)} -s ${sq(p.shell)} ${p.login} 2>/dev/null`,
    `getent passwd ${p.login}`,
    `sudo userdel ${p.login} 2>/dev/null; sudo groupdel zzg${i} 2>/dev/null`,
  ].join('\n')).join('\n');
  return { sh, expect: list.map(passwdLine).join('\n') };
}

const gPasswd = {
  id: 'usr-passwd-campos', obj: '107.1', nivel: 1, peso: 2,
  make(rng) {
    const fmt = rng.pick(['valor', 'valor', 'campo', 'login-interativo', 'afirmacoes']);
    const ref = ['102:p.197-198'];
    if (fmt === 'valor') {
      const p = passwdSpec(rng); const line = passwdLine(p);
      const asks = [['UID', 'uid'], ['GID do grupo primário', 'gid'], ['diretório home', 'home'], ['shell de login', 'shell'], ['comentário (campo GECOS)', 'gecos']];
      if (!p.gecos) asks.pop();
      const [label, key] = rng.pick(asks);
      const correct = String(p[key]);
      const pool = [...['uid', 'gid', 'home', 'shell', 'login', 'gecos'].filter((k) => k !== key).map((k) => String(p[k])).filter(Boolean), String(p.uid + 1), String(p.gid - 1), 'x'];
      return {
        type: 'unica',
        text: `Observe a linha abaixo de \`/etc/passwd\`:\n\n${block(line)}\n\nQual é o valor do campo **${label}** dessa conta?`,
        options: mcq(rng, correct, pool.filter((x) => x !== correct)),
        explanation: `A linha tem 7 campos separados por \`:\` → login : senha : UID : GID : GECOS : home : shell. Contando: ${line.split(':').map((v, i) => `${i + 1}º \`${v || '(vazio)'}\``).join(', ')}. O campo pedido (${label}) vale \`${correct}\`.`,
        ref, verify: passwdVerify([p]),
      };
    }
    if (fmt === 'campo') {
      const p = passwdSpec(rng); const line = passwdLine(p); const f = passwdFields(p);
      const uniq = [0, 2, 3, 4, 5, 6].filter((i) => f[i] && f.filter((v) => v === f[i]).length === 1);
      const idx = rng.pick(uniq);
      const near = [idx - 1, idx + 1, 2, 3, 5].filter((i) => i >= 0 && i < 7 && i !== idx).map((i) => FIELD_NAMES[i]);
      return {
        type: 'unica',
        text: `Na linha de \`/etc/passwd\` abaixo, o valor \`${f[idx]}\` ocupa qual campo?\n\n${block(line)}`,
        options: mcq(rng, FIELD_NAMES[idx], [...near, ...FIELD_NAMES]),
        explanation: `Ordem dos 7 campos: 1 login, 2 senha (\`x\` = hash em /etc/shadow), 3 UID, 4 GID do grupo primário, 5 GECOS, 6 home, 7 shell. Separando a linha por \`:\`, \`${f[idx]}\` é o ${idx + 1}º → **${FIELD_NAMES[idx]}**.`,
        ref, verify: passwdVerify([p]),
      };
    }
    if (fmt === 'login-interativo') {
      const a = passwdSpec(rng, false); const b = passwdSpec(rng, true); const c = passwdSpec(rng, false, [a.login]);
      const list = rng.shuffle([a, b, c]);
      const norm = [a, c];
      return {
        type: 'unica',
        text: `Dadas as contas abaixo em \`/etc/passwd\`, qual delas **não** permite um login interativo (por causa do shell configurado)?\n\n${block(list.map(passwdLine).join('\n'))}`,
        options: mcq(rng, b.login, [a.login, c.login, `${b.login} e ${a.login}`, 'nenhuma: todas têm senha `x`']),
        explanation: `O 7º campo é o shell. \`${b.shell}\` não é um shell interativo: \`nologin\` e \`/bin/false\` encerram a sessão imediatamente, e por isso contas de serviço (UID < 1000 por convenção) os usam. As demais usam \`${norm[0].shell}\` e \`${norm[1].shell}\`. O \`x\` do 2º campo só indica que o hash está em /etc/shadow — não impede nem permite login.`,
        ref, verify: passwdVerify(list),
      };
    }
    const p = passwdSpec(rng, rng.chance(0.5));
    const line = passwdLine(p);
    const noShell = /nologin|false/.test(p.shell);
    const T = ['A senha criptografada não está neste arquivo: o `x` indica que o hash fica em /etc/shadow', `O UID da conta é ${p.uid}`, `O diretório inicial da conta é \`${p.home}\``,
      p.system ? 'É uma conta de sistema/serviço, pois o UID é menor que 1000' : 'É um usuário comum, pois o UID é maior ou igual a 1000'];
    const F = [p.system ? 'É um usuário comum, pois o UID é menor que 1000' : 'É uma conta de sistema, pois o UID é maior ou igual a 1000', `O grupo primário é identificado pelo 3º campo (${p.uid})`,
      'O `x` indica que a conta está bloqueada e não pode ser usada', `O shell de login é \`${p.home}\``, `O 4º campo guarda o UID (${p.gid})`];
    (noShell ? T : F).push('A conta não consegue abrir um shell interativo');
    const nT = rng.int(2, 3);
    const trues = rng.sample(T, nT);
    return {
      type: 'multipla',
      text: `Considere a linha de \`/etc/passwd\`:\n\n${block(line)}\n\nSelecione as afirmações **corretas**.`,
      options: multi(rng, trues, F, 5 - nT),
      explanation: `Campos: login \`${p.login}\`, senha \`x\` (hash em /etc/shadow), UID \`${p.uid}\`, GID \`${p.gid}\` (grupo primário), GECOS \`${p.gecos || '(vazio)'}\`, home \`${p.home}\`, shell \`${p.shell}\`. O **3º** campo é o UID e o **4º** é o GID do grupo primário; o 7º é o shell. Contas de serviço usam UID baixo (< 1000) e shell \`nologin\`/\`false\`.`,
      ref, verify: passwdVerify([p]),
    };
  },
};

// ------------------------------------------------------------------ /etc/shadow
const SHADOW_NAMES = ['login', 'senha criptografada', 'data da última troca de senha (dias desde 1970-01-01)', 'idade mínima da senha (dias)', 'idade máxima da senha (dias)', 'período de aviso antes da expiração (dias)', 'período de inatividade após a expiração (dias)', 'data de expiração da conta (dias desde 1970-01-01)', 'campo reservado'];

/** Aplica o estado com chage numa conta temporária e imprime os campos do shadow + datas do chage -l. */
function shadowVerify(s, extra = '') {
  const u = s.login;
  const sh = [
    `${rmU(u)}; sudo useradd -M ${u} 2>/dev/null`,
    `sudo chage -d ${s.last} -m ${s.min} -M ${s.max} -W ${s.warn} -I ${s.inact ?? -1} -E ${s.exp ?? -1} ${u}`,
    `sudo getent shadow ${u} | cut -d: -f3-9`,
    `sudo chage -l ${u} | grep -E 'Password expires|Password inactive|Account expires' | sed 's/.*: //'`,
    extra,
    `${rmU(u)}`,
  ].filter(Boolean).join('\n');
  const lines = [`${s.last}:${s.min}:${s.max}:${s.warn}:${s.inact ?? ''}:${s.exp ?? ''}:`,
    chageDays(s.last + s.max), s.inact != null ? chageDays(s.last + s.max + s.inact) : 'never', s.exp != null ? chageDays(s.exp) : 'never'];
  return { sh, lines };
}

const gShadow = {
  id: 'usr-shadow-calculo', obj: '107.1', nivel: 3, peso: 3,
  make(rng) {
    const base = toDays(2025, 1, 1) + rng.int(0, 600);
    const s = { login: rng.pick(USERS), last: base, min: rng.pick([0, 1, 2, 5, 7]), max: rng.pick([30, 45, 60, 90, 120, 180]), warn: rng.pick([7, 10, 14]), inact: rng.chance(0.75) ? rng.pick([3, 5, 7, 10, 14, 30]) : null, exp: rng.chance(0.4) ? base + rng.int(200, 900) : null };
    const hash = fakeHash(rng);
    const line = `${s.login}:${hash}:${s.last}:${s.min}:${s.max}:${s.warn}:${s.inact ?? ''}:${s.exp ?? ''}:`;
    let fmt = rng.pick(['expira', 'expira', 'bloqueio', 'aviso', 'campo', 'conversao']);
    if (fmt === 'bloqueio' && s.inact == null) fmt = 'expira';
    const ref = ['102:p.198-199'];
    const warnDate = `date -u -d @$(( (${s.last}+${s.max}-${s.warn})*86400 )) +%F`;
    const dateOpts = (right, wrong) => mcq(rng, isoDays(right), [...wrong.map(isoDays), isoDays(right + 1), isoDays(right - 1), isoDays(right + 7), isoDays(right - 7)]);
    if (fmt === 'expira') {
      const v = shadowVerify(s, warnDate);
      return {
        type: 'unica',
        text: `Em um servidor, \`getent shadow ${s.login}\` mostra:\n\n${block(line)}\n\nA data da última troca está em **dias desde 1970-01-01**: o dia ${s.last} corresponde a **${isoDays(s.last)}**. Em que data a **senha** de \`${s.login}\` expira (passa a ser obrigatório trocá-la)?`,
        options: dateOpts(s.last + s.max, [s.last + s.min, s.last + s.max - s.warn, s.last + s.max + (s.inact ?? 3)]),
        explanation: `Campo 3 = última troca (dia ${s.last} = ${isoDays(s.last)}); campo 5 = idade máxima (${s.max} dias). Expira em **${s.last} + ${s.max} = ${s.last + s.max}** → **${isoDays(s.last + s.max)}** (\`chage -l\` mostra "Password expires : ${chageDays(s.last + s.max)}"). Erros comuns: somar a idade *mínima* (campo 4), subtrair o aviso (isso dá o início dos avisos, ${isoDays(s.last + s.max - s.warn)}) ou somar o período de inatividade (essa é a data do bloqueio).`,
        ref, verify: { sh: v.sh, expect: [...v.lines, isoDays(s.last + s.max - s.warn)].join('\n') },
      };
    }
    if (fmt === 'bloqueio') {
      const v = shadowVerify(s);
      return {
        type: 'unica',
        text: `\`getent shadow ${s.login}\` retorna:\n\n${block(line)}\n\nO dia ${s.last} equivale a ${isoDays(s.last)}. Se o usuário **nunca** trocar a senha, em que data a conta será **desativada** por inatividade (campo 7)?`,
        options: dateOpts(s.last + s.max + s.inact, [s.last + s.max, s.last + s.inact, s.last + s.max - s.warn, s.last + s.max + s.warn]),
        explanation: `A senha expira em ${s.last} + ${s.max} (campo 5) = ${isoDays(s.last + s.max)}. A partir daí começa o período de inatividade de ${s.inact} dias (campo 7): a conta é desativada em ${s.last + s.max} + ${s.inact} = **${isoDays(s.last + s.max + s.inact)}** (\`chage -l\`: "Password inactive : ${chageDays(s.last + s.max + s.inact)}"). A data de expiração da senha é só o início dessa janela.`,
        ref, verify: { sh: v.sh, expect: v.lines.join('\n') },
      };
    }
    if (fmt === 'aviso') {
      const v = shadowVerify(s, warnDate);
      return {
        type: 'unica',
        text: `Linha de \`/etc/shadow\`:\n\n${block(line)}\n\nDia ${s.last} = ${isoDays(s.last)}. A partir de que data o usuário \`${s.login}\` começa a **receber avisos** de que a senha vai expirar?`,
        options: dateOpts(s.last + s.max - s.warn, [s.last + s.max, s.last + s.max + s.warn, s.last + s.warn, s.last + s.max - s.min]),
        explanation: `O aviso (campo 6 = ${s.warn} dias) começa *antes* da expiração: ${s.last} + ${s.max} − ${s.warn} = ${s.last + s.max - s.warn} → **${isoDays(s.last + s.max - s.warn)}**. A senha em si expira em ${isoDays(s.last + s.max)}.`,
        ref, verify: { sh: v.sh, expect: [...v.lines, isoDays(s.last + s.max - s.warn)].join('\n') },
      };
    }
    if (fmt === 'campo') {
      const vals = { 3: s.min, 4: s.max, 5: s.warn, 6: s.inact };
      const cand = [3, 4, 5, 6].filter((i) => vals[i] != null && Object.values(vals).filter((x) => x === vals[i]).length === 1);
      const idx = rng.pick(cand.length ? cand : [4]);
      const meaning = SHADOW_NAMES[idx];
      const v = shadowVerify(s);
      return {
        type: 'unica',
        text: `Na linha de \`/etc/shadow\` abaixo, o que representa o valor \`${vals[idx]}\` (${idx + 1}º campo, contando o login como 1º)?\n\n${block(line)}`,
        options: mcq(rng, meaning, SHADOW_NAMES.filter((x, i) => i !== idx && i > 1 && i < 8)),
        explanation: `/etc/shadow tem **9 campos**: ${SHADOW_NAMES.map((n, i) => `${i + 1}) ${n}`).join('; ')}. O ${idx + 1}º campo é **${meaning}**.`,
        ref, verify: { sh: v.sh, expect: v.lines.join('\n') },
      };
    }
    const N = s.last;
    const right = [`date -u -d "1970-01-01 + ${N} days" +%F`, `date -u -d @$((${N} * 86400)) +%F`];
    const wrong = [`date -u -d @${N} +%F`, `date -u -d "${N} days" +%F`, `date -u -d "${N} seconds" +%F`, `date -u -d "${N} months ago" +%F`];
    const sh = [`date -u -d "1970-01-01 + ${N} days" +%F`, `date -u -d @$((${N} * 86400)) +%F`, `date -u -d @${N} +%F`].join('\n');
    return {
      type: 'multipla',
      text: `O 3º campo de \`/etc/shadow\` (última troca de senha) de um usuário vale \`${N}\`, ou seja, **dias** desde 1970-01-01. Quais comandos exibem essa data corretamente (em UTC)?`,
      options: multi(rng, right, wrong, 3),
      explanation: `O valor é em **dias**, não em segundos. \`date -d @N\` interpreta N como *segundos* da época (${N} s ≈ 1970-01-01), e \`date -d "${N} days"\` conta a partir de **hoje**. Os dois comandos corretos convertem dias → segundos (\`${N} * 86400\`) ou somam dias à data 1970-01-01. Resultado: **${isoDays(N)}**.`,
      ref, verify: { sh, expect: [isoDays(N), isoDays(N), '1970-01-01'].join('\n') },
    };
  },
};

// ------------------------------------------------------------------ useradd
/** Interpreta as opções do useradd e devolve o efeito (ou {erro}). */
function effectOf(tok, login) {
  const st = { uid: '-', pg: '-', sg: [], home: `/home/${login}`, criado: false, shell: '-', c: '-', exp: '-' };
  let noHome = false; const seen = new Set();
  for (const [flag, val] of tok) {
    if (seen.has(flag)) return { erro: true };
    seen.add(flag);
    if (flag === '-u') { if (!/^\d+$/.test(val)) return { erro: true }; st.uid = val; } else if (flag === '-g') { if (/[,/ ]|^\d{4}-/.test(val)) return { erro: true }; st.pg = val; } else if (flag === '-G') { if (/[ /]|^\d{4}-/.test(val)) return { erro: true }; st.sg = val.split(',').sort(); } else if (flag === '-d') { if (!val.startsWith('/')) return { erro: true }; st.home = val; } else if (flag === '-s') { if (!val.startsWith('/')) return { erro: true }; st.shell = val; } else if (flag === '-c') { st.c = val; } else if (flag === '-e') { if (!/^\d{4}-\d\d-\d\d$/.test(val)) return { erro: true }; st.exp = val; } else if (flag === '-m') { st.criado = true; } else if (flag === '-M') { noHome = true; } else return { erro: true };
  }
  if (noHome) st.criado = false;
  if (st.pg === '-') st.pg = login; // grupo privado criado automaticamente (USERGROUPS_ENAB yes)
  return st;
}
const stText = (st) => [st.uid !== '-' ? `UID ${st.uid}` : null, `grupo primário \`${st.pg}\``, `secundários: ${st.sg.length ? st.sg.map((g) => `\`${g}\``).join(', ') : 'nenhum'}`, `home \`${st.home}\` (${st.criado ? 'criado' : 'não criado'})`, st.shell !== '-' ? `shell \`${st.shell}\`` : null, st.c !== '-' ? `comentário "${st.c}"` : null, st.exp !== '-' ? `conta expira em ${st.exp}` : null].filter(Boolean).join('; ');
const cmdOf = (tok, login) => `useradd ${tok.map(([f, v]) => (v === undefined ? f : `${f} ${f === '-c' ? `"${v}"` : v}`)).join(' ')} ${login}`;

function useraddSpec(rng) {
  const login = rng.pick(USERS);
  const gs = rng.sample(GROUPS, 3);
  const tok = [];
  if (rng.chance(0.7)) tok.push(['-u', String(rng.int(1500, 1999))]);
  if (rng.chance(0.85)) tok.push(['-g', gs[0]]);
  const nSg = rng.pick([0, 1, 1, 2]);
  if (nSg) tok.push(['-G', gs.slice(1, 1 + nSg).sort().join(',')]);
  if (rng.chance(0.55)) tok.push(['-d', `${rng.pick(['/srv', '/data', '/opt'])}/${login}`]);
  tok.push([rng.chance(0.65) ? '-m' : '-M']);
  if (rng.chance(0.75)) tok.push(['-s', rng.pick(['/bin/bash', '/bin/zsh', '/bin/sh', '/usr/sbin/nologin'])]);
  if (rng.chance(0.6)) tok.push(['-c', FULLNAME[login]]);
  if (rng.chance(0.4)) tok.push(['-e', `${rng.int(2027, 2030)}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`]);
  for (const extra of [['-s', '/bin/bash'], ['-c', FULLNAME[login]], ['-e', '2029-06-15']]) if (tok.length < 5 && !tok.some((t) => t[0] === extra[0])) tok.push(extra);
  return { login, tok: rng.shuffle(tok), gs };
}

/** Variações plausíveis (um erro de cada vez). `exec` = pode ser executado sem estragar o container de teste. */
function mutations(rng, tok, login) {
  const out = [];
  const has = (f) => tok.find((t) => t[0] === f);
  const swapFlag = (a, b) => tok.map((t) => (t[0] === a ? [b, ...t.slice(1)] : t));
  if (has('-g') && has('-G') && !has('-G')[1].includes(',')) out.push({ t: tok.map((t) => (t[0] === '-g' ? ['-G', t[1]] : t[0] === '-G' ? ['-g', t[1]] : t)), exec: true });
  if (has('-g') && !has('-G')) out.push({ t: swapFlag('-g', '-G'), exec: true });
  if (has('-G') && !has('-g') && !has('-G')[1].includes(',')) out.push({ t: swapFlag('-G', '-g'), exec: true });
  out.push({ t: has('-m') ? swapFlag('-m', '-M') : swapFlag('-M', '-m'), exec: true });
  if (has('-m') && has('-d')) out.push({ t: tok.filter((t) => t[0] !== '-m'), exec: true });
  if (has('-d') && has('-s')) out.push({ t: tok.map((t) => (t[0] === '-d' ? ['-d', has('-s')[1]] : t[0] === '-s' ? ['-s', has('-d')[1]] : t)), exec: false });
  if (has('-e')) out.push({ t: swapFlag('-e', '-f'), exec: false });
  if (has('-s')) out.push({ t: tok.map((t) => (t[0] === '-s' ? ['-s', t[1].split('/').pop()] : t)), exec: false });
  if (has('-G') && has('-G')[1].includes(',')) out.push({ t: tok.map((t) => (t[0] === '-G' ? ['-G', t[1].replace(',', ', ')] : t)), exec: false });
  if (has('-e')) out.push({ t: tok.map((t) => (t[0] === '-e' ? ['-e', t[1].split('-').reverse().join('/')] : t)), exec: false });
  if (has('-u')) out.push({ t: swapFlag('-u', '-U'), exec: false });
  return out.map((m) => ({ ...m, t: rng.shuffle(m.t) }));
}
const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Leituras erradas plausíveis do efeito (não ligadas a um comando específico). */
function fillers(st) {
  const out = [];
  out.push({ ...st, criado: !st.criado });
  if (st.sg.length) out.push({ ...st, pg: st.sg[0], sg: [st.pg, ...st.sg.slice(1)].sort() });
  else out.push({ ...st, sg: [st.pg] });
  if (st.uid !== '-') out.push({ ...st, uid: String(Number(st.uid) + 1) });
  if (st.shell !== '-') out.push({ ...st, shell: st.shell === '/bin/bash' ? '/bin/sh' : '/bin/bash' });
  out.push({ ...st, home: st.home.startsWith('/home/') ? st.home.replace('/home/', '/srv/') : st.home.replace(/^\/[a-z]+\//, '/home/') });
  if (st.exp !== '-') out.push({ ...st, exp: '-' });
  return out;
}

/** Script: cria os grupos, roda o comando e imprime o estado real, que deve ser igual ao estado simulado. */
function useraddVerify(spec, tok, st) {
  const u = spec.login; const cmd = cmdOf(tok, u);
  const homeTrash = tok.find((t) => t[0] === '-d')?.[1] ?? `/home/${u}`;
  let sh = [
    `getent passwd ${u} >/dev/null && echo EXISTE`,
    `for g in ${spec.gs.join(' ')}; do sudo groupdel $g 2>/dev/null; sudo groupadd $g; done`,
    `sudo ${cmd} 2>/dev/null`,
    `echo "uid=$(id -u ${u}) pg=$(id -gn ${u})"`,
    `echo "sg=$(id -Gn ${u} | tr ' ' '\\n' | grep -vx "$(id -gn ${u})" | sort | paste -sd, -)"`,
    `echo "home=$(getent passwd ${u} | cut -d: -f6) criado=$([ -d "$(getent passwd ${u} | cut -d: -f6)" ] && echo sim || echo nao)"`,
    `echo "shell=$(getent passwd ${u} | cut -d: -f7) c=$(getent passwd ${u} | cut -d: -f5) exp=$(sudo chage -l ${u} | grep 'Account expires' | sed 's/.*: //')"`,
    `sudo userdel -r ${u} 2>/dev/null; sudo groupdel ${u} 2>/dev/null; sudo rm -rf ${sq(homeTrash)}; for g in ${spec.gs.join(' ')}; do sudo groupdel $g 2>/dev/null; done`,
  ].join('\n');
  // atributos não pedidos têm valor padrão imprevisível no container: não são comparados
  if (st.uid === '-') sh = sh.replace(`echo "uid=$(id -u ${u}) pg=`, 'echo "uid=- pg=');
  if (st.shell === '-') sh = sh.replace(`echo "shell=$(getent passwd ${u} | cut -d: -f7) c=`, 'echo "shell=- c=');
  const expDate = st.exp === '-' ? 'never' : (() => { const [y, m, d] = st.exp.split('-').map(Number); return chageDays(toDays(y, m, d)); })();
  const exp = [`uid=${st.uid} pg=${st.pg}`, `sg=${st.sg.join(',')}`, `home=${st.home} criado=${st.criado ? 'sim' : 'nao'}`, `shell=${st.shell} c=${st.c === '-' ? '' : st.c} exp=${expDate}`];
  return { sh, expect: exp.join('\n') };
}

const gUseradd = {
  id: 'usr-useradd-comando', obj: '107.1', nivel: 2, peso: 3,
  make(rng) {
    const spec = useraddSpec(rng);
    const st = effectOf(spec.tok, spec.login);
    const correct = cmdOf(spec.tok, spec.login);
    const note = 'Considere que `CREATE_HOME` **não** está ativado em `/etc/login.defs` e que `USERGROUPS_ENAB yes` (sem `-g`, o usuário ganha um grupo privado com o seu nome). Todos os grupos citados já existem.';
    const muts = mutations(rng, spec.tok, spec.login).map((m) => ({ ...m, st: effectOf(m.t, spec.login) })).filter((m) => !sameState(m.st, st));
    const ref = ['102:p.180-181', '102:p.182-183'];
    const g = (f) => spec.tok.find((t) => t[0] === f);
    const expl = `Opções do useradd: \`-u\` UID, \`-g\` grupo **primário** (um só), \`-G\` grupos **secundários** (lista com vírgulas, sem espaços), \`-d\` caminho do home, \`-m\` cria o home / \`-M\` não cria, \`-s\` shell, \`-c\` comentário, \`-e\` data de expiração da **conta** (\`-f\` é o número de dias de tolerância depois que a *senha* expira). \`-d\` só define o caminho: sem \`-m\` o diretório não é criado.`;
    if (rng.chance(0.5) && muts.length >= 3) {
      const req = [];
      if (g('-u')) req.push(`UID **${g('-u')[1]}**`);
      if (g('-g')) req.push(`grupo **primário** \`${g('-g')[1]}\``);
      if (g('-G')) req.push(`grupo(s) **secundário(s)** ${g('-G')[1].split(',').map((x) => `\`${x}\``).join(' e ')}`);
      if (g('-d')) req.push(`diretório home \`${g('-d')[1]}\``);
      req.push(g('-m') ? 'o diretório home **deve ser criado**' : 'o diretório home **não** deve ser criado');
      if (g('-s')) req.push(`shell \`${g('-s')[1]}\``);
      if (g('-c')) req.push(`comentário (nome completo) "${g('-c')[1]}"`);
      if (g('-e')) req.push(`conta que **expira** em ${g('-e')[1]}`);
      return {
        type: 'unica',
        text: `Crie a conta \`${spec.login}\` com estes requisitos: ${req.join('; ')}.\n\n${note}\n\nQual comando atende exatamente ao pedido?`,
        options: mcq(rng, correct, muts.map((m) => cmdOf(m.t, spec.login))),
        explanation: `${expl} Efeito do comando correto: ${stText(st)}.`,
        ref, verify: useraddVerify(spec, spec.tok, st),
      };
    }
    const runnable = muts.filter((m) => m.exec && !m.st.erro);
    const shown = rng.chance(0.7) && runnable.length ? rng.pick(runnable) : { t: spec.tok, st };
    const wrongStates = [st, ...muts.map((m) => m.st), ...fillers(shown.st)].filter((x) => !x.erro && !sameState(x, shown.st));
    return {
      type: 'unica',
      text: `${note}\n\nO que acontece ao executar (como root) o comando abaixo?\n\n${block(cmdOf(shown.t, spec.login))}`,
      options: mcq(rng, stText(shown.st), wrongStates.map(stText)),
      explanation: `${expl} Lendo o comando: ${shown.t.map(([f, v]) => `\`${f}${v !== undefined ? ' ' + v : ''}\``).join(', ')}. Efeito real: ${stText(shown.st)}.`,
      ref, verify: useraddVerify(spec, shown.t, shown.st),
    };
  },
};

// ------------------------------------------------------------------ grupos: usermod -G / -aG / -g
const gGrupos = {
  id: 'usr-usermod-grupos', obj: '107.1', nivel: 3, peso: 3,
  make(rng) {
    const login = rng.pick(USERS);
    const gs = rng.sample(GROUPS, 6);
    const priv = rng.chance(0.6);
    const p0 = priv ? login : gs[0];
    const ini = rng.sample(gs.slice(1, 4), rng.int(1, 2)).sort();
    const [n0, n1] = gs.slice(4, 6);
    const ops = [
      { cmd: `usermod -G ${n0} ${login}`, ok: [p0, [n0]], bad: [[p0, [...ini, n0]]], txt: 'sem `-a`, `-G` **substitui** a lista de grupos secundários' },
      { cmd: `usermod -aG ${n0} ${login}`, ok: [p0, [...ini, n0]], bad: [[p0, [n0]]], txt: 'com `-a`, `-G` **acrescenta** aos secundários existentes' },
      { cmd: `usermod -a -G ${n0},${n1} ${login}`, ok: [p0, [...ini, n0, n1]], bad: [[p0, [n0, n1]]], txt: 'com `-a`, os grupos são acrescentados' },
      { cmd: `usermod -G ${n0},${n1} ${login}`, ok: [p0, [n0, n1]], bad: [[p0, [...ini, n0, n1]]], txt: 'sem `-a`, os grupos antigos são descartados' },
      { cmd: `usermod -g ${n1} ${login}`, ok: [n1, ini], bad: [[p0, [...ini, n1]]], txt: '`-g` troca o grupo **primário** e não altera os secundários' },
      { cmd: `usermod -G "" ${login}`, ok: [p0, []], bad: [[p0, ini]], txt: 'uma lista vazia remove todos os secundários' },
      { cmd: `gpasswd -d ${login} ${ini[0]}`, ok: [p0, ini.slice(1)], bad: [[p0, ini]], txt: '`gpasswd -d` remove o usuário de um grupo' },
    ];
    const op = rng.pick(ops);
    const all = (p, s) => [...new Set([p, ...s].filter(Boolean))].sort().join(', ');
    const correct = all(...op.ok);
    const must = [...op.bad.map((b) => all(...b)), all('', op.ok[1]), all(p0, ini), all(op.ok[0], ini), all(op.ok[0], [...ini, ...op.ok[1]])];
    const mentioned = [...new Set([p0, ...ini, ...op.cmd.split(' ').filter((w) => gs.includes(w) || gs.some((g) => w.split(',').includes(g))).flatMap((w) => w.split(','))])];
    const fill = mentioned.flatMap((x) => [all(op.ok[0], [...op.ok[1], x]), all(x, op.ok[1])]);
    const extra = gs.concat([login]).flatMap((x) => [all(op.ok[0], [...op.ok[1], x]), all(op.ok[0], op.ok[1].filter((_, i) => i > 0).concat(x)), all(x, [...op.ok[1], op.ok[0]])]);
    const pool = [...new Set([...rng.shuffle(must), ...rng.shuffle(fill), ...rng.shuffle(extra)])].filter((x) => x && x !== correct).slice(0, 3);
    const sh = [
      `for g in ${gs.join(' ')}; do sudo groupdel $g 2>/dev/null; sudo groupadd $g; done`,
      `${rmU(login)}; sudo useradd -M ${priv ? '' : `-g ${p0} `}-G ${ini.join(',')} ${login} 2>/dev/null`,
      `sudo ${op.cmd} >/dev/null 2>&1`,
      `id -Gn ${login} | tr ' ' '\\n' | sort | paste -sd, - | sed 's/,/, /g'`,
      `${rmU(login)}; for g in ${gs.join(' ')}; do sudo groupdel $g 2>/dev/null; done`,
    ].join('\n');
    return {
      type: 'unica',
      text: `\`${login}\` tem grupo primário \`${p0}\` e grupos secundários ${ini.map((g) => `\`${g}\``).join(', ')}. Depois de executar como root:\n\n${block(op.cmd)}\n\nquais são **todos** os grupos de \`${login}\` (primário + secundários, como em \`id -Gn\`)?`,
      options: mcq(rng, correct, pool),
      explanation: `Aqui ${op.txt}. Lembre: \`usermod -G\` sem \`-a\` apaga os secundários anteriores; \`-aG\` (append) só acrescenta; \`-g\` mexe apenas no primário. Resultado: primário \`${op.ok[0]}\` + secundários ${op.ok[1].length ? [...op.ok[1]].sort().map((g) => `\`${g}\``).join(', ') : '(nenhum)'} → ${correct}.`,
      ref: ['102:p.181-183', '102:p.194'], verify: { sh, expect: correct },
    };
  },
};

// ------------------------------------------------------------------ chage × passwd
const gChage = {
  id: 'usr-chage-passwd', obj: '107.1', nivel: 2, peso: 2,
  make(rng) {
    const fmt = rng.pick(['equiv', 'equiv', 'campos', 'efeito']);
    const login = rng.pick(USERS);
    const mk = `${rmU(login)}; sudo useradd -M ${login} 2>/dev/null`;
    if (fmt === 'equiv') {
      const [pf, cf, desc, field, val] = rng.pick([['-n', '-m', 'idade mínima da senha', 4, 5], ['-x', '-M', 'idade máxima da senha', 5, 12], ['-w', '-W', 'dias de aviso antes da expiração', 6, 9], ['-i', '-I', 'dias de inatividade após a expiração', 7, 3]]);
      const dir = rng.chance(0.5);
      const sh = [mk, `sudo passwd ${pf} ${val} ${login} >/dev/null 2>&1`, `sudo getent shadow ${login} | cut -d: -f${field}`, `sudo chage -d 1 -m 0 -M 99999 -W 7 -I -1 ${login}`, `sudo chage ${cf} ${val} ${login}`, `sudo getent shadow ${login} | cut -d: -f${field}`, `${rmU(login)}`].join('\n');
      return {
        type: 'unica',
        text: dir ? `Qual opção do **\`chage\`** produz o mesmo efeito que \`passwd ${pf}\` (${desc})?` : `Qual opção do **\`passwd\`** produz o mesmo efeito que \`chage ${cf}\` (${desc})?`,
        options: dir ? mcq(rng, `chage ${cf}`, ['-m', '-M', '-W', '-I', '-d', '-E', '-l'].filter((x) => x !== cf).map((x) => `chage ${x}`)) : mcq(rng, `passwd ${pf}`, ['-n', '-x', '-w', '-i', '-l', '-e', '-S'].filter((x) => x !== pf).map((x) => `passwd ${x}`)),
        explanation: `Correspondências: \`passwd -n\` = \`chage -m\` (mínimo), \`passwd -x\` = \`chage -M\` (máximo), \`passwd -w\` = \`chage -W\` (aviso), \`passwd -i\` = \`chage -I\` (inatividade), \`passwd -S\` = \`chage -l\` (exibir). Aqui: ${desc} → \`passwd ${pf}\` ≡ \`chage ${cf}\` (ambos gravam o campo ${field} de /etc/shadow).`,
        ref: ['102:p.185-187', '102:p.192-193'], verify: { sh, expect: `${val}\n${val}` },
      };
    }
    if (fmt === 'campos') {
      const s = { min: rng.pick([0, 1, 2, 7]), max: rng.pick([30, 60, 90, 180]), warn: rng.pick([5, 7, 14]), inact: rng.pick([2, 3, 10, 20]), exp: toDays(rng.int(2027, 2031), rng.int(1, 12), rng.int(1, 28)) };
      const date = isoDays(s.exp);
      const cmd = `chage -m ${s.min} -M ${s.max} -W ${s.warn} -I ${s.inact} -E ${date} ${login}`;
      const f = (a, b, c, d, e) => `${a}:${b}:${c}:${d}:${e}`;
      const correct = f(s.min, s.max, s.warn, s.inact, s.exp);
      const pool = [f(s.max, s.min, s.warn, s.inact, s.exp), f(s.min, s.max, s.inact, s.warn, s.exp), f(s.min, s.max, s.warn, s.inact, date), f(s.max, s.min, s.inact, s.warn, s.exp), f(s.warn, s.max, s.min, s.inact, s.exp), f(s.min, s.max, s.warn, s.exp, s.inact)];
      return {
        type: 'unica',
        text: `Depois de executar como root:\n\n${block(cmd)}\n\nque valores aparecem nos campos 4 a 8 de \`/etc/shadow\` desse usuário (mínimo : máximo : aviso : inatividade : expiração da conta)?`,
        options: mcq(rng, correct, pool),
        explanation: `\`-m\` → campo 4 (mínimo), \`-M\` → campo 5 (máximo), \`-W\` → campo 6 (aviso), \`-I\` → campo 7 (inatividade) e \`-E\` → campo 8, que guarda a data de expiração **em dias desde 1970-01-01** (${date} = dia ${s.exp}), e não a data escrita. Resultado: \`${correct}\`.`,
        ref: ['102:p.187', '102:p.198-199'], verify: { sh: [mk, `sudo ${cmd}`, `sudo getent shadow ${login} | cut -d: -f4-8`, `${rmU(login)}`].join('\n'), expect: correct },
      };
    }
    const days = toDays(rng.int(2027, 2031), rng.int(1, 12), rng.int(1, 28));
    const cases = [
      { cmd: `chage -d 0 ${login}`, field: 3, val: '0', ok: 'força a troca de senha no próximo login (campo 3 = 0)' },
      { cmd: `passwd -e ${login}`, field: 3, val: '0', ok: 'força a troca de senha no próximo login (campo 3 = 0)' },
      { cmd: `chage -E ${isoDays(days)} ${login}`, field: 8, val: String(days), ok: `define a expiração da conta em ${isoDays(days)} (campo 8 = ${days})` },
      { cmd: `chage -E -1 ${login}`, field: 8, val: '', ok: 'remove a data de expiração da conta (campo 8 vazio)' },
      { cmd: `chage -M 99999 ${login}`, field: 5, val: '99999', ok: 'desabilita a expiração da senha (campo 5 = 99999)' },
      { cmd: `chage -E 0 ${login}`, field: 8, val: '0', ok: 'expira a conta imediatamente (campo 8 = 0, ou seja, 1970-01-01)' },
    ];
    const c = rng.pick(cases);
    const sh = [mk, `sudo chage -M 90 -E 20000 ${login}`, `sudo ${c.cmd} >/dev/null 2>&1`, `sudo getent shadow ${login} | cut -d: -f${c.field}`, `${rmU(login)}`].join('\n');
    return {
      type: 'unica',
      text: `O que o comando abaixo, executado como root, faz com a conta (que antes tinha senha válida por 90 dias e conta com data de expiração futura)?\n\n${block(c.cmd)}`,
      options: mcq(rng, c.ok, [...cases.filter((x) => x.ok !== c.ok).map((x) => x.ok), 'bloqueia a senha com "!" no início do hash', 'define o número mínimo de dias entre trocas de senha como 0', 'remove a senha da conta (campo 2 vazio)']),
      explanation: `\`chage -d 0\` (ou \`passwd -e\`) zera a data da última troca → o usuário é obrigado a trocar a senha no próximo login. \`chage -E\` age sobre a expiração da **conta** (campo 8; \`-1\` remove, \`0\` expira já). \`chage -M 99999\` desliga o envelhecimento da senha. Para este comando: ${c.ok}.`,
      ref: ['102:p.185-187'], verify: { sh, expect: c.val },
    };
  },
};

// ------------------------------------------------------------------ bloquear/desbloquear
const gBloqueio = {
  id: 'usr-bloqueio-conta', obj: '107.1', nivel: 2, peso: 2,
  make(rng) {
    const login = rng.pick(USERS);
    const hash = `$6$${randStr(rng, 8)}$${randStr(rng, 22)}`;
    const lock = 'a senha fica bloqueada: o hash recebe um `!` no início (nada é apagado)';
    const op = rng.pick([
      { cmd: `passwd -l ${login}`, status: 'L', f2: `!${hash}`, txt: lock }, { cmd: `usermod -L ${login}`, status: 'L', f2: `!${hash}`, txt: lock },
      { cmd: `usermod --lock ${login}`, status: 'L', f2: `!${hash}`, txt: lock }, { cmd: `passwd -d ${login}`, status: 'NP', f2: '', txt: 'a senha é apagada (campo 2 vazio): a conta fica sem senha (NP)' },
    ]);
    const pre = [`${rmU(login)}; sudo useradd -M ${login} 2>/dev/null`, `sudo usermod -p ${sq(hash)} ${login}`, `sudo ${op.cmd} >/dev/null 2>&1`];
    if (rng.chance(0.5)) {
      return {
        type: 'unica',
        text: `A conta \`${login}\` tem senha válida (\`passwd -S ${login}\` mostra \`P\`). Depois de executar como root:\n\n${block(op.cmd)}\n\nque código o 2º campo de \`passwd -S ${login}\` passa a mostrar?`,
        options: mcq(rng, op.status, ['P', 'L', 'NP', 'E', 'D'].filter((x) => x !== op.status)),
        explanation: `Em \`passwd -S\` o 2º campo é o estado da senha: **P** = senha utilizável, **L** = bloqueada (hash começa com \`!\`), **NP** = sem senha. Neste caso ${op.txt}. Para reverter um bloqueio: \`passwd -u\` ou \`usermod -U\`.`,
        ref: ['102:p.185-186', '102:p.193'], verify: { sh: [...pre, `sudo passwd -S ${login} | cut -d' ' -f2`, `${rmU(login)}`].join('\n'), expect: op.status },
      };
    }
    const show = (v) => (v === '' ? '(campo vazio)' : v);
    return {
      type: 'unica',
      text: `A conta \`${login}\` tem, no 2º campo de \`/etc/shadow\`, o hash \`${hash}\`. Depois de executar como root:\n\n${block(op.cmd)}\n\nComo fica o 2º campo de \`/etc/shadow\` dessa conta?`,
      options: mcq(rng, show(op.f2), [`!${hash}`, '(campo vazio)', hash, '*', `!!${hash}`, `${hash}!`].filter((x) => x !== show(op.f2))),
      explanation: `Bloquear (\`passwd -l\`, \`usermod -L\`) apenas coloca um \`!\` na frente do hash — a senha antiga é preservada e volta com \`passwd -u\`/\`usermod -U\`. Já \`passwd -d\` **apaga** a senha (campo vazio = conta sem senha, status NP). Aqui ${op.txt}.`,
      ref: ['102:p.185-186', '102:p.198'], verify: { sh: [...pre, `sudo getent shadow ${login} | cut -d: -f2 | sed 's/^$/(campo vazio)/'`, `${rmU(login)}`].join('\n'), expect: show(op.f2) },
    };
  },
};

// ------------------------------------------------------------------ /etc/group
const gGroupFile = {
  id: 'usr-group-arquivo', obj: '107.1', nivel: 2, peso: 2,
  make(rng) {
    const login = rng.pick(USERS); const others = rng.sample(USERS.filter((u) => u !== login), 3);
    const gs = rng.sample(GROUPS, 4);
    const gid0 = rng.int(1100, 1400); const uid = rng.int(1500, 1999);
    const [prim, ...sec] = gs;
    const members = {
      [prim]: [others[2]],
      [sec[0]]: rng.shuffle([login, others[0]]),
      [sec[1]]: [others[1], others[2]],
      [sec[2]]: rng.shuffle(rng.chance(0.5) ? [others[0], login, others[2]] : [others[0], others[2]]),
    };
    const mine = sec.filter((g) => members[g].includes(login));
    const correct = [prim, ...mine].sort().join(', ');
    const groupLines = gs.map((g, i) => `${g}:x:${gid0 + i}:${members[g].join(',')}`);
    const passwdL = `${login}:x:${uid}:${gid0}:${FULLNAME[login]}:/home/${login}:/bin/bash`;
    const pool = [mine.sort().join(', '), [prim, ...sec].sort().join(', '), [prim, ...sec.filter((g) => !members[g].includes(login))].sort().join(', '), [prim, sec[0]].sort().join(', '), sec.filter((g) => !members[g].includes(login)).sort().join(', '), [prim, ...mine, sec.find((g) => !members[g].includes(login))].sort().join(', ')];
    const sh = [
      `for g in ${gs.join(' ')}; do sudo groupdel $g 2>/dev/null; done`,
      ...gs.map((g, i) => `sudo groupadd -g ${gid0 + i} ${g}`),
      `sudo useradd -M -u ${uid} -g ${prim} ${login} 2>/dev/null; for u in ${others.join(' ')}; do sudo useradd -M -g ${prim} $u 2>/dev/null; done`,
      ...gs.map((g) => `sudo gpasswd -M ${members[g].join(',')} ${g} >/dev/null`),
      `id -Gn ${login} | tr ' ' '\\n' | sort | paste -sd, - | sed 's/,/, /g'`,
      `for u in ${[login, ...others].join(' ')}; do sudo userdel $u 2>/dev/null; sudo groupdel $u 2>/dev/null; done; for g in ${gs.join(' ')}; do sudo groupdel $g 2>/dev/null; done`,
    ].join('\n');
    return {
      type: 'unica',
      text: `Trechos dos arquivos do sistema:\n\n${block(`/etc/passwd:\n${passwdL}\n\n/etc/group:\n${groupLines.join('\n')}`)}\n\nA que grupos \`${login}\` pertence (grupo primário + secundários)?`,
      options: mcq(rng, correct, pool.filter((x) => x && x !== correct)),
      explanation: `O **grupo primário** vem do 4º campo de /etc/passwd (GID ${gid0} = \`${prim}\`) e **não precisa** estar na lista de membros de /etc/group (4º campo). Os secundários são os grupos cuja lista contém \`${login}\`: ${mine.length ? mine.join(', ') : 'nenhum'}. Total: ${correct}.`,
      ref: ['102:p.197-198', '102:p.199-200'], verify: { sh, expect: correct },
    };
  },
};

// ------------------------------------------------------------------ userdel / groupdel
const gUserdel = {
  id: 'usr-userdel-efeitos', obj: '107.1', nivel: 2, peso: 1,
  make(rng) {
    const login = rng.pick(USERS);
    const g = rng.pick(GROUPS);
    if (rng.chance(0.55)) {
      const withR = rng.chance(0.5);
      const cmd = withR ? `userdel -r ${login}` : `userdel ${login}`;
      const home = `/home/${login}`;
      const sh = [`${rmU(login)}; sudo useradd -m ${login} 2>/dev/null`, `sudo ${cmd} 2>/dev/null`, `echo "passwd=$(getent passwd ${login} | wc -l) grupo=$(getent group ${login} | wc -l) home=$([ -d ${home} ] && echo existe || echo removido)"`, `sudo rm -rf ${home}`].join('\n');
      const correct = withR ? `A conta e o grupo privado \`${login}\` somem e o diretório \`${home}\` é removido` : `A conta e o grupo privado \`${login}\` somem, mas o diretório \`${home}\` e seus arquivos permanecem`;
      return {
        type: 'unica',
        text: `A conta \`${login}\` foi criada com \`useradd -m ${login}\` (com \`USERGROUPS_ENAB yes\`). O que acontece após executar, como root:\n\n${block(cmd)}`,
        options: mcq(rng, correct, [
          withR ? `A conta some, mas o diretório \`${home}\` permanece` : `O diretório \`${home}\` também é removido`,
          'Somente a senha é apagada; a conta continua existindo',
          withR ? 'O comando falha porque o usuário possui arquivos' : `A conta some, mas o grupo \`${login}\` continua existindo`,
          'A conta é apenas bloqueada (`!` no hash) e o home é preservado',
        ]),
        explanation: `\`userdel\` remove a conta de /etc/passwd e /etc/shadow e, com USERGROUPS_ENAB, o grupo privado. **Sem \`-r\`** o diretório home e o spool de e-mail ficam no disco; **com \`-r\`** eles também são removidos. Arquivos do usuário em outros lugares precisam ser procurados e apagados manualmente (por exemplo com \`find / -user UID\`).`,
        ref: ['102:p.183'], verify: { sh, expect: withR ? 'passwd=0 grupo=0 home=removido' : 'passwd=0 grupo=0 home=existe' },
      };
    }
    const primary = rng.chance(0.5);
    const sh = [`${rmU(login)}; sudo groupdel ${g} 2>/dev/null`, `sudo groupadd ${g}`, primary ? `sudo useradd -M -g ${g} ${login}` : `sudo useradd -M ${login}; sudo usermod -aG ${g} ${login}`, `sudo groupdel ${g} >/dev/null 2>&1; echo $?`, `${rmU(login)}; sudo groupdel ${g} 2>/dev/null`].join('\n');
    return {
      type: 'unica',
      text: `O grupo \`${g}\` existe e ${primary ? `é o **grupo primário** de \`${login}\`` : `tem \`${login}\` apenas como membro **secundário**`}. O que acontece com \`groupdel ${g}\` (como root)?`,
      options: mcq(rng, primary ? 'Falha: não é possível remover o grupo primário de um usuário existente' : 'O grupo é removido; a conta continua existindo e só deixa de pertencer a ele', [
        primary ? 'O grupo é removido e a conta passa a usar o grupo `users`' : 'Falha: o grupo ainda possui membros',
        primary ? 'O grupo é removido junto com a conta do usuário' : 'O grupo e a conta do membro são removidos',
        'Os arquivos pertencentes ao grupo são apagados junto com ele',
        primary ? 'O grupo é removido e o usuário fica sem grupo primário' : 'Os arquivos do grupo passam automaticamente para o grupo primário do dono',
      ]),
      explanation: `\`groupdel\` não remove um grupo que seja o **grupo primário** de algum usuário: é preciso remover o usuário (ou trocar seu grupo primário) antes. Se o grupo só tem membros secundários, ele é removido sem problemas. Em qualquer caso, os arquivos que pertenciam ao grupo continuam no disco, agora com um GID numérico "órfão".`,
      ref: ['102:p.183-184'], verify: { sh, expect: primary ? '8' : '0' },
    };
  },
};

export const generators = [gPasswd, gShadow, gUseradd, gGrupos, gChage, gBloqueio, gGroupFile, gUserdel];
