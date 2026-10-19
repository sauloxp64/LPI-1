// 107.3 — localização (locale, fuso horário, iconv) e 108.1 — data/hora do sistema (date, hwclock, timedatectl, NTP, chrony).
import { mcq, multi, block, pad } from './util.mjs';
import { sq, DOW_EN, DOW_EN_FULL, MON_EN, MON_EN_FULL, listPt } from './admin-lib.mjs';

// ================================================================== 107.3
const LOCS = ['pt_BR.UTF-8', 'en_US.UTF-8', 'C'];
const CATS = ['LC_TIME', 'LC_COLLATE', 'LC_MESSAGES', 'LC_NUMERIC', 'LC_MONETARY', 'LC_CTYPE'];
const resolveLoc = (env, cat) => (env.LC_ALL ? env.LC_ALL : env[cat] ? env[cat] : env.LANG);
const envLines = (env) => Object.entries(env).map(([k, v]) => `export ${k}=${v}`).join('\n');
const envArgs = (env) => Object.entries(env).map(([k, v]) => `${k}=${sq(v)}`).join(' ');

/** Sorteia um ambiente de variáveis de localização: LANG sempre; LC_ALL às vezes (ou vazio); 0-2 LC_* específicas. */
function randomEnv(rng, mustCat = null) {
  const env = { LANG: rng.pick(LOCS) };
  const x = rng.next();
  if (x < 0.4) env.LC_ALL = rng.pick(LOCS); else if (x < 0.55) env.LC_ALL = '';
  const cats = rng.sample(CATS, rng.int(0, 2));
  if (mustCat && rng.chance(0.6) && !cats.includes(mustCat)) cats.push(mustCat);
  for (const c of cats) env[c] = rng.pick(LOCS);
  return env;
}
const localeShell = (env, cat) => `env -i PATH="$PATH" ${envArgs(env)} locale | grep "^${cat}=" | sed 's/.*=//; s/"//g'`;

const gLocEfetivo = {
  id: 'i18n-locale-efetivo', obj: '107.3', nivel: 3, peso: 3,
  make(rng) {
    const cat = rng.pick(CATS);
    const env = randomEnv(rng, cat);
    const eff = resolveLoc(env, cat);
    const pool = [...LOCS, 'C.UTF-8', 'POSIX'].filter((x) => x !== eff);
    const emptyAll = env.LC_ALL === '';
    return {
      type: 'unica',
      text: `Em uma sessão do shell foram executados os comandos abaixo (todos os locales citados estão instalados):\n\n${block(`${envLines(env)}\nlocale`)}\n\nQual valor o comando \`locale\` exibirá para **${cat}**?`,
      options: mcq(rng, eff, pool),
      explanation: `Precedência das variáveis de localização: **LC_ALL** (se tiver valor) > a variável específica **${cat}** > **LANG**. ${env.LC_ALL ? `\`LC_ALL=${env.LC_ALL}\` tem valor e vence tudo` : emptyAll ? '`LC_ALL=` está **vazia**, e uma variável vazia é tratada como não definida' : 'LC_ALL não está definida'}${!env.LC_ALL && env[cat] ? `; \`${cat}=${env[cat]}\` vence LANG` : ''}${!env.LC_ALL && !env[cat] ? `; sem \`${cat}\`, vale o \`LANG=${env.LANG}\`` : ''}. Resultado: **${eff}**.`,
      ref: ['102:p.248-250'],
      verify: { sh: localeShell(env, cat), expect: eff },
    };
  },
};

// nomes de dias/meses por locale (conferidos com o `date` da imagem)
const NAMES = {
  en: { a: DOW_EN, A: DOW_EN_FULL, b: MON_EN, B: MON_EN_FULL },
  pt: { a: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], A: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'], b: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'], B: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] },
};
const langOf = (loc) => (loc.startsWith('pt') ? 'pt' : 'en');

const gLocSaida = {
  id: 'i18n-efeito-locale', obj: '107.3', nivel: 3, peso: 3,
  make(rng) {
    const fmt = rng.pick(['data', 'data', 'mensagem', 'numero']);
    const ref = ['102:p.248-250'];
    if (fmt === 'data') {
      const env = randomEnv(rng, 'LC_TIME');
      const eff = resolveLoc(env, 'LC_TIME');
      const N = 1700000000 + rng.int(0, 300) * 86400 + rng.int(0, 86399);
      const d = new Date(N * 1000);
      const F = {
        '%A': (L, x) => NAMES[L].A[x.getUTCDay()], '%B': (L, x) => NAMES[L].B[x.getUTCMonth()],
        '%a %b': (L, x) => NAMES[L].a[x.getUTCDay()] + ' ' + NAMES[L].b[x.getUTCMonth()], '%d de %B': (L, x) => pad(x.getUTCDate()) + ' de ' + NAMES[L].B[x.getUTCMonth()],
      };
      const key = rng.pick(Object.keys(F)); const f = [key];
      const L0 = langOf(eff); const L1 = L0 === 'pt' ? 'en' : 'pt';
      const day = (k) => new Date((N + k * 86400) * 1000);
      const right = F[key](L0, d);
      const pool = [F[key](L1, d), F[key](L0, day(1)), F[key](L0, day(-1)), F[key](L0, day(31)), F[key](L1, day(1)), F[key](L0, day(-31))];
      if (key === '%a %b') pool.push(NAMES[L1].a[d.getUTCDay()] + ' ' + NAMES[L0].b[d.getUTCMonth()], NAMES[L0].a[d.getUTCDay()] + ' ' + NAMES[L1].b[d.getUTCMonth()]);
      return {
        type: 'unica',
        text: `Com as variáveis abaixo exportadas (locales instalados), qual é a saída do comando \`date -u -d @${N} '+${f[0]}'\`?\n\n${block(envLines(env))}`,
        options: mcq(rng, right, [...new Set(pool)].filter((x) => x !== right)),
        explanation: `O formato de data e os nomes de dias/meses vêm de **LC_TIME**. Precedência: LC_ALL > LC_TIME > LANG. Aqui LC_TIME efetivo = **${eff}** → nomes em ${langOf(eff) === 'pt' ? 'português' : 'inglês (o locale C também usa inglês)'}. Saída: \`${right}\`.`,
        ref, verify: { sh: `env -i PATH="$PATH" ${envArgs(env)} date -u -d @${N} '+${f[0]}'`, expect: right },
      };
    }
    if (fmt === 'mensagem') {
      let env = randomEnv(rng, 'LC_MESSAGES');
      // com LC_CTYPE efetivo = C os acentos sairiam como '?': mantém o cenário simples
      while (langOf(resolveLoc(env, 'LC_MESSAGES')) === 'pt' && resolveLoc(env, 'LC_CTYPE') === 'C') env = randomEnv(rng, 'LC_MESSAGES');
      const eff = resolveLoc(env, 'LC_MESSAGES');
      const pt = "ls: não foi possível acessar '/inexistente': Arquivo ou diretório inexistente";
      const en = "ls: cannot access '/inexistente': No such file or directory";
      const right = langOf(eff) === 'pt' ? pt : en;
      return {
        type: 'unica',
        text: `Com as variáveis abaixo exportadas (locales instalados), qual mensagem o comando \`ls /inexistente\` imprime?\n\n${block(envLines(env))}`,
        options: mcq(rng, right, [langOf(eff) === 'pt' ? en : pt, "ls: cannot access '/inexistente': Arquivo ou diretório inexistente", "ls: não foi possível acessar '/inexistente': No such file or directory", 'ls: /inexistente: arquivo não encontrado (ENOENT)']),
        explanation: `O idioma das mensagens dos programas GNU vem de **LC_MESSAGES** (precedência: LC_ALL > LC_MESSAGES > LANG). Aqui LC_MESSAGES efetivo = **${eff}** → mensagens em ${langOf(eff) === 'pt' ? 'português' : 'inglês (C/POSIX e en_US são inglês)'}.`,
        ref, verify: { sh: `env -i PATH="$PATH" ${envArgs(env)} ls /inexistente 2>&1`, expect: right },
      };
    }
    const env = randomEnv(rng, 'LC_NUMERIC');
    const eff = resolveLoc(env, 'LC_NUMERIC');
    const dec = langOf(eff) === 'pt' ? ',' : '.';
    const right = ['1', '1.5', '2'].map((v) => (v.includes('.') ? v.replace('.', dec) : v + dec + '0')).join(' ');
    const mk = (d) => ['1', '1.5', '2'].map((v) => (v.includes('.') ? v.replace('.', d) : `${v}${d}0`)).join(' ');
    return {
      type: 'unica',
      text: `Com as variáveis abaixo exportadas (locales instalados), o que o comando \`seq 1 0.5 2 | paste -sd' '\` imprime?\n\n${block(envLines(env))}`,
      options: mcq(rng, right, [mk(dec === ',' ? '.' : ','), '1 1,5 2', '1 1.5 2', '1,000 1,500 2,000', '1.0 1,5 2.0']),
      explanation: `O separador decimal vem de **LC_NUMERIC** (precedência: LC_ALL > LC_NUMERIC > LANG). Aqui o valor efetivo é **${eff}** → separador decimal "${dec}". O \`seq\` respeita a localidade: com pt_BR escreve \`1,0 1,5 2,0\`; com en_US ou C, \`1.0 1.5 2.0\`.`,
      ref, verify: { sh: `env -i PATH="$PATH" ${envArgs(env)} seq 1 0.5 2 | paste -sd' ' -`, expect: right },
    };
  },
};

// ------------------------------------------------------------------ ordenação por locale
const stripAcc = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
function collate(a, b, loc) {
  if (loc === 'C') return Buffer.compare(Buffer.from(a), Buffer.from(b));
  const pa = stripAcc(a).toLowerCase(); const pb = stripAcc(b).toLowerCase();
  if (pa !== pb) return pa < pb ? -1 : 1;
  const sa = a.toLowerCase(); const sb = b.toLowerCase();
  if (sa !== sb) return sa < sb ? -1 : 1; // sem acento antes de com acento
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] === a[i].toLowerCase() ? -1 : 1; // minúscula antes de maiúscula
  return 0;
}
const sortBy = (words, loc) => words.slice().sort((x, y) => collate(x, y, loc));
const WORDS = ['banana', 'Banana', 'abacaxi', 'Abacaxi', 'cereja', 'Cereja', 'maçã', 'maca', 'mamão', 'Zebra', 'zebra', 'árvore', 'Árvore', 'avião', 'Avião', 'uva', 'Uva', 'laranja', 'limão', 'Limão', 'ônibus', 'oficina', 'Ovo', 'ovo'];

const gLocOrdem = {
  id: 'i18n-ordenacao-locale', obj: '107.3', nivel: 3, peso: 2,
  make(rng) {
    const words = rng.sample(WORDS, 5);
    const useEnv = rng.chance(0.4);
    let loc; let cmd; let envShown = '';
    if (useEnv) {
      const env = { LANG: rng.pick(LOCS) }; if (rng.chance(0.5)) env.LC_COLLATE = rng.pick(LOCS); if (rng.chance(0.3)) env.LC_ALL = rng.pick(LOCS);
      loc = resolveLoc(env, 'LC_COLLATE'); envShown = `${envLines(env)}\n`; cmd = `printf '%s\\n' ${words.join(' ')} | sort`;
      var sh = `env -i PATH="$PATH" ${envArgs(env)} bash -c ${sq(`printf '%s\\n' ${words.join(' ')} | sort | paste -sd' ' -`)}`;
    } else {
      loc = rng.pick(LOCS); cmd = `printf '%s\\n' ${words.join(' ')} | LC_ALL=${loc} sort`;
      sh = `printf '%s\\n' ${words.join(' ')} | LC_ALL=${loc} sort | paste -sd' ' -`;
    }
    const right = sortBy(words, loc).join(' ');
    const others = LOCS.filter((l) => l !== loc && (collate !== null)).map((l) => sortBy(words, l).join(' '));
    const ci = words.slice().sort((x, y) => (x.toLowerCase() < y.toLowerCase() ? -1 : x.toLowerCase() > y.toLowerCase() ? 1 : 0)).join(' ');
    const rev = sortBy(words, loc).reverse().join(' ');
    const base = sortBy(words, loc);
    const swaps = [0, 1, 2, 3].map((i) => { const c = base.slice(); [c[i], c[i + 1]] = [c[i + 1], c[i]]; return c.join(' '); });
    return {
      type: 'unica',
      text: `${envShown ? `Variáveis exportadas:\n\n${block(envShown.trim())}\n\n` : ''}Qual é a saída do comando abaixo (locales instalados)?\n\n${block(cmd)}`,
      options: mcq(rng, right, [...others, ci, rev, ...swaps].filter((x) => x !== right)),
      explanation: `A ordem de \`sort\` depende de **LC_COLLATE** (efetivo: **${loc}**). No locale **C** a comparação é por **bytes**: maiúsculas (A-Z) vêm antes de todas as minúsculas e letras acentuadas (UTF-8) ficam no fim. Em **en_US/pt_BR** a comparação ignora maiúsculas/minúsculas e acentos nos primeiros níveis (\`árvore\` entre \`Abacaxi\` e \`banana\`), e a minúscula vem antes da maiúscula em caso de empate (\`banana Banana\`). Por isso scripts costumam usar \`LC_ALL=C\` para ter ordenação previsível. Resultado: ${right}.`,
      ref: ['102:p.248', '102:p.250'], verify: { sh, expect: right },
    };
  },
};

// ------------------------------------------------------------------ TZ
const TZS = [['Etc/GMT+3', '-0300'], ['Etc/GMT-3', '+0300'], ['Etc/GMT+5', '-0500'], ['Etc/GMT-9', '+0900'], ['UTC-3', '+0300'], ['UTC+5', '-0500'], ['EST5', '-0500'], ['BRT3', '-0300'], ['CET-1', '+0100'], ['America/Sao_Paulo', '-0300'], ['Asia/Tokyo', '+0900'], ['Asia/Kolkata', '+0530'], ['Asia/Kathmandu', '+0545'], ['Australia/Eucla', '+0845'], ['Asia/Dubai', '+0400'], ['America/Bogota', '-0500']];
const gTzOffset = {
  id: 'i18n-tz-deslocamento', obj: '107.3', nivel: 3, peso: 2,
  make(rng) {
    const [tz, off] = rng.pick(TZS);
    const flip = (o) => (o[0] === '-' ? '+' : '-') + o.slice(1);
    const pool = [flip(off), ...TZS.map((x) => x[1])].filter((x) => x !== off);
    const inverted = /^(Etc\/GMT|UTC|GMT|EST|BRT|CET)[+-]?\d/.test(tz);
    return {
      type: 'unica',
      text: `Qual é o deslocamento em relação ao UTC mostrado por \`date +%z\` quando a variável de ambiente é \`TZ=${tz}\`?`,
      options: mcq(rng, off, pool),
      explanation: `${inverted ? 'Nos nomes **Etc/GMT±N** e na notação POSIX (`UTC-3`, `EST5`…) o sinal é **invertido**: o número indica quantas horas *somar* à hora local para chegar ao UTC. Assim `Etc/GMT+3` é UTC−3 (fuso de Brasília) e `Etc/GMT-9` é UTC+9. ' : 'Nomes baseados em localidade (Região/Cidade) usam as regras do banco de dados em /usr/share/zoneinfo, incluindo meias horas (Índia +05:30, Nepal +05:45). '}Para \`TZ=${tz}\` o resultado é **${off}**. Dica: a variável TZ só afeta o processo/sessão em que foi definida (\`TZ=Asia/Tokyo date\` ou \`export TZ=...\`); o padrão do sistema vem de /etc/localtime.`,
      ref: ['102:p.243', '102:p.246'], verify: { sh: `TZ=${tz} date +%z`, expect: off },
    };
  },
};

// ------------------------------------------------------------------ iconv
const ICONV_WORDS = ['ação', 'coração', 'café', 'pão', 'não', 'maçã', 'informação', 'ônibus', 'você', 'água'];
const utf8Len = (s) => Buffer.from(s).length;
const gIconv = {
  id: 'i18n-iconv', obj: '107.3', nivel: 2, peso: 3,
  make(rng) {
    const fmt = rng.pick(['comando', 'comando', 'bytes', 'euro', 'translit']);
    const ref = ['102:p.250', '102:p.254-255'];
    if (fmt === 'comando') {
      const enc = rng.pick(['ISO-8859-1', 'ISO-8859-15', 'WINDOWS-1252']);
      const toUtf = rng.chance(0.6);
      const right = toUtf ? `iconv -f ${enc} -t UTF-8 antigo.txt -o novo.txt` : `iconv -f UTF-8 -t ${enc} antigo.txt -o novo.txt`;
      const wrong = toUtf
        ? [`iconv -f UTF-8 -t ${enc} antigo.txt -o novo.txt`, `iconv -t ${enc} antigo.txt -o novo.txt`, `iconv ${enc} UTF-8 antigo.txt novo.txt`, `iconv -l ${enc} antigo.txt`, `iconv -f ${enc} -t UTF-8 < novo.txt > antigo.txt`]
        : [`iconv -f ${enc} -t UTF-8 antigo.txt -o novo.txt`, `iconv -f UTF-8 antigo.txt -o novo.txt`, `iconv UTF-8 ${enc} antigo.txt novo.txt`, `iconv -t UTF-8 -o novo.txt antigo.txt`, `iconv -l UTF-8 antigo.txt`];
      const w = 'ação';
      const encBytes = toUtf ? '61 c3 a7 c3 a3 6f' : '61 e7 e3 6f';
      const sh = toUtf
        ? `cd "$(mktemp -d)" && printf 'a\\xe7\\xe3o' > antigo.txt && ${right} && od -An -tx1 novo.txt | tr -s ' ' | sed 's/^ //'`
        : `cd "$(mktemp -d)" && printf 'a\\xc3\\xa7\\xc3\\xa3o' > antigo.txt && ${right} && od -An -tx1 novo.txt | tr -s ' ' | sed 's/^ //'`;
      return {
        type: 'unica',
        text: toUtf ? `O arquivo \`antigo.txt\` foi criado em um sistema antigo com a codificação **${enc}**. Qual comando o converte para **UTF-8**, gravando em \`novo.txt\`?` : `O arquivo \`antigo.txt\` está em **UTF-8** e precisa ser entregue em **${enc}**. Qual comando faz a conversão para \`novo.txt\`?`,
        options: mcq(rng, right, wrong),
        explanation: `Sintaxe: \`iconv -f CODIFICAÇÃO-ORIGEM -t CODIFICAÇÃO-DESTINO arquivo [-o saída]\` (\`-f\` = from, \`-t\` = to; sem \`-o\` a saída vai para a tela e é redirecionada com \`>\`). \`iconv -l\` apenas lista as codificações suportadas. Aqui a origem é **${toUtf ? enc : 'UTF-8'}** e o destino **${toUtf ? 'UTF-8' : enc}**. Exemplo: "${w}" tem os bytes \`61 e7 e3 6f\` em ISO-8859-1/15 e WINDOWS-1252 e \`61 c3 a7 c3 a3 6f\` em UTF-8 (o resultado aqui é \`${encBytes}\`).`,
        ref, verify: { sh, expect: encBytes },
      };
    }
    if (fmt === 'bytes') {
      const w = rng.pick(ICONV_WORDS); const len = [...w].length;
      const enc = rng.pick([['UTF-8', utf8Len(w)], ['ISO-8859-1', len], ['UTF-16LE', len * 2], ['UTF-32LE', len * 4]]);
      const pool = [len, utf8Len(w), len * 2, len * 4, len + 1, utf8Len(w) + 2].filter((x) => x !== enc[1]);
      return {
        type: 'unica',
        text: `Quantos **bytes** ocupa a palavra \`${w}\` (sem quebra de linha) quando gravada em **${enc[0]}**? (UTF-16LE e UTF-32LE sem marca BOM)`,
        options: mcq(rng, String(enc[1]), pool.map(String)),
        explanation: `A palavra tem ${len} caracteres, dos quais ${utf8Len(w) - len} acentuados. **ISO-8859-1**: 1 byte por caractere → ${len}. **UTF-8**: ASCII usa 1 byte e letras acentuadas 2 → ${utf8Len(w)}. **UTF-16LE**: 2 bytes por caractere → ${len * 2}. **UTF-32LE**: 4 bytes → ${len * 4}. Para ${enc[0]}: **${enc[1]}**.`,
        ref, verify: { sh: `printf '%s' ${sq(w)} | iconv -f UTF-8 -t ${enc[0]} | wc -c`, expect: String(enc[1]) },
      };
    }
    if (fmt === 'euro') {
      const can = rng.chance(0.5);
      const ok = ['ISO-8859-15', 'WINDOWS-1252', 'UTF-8']; const bad = ['ISO-8859-1', 'ASCII'];
      const e = can ? rng.pick(ok) : rng.pick(bad);
      const sh = `printf '€' | iconv -f UTF-8 -t ${e} >/dev/null 2>&1 && echo sim || echo nao`;
      return {
        type: 'unica',
        text: `O comando \`printf '€' | iconv -f UTF-8 -t ${e}\` converte o caractere do euro com sucesso?`,
        options: mcq(rng, can ? 'Sim: a codificação possui o caractere €' : 'Não: falha com "illegal input sequence" porque a codificação não tem o €', can ? ['Não: falha com "illegal input sequence" porque a codificação não tem o €', 'Sim, mas troca o € por ?', 'Sim, mas só com a opção -c', 'Não: o iconv só converte letras'] : ['Sim: a codificação possui o caractere €', 'Sim, mas troca o € por ?', 'Sim, mas só com a opção -c', 'Não: o iconv só converte letras']),
        explanation: `O € (U+20AC) existe em **UTF-8**, **ISO-8859-15** (byte A4) e **WINDOWS-1252** (byte 80), mas **não** em **ISO-8859-1** nem em **ASCII**. Quando o caractere não existe na codificação de destino, o iconv aborta com "illegal input sequence" (a menos que se use //TRANSLIT ou //IGNORE). Para ${e}: ${can ? 'sucesso' : 'erro'}.`,
        ref, verify: { sh, expect: can ? 'sim' : 'nao' },
      };
    }
    const w = rng.pick(['ação', 'coração', 'café', 'São Paulo', 'informação', 'você']);
    const asc = stripAcc(w);
    const right = 'iconv -f UTF-8 -t ASCII//TRANSLIT';
    return {
      type: 'unica',
      text: `Em um sistema com \`LANG=pt_BR.UTF-8\`, o arquivo \`texto.txt\` (UTF-8) contém \`${w}\`. Qual comando gera uma versão **ASCII** sem erro, trocando os caracteres acentuados por equivalentes (\`${asc}\`)?`,
      options: mcq(rng, `${right} texto.txt`, ['iconv -f UTF-8 -t ASCII texto.txt', 'iconv -f ASCII -t UTF-8//TRANSLIT texto.txt', 'iconv -f UTF-8 -t ASCII//IGNORE texto.txt', 'iconv -f UTF-8 -t ASCII/TRANSLIT texto.txt']),
      explanation: `Sem sufixo, a conversão para ASCII **falha** (illegal input sequence) ao encontrar letras acentuadas. Acrescentar **//TRANSLIT** à codificação de destino faz o iconv substituir cada caractere sem equivalente por um ou mais caracteres de aparência semelhante (ação → ${asc} com locale pt_BR/en_US). \`//IGNORE\` descarta os caracteres e ainda termina com erro; a barra é dupla (\`//\`). Resultado para "${w}": \`${asc}\`.`,
      ref, verify: { sh: `printf '%s' ${sq(w)} | LC_ALL=en_US.UTF-8 iconv -f UTF-8 -t ASCII//TRANSLIT; echo " rc=$?"; printf '%s' ${sq(w)} | iconv -f UTF-8 -t ASCII >/dev/null 2>&1; echo "rc=$?"`, expect: `${asc} rc=0\nrc=1` },
    };
  },
};

// ------------------------------------------------------------------ fatos (conceitual)
const gI18nFatos = {
  id: 'i18n-conceitos', obj: '107.3', nivel: 1, peso: 2,
  make(rng) {
    const F = [
      ['Qual variável de localização **sobrepõe todas as outras**, inclusive LANG e as LC_*?', 'LC_ALL', ['LANG', 'LC_MESSAGES', 'LANGUAGE', 'LC_CTYPE'], ''],
      ['Qual variável define a **ordem alfabética** usada por `sort` e `ls`?', 'LC_COLLATE', ['LC_CTYPE', 'LC_MESSAGES', 'LC_TIME', 'LC_NUMERIC'], ''],
      ['Qual variável define o **idioma das mensagens** dos programas (ex.: erros do `ls`)?', 'LC_MESSAGES', ['LC_COLLATE', 'LC_CTYPE', 'LC_TIME', 'LC_MONETARY'], ''],
      ['Qual variável define o **formato de data e hora** (nomes de meses e dias)?', 'LC_TIME', ['LC_NUMERIC', 'LC_COLLATE', 'LC_MESSAGES', 'LC_PAPER'], ''],
      ['Qual variável define os **separadores decimal e de milhar**?', 'LC_NUMERIC', ['LC_MONETARY', 'LC_TIME', 'LC_COLLATE', 'LC_PAPER'], ''],
      ['Qual variável define quais caracteres são **maiúsculos, minúsculos** ou alfabéticos?', 'LC_CTYPE', ['LC_COLLATE', 'LC_MESSAGES', 'LC_TIME', 'LC_NUMERIC'], ''],
      ['Qual é o formato do valor de `LANG`, como em `pt_BR.UTF-8`?', 'idioma_PAÍS.codificação (ISO 639 + ISO 3166 + charset)', ['PAÍS_idioma.fuso', 'idioma-PAÍS@codificação', 'continente/cidade.codificação', 'codificação.idioma_PAÍS'], ''],
      ['Qual comando mostra as variáveis de localização atualmente em vigor?', 'locale', ['localectl list', 'lang -a', 'echo $LOCALE', 'tzselect'], ''],
      ['Qual comando lista os locales **instalados** no sistema?', 'locale -a', ['locale -l', 'localectl status', 'iconv -l', 'ls /usr/share/zoneinfo'], 'verify-a'],
      ['Qual comando (systemd) altera o locale padrão do sistema, por exemplo para `en_US.UTF-8`?', 'localectl set-locale LANG=en_US.UTF-8', ['timedatectl set-locale en_US.UTF-8', 'locale set LANG=en_US.UTF-8', 'iconv --set-locale en_US', 'export LC_ALL=/etc/locale.conf'], ''],
      ['Em que arquivo o systemd guarda as configurações de localidade de todo o sistema (como `LANG=pt_BR.UTF-8`)?', '/etc/locale.conf', ['/etc/localtime', '/etc/timezone', '/etc/lang.conf', '/etc/i18n.d'], ''],
      ['O que o link simbólico `/etc/localtime` representa?', 'o arquivo de dados do fuso horário do sistema em /usr/share/zoneinfo/', ['o locale (idioma) do sistema', 'o horário do relógio de hardware', 'o servidor NTP configurado', 'o nome do fuso em texto puro'], ''],
      ['Em que diretório ficam os arquivos de dados dos fusos horários (ex.: `America/Sao_Paulo`)?', '/usr/share/zoneinfo/', ['/etc/timezone/', '/var/lib/tz/', '/usr/lib/locale/', '/etc/localtime.d/'], ''],
      ['Qual comando **interativo** ajuda a descobrir o nome correto de um fuso horário (o valor de TZ)?', 'tzselect', ['timedatectl set-tz', 'localectl', 'tzdata -i', 'hwclock --tz'], ''],
      ['Como ver o horário atual em outro fuso apenas para **um** comando, sem alterar a sessão?', 'TZ=Asia/Tokyo date', ['export LANG=Asia/Tokyo; date', 'date --locale=Asia/Tokyo', 'LC_TIME=Asia/Tokyo date', 'tzselect Asia/Tokyo date'], 'verify-tz'],
      ['Para que um script produza resultados previsíveis (ordenação e mensagens) em qualquer máquina, qual é a prática recomendada?', 'definir a localidade C no script (por exemplo, `LC_ALL=C`)', ['usar sempre pt_BR.UTF-8', 'apagar o arquivo /etc/locale.conf', 'executar o script como root', 'definir TZ=UTC'], ''],
      ['Qual codificação usa 1 byte por caractere, cobre 128 caracteres e é a base comum de ISO-8859 e UTF-8?', 'ASCII', ['UTF-16', 'UTF-32', 'WINDOWS-1252', 'EBCDIC'], ''],
      ['Qual padrão atribui um número único (code point) a cada caractere de qualquer idioma, sendo UTF-8 uma de suas codificações?', 'Unicode', ['ISO-8859-1', 'ASCII', 'POSIX', 'ISO 639'], ''],
    ];
    const f = rng.pick(F);
    const out = {
      type: 'unica', text: f[0], options: mcq(rng, f[1], f[2]),
      explanation: `Variáveis de localização: LC_ALL (sobrepõe tudo) > LC_* específicas (LC_COLLATE ordem, LC_CTYPE classes de caracteres, LC_MESSAGES idioma das mensagens, LC_NUMERIC números, LC_MONETARY moeda, LC_TIME data/hora, LC_PAPER papel) > LANG (padrão). Fuso horário: variável TZ, /etc/localtime (link para /usr/share/zoneinfo/…), /etc/timezone, tzselect e timedatectl. Conversão de codificação: iconv. Resposta: ${f[1]}.`,
      ref: ['102:p.243-250'],
    };
    if (f[3] === 'verify-a') out.verify = { sh: "locale -a | grep -ci 'pt_BR'", expect: '1' };
    if (f[3] === 'verify-tz') out.verify = { sh: 'TZ=Asia/Tokyo date +%z; date +%z', expect: '+0900\n+0000' };
    return out;
  },
};

// ================================================================== 108.1
const ZONES = [
  { id: 'UTC', nome: 'UTC', off: () => 0 },
  { id: 'America/Sao_Paulo', nome: 'São Paulo (America/Sao_Paulo)', off: () => -180 },
  { id: 'Asia/Tokyo', nome: 'Tóquio (Asia/Tokyo)', off: () => 540 },
  { id: 'Asia/Kolkata', nome: 'Índia (Asia/Kolkata)', off: () => 330 },
  { id: 'Europe/Moscow', nome: 'Moscou (Europe/Moscow)', off: () => 180 },
  { id: 'Asia/Dubai', nome: 'Dubai (Asia/Dubai)', off: () => 240 },
  { id: 'America/Bogota', nome: 'Bogotá (America/Bogota)', off: () => -300 },
  { id: 'Asia/Kathmandu', nome: 'Nepal (Asia/Kathmandu)', off: () => 345 },
  { id: 'Africa/Johannesburg', nome: 'Joanesburgo (Africa/Johannesburg)', off: () => 120 },
  { id: 'Europe/Berlin', nome: 'Berlim (Europe/Berlin)', off: (m) => (m >= 6 ? 120 : 60) },
  { id: 'Europe/London', nome: 'Londres (Europe/London)', off: (m) => (m >= 6 ? 60 : 0) },
  { id: 'America/New_York', nome: 'Nova York (America/New_York)', off: (m) => (m >= 6 ? -240 : -300) },
];
const fmtLocal = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const sgn = (m) => `${m < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`;

const gTzConv = {
  id: 'time-conversao-fuso', obj: '108.1', nivel: 3, peso: 3,
  make(rng) {
    const [A, B] = rng.sample(ZONES, 2);
    const month = rng.pick([1, 2, 6, 7, 8]); const day = rng.int(5, 20);
    const h = rng.int(0, 23); const mi = rng.pick([0, 15, 30, 45]);
    const local = Date.UTC(2026, month - 1, day, h, mi);
    const utc = local - A.off(month) * 60000;
    const res = utc + B.off(month) * 60000;
    const right = fmtLocal(res);
    const oa = A.off(month); const ob = B.off(month);
    const cand = [local + oa * 60000 + ob * 60000, local - oa * 60000 - ob * 60000, local + (oa - ob) * 60000, res + 3600000, res - 3600000, res + 86400000, res - 86400000, utc + Math.trunc(ob / 60) * 3600000, local + Math.trunc(ob / 60) * 3600000 - Math.trunc(oa / 60) * 3600000, res + 1800000];
    const pool = cand.map(fmtLocal).filter((x) => x !== right);
    const when = `${pad(day)}/${pad(month)}/2026 às ${pad(h)}:${pad(mi)}`;
    const dst = [A, B].some((z) => ['Europe/Berlin', 'Europe/London', 'America/New_York'].includes(z.id));
    return {
      type: 'unica',
      text: `Uma reunião ocorre em ${when}, no horário local de **${A.nome}**. Que data e hora locais isso corresponde em **${B.nome}**? (formato AAAA-MM-DD HH:MM)`,
      options: mcq(rng, right, pool),
      explanation: `Passo a passo: horário local − deslocamento de ${A.id} (${sgn(A.off(month))}) = UTC → ${fmtLocal(utc)} UTC; depois UTC + deslocamento de ${B.id} (${sgn(B.off(month))}) = **${right}**. ${dst ? 'Zonas com horário de verão mudam de deslocamento ao longo do ano: em junho-agosto o verão do hemisfério norte está ativo (Berlim +02:00, Londres +01:00, Nova York −04:00); em janeiro-fevereiro vale o horário padrão. ' : ''}Atenção a fusos com meia hora (Índia +05:30, Nepal +05:45) e à mudança de dia. Confira com: \`TZ=${B.id} date -d 'TZ="${A.id}" 2026-${pad(month)}-${pad(day)} ${pad(h)}:${pad(mi)}' '+%F %H:%M'\`.`,
      ref: ['102:p.260', '102:p.262-264'],
      verify: { sh: `TZ=${B.id} date -d 'TZ="${A.id}" 2026-${pad(month)}-${pad(day)} ${pad(h)}:${pad(mi)}' '+%F %H:%M'`, expect: right },
    };
  },
};

// ------------------------------------------------------------------ formatos do date
function dfmt(sec, f) {
  const d = new Date(sec * 1000);
  const Y = d.getUTCFullYear(); const mo = d.getUTCMonth() + 1; const da = d.getUTCDate(); const H = d.getUTCHours(); const M = d.getUTCMinutes(); const S = d.getUTCSeconds(); const w = d.getUTCDay();
  const yday = Math.floor((Date.UTC(Y, mo - 1, da) - Date.UTC(Y, 0, 1)) / 86400000) + 1;
  const map = {
    Y: String(Y), y: pad(Y % 100), m: pad(mo), d: pad(da), e: String(da).padStart(2, ' '), H: pad(H), I: pad(H % 12 || 12), M: pad(M), S: pad(S), p: H < 12 ? 'AM' : 'PM', j: String(yday).padStart(3, '0'),
    a: DOW_EN[w], A: DOW_EN_FULL[w], b: MON_EN[mo - 1], B: MON_EN_FULL[mo - 1], u: String(w || 7), w: String(w), F: `${Y}-${pad(mo)}-${pad(da)}`, T: `${pad(H)}:${pad(M)}:${pad(S)}`,
    D: `${pad(mo)}/${pad(da)}/${pad(Y % 100)}`, R: `${pad(H)}:${pad(M)}`, s: String(sec), Z: 'UTC', z: '+0000', '%': '%',
  };
  return f.replace(/%(.)/g, (_, c) => map[c] ?? `%${c}`);
}
const FMT_SWAP = { m: 'M', M: 'm', d: 'j', j: 'd', H: 'I', I: 'H', y: 'Y', Y: 'y', b: 'B', B: 'b', a: 'A', A: 'a', u: 'w', w: 'u' };
const FMTS = ['%d/%m/%Y', '%H:%M:%S', '%Y-%m-%d %H:%M', '%A, %d %B %Y', '%a %b %e', '%j', '%y%m%d-%H%M', '%I:%M %p', '%F %T', '%D', '%u %A', '%s'];
const gDateFmt = {
  id: 'time-date-formato', obj: '108.1', nivel: 2, peso: 3,
  make(rng) {
    const N = 1700000000 + rng.int(0, 900) * 86400 + rng.int(0, 86399);
    const ref = ['102:p.260-261'];
    if (rng.chance(0.65)) {
      const f = rng.pick(FMTS);
      const right = dfmt(N, f);
      const variants = new Set();
      for (let i = 0; i < f.length; i++) if (f[i] === '%' && FMT_SWAP[f[i + 1]]) variants.add(dfmt(N, f.slice(0, i + 1) + FMT_SWAP[f[i + 1]] + f.slice(i + 2)));
      for (const k of [86400, 3600 * 3, -3600 * 3, -86400 * 31, 60, 3600, 86400 * 30, 1800, 12 * 3600]) variants.add(dfmt(N + k, f));
      return {
        type: 'unica',
        text: `Considere o instante de **${N}** segundos desde a Época (1970-01-01 00:00:00 UTC). Qual é a saída de:\n\n${block(`LC_ALL=C date -u -d @${N} '+${f}'`)}`,
        options: mcq(rng, right, [...variants].filter((x) => x !== right)),
        explanation: `\`date -d @N\` interpreta N como **segundos** desde a Época; \`-u\` mostra em UTC. Diretivas: %Y ano com 4 dígitos, %y 2 dígitos, %m mês (01-12), %M minutos (00-59), %d dia do mês, %j dia do ano, %H hora 00-23, %I hora 01-12 (com %p AM/PM), %a/%A dia da semana abreviado/completo, %b/%B mês abreviado/completo, %F = %Y-%m-%d, %T = %H:%M:%S, %D = %m/%d/%y, %s = segundos da Época, %u dia da semana 1-7 (segunda=1). Resultado: \`${right}\`.`,
        ref, verify: { sh: `LC_ALL=C date -u -d @${N} '+${f}'`, expect: right },
      };
    }
    const targets = [
      ['%F', ['%F', '%Y-%m-%d']], ['%T', ['%T', '%H:%M:%S']], ['%R', ['%R', '%H:%M']], ['%d/%m/%Y', ['%d/%m/%Y']], ['%F %T', ['%F %T', '%Y-%m-%d %H:%M:%S', '%F %H:%M:%S']], ['%H%M%S', ['%H%M%S']], ['%Y%m%d', ['%Y%m%d']], ['%s', ['%s']], ['%j', ['%j']],
    ];
    const [fmt, acc] = rng.pick(targets);
    const out = dfmt(N, fmt);
    return {
      type: 'lacuna',
      text: `Para o instante \`date -u -d @${N}\`, o comando abaixo deve exibir exatamente \`${out}\`. Escreva a(s) sequência(s) de formato que faltam (apenas o que vem depois do \`+\`):\n\n\`date -u -d @${N} '+____'\``,
      answers: acc,
      explanation: `\`${out}\` corresponde ao formato \`${fmt}\`${acc.length > 1 ? ` (equivalentes aceitos: ${acc.slice(1).map((a) => `\`${a}\``).join(', ')})` : ''}. Principais diretivas: %Y %m %d (data), %H %M %S (hora), %F (= %Y-%m-%d), %T (= %H:%M:%S), %R (= %H:%M), %s (segundos desde a Época), %j (dia do ano).`,
      ref, verify: { sh: acc.map((a) => `LC_ALL=C date -u -d @${N} '+${a}'`).join('\n'), expect: acc.map(() => out).join('\n') },
    };
  },
};

const gEpoch = {
  id: 'time-epoca-aritmetica', obj: '108.1', nivel: 3, peso: 2,
  make(rng) {
    const fmt = rng.pick(['segundos', 'data', 'dias']);
    const y = rng.int(2024, 2028); const mo = rng.int(1, 12); const d = rng.int(1, 28); const h = rng.int(0, 23); const mi = rng.pick([0, 5, 10, 30, 45]);
    const ts = Date.UTC(y, mo - 1, d, h, mi) / 1000;
    const iso = `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:00`;
    const ref = ['102:p.260-261', '102:p.265'];
    if (fmt === 'segundos') {
      const pool = [ts + 10800, ts - 10800, ts + 3600, ts - 86400, ts + 86400, ts * 1000, Math.floor(ts / 60)].filter((x) => x !== ts);
      return {
        type: 'unica',
        text: `Qual é o resultado de \`date -u -d '${iso}' +%s\` (segundos desde 1970-01-01 00:00:00 UTC)?`,
        options: mcq(rng, String(ts), pool.map(String)),
        explanation: `\`+%s\` imprime o **tempo Unix**: segundos decorridos desde a Época (1º de janeiro de 1970, UTC). Como foi usado \`-u\`, a data informada é UTC e não há ajuste de fuso. (Sem \`-u\` e com TZ=America/Sao_Paulo, o mesmo texto resultaria em ${ts + 10800} — 3 horas a mais.) Resultado: **${ts}**.`,
        ref, verify: { sh: `date -u -d '${iso}' +%s`, expect: String(ts) },
      };
    }
    if (fmt === 'data') {
      const right = dfmt(ts, '%a %b %e %H:%M:%S %Z %Y');
      const pool = [dfmt(ts + 86400, '%a %b %e %H:%M:%S %Z %Y'), dfmt(ts - 10800, '%a %b %e %H:%M:%S %Z %Y'), dfmt(ts + 10800, '%a %b %e %H:%M:%S %Z %Y'), dfmt(ts - 86400 * 7, '%a %b %e %H:%M:%S %Z %Y'), dfmt(Math.floor(ts / 1000), '%a %b %e %H:%M:%S %Z %Y')];
      return {
        type: 'unica',
        text: `Qual é a saída de \`LC_ALL=C date -u -d @${ts}\` (sem formato)?`,
        options: mcq(rng, right, pool),
        explanation: `\`-d @N\` converte N segundos da Época em data/hora; \`-u\` imprime em UTC. O formato padrão do \`date\` no locale C é \`%a %b %e %H:%M:%S %Z %Y\` (dia da semana, mês abreviado, dia com espaço à esquerda, hora, fuso e ano). Resultado: \`${right}\`.`,
        ref, verify: { sh: `LC_ALL=C date -u -d @${ts}`, expect: right },
      };
    }
    const n = rng.int(10, 400); const unit = rng.pick(['days', 'weeks']); const sign = rng.pick(['+', '-']);
    const days = (unit === 'weeks' ? n * 7 : n) * (sign === '+' ? 1 : -1);
    const base = Date.UTC(y, mo - 1, d) / 86400000;
    const f = (x) => new Date(x * 86400000).toISOString().slice(0, 10);
    const right = f(base + days);
    const pool = [f(base - days), f(base + days + 1), f(base + days - 1), f(base + days + (unit === 'weeks' ? n : 0)), f(base + days * 30 / 31)];
    return {
      type: 'unica',
      text: `Qual é o resultado de \`date -u -d '${y}-${pad(mo)}-${pad(d)} ${sign} ${n} ${unit}' +%F\`?`,
      options: mcq(rng, right, pool),
      explanation: `O GNU \`date -d\` aceita aritmética relativa depois de uma data: \`'${y}-${pad(mo)}-${pad(d)} ${sign} ${n} ${unit}'\`. ${unit === 'weeks' ? `${n} semanas = ${n * 7} dias. ` : ''}Contando ${Math.abs(days)} dias ${days < 0 ? 'para trás' : 'para frente'}, a data é **${right}**.`,
      ref, verify: { sh: `date -u -d '${y}-${pad(mo)}-${pad(d)} ${sign} ${n} ${unit}' +%F`, expect: right },
    };
  },
};

// ------------------------------------------------------------------ ntpq -p
const PEERS = ['a.st1.ntp.br', 'b.st1.ntp.br', 'c.st1.ntp.br', 'gps.ntp.br', 'a.ntp.br', 'ntp1.exemplo.br', 'ntp2.exemplo.br', 'ntp.ufrj.br', 'time.exemplo.br', 'ntp.lan.local'];
const REFIDS = ['200.160.0.8', '200.160.7.186', '129.6.15.28', '17.253.34.125', '200.189.40.8', '192.36.143.130'];
const REFCLK = ['.GPS.', '.PPS.', '.NIST.', '.ATOM.'];
const TALLY_MEAN = {
  '*': 'é o par escolhido como **fonte de sincronização atual** (system peer)',
  '+': 'é um **candidato** bom, combinado com o par escolhido para calcular a hora',
  '-': 'é um **outlier**: descartado pelo algoritmo de agrupamento (clustering)',
  x: 'é um **falseticker**: relógio incorreto, descartado pelo algoritmo de seleção',
  '.': 'é um par **excedente** (excess peer), não usado por haver pares melhores',
  ' ': 'foi **rejeitado**: inalcançável, estrato alto demais ou distância excessiva',
};
function peerTable(rng) {
  const names = rng.sample(PEERS, 5);
  const tallies = rng.shuffle(['*', '+', rng.pick(['+', '-']), rng.pick(['x', '-', '.']), ' ']);
  const rows = names.map((n, i) => {
    const t = tallies[i];
    const dead = t === ' ';
    const st = dead ? 16 : rng.int(1, 3);
    return { tally: t, name: n, refid: dead ? '.INIT.' : st === 1 ? rng.pick(REFCLK) : rng.pick(REFIDS), st, when: dead ? '-' : String(rng.int(2, 120)), poll: rng.pick([64, 128, 256]), reach: dead ? 0 : (t === 'x' ? rng.pick([377, 377, 357]) : 377), delay: dead ? 0 : rng.int(8, 160) + rng.int(0, 99) / 100, offset: dead ? 0 : (t === 'x' ? rng.int(180, 900) : rng.int(-9, 9)) + rng.int(0, 99) / 100, jitter: dead ? 0 : rng.int(0, 15) + rng.int(0, 99) / 100 };
  });
  const head = '     remote           refid      st t when poll reach   delay   offset  jitter';
  const lines = rows.map((r) => `${r.tally}${r.name.padEnd(16)} ${r.refid.padEnd(15)} ${String(r.st).padStart(2)} ${r.tally === ' ' ? 'u' : 'u'} ${String(r.when).padStart(4)} ${String(r.poll).padStart(4)} ${String(r.reach).padStart(5)} ${r.delay.toFixed(3).padStart(8)} ${r.offset.toFixed(3).padStart(8)} ${r.jitter.toFixed(3).padStart(7)}`);
  return { rows, text: `${head}\n${'='.repeat(78)}\n${lines.join('\n')}` };
}
const gNtpq = {
  id: 'ntp-ntpq-tabela', obj: '108.1', nivel: 2, peso: 3,
  make(rng) {
    const t = peerTable(rng);
    const q = rng.pick(['sync', 'simbolo', 'estrato', 'alcance', 'offset', 'significado']);
    const ref = ['102:p.281-282'];
    const expl = `Na saída de \`ntpq -p\` o **primeiro caractere** de cada linha (tally) indica o estado: \`*\` fonte de sincronização atual, \`+\` candidato combinado, \`-\` outlier descartado, \`x\` falseticker, \`.\` excedente, espaço = rejeitado/inalcançável. Colunas: remote, refid (a referência do par), st (estrato), t (tipo), when (segundos desde a última consulta), poll (intervalo entre consultas em s), reach (histórico das últimas 8 consultas, em octal: 377 = todas bem-sucedidas, 0 = nenhuma), delay, offset e jitter (em milissegundos).`;
    const R = t.rows;
    if (q === 'sync') {
      const s = R.find((r) => r.tally === '*');
      return { type: 'unica', text: `Em um servidor, \`ntpq -p\` mostra:\n\n${block(t.text)}\n\nCom qual servidor o relógio local está **sincronizado no momento**?`, options: mcq(rng, s.name, R.filter((r) => r !== s).map((r) => r.name)), explanation: `${expl} O asterisco \`*\` está na linha de **${s.name}**: é o par selecionado como fonte de sincronização.`, ref };
    }
    if (q === 'simbolo') {
      const r = rng.pick(R.filter((x) => x.tally !== ' '));
      return { type: 'unica', text: `Na saída de \`ntpq -p\` abaixo, o que significa o caractere \`${r.tally}\` no início da linha de \`${r.name}\`?\n\n${block(t.text)}`, options: mcq(rng, TALLY_MEAN[r.tally].replace(/\*\*/g, ''), Object.entries(TALLY_MEAN).filter(([k]) => k !== r.tally).map(([, v]) => v.replace(/\*\*/g, ''))), explanation: `${expl} Para \`${r.tally}\`: ${TALLY_MEAN[r.tally]}.`, ref };
    }
    if (q === 'estrato') {
      const live = R.filter((r) => r.tally !== ' ');
      const min = Math.min(...live.map((r) => r.st));
      const best = live.filter((r) => r.st === min);
      if (best.length === 1) return { type: 'unica', text: `Qual dos pares abaixo (com tally diferente de espaço) está no **menor estrato** (mais próximo de uma fonte de referência)?\n\n${block(t.text)}`, options: mcq(rng, best[0].name, live.filter((r) => r !== best[0]).map((r) => r.name)), explanation: `${expl} A coluna **st** é o estrato: 1 = ligado diretamente a um relógio de referência (GPS, atômico), 2 = sincronizado com um estrato 1, e assim por diante. O menor aqui é ${min} (**${best[0].name}**). Estrato 16 = não sincronizado/inválido.`, ref };
    }
    if (q === 'alcance') {
      const dead = R.find((r) => r.tally === ' ');
      return { type: 'unica', text: `Qual par abaixo está **inalcançável** (nenhuma das últimas oito consultas obteve resposta)?\n\n${block(t.text)}`, options: mcq(rng, dead.name, R.filter((r) => r !== dead).map((r) => r.name)), explanation: `${expl} Um par com **reach 0** (e estrato 16, refid .INIT.) nunca respondeu: é **${dead.name}**. Os demais mostram reach 377 (octal) — as oito últimas consultas funcionaram.`, ref };
    }
    if (q === 'offset') {
      const s = R.find((r) => r.tally === '*');
      return { type: 'unica', text: `Qual é o **deslocamento (offset)**, em milissegundos, entre o relógio local e o servidor com o qual ele está sincronizado?\n\n${block(t.text)}`, options: mcq(rng, s.offset.toFixed(3), R.filter((r) => r !== s).map((r) => r.offset.toFixed(3)).concat([s.delay.toFixed(3), s.jitter.toFixed(3)])), explanation: `${expl} O servidor sincronizado é o marcado com \`*\` (**${s.name}**); sua coluna **offset** vale ${s.offset.toFixed(3)} ms. Não confunda com **delay** (${s.delay.toFixed(3)} ms, tempo de ida e volta) nem **jitter** (${s.jitter.toFixed(3)} ms, variação).`, ref };
    }
    return {
      type: 'unica', text: 'O que muda ao executar `ntpq -pn` em vez de `ntpq -p`?', options: mcq(rng, 'Os pares são exibidos por endereço IP, sem resolução de nomes (DNS)', ['Só os pares com tally * são exibidos', 'Os tempos passam a ser mostrados em nanossegundos', 'O ntpq não consulta o daemon e lê /etc/ntp.conf', 'O comando também sincroniza o relógio (como ntpdate)']),
      explanation: `${expl} A opção \`-n\` evita consultas DNS e mostra endereços numéricos na coluna remote (e refid); \`-p\` imprime a lista de pares. Para sincronizar uma única vez usa-se \`ntpdate servidor\`, que é outro comando.`, ref,
    };
  },
};

// ------------------------------------------------------------------ chrony
const CH_STATE = { '*': 'é a fonte **atual** (a melhor) com a qual o relógio está sincronizado', '+': 'é uma fonte aceitável, **combinada** com a melhor', '-': 'é uma fonte aceitável, mas **não combinada**', '?': 'está **inalcançável** (ou perdeu a conexão / não passou nos testes)', x: 'é um **falseticker**: relógio considerado incorreto', '~': 'tem **variabilidade** excessiva (muito instável)' };
const CH_MODE = { '^': 'um **servidor** NTP', '=': 'um **par** (peer) simétrico', '#': 'um **relógio de referência local** (hardware)' };
function chronySources(rng) {
  const names = rng.sample(PEERS, 5);
  const states = rng.shuffle(['*', '+', rng.pick(['+', '-']), '?', rng.pick(['x', '~', '-'])]);
  const rows = names.map((n, i) => {
    const s = states[i]; const bad = s === '?';
    return { mode: i === 4 && rng.chance(0.3) ? '=' : '^', state: s, name: n, st: bad ? 0 : rng.int(1, 3), poll: bad ? 10 : rng.pick([6, 7, 8]), reach: bad ? 0 : 377, lastRx: bad ? '-' : String(rng.int(2, 60)), off: bad ? '+0ns' : `${rng.pick(['+', '-'])}${rng.int(20, 900)}us` };
  });
  const lines = rows.map((r) => `${r.mode}${r.state} ${r.name.padEnd(25)} ${String(r.st).padStart(4)} ${String(r.poll).padStart(5)} ${String(r.reach).padStart(5)} ${String(r.lastRx).padStart(6)}  ${r.off.padStart(7)}`);
  return { rows, text: `MS Name/IP address         Stratum Poll Reach LastRx Last sample\n${'='.repeat(70)}\n${lines.join('\n')}` };
}
const gChrony = {
  id: 'ntp-chrony-fontes', obj: '108.1', nivel: 2, peso: 2,
  make(rng) {
    const fmt = rng.pick(['atual', 'estado', 'modo', 'comando']);
    const ref = ['102:p.282-286'];
    const expl = 'Em `chronyc sources` a primeira coluna (M) mostra o **tipo** da fonte (`^` servidor, `=` par, `#` relógio local) e a segunda (S) o **estado**: `*` fonte atual (melhor), `+` combinada, `-` não combinada, `?` inalcançável, `x` falseticker, `~` variável demais. `chronyc tracking` mostra como o relógio local está em relação à referência, e `chronyc makestep` faz um ajuste imediato.';
    if (fmt === 'comando') {
      const items = [
        ['Qual comando do chrony mostra o **estado de sincronização do relógio local** (estrato, offset, frequência, "System time")?', 'chronyc tracking', ['chronyc sources', 'chronyc makestep', 'chronyd -q', 'ntpq -p']],
        ['Qual comando do chrony **lista as fontes de tempo** (servidores/pares) e o estado de cada uma?', 'chronyc sources', ['chronyc tracking', 'chronyc makestep', 'chronyc -l', 'timedatectl show-timesync']],
        ['Qual comando do chrony faz um **ajuste imediato (step)** do relógio do sistema?', 'chronyc makestep', ['chronyc tracking', 'chronyc sources', 'chronyc hwclock --systohc', 'chronyc step']],
        ['Em que arquivo ficam, normalmente, os servidores e pools usados pelo **chrony**?', '/etc/chrony.conf', ['/etc/ntp.conf', '/etc/chronyd.sources', '/etc/timesyncd.conf.d/ntp', '/etc/timezone']],
        ['Em que arquivo ficam, normalmente, os servidores usados pelo **ntpd**?', '/etc/ntp.conf', ['/etc/chrony.conf', '/etc/ntpq.conf', '/etc/pool.ntp.org', '/etc/localtime']],
        ['Qual comando realiza uma **sincronização única** manual com um servidor NTP (usado antes de iniciar o ntpd quando o relógio está muito errado)?', 'ntpdate pool.ntp.org', ['ntpq -p pool.ntp.org', 'ntpd -p pool.ntp.org', 'chronyc tracking pool.ntp.org', 'hwclock --hctosys pool.ntp.org']],
      ];
      const it = rng.pick(items);
      return { type: 'unica', text: it[0], options: mcq(rng, it[1], it[2]), explanation: `${expl} O ntpd lê /etc/ntp.conf e é consultado com \`ntpq -p\`; o chrony lê /etc/chrony.conf e é consultado com \`chronyc\`. \`ntpdate\` faz uma sincronização única. Resposta: \`${it[1]}\`.`, ref };
    }
    const t = chronySources(rng); const R = t.rows;
    if (fmt === 'atual') {
      const s = R.find((r) => r.state === '*');
      return { type: 'unica', text: `Saída de \`chronyc sources\`:\n\n${block(t.text)}\n\nQual é a fonte com a qual o chrony está **sincronizado no momento**?`, options: mcq(rng, s.name, R.filter((r) => r !== s).map((r) => r.name)), explanation: `${expl} O estado \`*\` está na linha de **${s.name}**.`, ref };
    }
    if (fmt === 'estado') {
      const r = rng.pick(R.filter((x) => x.state !== '*'));
      return { type: 'unica', text: `Na saída de \`chronyc sources\` abaixo, o que significa o **segundo** caractere (\`${r.state}\`) da linha de \`${r.name}\`?\n\n${block(t.text)}`, options: mcq(rng, CH_STATE[r.state].replace(/\*\*/g, ''), Object.entries(CH_STATE).filter(([k]) => k !== r.state).map(([, v]) => v.replace(/\*\*/g, ''))), explanation: `${expl} Para \`${r.state}\`: ${CH_STATE[r.state]}.`, ref };
    }
    const m = rng.pick(['^', '=', '#']);
    return { type: 'unica', text: `Em \`chronyc sources\`, o primeiro caractere da coluna **MS** vale \`${m}\`. Isso indica que a fonte é...`, options: mcq(rng, CH_MODE[m].replace(/\*\*/g, ''), Object.entries(CH_MODE).filter(([k]) => k !== m).map(([, v]) => v.replace(/\*\*/g, '')).concat(['uma fonte desativada', 'um servidor do pool.ntp.org'])), explanation: `${expl} Para \`${m}\`: ${CH_MODE[m]}.`, ref };
  },
};

// ------------------------------------------------------------------ relógio do sistema × hardware (conceitual)
const gRelogios = {
  id: 'time-relogios-comandos', obj: '108.1', nivel: 2, peso: 2,
  make(rng) {
    const F = [
      ['Qual comando copia a hora do **relógio do sistema para o relógio do hardware** (RTC)?', 'hwclock --systohc', ['hwclock --hctosys', 'hwclock --set', 'date -s', 'timedatectl set-ntp true']],
      ['Qual comando copia a hora do **relógio de hardware (RTC) para o relógio do sistema**?', 'hwclock --hctosys', ['hwclock --systohc', 'date --rtc', 'timedatectl set-local-rtc 1', 'ntpdate -b']],
      ['Qual comando ajusta **somente o relógio de hardware** para uma data/hora informada?', 'hwclock --set --date "2026-03-07 14:00:00"', ['date -s "2026-03-07 14:00:00"', 'hwclock --hctosys "2026-03-07 14:00:00"', 'timedatectl set-timezone "2026-03-07 14:00:00"', 'ntpdate "2026-03-07 14:00:00"']],
      ['Qual comando ajusta manualmente o **relógio do sistema** para uma data/hora (como root)?', 'date -s "2026-03-07 14:00:00"', ['hwclock --systohc "2026-03-07 14:00:00"', 'timedatectl set-ntp "2026-03-07 14:00:00"', 'date -u -d "2026-03-07 14:00:00"', 'hwclock -r "2026-03-07 14:00:00"']],
      ['Qual comando do systemd define data e hora manualmente (equivalente moderno de `date -s`)?', "timedatectl set-time '2026-03-07 14:00:00'", ["timedatectl set-date '2026-03-07 14:00:00'", "timedatectl set-timezone '2026-03-07 14:00:00'", 'timedatectl set-ntp 2026-03-07', 'hwclock --set-time 2026-03-07']],
      ['Qual comando desativa a sincronização automática por NTP no systemd?', 'timedatectl set-ntp false', ['timedatectl set-time ntp', 'timedatectl disable-ntp', 'systemctl stop timedatectl', 'hwclock --no-ntp']],
      ['Qual comando lista os fusos horários válidos para `timedatectl set-timezone`?', 'timedatectl list-timezones', ['timedatectl show-timezones', 'tzselect --list', 'ls /etc/timezone', 'date --list-tz']],
      ['Qual comando define o fuso horário do sistema como `Asia/Tokyo` em um sistema systemd?', 'timedatectl set-timezone Asia/Tokyo', ['timedatectl set-tz asia/tokyo', 'export TZ=Asia/Tokyo', 'date --timezone=Asia/Tokyo', 'hwclock --tz Asia/Tokyo']],
      ['Sem timedatectl, como se define o fuso do sistema?', 'criando o link simbólico /etc/localtime para o arquivo em /usr/share/zoneinfo/', ['editando /etc/hosts', 'copiando o arquivo para /var/spool/tz/', 'executando hwclock --tz', 'definindo LC_TIME em /etc/profile']],
      ['A saída de `timedatectl` mostra `RTC in local TZ: no`. O que isso significa?', 'o relógio de hardware está mantido em UTC (a configuração recomendada)', ['o relógio de hardware está com defeito', 'o NTP está desativado', 'o fuso horário do sistema é UTC', 'o relógio do sistema está dessincronizado']],
      ['Qual a configuração **recomendada** para o relógio de hardware (RTC) em um servidor?', 'UTC, deixando a conversão para o fuso local por conta do sistema', ['sempre no horário local de Brasília', 'sempre no horário de verão', 'em segundos desde o boot', 'desativado']],
      ['Qual opção do `date` exibe a data e a hora em **UTC**?', 'date -u', ['date -z', 'date --gmt-off', 'date -s', 'date -r UTC']],
    ];
    const f = rng.pick(F);
    return {
      type: 'unica', text: f[0], options: mcq(rng, f[1], f[2]),
      explanation: `Há dois relógios: o do **sistema** (mantido pelo kernel, mostrado/ajustado por \`date\`) e o de **hardware/RTC** (\`hwclock\`). \`hwclock --systohc\` copia sistema → hardware; \`hwclock --hctosys\` copia hardware → sistema; \`hwclock --set --date\` altera só o RTC; \`date -s\` altera só o relógio do sistema. Em sistemas com systemd use \`timedatectl\` (\`set-time\`, \`set-timezone\`, \`set-ntp\`, \`list-timezones\`). O RTC deve ficar em UTC. Resposta: ${f[1]}.`,
      ref: ['102:p.262-266'],
    };
  },
};

export const generators = [gLocEfetivo, gLocSaida, gLocOrdem, gTzOffset, gIconv, gI18nFatos, gTzConv, gDateFmt, gEpoch, gNtpq, gChrony, gRelogios];
