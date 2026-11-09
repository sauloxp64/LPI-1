// Envio de arquivo por stream com tratamento de erro. Fica fora do server.mjs para ser testável sem subir o servidor.
import { createReadStream } from 'node:fs';

/**
 * Envia `file` (ou só o intervalo `range` = {start, end}) pela resposta `res`.
 * - O 'error' do ReadStream chega depois do statSync e fora do try/catch do handler HTTP: sem listener ele derrubaria o processo.
 * - `head()` grava status e cabeçalhos e só é chamada depois que o arquivo abriu. Se a abertura falhar (arquivo removido
 *   depois do statSync, permissão, E/S), ainda dá para responder um erro limpo com `fail(err)` (por padrão, 500 vazio).
 * - Erro depois de a resposta começar: o status já foi, então a resposta é destruída (o cliente vê a conexão cair).
 * - Cliente que desconecta: o stream é destruído (senão o descritor do arquivo vazaria).
 * `open` existe só para os testes injetarem um stream que falha.
 */
export function pipeFile(res, file, { range, head, fail, open = createReadStream } = {}) {
  let started = false; let failed = false;
  const rs = open(file, range);
  const abort = (err) => {
    rs.destroy();
    if (failed) return; // erros repetidos não podem responder duas vezes
    failed = true;
    if (started || res.headersSent) { res.destroy(); return; }
    if (fail) fail(err);
    else { res.statusCode = 500; res.end(); }
  };
  rs.on('error', abort);
  res.once('close', () => rs.destroy());
  rs.once('open', () => {
    if (res.destroyed || res.writableEnded) return rs.destroy();
    try { head?.(); } catch (e) { return abort(e); }
    started = true;
    rs.pipe(res);
  });
}
