// Índice de busca em texto completo dos PDFs do LPI (pdftotext, em memória).
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function pdftotext(file) {
  return new Promise((resolve, reject) => {
    execFile('pdftotext', ['-enc', 'UTF-8', '-layout', file, '-'], { maxBuffer: 256 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

export class PdfIndex {
  constructor(dir, files, outline) {
    this.dir = dir;
    this.files = files; // { '101': 'arquivo.pdf', '102': '...' }
    this.outline = outline;
    this.pages = {}; // exame -> [{ raw, norm }]
    this.state = 'novo';
    this.semTexto = []; // PDFs sem texto e sem OCR (não pesquisáveis)
    this.falhas = []; // PDFs que o pdftotext não conseguiu ler
    this.error = null;
  }

  async build() {
    this.state = 'indexando';
    try {
      for (const [exam, f] of Object.entries(this.files)) {
        const path = join(this.dir, f);
        if (!existsSync(path)) continue;
        try { // um PDF inválido não pode derrubar a busca nos demais
          let text = await pdftotext(path);
          // PDF escaneado (sem camada de texto): usa o OCR gerado por scripts/ocr-pdf.sh, se existir
          if (text.replace(/\s/g, '').length < 200) {
            const sidecar = path.replace(/\.pdf$/i, '.ocr.txt');
            if (existsSync(sidecar)) text = readFileSync(sidecar, 'utf8');
            else this.semTexto.push(exam);
          }
          this.pages[exam] = text.split('\f').map((raw) => ({ raw, norm: strip(raw) }));
        } catch (e) {
          this.falhas.push(exam);
          console.error(`[pdf] não consegui indexar ${f}: ${String(e.message || e).slice(0, 120)}`);
        }
      }
      this.state = Object.keys(this.pages).length ? 'pronto' : this.falhas.length ? 'erro' : 'sem-pdfs';
    } catch (e) {
      this.state = 'erro';
      this.error = String(e.message || e);
    }
  }

  /** Objetivo (ex.: "103.4") que contém a página. */
  objOfPage(exam, page) {
    for (const [code, o] of Object.entries(this.outline)) {
      if (code.startsWith('_')) continue;
      if (o.exam === exam && page >= o.start && page <= o.end) return code;
    }
    return null;
  }

  search(query, limit = 25) {
    const q = strip(query.trim()).replace(/\s+/g, ' ');
    if (q.length < 2) return [];
    const terms = q.split(' ').filter((t) => t.length > 1);
    const results = [];
    for (const [exam, pages] of Object.entries(this.pages)) {
      pages.forEach((p, idx) => {
        if (!terms.every((t) => p.norm.includes(t))) return;
        let score = 0;
        for (const t of terms) { let n = 0; let from = 0; while (n < 20 && (from = p.norm.indexOf(t, from)) >= 0) { n++; from += t.length; } score += n; }
        const phrase = p.norm.indexOf(q);
        if (terms.length > 1 && phrase >= 0) score += 6;
        const at = phrase >= 0 ? phrase : p.norm.indexOf(terms[0]);
        const src = p.raw.length === p.norm.length ? p.raw : p.norm;
        const from = Math.max(0, at - 90);
        const snippet = src.slice(from, at + 170).replace(/\s+/g, ' ').trim();
        const page = idx + 1;
        const obj = this.objOfPage(exam, page);
        // páginas de exercícios/resumo valem um pouco menos que a explicação
        results.push({ exame: exam, pagina: page, obj, score: score + (obj ? 1 : 0), trecho: snippet });
      });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
