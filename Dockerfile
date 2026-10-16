FROM node:22-alpine

LABEL org.opencontainers.image.title="net-portfolios" \
      org.opencontainers.image.description="Dark, glassmorphism photography portfolio. One site per container, configured entirely by environment variables." \
      org.opencontainers.image.source="https://github.com/Tobechukwu-Njoku/net-portfolios" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.html style.css app.js server.js mailer.js defaults.json ./

# Photos and an optional content.js override are mounted here. No VOLUME on
# purpose: an unmounted path should not silently become an anonymous volume.
ENV PORT=8080 \
    PHOTOS_DIR=/photos \
    CONFIG_DIR=/config \
    CACHE_DIR=/app/.cache
RUN mkdir -p /photos /config /app/.cache

EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=15s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1

CMD ["node", "server.js"]
