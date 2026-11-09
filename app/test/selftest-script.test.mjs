// Regressão do achado E-09: scripts/selftest.sh precisa terminar com código != 0 quando
// `node --test` (ou o lint) falha. Usa um `node` falso no PATH, então não executa nada de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const hasBash = spawnSync('bash', ['-c', 'exit 0']).status === 0;

// Cria um "node" que devolve rcLint para `node app/tools/lint-questions.mjs ...` e rcTest para `node --test`.
function rodaSelftest(rcLint, rcTest) {
  const dir = mkdtempSync(path.join(tmpdir(), 'selftest-fake-'));
  try {
    const fake = path.join(dir, 'node');
    writeFileSync(fake, `#!/usr/bin/env bash\ncase "$*" in *--test*) exit ${rcTest};; *) exit ${rcLint};; esac\n`);
    chmodSync(fake, 0o755);
    return spawnSync('bash', ['scripts/selftest.sh', 'rapido'], {
      cwd: root,
      env: { ...process.env, PATH: dir + path.delimiter + process.env.PATH },
      encoding: 'utf8',
      timeout: 60000,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('selftest.sh rapido: testes unitários falhando => saída 1 e sem anunciar sucesso', { skip: !hasBash && 'bash indisponível' }, () => {
  const r = rodaSelftest(0, 1);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /tudo certo/);
  assert.match(r.stdout, /FALHOU/);
});

test('selftest.sh rapido: lint falhando => saída 1', { skip: !hasBash && 'bash indisponível' }, () => {
  const r = rodaSelftest(1, 0);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /tudo certo/);
});

test('selftest.sh rapido: tudo passando => saída 0 e "tudo certo"', { skip: !hasBash && 'bash indisponível' }, () => {
  const r = rodaSelftest(0, 0);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /tudo certo/);
  assert.doesNotMatch(r.stdout, /FALHOU/);
});
