# Built with repo root as build context (see fly.toml) since the API depends
# on the root-level database/schema.prisma for `prisma generate`.
FROM node:20-slim AS base
WORKDIR /app
# Prisma's query engine needs libssl at runtime; node:20-slim doesn't ship it.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY database database
RUN pnpm install --filter @promise-war/api... --frozen-lockfile || pnpm install --filter @promise-war/api...

FROM deps AS build
COPY apps/api apps/api
# Prisma's CLI/client auto-detection needs pnpm's hoisted node_modules
# layout to resolve correctly inside a workspace (see root .npmrc's comment
# for the full explanation) — without it `prisma generate` fails trying to
# self-heal a version mismatch it can't actually find.
RUN pnpm --filter @promise-war/api build

FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/database /app/database

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
