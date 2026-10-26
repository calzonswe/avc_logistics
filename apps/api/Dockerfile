# API Dockerfile
#
# The build context is the **repository root** (the workspace packages are
# needed for the build): `docker build -f apps/api/Dockerfile .`
FROM node:20-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++ postgresql-client

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# husky is a dev-only tool (git hooks) — it must not run inside the image.
ENV HUSKY=0

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/db/package.json ./packages/db/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build
RUN pnpm build:api

# Production stage
FROM node:20-alpine AS production

RUN apk add --no-cache postgresql-client

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

ENV HUSKY=0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/db/package.json ./packages/db/

# The root "prepare" script installs the git hooks (husky) — a dev-only tool
# that is not part of a production install.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));delete p.scripts.prepare;fs.writeFileSync('package.json',JSON.stringify(p,null,2))"

RUN pnpm install --frozen-lockfile --prod

# The compiled API + the packages it loads at runtime.
# @avc/shared-types is consumed from its build output; @avc/db has no build
# step (it is imported from source).
COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=base /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=base /app/packages/db/src ./packages/db/src
COPY --from=base /app/packages/db/package.json ./packages/db/package.json
# Source needed for seed/migrate scripts at runtime
COPY --from=base /app/apps/api/src ./apps/api/src
COPY --from=base /app/apps/api/tsconfig.json ./apps/api/tsconfig.json

# The uploads (map images, photos) live on a volume in production.
RUN mkdir -p /app/apps/api/uploads/maps

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV UPLOAD_DIR=./uploads

EXPOSE 3000

# Copy the entrypoint script that runs migrations, seeds, then starts the API
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
RUN chmod +x ./apps/api/docker-entrypoint.sh

# The compose file uses this health check for the startup order.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["/app/apps/api/docker-entrypoint.sh"]

# Development stage
FROM base AS development

ENV NODE_ENV=development

EXPOSE 3000

CMD ["pnpm", "dev:api"]
