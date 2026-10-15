# Multi-stage build: TypeScript Node.js API server + React frontend
FROM node:24-alpine AS node-builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./
COPY lib ./lib
COPY artifacts ./artifacts

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm run build

# Build React frontend (ascili)
RUN pnpm --filter @workspace/ascili run build

# Final runtime stage
FROM node:24-alpine

WORKDIR /app

# Install dumb-init
RUN apk add --no-cache dumb-init

# Copy built artifacts from builder
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/pnpm-lock.yaml ./
COPY --from=node-builder /app/artifacts/api-server/dist ./api-server/dist
COPY --from=node-builder /app/artifacts/api-server/package.json ./api-server/package.json
COPY --from=node-builder /app/artifacts/ascili/dist/public ./public

# Copy startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

ENTRYPOINT ["/sbin/dumb-init", "--"]
CMD ["/docker-entrypoint.sh"]
