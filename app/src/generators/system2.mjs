

// 102.4 (Debian: dpkg/apt) e 102.5 (RPM/YUM/DNF/Zypper), com bancadas de pacotes reais montadas dentro do container na verificação.
import { mcq, multi, block, code, pad } from './util.mjs';
import { sq, hex, uniq, tableGen, ORDF } from './system.mjs';

const PKGS = ['htop', 'tree', 'nmap', 'unrar', 'p7zip', 'xournal', 'wget2', 'jq', 'rsync', 'lynx', 'ncdu', 'zip', 'dos2unix', 'tmux', 'mc', 'figlet', 'cowsay', 'sysstat', 'nethogs', 'iftop'];

// ═════════════════════════════════════════════ 102.4 ═════════════════════════════════════════════
/** Monta um .deb real e (opcionalmente) o instala em um admindir/instdir privados, sem root. */
function debFixture({ pkg, ver, bin, conf, installed = true }) {
  return [
    'd=$(mktemp -d); cd "$d"',
    `mkdir -p pkg/DEBIAN pkg/usr/bin pkg/etc/${pkg}`,
    `printf 'Package: ${pkg}\\nVersion: ${ver}\\nArchitecture: all\\nMaintainer: Aluno <a@b.c>\\nDescription: Pacote ${pkg}\\n curto\\n' > pkg/DEBIAN/control`,
    `printf '#!/bin/sh\\necho ${pkg}\\n' > pkg/usr/bin/${bin}; chmod 755 pkg/usr/bin/${bin}`,
    `echo opt=1 > pkg/etc/${pkg}/${conf}; echo /etc/${pkg}/${conf} > pkg/DEBIAN/conffiles`,
    `dpkg-deb --root-owner-group --build pkg ${pkg}_${ver}_all.deb >/dev/null`,
    'mkdir -p adm/info adm/updates inst; : > adm/status; : > adm/available',
    'D="dpkg --admindir=$d/adm --instdir=$d/inst --force-not-root --force-bad-path --no-triggers"; Q="dpkg --admindir=$d/adm"',
    ...(installed ? [`$D -i ${pkg}_${ver}_all.deb >/dev/null 2>&1`] : []),
  ].join('\n');
}

const debTask = {
  id: 'deb-task', obj: '102.4', nivel: 2, peso: 3,
  make(rng) {
    const pkg = rng.pick(PKGS); const ver = `${rng.int(0, 5)}.${rng.int(0, 20)}.${rng.int(0, 9)}-${rng.int(1, 4)}`;
    const bin = rng.chance(0.5) ? pkg : `${pkg}-run`; const conf = `${pkg}.conf`;
    const deb = `${pkg}_${ver}_all.deb`; const path = `/usr/bin/${bin}`; const term = rng.pick(['editor', 'compress', 'network', 'monitor']);
    const fx = (inst = true) => debFixture({ pkg, ver, bin, conf, installed: inst });
    const purge = rng.pick([`dpkg -P ${pkg}`, `apt-get purge ${pkg}`, `apt-get remove --purge ${pkg}`]);
    const remove = rng.pick([`dpkg -r ${pkg}`, `apt-get remove ${pkg}`]);
    const purgeAll = [`dpkg -P ${pkg}`, `apt-get purge ${pkg}`, `apt-get remove --purge ${pkg}`];
    const removeAll = [`dpkg -r ${pkg}`, `apt-get remove ${pkg}`];
    const rows = [
      { t: `Instalar o pacote Debian que está no arquivo local \`${deb}\``, ok: `dpkg -i ${deb}`, bad: [`dpkg -I ${deb}`, `dpkg -r ${deb}`, `dpkg -c ${deb}`, `apt-cache install ${deb}`, `rpm -ivh ${deb}`], v: [`${fx(false)}; $D -i ${deb} >/dev/null 2>&1; $Q -s ${pkg} | grep '^Status'`, 'Status: install ok installed'], w: '`dpkg -i` (install) instala/atualiza um `.deb` local, mas não baixa dependências. `-I` (maiúsculo) apenas mostra as informações do pacote e `-c` lista o conteúdo; `rpm` é da família Red Hat.' },
      { t: `Remover o pacote instalado \`${pkg}\`, **mantendo** seus arquivos de configuração`, ok: remove, bad: [...purgeAll.filter(() => true), `dpkg -L ${pkg}`, `dpkg -l ${pkg}`].filter((x) => !removeAll.includes(x)), v: [`${fx()}; $D -r ${pkg} >/dev/null 2>&1; echo "$($Q -l ${pkg} | tail -1 | cut -c1-2) $(ls inst/etc/${pkg})"`, `rc ${conf}`], w: '`dpkg -r` e `apt-get remove` removem o software e deixam os arquivos de configuração (o pacote passa ao estado `rc` em `dpkg -l`). Para apagar também a configuração é preciso purgar.' },
      { t: `Remover o pacote \`${pkg}\` **e também seus arquivos de configuração**`, ok: purge, bad: [...removeAll, `dpkg -L ${pkg}`, `apt-get autoremove ${pkg}`, `dpkg -r --purge-all ${pkg}`].filter((x) => !purgeAll.includes(x)), v: [`${fx()}; $D -P ${pkg} >/dev/null 2>&1; ls inst/etc 2>&1 | grep -c ${pkg}`, '0'], w: 'Purgar = remover + apagar a configuração: `dpkg -P PACOTE`, `apt-get purge PACOTE` ou `apt-get remove --purge PACOTE`. `remove`/`-r` preservam a configuração.' },
      { t: `Listar os arquivos que o pacote **instalado** \`${pkg}\` colocou no sistema`, ok: `dpkg -L ${pkg}`, bad: [`dpkg -l ${pkg}`, `dpkg -S ${pkg}`, `dpkg -c ${pkg}`, `apt-cache show ${pkg}`], v: [`${fx()}; $Q -L ${pkg} | grep -c '^${path}$'`, '1'], w: '`dpkg -L` (maiúsculo) lista os arquivos de um pacote instalado; `dpkg -l` (minúsculo) lista pacotes com seu estado; `dpkg -S` faz o caminho inverso (arquivo → pacote).' },
      { t: `Listar o conteúdo do arquivo \`${deb}\` **sem instalá-lo**`, ok: `dpkg -c ${deb}`, bad: [`dpkg -L ${deb}`, `dpkg -I ${deb}`, `dpkg -S ${deb}`, `dpkg -l ${deb}`], v: [`${fx(false)}; dpkg -c ${deb} | grep -c ' ./usr/bin/${bin}$'`, '1'], w: '`dpkg -c arquivo.deb` (contents) mostra os arquivos dentro do pacote; `dpkg -L` só funciona para pacotes já instalados.' },
      { t: `Ver os metadados (versão, dependências, descrição) do arquivo \`${deb}\` antes de instalá-lo`, ok: `dpkg -I ${deb}`, bad: [`dpkg -i ${deb}`, `dpkg -c ${deb}`, `dpkg -s ${deb}`, `dpkg -L ${deb}`], v: [`${fx(false)}; dpkg -I ${deb} | grep -c '^ Package: ${pkg}$'`, '1'], w: '`dpkg -I` (info, **maiúsculo**) lê o cabeçalho de controle do `.deb`. Cuidado: `dpkg -i` (minúsculo) **instala** o pacote.' },
      { t: `Mostrar o estado de instalação, a versão e as dependências do pacote **instalado** \`${pkg}\``, ok: `dpkg -s ${pkg}`, bad: [`dpkg -S ${pkg}`, `dpkg -L ${pkg}`, `dpkg -I ${pkg}`, `dpkg -c ${pkg}`], v: [`${fx()}; $Q -s ${pkg} | grep -c '^Status: install ok installed$'`, '1'], w: '`dpkg -s` (status) imprime o registro do pacote na base `/var/lib/dpkg/status`, incluindo `Status: install ok installed`, versão e dependências.' },
      { t: `Descobrir qual pacote **instalado** forneceu o arquivo \`${path}\``, ok: `dpkg -S ${path}`, bad: [`dpkg -L ${path}`, `dpkg -s ${path}`, `apt-cache search ${path}`, `apt-file list ${path}`], v: [`${fx()}; $Q -S ${path}`, `${pkg}: ${path}`], w: '`dpkg -S CAMINHO` (search) procura o caminho na lista de arquivos dos pacotes instalados e responde `pacote: caminho`. Atenção ao caminho exato (com usrmerge, `/bin/ls` pode estar registrado em vez de `/usr/bin/ls`).' },
      { t: `Descobrir qual pacote **dos repositórios** (mesmo não instalado) contém o arquivo \`${path}\``, ok: `apt-file search ${path}`, bad: [`dpkg -S ${path}`, `apt-cache search ${path}`, `apt-file list ${path}`, `apt-cache show ${path}`], w: '`dpkg -S` só conhece pacotes instalados. `apt-file search` consulta o índice de conteúdo dos repositórios (preparado com `apt-file update`). `apt-file list PACOTE` faz o contrário: lista os arquivos de um pacote.' },
      { t: `Listar os arquivos de um pacote \`${pkg}\` que ainda **não está instalado**, mas existe nos repositórios`, ok: `apt-file list ${pkg}`, bad: [`dpkg -L ${pkg}`, `apt-cache show ${pkg}`, `apt-file search ${pkg}`, `dpkg -c ${pkg}`], w: '`apt-file list PACOTE` mostra o conteúdo de pacotes dos repositórios; `dpkg -L` exige o pacote instalado e `apt-file search` procura por um nome de arquivo.' },
      { t: 'Sincronizar o índice local de pacotes com os repositórios configurados em /etc/apt/sources.list', ok: 'apt-get update', bad: ['apt-get upgrade', 'apt-get install -f', 'apt-cache update', 'dpkg --update'], w: '`apt-get update` baixa as listas de pacotes (não instala nada). Só depois disso o `apt-get upgrade` sabe quais versões novas existem.' },
      { t: 'Instalar as versões mais novas dos pacotes **já instalados** (depois de atualizar o índice)', ok: 'apt-get upgrade', bad: ['apt-get update', 'apt-get install -f', 'apt-cache upgrade', 'dpkg -u'], w: '`apt-get upgrade` atualiza os pacotes instalados sem remover nenhum; `apt-get update` apenas atualiza o índice.' },
      { t: `Instalar \`${pkg}\` a partir dos repositórios, resolvendo e instalando as dependências`, ok: `apt-get install ${pkg}`, bad: [`dpkg -i ${pkg}`, `apt-cache install ${pkg}`, `apt-get add ${pkg}`, `dpkg -r ${pkg}`], w: 'O `apt-get install` baixa o pacote e suas dependências. O `dpkg -i` espera um **arquivo** `.deb` e não resolve dependências.' },
      { t: `Procurar nos repositórios pacotes cujo nome ou descrição contenha "${term}"`, ok: `apt-cache search ${term}`, bad: [`apt-get search ${term}`, `dpkg -s ${term}`, `apt-cache find ${term}`, `dpkg -S ${term}`], w: '`apt-cache search TERMO` pesquisa nomes e descrições no índice; não existe `apt-get search` (embora o comando moderno `apt search` exista).' },
      { t: `Ver a descrição, a versão e as dependências de \`${pkg}\` conforme o índice dos repositórios`, ok: `apt-cache show ${pkg}`, bad: [`apt-get show ${pkg}`, `dpkg -L ${pkg}`, `apt-file show ${pkg}`, `apt-cache list ${pkg}`], w: '`apt-cache show PACOTE` imprime o registro do pacote (Version, Depends, Description...). `apt-cache policy PACOTE` mostra versão instalada, candidata e prioridades.' },
      { t: `Mostrar a versão instalada, a versão candidata e a origem (repositório) de \`${pkg}\``, ok: `apt-cache policy ${pkg}`, bad: [`apt-cache show ${pkg}`, `dpkg -s ${pkg}`, `apt-get policy ${pkg}`, `apt-cache depends ${pkg}`], w: '`apt-cache policy` mostra `Installed:`, `Candidate:` e a tabela de versões com prioridades por repositório.' },
      { t: `Listar as dependências de \`${pkg}\``, ok: `apt-cache depends ${pkg}`, bad: [`apt-cache rdepends ${pkg}`, `dpkg -L ${pkg}`, `apt-get depends ${pkg}`, `dpkg -S ${pkg}`], w: '`apt-cache depends` mostra de que o pacote depende; `apt-cache rdepends` mostra o inverso (quem depende dele).' },
      { t: `Refazer as perguntas de configuração (debconf) de um pacote já instalado, como o \`tzdata\``, ok: 'dpkg-reconfigure tzdata', bad: ['dpkg --reconfigure tzdata', 'apt-get reconfigure tzdata', 'dpkg -C tzdata', 'dpkg-configure tzdata'], w: '`dpkg-reconfigure PACOTE` reexecuta a configuração interativa (debconf) do pacote.' },
      { t: 'Corrigir dependências quebradas, instalando as que faltam (por exemplo, depois de um `dpkg -i` com erro de dependência)', ok: 'apt-get install -f', bad: ['dpkg --fix-broken', 'apt-get fix-broken', 'apt-cache fix', 'apt-get update --fix'], w: '`apt-get install -f` (`--fix-broken`) conclui instalações pendentes e baixa as dependências ausentes.' },
      { t: `Verificar a integridade dos arquivos instalados do pacote \`${pkg}\` comparando-os com o que o pacote registrou`, ok: `dpkg -V ${pkg}`, bad: [`dpkg -v ${pkg}`, `dpkg -C ${pkg}`, `dpkg -s ${pkg}`, `dpkg -L ${pkg}`], v: [`${fx()}; echo x >> inst/etc/${pkg}/${conf}; $D -V ${pkg} | awk '{print $1}' | head -1`, '??5??????'], w: '`dpkg -V` (`--verify`) compara os arquivos com os dados do pacote e imprime uma linha para cada divergência (a terceira coluna `5` indica soma MD5 diferente). Alternativa: o utilitário `debsums`. `dpkg -C` audita pacotes com instalação incompleta, não os arquivos.' },
      { t: 'Listar todos os pacotes conhecidos pelo dpkg com seus estados (a primeira coluna mostra `ii`, `rc`, ...)', ok: 'dpkg -l', bad: ['dpkg -L', 'dpkg -s', 'dpkg -S', 'dpkg -I'], w: '`dpkg -l` (minúsculo) lista pacotes e estados: `ii` instalado, `rc` removido com configuração restante, etc.' },
    ];
    const r = rng.pick(rows);
    const bad = uniq(r.bad);
    const out = { type: 'unica', text: `Em um sistema Debian/Ubuntu, qual comando executa a tarefa a seguir?\n\n${r.t}`, options: mcq(rng, r.ok, bad), explanation: `\`${r.ok}\`. ${r.w}`, ref: ['101:p.114-127'] };
    if (r.v) out.verify = { sh: r.v[0], expect: r.v[1] };
    return out;
  },
};

const DSTATES = [
  { st: 'ii', desired: 'install', status: 'installed', d: 'instalado e configurado corretamente' },
  { st: 'rc', desired: 'deinstall', status: 'config-files', d: 'removido (remove), mas os arquivos de configuração continuam no disco' },
  { st: 'hi', desired: 'hold', status: 'installed', d: 'instalado e mantido na versão atual (hold): não será atualizado' },
  { st: 'iU', desired: 'install', status: 'unpacked', d: 'desempacotado, mas ainda não configurado (instalação incompleta)' },
  { st: 'iF', desired: 'install', status: 'half-configured', d: 'a configuração falhou no meio (meio configurado)' },
];
const dpkgL = {
  id: 'deb-dpkg-l', obj: '102.4', nivel: 2, peso: 3,
  make(rng) {
    const names = rng.sample(PKGS, 6).sort();
    const states = names.map(() => rng.weighted(DSTATES, (s) => (s.st === 'ii' ? 4 : s.st === 'rc' ? 3 : 1.2)));
    const seenRare = new Set();
    states.forEach((s, i) => { if (s.st !== 'ii' && s.st !== 'rc') { if (seenRare.has(s.st)) states[i] = DSTATES[0]; seenRare.add(s.st); } });
    if (!states.some((s) => s.st === 'rc')) states[rng.int(0, 5)] = DSTATES[1];
    for (let i = 0; i < states.length && states.filter((s) => s.st === 'rc').length > 2; i++) if (states[i].st === 'rc') states[i] = DSTATES[0];
    const vers = names.map(() => `${rng.int(0, 9)}.${rng.int(0, 30)}${rng.chance(0.5) ? `.${rng.int(0, 9)}` : ''}-${rng.int(1, 4)}`);
    const archs = names.map(() => rng.pick(['amd64', 'amd64', 'all']));
    const w1 = Math.max(...names.map((n) => n.length), 14); const w2 = Math.max(...vers.map((v) => v.length), 12);
    const lines = names.map((n, i) => `${states[i].st}  ${n.padEnd(w1)} ${vers[i].padEnd(w2)} ${archs[i].padEnd(12)} Pacote ${n}`);
    const head = ['Desired=Unknown/Install/Remove/Purge/Hold', '| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend', '|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)', `||/ ${'Name'.padEnd(w1)} ${'Version'.padEnd(w2)} Architecture Description`, `+++-${'='.repeat(w1)}-${'='.repeat(w2)}-============-=================================`];
    const listing = [...head, ...lines].join('\n');
    const status = names.map((n, i) => `Package: ${n}\nStatus: ${states[i].desired} ok ${states[i].status}\nVersion: ${vers[i]}\nArchitecture: ${archs[i]}\nMaintainer: Aluno <a@b.c>\nDescription: Pacote ${n}\n`).join('\n');
    const verify = { sh: `d=$(mktemp -d); mkdir -p $d/info $d/updates; : > $d/available; printf '%s\\n' ${sq(status)} > $d/status; dpkg --admindir=$d -l | tail -n +6 | awk '{printf "%s:%s ", $1, $2}'`, expect: names.map((n, i) => `${states[i].st}:${n}`).join(' ') };
    const intro = `Saída de \`dpkg -l\`:\n\n${block(listing)}\n\n`;
    const fmt = rng.int(1, 5);
    const stOf = (s) => DSTATES.find((x) => x.st === s);
    if (fmt === 1) {
      const rc = names.filter((n, i) => states[i].st === 'rc');
      const others = names.filter((n, i) => states[i].st !== 'rc');
      if (rc.length === 1) return { type: 'unica', text: `${intro}Qual pacote foi removido, mas ainda mantém seus arquivos de configuração no disco?`, options: mcq(rng, rc[0], others), explanation: `O estado \`rc\` (Desired=**r**emove/de-install, Status=**c**onfig-files) indica pacote removido com a configuração restante. Isso acontece com \`dpkg -r\`/\`apt-get remove\`; \`dpkg -P\`/\`apt-get purge\` eliminam também a configuração. Aqui: ${rc[0]}.`, ref: ['101:p.115-117'], verify };
      return { type: 'multipla', text: `${intro}Quais pacotes foram removidos, mas ainda mantêm seus arquivos de configuração no disco?`, options: multi(rng, rc, others, Math.min(others.length, rc.length === 2 ? 3 : 2)), explanation: `O estado \`rc\` indica pacote removido (remove) com a configuração restante: ${rc.join(', ')}. Para apagar tudo use \`dpkg -P PACOTE\` ou \`apt-get purge PACOTE\`.`, ref: ['101:p.115-117'], verify };
    }
    if (fmt === 2) {
      const i = rng.int(0, 5); const s = states[i];
      return { type: 'unica', text: `${intro}O que significa o estado \`${s.st}\` do pacote \`${names[i]}\`?`, options: mcq(rng, s.d[0].toUpperCase() + s.d.slice(1), DSTATES.filter((x) => x.st !== s.st).map((x) => x.d[0].toUpperCase() + x.d.slice(1)).concat(['Desinstalado e purgado: nada resta no sistema'])), explanation: `As duas primeiras colunas combinam o estado desejado (Desired: u/i/r/p/h) com o estado real (Status: n/i/c/U/F/h/W/t). \`${s.st}\` = ${s.d}. Pacotes purgados ou nunca instalados nem aparecem na listagem.`, ref: ['101:p.115-117'], verify };
    }
    if (fmt === 3) {
      const i = states.findIndex((s) => s.st === 'rc'); const n = names[i];
      const all = [`dpkg -P ${n}`, `apt-get purge ${n}`, `apt-get remove --purge ${n}`];
      const ok = rng.pick(all);
      return { type: 'unica', text: `${intro}Qual comando elimina \`${n}\` por completo, apagando também a configuração que restou (para ele sair da listagem)?`, options: mcq(rng, ok, [`dpkg -r ${n}`, `apt-get remove ${n}`, `dpkg -L ${n}`, `apt-get autoremove ${n}`, `dpkg -i ${n}`]), explanation: `O pacote está em \`rc\`: o software já foi removido; só resta a configuração. \`remove\`/\`-r\` não a apagam; \`dpkg -P\`, \`apt-get purge\` e \`apt-get remove --purge\` sim. Depois disso o pacote deixa de constar em \`dpkg -l\`.`, ref: ['101:p.117', '101:p.121'], verify };
    }
    if (fmt === 4) {
      const held = names.filter((n, i) => states[i].st === 'hi');
      const inst = names.filter((n, i) => states[i].st === 'ii');
      if (held.length === 1 && inst.length >= 3) return { type: 'unica', text: `${intro}Qual pacote está marcado como **hold** (não será atualizado por \`apt-get upgrade\`)?`, options: mcq(rng, held[0], names.filter((n) => n !== held[0])), explanation: 'Na primeira coluna (Desired), `h` = hold: o pacote foi travado (por exemplo com `apt-mark hold` ou `dpkg --set-selections`) e não é atualizado. A segunda coluna `i` mostra que continua instalado: `hi`.', ref: ['101:p.115-117'], verify };
    }
    const un = names.filter((n, i) => states[i].st === 'iU');
    if (un.length === 1) {
      const ok = rng.pick([`dpkg --configure ${un[0]}`, 'dpkg --configure -a']);
      return { type: 'unica', text: `${intro}O pacote \`${un[0]}\` está em \`iU\`. Qual comando tenta concluir a configuração dele (e dos demais pacotes pendentes)?`, options: mcq(rng, ok, [`dpkg -P ${un[0]}`, `apt-cache policy ${un[0]}`, `dpkg -c ${un[0]}`, `dpkg --remove ${un[0]}`, `dpkg -l ${un[0]}`]), explanation: '`iU` = instalação desejada, status "desempacotado": os arquivos foram extraídos, mas o script de configuração (postinst) não concluiu. `dpkg --configure PACOTE` (ou `dpkg --configure -a` para todos os pendentes) tenta terminar; `apt-get install -f` também ajuda quando faltam dependências.', ref: ['101:p.115-117'], verify };
    }
    const i = rng.int(0, 5);
    return { type: 'unica', text: `${intro}Qual é a versão instalada do pacote \`${names[i]}\`?`, options: mcq(rng, vers[i], vers.filter((v) => v !== vers[i]).concat([`${vers[i].split('-')[0]}-${(Number(vers[i].split('-')[1]) % 4) + 1 === Number(vers[i].split('-')[1]) ? 9 : (Number(vers[i].split('-')[1]) % 4) + 1}`])), explanation: 'A terceira coluna de `dpkg -l` mostra a versão (upstream-revisão Debian); a quarta, a arquitetura (`amd64`, `all` etc.).', ref: ['101:p.115-117'], verify };
  },
};

const debConcepts = tableGen({
  id: 'deb-concepts', obj: '102.4', nivel: 2, peso: 2, ref: ['101:p.113-127'],
  rows: [
    { q: 'Qual é a principal diferença entre `dpkg` e `apt-get` ao instalar software?', ok: 'O apt-get resolve e baixa dependências a partir dos repositórios; o dpkg instala arquivos .deb locais sem baixar dependências', bad: ['O dpkg baixa pacotes da internet; o apt-get só instala arquivos .deb locais', 'O apt-get só funciona em pacotes RPM; o dpkg, em pacotes .deb', 'Não há diferença: ambos fazem as mesmas tarefas com as mesmas opções', 'O dpkg resolve dependências automaticamente; o apt-get exige que o administrador as instale'], why: 'O `dpkg` é a ferramenta de baixo nível (instala, remove e consulta pacotes). O APT (`apt-get`, `apt-cache`) trabalha com repositórios, resolve dependências e baixa os pacotes — chamando o dpkg para instalá-los.' },
    { q: 'Qual a diferença entre `apt-get update` e `apt-get upgrade`?', ok: 'update atualiza o índice de pacotes disponíveis; upgrade instala as versões mais novas dos pacotes já instalados', bad: ['update instala versões novas; upgrade atualiza o índice de pacotes', 'update atualiza o kernel; upgrade atualiza só as bibliotecas', 'Ambos fazem o mesmo; upgrade é apenas o nome antigo de update', 'update remove pacotes obsoletos; upgrade instala novos pacotes'], why: 'A ordem normal é `apt-get update` (sincronizar as listas dos repositórios) seguida de `apt-get upgrade` (aplicar as atualizações).' },
    { q: 'O `dpkg -i pacote.deb` falhou por dependências não satisfeitas. Qual é a forma indicada de resolver?', ok: 'apt-get install -f, que instala as dependências ausentes e conclui a instalação', bad: ['dpkg -r pacote, que remove o pacote e suas dependências', 'apt-get upgrade, que atualiza todos os pacotes e repara o dpkg', 'dpkg -P --force-all, que ignora as dependências e apaga a base do dpkg', 'apt-cache fix, que corrige o índice dos repositórios'], why: '`apt-get install -f` (fix-broken) baixa o que falta e conclui a configuração dos pacotes pendentes.' },
    { q: 'Qual arquivo tradicionalmente lista os repositórios usados pelo APT (além dos arquivos em /etc/apt/sources.list.d/)?', ok: '/etc/apt/sources.list', bad: ['/etc/apt/apt.conf', '/var/lib/dpkg/status', '/etc/dpkg/dpkg.cfg', '/etc/apt/preferences'], why: 'O `/etc/apt/sources.list` e os arquivos `*.list` de `/etc/apt/sources.list.d/` definem os repositórios (versões recentes do Debian/Ubuntu também aceitam o formato deb822, `*.sources`). `/var/lib/dpkg/status` é a base de pacotes instalados.' },
    { q: 'Onde o dpkg registra o estado de todos os pacotes instalados?', ok: '/var/lib/dpkg/status', bad: ['/etc/dpkg/status', '/var/cache/apt/archives/status', '/etc/apt/status.list', '/usr/share/dpkg/installed'], why: '`/var/lib/dpkg/status` é a base de dados do dpkg; `/var/lib/dpkg/info/` guarda, para cada pacote, as listas de arquivos (`.list`), somas MD5 e scripts de manutenção.' },
    { q: 'Em qual diretório o APT guarda os arquivos .deb baixados durante as instalações?', ok: '/var/cache/apt/archives/', bad: ['/var/lib/apt/lists/', '/etc/apt/archives/', '/usr/share/apt/debs/', '/var/lib/dpkg/info/'], why: 'Os `.deb` baixados ficam em `/var/cache/apt/archives/` (podem ser removidos com `apt-get clean`). `/var/lib/apt/lists/` guarda os índices obtidos com `apt-get update`.' },
    { q: 'Em um sistema Debian, o que ocorre com os arquivos de configuração do pacote ao executar `apt-get remove pacote`?', ok: 'Ficam no sistema (o pacote passa ao estado rc); apt-get purge os apagaria', bad: ['São apagados junto com o pacote', 'São movidos para /var/backups e restaurados automaticamente na reinstalação', 'São apagados somente se pertencerem ao usuário root', 'São compactados e enviados ao repositório'], why: 'Remover deixa a configuração (útil para uma reinstalação futura). Purgar (`purge`, `--purge`, `dpkg -P`) elimina tudo.' },
    { q: 'Qual a diferença entre `apt-get upgrade` e `apt-get dist-upgrade`?', ok: 'dist-upgrade pode instalar e remover pacotes para resolver mudanças de dependências; upgrade nunca remove pacotes', bad: ['dist-upgrade atualiza só o kernel; upgrade atualiza o resto', 'upgrade muda de versão da distribuição; dist-upgrade apenas atualiza o índice', 'dist-upgrade só funciona com repositórios locais', 'Não há diferença prática entre os dois'], why: '`upgrade` é conservador (não remove pacotes nem instala novos que não sejam dependências simples); `dist-upgrade` (`full-upgrade`) lida com mudanças maiores de dependências, inclusive removendo pacotes.' },
    { q: 'Qual comando impede que um pacote seja atualizado pelo `apt-get upgrade` (marca como hold)?', ok: 'apt-mark hold pacote', bad: ['apt-get hold pacote', 'dpkg --no-upgrade pacote', 'apt-cache lock pacote', 'dpkg -h pacote'], why: '`apt-mark hold` (ou `echo "pacote hold" | dpkg --set-selections`) trava o pacote; ele aparece como `hi` em `dpkg -l`. `dpkg --get-selections` lista as marcações.' },
    { q: 'Antes de usar `apt-file search` pela primeira vez, qual comando precisa ser executado?', ok: 'apt-file update', bad: ['apt-get update-files', 'apt-cache gencaches', 'dpkg --update-contents', 'apt-file refresh'], why: 'O `apt-file` usa seu próprio índice de conteúdo (lista de arquivos de cada pacote dos repositórios), que é criado e atualizado com `apt-file update`.' },
    { q: 'Qual diretório guarda, para cada pacote instalado pelo dpkg, a lista de arquivos (`.list`), as somas MD5 e os scripts postinst/prerm?', ok: '/var/lib/dpkg/info/', bad: ['/var/cache/apt/archives/', '/etc/dpkg/info/', '/usr/share/doc/', '/var/lib/apt/lists/'], why: 'O `dpkg -L` lê os arquivos `/var/lib/dpkg/info/PACOTE.list`; o `dpkg -V` usa os `.md5sums`.' },
    (rng) => {
      const n = rng.pick(['htop', 'bash-completion', 'libssl3', 'openssh-server', 'python3-pip']); const v = `${rng.int(1, 9)}.${rng.int(0, 20)}.${rng.int(0, 9)}-${rng.int(1, 5)}`; const a = rng.pick(['amd64', 'arm64', 'i386', 'all']);
      const file = `${n}_${v}_${a}.deb`; const which = rng.pick(['nome', 'versão', 'arquitetura']);
      const ok = { nome: n, versão: v, arquitetura: a }[which];
      const pool = { nome: [`${n}_${v}`, `${n}_${v}_${a}`, a, v], versão: [n, a, `${v.split('-')[0]}`, `${v.split('-')[1]}`, `${n}_${v}`], arquitetura: [n, v, 'x86_64', 'noarch', 'deb'] }[which];
      return { q: `Um arquivo de pacote Debian se chama \`${file}\`. Seguindo a convenção \`nome_versão_arquitetura.deb\`, qual é a ${which}?`, ok, bad: pool.filter((x) => x !== ok), why: `O nome de arquivo de um .deb tem a forma \`nome_versão_arquitetura.deb\`. Aqui: nome=${n}; versão=${v}; arquitetura=${a} (\`all\` significa independente de arquitetura). Para pacotes RPM a convenção é diferente: nome-versão-release.arquitetura.rpm.` };
    },
  ],
});

const RELS = [
  { suite: 'bookworm', base: 'http://deb.debian.org/debian', comps: ['main', 'contrib', 'non-free-firmware'], sec: 'bookworm-security', secUrl: 'http://security.debian.org/debian-security', distro: 'Debian 12' },
  { suite: 'bullseye', base: 'http://deb.debian.org/debian', comps: ['main', 'contrib', 'non-free'], sec: 'bullseye-security', secUrl: 'http://security.debian.org/debian-security', distro: 'Debian 11' },
  { suite: 'jammy', base: 'http://archive.ubuntu.com/ubuntu', comps: ['main', 'restricted', 'universe', 'multiverse'], sec: 'jammy-security', secUrl: 'http://security.ubuntu.com/ubuntu', distro: 'Ubuntu 22.04' },
  { suite: 'focal', base: 'http://br.archive.ubuntu.com/ubuntu', comps: ['main', 'universe'], sec: 'focal-updates', secUrl: 'http://br.archive.ubuntu.com/ubuntu', distro: 'Ubuntu 20.04' },
];
const debSources = {
  id: 'deb-sources', obj: '102.4', nivel: 2, peso: 2,
  make(rng) {
    const r = rng.pick(RELS); const src = rng.chance(0.4);
    const comps = r.comps.join(' ');
    const line = `${src ? 'deb-src' : 'deb'} ${r.base} ${r.suite} ${comps}`;
    const fmt = rng.int(1, 5);
    const fieldsTxt = '`tipo URI suíte componentes...`';
    if (fmt === 1) {
      const k = rng.pick([['tipo', src ? 'deb-src' : 'deb', ['deb', 'deb-src', 'rpm', 'repo']], ['URI do repositório', r.base, [r.secUrl === r.base ? 'http://ftp.debian.org/debian' : r.secUrl, 'file:///cdrom', 'cdrom:[Debian]']], ['suíte (versão/codinome da distribuição)', r.suite, [r.sec === r.suite ? 'stable-updates' : r.sec, 'main', 'testing-backports']]]);
      return { type: 'unica', text: `Na linha de /etc/apt/sources.list abaixo, qual valor ocupa o campo **${k[0]}**?\n\n${block(line)}`, options: mcq(rng, k[1], k[2].filter((x) => x !== k[1])), explanation: `O formato é ${fieldsTxt}: \`${line.split(' ')[0]}\` = tipo (\`deb\` = pacotes binários, \`deb-src\` = código-fonte), \`${r.base}\` = URI, \`${r.suite}\` = suíte/codinome (${r.distro}) e os demais campos são os componentes: ${comps}.`, ref: ['101:p.118-120'] };
    }
    if (fmt === 2) {
      return { type: 'multipla', text: `Na linha abaixo, quais valores são **componentes** (áreas) do repositório?\n\n${block(line)}`, options: multi(rng, r.comps.length >= 2 ? r.comps.slice(0, Math.min(3, r.comps.length)) : r.comps, [r.suite, r.base.replace('http://', ''), 'deb', 'amd64', 'stable'].filter((x) => !r.comps.includes(x)), 3), explanation: `Depois da suíte (${r.suite}) vêm os componentes: ${comps}. Em Debian, \`main\` tem software livre da distribuição, \`contrib\` software livre que depende de itens não livres, e \`non-free\` (ou \`non-free-firmware\`) software/firmware não livre; no Ubuntu há \`restricted\`, \`universe\` e \`multiverse\`.`, ref: ['101:p.118-120'] };
    }
    if (fmt === 3) {
      return { type: 'unica', text: 'Depois de adicionar ou alterar linhas em /etc/apt/sources.list, o que é preciso executar para o APT passar a enxergar os pacotes do novo repositório?', options: mcq(rng, 'apt-get update', ['apt-get upgrade', 'dpkg-reconfigure apt', 'apt-cache gencaches --force', 'dpkg --update-avail']), explanation: '`apt-get update` baixa os índices (Packages/Release) de cada linha configurada. Sem isso, `apt-cache search` e `apt-get install` continuam usando as listas antigas.', ref: ['101:p.118-120'] };
    }
    if (fmt === 4) {
      return { type: 'unica', text: `O que a linha abaixo permite fazer, depois de \`apt-get update\`?\n\n${block(`deb-src ${r.base} ${r.suite} ${comps}`)}`, options: mcq(rng, 'Baixar o código-fonte dos pacotes dessa suíte (por exemplo, com apt-get source)', ['Instalar pacotes binários para a arquitetura i386', 'Instalar apenas pacotes de segurança', 'Atualizar a distribuição inteira para a próxima versão', 'Compilar o kernel automaticamente']), explanation: '`deb-src` indica repositório de **pacotes-fonte**; `deb` indica pacotes binários. As linhas `deb-src` são necessárias para `apt-get source` e `apt-get build-dep`.', ref: ['101:p.118-120'] };
    }
    const comp = rng.pick(r.comps);
    const desc = { main: 'Software livre mantido pela própria distribuição', contrib: 'Software livre que depende de componentes não livres', 'non-free': 'Software que não segue as diretrizes de software livre', 'non-free-firmware': 'Firmware não livre necessário para certos dispositivos', restricted: 'Software de suporte oficial com licença restritiva (drivers proprietários)', universe: 'Software livre mantido pela comunidade', multiverse: 'Software que não é livre, sem suporte oficial' }[comp];
    return { type: 'unica', text: `Em um repositório da suíte \`${r.suite}\` (${r.distro}), o que oferece o componente \`${comp}\`?`, options: mcq(rng, desc, ['Software livre mantido pela própria distribuição', 'Software livre que depende de componentes não livres', 'Software que não segue as diretrizes de software livre', 'Software livre mantido pela comunidade', 'Software de suporte oficial com licença restritiva (drivers proprietários)', 'Software que não é livre, sem suporte oficial', 'Firmware não livre necessário para certos dispositivos'].filter((x) => x !== desc)), explanation: 'Componentes do Debian: `main` (livre, oficial), `contrib` (livre, mas depende de itens não livres), `non-free` e, desde o Debian 12, `non-free-firmware`. No Ubuntu: `main`, `restricted`, `universe` e `multiverse`.', ref: ['101:p.118-120'] };
  },
};

export const debGens = [debTask, dpkgL, debConcepts, debSources];


// ═════════════════════════════════════════════ 102.5 ═════════════════════════════════════════════
const RPKGS = ['httpd', 'nginx', 'wget', 'unzip', 'htop', 'vim-enhanced', 'git', 'tmux', 'rsync', 'nmap', 'bind-utils', 'tcpdump', 'telnet', 'mc', 'lsof', 'p7zip'];

/** Constrói um .rpm real (noarch) com arquivos sob $d/inst e, opcionalmente, "instala" no banco rpm privado + extrai os arquivos. */
function rpmFixture({ name, ver, rel, bin, conf, install = true, extract = true, arch = 'noarch', owner = 'user', requires = false }) {
  const defattr = owner === 'root' ? '%defattr(-,root,root,-)' : '%defattr(-,$(id -un),$(id -gn),-)';
  return [
    'd=$(mktemp -d); cd "$d"',
    'mkdir -p rb/BUILD rb/RPMS rb/SOURCES rb/SPECS rb/SRPMS db',
    'cat > rb/SPECS/p.spec <<SPEC',
    `Name: ${name}`, `Version: ${ver}`, `Release: ${rel}`, `Summary: Pacote ${name}`, 'License: MIT', 'BuildArch: noarch', ...(requires ? ['Requires: bash'] : []),
    '%description', `Pacote de teste ${name}.`, '%install',
    'mkdir -p %{buildroot}$d/inst/usr/bin %{buildroot}$d/inst/etc',
    `printf 'conteudo\\n' > %{buildroot}$d/inst/usr/bin/${bin}; chmod 755 %{buildroot}$d/inst/usr/bin/${bin}`,
    `printf 'opcao=1\\n' > %{buildroot}$d/inst/etc/${conf}`,
    '%files', defattr, `$d/inst/usr/bin/${bin}`, `%config(noreplace) $d/inst/etc/${conf}`,
    'SPEC',
    'rpmbuild --define "_topdir $d/rb" -bb rb/SPECS/p.spec >/dev/null 2>&1',
    'f=$(ls rb/RPMS/*/*.rpm); cp "$f" .; f=$(basename "$f")',
    'rpm --dbpath "$d/db" --initdb; R="rpm --dbpath $d/db"',
    ...(install ? ['$R -ivh --justdb --nodeps --noscripts "$f" >/dev/null 2>&1'] : []),
    ...(install && extract ? ['(cd / && rpm2cpio "$d/$f" | cpio -idm 2>/dev/null)'] : []),
  ].join('\n');
}

const TOOLS = { rpm: 'rpm', yum: 'yum', dnf: 'dnf', zypper: 'zypper' };
const TASKS = [
  { d: (c) => `Instalar o pacote \`${c.p}\` a partir dos repositórios configurados, resolvendo as dependências`, yum: 'yum install P', dnf: 'dnf install P', zypper: 'zypper in P', apt: 'apt-get install P', near: { yum: ['yum add P', 'yum get P'], dnf: ['dnf add P', 'dnf get P'], zypper: ['zypper add P', 'zypper get P'] }, why: 'Todos instalam do repositório e resolvem dependências: `yum install`, `dnf install` e `zypper install` (abreviado `zypper in`). O `rpm -i` instala só um arquivo local e não resolve dependências.' },
  { d: (c) => `Remover o pacote \`${c.p}\` (e o que depender dele, se o gerenciador pedir)`, yum: 'yum remove P', dnf: 'dnf remove P', zypper: 'zypper rm P', apt: 'apt-get remove P', near: { yum: ['yum delete P', 'yum erase-all P'], dnf: ['dnf delete P', 'dnf rm-all P'], zypper: ['zypper del P', 'zypper uninstall P'] }, why: 'Remoção: `yum remove`, `dnf remove`, `zypper remove` (abreviado `zypper rm`). O `rpm -e` remove sem resolver dependências (falha se outros pacotes dependerem do removido).' },
  { d: (c) => `Procurar nos repositórios pacotes cujo nome ou descrição contenha \`${c.x}\``, yum: 'yum search X', dnf: 'dnf search X', zypper: 'zypper se X', apt: 'apt-cache search X', near: { yum: ['yum find X', 'yum list-search X'], dnf: ['dnf find X', 'dnf lookup X'], zypper: ['zypper find X', 'zypper lookup X'] }, why: 'A busca é `search` em yum e dnf; no zypper `search` abrevia-se `se`. O equivalente do APT é `apt-cache search`.' },
  { d: (c) => `Mostrar informações de \`${c.p}\` (versão, repositório, descrição)`, yum: 'yum info P', dnf: 'dnf info P', zypper: 'zypper info P', rpm: 'rpm -qi P', apt: 'apt-cache show P', near: { yum: ['yum show P', 'yum about P'], dnf: ['dnf show P', 'dnf detail P'], zypper: ['zypper show P', 'zypper describe P'], rpm: ['rpm -si P', 'rpm -qs P'] }, why: '`info` mostra o registro do pacote em yum, dnf e zypper; com o rpm usa-se `rpm -qi` (pacote instalado) ou `rpm -qip arquivo.rpm` (arquivo).' },
  { d: (c) => `Descobrir qual pacote fornece o arquivo \`${c.y}\``, yum: 'yum whatprovides Y', dnf: 'dnf provides Y', zypper: 'zypper se --provides Y', rpm: 'rpm -qf Y', apt: 'apt-file search Y', near: { yum: ['yum which Y', 'yum owner Y'], dnf: ['dnf owner Y', 'dnf which Y'], zypper: ['zypper provides Y', 'zypper wp Y'], rpm: ['rpm -qp Y', 'rpm -ql Y'] }, why: 'yum: `whatprovides` (ou `provides`); dnf: `provides`; zypper: `search --provides`; rpm: `rpm -qf ARQUIVO` consulta só pacotes **instalados**. O APT usa `dpkg -S` (instalados) ou `apt-file search`.' },
  { d: () => 'Listar todos os pacotes instalados', yum: 'yum list installed', dnf: 'dnf list --installed', zypper: 'zypper se -i', rpm: 'rpm -qa', apt: 'dpkg -l', near: { yum: ['yum list --all-installed', 'yum installed'], dnf: ['dnf installed', 'dnf list --available'], zypper: ['zypper list installed', 'zypper se --available'], rpm: ['rpm -qi', 'rpm -ql'] }, why: 'yum: `list installed`; dnf: `list --installed`; zypper: `search -i` (apenas instalados); rpm: `rpm -qa` (query all).' },
  { d: (c) => `Atualizar o pacote \`${c.p}\` para a versão mais recente disponível nos repositórios`, yum: 'yum update P', dnf: 'dnf upgrade P', zypper: 'zypper up P', apt: 'apt-get install --only-upgrade P', near: { yum: ['yum upgrade-all P', 'yum refresh P'], dnf: ['dnf refresh P', 'dnf update-all P'], zypper: ['zypper upgrade-all P', 'zypper refresh P'] }, why: '`yum update` / `dnf upgrade` (sem nome atualizam tudo) e `zypper update` (abreviado `up`). `zypper refresh` só atualiza os metadados dos repositórios.' },
  { d: () => 'Listar os repositórios configurados', yum: 'yum repolist', dnf: 'dnf repolist', zypper: 'zypper repos', apt: 'cat /etc/apt/sources.list', near: { yum: ['yum repos', 'yum list-repos'], dnf: ['dnf repos', 'dnf list-repos'], zypper: ['zypper repolist-all', 'zypper list-repos'] }, why: 'yum e dnf: `repolist` (com `all` mostra também os desabilitados); zypper: `repos` (ou `lr`). Os arquivos ficam em /etc/yum.repos.d/*.repo (yum/dnf) e /etc/zypp/repos.d/ (zypper).' },
  { d: (c) => `Adicionar o repositório \`${c.u}\``, yum: 'yum-config-manager --add-repo U', zypper: 'zypper addrepo U NOME', apt: "echo 'deb U suite main' >> /etc/apt/sources.list", near: { yum: ['yum addrepo U', 'yum-config-manager --enable-repo U'], zypper: ['zypper add-repo-url U', 'zypper mr -a U NOME'] }, why: 'yum: `yum-config-manager --add-repo URL` (gera um .repo em /etc/yum.repos.d/); zypper: `zypper addrepo URL alias` (abreviado `ar`).' },
  { d: (c) => `Desabilitar o repositório \`${c.i}\` (sem apagá-lo)`, yum: 'yum-config-manager --disable I', dnf: 'dnf config-manager --set-disabled I', zypper: 'zypper modifyrepo -d I', apt: 'sed -i "s/^deb/#deb/" /etc/apt/sources.list', near: { yum: ['yum-config-manager --remove I', 'yum repo --disable I'], dnf: ['dnf config-manager --disable-repo I', 'dnf repo-disable I'], zypper: ['zypper removerepo I', 'zypper modifyrepo -e I'] }, why: 'yum: `yum-config-manager --disable ID` (`--enable` para reativar); dnf: `config-manager --set-disabled ID`; zypper: `modifyrepo -d ALIAS` (`-e` habilita; `removerepo` apaga).' },
  { d: () => 'Atualizar os metadados (índices) dos repositórios', zypper: 'zypper refresh', yum: 'yum makecache', dnf: 'dnf makecache', apt: 'apt-get update', near: { yum: ['yum update-index', 'yum refresh'], dnf: ['dnf update-index', 'dnf metadata'], zypper: ['zypper update-index', 'zypper makecache'] }, why: '`zypper refresh` (ou `ref`) atualiza os índices dos repositórios; em yum/dnf `makecache` faz o mesmo. Equivale ao `apt-get update` do Debian.' },
  { d: (c) => `Instalar o arquivo local \`${c.f}\` resolvendo as dependências nos repositórios`, yum: 'yum localinstall F', dnf: 'dnf install F', zypper: 'zypper in F', apt: 'apt install ./F', near: { yum: ['yum install-local F', 'yum fileinstall F'], dnf: ['dnf localinstall-file F', 'dnf fileinstall F'], zypper: ['zypper localinstall F', 'zypper install-local F'] }, why: 'yum aceita `localinstall` (e também `install arquivo.rpm`); dnf e zypper instalam o arquivo diretamente com `install`. A vantagem sobre `rpm -i` é a resolução de dependências.' },
];

const RPM_ROWS = (c, fx, fxN) => [
  { d: `Instalar o pacote do arquivo local \`${c.f}\` (sem resolver dependências), mostrando progresso detalhado com marcas de hash`, ok: `rpm -ivh ${c.f}`, near: [`rpm -qvh ${c.f}`, `rpm -Fvh ${c.f}`, `rpm -evh ${c.f}`, `rpm -ihv --nodeps-all ${c.f}`], v: [`${fx(false)}; $R -ivh --justdb --nodeps --noscripts "$f" >/dev/null 2>&1; $R -q ${c.p}`, `${c.p}-${c.ver}-${c.rel}.noarch`], why: '`-i` instala, `-v` é verbose e `-h` imprime marcas `#` de progresso (`-ivh` é a forma clássica). `-F` só atualiza o que já está instalado e `-e` remove.' },
  { d: `Atualizar para a versão do arquivo \`${c.f}\`, instalando o pacote caso ainda não exista uma versão anterior`, ok: `rpm -Uvh ${c.f}`, near: [`rpm -Fvh ${c.f}`, `rpm -Evh ${c.f}`, `rpm -uvh ${c.f}`, `rpm -Ivh ${c.f}`], v: [`${fx(false)}; $R -Uvh --justdb --nodeps --noscripts "$f" >/dev/null 2>&1; $R -q ${c.p}`, `${c.p}-${c.ver}-${c.rel}.noarch`], why: '`-U` (upgrade) atualiza **ou instala** se não houver versão anterior. `-F` (freshen) atualiza somente se já estiver instalado.' },
  { d: `Atualizar para a versão do arquivo \`${c.f}\` **somente se** uma versão anterior já estiver instalada (não instalar caso contrário)`, ok: `rpm -Fvh ${c.f}`, near: [`rpm -Uvh ${c.f}`, `rpm -ivh ${c.f}`, `rpm -Uvh --only-installed ${c.f}`, `rpm -evh ${c.f}`], v: [`${fx(false)}; $R -Fvh --justdb --nodeps --noscripts "$f" >/dev/null 2>&1; $R -qa | wc -l`, '0'], why: '`-F` (freshen) ignora pacotes que ainda não estão instalados; `-U` instalaria mesmo assim.' },
  { d: `Remover o pacote instalado \`${c.p}\``, ok: `rpm -e ${c.p}`, near: [`rpm -r ${c.p}`, `rpm -d ${c.p}`, `rpm -qe ${c.p}`, `rpm -x ${c.p}`], v: [`${fx()}; $R -e ${c.p} >/dev/null 2>&1; $R -qa | wc -l`, '0'], why: '`rpm -e` (erase) remove o pacote; se outro pacote depender dele aparece "Failed dependencies" e a remoção é recusada.' },
  { d: 'Listar todos os pacotes RPM instalados', ok: 'rpm -qa', near: ['rpm -qi', 'rpm -ql', 'rpm -q --list', 'rpm -qp'], v: [`${fx()}; $R -qa | grep -c '^${c.p}-'`, '1'], why: '`rpm -qa` (query all) lista os pacotes instalados.' },
  { d: `Mostrar versão, release, arquitetura, licença e descrição do pacote **instalado** \`${c.p}\``, ok: `rpm -qi ${c.p}`, near: [`rpm -ql ${c.p}`, `rpm -qf ${c.p}`, `rpm -qip ${c.p}`, `rpm -qR ${c.p}`], v: [`${fx()}; $R -qi ${c.p} | grep -c '^Name        : ${c.p}$'`, '1'], why: '`-qi` (query + info). Para um arquivo `.rpm` ainda não instalado acrescenta-se `p`: `rpm -qip arquivo.rpm`.' },
  { d: `Listar os arquivos que o pacote **instalado** \`${c.p}\` colocou no sistema`, ok: `rpm -ql ${c.p}`, near: [`rpm -qi ${c.p}`, `rpm -qf ${c.p}`, `rpm -qlp ${c.p}`, `rpm -qc ${c.p}`], v: [`${fx()}; $R -ql ${c.p} | sed "s#$d/inst##" | grep -c '^/usr/bin/${c.bin}$'`, '1'], why: '`-ql` (query + list). `-qc` lista só os arquivos de configuração e `-qd` só a documentação.' },
  { d: `Listar apenas os arquivos de **configuração** do pacote instalado \`${c.p}\``, ok: `rpm -qc ${c.p}`, near: [`rpm -ql ${c.p}`, `rpm -qd ${c.p}`, `rpm -qC ${c.p}`, `rpm -qf ${c.p}`], v: [`${fx()}; $R -qc ${c.p} | sed "s#$d/inst##"`, `/etc/${c.conf}`], why: '`-qc` mostra os arquivos marcados como configuração (`%config`); `-qd` mostra os marcados como documentação.' },
  { d: `Listar as dependências (requisitos) do pacote instalado \`${c.p}\``, ok: `rpm -qR ${c.p}`, near: [`rpm -qr ${c.p}`, `rpm -q --whatrequires ${c.p}`, `rpm -qd ${c.p}`, `rpm -qa --requires ${c.p}`], v: [`${fx(true, true)}; $R -qR ${c.p} | grep -c '^bash$'`, '1'], why: '`-qR` (`--requires`) lista o que o pacote requer; `--whatrequires` faz o contrário (quem depende dele).' },
  { d: `Descobrir qual pacote **instalado** é dono do arquivo \`/usr/bin/${c.bin}\``, ok: `rpm -qf /usr/bin/${c.bin}`, near: [`rpm -ql /usr/bin/${c.bin}`, `rpm -qp /usr/bin/${c.bin}`, `rpm -qi /usr/bin/${c.bin}`, `rpm -qa /usr/bin/${c.bin}`], v: [`${fx()}; $R -qf $d/inst/usr/bin/${c.bin}`, `${c.p}-${c.ver}-${c.rel}.noarch`], why: '`-qf` (query file) responde qual pacote instalado possui o arquivo. Para pacotes não instalados é preciso consultar o repositório (`yum whatprovides`, `dnf provides`).' },
  { d: `Mostrar as informações do arquivo \`${c.f}\` **sem instalá-lo**`, ok: `rpm -qip ${c.f}`, near: [`rpm -qi ${c.f}`, `rpm -ip ${c.f}`, `rpm -qlp ${c.f}`, `rpm -Vp ${c.f}`], v: [`${fx(false)}; rpm -qip "$f" | grep -c '^Name        : ${c.p}$'`, '1'], why: 'O `p` de `-qp` faz a consulta operar sobre um arquivo `.rpm` (package file) em vez do banco de pacotes instalados.' },
  { d: `Listar os arquivos contidos em \`${c.f}\` **sem instalá-lo**`, ok: `rpm -qlp ${c.f}`, near: [`rpm -ql ${c.f}`, `rpm -qip ${c.f}`, `rpm -qf ${c.f}`, `rpm -lp ${c.f}`], v: [`${fx(false)}; rpm -qlp "$f" | sed "s#$d/inst##" | grep -c '^/usr/bin/${c.bin}$'`, '1'], why: '`rpm -qlp arquivo.rpm` (também escrito `-qpl`) lista o conteúdo do pacote-arquivo.' },
  { d: `Verificar se os arquivos do pacote instalado \`${c.p}\` foram alterados em relação ao que o pacote instalou`, ok: `rpm -V ${c.p}`, near: [`rpm -v ${c.p}`, `rpm -K ${c.p}`, `rpm -qV ${c.p}`, `rpm -qc ${c.p}`], v: [`${fx()}; $R -V ${c.p} >/dev/null 2>&1; echo rc=$?`, 'rc=0'], why: '`rpm -V` (verify) compara tamanho, permissões, digest, dono, data etc. com o banco de dados do RPM e só imprime os arquivos que divergem (`rpm -Va` verifica todos os pacotes). `-K` verifica a assinatura/digest de um arquivo .rpm.' },
  { d: `Verificar a assinatura e os digests (integridade) do arquivo \`${c.f}\` antes de instalá-lo`, ok: `rpm -K ${c.f}`, near: [`rpm -V ${c.f}`, `rpm -qK ${c.f}`, `rpm -Vp ${c.f}`, `rpm --verify-sig ${c.f}`], v: [`${fx(false)}; rpm -K "$f" | sed 's/^[^:]*: //'`, 'digests OK'], why: '`rpm -K` (`--checksig`) confere os digests e a assinatura GPG do arquivo. Para que a assinatura seja reconhecida, importe a chave do fornecedor com `rpm --import CHAVE`.' },
  { d: 'Importar a chave GPG pública do fabricante para que o rpm possa validar assinaturas de pacotes', ok: 'rpm --import RPM-GPG-KEY-fabricante', near: ['rpm -K RPM-GPG-KEY-fabricante', 'rpm -i RPM-GPG-KEY-fabricante', 'rpm --addkey RPM-GPG-KEY-fabricante', 'rpm -qa gpg-pubkey --import'], why: '`rpm --import arquivo-da-chave` grava a chave no banco do RPM (aparece depois como pacote `gpg-pubkey`: `rpm -qa gpg-pubkey*`).' },
  { d: `Extrair os arquivos de \`${c.f}\` para o diretório atual **sem instalar** o pacote`, ok: `rpm2cpio ${c.f} | cpio -idmv`, near: [`rpm -x ${c.f}`, `rpm2cpio ${c.f} > cpio -t`, `rpm -ivh --extract ${c.f}`, `cpio -idmv < rpm2cpio ${c.f}`], v: [`${fx(false)}; mkdir x; cd x; rpm2cpio "../$f" | cpio -idm 2>/dev/null; find . -type f | wc -l`, '2'], why: '`rpm2cpio pacote.rpm` converte o RPM em um fluxo cpio, que `cpio -idmv` extrai (`-i` extrair, `-d` criar diretórios, `-m` preservar datas, `-v` verboso).' },
];

const rpmTask = {
  id: 'rpm-task', obj: '102.5', nivel: 2, peso: 3,
  make(rng) {
    const c = { p: rng.pick(RPKGS), x: rng.pick(['editor', 'monitor', 'compress', 'network', 'backup']), y: rng.pick(['/etc/hosts', '/usr/bin/dig', '/usr/lib64/libssl.so.3', '/usr/sbin/sshd', '/etc/ssh/sshd_config']), u: rng.pick(['https://rpms.remirepo.net/enterprise/remi.repo', 'https://download.example.org/pub/extras.repo', 'https://repo.example.com/el9/custom.repo']), i: rng.pick(['updates', 'epel', 'extras', 'remi', 'repo-non-oss']) };
    c.ver = `${rng.int(1, 9)}.${rng.int(0, 20)}.${rng.int(0, 9)}`; c.rel = `${rng.int(1, 9)}.${rng.pick(['el8', 'el9', 'fc39'])}`; c.bin = c.p.replace(/-.*/, '') + rng.pick(['', 'ctl']); c.conf = `${c.p}.conf`;
    c.f = `${c.p}-${c.ver}-${c.rel}.noarch.rpm`;
    const fxFor = (install = true, requires = false) => rpmFixture({ name: c.p, ver: c.ver, rel: c.rel, bin: c.bin, conf: c.conf, install, requires });
    const tool = rng.pick(['rpm', 'rpm', 'yum', 'dnf', 'zypper']);
    if (tool === 'rpm') {
      const r = rng.pick(RPM_ROWS(c, fxFor));
      const bad = uniq([...r.near]).slice(0, 5);
      const cross = [`yum install ${c.p}`, `dnf remove ${c.p}`, `dpkg -l ${c.p}`, `zypper se ${c.p}`];
      const out = { type: 'unica', text: `Usando diretamente o **rpm**, qual comando executa a tarefa a seguir?\n\n${r.d}`, options: mcq(rng, r.ok, [...bad, ...(r.ok.startsWith('rpm2cpio') ? [] : cross.slice(0, 1))]), explanation: `\`${r.ok}\`. ${r.why}`, ref: ['101:p.137-141'] };
      if (r.v) out.verify = { sh: r.v[0], expect: r.v[1] };
      return out;
    }
    const cands = TASKS.filter((t) => t[tool]);
    const t = rng.pick(cands);
    const sub = (s) => s.replace(/\bP\b/g, c.p).replace(/\bX\b/g, c.x).replace(/\bY\b/g, c.y).replace(/\bU\b/g, c.u).replace(/\bI\b/g, c.i).replace(/\bF\b/g, c.f).replace(/\bNOME\b/g, 'alias');
    const ok = sub(t[tool]);
    const near = (t.near?.[tool] ?? []).map(sub);
    const crossTools = tool === 'zypper' ? ['yum', 'dnf', 'rpm', 'apt'] : ['zypper', 'rpm', 'apt'];
    const cross = crossTools.map((k) => t[k]).filter(Boolean).map(sub);
    const ctx = { yum: 'em um CentOS 7/RHEL 7 (yum)', dnf: 'em um Fedora/RHEL 9 (dnf)', zypper: 'em um openSUSE (zypper)' }[tool];
    const pool = [...near, ...cross].filter((x) => x !== ok);
    return { type: 'unica', text: `${ctx[0].toUpperCase() + ctx.slice(1)}: qual comando executa a tarefa a seguir?\n\n${t.d(c)}`, options: mcq(rng, ok, pool), explanation: `\`${ok}\`. ${t.why} Distratores comuns: comandos de outra família (apt/dpkg, zypper, rpm) ou subcomandos que não existem na ferramenta.`, ref: tool === 'yum' ? ['101:p.142-146'] : tool === 'dnf' ? ['101:p.147-149'] : ['101:p.149-155'] };
  },
};

const FLAGS = [['S', 'tamanho (size)'], ['M', 'modo/permissões (mode)'], ['5', 'digest MD5/SHA (conteúdo)'], ['D', 'número de dispositivo (major/minor)'], ['L', 'destino do link simbólico (link)'], ['U', 'dono (user)'], ['G', 'grupo (group)'], ['T', 'data de modificação (mtime)'], ['P', 'capabilities']];
const MODS = {
  content: { flags: 'S5T', sh: (p) => `echo extra >> ${p}; touch -d @1800000000 ${p}`, d: 'tamanho, digest e data de modificação' },
  contentKeep: { flags: '5', sh: (p) => `cp -p ${p} ${p}.bak; sed -i '1s/^./X/' ${p}; touch -r ${p}.bak ${p}; rm ${p}.bak`, d: 'apenas o digest (mesmo tamanho e mesma data)' },
  mode: { flags: 'M', sh: (p) => `chmod 600 ${p}`, d: 'apenas o modo (permissões)' },
  mtime: { flags: 'T', sh: (p) => `touch -d @1800000000 ${p}`, d: 'apenas a data de modificação' },
  missing: { flags: null, sh: (p) => `rm -f ${p}`, d: 'ausente' },
};
const flagStr = (letters) => 'SM5DLUGTP'.split('').map((ch) => (letters.includes(ch) ? ch : '.')).join('');
const rpmVerify = {
  id: 'rpm-verify', obj: '102.5', nivel: 3, peso: 3,
  make(rng) {
    const name = rng.pick(RPKGS); const ver = `${rng.int(1, 5)}.${rng.int(0, 9)}`; const rel = `${rng.int(1, 5)}.el9`;
    const bin = name.replace(/-.*/, '') + 'ctl'; const conf = `${name}.conf`;
    const files = [{ disp: `/etc/${conf}`, real: `etc/${conf}`, cfg: true }, { disp: `/usr/bin/${bin}`, real: `usr/bin/${bin}`, cfg: false }];
    const kinds = Object.keys(MODS);
    const picks = files.map((f) => ({ ...f, mod: rng.chance(0.75) ? rng.pick(kinds) : null }));
    if (!picks.some((x) => x.mod)) picks[0].mod = rng.pick(kinds);
    const lines = picks.filter((x) => x.mod).map((x) => { const m = MODS[x.mod]; const fl = m.flags === null ? 'missing  ' : flagStr(m.flags); return { x, text: `${m.flags === null ? 'missing  ' : fl}  ${x.cfg ? 'c' : ' '} ${x.disp}`, fl: m.flags === null ? 'missing' : fl }; });
    const fix = rpmFixture({ name, ver, rel, bin, conf });
    const mods = picks.filter((x) => x.mod).map((x) => MODS[x.mod].sh(`$d/inst/${x.real}`)).join('; ');
    const sh = `${fix}; ${mods}; $R -V ${name} 2>&1 | sed "s#$d/inst##"`;
    const expectText = lines.map((l) => (l.fl === 'missing' ? `missing   ${l.x.cfg ? 'c' : ' '} ${l.x.disp}` : l.text)).join('\n');
    const out = lines.map((l) => (l.fl === 'missing' ? `missing   ${l.x.cfg ? 'c' : ' '} ${l.x.disp}` : l.text)).join('\n');
    const verify = { sh, expect: expectText };
    const intro = `Depois de uma invasão suspeita, o administrador executou \`rpm -V ${name}\` e obteve:\n\n${block(out)}\n\n`;
    const fmt = rng.int(1, 4);
    const legend = 'Posições da saída de `rpm -V` (nesta ordem): S tamanho, M modo, 5 digest do conteúdo, D dispositivo, L link simbólico, U dono, G grupo, T data de modificação, P capabilities; um ponto significa "sem diferença". O `c` antes do caminho marca arquivo de configuração e `missing` indica arquivo ausente. Sem saída = tudo íntegro.';
    const real = lines.filter((l) => l.fl !== 'missing');
    if (fmt === 1 && real.length) {
      const l = rng.pick(real); const letters = l.x.mod ? MODS[l.x.mod].flags : '';
      const descOf = (ls) => [...ls].map((ch) => FLAGS.find((f) => f[0] === ch)[1]).join(', ');
      const ok = `Divergem: ${descOf(letters)}`;
      const sets = uniq([letters, ...(letters.length > 1 ? [letters.slice(0, -1), letters.slice(1)] : []), 'M', '5', 'ST', 'S5', 'UG', 'MT', 'L', '5T', 'M5'].filter((s) => s !== letters));
      return { type: 'unica', text: `${intro}O que a linha \`${l.text.trim()}\` indica sobre \`${l.x.disp}\`?`, options: mcq(rng, ok, sets.map((s) => `Divergem: ${descOf(s)}`)), explanation: `${legend} Para \`${l.x.disp}\`: ${l.fl} → ${descOf(letters)}.`, ref: ['101:p.137-141'], verify };
    }
    if (fmt === 2) {
      const content = lines.filter((l) => l.fl !== 'missing' && l.fl.includes('5')).map((l) => l.x.disp);
      const all = files.map((f) => f.disp);
      if (content.length && content.length < all.length) {
        return { type: 'unica', text: `${intro}Em qual arquivo o **conteúdo** (digest) foi alterado?`, options: mcq(rng, content[0], all.filter((x) => x !== content[0]).concat(['/etc/passwd', '/var/log/messages', '/usr/lib64/libc.so.6']).slice(0, 5)), explanation: `${legend} A coluna 3 (\`5\`) só aparece em ${content.join(', ')}.`, ref: ['101:p.137-141'], verify };
      }
    }
    if (fmt === 3 && lines.some((l) => l.fl === 'missing')) {
      const miss = lines.find((l) => l.fl === 'missing');
      return { type: 'unica', text: `${intro}O que significa \`missing\` na linha de \`${miss.x.disp}\`?`, options: mcq(rng, 'O arquivo pertence ao pacote, mas não existe mais no sistema de arquivos', ['O arquivo existe, mas está vazio', 'O arquivo existe, mas pertence a outro pacote', 'O arquivo está corrompido e foi movido para quarentena', 'O arquivo foi alterado apenas em dono e grupo']), explanation: `${legend}`, ref: ['101:p.137-141'], verify };
    }
    const cmdQ = rng.pick([[`Qual comando verifica **todos** os pacotes instalados e imprime apenas as divergências?`, 'rpm -Va', ['rpm -qa', 'rpm -Vp', 'rpm -K', 'rpm -qV']], [`Qual comando compara o pacote instalado \`${name}\` com o arquivo \`${name}-${ver}-${rel}.noarch.rpm\` (em vez de com o banco de dados do RPM)?`, `rpm -Vp ${name}-${ver}-${rel}.noarch.rpm`, [`rpm -V ${name}-${ver}-${rel}.noarch.rpm`, `rpm -K ${name}-${ver}-${rel}.noarch.rpm`, `rpm -qp ${name}`, `rpm -Va ${name}`]]]);
    return { type: 'unica', text: cmdQ[0], options: mcq(rng, cmdQ[1], cmdQ[2]), explanation: '`rpm -Va` verifica todos os pacotes instalados; `rpm -V PACOTE` verifica um; `rpm -Vp arquivo.rpm` usa um arquivo `.rpm` como referência. `rpm -K` verifica assinatura/digest do arquivo, não os arquivos instalados.', ref: ['101:p.137-141'], verify };
  },
};

const NAMES5 = ['httpd', 'python3-devel', 'gcc-c++', 'perl-DBI', 'java-17-openjdk', 'vim-enhanced', 'nginx', 'bind-utils', 'openssh-server', 'tcpdump', 'mariadb-server', 'glibc-langpack-pt'];
const rpmNvra = {
  id: 'rpm-nvra', obj: '102.5', nivel: 2, peso: 2,
  make(rng) {
    const name = rng.pick(NAMES5); const ver = `${rng.int(1, 12)}.${rng.int(0, 40)}${rng.chance(0.6) ? `.${rng.int(0, 20)}` : ''}`;
    const rel = `${rng.int(1, 30)}.${rng.pick(['el8', 'el9', 'fc39', 'fc40', 'el8_9', 'el9_3'])}`; const arch = rng.pick(['x86_64', 'noarch']);
    const file = `${name}-${ver}-${rel}.${arch}.rpm`;
    const which = rng.pick(['nome', 'versão', 'release', 'arquitetura']);
    const ok = { nome: name, versão: ver, release: rel, arquitetura: arch }[which];
    const pool = {
      nome: [name.split('-')[0], `${name}-${ver}`, rel, arch, name.replace(/-.*/, '') + '-' + ver],
      versão: [name, rel, `${ver}-${rel}`, `${rel.split('.')[0]}`, ver.split('.')[0]],
      release: [ver, `${ver}-${rel}`, rel.split('.')[1], rel.split('.')[0], arch],
      arquitetura: ['rpm', arch === 'noarch' ? 'x86_64' : 'noarch', 'amd64', rel, 'el9'],
    }[which].filter((x) => x && x !== ok);
    const spec = [
      'd=$(mktemp -d); cd "$d"', 'mkdir -p rb/BUILD rb/RPMS rb/SOURCES rb/SPECS rb/SRPMS', 'cat > rb/SPECS/p.spec <<SPEC',
      `Name: ${name}`, `Version: ${ver}`, `Release: ${rel}`, 'Summary: teste', 'License: MIT', `BuildArch: ${arch}`, '%description', 'teste', '%files', 'SPEC',
      'rpmbuild --define "_topdir $d/rb" -bb rb/SPECS/p.spec >/dev/null 2>&1',
    ].join('\n');
    const fmt = rng.int(1, 3);
    if (fmt === 3) {
      const q = rng.pick([['o nome', '%{NAME}', name], ['a versão', '%{VERSION}', ver], ['o release', '%{RELEASE}', rel], ['a arquitetura', '%{ARCH}', arch]]);
      const cmd = (tag) => `rpm -qp --queryformat '${tag}\\n' ${file}`;
      return {
        type: 'unica', text: `Qual comando imprime apenas ${q[0]} do pacote contido em \`${file}\` (sem instalá-lo)?`,
        options: mcq(rng, cmd(q[1]), [`rpm -q --queryformat '${q[1]}\\n' ${file}`, `rpm -qp --format '${q[1]}\\n' ${file}`, `rpm -qi --queryformat '${q[1]}\\n' ${file}`, `rpm -qp --queryformat '${q[1]}\\n' ${name}`]),
        explanation: '`--queryformat` (`--qf`) aceita marcadores como `%{NAME}`, `%{VERSION}`, `%{RELEASE}` e `%{ARCH}`; o `p` de `-qp` indica que a consulta é sobre um arquivo `.rpm`. Sem o `p`, o rpm procuraria o nome no banco de pacotes instalados.',
        ref: ['101:p.137-141'],
        verify: { sh: `${spec}; rpm -qp --queryformat '${q[1]}\\n' rb/RPMS/*/*.rpm`, expect: q[2] },
      };
    }
    return {
      type: 'unica', text: `Um pacote RPM se chama \`${file}\`. Seguindo a convenção \`nome-versão-release.arquitetura.rpm\`, qual é ${which === 'nome' ? 'o nome' : which === 'versão' ? 'a versão' : which === 'release' ? 'o release' : 'a arquitetura'}?`,
      options: mcq(rng, ok, pool),
      explanation: `Leia o nome **da direita para a esquerda**: depois do último ponto vem a arquitetura (\`${arch}\`; \`noarch\` = independente de arquitetura), antes dela o release (\`${rel}\`, número de empacotamento + distribuição), antes do último hífen restante a versão do software (\`${ver}\`) e, no que sobrar, o nome — que pode conter hífens (\`${name}\`). O \`rpm -qp --qf '%{NAME} %{VERSION} %{RELEASE} %{ARCH}\\n' arquivo.rpm\` mostra os quatro campos.`,
      ref: ['101:p.137-141'],
      verify: { sh: `${spec}; rpm -qp --queryformat '%{NAME}|%{VERSION}|%{RELEASE}|%{ARCH}\\n' rb/RPMS/*/*.rpm; ls rb/RPMS/*/`, expect: `${name}|${ver}|${rel}|${arch}\n${file}` },
    };
  },
};

const REPOIDS = ['baseos', 'appstream', 'epel', 'extras', 'updates', 'remi-safe', 'custom'];
const rpmRepos = {
  id: 'rpm-repos', obj: '102.5', nivel: 2, peso: 2,
  make(rng) {
    const id = rng.pick(REPOIDS); const en = rng.chance(0.6) ? 1 : 0; const gc = rng.chance(0.75) ? 1 : 0;
    const fmt = rng.int(1, 5);
    const repo = `[${id}]\nname=Repositorio ${id} - $basearch\nbaseurl=https://mirror.example.com/${id}/$releasever/$basearch/os/\nenabled=${en}\ngpgcheck=${gc}${gc ? `\ngpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-${id}` : ''}`;
    const intro = `Arquivo \`/etc/yum.repos.d/${id}.repo\`:\n\n${block(repo)}\n\n`;
    if (fmt === 1) {
      return { type: 'unica', text: `${intro}O que acontece quando o administrador executa \`yum install nano\`?`, options: mcq(rng, en ? `O repositório ${id} é consultado normalmente (enabled=1)` : `O repositório ${id} é ignorado (enabled=0)`, [en ? `O repositório ${id} é ignorado (enabled=0)` : `O repositório ${id} é consultado normalmente (enabled=1)`, `O yum pede a senha do repositório ${id}`, `O arquivo ${id}.repo é apagado e recriado`, `O repositório ${id} é consultado apenas para dependências`]), explanation: `\`enabled=1\` ativa o repositório e \`enabled=0\` o desativa sem apagar o arquivo (\`yum repolist all\` ainda o lista). Para usar um repositório desabilitado uma única vez: \`yum --enablerepo=${id} install pacote\`.`, ref: ['101:p.144-146'], verify: { sh: `printf '%s\\n' ${sq(repo)} | awk -F= '$1=="enabled"{print $2}'`, expect: String(en) } };
    }
    if (fmt === 2) {
      return { type: 'unica', text: `${intro}Qual alteração ${en ? 'desativa' : 'ativa'} o repositório \`${id}\` sem apagar o arquivo?`, options: mcq(rng, en ? 'Trocar enabled=1 por enabled=0' : 'Trocar enabled=0 por enabled=1', ['Trocar gpgcheck=1 por gpgcheck=0', 'Trocar gpgcheck=0 por gpgcheck=1', 'Apagar a linha name=', 'Trocar baseurl por mirrorlist']), explanation: '`enabled` liga/desliga o repositório. `gpgcheck` controla a verificação das assinaturas dos pacotes, e não a ativação; a linha `name` é só descritiva. (Renomear o arquivo também o desativaria, mas isso não é um ajuste dentro do arquivo.)', ref: ['101:p.144-146'] };
    }
    if (fmt === 3) {
      return { type: 'unica', text: `${intro}O que significa \`gpgcheck=${gc}\`?`, options: mcq(rng, gc ? 'O yum verifica a assinatura GPG dos pacotes deste repositório usando a chave indicada em gpgkey' : 'O yum não verifica a assinatura GPG dos pacotes deste repositório (inseguro)', [gc ? 'O yum não verifica a assinatura GPG dos pacotes deste repositório (inseguro)' : 'O yum verifica a assinatura GPG dos pacotes deste repositório', 'O repositório fica restrito a usuários do grupo gpg', 'O yum baixa apenas pacotes com extensão .gpg', 'O yum compara o repositório com o arquivo /etc/yum.conf']), explanation: '`gpgcheck=1` obriga a conferir a assinatura dos pacotes (a chave pública vem de `gpgkey=` e pode ser importada com `rpm --import`). Com `0` nenhuma assinatura é verificada.', ref: ['101:p.144-146'] };
    }
    if (fmt === 4) {
      const rows = [
        ['Em qual diretório ficam os arquivos `.repo` usados por yum e dnf?', '/etc/yum.repos.d/', ['/etc/yum/repos/', '/var/lib/yum/repos.d/', '/etc/rpm/repos.d/', '/usr/lib/yum/repos/']],
        ['Qual arquivo contém a configuração global do yum (por exemplo, `gpgcheck` e `installonly_limit` padrão)?', '/etc/yum.conf', ['/etc/yum.repos.conf', '/etc/rpm/macros', '/etc/yum/yum.cfg', '/var/lib/rpm/yum.conf']],
        ['No openSUSE, onde o zypper guarda as definições de repositórios?', '/etc/zypp/repos.d/', ['/etc/yum.repos.d/', '/etc/zypper/sources.list', '/var/lib/zypp/lists/', '/etc/apt/sources.list.d/']],
      ];
      const r = rng.pick(rows);
      return { type: 'unica', text: r[0], options: mcq(rng, r[1], r[2]), explanation: 'yum e dnf leem `/etc/yum.conf` (ou `/etc/dnf/dnf.conf`) e os arquivos `*.repo` de `/etc/yum.repos.d/`; o zypper guarda um arquivo por repositório em `/etc/zypp/repos.d/`; o APT usa `/etc/apt/sources.list`.', ref: ['101:p.142-155'] };
    }
    const t = rng.pick([
      [`Como usar o repositório \`${id}\` (hoje desabilitado) **apenas nesta transação**, sem editar o arquivo?`, `yum --enablerepo=${id} install pacote`, [`yum --repo=${id} install pacote`, `yum install pacote --enable ${id}`, `yum-config-manager --disable ${id} install pacote`, `yum install pacote@${id}`]],
      [`Como instalar um pacote **ignorando** o repositório \`${id}\` apenas nesta transação?`, `yum --disablerepo=${id} install pacote`, [`yum --norepo=${id} install pacote`, `yum install pacote --skip ${id}`, `yum-config-manager --enable ${id} install pacote`, `yum --exclude-repo ${id} install pacote`]],
      [`No openSUSE, qual comando desabilita o repositório de alias \`${id}\` sem removê-lo?`, `zypper modifyrepo -d ${id}`, [`zypper removerepo ${id}`, `zypper modifyrepo -e ${id}`, `zypper repos -d ${id}`, `zypper disable ${id}`]],
    ]);
    return { type: 'unica', text: t[0], options: mcq(rng, t[1], t[2]), explanation: '`--enablerepo=ID` e `--disablerepo=ID` valem para uma única execução do yum/dnf. Alterações permanentes: `enabled=0/1` no .repo ou `yum-config-manager --enable/--disable`. No zypper: `modifyrepo -e` (habilita), `-d` (desabilita), `removerepo` (apaga).', ref: ['101:p.144-153'] };
  },
};

const rpmConcepts = tableGen({
  id: 'rpm-concepts', obj: '102.5', nivel: 2, peso: 2, ref: ['101:p.136-155'],
  rows: [
    { q: 'Qual a principal diferença entre usar `rpm -i` e `yum install` (ou `dnf install`)?', ok: 'O yum/dnf resolve e baixa dependências dos repositórios; o rpm -i instala apenas o arquivo informado e falha se faltarem dependências', bad: ['O rpm -i baixa pacotes da internet; o yum só instala arquivos locais', 'O yum funciona só com pacotes .deb', 'O rpm -i resolve dependências, mas não consegue instalar atualizações', 'Não há diferença: yum install é apenas outro nome de rpm -i'], why: 'O `rpm` é a ferramenta de baixo nível (um pacote por vez, sem repositórios). yum, dnf e zypper são camadas de alto nível sobre o RPM, com repositórios e resolução de dependências.' },
    { q: 'Qual ferramenta de gerenciamento de pacotes é a nativa do SUSE/openSUSE?', ok: 'zypper', bad: ['yum', 'dnf', 'apt-get', 'pacman'], why: 'openSUSE/SUSE usam pacotes RPM com o `zypper`; Red Hat, CentOS, Fedora e derivados usam `yum`/`dnf`; Debian/Ubuntu usam `dpkg`/`apt`.' },
    { q: 'Qual ferramenta substituiu o yum nas versões mais novas do Fedora e do RHEL (a partir do RHEL 8), mantendo sintaxe de comandos muito parecida?', ok: 'dnf (Dandified YUM)', bad: ['zypper', 'apt', 'rpm2cpio', 'pkcon'], why: 'O dnf é a evolução do yum e, nessas versões, o comando `yum` costuma ser apenas um atalho para o dnf. Em ambos, a configuração dos repositórios fica em `/etc/yum.repos.d/`.' },
    { q: 'Qual opção do rpm instala o pacote **ou** atualiza uma versão anterior, e qual só atualiza o que já existe?', ok: '-U instala ou atualiza; -F só atualiza pacotes já instalados', bad: ['-F instala ou atualiza; -U só atualiza pacotes já instalados', '-i atualiza e -U apenas instala', '-U remove a versão antiga e -F mantém ambas', '-F e -U são idênticos'], why: '`-U` (upgrade) instala se não houver versão anterior; `-F` (freshen) ignora pacotes que ainda não estão instalados.' },
    { q: 'O que o comando `rpm -e pacote` faz quando outro pacote instalado depende dele?', ok: 'Recusa a remoção e exibe "Failed dependencies", listando quem depende do pacote', bad: ['Remove o pacote e todos os que dependem dele automaticamente', 'Remove o pacote e reinstala as dependências do repositório', 'Remove o pacote, mas deixa o banco de dados do RPM inconsistente', 'Move o pacote para o estado rc, como no dpkg'], why: 'O rpm não resolve dependências: é preciso remover primeiro os dependentes (ou usar yum/dnf/zypper, que os incluem na transação).' },
    { q: 'Qual comando consulta um arquivo `.rpm` (ainda não instalado) para listar o que ele instalaria?', ok: 'rpm -qlp arquivo.rpm', bad: ['rpm -ql arquivo.rpm', 'rpm -Vp arquivo.rpm', 'rpm -qa arquivo.rpm', 'rpm -qf arquivo.rpm'], why: 'O `p` (package file) faz a consulta valer para o arquivo. Sem ele, `rpm -ql` espera o nome de um pacote **instalado**.' },
    { q: 'Qual é o comando equivalente a `dnf provides /usr/bin/dig` para descobrir qual pacote fornece um arquivo no yum?', ok: 'yum whatprovides /usr/bin/dig', bad: ['yum owner /usr/bin/dig', 'yum search --file /usr/bin/dig', 'yum info /usr/bin/dig', 'yum list /usr/bin/dig --owner'], why: 'No yum o subcomando é `whatprovides` (ou `provides`); no dnf, `provides`; no zypper, `search --provides`; no rpm, `-qf` (só para instalados).' },
    { q: 'No zypper, qual é a forma abreviada de `zypper install` e de `zypper remove`?', ok: 'zypper in e zypper rm', bad: ['zypper ins e zypper del', 'zypper add e zypper rem', 'zypper i e zypper r', 'zypper get e zypper put'], why: 'O zypper aceita abreviações: `in` (install), `rm` (remove), `se` (search), `up` (update), `ref` (refresh), `lr` (repos), `ar` (addrepo), `mr` (modifyrepo).' },
    { q: 'Qual comando do dnf lista os arquivos de um pacote que ainda não está instalado?', ok: 'dnf repoquery -l pacote', bad: ['dnf list --files pacote', 'dnf provides -l pacote', 'dnf info -l pacote', 'dnf files pacote'], why: '`dnf repoquery -l PACOTE` consulta o repositório e lista os arquivos do pacote.' },
    { q: 'Qual é a função do `rpm2cpio`?', ok: 'Converter um arquivo .rpm em um fluxo cpio, para extrair seus arquivos sem instalá-lo', bad: ['Converter um pacote .deb em .rpm', 'Instalar um pacote RPM sem registrar no banco de dados', 'Verificar a assinatura GPG de um pacote', 'Listar as dependências do pacote em formato cpio'], why: '`rpm2cpio pacote.rpm | cpio -idmv` extrai o conteúdo no diretório atual. Para converter .deb ↔ .rpm usa-se o alien.' },
    { q: 'O que o comando `yum clean all` faz?', ok: 'Remove os caches de metadados e pacotes baixados pelo yum, forçando nova consulta aos repositórios', bad: ['Remove todos os pacotes que não são mais necessários', 'Apaga os arquivos .repo de /etc/yum.repos.d/', 'Desinstala o yum e as suas dependências', 'Remove as chaves GPG importadas'], why: 'Os caches ficam em /var/cache/yum (ou /var/cache/dnf). Limpar o cache resolve problemas com metadados antigos; os repositórios e pacotes instalados não são afetados.' },
    { q: 'Qual comando lista as chaves GPG importadas no banco de dados do RPM?', ok: 'rpm -qa gpg-pubkey*', bad: ['rpm -K --list-keys', 'rpm --keys', 'gpg --list-keys --rpm', 'rpm -qi --gpg'], why: 'As chaves importadas com `rpm --import` aparecem como pacotes virtuais `gpg-pubkey-...`.' },
  ],
});

export const rpmGens = [rpmTask, rpmVerify, rpmNvra, rpmRepos, rpmConcepts];

export const generators = [...debGens, ...rpmGens];
