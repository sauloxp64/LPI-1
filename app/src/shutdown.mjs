// Encerramento gracioso do servidor HTTP (SIGTERM/SIGINT). Fica fora do server.mjs para ser testável sem subir o servidor.

/**
 * Devolve a rotina de encerramento, compartilhada pelos sinais e idempotente (chamadas repetidas devolvem a mesma promessa).
 * Ordem: parar de aceitar conexões -> derrubar os túneis WebSocket do terminal -> esperar as requisições em andamento (até `drainMs`)
 * -> fechar o que sobrar -> fechar o banco -> sair. O banco só fecha depois da drenagem: um PUT que já mandou os cabeçalhos ainda
 * precisa receber o corpo e gravar. Os túneis (sessões de terminal) não são esperados: viveriam até o prazo.
 * - `tunnels`: Set de sockets de túneis (cliente e laboratório); o servidor os mantém atualizado.
 * - `closeDb`/`exit`/`log`: injetáveis para teste. `shutdown.closing()` diz se o encerramento já começou.
 */
export function createShutdown({ server, tunnels = new Set(), closeDb, drainMs = 45_000, exit = (code) => process.exit(code), log = console.log }) {
  let running = null;
  const shutdown = (motivo = 'sinal') => {
    if (running) return running;
    running = new Promise((resolve) => {
      let done = false;
      const killTunnels = () => { for (const s of [...tunnels]) s.destroy(); tunnels.clear(); };
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(deadline); clearInterval(sweep);
        try { closeDb?.(); } catch (e) { log('[web] erro ao fechar o banco:', e?.message ?? e); }
        log('[web] encerrado');
        exit(0);
        resolve();
      };
      // conexões keep-alive ociosas não contam como "em andamento": são fechadas a cada instante até a drenagem terminar
      const sweep = setInterval(() => server.closeIdleConnections(), 100);
      const deadline = setTimeout(() => {
        log(`[web] prazo de ${drainMs / 1000}s esgotado: encerrando as conexões que sobraram`);
        server.closeAllConnections(); killTunnels(); finish();
      }, drainMs);
      log(`[web] ${motivo}: encerrando (até ${drainMs / 1000}s para as requisições em andamento)`);
      server.close(() => finish());
      killTunnels();
      server.closeIdleConnections();
    });
    return running;
  };
  shutdown.closing = () => running !== null;
  return shutdown;
}
