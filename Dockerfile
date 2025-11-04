# 优化的 Dockerfile，适配 ClawCloud Run
# 第一阶段：构建阶段
FROM node:22-alpine AS builder
# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest-10 --activate
# 设置工作目录
WORKDIR /app
# 复制依赖文件
COPY package.json pnpm-lock.yaml ./
# 安装依赖
RUN pnpm install --frozen-lockfile
# 复制源代码
COPY . .
# 构建应用程序
RUN pnpm run build  # 或者您的构建命令
# 第二阶段：运行阶段
FROM node:22-alpine
# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest-10 --activate
# 设置工作目录
WORKDIR /app
# 从构建阶段复制构建后的文件
COPY --from=builder /app/dist .
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .
COPY --from=builder /app/pnpm-lock.yaml .
# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
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
