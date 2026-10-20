# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev && npx prisma generate

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev && npx prisma generate

FROM dependencies AS build
COPY . .
# Build placeholders are scoped to this instruction. Real credentials are only
# supplied at container startup; the build does not require a running database.
RUN NODE_ENV=production DEPLOY_ENVIRONMENT=local \
    PUBLIC_ORIGIN=http://localhost:8001 \
    DATABASE_URL=mysql://build:build@127.0.0.1:3306/build \
    SESSION_SECRET=build-only-placeholder-never-use-at-runtime \
    MEDIA_STORAGE_DIR=/tmp/build-media npm run build

FROM base AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=8001 HOST=0.0.0.0
# Keep the locked tsx/Prisma toolchain: cron executes TypeScript and the migrate
# job uses the same image/schema as web, without downloading tools on startup.
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/.runtime-workers ./.runtime-workers
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/data ./data
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/docker ./docker
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/tsconfig.json /app/next.config.js ./
RUN mkdir -p data/media/avatars public/heroes/images public/heroes/skins \
    && chown node:node data/media data/media/avatars public/heroes public/heroes/images public/heroes/skins
USER node
EXPOSE 8001
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
CMD ["web"]
