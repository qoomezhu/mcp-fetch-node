# ============================================
# Builder Stage
# ============================================
FROM node:22-alpine AS builder

# Enable corepack (pnpm will be activated automatically from package.json)
RUN corepack enable

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript
RUN pnpm build

# Clean and install only production dependencies
RUN rm -rf node_modules && pnpm install --frozen-lockfile --prod

# Optional: Install node-prune to further reduce node_modules size
# Requires wget and bash
RUN apk add --no-cache wget bash && \
    wget -qO- https://gobinaries.com/tj/node-prune | sh && \
    node-prune || true

# ============================================
# Runtime Stage
# ============================================
FROM node:22-alpine

# Set NODE_ENV to production
ENV NODE_ENV=production

WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port (can be overridden by PORT environment variable)
EXPOSE 8080

# Start the application
CMD ["node", "dist/main.js"]
