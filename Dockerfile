# ==================================
# 最终优化的 Dockerfile
# ==================================

# ----------------------------------
# 阶段 1: 构建阶段 (Builder Stage)
# ----------------------------------
FROM node:22-alpine AS builder

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest-10 --activate

WORKDIR /app

# 复制依赖描述文件
COPY package.json pnpm-lock.yaml ./

# 安装所有依赖 (包括 devDependencies) 以便构建
RUN pnpm install --frozen-lockfile

# 复制所有源代码 (因为 .dockerignore 中不再忽略 src, 所以 src 会被复制)
COPY . .

# 执行构建命令 (tsc)
RUN pnpm run build

# 清理并只保留生产环境所需的依赖，以减小 node_modules 的体积
RUN pnpm install --prod --frozen-lockfile


# ----------------------------------
# 阶段 2: 运行阶段 (Runner Stage)
# ----------------------------------
FROM node:22-alpine

WORKDIR /app

# 创建一个非 root 用户，增强安全性
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 从构建阶段复制构建产物和精简后的生产依赖
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .

# 设置文件夹权限
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 8080

# 健康检查 (这是您之前有的，保持不变)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/sse', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# 启动命令 (package.json 中 "main": "dist/main.js")
CMD ["node", "dist/main.js"]
