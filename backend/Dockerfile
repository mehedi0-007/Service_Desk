# Production image for the API and its background worker.
FROM node:24-slim AS base
# Prisma's query engine needs OpenSSL.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
USER node
EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
