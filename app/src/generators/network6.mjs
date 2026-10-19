// 110.3 — Proteção de dados com criptografia: túneis SSH, ssh-keygen, arquivos/permissões do SSH e GnuPG.
import { mcq, code as c } from './util.mjs';
import { shq } from './network.mjs';

const USERS = ['ana', 'bruno', 'carla', 'diego', 'elisa', 'ina', 'carol'];
const HOSTS = ['halof', 'srv01', 'debian', 'bastion.example.com', 'gw.empresa.local', '192.168.1.77'];
const TARGETS = ['www.gnu.org', 'db.interno', 'intranet.example.com', 'localhost', '10.0.0.5', 'www.melpa.org'];

// ---------- túneis e opções do ssh (verificados com `ssh -G`, que imprime a configuração efetiva sem conectar) ----------
function sshTasks(r) {
  const u = r.pick(USERS); const h = r.pick(HOSTS); const uh = `${u}@${h}`; const lp = r.int(1025, 9999); let rp = r.int(1025, 9999); if (rp === lp) rp += 1;
  const hp = r.pick([22, 80, 443, 3306, 5432, 8080]); const th = r.pick(TARGETS); const port = r.pick([2222, 2200, 2022, 22022]); const j = r.pick(['bastion.example.com', 'jump@gw.empresa.local', 'jumpbox'].filter((x) => x.split('@').pop() !== h));
  return [
    { id: 'L', keys: ['localforward'], args: `-L ${lp}:${th}:${hp} ${uh}`, exp: [`localforward ${lp} [${th}]:${hp}`], desc: `Abrir a porta **local** ${lp} que encaminha, por meio do servidor SSH ${c(h)}, o tráfego para ${c(`${th}:${hp}`)} (túnel de porta local)`, wrong: [`-R ${lp}:${th}:${hp} ${uh}`, `-L ${th}:${hp}:${lp} ${uh}`, `-D ${lp} ${uh}`, `-L ${hp}:${th}:${lp} ${uh}`], n: '-L [porta_local]:[host_destino]:[porta_destino]: a porta é aberta na máquina cliente e o host de destino é resolvido a partir do servidor SSH.' },
    { id: 'R', keys: ['remoteforward'], args: `-R ${rp}:localhost:${lp} ${uh}`, exp: [`remoteforward ${rp} [localhost]:${lp}`], desc: `Fazer o servidor ${c(h)} escutar na porta ${rp} e encaminhar as conexões recebidas, pelo túnel, para a porta ${lp} da **máquina local** (túnel remoto/reverso)`, wrong: [`-L ${rp}:localhost:${lp} ${uh}`, `-R ${lp}:localhost:${rp} ${uh}`, `-D ${rp} ${uh}`, `-R localhost:${rp}:${lp} ${uh}`], n: '-R [porta_no_servidor]:[host_destino]:[porta_destino]: a porta é aberta no servidor SSH e o destino é resolvido a partir do cliente.' },
    { id: 'D', keys: ['dynamicforward'], args: `-D ${lp} ${uh}`, exp: [`dynamicforward ${lp}`], desc: `Criar um proxy SOCKS (encaminhamento dinâmico) na porta local ${lp}, usando o servidor ${c(h)}`, wrong: [`-S ${lp} ${uh}`, `-L ${lp} ${uh}`, `-W ${lp} ${uh}`, `-R ${lp} ${uh}`], n: '-D porta abre um proxy SOCKS local; o tráfego dos aplicativos que o usam sai pelo servidor SSH.' },
    { id: 'X', keys: ['forwardx11'], args: `-X ${uh}`, exp: ['forwardx11 yes'], desc: `Conectar-se a ${c(uh)} com encaminhamento do X11, para exibir localmente aplicativos gráficos que rodam no servidor`, wrong: [`-x ${uh}`, `-A ${uh}`, `-N ${uh}`, `-C ${uh}`], n: '-X habilita o encaminhamento de X11 (diretiva X11Forwarding no servidor); -x o desabilita; -A encaminha o agente de autenticação.' },
    { id: 'NF', keys: ['localforward', 'sessiontype', 'forkafterauthentication'], args: `-L ${lp}:${th}:${hp} -Nf ${uh}`, exp: [`localforward ${lp} [${th}]:${hp}`, 'sessiontype none', 'forkafterauthentication yes'], desc: `Criar o túnel local ${lp} → ${c(`${th}:${hp}`)} por meio de ${c(uh)} **sem abrir um shell remoto** e deixando o ssh **em segundo plano**`, wrong: [`-L ${lp}:${th}:${hp} -N ${uh}`, `-L ${lp}:${th}:${hp} -f ${uh}`, `-L ${lp}:${th}:${hp} -nN ${uh}`, `-L ${lp}:${th}:${hp} -q ${uh}`], n: '-N não executa comando remoto (só encaminha portas) e -f manda o ssh para segundo plano depois da autenticação; só -N deixaria o processo em primeiro plano.' },
    { id: 'P', keys: ['port'], args: `-p ${port} ${uh}`, exp: [`port ${port}`], desc: `Conectar-se a ${c(uh)} cujo servidor SSH escuta na porta ${port}`, wrong: [`-P ${port} ${uh}`, `-l ${port} ${h}`, `${uh}:${port}`, `-L ${port} ${uh}`], n: 'No ssh a porta do servidor é -p (minúsculo); -P é a opção equivalente do scp/sftp.' },
    { id: 'J', keys: ['proxyjump'], args: `-J ${j} ${uh}`, exp: [`proxyjump ${j}`], desc: `Acessar ${c(uh)} passando antes (como host de salto) por ${c(j)}`, wrong: [`-W ${j} ${uh}`, `-J ${uh} ${j}`, `-L ${j} ${uh}`, `-R ${j} ${uh}`], n: '-J [usuario@]host_de_salto conecta através de um host intermediário (ProxyJump).' },
  ];
}

// ---------- ssh-keygen ----------
function keygenTasks(r) {
  const t = r.pick([['rsa', 'RSA', [2048, 3072]], ['ecdsa', 'ECDSA', [256, 384, 521]], ['ecdsa', 'ECDSA', [256, 384, 521]], ['ed25519', 'ED25519', [256]], ['ed25519', 'ED25519', [256]]]); const bits = r.pick(t[2]);
  const nm = r.pick(['id_lab', 'deploy_key', 'backup_key', 'id_servidor', 'minha_chave']); const h = r.pick(['halof', 'srv01.example.com', '192.168.1.77']);
  const gen = t[0] === 'ed25519' ? `ssh-keygen -t ed25519 -f ~/.ssh/${nm}` : `ssh-keygen -t ${t[0]} -b ${bits} -f ~/.ssh/${nm}`;
  const mk = `ssh-keygen -q -t ${t[0]} ${t[0] === 'ed25519' ? '' : `-b ${bits} `}-N '' -f k`;
  const mkE = "ssh-keygen -q -t ed25519 -N '' -f k"; // as demais tarefas não dependem do tipo: usa-se ed25519 (rápido)
  const kh = `echo ${h} $(cut -d' ' -f1,2 k.pub) > kh`;
  return [
    { id: 'gen', desc: `Gerar um par de chaves ${t[1]}${t[0] === 'ed25519' ? '' : ` de ${bits} bits`} no arquivo ${c(`~/.ssh/${nm}`)}`, cmd: gen, wrong: [t[0] === 'ed25519' ? `ssh-keygen -t ed25519 -b 521 -f ~/.ssh/${nm}.pub` : `ssh-keygen -b ${t[0]} -t ${bits} -f ~/.ssh/${nm}`, `ssh-keygen -t ${t[0]} -F ~/.ssh/${nm}`, `ssh-keygen -l ${t[0]} -f ~/.ssh/${nm}`, `ssh-keygen -y -t ${t[0]} -f ~/.ssh/${nm}`], n: '-t escolhe o algoritmo (rsa, dsa, ecdsa, ed25519), -b o tamanho em bits (o ed25519 tem tamanho fixo de 256) e -f o arquivo; a chave pública ganha o sufixo .pub.', sh: `cd "$(mktemp -d)" && ${mk} && ssh-keygen -l -f k.pub | awk '{print $1, $NF}'`, expect: `${bits} (${t[1]})` },
    { id: 'fp', desc: `Exibir o tamanho e a impressão digital (fingerprint) da chave pública ${c(`~/.ssh/${nm}.pub`)}`, cmd: `ssh-keygen -l -f ~/.ssh/${nm}.pub`, wrong: [`ssh-keygen -y -f ~/.ssh/${nm}.pub`, `ssh-keygen -F ~/.ssh/${nm}.pub`, `ssh-keygen -R ~/.ssh/${nm}.pub`, `ssh-keygen -p -f ~/.ssh/${nm}.pub`], n: '-l mostra o fingerprint (com -v, também a randomart); -f indica o arquivo da chave.', sh: `cd "$(mktemp -d)" && ${mkE} && ssh-keygen -l -f k.pub | awk '{print $1, $NF}'`, expect: '256 (ED25519)' },
    { id: 'y', desc: `Recriar a chave **pública** a partir da chave privada ${c(`~/.ssh/${nm}`)} (imprimindo-a na tela)`, cmd: `ssh-keygen -y -f ~/.ssh/${nm}`, wrong: [`ssh-keygen -l -f ~/.ssh/${nm}`, `ssh-keygen -p -f ~/.ssh/${nm}`, `ssh-keygen -R ~/.ssh/${nm}`, `ssh-keygen -e -f ~/.ssh/${nm}.pub`], n: '-y lê a chave privada e imprime a chave pública correspondente (formato de authorized_keys).', sh: `cd "$(mktemp -d)" && ${mkE} && ssh-keygen -y -f k | cut -d' ' -f1`, expect: 'ssh-ed25519' },
    { id: 'R', desc: `Remover do arquivo ~/.ssh/known_hosts todas as chaves do host ${c(h)} (por exemplo, depois de o servidor ter sido reinstalado)`, cmd: `ssh-keygen -R ${h}`, wrong: [`ssh-keygen -F ${h}`, `ssh-keygen -r ${h}`, `ssh-keygen -D ${h}`, `ssh-keygen -p ${h}`], n: '-R host apaga as entradas do host em known_hosts (e guarda uma cópia em known_hosts.old); -F host apenas procura a entrada.', sh: `cd "$(mktemp -d)" && ${mkE} && ${kh} && ssh-keygen -R ${h} -f kh >/dev/null 2>&1; grep -c '^${h} ' kh`, expect: '0' },
    { id: 'p', desc: `Alterar a frase secreta (passphrase) da chave privada ${c(`~/.ssh/${nm}`)}`, cmd: `ssh-keygen -p -f ~/.ssh/${nm}`, wrong: [`ssh-keygen -P -f ~/.ssh/${nm}`, `ssh-keygen -y -f ~/.ssh/${nm}`, `ssh-keygen -c -f ~/.ssh/${nm}.pub`, `ssh-keygen -N -f ~/.ssh/${nm}`], n: '-p altera a passphrase de uma chave privada existente (-P informa a antiga e -N a nova, em modo não interativo).', sh: `cd "$(mktemp -d)" && ${mkE} && ssh-keygen -p -f k -P '' -N novasenha >/dev/null 2>&1 && ssh-keygen -y -P novasenha -f k | cut -d' ' -f1`, expect: 'ssh-ed25519' },
  ];
}

// ---------- GnuPG: nome do arquivo gerado (verificado com gpg real, chave ed25519 temporária) ----------
const GPG_SETUP = `export GNUPGHOME=/tmp/gh-lab; G="gpg --batch --yes --pinentry-mode loopback --passphrase ''"; if [ ! -d "$GNUPGHOME/private-keys-v1.d" ]; then mkdir -p -m700 "$GNUPGHOME"; $G --quick-gen-key lab ed25519 cert never >/dev/null 2>&1; fpr=$(gpg --with-colons --list-keys lab 2>/dev/null | awk -F: '/^fpr/{print $10; exit}'); $G --quick-add-key $fpr cv25519 encr never >/dev/null 2>&1; $G --quick-add-key $fpr ed25519 sign never >/dev/null 2>&1; fi; cd "$(mktemp -d)"; echo oi > ARQ`;
function gpgFiles(f) {
  return [
    { o: `gpg --encrypt --recipient ana ${f}`, v: `$G --trust-model always -e -r lab ARQ`, ext: '.gpg', why: 'A saída criptografada é binária e recebe o sufixo .gpg.' },
    { o: `gpg -e -r ana ${f}`, v: `$G --trust-model always -e -r lab ARQ`, ext: '.gpg', why: '-e é --encrypt e -r é --recipient; a saída binária recebe o sufixo .gpg.' },
    { o: `gpg --armor --encrypt --recipient ana ${f}`, v: `$G --trust-model always -a -e -r lab ARQ`, ext: '.asc', why: '--armor (-a) gera saída ASCII blindada, que recebe o sufixo .asc.' },
    { o: `gpg --clearsign ${f}`, v: `$G --clearsign ARQ`, ext: '.asc', why: '--clearsign assina mantendo o texto legível dentro de um bloco ASCII (-----BEGIN PGP SIGNED MESSAGE-----) e grava em .asc.' },
    { o: `gpg --detach-sign ${f}`, v: `$G --detach-sign ARQ`, ext: '.sig', why: '--detach-sign (-b) grava a assinatura separada, em binário, num arquivo .sig; o original não é alterado.' },
    { o: `gpg --armor --detach-sign ${f}`, v: `$G -a --detach-sign ARQ`, ext: '.asc', why: 'Com --armor, a assinatura separada vira texto ASCII e recebe o sufixo .asc.' },
    { o: `gpg --sign ${f}`, v: `$G --sign ARQ`, ext: '.gpg', why: '--sign (-s) comprime e assina o documento; a saída é binária (.gpg) e contém os dados originais.' },
    { o: `gpg --symmetric ${f}`, v: `$G --passphrase pw -c ARQ`, ext: '.gpg', why: '--symmetric (-c) criptografa com uma senha (sem chaves públicas); a saída binária recebe o sufixo .gpg.' },
  ];
}
const GPGCMDS = (r) => {
  const u = r.pick(USERS); const f = r.pick(['relatorio.txt', 'dados.csv', 'contrato.pdf', 'notas.md']);
  return [
    { d: `Criptografar ${c(f)} para o destinatário ${c(u)}, gravando o resultado em ASCII blindado no arquivo ${c(`${f}.asc`)}`, ok: `gpg --output ${f}.asc --recipient ${u} --armor --encrypt ${f}`, w: [`gpg --output ${f}.asc --recipient ${u} --encrypt ${f}`, `gpg --output ${f}.asc --sign --armor ${f}`, `gpg --output ${f}.asc --armor --decrypt ${f}`, `gpg --output ${f}.asc --symmetric --recipient ${u} ${f}`], n: '--encrypt usa a chave pública do destinatário (--recipient); --armor gera texto ASCII; --output escolhe o arquivo de saída.' },
    { d: `Descriptografar ${c(`${f}.gpg`)} e gravar o conteúdo em ${c(f)}`, ok: `gpg --output ${f} --decrypt ${f}.gpg`, w: [`gpg --output ${f} --encrypt ${f}.gpg`, `gpg --decrypt ${f} --output ${f}.gpg`, `gpg --output ${f} --verify ${f}.gpg`, `gpg --import ${f}.gpg`], n: '--decrypt (-d) usa a chave privada do destinatário; --output (-o) grava o texto claro no arquivo.' },
    { d: `Verificar a assinatura do arquivo ${c(`${f}.sig`)} (assinatura separada) para o arquivo ${c(f)}`, ok: `gpg --verify ${f}.sig ${f}`, w: [`gpg --decrypt ${f}.sig ${f}`, `gpg --verify ${f} ${f}.sig`, `gpg --check-sig ${f}`, `gpg --import ${f}.sig`], n: '--verify arquivo_de_assinatura [arquivo_original].' },
    { d: `Exportar a chave pública de ${c(u)} em formato ASCII para o arquivo ${c(`${u}.pub.asc`)}`, ok: `gpg --export --armor ${u} > ${u}.pub.asc`, w: [`gpg --export-secret-keys --armor ${u} > ${u}.pub.asc`, `gpg --import --armor ${u} > ${u}.pub.asc`, `gpg --list-keys --armor ${u} > ${u}.pub.asc`, `gpg --send-keys ${u} > ${u}.pub.asc`], n: '--export grava a chave pública (binária; com --armor, em ASCII). --export-secret-keys exporta a chave privada, o que não se deve distribuir.' },
    { d: `Importar a chave pública do arquivo ${c(`${u}.pub.asc`)} para o seu chaveiro`, ok: `gpg --import ${u}.pub.asc`, w: [`gpg --export ${u}.pub.asc`, `gpg --recv-keys ${u}.pub.asc`, `gpg --list-keys ${u}.pub.asc`, `gpg --edit-key ${u}.pub.asc`], n: '--import adiciona chaves de um arquivo ao chaveiro (também serve para importar um certificado de revogação).' },
    { d: `Gerar um certificado de revogação da chave de ${c(u)}, gravando-o em ${c('revoga.asc')}`, ok: `gpg --output revoga.asc --gen-revoke ${u}`, w: [`gpg --output revoga.asc --revoke ${u}`, `gpg --gen-revoke ${u} --import revoga.asc`, `gpg --output revoga.asc --delete-key ${u}`, `gpg --output revoga.asc --export-revoke ${u}`], n: '--gen-revoke cria o certificado; para revogar de fato é preciso importá-lo (gpg --import revoga.asc) e depois divulgar a chave revogada.' },
    { d: `Listar as chaves **públicas** do chaveiro`, ok: 'gpg --list-keys', w: ['gpg --list-secret-keys', 'gpg --export', 'gpg --fingerprint --secret', 'gpg --keyring'], n: '--list-keys (-k) lista as chaves públicas; --list-secret-keys (-K) lista as privadas.' },
    { d: `Exibir a impressão digital (fingerprint) da chave de ${c(u)}`, ok: `gpg --fingerprint ${u}`, w: [`gpg --finger ${u}`, `gpg --list-secret-keys ${u}`, `gpg --edit-key ${u} fingerprint-only`, `gpg --export-ownertrust ${u}`], n: '--fingerprint USER-ID mostra a impressão digital; o KEY-ID corresponde aos últimos 8 dígitos hexadecimais dela.' },
    { d: `Remover a chave pública de ${c(u)} do chaveiro`, ok: `gpg --delete-key ${u}`, w: [`gpg --remove-key ${u}`, `gpg --delete-secret-keys ${u}`, `gpg --revoke ${u}`, `gpg --export --delete ${u}`], n: '--delete-key apaga a chave pública (a privada é apagada com --delete-secret-keys).' },
  ];
};

export const generators = [
  {
    id: 'ssh-tunnel-cmd', obj: '110.3', nivel: 2, peso: 3,
    make(rng) {
      const T = sshTasks(rng); const t = rng.pick(T);
      const verify = { sh: `ssh -G ${t.args} 2>/dev/null | grep -E '^(${t.keys.join('|')}) ' | sort`, expect: t.exp.slice().sort().join('\n') };
      if (rng.chance(0.4)) {
        const others = T.filter((x) => x.id !== t.id && !(t.id === 'L' && x.id === 'NF') && !(t.id === 'NF' && x.id === 'L'));
        return { type: 'unica', text: `O que faz o comando abaixo?\n\n\`\`\`\nssh ${t.args}\n\`\`\``, options: mcq(rng, t.desc.replace(/\*\*/g, ''), others.map((x) => x.desc.replace(/\*\*/g, ''))), explanation: `${c(`ssh ${t.args}`)}. ${t.n}`, ref: ['102:p.563-567'], verify };
      }
      return { type: 'unica', text: `Qual comando realiza a tarefa abaixo?\n\n${t.desc}.`, options: mcq(rng, c(`ssh ${t.args}`), t.wrong.map((w) => c(`ssh ${w}`))), explanation: `${c(`ssh ${t.args}`)}. ${t.n} Resumo: -L (local) abre a porta no cliente; -R (remoto) abre a porta no servidor; -D abre um proxy SOCKS; -X encaminha o X11; -N não executa comando; -f vai para segundo plano; -p porta; -J host de salto.`, ref: ['102:p.563-567'], verify };
    },
  },
  {
    id: 'ssh-tunnel-semantics', obj: '110.3', nivel: 3, peso: 2,
    make(rng) {
      const u = rng.pick(USERS); const h = rng.pick(['halof', 'srv01', 'bastion']); const lp = rng.int(1025, 9999); const hp = rng.pick([22, 80, 443, 3306]); const th = rng.pick(['www.gnu.org', 'db.interno', 'localhost']);
      const kind = rng.pick(['L', 'R']);
      const cmd = kind === 'L' ? `ssh -L ${lp}:${th}:${hp} -Nf ${u}@${h}` : `ssh -R ${lp}:${th}:${hp} -Nf ${u}@${h}`;
      const ok = kind === 'L'
        ? `A porta ${lp} passa a escutar na máquina local (cliente); o tráfego vai pelo túnel até ${h}, que se conecta a ${th}:${hp}`
        : `A porta ${lp} passa a escutar no servidor ${h}; o tráfego vai pelo túnel de volta até a máquina local, que se conecta a ${th}:${hp}`;
      const wrong = [
        kind === 'L' ? `A porta ${lp} passa a escutar no servidor ${h}; o tráfego volta pelo túnel até a máquina local, que se conecta a ${th}:${hp}` : `A porta ${lp} passa a escutar na máquina local (cliente); o tráfego vai pelo túnel até ${h}, que se conecta a ${th}:${hp}`,
        `Abre um proxy SOCKS na porta ${lp} da máquina local, e ${th}:${hp} é ignorado`,
        `Abre um shell em ${h} e redireciona a saída padrão para ${th}:${hp}`,
        `A porta ${lp} é aberta em ${th} e encaminhada para a porta ${hp} da máquina local`,
      ];
      return {
        type: 'unica', text: `Após executar o comando abaixo, o que acontece?\n\n\`\`\`\n${cmd}\n\`\`\``, options: mcq(rng, ok, wrong),
        explanation: `${kind === 'L' ? '-L (túnel local): a porta de escuta fica no cliente e o destino é alcançado a partir do servidor SSH. Por isso, em "localhost" o nome é visto da perspectiva do servidor.' : '-R (túnel remoto/reverso): a porta de escuta fica no servidor SSH e o destino é alcançado a partir do cliente.'} -N evita abrir shell e -f põe o ssh em segundo plano. Diretivas relacionadas: AllowTcpForwarding e GatewayPorts (sshd_config).`,
        ref: ['102:p.563-566'],
        verify: { sh: `ssh -G ${cmd.slice(4)} 2>/dev/null | grep -E '^(${kind === 'L' ? 'localforward' : 'remoteforward'}) '`, expect: `${kind === 'L' ? 'localforward' : 'remoteforward'} ${lp} [${th}]:${hp}` },
      };
    },
  },
  {
    id: 'ssh-keygen-cmd', obj: '110.3', nivel: 2, peso: 3,
    make(rng) {
      const T = keygenTasks(rng); const t = rng.pick(T);
      const verify = { sh: t.sh, expect: t.expect };
      if (rng.chance(0.35)) {
        const others = T.filter((x) => x.id !== t.id);
        return { type: 'unica', text: `O que faz o comando abaixo?\n\n\`\`\`\n${t.cmd}\n\`\`\``, options: mcq(rng, t.desc.replace(/\*\*/g, ''), others.map((x) => x.desc.replace(/\*\*/g, ''))), explanation: `${c(t.cmd)}. ${t.n}`, ref: ['102:p.558-562'], verify };
      }
      return { type: 'unica', text: `Qual comando realiza a tarefa abaixo?\n\n${t.desc}.`, options: mcq(rng, c(t.cmd), t.wrong.map((w) => c(w))), explanation: `${c(t.cmd)}. ${t.n} Outras opções úteis: -l (fingerprint), -y (chave pública a partir da privada), -p (trocar passphrase), -R (remover host de known_hosts), -F (procurar host). Sem -t, o ssh-keygen gera chave RSA.`, ref: ['102:p.558-562'], verify };
    },
  },
  {
    id: 'ssh-files-perms', obj: '110.3', nivel: 1, peso: 2,
    make(rng) {
      const kind = rng.pick(['perm', 'perm', 'role', 'role']);
      if (kind === 'perm') {
        const I = [
          { q: 'a chave **privada** `~/.ssh/id_ed25519`', a: '600', w: ['644', '640', '664', '666'], n: 'A chave privada deve ser legível e gravável só pelo dono (0600, -rw-------); o ssh recusa chaves privadas acessíveis por outros ("UNPROTECTED PRIVATE KEY FILE").', v: { sh: `cd "$(mktemp -d)" && ssh-keygen -q -t ed25519 -N '' -f k && stat -c %a k`, expect: '600' } },
          { q: 'a chave **pública** `~/.ssh/id_ed25519.pub` (padrão criado pelo ssh-keygen)', a: '644', w: ['600', '640', '660', '777'], n: 'O ssh-keygen cria a chave pública com 0644 (-rw-r--r--); ela não é secreta.', v: { sh: `cd "$(mktemp -d)" && ssh-keygen -q -t ed25519 -N '' -f k && stat -c %a k.pub`, expect: '644' } },
          { q: 'as chaves privadas de host do servidor, como `/etc/ssh/ssh_host_rsa_key`', a: '600', w: ['644', '640', '664', '666'], n: 'As chaves privadas de host pertencem ao root com 0600; as chaves públicas (.pub) são 0644.' },
          { q: 'as chaves públicas de host do servidor, como `/etc/ssh/ssh_host_rsa_key.pub`', a: '644', w: ['600', '700', '640', '777'], n: 'As chaves públicas de host são legíveis por todos (0644, -rw-r--r--).' },
          { q: 'o diretório `~/.ssh`', a: '700', w: ['755', '644', '777', '666'], n: 'O diretório ~/.ssh deve ser acessível só ao dono (0700, drwx------).' },
        ];
        const it = rng.pick(I);
        return { type: 'unica', text: `Qual é a permissão (octal) correta para ${it.q}?`, options: mcq(rng, it.a, it.w), explanation: `${it.n} Resumo: ~/.ssh 700; chave privada 600; chave pública 644.`, ref: ['102:p.562', '102:p.559'], ...(it.v ? { verify: it.v } : {}) };
      }
      const R = [
        { f: '~/.ssh/authorized_keys', d: 'Lista as chaves públicas autorizadas a fazer login na conta (no servidor)' },
        { f: '~/.ssh/known_hosts', d: 'Guarda as chaves públicas dos servidores já conhecidos pelo cliente (autenticação do servidor)' },
        { f: '~/.ssh/id_ed25519', d: 'Chave privada do usuário (algoritmo Ed25519), que nunca deve ser compartilhada' },
        { f: '~/.ssh/id_ed25519.pub', d: 'Chave pública do usuário, que se copia para o authorized_keys dos servidores' },
        { f: '/etc/ssh/ssh_host_ed25519_key', d: 'Chave privada de host do servidor, usada para ele se identificar aos clientes' },
        { f: '/etc/ssh/sshd_config', d: 'Configuração do servidor OpenSSH (por exemplo, PermitRootLogin, AllowUsers, X11Forwarding)' },
        { f: '/etc/ssh/ssh_config', d: 'Configuração global do cliente OpenSSH' },
      ];
      const it = rng.pick(R);
      return { type: 'unica', text: `Qual é a função de ${c(it.f)}?`, options: mcq(rng, it.d, R.filter((x) => x !== it).map((x) => x.d)), explanation: `${it.f}: ${it.d}. Resumo: authorized_keys (servidor, quem pode entrar) × known_hosts (cliente, servidores conhecidos); id_* (privada) × id_*.pub (pública); ssh_config (cliente) × sshd_config (servidor); ssh_host_*_key (chaves de host do servidor).`, ref: ['102:p.556-562'] };
    },
  },
  {
    id: 'gpg-output-file', obj: '110.3', nivel: 3, peso: 3,
    make(rng) {
      const f = rng.pick(['relatorio.txt', 'dados.csv', 'contrato.txt', 'notas.md']); const t = rng.pick(gpgFiles(f));
      const exts = ['.gpg', '.asc', '.sig', '.pgp', '.enc', '.sign'];
      const verify = { sh: `${GPG_SETUP}; ${t.v} >/dev/null 2>&1; ls | grep -v "^ARQ$"`, expect: `ARQ${t.ext}` };
      return {
        type: 'unica', text: `Um usuário que já tem as chaves necessárias executa o comando abaixo no diretório onde está ${c(f)}. Qual arquivo novo passa a existir?\n\n\`\`\`\n${t.o}\n\`\`\``,
        options: mcq(rng, c(`${f}${t.ext}`), exts.filter((e) => e !== t.ext).map((e) => c(`${f}${e}`))),
        explanation: `${t.why} Regra geral do gpg: o arquivo de saída é o nome original mais o sufixo — .gpg (binário), .asc (ASCII blindado, inclusive --clearsign) ou .sig (assinatura separada em binário).`,
        ref: ['102:p.581-585'], verify,
      };
    },
  },
  {
    id: 'gpg-cmd', obj: '110.3', nivel: 2, peso: 3,
    make(rng) {
      const G = GPGCMDS(rng); const g = rng.pick(G);
      if (rng.chance(0.2)) {
        const S = [['--armor', '-a'], ['--output', '-o'], ['--recipient', '-r'], ['--decrypt', '-d'], ['--encrypt', '-e'], ['--sign', '-s']]; const [lg, sh] = rng.pick(S);
        return { type: 'unica', text: `Qual é a forma curta da opção ${c(`gpg ${lg}`)}?`, options: mcq(rng, c(sh), S.filter((x) => x[1] !== sh).map((x) => c(x[1]))), explanation: `Formas curtas: --armor = -a, --output = -o, --recipient = -r, --decrypt = -d, --encrypt = -e, --sign = -s.`, ref: ['102:p.582-584'] };
      }
      return { type: 'unica', text: `Qual comando realiza a tarefa abaixo?\n\n${g.d}.`, options: mcq(rng, c(g.ok), g.w.map((x) => c(x))), explanation: `${c(g.ok)}. ${g.n} Opções curtas: -a (--armor), -o (--output), -r (--recipient), -e, -d, -s.`, ref: ['102:p.576-585'] };
    },
  },
];
