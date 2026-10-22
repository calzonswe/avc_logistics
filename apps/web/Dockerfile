# Web Dockerfile
#
# The build context is the **repository root** (the workspace packages are
# needed for the build): `docker build -f apps/web/Dockerfile .`
FROM node:20-alpine AS base

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# husky is a dev-only tool (git hooks) — it must not run inside the image.
ENV HUSKY=0

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/ui/package.json ./packages/ui/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build
RUN pnpm build:web

# Production stage with Nginx
FROM nginx:alpine AS production

# The build output lives in /app/apps/web/dist (the workspace root is /app).
COPY --from=base /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1/health > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]

# Development stage
FROM base AS development

ENV NODE_ENV=development

EXPOSE 5173

CMD ["pnpm", "dev:web"]
