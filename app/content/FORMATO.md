# Formato do banco de questões

Cada objetivo da LPI tem um arquivo `app/content/questions/<objetivo>.txt` (ex.: `103.4.txt`).
Dentro do arquivo, cada questão é um bloco que começa com `###`. Você pode adicionar suas próprias
questões a qualquer momento: reinicie o container (`docker compose restart web`) ou clique em
**Configurações → Recarregar banco**.

Valide antes de usar:

```
node app/tools/lint-questions.mjs                      # todo o banco
node app/tools/lint-questions.mjs app/content/questions/103.4.txt
```

## Estrutura de um bloco

````
### 103.4-001 | unica | 2
ref: 101:p.285
tags: redirecionamento, tee
Enunciado da questão. Pode ter várias linhas e `código inline`.

Também aceita blocos de código (as linhas dentro dele nunca são lidas como opções):

```
$ cmd1 | cmd2 > saida.txt
```
= opção correta
- opção errada
- opção errada
- opção errada
> Explicação: por que a correta está certa e por que cada distrator está errado.
> Pode ter várias linhas (cada uma começa com "> ").
````

| Parte | Regra |
|---|---|
| Cabeçalho | `### <objetivo>-<NNN> \| <tipo> \| <nível>` — o id (`103.4-001`) é único e **nunca deve mudar** (o histórico de acertos usa ele) |
| `tipo` | `unica` (1 correta, 4–5 opções) · `multipla` (2–3 corretas, 5–6 opções) · `lacuna` (resposta curta digitada) |
| `nível` | `1` fácil/memorização · `2` médio/aplicação · `3` difícil/cenário ou pegadinha |
| `ref:` | páginas do PDF do LPI onde está a resposta: `101:p.285` ou `102:p.12-14` (número **físico** da página no PDF; o linter confere se está dentro do objetivo) |
| `tags:` | opcional, palavras-chave separadas por vírgula |
| `= ` | opção correta (em `lacuna`: uma resposta aceita; pode haver várias linhas `=` com variações equivalentes) |
| `- ` | opção errada |
| `> ` | explicação (obrigatória) |

## Tipos

**unica** — "Qual das alternativas…?". Exatamente um `=`.

**multipla** — mais de uma correta. A interface mostra "Selecione N respostas" sozinha; não escreva isso
no enunciado. A questão só vale ponto se **todas** as corretas e **nenhuma** errada forem marcadas (como na prova real).

**lacuna** — a prova real tem questões de preencher. Peça algo **curto e inequívoco** (um comando, uma opção, um caminho, um número).
A comparação distingue maiúsculas de minúsculas (Linux!), ignora espaços repetidos nas pontas e um `$ `/`# ` inicial.
Liste como `=` todas as variações equivalentes:

```
### 104.5-007 | lacuna | 2
ref: 101:p.510
Qual comando altera o dono de `arquivo` para `ana`? ____ ana arquivo
= chown
> `chown` muda o proprietário; `chgrp` muda apenas o grupo.
```

## Dicas de qualidade (o linter avisa de algumas)

* Distratores **plausíveis** (comandos/opções reais, com troca típica de flag); nada de "todas as anteriores".
* Equilibre o tamanho das opções — a correta não pode ser sempre a mais longa.
* Questões de "qual a saída?" devem ser **testadas de verdade** (ex.: `docker run --rm debian:bookworm-slim bash -c '...'`).
* Uma única resposta defensável numa distribuição moderna (Debian/Ubuntu/RHEL). Se variar entre distros, diga isso na explicação.
* Sempre explique também *por que os distratores estão errados* — é aí que se aprende.
