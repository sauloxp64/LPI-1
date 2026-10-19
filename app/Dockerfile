# Área de estudos LPIC-1 — servidor Node 24 (sem dependências npm) + poppler (busca nos PDFs).
FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY data ./data
COPY tools ./tools
COPY content ./content

ENV NODE_ENV=production \
    PORT=8088 \
    DB_PATH=/data/estudos.db \
    MATERIALS_DIR=/materiais \
    CHALLENGES_DIR=/lab/challenges \
    TZ=America/Sao_Paulo

RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8088
HEALTHCHECK --interval=20s --timeout=4s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8088/api/lab/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.mjs"]
