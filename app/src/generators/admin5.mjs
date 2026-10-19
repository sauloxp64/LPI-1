// 110.1 — tarefas administrativas de segurança: SUID/SGID (find), senhas e expiração (passwd/chage), portas (netstat/ss/lsof/fuser/nmap),
// limites (ulimit), usuários conectados (who/w/last) e sudo.
import { mcq, multi, block, pad } from './util.mjs';
import { sq, USERS, toDays, isoDays, chageDays, listPt, rmU } from './admin-lib.mjs';

// ------------------------------------------------------------------ find -perm (verificado com o find real)
const symMode = (m) => {
  let s = '';
  for (let i = 0; i < 3; i++) {
    const b = (m >> (6 - 3 * i)) & 7; let x = b & 1 ? 'x' : '-';
    if (i === 0 && m & 0o4000) x = b & 1 ? 's' : 'S';
    if (i === 1 && m & 0o2000) x = b & 1 ? 's' : 'S';
    if (i === 2 && m & 0o1000) x = b & 1 ? 't' : 'T';
    s += (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + x;
  }
  return s;
};
const oct4 = (m) => m.toString(8).padStart(4, '0');
/** máscara de um modo simbólico do find (ex.: "u+s,g+s", "u=s") a partir de 0 */
function symMask(spec) {
  let mask = 0;
  for (const cl of spec.split(',')) {
    const m = /^([ugoa]*)([=+-])([rwxst]*)$/.exec(cl);
    if (!m) throw new Error(`modo simbólico inválido: ${cl}`);
    const who = m[1] || 'a'; const perms = m[3];
    for (const w of who === 'a' ? 'ugo' : who) {
      const sh = { u: 6, g: 3, o: 0 }[w];
      for (const p of perms) {
        if (p === 'r') mask |= 4 << sh; if (p === 'w') mask |= 2 << sh; if (p === 'x') mask |= 1 << sh;
        if (p === 's' && w === 'u') mask |= 0o4000; if (p === 's' && w === 'g') mask |= 0o2000; if (p === 't') mask |= 0o1000;
      }
    }
  }
  return mask;
}
/** avalia `-perm SPEC` num modo */
function permMatch(spec, mode) {
  const kind = spec[0] === '-' ? '-' : spec[0] === '/' ? '/' : '';
  const body = kind ? spec.slice(1) : spec;
  const mask = /^[0-7]+$/.test(body) ? parseInt(body, 8) : symMask(body);
  const m = mode & 0o7777;
  if (kind === '-') return (m & mask) === mask;
  if (kind === '/') return mask === 0 ? true : (m & mask) !== 0;
  return m === mask;
}
const TEST_MODES = [0o644, 0o755, 0o4755, 0o2755, 0o6755, 0o1755, 0o4644, 0o2644, 0o4000, 0o2000, 0o6000, 0o4711, 0o0, 0o6644, 0o2755];
const FNAMES = ['sudo', 'mount', 'passwd', 'wall', 'crontab', 'chage', 'backup.sh', 'relatorio.txt', 'ssh-agent', 'newgrp', 'script.sh', 'dados.csv', 'expiry', 'umount', 'agenda.ods'];
const findVerify = (spec, files) => ({
  sh: `d=$(mktemp -d)\n${files.map((f) => `touch "$d/${f.name}"; chmod ${oct4(f.mode)} "$d/${f.name}"`).join('\n')}\nfind "$d" -type f -perm ${spec} -printf '%f\\n' | sort | paste -sd' ' -\nrm -rf "$d"`,
  expect: files.filter((f) => permMatch(spec, f.mode)).map((f) => f.name).sort().join(' '),
});

const EQUIV = {
  suid: ['-4000', '-u+s', '-u=s', '/4000', '/u+s', '-perm-u=s'], sgid: ['-2000', '-g+s', '-g=s', '/2000', '/g+s'], ou: ['/6000', '/u+s,g+s', '/u=s,g=s'], ambos: ['-6000', '-u+s,g+s', '-u=s,g=s'], exato: ['4000'], stk: ['-1000', '-o+t'],
};
const REQ = {
  suid: ['têm o bit **SUID** ligado (independentemente das demais permissões)', (m) => !!(m & 0o4000)],
  sgid: ['têm o bit **SGID** ligado (independentemente das demais permissões)', (m) => !!(m & 0o2000)],
  ou: ['têm **SUID ou SGID** (pelo menos um dos dois)', (m) => !!(m & 0o6000)],
  ambos: ['têm **SUID e SGID ao mesmo tempo**', (m) => (m & 0o6000) === 0o6000],
  exato: ['têm **exatamente** o modo 4000 (SUID e nenhuma outra permissão)', (m) => (m & 0o7777) === 0o4000],
};
const SPECS_ALL = ['4000', '-4000', '/4000', '2000', '-2000', '/2000', '6000', '-6000', '/6000', '-u+s', '/u+s,g+s', '-u+s,g+s', '-g+s', '-u=s', '/u=s,g=s', '755', '-755', '/111', '-4755', '-o+t', '/6755'];
const vec = (spec) => TEST_MODES.map((m) => (permMatch(spec, m) ? 1 : 0)).join('');

const gFind = {
  id: 'sec-find-perm', obj: '110.1', nivel: 3, peso: 3,
  make(rng) {
    const dir = rng.pick(['/usr/bin', '/opt/app', '/usr/local/bin', '/home', '/srv']);
    if (rng.chance(0.55)) {
      // listar arquivos que o comando mostra
      for (let g = 0; g < 80; g++) {
        const spec = rng.pick(SPECS_ALL);
        const names = rng.sample(FNAMES, 5);
        const modes = names.map(() => rng.pick([0o755, 0o644, 0o4755, 0o2755, 0o6755, 0o4644, 0o4000, 0o2000, 0o6000, 0o1755, 0o2644, 0o711, 0o4711]));
        const files = names.map((name, i) => ({ name, mode: modes[i] }));
        const hit = files.filter((f) => permMatch(spec, f.mode));
        if (hit.length < 2 || hit.length > 3) continue;
        return {
          type: 'multipla',
          text: `No diretório \`${dir}\` existem os arquivos regulares abaixo (saída de \`ls -l\`, só as permissões e o nome):\n\n${block(files.map((f) => `-${symMode(f.mode)}  ${f.name}`).join('\n'))}\n\nQuais arquivos são listados por \`find ${dir} -type f -perm ${spec}\`?`,
          options: files.map((f) => ({ t: f.name, ok: permMatch(spec, f.mode) })),
          explanation: `\`-perm\` tem três formas: **sem prefixo** exige o modo **exatamente igual**; **\`-modo\`** exige que **todos** os bits indicados estejam ligados (os demais não importam); **\`/modo\`** exige que **qualquer um** dos bits esteja ligado. Aqui \`-perm ${spec}\` casa com: ${hit.map((f) => `${f.name} (${oct4(f.mode)})`).join(', ')}. Bits especiais: SUID = 4000 (\`u+s\`), SGID = 2000 (\`g+s\`), sticky = 1000 (\`+t\`).`,
          ref: ['102:p.502-504'], verify: findVerify(spec, files),
        };
      }
    }
    const key = rng.pick(Object.keys(REQ));
    const [desc, pred] = REQ[key];
    const okSpec = rng.pick(EQUIV[key].filter((e) => !e.startsWith('-perm')));
    const okVec = TEST_MODES.map((m) => (pred(m) ? 1 : 0)).join('');
    if (vec(okSpec) !== okVec) throw new Error(`equivalente inválido ${okSpec}`);
    const wrong = rng.shuffle(SPECS_ALL).filter((s) => vec(s) !== okVec && s !== okSpec).slice(0, 3);
    const files = TEST_MODES.map((mode, i) => ({ name: `f${i}`, mode }));
    return {
      type: 'unica',
      text: `Qual comando procura em \`${dir}\` os arquivos regulares que ${desc}?`,
      options: [okSpec, ...wrong].map((s) => ({ t: `find ${dir} -type f -perm ${s}`, ok: s === okSpec })),
      explanation: `Em \`find -perm\`: \`modo\` = igual a; \`-modo\` = **todos** os bits ligados; \`/modo\` = **algum** bit ligado. SUID = 4000, SGID = 2000, ambos = 6000. Para "${desc.replace(/\*\*/g, '')}" use \`-perm ${okSpec}\`. Atenção: \`-perm 4000\` (sem prefixo) só acha arquivos cujo modo é *exatamente* 4000 e \`-perm /6000\` acha SUID **ou** SGID, enquanto \`-perm -6000\` exige **os dois**.`,
      ref: ['102:p.502-504'], verify: findVerify(okSpec, files),
    };
  },
};

// ------------------------------------------------------------------ ulimit (verificado com o bash real)
const UL_RES = { f: ['tamanho máximo de arquivo (blocos)', 'file size'], t: ['tempo de CPU (segundos)', 'cpu time'] };
function ulSim(cmds) {
  let S = Infinity; let H = Infinity; const errs = [];
  for (const c of cmds) {
    const n = c.n;
    if (c.mode === 'both') { if (n > H) errs.push('Operation not permitted'); else { S = n; H = n; } }
    else if (c.mode === 'S') { if (n > H) errs.push('Invalid argument'); else S = n; }
    else if (n > H) errs.push('Operation not permitted'); else if (n < S) errs.push('Invalid argument'); else H = n;
  }
  return { S, H, errs };
}
const ulText = (r, c) => (c.mode === 'both' ? `ulimit -${r} ${c.n}` : `ulimit -${c.mode}${r} ${c.n}`);
const fmtU = (x) => (x === Infinity ? 'unlimited' : String(x));
const gUlimit = {
  id: 'sec-ulimit-soft-hard', obj: '110.1', nivel: 3, peso: 3,
  make(rng) {
    const r = rng.pick(Object.keys(UL_RES));
    for (let g = 0; g < 100; g++) {
      const k = rng.int(2, 4); const cmds = [];
      for (let i = 0; i < k; i++) cmds.push({ mode: rng.pick(['both', 'S', 'H', 'S']), n: rng.pick([100, 200, 300, 500, 800, 1000, 1500, 2000]) });
      const res = ulSim(cmds);
      if (res.errs.length === 0 && rng.chance(0.7)) continue; // prefere cenários com ao menos um erro
      const right = `soft=${fmtU(res.S)} hard=${fmtU(res.H)}`;
      // erros típicos de interpretação
      const naive = (() => { let S = Infinity; let H = Infinity; for (const c of cmds) { if (c.mode === 'both') { S = c.n; H = c.n; } else if (c.mode === 'S') S = c.n; else H = c.n; } return `soft=${fmtU(S)} hard=${fmtU(H)}`; })();
      const onlySoft = (() => { let S = Infinity; let H = Infinity; for (const c of cmds) { if (c.mode === 'H') H = c.n; else { S = c.n; } } return `soft=${fmtU(S)} hard=${fmtU(H)}`; })();
      const pool = [naive, onlySoft, `soft=${fmtU(res.H)} hard=${fmtU(res.S)}`, `soft=unlimited hard=unlimited`, `soft=${fmtU(res.S)} hard=unlimited`, `soft=unlimited hard=${fmtU(res.H)}`, `soft=${cmds[cmds.length - 1].n} hard=${fmtU(res.H)}`].filter((x) => x !== right);
      if ([...new Set(pool)].length < 3) continue;
      const seq = cmds.map((c) => ulText(r, c)).join('\n');
      const sh = `bash -c ${sq(`${cmds.map((c) => `${ulText(r, c)} 2>/dev/null`).join('; ')}; echo "soft=$(ulimit -S${r}) hard=$(ulimit -H${r})"`)}`;
      return {
        type: 'unica',
        text: `Em uma sessão de usuário **comum** (não root) do bash, o limite de ${UL_RES[r][0]} está inicialmente **ilimitado** (soft e hard). Os comandos abaixo são executados em sequência, na mesma sessão (comandos que derem erro não alteram nada):\n\n${block(seq)}\n\nQuais serão os valores finais de \`ulimit -S${r}\` (soft) e \`ulimit -H${r}\` (hard)?`,
        options: mcq(rng, right, [...new Set(pool)]),
        explanation: `Regras do \`ulimit\` para usuário comum: **sem -S/-H** altera os dois limites; **-S** altera só o limite *soft* (pode subir até o *hard*, nunca acima: senão "Invalid argument"); **-H** altera só o *hard* (usuário comum só pode **diminuir**; aumentar dá "Operation not permitted", e baixar o hard abaixo do soft atual dá "Invalid argument"). Sem opção de leitura, \`ulimit -${r}\` mostra o soft. Passo a passo: ${(() => { let S = Infinity; let H = Infinity; return cmds.map((c) => { const before = ulSim(cmds.slice(0, cmds.indexOf(c))); S = before.S; H = before.H; const after = ulSim(cmds.slice(0, cmds.indexOf(c) + 1)); const bad = after.errs.length > before.errs.length; return `\`${ulText(r, c)}\` → ${bad ? `erro (${after.errs[after.errs.length - 1]}), nada muda` : `soft=${fmtU(after.S)}, hard=${fmtU(after.H)}`}`; }).join('; '); })()}. Valores persistentes por usuário ficam em /etc/security/limits.conf.`,
        ref: ['102:p.514-517'], verify: { sh, expect: right },
      };
    }
    throw new Error('sem cenário');
  },
};

// ------------------------------------------------------------------ passwd -S / chage -l (verificado)
const gSenhaExp = {
  id: 'sec-senha-validade', obj: '110.1', nivel: 2, peso: 3,
  make(rng) {
    const login = rng.pick(USERS);
    const last = toDays(2026, rng.int(1, 9), rng.int(1, 28));
    const s = { min: rng.pick([0, 1, 2, 7]), max: rng.pick([30, 45, 60, 90, 120]), warn: rng.pick([5, 7, 14]), inact: rng.chance(0.7) ? rng.pick([3, 5, 7, 10, 30]) : null };
    const verifyBase = [`${rmU(login)}; sudo useradd -M ${login} 2>/dev/null`, `sudo usermod -p '$6$abc$def' ${login}`, `sudo chage -d ${last} -m ${s.min} -M ${s.max} -W ${s.warn} -I ${s.inact ?? -1} ${login}`];
    const fmt = rng.pick(['passwd-S', 'chage-data', 'comando', 'comando']);
    const ref = ['102:p.504-507'];
    if (fmt === 'passwd-S') {
      const line = `${login} P ${isoDays(last)} ${s.min} ${s.max} ${s.warn} ${s.inact ?? -1}`;
      const asks = [['o prazo **máximo** (em dias) de validade da senha', s.max], ['o número **mínimo** de dias entre duas trocas de senha', s.min], ['o número de dias de **aviso** antes da expiração', s.warn]];
      if (s.inact != null) asks.push(['o período de **inatividade** (dias após a expiração até a conta ser bloqueada)', s.inact]);
      const [what, val] = rng.pick(asks);
      const others = [s.min, s.max, s.warn, s.inact ?? -1, 99999].filter((x) => x !== val);
      return {
        type: 'unica',
        text: `A saída de \`passwd -S ${login}\` é:\n\n${block(line)}\n\nQual valor representa ${what}?`,
        options: mcq(rng, String(val), [...new Set(others)].map(String).concat(['0', '7', '14', '60'].filter((x) => Number(x) !== val))),
        explanation: `\`passwd -S\` mostra, em ordem: **login**, **estado** (P = senha válida, L = bloqueada, NP = sem senha), **data da última troca**, **idade mínima**, **idade máxima**, **período de aviso** e **período de inatividade** (-1 = desativado). Para esta linha: mínimo ${s.min}, máximo ${s.max}, aviso ${s.warn}, inatividade ${s.inact ?? -1}. O valor pedido é **${val}**. (\`passwd -S\` equivale a \`chage -l\` em formato compacto.)`,
        ref, verify: { sh: [...verifyBase, `sudo passwd -S ${login}`, rmU(login)].join('\n'), expect: line },
      };
    }
    if (fmt === 'chage-data') {
      const exp = last + s.max; const inactDate = s.inact != null ? exp + s.inact : null;
      const wantInact = inactDate != null && rng.chance(0.4);
      const tab = (k, v) => k.padEnd(52) + ': ' + v;
      const shown = [tab('Last password change', chageDays(last)), tab('Password expires', wantInact ? chageDays(exp) : '???'), tab('Password inactive', wantInact ? '???' : (s.inact != null ? chageDays(inactDate) : 'never')), tab('Account expires', 'never'), tab('Minimum number of days between password change', s.min), tab('Maximum number of days between password change', s.max), tab('Number of days of warning before password expires', s.warn)].join('\n');
      const target = wantInact ? inactDate : exp;
      const pool = wantInact ? [exp, exp + s.warn, last + s.inact, inactDate + 1, inactDate - 1, last + s.max - s.warn] : [last + s.min, last + s.max - s.warn, last + s.max + 1, last + s.max - 1, last + s.max + (s.inact ?? s.warn), last + s.max + s.warn];
      const key = wantInact ? 'Password inactive' : 'Password expires';
      return {
        type: 'unica',
        text: `Parte da saída de \`chage -l ${login}\` (uma das datas foi trocada por \`???\`${wantInact ? `; a conta foi configurada com \`chage -I ${s.inact}\`` : ''}):

${block(shown)}

Que data deve aparecer no lugar de \`???\`, na linha **"${wantInact ? 'Password inactive' : 'Password expires'}"**? (formato AAAA-MM-DD)`,
        options: mcq(rng, isoDays(target), pool.filter((x) => x !== target).map(isoDays)),
        explanation: `"Password expires" = última troca + idade máxima = ${chageDays(last)} + ${s.max} dias = **${chageDays(exp)}**. ${s.inact != null ? `"Password inactive" = data de expiração + período de inatividade = ${chageDays(exp)} + ${s.inact} dias = **${chageDays(inactDate)}** (depois dela a conta é bloqueada).` : 'Sem período de inatividade, o campo "Password inactive" mostra "never".'}`,
        ref, verify: { sh: [...verifyBase, `sudo chage -l ${login} | grep -E '${key}' | sed 's/.*: //'`, rmU(login)].join('\n'), expect: chageDays(target) },
      };
    }
    // comando
    const days = toDays(rng.int(2027, 2030), rng.int(1, 12), rng.int(1, 28));
    const N = rng.pick([30, 45, 60, 90, 120]); const M = rng.pick([1, 2, 7]); const W = rng.pick([7, 10, 14]);
    const items = [
      { d: `a senha de \`${login}\` seja válida por no máximo **${N} dias**`, ok: `chage -M ${N} ${login}`, alt: `passwd -x ${N} ${login}`, wrong: [`chage -m ${N} ${login}`, `chage -W ${N} ${login}`, `chage -I ${N} ${login}`], field: 5, val: String(N) },
      { d: `o usuário \`${login}\` só possa trocar a senha depois de **${M} dia(s)** da última troca`, ok: `chage -m ${M} ${login}`, alt: `passwd -n ${M} ${login}`, wrong: [`chage -M ${M} ${login}`, `chage -W ${M} ${login}`, `chage -d ${M} ${login}`], field: 4, val: String(M) },
      { d: `o usuário \`${login}\` seja **avisado ${W} dias** antes de a senha expirar`, ok: `chage -W ${W} ${login}`, alt: `passwd -w ${W} ${login}`, wrong: [`chage -M ${W} ${login}`, `chage -I ${W} ${login}`, `chage -m ${W} ${login}`], field: 6, val: String(W) },
      { d: `a **conta** de \`${login}\` expire em ${isoDays(days)}`, ok: `chage -E ${isoDays(days)} ${login}`, alt: `usermod -e ${isoDays(days)} ${login}`, wrong: [`chage -I ${isoDays(days)} ${login}`, `chage -d ${isoDays(days)} ${login}`, `passwd -x ${isoDays(days)} ${login}`], field: 8, val: String(days) },
      { d: `o usuário \`${login}\` seja **obrigado a trocar a senha no próximo login**`, ok: `chage -d 0 ${login}`, alt: `passwd -e ${login}`, wrong: [`chage -E 0 ${login}`, `chage -M 0 ${login}`, `passwd -l ${login}`], field: 3, val: '0' },
    ];
    const it = rng.pick(items);
    const useAlt = rng.chance(0.3);
    const right = useAlt ? it.alt : it.ok;
    const wrongs = useAlt ? [it.ok.startsWith('chage') && it.alt.startsWith('passwd') ? it.wrong[0] : it.wrong[0], ...it.wrong.slice(1)] : it.wrong;
    return {
      type: 'unica',
      text: `Qual comando, executado como root, faz com que ${it.d}?`,
      options: mcq(rng, right, wrongs.filter((w) => w !== right)),
      explanation: `chage: \`-m\` mínimo, \`-M\` máximo, \`-W\` aviso, \`-I\` inatividade, \`-E\` expiração da conta, \`-d\` data da última troca (\`-d 0\` força a troca no próximo login), \`-l\` lista. Equivalentes: \`passwd -n/-x/-w/-i\` ≡ \`chage -m/-M/-W/-I\`; \`passwd -e\` ≡ \`chage -d 0\`; \`usermod -e\` ≡ \`chage -E\`. Resposta: \`${it.ok}\` (ou \`${it.alt}\`).`,
      ref, verify: { sh: [...verifyBase.slice(0, 2), `sudo ${right} >/dev/null 2>&1`, `sudo getent shadow ${login} | cut -d: -f${it.field}`, rmU(login)].join('\n'), expect: it.val },
    };
  },
};

// ------------------------------------------------------------------ portas: netstat/ss/lsof/fuser (verificado com sockets reais)
const NET_FLAGS = (cmd) => {
  const m = /^(netstat|ss) -([a-z]+)$/.exec(cmd); if (!m) return null; const f = new Set(m[2]);
  const anyProto = f.has('t') || f.has('u');
  const all = f.has('l') || f.has('a');
  const tcp = (f.has('t') || !anyProto) && all; const udp = (f.has('u') || !anyProto) && all;
  return { tcp, udp, prog: f.has('p'), listenOnly: f.has('l') };
};
const NETSTAT_OPTS = ['netstat -l', 'netstat -lt', 'netstat -lu', 'netstat -ltu', 'netstat -ltp', 'netstat -lup', 'netstat -t', 'netstat -tn', 'netstat -a', 'netstat -lntp', 'netstat -ltnp', 'ss -lt', 'ss -lu', 'ss -ltu', 'ss -ltp', 'ss -ltnp', 'ss -lntp', 'ss -t', 'ss -a', 'ss -lup'];
const cap = (c) => NET_FLAGS(c);
const gPortas = {
  id: 'sec-portas-comando', obj: '110.1', nivel: 2, peso: 3,
  make(rng) {
    const fmt = rng.pick(['flags', 'flags', 'ferramenta']);
    const ref = ['102:p.507-512'];
    if (fmt === 'ferramenta') {
      const items = [
        ['Qual comando mostra **quais processos** estão com a porta TCP 80 aberta, usando a notação de namespace?', 'fuser -vn tcp 80', ['lsof -p 80', 'netstat -s 80', 'fuser -u 80/udp -l', 'nmap -p 80 -sP'], ''],
        ['Qual comando lista os **arquivos de rede** (sockets) abertos para o endereço 192.168.1.55 na porta 22?', 'lsof -i@192.168.1.55:22', ['lsof -p 192.168.1.55:22', 'fuser 192.168.1.55:22', 'netstat -i 192.168.1.55:22', 'lsof -f 192.168.1.55 22'], ''],
        ['Qual comando lista todos os **sockets UDP em escuta** da máquina?', 'netstat -lu', ['netstat -lt', 'netstat -u', 'netstat -s', 'netstat -i'], 'netstat-lu'],
        ['Qual comando varre as portas 80 a 443 do host 192.168.1.55?', 'nmap -p 80-443 192.168.1.55', ['nmap -F 80-443 192.168.1.55', 'nmap 192.168.1.55 --ports 80:443', 'nmap -p 80,443 192.168.1.55', 'nmap -sn 80-443 192.168.1.55'], ''],
        ['Qual comando varre apenas as **100 portas mais comuns** de um host?', 'nmap -F host', ['nmap -p 100 host', 'nmap -v host', 'nmap -sL host', 'nmap -p- host'], ''],
        ['Qual comando mostra a lista de processos que usam o diretório atual e o tipo de acesso (coluna ACCESS)?', 'fuser -v .', ['lsof -i .', 'netstat -p .', 'fuser -k .', 'ls -l /proc/.'], ''],
        ['Qual comando lista **todos** os arquivos abertos que sejam sockets de rede (IPv4 e IPv6)?', 'lsof -i', ['lsof -n', 'lsof -p', 'lsof -l', 'netstat -o'], ''],
        ['Qual opção do `fuser` **encerra** (mata) os processos que usam a porta TCP 8080?', 'fuser -k 8080/tcp', ['fuser -v 8080/tcp', 'fuser -n 8080/tcp', 'fuser -u 8080/tcp', 'fuser -m 8080/tcp'], ''],
        ['Qual comando varre a rede 192.168.1.0/24, excluindo o host 192.168.1.7?', 'nmap 192.168.1.0/24 --exclude 192.168.1.7', ['nmap 192.168.1.0/24 -x 192.168.1.7', 'nmap 192.168.1.0/24 !192.168.1.7', 'nmap 192.168.1.0/24 --skip 192.168.1.7', 'nmap 192.168.1.0-24 --exclude 192.168.1.7'], ''],
      ];
      const f = rng.pick(items);
      const out = { type: 'unica', text: f[0], options: mcq(rng, f[1], f[2]), explanation: `Ferramentas: \`lsof -i[@host][:porta]\` (arquivos de rede abertos), \`fuser -vn tcp PORTA\` (quem usa a porta; \`-k\` mata), \`netstat -l[t|u][n][p]\` (sockets em escuta, \`-n\` numérico, \`-p\` PID/programa) e \`nmap\` (varredura de portas: \`-p\`, \`-F\`, \`--exclude\`). Resposta: \`${f[1]}\`.`, ref };
      if (f[3] === 'netstat-lu') out.verify = { sh: "python3 -c \"import socket,time; u=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); u.bind(('0.0.0.0',5060)); time.sleep(3)\" &\nsleep 0.5; netstat -lu | grep -c ':5060 '; kill $!", expect: '1' };
      return out;
    }
    // flags: requisitos -> comando
    for (let g = 0; g < 100; g++) {
      const wantTcp = rng.chance(0.6); const wantUdp = !wantTcp || rng.chance(0.3); const wantProg = rng.chance(0.5); const wantListen = rng.chance(0.75);
      const tool = rng.pick(['netstat', 'ss']);
      const pool = NETSTAT_OPTS.filter((c) => c.startsWith(tool));
      const sat = (c) => { const k = cap(c); return k && k.tcp === wantTcp && k.udp === wantUdp && k.prog === wantProg && (!wantListen || k.listenOnly); };
      const good = pool.filter(sat); const bad = pool.filter((c) => !sat(c));
      if (!good.length || bad.length < 3) continue;
      const okCmd = rng.pick(good);
      const req = [wantListen ? 'sockets **em escuta** (LISTEN)' : 'sockets (escutando ou conectados)', `${wantTcp && wantUdp ? 'TCP e UDP' : wantTcp ? 'somente TCP' : 'somente UDP'}`, wantProg ? 'mostrando o **PID/nome do programa** dono de cada socket' : 'sem a coluna de programa'].join(', ');
      const opts = [okCmd, ...rng.sample(bad, 3)];
      const runCheck = (c) => `${c} 2>/dev/null | awk '/:8080 /{t=1} /:5060 /{u=1} /python3/{p=1} END{print t+0, u+0, p+0}'`;
      const sh = `python3 - <<'PY' &\nimport socket, time\na = socket.socket(); a.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); a.bind(('0.0.0.0', 8080)); a.listen(5)\nu = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); u.bind(('0.0.0.0', 5060))\ntime.sleep(8)\nPY\npp=$!\nfor i in $(seq 1 60); do ss -ltn 2>/dev/null | grep -q ':8080 ' && break; sleep 0.05; done\n${opts.map(runCheck).join('\n')}\nkill $pp 2>/dev/null`;
      const expect = opts.map((c) => { const k = cap(c); return `${k.tcp ? 1 : 0} ${k.udp ? 1 : 0} ${k.prog ? 1 : 0}`; }).join('\n');
      return {
        type: 'unica',
        text: `Qual comando lista ${req}?`,
        options: opts.map((c) => ({ t: c, ok: c === okCmd })),
        explanation: `Opções comuns (netstat e ss): \`-l\` apenas sockets em escuta, \`-a\` todos, \`-t\` TCP, \`-u\` UDP, \`-n\` números (sem resolver nomes), \`-p\` mostra PID/programa (para processos de outros usuários exige root). Sem \`-l\`/\`-a\`, só aparecem conexões estabelecidas. \`-t\` e \`-u\` juntos mostram TCP+UDP; sem nenhum dos dois, netstat mostra todos os protocolos. Resposta: \`${okCmd}\`.`,
        ref, verify: { sh, expect },
      };
    }
    throw new Error('sem cenário de portas');
  },
};

// ------------------------------------------------------------------ nmap (verificado com listeners reais e -sL)
const gNmap = {
  id: 'sec-nmap-varredura', obj: '110.1', nivel: 2, peso: 2,
  make(rng) {
    const fmt = rng.pick(['alvos', 'alvos', 'ocultas']);
    const ref = ['102:p.512-514'];
    if (fmt === 'alvos') {
      const a = rng.int(1, 200);
      const kinds = [
        () => { const lo = rng.int(2, 30); const hi = lo + rng.int(5, 40); return { spec: `192.168.${a % 200}.${lo}-${hi}`, n: hi - lo + 1, ex: false, how: `o intervalo ${lo}-${hi} tem ${hi}-${lo}+1 = ${hi - lo + 1} endereços` }; },
        () => ({ spec: `10.0.${a % 200}.0/24`, n: 256, how: 'uma rede /24 tem 2^8 = 256 endereços' }),
        () => ({ spec: `172.16.${a % 200}.0/28`, n: 16, how: 'uma rede /28 tem 2^4 = 16 endereços' }),
        () => ({ spec: `192.168.${a % 200}.*`, n: 256, how: 'o curinga * no último octeto cobre 0-255, ou seja, 256 endereços' }),
        () => ({ spec: `192.168.${a % 200}.0/30`, n: 4, how: 'uma rede /30 tem 2^2 = 4 endereços' }),
      ];
      const k = rng.pick(kinds)();
      const ex = rng.chance(0.4); const base = k.spec.replace(/\.(\*|0\/\d+|\d+-\d+)$/, '');
      const n = k.n - (ex ? 1 : 0);
      const cmd = `nmap ${k.spec}${ex ? ` --exclude ${base}.${k.spec.includes('-') ? k.spec.split('.').pop().split('-')[0] : 1}` : ''}`;
      const sh = `nmap -sL -n ${k.spec.includes('*') ? sq(k.spec) : k.spec}${ex ? ` --exclude ${base}.${k.spec.includes('-') ? k.spec.split('.').pop().split('-')[0] : 1}` : ''} 2>&1 | grep -o '[0-9]* IP addresses' | cut -d' ' -f1`;
      return {
        type: 'unica',
        text: `Quantos endereços IP o comando abaixo vai varrer (considere \`-sL\`, que apenas lista os alvos)?\n\n${block(cmd)}`,
        options: mcq(rng, String(n), [n + 1, n - 1, n * 2, Math.floor(n / 2), 255, 254, 253, 24].filter((x) => x !== n && x > 0).map(String)),
        explanation: `${k.how[0].toUpperCase() + k.how.slice(1)}.${ex ? ' O `--exclude` retira 1 endereço da lista.' : ''} Total: **${n}**. O nmap aceita um host, vários hosts separados por espaço, intervalos com traço (\`192.168.1.3-20\`), curingas (\`192.168.1.*\`) e CIDR (\`192.168.1.0/24\`); \`--exclude\` tira alvos.`,
        ref, verify: { sh, expect: String(n) },
      };
    }
    // ocultas: "Not shown: N closed tcp ports"
    const lo = rng.pick([1200, 1500, 2000, 3000, 8100, 9000]); const size = rng.int(40, 120); const hi = lo + size - 1;
    const nOpen = rng.int(1, 3);
    const ports = rng.sample(Array.from({ length: size }, (_, x) => lo + x), nOpen).sort((x, y) => x - y);
    const rlo = lo; const rhi = hi;
    const closed = size - ports.length;
    const tbl = ports.map((p) => `${p}/tcp open  unknown`).join('\n');
    const listen = ports.map((p) => `a${p} = socket.socket(); a${p}.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); a${p}.bind(('127.0.0.1', ${p})); a${p}.listen(5)`).join('\n');
    const sh = `python3 - <<'PY' &\nimport socket, time\n${listen}\ntime.sleep(8)\nPY\npp=$!\nfor i in $(seq 1 60); do (echo > /dev/tcp/127.0.0.1/${ports[0]}) 2>/dev/null && break; sleep 0.05; done\nnmap -p ${rlo}-${rhi} 127.0.0.1 | grep -o 'Not shown: [0-9]*' | cut -d' ' -f3\nkill $pp 2>/dev/null`;
    return {
      type: 'unica',
      text: `Em um host, ${nOpen === 1 ? `a única porta TCP aberta no intervalo ${rlo}-${rhi} é a ${ports[0]}` : `as únicas portas TCP abertas no intervalo ${rlo}-${rhi} são ${ports.join(', ')}`}. O comando \`nmap -p ${rlo}-${rhi} localhost\` agrupa as portas fechadas na linha "Not shown: N closed tcp ports". Qual é o valor de N?`,
      options: mcq(rng, String(closed), [closed + 1, closed - 1, closed + nOpen, size, closed - 2, closed + 2].filter((x) => x !== closed && x > 0).map(String)),
      explanation: `O intervalo ${rlo}-${rhi} tem ${rhi} − ${rlo} + 1 = **${size}** portas. Destas, ${nOpen === 1 ? '1 está aberta' : `${nOpen} estão abertas`} (${ports.join(', ')}); as demais ${size} − ${nOpen} = **${closed}** estão fechadas e, por serem muitas, o nmap as resume em "Not shown: ${closed} closed tcp ports" e lista só as abertas, como:\n\n${block(`PORT      STATE SERVICE\n${tbl}`)}`,
      ref, verify: { sh, expect: String(closed) },
    };
  },
};

// ------------------------------------------------------------------ sudo (verificado com `sudo -l -U`)
const SC = [
  { path: '/usr/bin/systemctl', args: ['status apache2', 'restart apache2', 'stop apache2', 'start nginx'] },
  { path: '/usr/bin/apt-get', args: ['update', 'upgrade', 'install nginx', 'remove nginx'] },
  { path: '/usr/bin/journalctl', args: ['-u ssh', '-n 50', '-f'] },
  { path: '/usr/bin/tail', args: ['-f /var/log/syslog', '-n 20 /var/log/auth.log'] },
  { path: '/usr/sbin/useradd', args: ['-m teste', '-D'] },
];
const wild = (pat) => new RegExp(`^${pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
function sudoEval(env, q) {
  const inList = (items, test) => { let r = false; for (const it of items) { const neg = it.startsWith('!'); if (test(neg ? it.slice(1) : it)) r = !neg; } return r; };
  const whoM = (w) => (w === 'ALL' ? true : env.users[w] ? inList(env.users[w], whoM) : w.startsWith('%') ? q.groups.includes(w.slice(1)) : w === q.user);
  const hostM = (h) => (h === 'ALL' ? true : env.hosts[h] ? inList(env.hosts[h], hostM) : h === q.host);
  const runM = (r) => (r === 'ALL' ? true : env.runas[r] ? inList(env.runas[r], runM) : r === q.runas);
  const specM = (sp) => {
    if (sp.cmd === 'ALL') return true;
    if (env.cmds[sp.cmd]) { let res = false; for (const it of env.cmds[sp.cmd]) { if (specM(it)) res = !it.neg; } return res; }
    if (sp.cmd !== q.path) return false;
    if (sp.args === undefined) return true;
    if (sp.args === '""') return q.args === '';
    return wild(sp.args).test(q.args);
  };
  let result = false; let nopass = false;
  for (const rule of env.rules) {
    if (!whoM(rule.who) || !hostM(rule.host) || !runM(rule.runas ?? 'root')) continue;
    for (const sp of rule.cmds) if (specM(sp)) { result = !sp.neg; nopass = !!rule.nopasswd; }
  }
  return { allowed: result, nopass };
}
const specTxt = (sp) => `${sp.neg ? '!' : ''}${sp.cmd === 'ALL' || /^[A-Z_]+$/.test(sp.cmd) ? sp.cmd : `${sp.cmd}${sp.args !== undefined ? ` ${sp.args}` : ''}`}`;
function renderSudoers(env) {
  const out = [];
  for (const [n, l] of Object.entries(env.hosts)) out.push(`Host_Alias ${n} = ${l.join(', ')}`);
  for (const [n, l] of Object.entries(env.users)) out.push(`User_Alias ${n} = ${l.join(', ')}`);
  for (const [n, l] of Object.entries(env.cmds)) out.push(`Cmnd_Alias ${n} = ${l.map(specTxt).join(', ')}`);
  for (const r of env.rules) out.push(`${r.who} ${r.host}${r.runas ? `=(${r.runas})` : '='} ${r.nopasswd ? 'NOPASSWD: ' : ''}${r.cmds.map(specTxt).join(', ')}`);
  return out.join('\n');
}
function sudoScenario(rng) {
  const U = 'carol'; const others = ['mimi', 'dave'];
  const env = { users: {}, hosts: {}, runas: {}, cmds: {}, rules: [] };
  const c1 = rng.pick(SC); const sub = rng.sample(c1.args, 2);
  const host = rng.pick(['ALL', 'ALL', 'web01', 'SERVERS']);
  if (host === 'SERVERS') env.hosts.SERVERS = ['web01', 'web02'];
  const kind = rng.pick(['exato', 'qualquer-arg', 'wildcard-neg', 'alias-cmd', 'alias-user', 'runas']);
  const who = rng.pick([U, '%ops']);
  if (kind === 'exato') env.rules.push({ who, host, runas: rng.pick(['ALL', 'mimi', 'root']), nopasswd: rng.chance(0.4), cmds: [{ cmd: c1.path, args: sub[0] }] });
  else if (kind === 'qualquer-arg') env.rules.push({ who, host, runas: rng.pick(['root', 'mimi']), nopasswd: rng.chance(0.4), cmds: [{ cmd: c1.path }] });
  else if (kind === 'wildcard-neg') env.rules.push({ who, host, runas: 'root', cmds: [{ cmd: c1.path, args: '*' }, { cmd: c1.path, args: `${sub[1].split(' ')[0]} *`, neg: true }] });
  else if (kind === 'alias-cmd') { env.cmds.SERVICOS = [{ cmd: c1.path, args: sub[0] }, { cmd: c1.path, args: sub[1] }]; env.rules.push({ who, host, runas: rng.pick(['root', 'ALL']), cmds: [{ cmd: 'SERVICOS' }] }); }
  else if (kind === 'alias-user') { env.users.ADMINS = [U, '%ops']; env.rules.push({ who: 'ADMINS', host, runas: 'root', cmds: [{ cmd: c1.path, args: sub[0] }] }); }
  else env.rules.push({ who, host, cmds: [{ cmd: c1.path, args: sub[0] }] }); // sem (runas): só root
  if (rng.chance(0.4)) { const c2 = rng.pick(SC.filter((x) => x !== c1)); env.rules.push({ who: rng.pick([U, 'dave']), host: 'ALL', runas: 'root', cmds: [{ cmd: c2.path, args: rng.pick(c2.args) }] }); }
  const memberOps = rng.chance(0.5); // carol pertence ao grupo ops?
  const base = { groups: memberOps ? ['ops'] : [], host: host === 'ALL' ? 'srv01' : 'web01' };
  const mk = (user, runas, c, args) => ({ user, groups: user === U ? base.groups : user === 'dave' ? ['ops'] : [], host: base.host, runas, path: c, args });
  const used = [...new Set(env.rules.flatMap((r) => r.cmds.flatMap((s) => (env.cmds[s.cmd] ?? [s]).map((x) => x.cmd))))].filter((p) => p.startsWith('/'));
  const cands = [];
  for (const user of [U, 'dave', 'mimi']) for (const runas of ['root', 'mimi', 'dave']) for (const p of used) {
    const cc = SC.find((x) => x.path === p); for (const a of cc.args) cands.push(mk(user, runas, p, a));
    cands.push(mk(user, runas, p, ''));
  }
  return { env, cands, base, text: renderSudoers(env), memberOps };
}
const qText = (q) => `\`${q.user}\` executa \`sudo ${q.runas !== 'root' ? `-u ${q.runas} ` : ''}${q.path.split('/').pop()}${q.args ? ' ' + q.args : ''}\``;
function sudoVerify(sc, queries) {
  const users = ['carol', 'mimi', 'dave'];
  const stubs = [...new Set(queries.map((q) => q.path))].join(' ');
  const sudoers = renderSudoers(sc.env);
  const qs = queries.map((q) => `sudo -l -U ${q.user} -u ${q.runas} -h ${q.host} ${q.path}${q.args ? ' ' + q.args : ''} >/dev/null 2>&1 && printf 1 || printf 0`).join('\n');
  const sh = [
    `for u in ${users.join(' ')} ops; do ${rmU('$u')}; done`, 'sudo groupadd ops', ...users.map((u) => `sudo useradd -M ${u}`), `sudo usermod -aG ops dave${sc.memberOps ? '; sudo usermod -aG ops carol' : ''}`,
    `for c in ${stubs}; do [ -e $c ] || sudo install -m 755 /bin/true $c; done`,
    "grep -q srv01 /etc/hosts || echo '127.0.0.1 web01 web02 srv01' | sudo tee -a /etc/hosts >/dev/null 2>&1", // evita o atraso de DNS do sudo -h
    `cat > /tmp/zzsudoers <<'EOS'\n${sudoers}\nEOS`, 'sudo visudo -c -f /tmp/zzsudoers >/dev/null 2>&1 || { echo INVALIDO; exit; }', 'sudo install -m 440 -o root -g root /tmp/zzsudoers /etc/sudoers.d/zz-adm',
    qs, 'echo', 'sudo rm -f /etc/sudoers.d/zz-adm /tmp/zzsudoers', `for u in ${users.join(' ')} ops; do ${rmU('$u')}; done`,
  ].join('\n');
  return { sh, expect: queries.map((q) => (sudoEval(sc.env, q).allowed ? '1' : '0')).join('') };
}
const gSudo = {
  id: 'sec-sudo-politica', obj: '110.1', nivel: 3, peso: 3,
  make(rng) {
    for (let g = 0; g < 60; g++) {
      const sc = sudoScenario(rng);
      const T = sc.cands.filter((q) => sudoEval(sc.env, q).allowed); const F = sc.cands.filter((q) => !sudoEval(sc.env, q).allowed);
      const multipla = rng.chance(0.4);
      const nT = multipla ? rng.int(2, 3) : 1; const nF = multipla ? 5 - nT : 3;
      if (T.length < nT || F.length < nF + 3) continue;
      // falsos "quase" (mesmo comando, usuário/runas/args diferentes)
      const t0 = rng.sample(T, nT);
      const near = F.filter((f) => t0.some((t) => t.path === f.path));
      const chosenF = rng.sample(near.length >= nF ? near : F, nF);
      const qs = rng.shuffle([...t0, ...chosenF]);
      if (new Set(qs.map(qText)).size !== qs.length) continue;
      const hostNote = sc.env.rules.some((r) => r.host !== 'ALL') ? ` na máquina \`${sc.base.host}\`` : '';
      const intro = `Considere o trecho de \`/etc/sudoers\` abaixo. Os usuários são \`carol\`, \`mimi\` e \`dave\`; \`dave\` pertence ao grupo \`ops\`${sc.memberOps ? ' e \`carol\` também' : ', mas \`carol\` não'}. Os comandos são executados${hostNote || ' em qualquer máquina'}.`;
      const why = qs.map((q) => `${qText(q)} → ${sudoEval(sc.env, q).allowed ? 'permitido' : 'negado'}`).join('; ');
      return {
        type: multipla ? 'multipla' : 'unica',
        text: `${intro}\n\n${block(sc.text)}\n\n${multipla ? 'Quais das ações abaixo o sudo **permite**?' : 'Qual das ações abaixo o sudo **permite**?'}`,
        options: qs.map((q) => ({ t: qText(q), ok: sudoEval(sc.env, q).allowed })),
        explanation: `Formato de uma linha: \`quem  onde=(como-quem)  [NOPASSWD:] comandos\`. \`%grupo\` indica um grupo; aliases (User_Alias, Cmnd_Alias, Host_Alias) agrupam itens; \`(ALL)\`/\`(root)\`/\`(mimi)\` limitam sob qual usuário o comando roda (sem parênteses, só como root); um comando **sem argumentos** na regra vale para **quaisquer argumentos**, e **com argumentos** só vale para exatamente aqueles (o \`*\` é curinga); \`!\` nega e a **última regra que casa** vence. Avaliação: ${why}.`,
        ref: ['102:p.520-524'], ...(rng.chance(0.5) ? { verify: sudoVerify(sc, qs) } : {}), // ~metade das sementes: execuções longas de sudo no mesmo container degradam
      };
    }
    throw new Error('sem cenário sudo');
  },
};

const SUDO_FACTS = [
  ['Qual comando é a forma recomendada de editar o `/etc/sudoers`, validando a sintaxe antes de salvar?', 'visudo', ['vi /etc/sudoers', 'sudoedit --check', 'nano -s /etc/sudoers', 'chmod +w /etc/sudoers && vim /etc/sudoers']],
  ['O que significa a linha `root ALL=(ALL:ALL) ALL` em /etc/sudoers?', 'root pode executar qualquer comando, em qualquer máquina, como qualquer usuário e qualquer grupo', ['root só pode executar comandos como ele mesmo', 'root precisa da senha do alvo para qualquer comando', 'todos os usuários podem virar root', 'root está proibido de usar o sudo']],
  ['Em /etc/sudoers, como é identificado um **grupo** (por exemplo, `sudo`)?', 'com o prefixo % — `%sudo`', ['com o prefixo @ — `@sudo`', 'com o prefixo # — `#sudo`', 'com o sufixo : — `sudo:`', 'entre colchetes — `[sudo]`']],
  ['Que grupo especial equivale ao grupo `sudo` do Debian nas distribuições da família Red Hat?', 'wheel', ['admin', 'root', 'sudoers', 'adm']],
  ['Qual comando adiciona `carol` ao grupo `sudo` **sem removê-la** dos outros grupos?', 'usermod -aG sudo carol', ['usermod -G sudo carol', 'usermod -g sudo carol', 'groupadd sudo carol', 'sudo -a carol']],
  ['O que a tag `NOPASSWD:` faz em uma regra do sudoers?', 'dispensa a digitação da senha do usuário para os comandos daquela regra', ['dispensa a senha do root', 'proíbe o uso de senhas no sistema', 'bloqueia a conta do usuário', 'permite executar comandos sem registrar log']],
  ['Qual comando mostra quais comandos o usuário atual pode executar com o sudo?', 'sudo -l', ['sudo -u', 'sudo --who', 'sudo -k', 'sudo -v -l-all']],
  ['Como executar o comando `whoami` como o usuário `mimi` usando sudo?', 'sudo -u mimi whoami', ['sudo mimi whoami', 'sudo -m mimi whoami', 'su -c whoami -u mimi sudo', 'sudo --run mimi whoami']],
  ['Qual vantagem do `sudo` sobre o `su`?', 'não é preciso conhecer a senha do root: o usuário usa a própria senha, conforme a política do sudoers', ['o sudo dispensa qualquer senha', 'o sudo só funciona para o root', 'o sudo troca o ambiente completo do usuário-alvo sempre', 'o sudo não gera registros em log']],
  ['Qual a diferença entre `su usuario` e `su - usuario`?', 'com o hífen o ambiente (login shell) do usuário-alvo é carregado; sem ele mantém-se o ambiente do usuário original', ['com o hífen o comando não pede senha', 'sem o hífen o comando exige a senha do root', 'não há diferença', 'com o hífen a sessão expira em 15 minutos']],
  ['Em /etc/sudoers, qual opção de `Defaults` muda o tempo em que o sudo "lembra" a senha (padrão 15 minutos)?', 'timestamp_timeout', ['password_timeout', 'sudo_cache', 'remember_time', 'auth_ttl']],
  ['Além de /etc/sudoers, onde podem ficar arquivos adicionais de configuração do sudo?', '/etc/sudoers.d/', ['/etc/sudo.d/', '/var/sudoers/', '/usr/share/sudoers/', '/etc/sudoers.conf']],
  ['O que o tipo de alias `Cmnd_Alias` define em /etc/sudoers?', 'um nome para um grupo de comandos', ['um nome para um grupo de usuários', 'um nome para um grupo de máquinas', 'um apelido de arquivo de log', 'um comando executado antes do sudo']],
  ['O que o tipo de alias `Host_Alias` define em /etc/sudoers?', 'um nome para uma lista de máquinas (nomes, IPs, redes)', ['uma lista de usuários', 'uma lista de comandos', 'o nome do host local', 'uma lista de grupos de rede apenas']],
  ['Em `carol 192.168.1.7=(mimi) /usr/bin/systemctl status apache2`, o que `(mimi)` significa?', 'carol pode executar o comando como o usuário mimi', ['mimi pode executar o comando como carol', 'o comando só funciona na máquina mimi', 'mimi precisa autorizar o comando', 'o comando é executado em nome do grupo mimi']],
];
const gSudoFatos = {
  id: 'sec-sudo-conceitos', obj: '110.1', nivel: 1, peso: 2,
  make(rng) {
    const f = rng.pick(SUDO_FACTS);
    return {
      type: 'unica', text: f[0], options: mcq(rng, f[1], f[2]),
      explanation: `sudo: política em /etc/sudoers e /etc/sudoers.d/* (editar com \`visudo\`). Linha: \`usuário|%grupo  máquinas=(como-quem)  [NOPASSWD:] comandos\`. Aliases: User_Alias, Host_Alias, Cmnd_Alias, Runas_Alias. \`sudo -u usuário cmd\` executa como outro usuário; \`sudo -l\` lista as permissões; a senha pedida é a do próprio usuário (cache de 15 min, \`timestamp_timeout\`). Grupo de administradores: \`sudo\` (Debian) / \`wheel\` (Red Hat). Resposta: ${f[1]}.`,
      ref: ['102:p.520-524'],
    };
  },
};

// ------------------------------------------------------------------ usuários conectados, who/w/last/lastb (conceitual + cálculo)
const LG = [
  ['Qual comando lista os usuários **conectados agora**, mostrando usuário, terminal, data/hora do login e host de origem?', 'who', ['last', 'lastb', 'lastlog', 'uptime']],
  ['Qual comando mostra os usuários conectados e **o que cada um está executando** (colunas IDLE, JCPU, PCPU e WHAT)?', 'w', ['who', 'last', 'ps -u', 'lastlog']],
  ['Qual comando mostra o **histórico** de logins e reinicializações, lendo /var/log/wtmp?', 'last', ['who', 'lastb', 'w', 'lastlog']],
  ['Qual comando lista as **tentativas de login malsucedidas** (arquivo /var/log/btmp)?', 'lastb', ['last', 'faillog -a', 'who -f', 'lastlog']],
  ['Qual comando mostra, para cada usuário, a data/hora do **último login**?', 'lastlog', ['last', 'lastb', 'who -b', 'w -l']],
  ['Qual opção do `who` exibe a hora da **última inicialização** do sistema?', 'who -b', ['who -r', 'who -H', 'who -u', 'who -q']],
  ['Qual opção do `who` imprime o cabeçalho das colunas?', 'who -H', ['who -b', 'who -r', 'who -a', 'who -T']],
  ['Qual comando mostra apenas os registros de login do usuário `carol` em /var/log/wtmp?', 'last carol', ['who carol', 'lastb carol', 'w -l carol', 'lastlog carol -w']],
  ['O que significa `still logged in` na saída do `last`?', 'a sessão ainda está aberta (o usuário não saiu)', ['o usuário foi bloqueado', 'o login falhou', 'a máquina ainda não reiniciou', 'o usuário está inativo há mais de um dia']],
  ['Na coluna de terminal de `last`/`who`, o que indica `pts/0`?', 'um pseudo-terminal (por exemplo, sessão SSH ou terminal gráfico); tty indicaria console de texto', ['um terminal de texto clássico (tty físico)', 'um terminal serial', 'o terminal do root', 'um terminal bloqueado']],
  ['Que arquivo guarda os usuários **conectados no momento**, lido por `who` e `w`?', '/var/run/utmp (ou /run/utmp)', ['/var/log/wtmp', '/var/log/btmp', '/etc/passwd', '/var/log/lastlog']],
];
const gLogins = {
  id: 'sec-usuarios-conectados', obj: '110.1', nivel: 2, peso: 2,
  make(rng) {
    if (rng.chance(0.4)) {
      const u = rng.pick(USERS); const h1 = rng.int(0, 22); const m1 = rng.int(0, 59); const dur = rng.int(5, 600);
      const start = h1 * 60 + m1; const end = start + dur;
      if (end >= 1440) return { type: 'unica', text: 'Qual comando lista os usuários conectados agora?', options: mcq(rng, 'who', ['last', 'lastb', 'lastlog', 'uptime']), explanation: 'who (e w) mostram quem está conectado agora; last mostra o histórico (wtmp), lastb as falhas (btmp) e lastlog o último login de cada usuário.', ref: ['102:p.517-519'] };
      const fm = (x) => `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
      const remote = rng.chance(0.6); const tty = remote ? `pts/${rng.int(0, 3)}` : `tty${rng.int(1, 3)}`;
      const line = `${u.padEnd(8)} ${tty.padEnd(6)} ${remote ? '192.168.1.' + rng.int(2, 99) : ''.padEnd(13)} Sat Jun  6 ${fm(start)} - ${fm(end)}  (${fm(dur)})`;
      const ask = rng.pick(['duracao', 'remoto', 'texto']);
      if (ask === 'duracao') {
        const pool = [dur + 60, dur - 60, dur + 10, Math.abs(dur - 30), end].filter((x) => x > 0 && x !== dur);
        return { type: 'unica', text: `Uma linha da saída de \`last\` é:\n\n${block(line)}\n\nQuanto tempo durou a sessão (hh:mm)?`, options: mcq(rng, fm(dur), pool.map((x) => fm(x % 1440))), explanation: `Na saída de \`last\`, o intervalo "início - fim" é seguido da duração entre parênteses: de ${fm(start)} a ${fm(end)} → **${fm(dur)}** (horas:minutos).`, ref: ['102:p.517-518'] };
      }
      if (ask === 'remoto') {
        return { type: 'unica', text: `Uma linha da saída de \`last\` é:\n\n${block(line)}\n\nO que se pode concluir sobre a sessão?`, options: mcq(rng, remote ? 'foi uma sessão remota (a coluna de host traz um endereço IP) em um pseudo-terminal' : 'foi uma sessão local em um console de texto (tty), sem host de origem', [remote ? 'foi uma sessão local em um console de texto (tty)' : 'foi uma sessão remota feita por SSH', 'a sessão ainda está aberta', 'o login falhou e foi registrado em /var/log/btmp', 'o usuário foi desconectado à força pelo root']), explanation: `Em \`last\`: usuário, terminal (\`pts/N\` = pseudo-terminal, típico de SSH/emulador; \`ttyN\` = console de texto), host de origem (vazio quando local), início, fim e duração. Aqui o terminal é \`${tty}\` ${remote ? 'e há um IP de origem' : 'e não há host de origem'}.`, ref: ['102:p.517-518'] };
      }
    }
    const f = rng.pick(LG);
    return { type: 'unica', text: f[0], options: mcq(rng, f[1], f[2]), explanation: `\`who\` e \`w\` mostram quem está conectado **agora** (utmp; \`w\` também mostra o que cada um faz); \`last\` mostra o histórico de logins/reboots (wtmp); \`lastb\` as tentativas falhas (btmp); \`lastlog\` o último login de cada usuário. Resposta: \`${f[1]}\`.`, ref: ['102:p.517-519'] };
  },
};

// ------------------------------------------------------------------ SUID/SGID: fatos
const SUID_FACTS = [
  ['O que o bit **SUID** faz em um arquivo executável?', 'faz o programa rodar com os privilégios do **dono** do arquivo', ['faz o programa rodar com os privilégios do grupo', 'impede a exclusão do arquivo por outros usuários', 'faz os arquivos criados herdarem o grupo do diretório', 'torna o arquivo imutável']],
  ['O que o bit **SGID** faz em um **diretório**?', 'os arquivos criados nele herdam o grupo do diretório', ['os arquivos criados pertencem sempre ao root', 'só o dono pode remover arquivos', 'o diretório fica invisível', 'os arquivos ficam imutáveis']],
  ['Por que o programa `passwd` tem o SUID ligado?', 'para que usuários comuns possam alterar sua senha, que fica em /etc/shadow, arquivo gravável apenas pelo root', ['para impedir que o root altere senhas', 'para registrar tentativas de login', 'para que ele rode mais rápido', 'para ser executado no boot']],
  ['Em `ls -l`, o que indica `-rwSr-xr-x` no início da listagem?', 'SUID ligado, mas o dono **não** tem permissão de execução (S maiúsculo)', ['SUID ligado e dono com execução (s minúsculo)', 'SGID ligado sem execução para o grupo', 'sticky bit ligado', 'arquivo sem nenhuma permissão especial']],
  ['Qual valor octal representa o bit SUID?', '4000', ['2000', '1000', '0400', '6000']],
  ['Qual valor octal representa o bit SGID?', '2000', ['4000', '1000', '0200', '6000']],
  ['Qual comando liga o SGID em um diretório mantendo as permissões 755?', 'chmod 2755 diretorio', ['chmod 4755 diretorio', 'chmod 1755 diretorio', 'chmod 7755 diretorio -s', 'chmod g-s diretorio']],
  ['Como localizar, a partir de /, arquivos regulares com SUID **ou** SGID ligados (erros ocultos)?', 'find / -type f -perm /6000 2>/dev/null', ['find / -type f -perm 6000 2>/dev/null', 'find / -type f -suid -sgid', 'find / -type f -perm -u+s,g-s', 'find / -type f -perm +x']],
];
const gSuidFatos = {
  id: 'sec-suid-sgid-conceitos', obj: '110.1', nivel: 1, peso: 1,
  make(rng) {
    const f = rng.pick(SUID_FACTS);
    return { type: 'unica', text: f[0], options: mcq(rng, f[1], f[2]), explanation: `SUID (4000, \`s\` no lugar do x do dono): executa com os privilégios do dono do arquivo (ex.: /usr/bin/passwd, sudo, su, mount). SGID (2000, \`s\` no lugar do x do grupo): em arquivos executa como o grupo; em diretórios, novos arquivos herdam o grupo. \`S\`/\`T\` maiúsculos = bit especial sem o x correspondente. Auditoria: \`find / -type f -perm /6000\` (SUID ou SGID), \`-perm -4000\` (SUID). Resposta: ${f[1]}.`, ref: ['102:p.501-504'] };
  },
};

export const generators = [gFind, gUlimit, gSenhaExp, gPortas, gNmap, gSudo, gSudoFatos, gLogins, gSuidFatos];
