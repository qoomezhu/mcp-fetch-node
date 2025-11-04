# 优化的 Dockerfile，适配 ClawCloud Run

# ==================================
# 第一阶段：构建阶段 (Builder Stage)
# ==================================
FROM node:22-alpine AS builder

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest-10 --activate

WORKDIR /app

# 复制依赖描述文件
COPY package.json pnpm-lock.yaml ./

# 安装所有依赖，包括 devDependencies，用于构建
RUN pnpm install --frozen-lockfile

# 复制所有源代码
COPY . .

# 执行构建命令 (tsc)
RUN pnpm run build

# (可选) 为了优化最终镜像大小，可以只为生产依赖重新运行install
RUN pnpm install --prod --frozen-lockfile


# ==================================
# 第二阶段：运行阶段 (Runner Stage)
# ==================================
FROM node:22-alpine

WORKDIR /app

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 从构建阶段复制构建产物和生产依赖
# 这样可以避免在最终镜像中包含 devDependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .

# 设置用户权限
RUN chown -R nodejs:nodejs /app
USER nodejs

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/sse', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# 启动命令
CMD ["node", "main.js"]
