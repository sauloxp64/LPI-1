// Regressão do achado E-10: scripts/ocr-pdf.sh não pode publicar OCR parcial nem descartar o .ocr.txt anterior
// quando uma página falha. O Docker, o apt, o pdftoppm e o tesseract são substituídos por programas falsos no PATH
// (o `docker run ... bash -c` é executado localmente, com /work trocado pelo diretório de teste).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = process.env.OCR_SCRIPT_UNDER_TEST || path.join(root, 'scripts', 'ocr-pdf.sh');   // (a variável existe só para provar o teste contra a versão antiga)
const hasBash = spawnSync('bash', ['-c', 'exit 0']).status === 0;

const FAKES = {
  docker: `#!/usr/bin/env bash
args=("$@"); host=""; script=""; i=0
while [ $i -lt \${#args[@]} ]; do
  a=\${args[$i]}
  case $a in
    -v) host=\${args[$((i+1))]%:/work}; i=$((i+1));;
    -e) export "\${args[$((i+1))]}"; i=$((i+1));;
    bash) if [ "\${args[$((i+1))]}" = "-c" ]; then script=\${args[$((i+2))]}; break; fi;;
  esac
  i=$((i+1))
done
script=\${script//\\/work/$host}
exec bash -c "$script"
`,
  'apt-get': '#!/usr/bin/env bash\nexit 0\n',
  pdftoppm: `#!/usr/bin/env bash
prefix="\${@: -1}"
for n in $(seq 1 "\${FAKE_PAGES:-2}"); do printf 'P5 fake' > "$(printf '%s-%02d.pgm' "$prefix" "$n")"; done
`,
  tesseract: `#!/usr/bin/env bash
img="$1"; psm=""
while [ $# -gt 0 ]; do [ "$1" = "--psm" ] && psm="$2"; shift; done
pg=\${img#pg-}; pg=\${pg%.pgm}
case " \${FAKE_FAIL_PAGES:-} " in *" $pg "*) echo "Error during processing." >&2; exit 1;; esac
if [ "$psm" = "1" ]; then case " \${FAKE_FAIL_PSM1_PAGES:-} " in *" $pg "*) echo "osd falhou" >&2; exit 1;; esac; fi
echo "texto da pagina $((10#$pg))"
`,
};

function prepara() {
  const base = mkdtempSync(path.join(tmpdir(), 'ocr-test-'));
  const bin = path.join(base, 'bin');
  const work = path.join(base, 'work');
  for (const d of [bin, work]) spawnSync('mkdir', ['-p', d]);
  for (const [nome, conteudo] of Object.entries(FAKES)) {
    writeFileSync(path.join(bin, nome), conteudo);
    chmodSync(path.join(bin, nome), 0o755);
  }
  writeFileSync(path.join(work, 'Livro.pdf'), '%PDF-fake');
  return { base, bin, work };
}
function roda(ctx, env = {}) {
  return spawnSync('bash', [SCRIPT, path.join(ctx.work, 'Livro.pdf')], {
    env: { ...process.env, PATH: ctx.bin + path.delimiter + process.env.PATH, ...env },
    encoding: 'utf8', timeout: 60000,
  });
}
const skip = !hasBash && 'bash indisponível';

test('ocr-pdf.sh: sucesso publica as páginas em ordem, cada uma seguida de \\f', { skip }, () => {
  const ctx = prepara();
  try {
    const r = roda(ctx, { FAKE_PAGES: '3' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(readFileSync(path.join(ctx.work, 'Livro.ocr.txt'), 'utf8'), 'texto da pagina 1\n\ftexto da pagina 2\n\ftexto da pagina 3\n\f');
    assert.deepEqual(readdirSync(ctx.work).sort(), ['Livro.ocr.txt', 'Livro.pdf'], 'não pode sobrar temporário');
  } finally { rmSync(ctx.base, { recursive: true, force: true }); }
});

test('ocr-pdf.sh: falha na página 2 => saída != 0 e o .ocr.txt anterior fica byte a byte intacto', { skip }, () => {
  const ctx = prepara();
  try {
    const anterior = 'OCR ANTERIOR valido\n\fpagina dois antiga\n\f';
    writeFileSync(path.join(ctx.work, 'Livro.ocr.txt'), anterior);
    const r = roda(ctx, { FAKE_PAGES: '2', FAKE_FAIL_PAGES: '02' });
    assert.notEqual(r.status, 0, 'deveria falhar: ' + r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /pronto/);
    assert.match(r.stderr, /p[aá]gina 2/);
    assert.equal(readFileSync(path.join(ctx.work, 'Livro.ocr.txt'), 'utf8'), anterior);
    assert.deepEqual(readdirSync(ctx.work).sort(), ['Livro.ocr.txt', 'Livro.pdf'], 'não pode sobrar temporário');
  } finally { rmSync(ctx.base, { recursive: true, force: true }); }
});

test('ocr-pdf.sh: falha sem OCR anterior => nenhum .ocr.txt é criado', { skip }, () => {
  const ctx = prepara();
  try {
    const r = roda(ctx, { FAKE_PAGES: '2', FAKE_FAIL_PAGES: '01' });
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    assert.equal(existsSync(path.join(ctx.work, 'Livro.ocr.txt')), false);
    assert.deepEqual(readdirSync(ctx.work).sort(), ['Livro.pdf']);
  } finally { rmSync(ctx.base, { recursive: true, force: true }); }
});

test('ocr-pdf.sh: se só o modo --psm 1 falhar, a página é refeita com --psm 3 e o resultado é completo', { skip }, () => {
  const ctx = prepara();
  try {
    const r = roda(ctx, { FAKE_PAGES: '2', FAKE_FAIL_PSM1_PAGES: '02' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(readFileSync(path.join(ctx.work, 'Livro.ocr.txt'), 'utf8'), 'texto da pagina 1\n\ftexto da pagina 2\n\f');
  } finally { rmSync(ctx.base, { recursive: true, force: true }); }
});
