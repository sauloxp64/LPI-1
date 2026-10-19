# Erratas e pontos duvidosos do material oficial (LPI Learning Material 101-500 / 102-500, pt-BR)

Ao escrever e **testar no Debian 12** cada questão do banco, os pontos abaixo apareceram como erros de digitação, informações
desatualizadas ou imprecisões no PDF. As questões do app foram redigidas para ficarem inequívocas (o comportamento real prevaleceu);
vale desconfiar destes trechos ao estudar. Páginas = número **físico** da página no PDF. Isto não substitui conferir o site da LPI.

## Exame 101

### 101.x / 102.x
| Pág. | Observação |
|---|---|
| 101.3 p.51 | A saída do `runlevel` aparece como `N3`; o real é `N 3` (com espaço). |
| 101.3 p.56 | "Sem `-h`/`-r`, o `shutdown` vai ao runlevel 1" vale só para o SysVinit clássico. No `shutdown` do systemd o padrão é desligar. |
| 101.3 | O tipo de unidade `snapshot` não existe mais no systemd atual; o material cita só `/lib/systemd/system` (no RHEL é `/usr/lib/systemd/system`). |
| 102.1 p.70 | A tabela de tamanho de swap da Red Hat está embaralhada. |
| 102.1/102.2 | Cita 528 MB (cilindro 1024) para `/boot` e ~300 MB como tamanho recomendado — referência histórica. |
| 102.2 p.91 | Escreve `chainload +1`; o comando do GRUB Legacy é `chainloader +1`. |
| 102.2 ex.6 | `setup (hd1)` instala no MBR do segundo disco, não "na primeira partição". |
| 102.3 | No Debian 12, `libc.so.6` é arquivo real, não link para `libc-2.24.so` como no exemplo. |
| 102.4 | Com *usrmerge* (Debian 12), `dpkg -S /usr/bin/ls` não acha o arquivo (registrado como `/bin/ls`). Imagens Docker do Debian 12 usam `/etc/apt/sources.list.d/debian.sources` (deb822), sem `sources.list`. |
| 102.5 | O material não cobre `rpm -V`, `-K`, `--import` nem `rpm2cpio`, embora façam parte do objetivo. `dnf config-manager --add_repo` varia entre dnf4 (`--add-repo`) e dnf5 (`addrepo`). |
| 102.6 | Afirma que o KVM é "Tipo 1 e Tipo 2" (discutível) e que o contêiner migra "sem parar a aplicação" (duvidoso). O exemplo de cloud-init usa `apt_update`/`apt_upgrade`, hoje substituídos por `package_update`/`package_upgrade`. Não define "contêiner Linux × contêiner de aplicação" (LXC/LXD × Docker). |
| 101.1 | D-Bus não é ensinado na lição, embora conste nas áreas do objetivo. |

### 103.x
| Pág. | Observação |
|---|---|
| 103.1 p.188 | Sugere `hash -d` para limpar a tabela; o certo é `hash -r` (`-d` exige nome). Também: "apropros", caminhos `/bin` (hoje `/usr/bin`). |
| 103.1 p.193 | O resumo diz que `uname` exibe "a distribuição e a versão da distribuição"; ele só mostra dados do kernel e da máquina. |
| 103.1 p.195 | `uname -i` para arquitetura: no Debian imprime `unknown`; o portável é `uname -m`. |
| 103.2 p.209-210 | Mostra `cat >` encerrando com Ctrl+C; o fim de entrada é Ctrl+D. |
| 103.2 p.215 e p.294 | Diz que `wc` conta palavras por padrão; ele imprime linhas, palavras e bytes (a p.294 diz "caracteres" no lugar de bytes). |
| 103.2 p.237 | Diz que `split -d` numera os arquivos "usando o sufixo fornecido"; o que se informa é o **prefixo**. |
| 103.2 p.217 | A saída de `sed s/cat/dog/` mostra "ct" no lugar de "cut". |
| 103.2 p.234 | Descreve `uniq` como "mostra apenas as linhas únicas"; ele colapsa duplicatas **adjacentes** (só `-u` mostra as não repetidas). |
| 103.3 p.247 | O exemplo de `mv -i` descreve o sentido invertido (sobrescrever `old_file_name` com `new_file_name`). |
| 103.3 p.253-255 | O título "Caracteres entre chaves" descreve colchetes; `student-1A.text` deveria ser `.txt`; `find ... -name *.png` sem aspas (contradiz a p.266). |
| 103.3 p.270 | `--file=archive=name` tem erro de digitação. |
| 103.3 p.251 | A mensagem do `cp` ("omitting directory") é antiga; hoje: "-r not specified; omitting directory". |
| 103.3 p.267 | `-mtime 7` casa só arquivos com *exatamente* 7 períodos de 24 h; "últimos 7 dias" é `-mtime -7`. |
| 103.3 p.272 | "bzip" onde seria `bzip2`. |
| 103.3 p.273 | Diz que `cpio -d` "cria a pasta de destino"; cria os diretórios intermediários que faltam. |
| 103.3 p.279 | `find -name *.backup` sem aspas (contradiz a p.266); `-size -1000M` não equivale a 1G. |
| 103.4 p.303 | No `tar`, `--null` só é necessário para lista separada por NUL; sem ele, nomes com espaço funcionam (uma linha por nome). |
| 103.5 p.317 | Chama `avail Mem` de "memória de troca"; é a memória disponível para novos programas sem usar swap. |
| 103.5 p.316 | `W` no `top` grava em `~/.config/procps/toprc` ou `~/.toprc`, conforme a versão. |
| 103.5 p.345 | O atalho `Ctrl+b .` do tmux é `move-window`, não "alterar o índice". |
| 103.6 p.368 | Diz que `renice +5 -g users` "aumenta em cinco" e que `-g` aceita nome: o `renice` define valor **absoluto** e `-g` exige o ID numérico. |
| 103.6 p.368 | Diz que o `nice` "muda o valor para 10"; ele **soma** 10 ao valor herdado (`man nice`). |
| 103.7 p.381 | Trecho truncado/ilegível na extração do texto (conferir o PDF). A resposta do exercício de `sed` com parênteses (erro por referência `\1` inválida) está correta. |
| 103.8 p.411 | "`p`, `P`: colar antes ou depois" não diz qual faz o quê: `p` cola **depois** do cursor, `P` **antes**. |
| 103.8 p.413 | `:e` aparece como "salvar e sair"; `:e` edita um arquivo e não sai. |

### 104.x
| Pág. | Observação |
|---|---|
| 104.3 | O material mostra `MOUNTPOINT` e `lsblk -f` sem `FSVER`; o Debian 12 mostra `FSVER` e `MOUNTPOINTS`. O campo `pass` do fstab não cita a convenção 1 para `/` e 2 para os demais. O material limita `What=` a `/dev/disk/by-uuid/...`, mas qualquer caminho de dispositivo vale. |
| 104.5 ex.guiado 3 | Enunciado com umask 027, resposta diz 020 (o resultado `rw-r-----` corresponde a 027). |
| 104.5 | "Operation not allowed" deveria ser "Operation not permitted"; no exploratório 3 o SGID é chamado de "SUID"; "chown : students" é erro de digitação; a lição diz que `w` permite excluir arquivo, mas excluir depende do `w` **no diretório**. |
| 104.5 | `chmod 0755` desfaz SUID/SGID em arquivos, mas em diretórios o GNU `chmod` preserva esses bits em modos numéricos de até 4 dígitos. |
| 104.6 | Exploratório 1: a listagem mostra `-> receitas.txt` mas a resposta usa `-> recipes.txt`; o guiado 1 (`chmod +t`) é de outro tema; ex.5 diz que o link tem `rw-r--r--` enquanto `ls -l` mostra `lrwxrwxrwx`. |
| 104.1 p.433 | Diz que o rótulo ext "deve ter ao menos 16 caracteres"; é **no máximo** 16 (o `mke2fs` trunca com aviso). |
| 104.1 p.437 | `mkfs.exfat -n` é do exfat-utils; no Debian 12 (exfatprogs) o rótulo é `-L`. |
| 104.1 p.455 | Exercício guiado 5 (`mkfs.btrfs ... -m raid1`, "20 GB") está errado: `-m` só espelha metadados (dados ficam `single`); para espelhar tudo é `-d raid1 -m raid1`. Cita `/dev/sdb1` enquanto o enunciado fala em `/dev/sda2`. |
| 104.2 p.468 e p.478 | "`tune2fs -c 0` redefine a contagem de montagens" está errado: `-c 0` desativa o limite máximo; quem zera a contagem atual é `-C 0`. A p.468 lista `-f` entre as opções "não interativas" do `e2fsck`, mas só `-p`, `-y` e `-n` são. |
| 104.2 p.478 e p.480 | Resposta do exploratório 4 omite o dispositivo (`/dev/sda1`); typo "xfs -n". |
| 104.7 ex.guiado 3 | `find . -writable -mtime -10 -size 4G` está errado (faltam `+4G` e `-maxdepth 1`). |
| 104.7 exploratórios 2 e 4 | Contagem de níveis de `-maxdepth`/`-mindepth` ambígua; afirma que ler o arquivo altera o ctime (falso). |
| 104.7 | O banco do `locate` (`/var/lib/mlocate.db`) está desatualizado (plocate: `/var/lib/plocate/plocate.db`); no plocate vários padrões valem como AND. O `updatedb.conf` exige `VAR="valor"` com aspas. |

## Exame 102

| Pág. | Observação |
|---|---|
| 105.1 | O material diz que `--rcfile` ignora `/etc/bash.bashrc`; no Debian 12 esse arquivo ainda é lido. `HISTCONTROL` aparece com 3 valores, mas existe também `erasedups`. Nomes `git-info`/`git_info` inconsistentes no exercício. `/etc/bash.bashrc` e o skel com `.profile` são específicos de Debian (no RHEL: `/etc/bashrc` e `.bash_profile`). |
| 105.2 p.101-102 | `$!` é descrito como "PID do último programa executado": é o último processo **em segundo plano**. Diz que arrays "devem ser declarados com `declare`", mas o texto seguinte mostra a declaração implícita. |
| 105.2 p.115 e p.128 | `-a` é descrito como "existe e é arquivo" (só testa existência). O resumo diz que `until` repete "até que a expressão seja falsa"; é até ela ser **verdadeira** (status 0), como a p.121 explica. |
| 105.2 | `seq` está na lista do objetivo mas nunca é explicado; `wall` e `mail` aparecem só de passagem. |
| 105.2 | O kernel ignora o SUID em scripts com shebang. Exploratório 2: `test 1 > 2` dá verdadeiro porque `>` é **redirecionamento** (cria o arquivo `2`), não operador de string. `expr` é externo, não builtin; `-a` é sinônimo de `-e` (não "arquivo"). |
| 106.1 | A lição não ensina `xhost`, `xauth` nem `~/.xsession-errors`, que constam na lista do objetivo. Gabarito de mouse diz `InputDevice`, o texto indica `InputClass` em `xorg.conf.d`. Descrição do kernel repassando pedidos ao compositor Wayland é imprecisa. |
| 106.1 p.140-149 | Exemplos de `Section "Monitor"`, `"Device"` e `ServerFlags` com campos embaralhados (Identifier, Driver, BusID). `/etc/X11/xorg.conf.d/` é chamado "específico do usuário" (é configuração local do administrador). O cliente Wayland fala direto com o compositor (não "via kernel"). |
| 106.2 p.158 e p.164 | "Primeiro servidor VNC = 5900" não bate com a prática (`vncserver :1` usa 5901; porta = 5900 + display). Diz que o RDP é "suportado nativamente pelo Linux" (precisa de FreeRDP, xrdp…). Typo "JKDE". |
| 107.3 p.242-248 | Mistura `GMT+3` com `Etc/GMT+3` (sinal invertido: é UTC−3). Apresenta `/etc/timezone` como padrão e `tzselect` como universal (é Debian). Diz que `env` roda o comando "em um sub-shell" (faz `exec`). "UTF-8 é um Padrão Unicode para caracteres ocidentais" (codifica todo o Unicode). Dá `/etc/locale.conf` como arquivo do sistema; o Debian usa `/etc/default/locale`. `iconv` sem `//TRANSLIT` **aborta** com erro (não troca por `?`). |
| 105.2 p.103 | `expr` é descrito como "comando interno do Bash"; é utilitário externo (coreutils). |
| 106.3 | Teclas de alternância, gestos e reconhecimento de fala só aparecem na lista de termos, não no texto. |
| 107.3 ex.guiado 1 | `date` com `+05` não corresponde a `Etc/GMT+5`; o correto é `Etc/GMT-5` (sinal invertido). |

| 107.1 p.186 | `passwd -d` é descrito como "desabilitando o usuário"; na prática apaga a senha (hash vazio, status `NP`). |
| 107.1 p.194 | Diz que o `usermod` não remove um único grupo; o shadow-utils do Debian 12 aceita `usermod -r -G`. |
| 107.1 p.206 | "UIDs maiores que 1000" deveria ser "a partir de 1000" (`UID_MIN`). |
| 107.2 p.216 | `30 20 1-15 1,6 1-5` está explicado errado: com dia do mês **e** dia da semana restritos, o cron usa **OU**, não E (`man 5 crontab`). |
| 107.2 p.236 | "at tomorrow 08:30 AM monotonic" é erro de digitação; `at midday` é inválido (o certo é `noon`). |
| 108.1 p.279 | Diz que o NTP usa "porta TCP 123"; é **UDP** 123. |
| 108.1 p.266 e p.274 | `date +%m -s "2"` e `date +%T -s ...` não funcionam como descrito (`+FORMAT` é ignorado ao definir a hora; `date -d 2` vira 02:00 de hoje). `hwclock -systohc` é typo de `--systohc`; `chrony ntpdata` deveria ser `chronyc ntpdata` (p.284). |
| 108.2 p.345 e p.350 | A tabela de Storage cita `/var/run/journal`; o caminho real é `/run/log/journal`. Typos: `/etc/ryslog.d/`, `/etc/rsylog.conf` (p.303 e p.400), `notifyempty`. A lição não ensina `logrotate -d/-f`. No Debian 12 o `rsyslog.conf` padrão não tem mais `daemon.log`, `debug` nem `messages`. |
| 108.3 p.369 | O exercício `mail -a logs.tar.gz` assume `-a` como anexo: só vale para Heirloom mailx/s-nail; no `bsd-mailx` do Debian `-a` adiciona cabeçalho e no GNU Mailutils o anexo é `-A`. |
| 108.4 p.381 e p.383 | `lpr-#7` (falta espaço) e `lp -o` no lugar de `lpstat -o`. `lpoptions -d` é o padrão **por usuário** (`~/.cups/lpoptions`); o do sistema é `lpadmin -d`. |
| 110.1 p.522 | `sudo useradd -aG sudo carol` é erro; o certo é `usermod -aG` (o `useradd` não tem `-a`). |
| 110.1 p.533 e p.507 | `pts/0` não indica "terminal gráfico" (SSH também usa pts). `chage -W` fala em "senha expirou", mas o aviso é **antes** da expiração. A afirmação sobre `chage -I 0` é duvidosa (a man diz que `-1` remove a inatividade). |
| 109.1 | O material diz que o UDP "estabelece conexão"; ele é **sem conexão**. |
| 109.2 | `hostnamectl set-hostname` sem opções: a documentação diz que atua nos três nomes, mas a implementação limpa o nome *pretty* quando o nome informado é um hostname válido. A afirmação de que interfaces `static` dispensam `auto` é duvidosa. |
| 109.3 | `tracepath6` é dado como obrigatório para IPv6, mas o `tracepath` atual já aceita IPv6 e o `tracepath6` falta no Debian 12. O exemplo `ip link add ... type bridge priority 50` está incorreto. Diz que a métrica das rotas "não é usada pelo kernel" (impreciso) e que Recv-Q/Send-Q contam pacotes (contam **bytes**). `traceroute -I` não exigiu root no teste (o material afirma que exige); `nmcli device wifi rescan` "só root" depende da política do sistema. |
| 109.4 | Escreve `option timeout:3`; a palavra-chave real é `options`. O arquivo do systemd-resolved é `/etc/systemd/resolved.conf` (não `resolv.conf`); "systemd-resolution" é grafia errada. O limite de 6 domínios em `search` caiu a partir da glibc 2.26. |
| 110.2 | `/etc/inittab` e `/etc/init.d/` aparecem só na lista do objetivo (p.536), sem lição. `update-rc.d NOME remove` funciona, embora a man page recomende `disable`. Em Debian o `sshd_config` vem com `X11Forwarding yes` (o padrão upstream é `no`). `/etc/nologin` barra também login por chave SSH (o PAM do `sshd` carrega `pam_nologin`). |
| 110.3 | Diz que o `ssh-keygen` gera RSA de 2048 bits por padrão: no OpenSSH 9.2 é 3072 e, a partir do 9.5, o tipo padrão passa a ser Ed25519. A tabela do exercício liga `-L` a `AllowTcpForwarding` e `-R` a `GatewayPorts`: na prática `AllowTcpForwarding` vale para ambos e `GatewayPorts` só define o endereço de bind do `-R`. Define KEY-ID como os 8 últimos dígitos do fingerprint, mas o gpg atual mostra IDs longos de 16. Typo no gabarito: `opengp-revocs.d` (o correto é `openpgp-revocs.d`). |

## Itens adicionais achados na revisão cega

| Pág. | Observação |
|---|---|
| 103.5 p.360 | O gabarito usa `Ctrl+b "` para "dividir verticalmente", contradizendo a p.345 (o correto é `Ctrl+b %`). |
| 103.6 p.367 | A faixa 100–139 tem 40 níveis, não 39. |
| 103.7 p.387, p.390, p.394 | `egrep ".org$\|.com$"` não escapa o ponto (casa `myorg`); `grep -c` é descrito como contagem de ocorrências, mas conta **linhas**; manda colocar as instruções do `sed` "entre parênteses", mas o exemplo usa aspas. |
| 104.1 p.435, p.448, p.454 | Volume máximo do FAT32 "2 PB" (duvidoso; ~2 TB com setores de 512 bytes); `parted /dev/sdb3` deveria ser o disco `/dev/sdb`; o resumo diz "criar tabela MBR com gdisk" (o `gdisk` cria GPT). |
| 104.2 p.477 | O enunciado pede "porcentagem de espaço livre", mas `pcent` do `df` é porcentagem **usada**. |
| 104.3 p.484-487 | `umount -a` não "desmonta todos os listados em /etc/fstab" (usa mountinfo/mtab); "`-r` ou `-ro`" e "`-w` ou `-rw`" estão errados (`-ro` é `-r -o`); exemplo de fstab com `errors` sem valor e sem os campos dump/pass. |
| 104.5 p.511 e p.526 | Sugere que o dono poderia ser trocado para um usuário do próprio grupo (só o root troca o dono); fala "bit SUID" duas vezes ao descrever o SGID. |
| 104.6 p.535, p.540, p.543 | Listagem `rezepte.txt -> receitas.txt` × resposta `recipes.txt`; a contagem de links 4 não bate com 2 hardlinks; "links herdam as permissões do alvo": o `ls` mostra sempre `rwxrwxrwx` (o acesso é decidido pelo alvo). |
| 104.7 p.551, p.555-556 | "775 (rwxrwx-r-x)" tem a máscara escrita errada; `type -t type` imprime `builtin`, mas o PDF mostra uma frase longa. |
| 105.1 p.16-17, p.49, p.62 | Diz que scripts não leem nenhum arquivo de inicialização, contradizendo o próprio texto sobre `BASH_ENV` (p.23); `DISPLAY` escrito como `host:0:2` (o formato é `host:display.screen`). |

| 108.1 p.282 | Diz que a coluna `reach` do `ntpq -p` "incrementa em 1"; é um registrador de deslocamento octal de 8 bits (`377` = as últimas 8 consultas responderam). |
| 107.1 / 110.1 | `passwd -S` mostra a data no formato ISO (AAAA-MM-DD) no Debian 12, não MM/DD/AAAA como nos exemplos. |
| 107.2 | Em crontab com dia do mês **e** dia da semana restritos, o cron real aplica **OU**, não E (o livro interpreta como E). |

*(Este arquivo é a lista de erratas conhecidas até o momento; se achar mais, abra uma issue ou PR.)*
