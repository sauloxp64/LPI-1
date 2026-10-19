// 108.2 — logs do sistema: rsyslog (facilities, prioridades, seletores), logger, logrotate e journalctl/journald.
import { mcq, multi, block } from './util.mjs';
import { sq, listPt } from './admin-lib.mjs';

// ------------------------------------------------------------------ seletores do rsyslog (emulador conferido com o rsyslogd real)
const FAC = ['kern', 'user', 'mail', 'daemon', 'auth', 'syslog', 'lpr', 'news', 'uucp', 'cron', 'authpriv', 'ftp', 'local0', 'local1', 'local2', 'local3', 'local4', 'local5', 'local6', 'local7'];
const FAC_NUM = { kern: 0, user: 1, mail: 2, daemon: 3, auth: 4, syslog: 5, lpr: 6, news: 7, uucp: 8, cron: 9, authpriv: 10, ftp: 11, local0: 16, local1: 17, local2: 18, local3: 19, local4: 20, local5: 21, local6: 22, local7: 23 };
const FAC_MSG = FAC.filter((f) => f !== 'kern'); // o logger não envia mensagens "kern"
const PRI = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
const SYN = { warn: 'warning', error: 'err', panic: 'emerg' };
const pidx = (n) => PRI.indexOf(SYN[n] ?? n);

/** máscara de prioridades por facility depois de aplicar os seletores, da esquerda para a direita */
function ruleTable(rule) {
  const t = {}; FAC.forEach((f) => (t[f] = 0));
  for (const sel of rule.split(';')) {
    const k = sel.lastIndexOf('.'); const fs = sel.slice(0, k); const pr = sel.slice(k + 1);
    for (const f of fs === '*' ? FAC : fs.split(',')) {
      if (pr === 'none') t[f] = 0;
      else if (pr === '*') t[f] |= 0xff;
      else if (pr.startsWith('!=')) t[f] &= ~(1 << pidx(pr.slice(2)));
      else if (pr.startsWith('!')) t[f] &= ~((1 << (pidx(pr.slice(1)) + 1)) - 1);
      else if (pr.startsWith('=')) t[f] |= 1 << pidx(pr.slice(1));
      else t[f] |= (1 << (pidx(pr) + 1)) - 1;
    }
  }
  return t;
}
const matches = (rule, msg) => { const [f, p] = msg.split('.'); return !!(ruleTable(rule)[f] & (1 << pidx(p))); };
const tableKey = (rule) => { const t = ruleTable(rule); return FAC_MSG.map((f) => t[f]).join(','); };
const allMsgs = FAC_MSG.flatMap((f) => PRI.map((p) => `${f}.${p}`));

/** verificação: sobe um rsyslogd de verdade (socket próprio), envia as mensagens com logger e lista os índices gravados */
function rsyslogVerify(rule, msgs) {
  const conf = ['module(load="imuxsock" SysSock.Use="off")', 'input(type="imuxsock" Socket="DIR/sock")', 'template(name="T" type="string" string="%msg%\\n")', `${rule}   DIR/out.log;T`, '*.*   DIR/all.log;T'].join('\n');
  const sends = msgs.map((m, i) => `logger -u "$d/sock" -p ${m} -t t ${i}`).join('\n');
  const sh = `d=$(mktemp -d)\ncat > "$d/r.conf" <<'EOC'\n${conf}\nEOC\nsed -i "s|DIR|$d|g" "$d/r.conf"\nrsyslogd -n -f "$d/r.conf" -i "$d/pid" >/dev/null 2>&1 &\nfor i in $(seq 1 100); do [ -S "$d/sock" ] && break; sleep 0.05; done\n${sends}\nlogger -u "$d/sock" -p local7.debug -t t zz\nfor i in $(seq 1 200); do grep -q zz "$d/all.log" 2>/dev/null && break; sleep 0.05; done\nkill $(cat "$d/pid"); sleep 0.1\ngrep -v zz "$d/out.log" 2>/dev/null | sed 's/^ //' | sort -n | paste -sd' ' -\nrm -rf "$d"`;
  return { sh, expect: msgs.map((m, i) => (matches(rule, m) ? i : -1)).filter((i) => i >= 0).join(' ') };
}

const facList = (rng, n) => rng.sample(['mail', 'daemon', 'auth', 'authpriv', 'cron', 'news', 'lpr', 'user', 'local0', 'local1', 'local7', 'ftp', 'syslog', 'uucp'], n);
const sortF = (a) => a.sort((x, y) => FAC.indexOf(x) - FAC.indexOf(y));
const PRI_WORDS = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
function randomRule(rng) {
  const p = () => rng.pick(rng.chance(0.2) ? ['warn', 'error', 'crit', 'info', 'notice', 'debug', 'alert'] : PRI_WORDS);
  const st = rng.weighted(['simples', 'exata', 'exceto', 'aditiva', 'listas', 'negacao'], (x) => ({ simples: 30, exata: 14, exceto: 22, aditiva: 8, listas: 14, negacao: 6 }[x]));
  const fl = (n) => sortF(facList(rng, n)).join(',');
  switch (st) {
    case 'simples': return `${rng.chance(0.2) ? '*' : fl(rng.int(1, 3))}.${p()}`;
    case 'exata': return `${rng.chance(0.4) ? '*' : fl(rng.int(1, 2))}.=${p()}`;
    case 'exceto': return rng.chance(0.5) ? `*.*;${fl(rng.int(1, 2))}.none` : `*.${p()};${fl(rng.int(1, 3))}.none`;
    case 'aditiva': return `*.=info;*.=notice;*.=warn;${fl(rng.int(1, 2))}.none`;
    case 'listas': { const a = fl(rng.int(1, 2)); let b = fl(rng.int(1, 2)); while (b.split(',').some((x) => a.split(',').includes(x))) b = fl(rng.int(1, 2)); return `${a}.${p()};${b}.${p()}`; }
    default: return rng.chance(0.5) ? `*.*;*.!=${p()}` : `${fl(rng.int(1, 2))}.${p()};*.!=${p()}`;
  }
}
const ACTIONS = ['/var/log/mensagens.log', '-/var/log/geral.log', '/var/log/avisos.log', '-/var/log/servicos.log'];

const gSelCasa = {
  id: 'log-rsyslog-seletor-casa', obj: '108.2', nivel: 3, peso: 3,
  make(rng) {
    let rule; let M; let U;
    for (let g = 0; g < 50; g++) {
      rule = randomRule(rng);
      M = allMsgs.filter((m) => matches(rule, m)); U = allMsgs.filter((m) => !matches(rule, m));
      if (M.length >= 3 && U.length >= 6 && M.length < 150) break;
    }
    const action = rng.pick(ACTIONS);
    const multipla = rng.chance(0.45);
    const near = (m) => U.filter((u) => u.split('.')[0] === m.split('.')[0] || u.split('.')[1] === m.split('.')[1]);
    let right; let wrong;
    if (multipla) {
      right = rng.sample(M, rng.int(2, 3)); const pool = [...new Set([...right.flatMap(near), ...rng.sample(U, 4)])];
      wrong = rng.sample(pool, 5 - right.length);
    } else {
      right = [rng.pick(M)]; const pool = [...new Set([...near(right[0]), ...rng.sample(U, 3)])];
      wrong = rng.sample(pool, 3);
    }
    const all = [...right, ...wrong];
    if (new Set(all).size !== all.length) throw new Error('repetidas');
    const shuffled = rng.shuffle(all);
    const pr = ['Prioridades (da mais grave para a menos): emerg(0), alert(1), crit(2), err(3), warning(4), notice(5), info(6), debug(7).'];
    const expl = `Regra de seleção no rsyslog: \`facility.prioridade\`. Uma prioridade sozinha casa com ela **e todas as mais graves**; \`=prio\` casa só com aquela; \`none\` exclui a facility; \`*\` é "qualquer"; vírgula junta facilities e \`;\` encadeia seletores, aplicados da esquerda para a direita (um \`none\` posterior remove o que os anteriores adicionaram). ${pr}`;
    const verdict = (m) => `\`${m}\` ${matches(rule, m) ? 'casa' : 'não casa'}`;
    if (multipla) {
      return {
        type: 'multipla',
        text: `Em \`/etc/rsyslog.conf\` existe a regra:\n\n${block(`${rule}    ${action}`)}\n\nQuais das mensagens abaixo (facility.prioridade, como enviadas por \`logger -p\`) são gravadas no arquivo?`,
        options: shuffled.map((m) => ({ t: m, ok: right.includes(m) })),
        explanation: `${expl} Avaliação: ${shuffled.map(verdict).join('; ')}.`,
        ref: ['102:p.305-308'], verify: rsyslogVerify(rule, shuffled),
      };
    }
    return {
      type: 'unica',
      text: `Em \`/etc/rsyslog.conf\` existe a regra:\n\n${block(`${rule}    ${action}`)}\n\nQual das mensagens abaixo (facility.prioridade, como enviadas por \`logger -p\`) **é gravada** no arquivo?`,
      options: shuffled.map((m) => ({ t: m, ok: right.includes(m) })),
      explanation: `${expl} Avaliação: ${shuffled.map(verdict).join('; ')}.`,
      ref: ['102:p.305-308'], verify: rsyslogVerify(rule, shuffled),
    };
  },
};

// ------------------------------------------------------------------ escrever a regra a partir do requisito
const pw = (p) => ({ emerg: 'emerg (0)', alert: 'alert (1)', crit: 'crit (2)', err: 'err (3)', warning: 'warning (4)', notice: 'notice (5)', info: 'info (6)', debug: 'debug (7)' }[p]);
const FACS_PT = (l) => listPt(l.map((x) => `\`${x}\``));
const FAMILIES = [
  (r) => { const f = sortF(facList(r, r.int(1, 3))); const p = r.pick(['warning', 'err', 'crit', 'notice']); const nx = PRI[Math.min(7, PRI.indexOf(p) + 1)]; const pv = PRI[Math.max(0, PRI.indexOf(p) - 1)]; const F = f.join(','); return { desc: `todas as mensagens ${f.length > 1 ? 'das facilities' : 'da facility'} ${FACS_PT(f)} com prioridade **${pw(p)} ou mais grave**`, rule: `${F}.${p}`, wrong: [`${F}.=${p}`, `${F}.${nx}`, `${F}.${pv}`, `*.${p}`, `${F}.*`] }; },
  (r) => { const f = sortF(facList(r, r.int(1, 2))); const p = r.pick(['info', 'debug', 'notice', 'err']); const F = f.join(','); return { desc: `somente as mensagens ${f.length > 1 ? 'das facilities' : 'da facility'} ${FACS_PT(f)} cuja prioridade seja **exatamente ${pw(p)}**`, rule: `${F}.=${p}`, wrong: [`${F}.${p}`, `${F}.*`, `*.=${p}`, `${F}.*;${F}.!=${p}`, `${F}.${PRI[Math.min(7, PRI.indexOf(p) + 1)]}`] }; },
  (r) => { const f = sortF(facList(r, r.int(1, 2))); const F = f.join(','); return { desc: `**todas** as mensagens, de qualquer prioridade, **exceto** as ${f.length > 1 ? 'das facilities' : 'da facility'} ${FACS_PT(f)}`, rule: `*.*;${F}.none`, wrong: [`*.*;${F}.*`, `${F}.none`, `*.none;${F}.*`, `*.*;${f[0]}.none`, `*.*;${F}.!*`] }; },
  (r) => { const f = sortF(facList(r, r.int(1, 2))); const p = r.pick(['info', 'notice', 'warning', 'err']); const F = f.join(','); return { desc: `mensagens de **qualquer facility** com prioridade **${pw(p)} ou mais grave**, **menos** as ${f.length > 1 ? 'das facilities' : 'da facility'} ${FACS_PT(f)}`, rule: `*.${p};${F}.none`, wrong: [`*.${p};${F}.${p}`, `*.=${p};${F}.none`, `*.*;${F}.none`, `*.${p}`, `${F}.${p}`] }; },
  (r) => { const f = sortF(facList(r, r.int(1, 3))); const F = f.join(','); return { desc: `todas as mensagens ${f.length > 1 ? 'das facilities' : 'da facility'} ${FACS_PT(f)}, **independentemente da prioridade**`, rule: `${F}.*`, wrong: [`${F}.=debug`, `${F}.none`, `*.*`, `*.${r.pick(['info', 'err'])}`, `${F}.crit`] }; },
  (r) => { const p = r.pick(['debug', 'info', 'warning', 'err', 'notice']); return { desc: `mensagens de **qualquer facility**, mas **somente** com prioridade **${pw(p)}** (nenhuma outra)`, rule: `*.=${p}`, wrong: [`*.${p}`, `*.!${p}`, `*.*;*.!=${p}`, `*.${PRI[Math.min(7, PRI.indexOf(p) + 1)]}`, `*.=${PRI[Math.max(0, PRI.indexOf(p) - 1)]}`] }; },
  (r) => { const p = r.pick(['debug', 'info', 'notice']); return { desc: `mensagens de qualquer facility e **qualquer prioridade, menos** ${pw(p)}`, rule: `*.*;*.!=${p}`, wrong: [`*.=${p}`, `*.*;*.=${p}`, `*.!=${p}`, `*.*;*.!${p}`, `*.${PRI[PRI.indexOf(p) - 1]}`] }; },
  (r) => { const [a, b] = r.sample(['info', 'notice', 'warning', 'err'], 2); const F = sortF(facList(r, 1))[0]; return { desc: `mensagens da facility \`${F}\` com prioridade **exatamente ${a}** ou **exatamente ${b}** (e nenhuma outra)`, rule: `${F}.=${a};${F}.=${b}`, wrong: [`${F}.${a};${F}.${b}`, `${F}.${a}`, `${F}.=${a}`, `${F}.=${b};${F}.none`, `${F}.${PRI[Math.max(PRI.indexOf(a), PRI.indexOf(b))]}`] }; },
];
const gSelRegra = {
  id: 'log-rsyslog-escrever-regra', obj: '108.2', nivel: 3, peso: 3,
  make(rng) {
    for (let g = 0; g < 30; g++) {
      const fam = rng.pick(FAMILIES)(rng);
      const key = tableKey(fam.rule);
      const seen = new Set([key]); const wrong = [];
      for (const w of rng.shuffle(fam.wrong)) { const k = tableKey(w); if (!seen.has(k) && w !== fam.rule) { seen.add(k); wrong.push(w); } }
      if (wrong.length < 3) continue;
      const action = rng.pick(['/var/log/destino.log', '-/var/log/destino.log']);
      // mensagens-teste: 3 que casam, 3 que não casam (preferindo as "quase")
      const M = allMsgs.filter((m) => matches(fam.rule, m)); const U = allMsgs.filter((m) => !matches(fam.rule, m));
      const probe = [...rng.sample(M, Math.min(3, M.length)), ...rng.sample(U, 3)];
      return {
        type: 'unica',
        text: `Qual regra de \`/etc/rsyslog.conf\` envia para \`${action}\` ${fam.desc}?`,
        options: mcq(rng, `${fam.rule}    ${action}`, wrong.map((w) => `${w}    ${action}`)),
        explanation: `Formato: \`seletor  ação\`, com seletor = \`facility[,facility].prioridade\`. Uma prioridade sozinha inclui as mais graves (ordem: emerg 0 → debug 7); \`=\` restringe a uma única prioridade; \`none\` retira a facility; \`*\` vale para qualquer valor; \`;\` separa seletores (processados em sequência); o \`-\` antes do arquivo evita sincronizar o disco a cada mensagem. Resposta: \`${fam.rule}\`.`,
        ref: ['102:p.305-308'], verify: rsyslogVerify(fam.rule, probe),
      };
    }
    throw new Error('sem família');
  },
};

// ------------------------------------------------------------------ números de facility/prioridade e valor PRI (verificado com logger)
function priVerify(items) {
  // items: [fac.pri] -> <N> do datagrama real enviado pelo logger
  const sends = items.map((m) => `logger -u "$d/s" -p ${m} -t t x`).join('\n');
  return { sh: `d=$(mktemp -d)\npython3 - "$d/s" <<'PY' &\nimport socket, sys\ns = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM); s.bind(sys.argv[1]); s.settimeout(4)\nfor _ in range(${items.length}):\n    try: d = s.recv(2048)\n    except Exception: break\n    print(d.decode(errors='replace').split('>')[0] + '>')\nPY\nfor i in $(seq 1 60); do [ -S "$d/s" ] && break; sleep 0.05; done\n${sends}\nwait\nrm -rf "$d"`, expect: items.map((m) => { const [f, p] = m.split('.'); return `<${FAC_NUM[f] * 8 + PRI.indexOf(p)}>`; }).join('\n') };
}
const gSyslogNum = {
  id: 'log-syslog-numeros', obj: '108.2', nivel: 2, peso: 2,
  make(rng) {
    const fmt = rng.pick(['pri-calc', 'pri-calc', 'pri-inverso', 'prio-num', 'fac-num', 'ordem', 'padrao']);
    const ref = ['102:p.305-306'];
    const FN = FAC_MSG.filter((f) => f !== 'syslog' || true);
    if (fmt === 'pri-calc') {
      const f = rng.pick(FN); const p = rng.pick(PRI); const n = FAC_NUM[f] * 8 + PRI.indexOf(p);
      const pool = [n + 1, n - 1, n + 8, n - 8, PRI.indexOf(p) * 8 + FAC_NUM[f], FAC_NUM[f] * 8 + (7 - PRI.indexOf(p)), FAC_NUM[f] + PRI.indexOf(p)].filter((x) => x !== n && x >= 0);
      return { type: 'unica', text: `Um daemon envia ao syslog uma mensagem com facility \`${f}\` e prioridade \`${p}\`. Qual é o valor **PRI** (o número entre \`<\` e \`>\` no início da mensagem syslog)?`, options: mcq(rng, `<${n}>`, pool.map((x) => `<${x}>`)), explanation: `PRI = **facility × 8 + prioridade**. \`${f}\` = ${FAC_NUM[f]} e \`${p}\` = ${PRI.indexOf(p)} → ${FAC_NUM[f]} × 8 + ${PRI.indexOf(p)} = **${n}**. Facilities: kern 0, user 1, mail 2, daemon 3, auth 4, syslog 5, lpr 6, news 7, uucp 8, cron 9, authpriv 10, ftp 11, local0–local7 = 16–23.`, ref, verify: priVerify([`${f}.${p}`]) };
    }
    if (fmt === 'pri-inverso') {
      const f = rng.pick(FN); const p = rng.pick(PRI); const n = FAC_NUM[f] * 8 + PRI.indexOf(p);
      const pool = [[f, PRI[Math.min(7, PRI.indexOf(p) + 1)]], [f, PRI[Math.max(0, PRI.indexOf(p) - 1)]], [rng.pick(FN.filter((x) => x !== f)), p], [rng.pick(FN.filter((x) => x !== f)), PRI[7 - PRI.indexOf(p)]], [FN[(FN.indexOf(f) + 1) % FN.length], p]].filter(([a, b]) => `${a}.${b}` !== `${f}.${p}`).map(([a, b]) => `${a}.${b}`);
      return { type: 'unica', text: `Uma captura de rede mostra a mensagem syslog \`<${n}>Oct 12 14:44:44 srv app: teste\`. A que \`facility.prioridade\` corresponde o valor PRI \`${n}\`?`, options: mcq(rng, `${f}.${p}`, pool), explanation: `PRI = facility × 8 + prioridade. Dividindo ${n} por 8: quociente **${FAC_NUM[f]}** (facility \`${f}\`) e resto **${PRI.indexOf(p)}** (prioridade \`${p}\`). Portanto \`${f}.${p}\`.`, ref, verify: priVerify([`${f}.${p}`]) };
    }
    if (fmt === 'prio-num') {
      const i = rng.int(0, 7); const toNum = rng.chance(0.5);
      return toNum ? { type: 'unica', text: `Qual é o código numérico da prioridade (severidade) \`${PRI[i]}\` no syslog?`, options: mcq(rng, String(i), [0, 1, 2, 3, 4, 5, 6, 7].filter((x) => x !== i).map(String)), explanation: `Códigos: 0 emerg, 1 alert, 2 crit, 3 err, 4 warning, 5 notice, 6 info, 7 debug. Quanto **menor** o número, **mais grave** a mensagem. \`${PRI[i]}\` = ${i}.`, ref }
        : { type: 'unica', text: `Qual prioridade do syslog tem o código **${i}**?`, options: mcq(rng, PRI[i], PRI.filter((x) => x !== PRI[i])), explanation: `Códigos: 0 emerg, 1 alert, 2 crit, 3 err, 4 warning, 5 notice, 6 info, 7 debug (quanto menor, mais grave). O código ${i} é **${PRI[i]}**.`, ref };
    }
    if (fmt === 'fac-num') {
      const f = rng.pick(FN); const toNum = rng.chance(0.5);
      return toNum ? { type: 'unica', text: `Qual é o número da facility \`${f}\` no syslog?`, options: mcq(rng, String(FAC_NUM[f]), [...new Set(FN.map((x) => String(FAC_NUM[x])))].filter((x) => x !== String(FAC_NUM[f]))), explanation: `Facilities: kern 0, user 1, mail 2, daemon 3, auth 4, syslog 5, lpr 6, news 7, uucp 8, cron 9, authpriv 10, ftp 11 e local0–local7 = 16–23. \`${f}\` = **${FAC_NUM[f]}**.`, ref }
        : { type: 'unica', text: `Qual facility do syslog tem o número **${FAC_NUM[f]}**?`, options: mcq(rng, f, FN.filter((x) => x !== f)), explanation: `Facilities: kern 0, user 1, mail 2, daemon 3, auth 4, syslog 5, lpr 6, news 7, uucp 8, cron 9, authpriv 10, ftp 11 e local0–local7 = 16–23. O número ${FAC_NUM[f]} é **${f}**.`, ref };
    }
    if (fmt === 'ordem') {
      const right = [...PRI].reverse().join(' < ');
      const sw = (i) => { const c = [...PRI].reverse(); [c[i], c[i + 1]] = [c[i + 1], c[i]]; return c.join(' < '); };
      return { type: 'unica', text: 'Qual sequência lista as prioridades do syslog da **menos grave para a mais grave**?', options: mcq(rng, right, [PRI.join(' < '), sw(1), sw(3), sw(4), sw(2)]), explanation: 'Da menos para a mais grave: debug < info < notice < warning < err < crit < alert < emerg (códigos 7 → 0). Um seletor como `*.err` inclui err, crit, alert e emerg.', ref };
    }
    return { type: 'unica', text: 'Quando o comando `logger "mensagem"` é executado **sem a opção `-p`**, com qual facility e prioridade a mensagem é registrada (valor PRI correspondente)?', options: mcq(rng, 'user.notice (PRI 13)', ['user.info (PRI 14)', 'daemon.notice (PRI 29)', 'local0.notice (PRI 133)', 'syslog.err (PRI 43)', 'mail.warning (PRI 20)']), explanation: 'O padrão do `logger` é `user.notice`: facility user (1) × 8 + notice (5) = 13. Use `-p facility.prioridade` para mudar (por exemplo `logger -p local3.warning -t meuapp "texto"`) e `-t` para definir a etiqueta (tag).', ref: ['102:p.308'], verify: { sh: 'd=$(mktemp -d)\npython3 - "$d/s" <<\'PY\' &\nimport socket, sys\ns = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM); s.bind(sys.argv[1]); s.settimeout(4)\nprint(s.recv(2048).decode(errors=\'replace\').split(">")[0] + ">")\nPY\nfor i in $(seq 1 60); do [ -S "$d/s" ] && break; sleep 0.05; done\nlogger -u "$d/s" mensagem\nwait\nrm -rf "$d"', expect: '<13>' } };
  },
};

// ------------------------------------------------------------------ ações e configuração do rsyslog (conceitual)
const gRsyslogFatos = {
  id: 'log-rsyslog-acoes-config', obj: '108.2', nivel: 2, peso: 2,
  make(rng) {
    const F = [
      ['Em uma regra do rsyslog, o que significa `*.* @@192.168.1.88:514`?', 'envia todas as mensagens ao servidor 192.168.1.88 usando **TCP** na porta 514', ['envia todas as mensagens ao servidor usando UDP na porta 514', 'grava as mensagens no arquivo @@192.168.1.88', 'recebe mensagens desse servidor via TCP', 'envia apenas as mensagens de prioridade 514'], 'tcp'],
      ['Em uma regra do rsyslog, o que significa `*.* @192.168.1.88`?', 'envia todas as mensagens ao servidor remoto usando **UDP** (porta padrão 514)', ['envia as mensagens usando TCP', 'grava as mensagens em /var/log/@192.168.1.88', 'descarta as mensagens desse IP', 'recebe mensagens desse IP'], 'udp'],
      ['Qual é a porta padrão do protocolo syslog para recebimento de logs remotos?', '514', ['22', '123', '25', '1514'], ''],
      ['O que o hífen (`-`) antes do nome do arquivo faz em `*.* -/var/log/syslog`?', 'evita a sincronização (flush) com o disco a cada mensagem, reduzindo gravações', ['cria o arquivo somente se não existir', 'compacta o arquivo', 'envia a mensagem também ao terminal', 'descarta as mensagens de prioridade debug'], ''],
      ['Qual ação do rsyslog envia a mensagem aos terminais dos usuários `root` e `carol`?', '*.emerg :omusrmsg:root,carol', ['*.emerg @root,carol', '*.emerg /dev/root,carol', '*.emerg |root,carol', '*.emerg wall root,carol'], ''],
      ['Qual módulo do rsyslog recebe mensagens locais pelo socket `/dev/log`?', 'imuxsock', ['imklog', 'imudp', 'imtcp', 'omfile'], ''],
      ['Qual módulo do rsyslog lê as mensagens do **kernel**?', 'imklog', ['imuxsock', 'imudp', 'imtcp', 'omusrmsg'], ''],
      ['Quais módulos precisam ser carregados para o rsyslog atuar como **servidor central** recebendo mensagens por UDP e TCP?', 'imudp e imtcp', ['imuxsock e imklog', 'omfile e omusrmsg', 'imudp e omtcp', 'imklog e imtcp'], ''],
      ['Qual diretiva do rsyslog.conf inclui os arquivos de configuração do diretório `/etc/rsyslog.d/`?', '$IncludeConfig /etc/rsyslog.d/*.conf', ['include /etc/rsyslog.d', '$LoadModule /etc/rsyslog.d/*.conf', 'source /etc/rsyslog.d/*.conf', '$Import /etc/rsyslog.d'], ''],
      ['No rsyslog, para onde vão por padrão os logs recebidos de clientes remotos em um servidor central, se não houver outra regra?', '/var/log/messages (junto com os locais)', ['/var/log/auth.log', '/var/log/remote.log', '/var/log/journal', '/dev/null'], ''],
      ['Qual comando valida a sintaxe de um arquivo de configuração do rsyslog **sem** iniciar o daemon?', 'rsyslogd -N1 -f /etc/rsyslog.conf', ['rsyslogd -t /etc/rsyslog.conf', 'rsyslogd --check-only', 'logger -N1', 'systemctl verify rsyslog'], 'verifica'],
      ['Qual comando insere manualmente uma mensagem no log do sistema, com a etiqueta `backup`, facility `local3` e prioridade `warning`?', 'logger -t backup -p local3.warning "texto"', ['logger -p backup local3.warning "texto"', 'logger -t local3.warning -p backup "texto"', 'syslog -t backup local3.warning "texto"', 'logger -f local3 -l warning "texto"'], ''],
      ['Quais são as três seções típicas do arquivo `/etc/rsyslog.conf`?', 'MODULES, GLOBAL DIRECTIVES e RULES', ['INPUT, OUTPUT e FORWARD', 'SERVER, CLIENT e RELAY', 'FACILITIES, PRIORITIES e ACTIONS', 'MAIN, LOCAL e REMOTE'], ''],
      ['Depois de editar `/etc/rsyslog.conf`, o que é preciso fazer para que as mudanças valham?', 'reiniciar (ou recarregar) o serviço rsyslog, por exemplo `systemctl restart rsyslog`', ['executar logger -r', 'executar hwclock --systohc', 'apagar /var/log/syslog', 'nada: o rsyslog relê o arquivo a cada minuto'], ''],
      ['Qual a diferença entre `rsyslog` e `systemd-journald` quanto ao formato de armazenamento?', 'o rsyslog grava texto puro em /var/log; o journald mantém um diário binário consultado com journalctl', ['ambos gravam texto puro em /var/log', 'ambos gravam apenas binários', 'o rsyslog é binário e o journald é texto', 'o journald só grava em memória e nunca em disco'], ''],
    ];
    const f = rng.pick(F);
    const out = {
      type: 'unica', text: f[0], options: mcq(rng, f[1], f[2]),
      explanation: `Regra do rsyslog: \`seletor  ação\`. Ações comuns: arquivo (\`/var/log/x\`, com \`-\` para não sincronizar), \`@host\` (UDP), \`@@host\` (TCP), \`:omusrmsg:usuário\` (terminal do usuário). Módulos: imuxsock (/dev/log), imklog (kernel), imudp/imtcp (recebimento remoto, porta 514). Configuração em /etc/rsyslog.conf e /etc/rsyslog.d/*.conf; validação com \`rsyslogd -N1\`; mensagens manuais com \`logger\`. Resposta: ${f[1]}.`,
      ref: ['102:p.303-312'],
    };
    if (f[3] === 'verifica') out.verify = { sh: "d=$(mktemp -d); printf 'module(load=\"imuxsock\")\\n*.* /dev/null\\n' > $d/ok.conf; rsyslogd -N1 -f $d/ok.conf >/dev/null 2>&1; echo $?; printf 'module(load=\"modulo_que_nao_existe\")\\n' > $d/ruim.conf; rsyslogd -N1 -f $d/ruim.conf >/dev/null 2>&1; echo $?; rm -rf $d", expect: '0\n1' };
    return out;
  },
};

// ------------------------------------------------------------------ logrotate: simulação (verificada com o logrotate real)
function lrSim(cfg, steps) {
  const rot = new Array(cfg.rotate + 2).fill(null); // rot[i] = {gz} para o arquivo .i
  let exists = false; let size = 0;
  for (const st of steps) {
    if (st === 'w') { exists = true; size = 1; }
    if (!exists) continue; // missingok
    if (size === 0 && cfg.notifempty) continue;
    if (cfg.rotate === 0) { exists = false; size = 0; if (cfg.create || cfg.copytruncate) { exists = true; } continue; }
    for (let i = cfg.rotate; i >= 2; i--) rot[i] = rot[i - 1];
    rot[1] = { gz: false, size };
    rot[cfg.rotate + 1] = null;
    if (cfg.compress) { if (cfg.delay) { if (rot[2] && !rot[2].gz) rot[2].gz = true; } else rot[1].gz = true; }
    size = 0; exists = !!(cfg.create || cfg.copytruncate);
  }
  const files = []; if (exists) files.push('app.log');
  for (let i = 1; i <= cfg.rotate; i++) if (rot[i]) files.push(`app.log.${i}${rot[i].gz ? '.gz' : ''}`);
  return files.sort();
}
function lrConf(cfg) {
  return [`/var/log/app/app.log {`, `    ${cfg.period}`, `    rotate ${cfg.rotate}`, cfg.compress ? '    compress' : '    nocompress', cfg.delay ? '    delaycompress' : null, cfg.notifempty ? '    notifempty' : '    ifempty', '    missingok', cfg.copytruncate ? '    copytruncate' : cfg.create ? '    create 0640 root adm' : '    nocreate', '}'].filter(Boolean).join('\n');
}
const gLrArquivos = {
  id: 'log-logrotate-arquivos', obj: '108.2', nivel: 3, peso: 3,
  make(rng) {
    const cfg = { period: rng.pick(['daily', 'weekly', 'monthly']), rotate: rng.int(2, 4), compress: rng.chance(0.75), delay: false, notifempty: rng.chance(0.5), create: rng.chance(0.7), copytruncate: false };
    if (cfg.compress) cfg.delay = rng.chance(0.55);
    const nSteps = rng.int(5, 7);
    const eProb = cfg.notifempty ? 0.4 : 0.25;
    const steps = Array.from({ length: nSteps }, (_, i) => (i === 0 || !rng.chance(eProb) ? 'w' : 'e'));
    if (!steps.includes('e') && rng.chance(0.7)) steps[rng.int(1, nSteps - 1)] = 'e';
    const right = lrSim(cfg, steps);
    const variants = [
      lrSim({ ...cfg, compress: !cfg.compress }, steps), lrSim({ ...cfg, delay: !cfg.delay, compress: true }, steps), lrSim({ ...cfg, rotate: cfg.rotate + 1 }, steps), lrSim({ ...cfg, rotate: cfg.rotate - 1 }, steps),
      lrSim({ ...cfg, create: !cfg.create }, steps), lrSim({ ...cfg, notifempty: !cfg.notifempty }, steps), lrSim(cfg, steps.map(() => 'w')),
    ].map((a) => a.join(' ')).filter((x) => x !== right.join(' '));
    const timeline = steps.map((s, i) => `${i + 1}ª rotação: ${s === 'w' ? 'o serviço gravou linhas no log antes' : 'nada foi gravado desde a última rotação'}`).join('\n');
    // verificação com o logrotate de verdade (rotação forçada a cada passo)
    const d = '$d';
    const conf = lrConf(cfg).replace('/var/log/app/app.log', `${d}/app.log`);
    const sh = [
      'd=$(mktemp -d)', `cat > "$d/lr.conf" <<EOC\n${conf}\nEOC`,
      ...steps.map((s) => `${s === 'w' ? `echo linha >> "$d/app.log"; ` : ''}logrotate -f -s "$d/state" "$d/lr.conf" >/dev/null 2>&1`),
      `cd "$d" && ls | grep '^app' | sort | paste -sd' ' -`, 'rm -rf "$d"',
    ].join('\n');
    return {
      type: 'unica',
      text: `Um bloco de \`/etc/logrotate.d/app\` tem o conteúdo abaixo (a política de \`${cfg.period}\` aqui não importa: as rotações são forçadas com \`logrotate -f\`):\n\n${block(lrConf(cfg))}\n\nNão existe nenhum arquivo antigo no início. Sequência:\n\n${block(timeline)}\n\nDepois da última rotação, que arquivos \`app.log*\` existem no diretório? (listados em ordem alfabética)`,
      options: mcq(rng, right.join(' ') || '(nenhum)', variants.concat(['app.log.1 app.log.2 app.log.3.gz'])),
      explanation: `A cada rotação o logrotate desloca os arquivos numerados (\`.1\` → \`.2\` …), descarta o que passa de \`rotate ${cfg.rotate}\` e move o log atual para \`.1\`. ${cfg.notifempty ? '`notifempty` pula a rotação quando o log está vazio. ' : '`ifempty` rotaciona mesmo vazio. '}${cfg.compress ? (cfg.delay ? '`compress` + `delaycompress`: o `.1` fica sem compactar e só é compactado (`.2.gz`) na rotação seguinte. ' : '`compress` sem delaycompress: o arquivo rotacionado já nasce `.1.gz`. ') : 'Sem `compress`, nenhum arquivo é compactado. '}${cfg.create ? '`create` recria o `app.log` vazio após a rotação. ' : 'Sem `create`, o `app.log` só reaparece quando o serviço voltar a gravar — logo, não existe logo após a rotação. '}Resultado: ${right.join(' ') || '(nenhum)'}.`,
      ref: ['102:p.313-316'], verify: { sh, expect: right.join(' ') },
    };
  },
};

const LR_FACTS = [
  ['Qual diretiva do logrotate **evita mensagem de erro** quando o arquivo de log não existe?', 'missingok', ['notifempty', 'nocreate', 'ifempty', 'delaycompress'], 'missingok'],
  ['Qual diretiva do logrotate faz com que um log **vazio não seja rotacionado**?', 'notifempty', ['missingok', 'ifempty', 'nocompress', 'sharedscripts'], ''],
  ['O que faz a diretiva `delaycompress` (usada junto com `compress`)?', 'adia a compactação do log anterior para o próximo ciclo de rotação', ['compacta o log duas vezes', 'compacta apenas logs vazios', 'desativa a compactação', 'compacta somente o log atual, antes de rotacionar'], ''],
  ['O que significa `rotate 4` em um bloco do logrotate?', 'mantém 4 arquivos rotacionados; o mais antigo é removido na rotação seguinte', ['rotaciona o log a cada 4 dias', 'rotaciona apenas 4 vezes e depois para', 'mantém apenas 4 linhas', 'executa 4 scripts postrotate'], ''],
  ['Em um bloco com `weekly` e `rotate 7`, quanto tempo de histórico fica disponível?', 'cerca de 7 semanas', ['7 dias', '7 meses', '7 horas', '1 semana'], ''],
  ['O que faz a diretiva `create 0640 root adm`?', 'cria um novo arquivo de log vazio após a rotação, com modo 0640, dono root e grupo adm', ['cria um backup do log com modo 0640', 'altera as permissões dos arquivos antigos para root:adm', 'cria o diretório /var/log/adm', 'rotaciona apenas se o dono for root'], ''],
  ['Para que serve `copytruncate`?', 'copia o log para o arquivo rotacionado e **trunca** o original, sem exigir que o programa reabra o arquivo', ['move o log e cria um novo com o mesmo inode', 'compacta e apaga o log antigo', 'trunca o log sem guardar cópia', 'copia o log para outro servidor'], ''],
  ['Entre `postrotate` e `endscript` ficam...', 'comandos shell executados depois de rotacionar o log (por exemplo, pedir ao serviço que reabra o log)', ['a lista de arquivos a rotacionar', 'o horário da próxima rotação', 'as permissões do novo log', 'os usuários autorizados a rotacionar'], ''],
  ['O que faz `sharedscripts` quando o bloco casa com vários arquivos (por exemplo `/var/log/mail/*`)?', 'executa os scripts prerotate/postrotate uma única vez, e não uma vez para cada arquivo', ['executa os scripts em todos os servidores', 'compartilha o log entre usuários', 'proíbe scripts no bloco', 'executa os scripts só se todos os logs estiverem vazios'], ''],
  ['Qual diretiva acrescenta a **data** ao nome dos arquivos rotacionados (em vez de números)?', 'dateext', ['dateformat', 'nodateext', 'datename', 'rotate-date'], ''],
  ['Qual diretiva do logrotate faz a rotação quando o log atinge determinado tamanho (por exemplo, 10 MB)?', 'size 10M', ['maxlines 10M', 'limit 10M', 'bytes 10M', 'weekly 10M'], ''],
  ['Que arquivo é a configuração **global** do logrotate, e onde ficam os blocos específicos de cada pacote?', '/etc/logrotate.conf e /etc/logrotate.d/', ['/etc/rsyslog.conf e /etc/rsyslog.d/', '/etc/cron.daily/logrotate e /var/log/', '/var/lib/logrotate e /etc/logrotate.status', '/etc/logrotate.d/ e /etc/logrotate.conf.d/'], ''],
  ['Como o logrotate costuma ser executado automaticamente em distribuições tradicionais?', 'diariamente, por um job do cron (/etc/cron.daily/logrotate) ou timer do systemd', ['pelo próprio rsyslogd a cada mensagem', 'somente manualmente pelo root', 'pelo kernel quando o disco enche', 'pelo daemon atd uma vez por semana'], ''],
  ['Qual opção do logrotate mostra o que seria feito **sem alterar nada** (modo debug)?', 'logrotate -d /etc/logrotate.conf', ['logrotate -f /etc/logrotate.conf', 'logrotate -v -s /etc/logrotate.conf', 'logrotate -t /etc/logrotate.conf', 'logrotate --dry /etc/logrotate.conf'], ''],
  ['Qual opção do logrotate **força** a rotação mesmo que não seja o momento?', 'logrotate -f /etc/logrotate.conf', ['logrotate -d /etc/logrotate.conf', 'logrotate -s /etc/logrotate.conf', 'logrotate -r /etc/logrotate.conf', 'logrotate --now-only'], ''],
];
const gLrFatos = {
  id: 'log-logrotate-diretivas', obj: '108.2', nivel: 1, peso: 2,
  make(rng) {
    const f = rng.pick(LR_FACTS);
    const out = {
      type: 'unica', text: f[0], options: mcq(rng, f[1], f[2]),
      explanation: `O logrotate lê /etc/logrotate.conf (opções globais, \`include /etc/logrotate.d\`) e os blocos por serviço. Diretivas: periodicidade (\`daily|weekly|monthly\`, \`size\`), \`rotate N\` (quantos arquivos antigos guardar), \`compress\`/\`delaycompress\`, \`missingok\`, \`notifempty\`, \`create modo dono grupo\` ou \`copytruncate\`, \`sharedscripts\` e scripts \`postrotate … endscript\`. Definições locais prevalecem sobre as globais. Resposta: ${f[1]}.`,
      ref: ['102:p.313-316'],
    };
    if (f[3] === 'missingok') out.verify = { sh: 'd=$(mktemp -d); printf "%s/nope.log {\\n rotate 2\\n}\\n" "$d" > "$d/a.conf"; logrotate -f -s "$d/s" "$d/a.conf" >/dev/null 2>&1; echo $?; printf "%s/nope.log {\\n rotate 2\\n missingok\\n}\\n" "$d" > "$d/b.conf"; logrotate -f -s "$d/s" "$d/b.conf" >/dev/null 2>&1; echo $?; rm -rf "$d"', expect: '1\n0' };
    return out;
  },
};

// ------------------------------------------------------------------ journalctl (conceitual)
const JC = [
  ['exibir as mensagens do **kernel**', 'journalctl -k', ['journalctl -u kernel', 'journalctl -b', 'journalctl --kernel-only -f', 'journalctl _PID=0']],
  ['exibir apenas as mensagens da unidade `ssh.service`', 'journalctl -u ssh.service', ['journalctl -s ssh.service', 'journalctl --service ssh', 'journalctl ssh', 'journalctl -b ssh.service']],
  ['exibir somente as mensagens de **erro ou mais graves** da inicialização atual', 'journalctl -b -p err', ['journalctl -b -p =err', 'journalctl -p err -k -f', 'journalctl --boot=err', 'journalctl -b PRIORITY>=3']],
  ['acompanhar o diário **em tempo real**, como um `tail -f`', 'journalctl -f', ['journalctl -e', 'journalctl -r', 'journalctl --follow-off', 'journalctl -n']],
  ['exibir as **últimas 20 entradas** do diário', 'journalctl -n 20', ['journalctl -l 20', 'journalctl --head 20', 'journalctl -20r', 'journalctl --last=20 -f']],
  ['exibir as mensagens da **inicialização anterior**', 'journalctl -b -1', ['journalctl -b 1', 'journalctl --prev', 'journalctl -b previous -k', 'journalctl --list-boots -1']],
  ['**listar as inicializações** (boots) registradas no diário', 'journalctl --list-boots', ['journalctl -b list', 'journalctl --boots', 'journalctl -B', 'journalctl -b -l']],
  ['exibir as entradas em **ordem inversa** (mais recentes primeiro)', 'journalctl -r', ['journalctl -e', 'journalctl -f', 'journalctl --reverse-off', 'journalctl -n -1']],
  ['exibir as mensagens entre 19:00 e 19:01 de hoje', 'journalctl --since "19:00:00" --until "19:01:00"', ['journalctl --from 19:00 --to 19:01', 'journalctl -s 19:00 -u 19:01', 'journalctl --between 19:00:00 19:01:00', 'journalctl -b 19:00..19:01']],
  ['exibir as mensagens registradas **desde ontem**', 'journalctl --since yesterday', ['journalctl --since -1', 'journalctl --after yesterday', 'journalctl -y', 'journalctl --yesterday']],
  ['exibir as mensagens geradas pelo executável `/usr/sbin/sshd`', 'journalctl /usr/sbin/sshd', ['journalctl -x /usr/sbin/sshd', 'journalctl --exe=sshd -f', 'journalctl -u /usr/sbin/sshd -e', 'journalctl -p /usr/sbin/sshd']],
  ['exibir somente as entradas com `PRIORITY=3`', 'journalctl PRIORITY=3', ['journalctl -P 3 --only', 'journalctl --priority=3 -k', 'journalctl PRIORITY>3', 'journalctl _PRIORITY==3 -f']],
  ['ver quanto **espaço em disco** os arquivos do diário ocupam', 'journalctl --disk-usage', ['journalctl --size', 'journalctl -du', 'journalctl --vacuum-size', 'journalctl --space']],
  ['descartar os arquivos **arquivados** do diário com mais de 2 semanas', 'journalctl --vacuum-time=2weeks', ['journalctl --vacuum-size=2weeks', 'journalctl --rotate=2weeks', 'journalctl --clean 2w', 'journalctl --since=-2weeks --delete']],
  ['reduzir os arquivos arquivados do diário para **no máximo 200 MiB**', 'journalctl --vacuum-size=200M', ['journalctl --vacuum-time=200M', 'journalctl --max-size=200M', 'journalctl --disk-limit 200M', 'journalctl --vacuum-files=200M']],
  ['manter no máximo **10 arquivos** de diário arquivados', 'journalctl --vacuum-files=10', ['journalctl --vacuum-size=10', 'journalctl --keep 10', 'journalctl --max-files=10 -r', 'journalctl --rotate -n 10']],
  ['ler o diário de um sistema defeituoso montado em `/mnt/sistema` (a partir do sistema de resgate)', 'journalctl -D /mnt/sistema/var/log/journal/', ['journalctl -b /mnt/sistema', 'journalctl --mount /mnt/sistema', 'journalctl -u /mnt/sistema', 'journalctl --system /mnt/sistema -k']],
  ['verificar a consistência interna dos arquivos do diário', 'journalctl --verify', ['journalctl --check-only', 'journalctl --fsck', 'journalctl -v', 'journalctl --sync']],
];
const gJournalCmd = {
  id: 'log-journalctl-comando', obj: '108.2', nivel: 2, peso: 3,
  make(rng) {
    const [d, ok, bad] = rng.pick(JC);
    return {
      type: 'unica', text: `Como root, qual comando faz o seguinte: ${d}?`, options: mcq(rng, ok, bad),
      explanation: `Opções do journalctl: \`-k\` kernel, \`-u unidade\`, \`-b [n]\` boot (0 atual, -1 anterior; \`--list-boots\` lista), \`-p prioridade\`, \`-f\` acompanhar, \`-n N\` últimas N linhas, \`-r\` ordem inversa, \`--since/--until\` intervalo de tempo, \`/caminho/do/executável\`, \`CAMPO=valor\`, \`--disk-usage\`, \`--vacuum-time|size|files=\` (só remove arquivos arquivados), \`-D diretório\` (diário de outro sistema). Resposta: \`${ok}\`.`,
      ref: ['102:p.326-342'],
    };
  },
};

const gJournalPrio = {
  id: 'log-journalctl-prioridades', obj: '108.2', nivel: 3, peso: 2,
  make(rng) {
    const a = rng.int(0, 6); const b = rng.int(a + 1, 7);
    const mode = rng.pick(['simples', 'faixa', 'faixa-num']);
    const levels = (lo, hi) => PRI.slice(lo, hi + 1);
    let cmd; let set;
    if (mode === 'simples') { const p = rng.int(1, 7); cmd = `journalctl -p ${PRI[p]}`; set = levels(0, p); }
    else if (mode === 'faixa') { cmd = `journalctl -p ${PRI[a]}..${PRI[b]}`; set = levels(a, b); }
    else { cmd = `journalctl -p ${b}..${a}`; set = levels(a, b); }
    const fmt = (s) => s.join(', ');
    const lo = PRI.indexOf(set[0]); const hi = PRI.indexOf(set[set.length - 1]);
    const rand = []; for (let x = 0; x < 8; x++) for (let y = x; y < 8; y++) rand.push(levels(x, y));
    const must = [levels(0, hi), levels(lo, 7), [PRI[lo], PRI[hi]], levels(Math.max(0, lo - 1), hi), levels(lo, Math.min(7, hi + 1)), levels(0, 7)];
    const pool = [...new Set([...must.map(fmt), ...rng.shuffle(rand).slice(0, 8).map(fmt)])].filter((x) => x !== fmt(set));
    return {
      type: 'unica',
      text: `Quais níveis de prioridade são exibidos pelo comando abaixo?\n\n${block(cmd)}`,
      options: mcq(rng, fmt(set), pool),
      explanation: `Com \`-p nível\` o journalctl mostra esse nível **e os mais graves** (menor número). Com **faixa** \`-p A..B\` mostra do nível A ao B, em qualquer ordem de escrita (nomes ou números: 0 emerg, 1 alert, 2 crit, 3 err, 4 warning, 5 notice, 6 info, 7 debug). Aqui: ${fmt(set)}.`,
      ref: ['102:p.330', '102:p.352'],
    };
  },
};

// ------------------------------------------------------------------ journald: armazenamento e configuração (conceitual)
const JF = [
  ['Se o diretório `/var/log/journal/` **não existe** e `Storage=auto` (padrão), onde o journald grava o diário?', 'em /run/log/journal/ (volátil: perdido ao reiniciar)', ['em /var/log/journal/, que ele cria', 'em /var/log/messages', 'em /etc/systemd/journal/', 'em lugar nenhum: o diário fica desativado']],
  ['O que faz `Storage=persistent` em `/etc/systemd/journald.conf`?', 'grava o diário em /var/log/journal/, criando o diretório se necessário', ['grava somente em memória, em /run/log/journal/', 'descarta todos os dados', 'grava somente se /var/log/journal já existir', 'envia o diário para o rsyslog']],
  ['O que faz `Storage=volatile`?', 'mantém o diário apenas em memória, em /run/log/journal/', ['grava em /var/log/journal/', 'desativa o diário', 'cria arquivos .journal~ no disco', 'envia as mensagens ao kernel']],
  ['O que faz `Storage=none`?', 'descarta os dados de log (o encaminhamento para console/syslog ainda é possível)', ['grava o diário em /dev/null e desliga o journald', 'grava apenas mensagens do kernel', 'grava em /var/log/journal sem compressão', 'mantém o diário na memória']],
  ['Qual comando lê o diário do systemd, já que ele **não é texto puro**?', 'journalctl', ['less /var/log/journal/system.journal', 'cat /run/log/journal/*', 'tail -f /var/log/journald', 'rsyslogctl']],
  ['Qual é o arquivo de configuração principal do systemd-journald?', '/etc/systemd/journald.conf', ['/etc/journald/journal.conf', '/etc/rsyslog.conf', '/etc/systemd/system.conf', '/var/log/journal/journald.conf']],
  ['Qual opção do journald.conf limita o espaço total que o diário **persistente** pode ocupar?', 'SystemMaxUse=', ['RuntimeMaxUse=', 'SystemKeepFree=', 'MaxFileSec=', 'Storage=']],
  ['Qual opção do journald.conf limita o espaço do diário **volátil** (em /run)?', 'RuntimeMaxUse=', ['SystemMaxUse=', 'MaxRetentionSec=', 'ForwardToSyslog=', 'Storage=']],
  ['Qual opção do journald.conf faz o journald encaminhar as mensagens para um socket de um daemon syslog tradicional?', 'ForwardToSyslog=yes', ['ForwardToKMsg=yes', 'Storage=syslog', 'SyslogTarget=rsyslog', 'MaxLevelStore=syslog']],
  ['Quais opções do journald.conf enviam as mensagens para `/dev/tty5`?', 'ForwardToConsole=yes e TTYPath=/dev/tty5', ['Storage=tty e Console=/dev/tty5', 'ForwardToWall=yes e TTY=5', 'ForwardToKMsg=yes e TTYPath=tty5', 'ConsoleOut=/dev/tty5']],
  ['Depois de alterar `/etc/systemd/journald.conf`, o que é preciso fazer?', 'reiniciar o serviço: systemctl restart systemd-journald', ['executar journalctl --reload', 'reiniciar o cron', 'executar logger -r', 'nada: a configuração é lida a cada mensagem']],
  ['O diretório de armazenamento do diário tem como nome...', 'o machine-id da máquina (conteúdo de /etc/machine-id), dentro de /var/log/journal/ ou /run/log/journal/', ['o nome do host', 'o PID do systemd', 'a data da primeira inicialização', 'o nome do usuário root']],
  ['`journalctl --vacuum-size=100M` remove...', 'arquivos de diário **arquivados**, até que o total fique abaixo de 100 MiB (os ativos não são removidos)', ['qualquer mensagem maior que 100 MiB', 'qualquer arquivo, ativo ou arquivado', 'o diário inteiro, se ocupar mais de 100 MiB', 'apenas mensagens do kernel']],
];
const gJournalCfg = {
  id: 'log-journald-conceitos', obj: '108.2', nivel: 2, peso: 2,
  make(rng) {
    const f = rng.pick(JF);
    return {
      type: 'unica', text: f[0], options: mcq(rng, f[1], f[2]),
      explanation: `systemd-journald: configuração em /etc/systemd/journald.conf. \`Storage=\` — \`volatile\` (só /run/log/journal), \`persistent\` (/var/log/journal, criado se preciso), \`auto\` (padrão: persistente só se /var/log/journal já existir) e \`none\` (descarta). Limites: \`System*\` (persistente) e \`Runtime*\` (volátil): MaxUse, KeepFree, MaxFileSize, MaxFiles. O diário é binário: use journalctl. Resposta: ${f[1]}.`,
      ref: ['102:p.326', '102:p.336-343'],
    };
  },
};

// ------------------------------------------------------------------ arquivos de log e ferramentas de leitura (conceitual)
const LOGF = [
  ['/var/log/auth.log', 'autenticação e uso de sudo (Debian/Ubuntu)', 'less'],
  ['/var/log/syslog', 'mensagens gerais coletadas pelo rsyslog (Debian/Ubuntu)', 'less'],
  ['/var/log/messages', 'mensagens gerais não relacionadas ao kernel (Red Hat/SUSE) e destino padrão de logs remotos', 'less'],
  ['/var/log/kern.log', 'mensagens do kernel', 'less'],
  ['/var/log/dpkg.log', 'operações do gerenciador de pacotes dpkg (Debian)', 'less'],
  ['/var/log/mail.log', 'atividade do servidor de e-mail', 'less'],
  ['/var/log/wtmp', 'histórico de logins bem-sucedidos (binário)', 'last'],
  ['/var/log/btmp', 'tentativas de login malsucedidas (binário)', 'lastb'],
  ['/var/log/lastlog', 'data/hora do último login de cada usuário (binário)', 'lastlog'],
  ['/var/log/faillog', 'contador de falhas de autenticação por usuário (binário)', 'faillog'],
];
const gLogFiles = {
  id: 'log-arquivos-ferramentas', obj: '108.2', nivel: 1, peso: 2,
  make(rng) {
    const [file, desc, tool] = rng.pick(LOGF);
    const fmt = rng.pick(['arquivo', 'arquivo', 'ferramenta']);
    if (fmt === 'ferramenta') {
      const bin = LOGF.filter((x) => x[2] !== 'less');
      const [bf, bd, bt] = rng.pick(bin);
      return {
        type: 'unica', text: `Qual comando exibe o conteúdo do arquivo binário \`${bf}\` (${bd})?`, options: mcq(rng, bt, ['less', 'cat', 'journalctl', 'who', 'last', 'lastb', 'lastlog', 'faillog'].filter((x) => x !== bt)),
        explanation: `Arquivos binários não se leem com cat/less: \`/var/log/wtmp\` → \`last\`; \`/var/log/btmp\` → \`lastb\`; \`/var/log/lastlog\` → \`lastlog\`; \`/var/log/faillog\` → \`faillog\`; \`who\`/\`w\` usam /var/run/utmp (usuários conectados agora). O diário do systemd → \`journalctl\`. Resposta: \`${bt}\`.`,
        ref: ['102:p.298-303'],
      };
    }
    return {
      type: 'unica', text: `Qual arquivo de log registra: ${desc}?`, options: mcq(rng, file, LOGF.filter((x) => x[0] !== file).map((x) => x[0])),
      explanation: `Arquivos em /var/log: auth.log (autenticação, sudo — Red Hat usa /var/log/secure), syslog (geral no Debian) / messages (geral no Red Hat/SUSE), kern.log (kernel; também \`dmesg\`), mail.log, dpkg.log (Debian); wtmp/btmp/lastlog/faillog são binários, lidos com last/lastb/lastlog/faillog. Resposta: \`${file}\` — ${desc}.`,
      ref: ['102:p.298-299'],
    };
  },
};

export const generators = [gSelCasa, gSelRegra, gSyslogNum, gRsyslogFatos, gLrArquivos, gLrFatos, gJournalCmd, gJournalPrio, gJournalCfg, gLogFiles];
