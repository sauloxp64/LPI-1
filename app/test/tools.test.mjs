import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main as verify, parseArgs } from '../tools/verify-generators.mjs';
import { main as blind } from '../tools/blind-review.mjs';

// B-10: as ferramentas de verificação nunca podem "passar" sem ter verificado nada.

const fakeQ = (extra = {}) => ({
  type: 'unica', text: 'Qual comando lista arquivos do diretório?',
  options: [{ t: 'ls', ok: true }, { t: 'cd', ok: false }, { t: 'rm', ok: false }, { t: 'mv', ok: false }],
  explanation: 'ls lista; cd muda de diretório; rm remove; mv move arquivos.', ref: ['101:p.100'], ...extra,
});
const espiao = () => {
  const calls = { make: 0, spawn: [] };
  const gen = { id: 'fake', obj: '101.1', nivel: 1, peso: 1, make: () => { calls.make++; return fakeQ(); } };
  const spawn = (cmd, args) => { calls.spawn.push([cmd, ...args]); return { status: 0, stdout: '' }; };
  const linhas = [];
  return { calls, gen, spawn, out: (s) => linhas.push(String(s)), linhas };
};

test('verify-generators: --n inválido, --only desconhecido ou vazio => status 2, nenhuma geração, nenhum subprocesso', () => {
  for (const arg of ['--n=0', '--n=abc', '--n=-3', '--n=1.5', '--n=', '--n', '--only=inexistente', '--only=', '--only=fake,inexistente', '--foo=1']) {
    const s = espiao();
    const code = verify([arg, '--no-docker'], { gens: [s.gen], spawn: s.spawn, out: s.out, outline: {} });
    assert.equal(code, 2, `${arg}: esperava status 2`);
    assert.equal(s.calls.make, 0, `${arg}: gerou questões`);
    assert.deepEqual(s.calls.spawn, [], `${arg}: chamou subprocesso`);
    assert.ok(!s.linhas.some((l) => /tudo certo/.test(l)), `${arg}: anunciou sucesso`);
  }
  assert.equal(parseArgs(['--n=9007199254740993'], ['x']).erro !== undefined, true, 'inteiro inseguro');
});

test('verify-generators: --no-docker --n=1 --only=<id> gera 1 questão sem tocar no Docker e informa a contagem', () => {
  const s = espiao();
  const code = verify(['--no-docker', '--n=1', '--only=fake'], { gens: [s.gen], spawn: s.spawn, out: s.out, outline: {} });
  assert.equal(code, 0);
  assert.equal(s.calls.make, 1);
  assert.deepEqual(s.calls.spawn, [], '--no-docker não pode chamar docker (nem para descobrir a imagem)');
  assert.ok(s.linhas.some((l) => /1 geração\(ões\) em 1 gerador/.test(l)));
  // com um gerador real do repositório (sem fakes) também funciona sem Docker
  const real = [];
  const code2 = verify(['--no-docker', '--n=1', '--only=cron-linha-valida'], { spawn: () => { throw new Error('docker chamado'); }, out: (l) => real.push(l) });
  assert.equal(code2, 0);
  assert.ok(real.some((l) => /1 geração\(ões\) em 1 gerador/.test(l)));
});

test('verify-generators: modo Docker usa contêiner descartável (--rm), sem volumes do host, e compara o resultado', () => {
  const g = { id: 'fake', obj: '101.1', nivel: 1, peso: 1, make: () => fakeQ({ verify: { sh: 'echo oi', expect: 'oi' } }) };
  const rodar = (stdout) => {
    const chamadas = [];
    const spawn = (cmd, args) => { chamadas.push(args); return args[0] === 'image' ? { status: 0 } : { status: 0, stdout }; };
    const linhas = [];
    const code = verify(['--n=1'], { gens: [g], spawn, out: (l) => linhas.push(l), outline: {} });
    return { code, chamadas, linhas };
  };
  const certo = rodar('@@BEGIN 0\noi\n@@END 0\n');
  assert.equal(certo.code, 0);
  const run = certo.chamadas.find((a) => a[0] === 'run');
  assert.ok(run.includes('--rm'), 'contêiner precisa ser descartável');
  assert.ok(!run.some((a) => /^(-v|--volume|--mount|--name|--privileged)/.test(a)), 'sem volumes do host, sem nome fixo (nunca reaproveita contêiner existente) e sem privilégios');
  assert.ok(!certo.chamadas.some((a) => ['exec', 'start', 'restart', 'stop', 'kill', 'rm', 'compose'].includes(a[0])), 'só image inspect e run --rm');
  const errado = rodar('@@BEGIN 0\ntchau\n@@END 0\n');
  assert.equal(errado.code, 1);
  const ausente = rodar('');
  assert.equal(ausente.code, 1, 'verificação sem saída não pode contar como ok');
});

// ---------------------------------------------------------------- blind-review

const BANCO = `### 103.4-001 | unica | 1
ref: 101:p.285
Qual comando lista arquivos?
= ls
- cd
- rm
- mv
> Explicação longa o bastante para passar na leitura.

### 103.4-002 | lacuna | 1
ref: 101:p.285
Qual comando mostra o diretório atual?
= pwd
> Explicação longa o bastante para passar na leitura.
`;

function cegar(respostas) {
  const dir = mkdtempSync(join(tmpdir(), 'blind-'));
  try {
    writeFileSync(join(dir, 'q.txt'), BANCO);
    writeFileSync(join(dir, 'r.txt'), respostas);
    const linhas = [];
    const code = blind(['score', join(dir, 'q.txt'), join(dir, 'r.txt')], { out: (l) => linhas.push(String(l)) });
    return { code, texto: linhas.join('\n') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('blind-review score: respostas vazias, desconhecidas ou malformadas falham (status 2) em vez de "0/0"', () => {
  for (const [nome, r] of [['vazio', ''], ['só comentários', '# nada\n\n// nada\n'], ['ID desconhecido', '999.9-999: A\n'], ['linha malformada', 'bla bla\n'], ['resposta vazia', '103.4-002:\n']]) {
    const x = cegar(r);
    assert.equal(x.code, 2, `${nome}: esperava status 2\n${x.texto}`);
  }
  // alternativa fora do intervalo de letras também é erro de entrada
  assert.equal(cegar('103.4-001: Z\n').code, 2);
  assert.equal(cegar('103.4-001: A\n103.4-001x: B\n').code, 2, 'uma linha inválida mistura-se com válidas: ainda falha');
});

test('blind-review score: revisão parcial válida continua aceita (status 0 se coincide, 1 se diverge)', () => {
  assert.equal(cegar('103.4-002: pwd\n').code, 0);
  const errada = cegar('103.4-002: ls\n');
  assert.equal(errada.code, 1);
  assert.match(errada.texto, /0\/1 coincidem/);
});

test('blind-review: arquivo inexistente e uso incorreto => status 2', () => {
  const l = [];
  assert.equal(blind(['score', join(tmpdir(), 'nao-existe-xyz.txt'), join(tmpdir(), 'nem-este.txt')], { out: (s) => l.push(s) }), 2);
  assert.equal(blind(['dump'], { out: (s) => l.push(s) }), 2);
  assert.equal(blind([], { out: (s) => l.push(s) }), 2);
});
