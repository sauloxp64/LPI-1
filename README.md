# LPIC-1 · Área de estudos (101-500 + 102-500)

Área de estudos web, 100% local em Docker, para a certificação **LPIC-1** (objetivos versão 5.0): simulados que **mudam a cada vez**,
um laboratório Linux de verdade no navegador, acompanhamento do curso e o material oficial da LPI com busca em texto completo.

```
docker compose up -d --build      # ou dê dois cliques em iniciar.cmd (Windows)
→ http://localhost:8088           # a área de estudos (o terminal do laboratório vem embutido)
```

Requisitos: Docker Desktop. A primeira subida demora alguns minutos (baixa o Debian e instala as ferramentas do laboratório).
Para parar: `docker compose down` (ou `parar.cmd`); o progresso fica salvo no volume `lpic1_dados`.

### Material de estudo (PDFs)
Os PDFs oficiais **não vêm no repositório** (são © Linux Professional Institute, CC BY-NC-ND). Baixe-os, gratuitos, no portal
**learning.lpi.org** (*Learning Materials → LPIC-1 → 101-500 e 102-500*, em português) e salve na **raiz do projeto** com estes nomes:

```
LPI-Learning-Material-101-500-pt.pdf
LPI-Learning-Material-102-500-pt.pdf
```

Qualquer **outro PDF** na mesma pasta aparece na aba *Material* como **complemento** (apostilas, livros). Se for escaneado (só imagem),
rode `scripts/ocr-pdf.sh "arquivo.pdf"` — um container descartável faz o OCR em português — e ele também entra na busca.
Sem os PDFs o app funciona normalmente; só os links "📖 material" e a busca dependem deles.

## O que tem aqui

| Recurso | Como funciona |
|---|---|
| **Simulado oficial 101 / 102** | 60 questões, 90 min, cronômetro, **exatamente a distribuição dos pesos oficiais** (101: 8/12/26/14; 102: 8/4/12/12/14/10 — a soma dos pesos é o nº de questões). Há também o oficial completo 101+102 (120 q / 180 min). |
| **Nunca repete** | Cada simulado é sorteado na hora: questões do banco (preferindo as que você ainda não viu ou errou) **+ variações geradas por código** (permissões, umask, CIDR, cron, redirecionamentos, saídas de `sort`/`grep`/`sed`…), alternativas embaralhadas. "↻ Novo sorteio" nunca devolve a mesma prova. |
| **Acompanha o curso** | Na aba **Curso** você marca o que já viu (por objetivo e, no tópico 103, por aula do curso *Linux Sem Fronteiras*). O modo **"do que já vi"** só sorteia nesse conteúdo; o painel trata o resto como não estudado. |
| **Formatos da prova real** | Escolha única, **múltipla escolha** (acerta só se marcar todas e nenhuma errada) e **preencher lacuna** (digite o comando/opção; distingue maiúsculas, como no Linux). |
| **Modos** | Oficial · do que já vi · foco nos pontos fracos · relâmpago (10 q) · por tópico/objetivo · treino com correção imediata · caderno de erros (repetição espaçada 1-3-7-14-30 dias). |
| **Prontidão** | Domínio por objetivo (respostas recentes pesam mais), prontidão ponderada pelos pesos oficiais, mapa de calor dos 42 objetivos, sequência de estudo, evolução das notas, contagem regressiva da data do exame, conquistas e próximos passos recomendados. |
| **Revisão** | Gabarito + explicação de cada alternativa + **link para a página exata do PDF**. Botões *Contestar* (resposta equivalente) e *Reportar erro*. Refazer só as erradas. |
| **Material** | Os PDFs servidos localmente, com índice por objetivo/seção (via marcadores do PDF), **busca em texto completo** e complementos. |
| **Laboratório** | Um Debian 12 num container descartável, com terminal web. Cada **desafio** sorteia nomes/valores/dados, prepara o cenário e **confere o estado real do sistema** (usuário criado, permissão, arquivo, crontab, saída gerada…). Dicas progressivas e solução. |

## Como usar no dia a dia

1. **Curso** → marque onde você está. 2. Depois de cada aula: **Treino** do objetivo (10–15 questões, correção imediata) e o **desafio de lab** correspondente.
3. Uma vez por semana: **simulado "do que já vi"**. 4. Reta final: **oficial 101** e **102** cronometrados; só agende quando a prontidão passar da meta (75%) com folga nos dois.
5. Todo dia: 10 min de **caderno de erros**.

> **Nota sobre a nota:** a LPI usa nota escalonada (mínimo **500 de 800** por exame) e não publica a fórmula; por isso o app mostra porcentagem e adota **75% como margem de segurança**. Formato (60 questões, 90 min) conforme divulgado pela LPI/Pearson VUE — confirme no site oficial antes de agendar.

## Banco de questões

* **1.674 questões em português** (42 objetivos, 3 formatos, 3 níveis) em `app/content/questions/<objetivo>.txt`, escritas a partir do material oficial e dos **objetivos oficiais** (cada `area` e cada utilitário listado pela LPI é cobrado), com `ref:` apontando a página do PDF.
* **Testadas de verdade**: o que é "qual a saída / o que acontece" foi executado num Debian 12 (`docker run`) pelo autor de cada arquivo, e depois passou por **revisão cega independente** — outro revisor respondeu cada questão sem ver o gabarito (1.669 de 1.672 respostas coincidiram; as divergências viraram correções ou reformulações).
* **230 geradores paramétricos** em `app/src/generators/`: cada um cria questões novas com números/nomes/comandos sorteados e **gabarito calculado por código**, conferido contra as ferramentas reais (`bash`, GNU coreutils, `chmod`, `grep`, `sed`, `vim -es`…) em centenas de sementes (`node app/tools/verify-generators.mjs`).
* **`ERRATAS-MATERIAL.md`**: ao testar tudo no Debian, os autores acharam **dezenas de erros e pontos desatualizados no próprio PDF da LPI** (ex.: `tune2fs -c 0` × `-C 0`, `renice` é absoluto, `find -mtime 7`, UDP "estabelece conexão"…). Vale conferir ao estudar.

Adicionar suas questões: edite/crie `app/content/questions/*.txt` (formato em `app/content/FORMATO.md`) e clique em **Configurações → Recarregar banco** (ou `docker compose restart web`). Validar: `node app/tools/lint-questions.mjs`.

## Laboratório

**56 desafios** em `lab/challenges/<id>/` (`meta.json` + `setup.sh` + `check.sh` + `solve.sh`), cobrindo 30+ objetivos. Aparecem na aba **Laboratório**; a pasta é montada direto no container (não precisa rebuild). O container **não é privilegiado** (sem `mount`, sem `systemd`, sem rede de verdade), então o lab foca no que dá para praticar de verdade: arquivos, permissões, usuários, processos, cron/at, pipelines, regex, imagens de disco com `fdisk`/`mkfs`, ssh-keygen/gpg, logs, scripts. Boot/systemd/GRUB/rede física continuam cobertos pelas questões.

Cada desafio é testado automaticamente: o cenário não pode nascer resolvido, a solução de referência tem de passar e o reset tem de desfazer tudo (`node app/tools/selftest-lab.mjs`).

## Verificações (qualidade)

```
scripts/selftest.sh            # tudo: lint do banco, testes, geradores × ferramentas reais, desafios do lab
scripts/selftest.sh rapido     # sem Docker
node app/tools/e2e.mjs --base=http://localhost:PORTA   # E2E no Chrome (use um servidor com banco descartável!)
node app/tools/blind-review.mjs dump|score ...          # revisão cega de um arquivo do banco
```

## Segurança e privacidade

Tudo roda na sua máquina e as portas escutam só em `127.0.0.1`. O progresso fica num volume Docker (SQLite) e pode ser exportado em **Configurações**.

* O servidor só atende `Host` conhecido (localhost/127.0.0.1) e exige `Origin` igual ao próprio app nas mutações — defesa contra **DNS rebinding** e **CSRF** de outros sites. Para abrir na rede local: troque a porta para `"8088:8088"` no `docker-compose.yml` e defina `ALLOWED_HOSTS="meu-pc.local,192.168.0.10"`.
* O terminal do lab **não** é exposto direto: o app faz proxy em `/terminal/` (mesma checagem de Host/Origin; o `ttyd` roda com `--check-origin`). Ele roda num container **sem privilégios**, descartável, com limites de memória/processos, e sem acesso ao seu sistema de arquivos. `sudo` sem senha só existe lá dentro.
* A exportação de progresso não inclui provas em andamento (elas carregam o gabarito).

## Estrutura

```
docker-compose.yml        web (Node 24, sem dependências npm) + lab (Debian 12 + ttyd + verificador)
app/src                   servidor, motor de provas, estatísticas, geradores, índice dos PDFs
app/public                interface (HTML/CSS/JS puro, sem build, funciona offline)
app/content/questions     banco de questões (.txt)       app/data    objetivos oficiais, mapa de páginas dos PDFs, curso
app/tools                 lint, verificação dos geradores, revisão cega, autoteste do lab, E2E
lab/                      Dockerfile do laboratório, checker, desafios
scripts/                  selftest, OCR de PDFs
```

## Créditos e licenças

Código e questões: MIT (veja `LICENSE`). O *LPI Learning Material* (LPIC-1 101-500/102-500, pt-BR) é © Linux Professional Institute, **CC BY-NC-ND 4.0**, e não faz parte deste repositório; as questões do app são originais. Objetivos: <https://www.lpi.org/pt-br/exam-101-102-objectives/>. "LPI" e "LPIC-1" são marcas do Linux Professional Institute. Este projeto não é afiliado à LPI, à Linux Sem Fronteiras nem à Pearson VUE.
