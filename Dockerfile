FROM node:24-alpine

LABEL org.opencontainers.image.source="https://github.com/rassi0429/misskey-markov-chein"
LABEL org.opencontainers.image.description="Generate text from public Misskey notes with a Markov chain"

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3210

COPY --chown=node:node package.json config.mjs server.mjs markov.mjs remote.mjs ./
COPY --chown=node:node public ./public

USER node
EXPOSE 3210
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.mjs"]
