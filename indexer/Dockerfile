# syntax=docker/dockerfile:1.7
FROM node:24.13-alpine
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY --chown=node:node . .
EXPOSE 42069
HEALTHCHECK --interval=5s --timeout=3s --retries=120 CMD wget -qO- http://127.0.0.1:42069/health >/dev/null || exit 1
CMD ["npx", "ponder", "start", "--schema", "ponder_tela", "--views-schema", "tela_read"]
