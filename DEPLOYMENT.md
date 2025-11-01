# Docker Deployment Guide

This guide provides comprehensive instructions for deploying the MCP Fetch Node server using Docker, with specific guidance for clawcloud run deployment.

## Table of Contents

- [Quick Start](#quick-start)
- [Building the Docker Image](#building-the-docker-image)
- [Running the Container](#running-the-container)
- [Environment Variables Reference](#environment-variables-reference)
- [Clawcloud Run Deployment](#clawcloud-run-deployment)
- [Docker Compose](#docker-compose)
- [Image Optimization](#image-optimization)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Using Docker Hub Image

```bash
docker pull tgambet/mcp-fetch-node:latest
docker run -d -p 8080:8080 tgambet/mcp-fetch-node:latest
```

### Building from Source

```bash
# Build the image
docker build -t mcp-fetch-node:latest .

# Run the container
docker run -d -p 8080:8080 mcp-fetch-node:latest
```

The server will be available at `http://localhost:8080/sse`

## Building the Docker Image

### Standard Build

```bash
docker build -t mcp-fetch-node:latest .
```

### Build with Custom Tag

```bash
docker build -t mcp-fetch-node:v1.0.0 .
```

### Build Arguments and Optimization

The Dockerfile uses a multi-stage build process:

1. **Builder Stage**: Installs dependencies, compiles TypeScript, and optimizes node_modules
2. **Runtime Stage**: Creates minimal production image with only necessary files

### Verify Image Size

```bash
docker images mcp-fetch-node
```

**Expected size**: < 200MB

The optimized build includes:
- Multi-stage build with node:22-alpine base
- Production-only dependencies
- node-prune optimization to remove unnecessary files
- Minimal runtime layer

## Running the Container

### Basic Run

```bash
docker run -d \
  --name mcp-fetch \
  -p 8080:8080 \
  mcp-fetch-node:latest
```

### Run with Custom Port

```bash
docker run -d \
  --name mcp-fetch \
  -p 3000:3000 \
  -e PORT=3000 \
  mcp-fetch-node:latest
```

### Run with Custom Configuration

```bash
docker run -d \
  --name mcp-fetch \
  -p 8080:8080 \
  -e PORT=8080 \
  -e CONCURRENCY=20 \
  -e POOL_CONNECTIONS=200 \
  mcp-fetch-node:latest
```

### Interactive Mode (for Testing)

```bash
docker run -it --rm \
  -p 8080:8080 \
  mcp-fetch-node:latest
```

## Environment Variables Reference

The server supports the following environment variables:

### Runtime Mode

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `NODE_ENV` | Runtime environment | - | `NODE_ENV=production` |
| `DOCKER_CONTAINER` | Force container mode | - | `DOCKER_CONTAINER=true` |

**Note**: When `NODE_ENV=production` or `DOCKER_CONTAINER=true`, the server runs in container mode (no interactive prompt, responds to SIGTERM/SIGINT for graceful shutdown). Otherwise, it runs in interactive mode with a "Press enter to exit" prompt. The Dockerfile automatically sets `NODE_ENV=production`.

### Port Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PORT` | Server listen port | `8080` | `PORT=3000` |

**Note**: The `PORT` environment variable takes precedence over the `--port` CLI argument, making it ideal for cloud deployments.

### User-Agent Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `USER_AGENT` | Custom user-agent string | Auto-generated | `USER_AGENT=MyBot/1.0` |

Can also be set via CLI argument: `--user-agent=MyBot/1.0`

### Robots.txt Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `IGNORE_ROBOTS_TXT` | Skip robots.txt checks | `false` | `IGNORE_ROBOTS_TXT=true` |

Can also be set via CLI argument: `--ignore-robots-txt`

### Performance Tuning

#### Request Queue Settings

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `CONCURRENCY` | Max concurrent requests | `10` | `CONCURRENCY=20` |
| `QUEUE_TIMEOUT` | Request timeout (ms) | - | `QUEUE_TIMEOUT=30000` |
| `RATE_LIMIT` | Max requests per interval | - | `RATE_LIMIT=100` |
| `RATE_INTERVAL` | Rate limit window (ms) | - | `RATE_INTERVAL=60000` |

#### Connection Pool Settings

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `POOL_CONNECTIONS` | Max pool connections | `100` | `POOL_CONNECTIONS=200` |
| `POOL_PIPELINING` | HTTP pipelining level | `1` | `POOL_PIPELINING=10` |
| `POOL_KEEPALIVE_TIMEOUT` | Keep-alive timeout (ms) | `4000` | `POOL_KEEPALIVE_TIMEOUT=5000` |
| `POOL_KEEPALIVE_MAX_TIMEOUT` | Max keep-alive (ms) | `600000` | - |
| `POOL_CONNECT_TIMEOUT` | Connection timeout (ms) | `10000` | `POOL_CONNECT_TIMEOUT=5000` |
| `POOL_BODY_TIMEOUT` | Body read timeout (ms) | `300000` | - |
| `POOL_HEADERS_TIMEOUT` | Headers timeout (ms) | `300000` | - |

**Note**: Environment variables are passed as-is to the CLI argument parser, which converts them to kebab-case internally.

### Example: High-Performance Configuration

```bash
docker run -d \
  --name mcp-fetch \
  -p 8080:8080 \
  -e PORT=8080 \
  -e CONCURRENCY=50 \
  -e POOL_CONNECTIONS=300 \
  -e POOL_PIPELINING=10 \
  -e POOL_KEEPALIVE_TIMEOUT=10000 \
  mcp-fetch-node:latest
```

## Clawcloud Run Deployment

Clawcloud Run automatically manages container orchestration and dynamic port binding. Follow these steps:

### Prerequisites

1. Install the clawcloud CLI
2. Authenticate: `clawcloud auth login`
3. Have your Docker image ready (built locally or pushed to a registry)

### Step 1: Prepare Your Image

#### Option A: Use Docker Hub Image

```bash
docker pull tgambet/mcp-fetch-node:latest
docker tag tgambet/mcp-fetch-node:latest mcp-fetch-node:latest
```

#### Option B: Build Locally

```bash
docker build -t mcp-fetch-node:latest .
```

### Step 2: Deploy to Clawcloud Run

```bash
clawcloud run deploy \
  --image mcp-fetch-node:latest \
  --name mcp-fetch \
  --platform managed \
  --allow-unauthenticated
```

**Important**: Do NOT specify `--port` in the deployment command. Clawcloud Run will automatically set the `PORT` environment variable, and the application will bind to it.

### Step 3: Verify Deployment

```bash
# Get the service URL
clawcloud run services describe mcp-fetch --format='value(status.url)'

# Test the endpoint
curl https://YOUR-SERVICE-URL/sse
```

### Step 4: Configure Environment Variables (Optional)

```bash
clawcloud run deploy \
  --image mcp-fetch-node:latest \
  --name mcp-fetch \
  --set-env-vars CONCURRENCY=20,POOL_CONNECTIONS=200 \
  --platform managed \
  --allow-unauthenticated
```

### Clawcloud Run Best Practices

1. **Port Binding**: Always rely on the `PORT` environment variable. Never hardcode ports.

2. **Memory Limits**: Set appropriate memory limits based on your workload:
   ```bash
   clawcloud run deploy --image mcp-fetch-node:latest --memory 512Mi
   ```

3. **CPU Allocation**: Adjust CPU allocation for performance:
   ```bash
   clawcloud run deploy --image mcp-fetch-node:latest --cpu 2
   ```

4. **Concurrency**: Configure maximum concurrent requests per container:
   ```bash
   clawcloud run deploy --image mcp-fetch-node:latest --concurrency 80
   ```

5. **Scaling**: Configure autoscaling parameters:
   ```bash
   clawcloud run deploy \
     --image mcp-fetch-node:latest \
     --min-instances 1 \
     --max-instances 10
   ```

### Example: Production Clawcloud Run Deployment

```bash
clawcloud run deploy \
  --image mcp-fetch-node:latest \
  --name mcp-fetch-prod \
  --platform managed \
  --region us-central1 \
  --memory 1Gi \
  --cpu 2 \
  --min-instances 2 \
  --max-instances 20 \
  --concurrency 100 \
  --set-env-vars CONCURRENCY=50,POOL_CONNECTIONS=300 \
  --allow-unauthenticated
```

## Docker Compose

For local development and testing, use Docker Compose:

### Standard Production Setup

```bash
docker-compose up -d
```

This starts the production container on port 8080.

### Development Setup with Hot-Reload

```bash
docker-compose --profile dev up -d mcp-fetch-dev
```

This starts the development container with volume mounts and auto-reload on port 8081.

### Custom Port Configuration

```bash
PORT=3000 docker-compose up -d
```

### Environment File

Create a `.env` file for persistent configuration:

```bash
# .env
PORT=8080
CONCURRENCY=20
POOL_CONNECTIONS=200
USER_AGENT=MyBot/1.0
```

Then run:

```bash
docker-compose up -d
```

### Useful Docker Compose Commands

```bash
# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# View service status
docker-compose ps
```

## Image Optimization

The Docker image is optimized for size and performance:

### Optimization Techniques

1. **Multi-Stage Build**
   - Separates build dependencies from runtime
   - Reduces final image size significantly

2. **Alpine Linux Base**
   - Uses `node:22-alpine` (minimal Linux distribution)
   - Significantly smaller than standard node images

3. **Production Dependencies Only**
   - Runtime stage includes only production dependencies
   - DevDependencies excluded from final image

4. **node-prune Optimization**
   - Removes unnecessary files from node_modules
   - Eliminates markdown, docs, tests, and source maps

5. **Layer Caching**
   - Dockerfile organized for optimal layer caching
   - Dependencies installed before source code copy

### Measured Image Sizes

```bash
docker images mcp-fetch-node
```

Expected output:
```
REPOSITORY       TAG       IMAGE ID       CREATED         SIZE
mcp-fetch-node   latest    <image_id>     X minutes ago   ~150-180MB
```

### Further Optimization (Advanced)

For even smaller images, consider:

1. **Distroless Base Image**
   ```dockerfile
   FROM gcr.io/distroless/nodejs22:latest
   ```
   Note: This removes shell access and requires adjustments to COPY and CMD.

2. **Remove Source Maps**
   In `tsconfig.json`, set `"sourceMap": false`

3. **Minimize Dependencies**
   Review and remove unused npm packages

## Troubleshooting

### Container Won't Start

**Problem**: Container exits immediately

**Solution**:
1. Check logs: `docker logs mcp-fetch`
2. Run interactively: `docker run -it --rm mcp-fetch-node:latest`
3. Verify PORT environment variable is valid

### Port Already in Use

**Problem**: `Error: listen EADDRINUSE: address already in use`

**Solution**:
```bash
# Use a different host port
docker run -d -p 8081:8080 mcp-fetch-node:latest

# Or kill the process using the port
lsof -ti:8080 | xargs kill -9
```

### Connection Refused

**Problem**: Cannot connect to `http://localhost:8080`

**Solution**:
1. Verify container is running: `docker ps`
2. Check port mapping: `docker port mcp-fetch`
3. Check firewall rules
4. Test from inside container:
   ```bash
   docker exec -it mcp-fetch sh
   wget -qO- http://localhost:8080/sse
   ```

### Image Too Large

**Problem**: Docker image exceeds 200MB

**Solution**:
1. Verify multi-stage build is being used
2. Ensure production-only dependencies: `pnpm install --prod`
3. Check node-prune is running successfully
4. Review installed packages for unnecessary dependencies

### Memory Issues

**Problem**: Container crashes with out-of-memory errors

**Solution**:
```bash
# Increase memory limit
docker run -d --memory 1g -p 8080:8080 mcp-fetch-node:latest

# Adjust Node.js heap size
docker run -d \
  -e NODE_OPTIONS="--max-old-space-size=768" \
  -p 8080:8080 \
  mcp-fetch-node:latest
```

### Clawcloud Run Specific Issues

**Problem**: Service fails to start on Clawcloud Run

**Solution**:
1. Verify PORT environment variable is being used
2. Check deployment logs: `clawcloud run logs read --service mcp-fetch`
3. Ensure container starts within 240 seconds
4. Verify no hardcoded ports in application code

**Problem**: "Container failed to start. Failed to start and then listen on the port defined by the PORT environment variable."

**Solution**:
This means the container is not listening on the port specified by PORT. Verify:
1. Application reads `process.env.PORT`
2. No timeout/delay in server startup
3. Server binds to `0.0.0.0`, not `localhost`

## Quick Reference

### Common Docker Commands

```bash
# Build image
docker build -t mcp-fetch-node:latest .

# Run container
docker run -d -p 8080:8080 --name mcp-fetch mcp-fetch-node:latest

# View logs
docker logs -f mcp-fetch

# Stop container
docker stop mcp-fetch

# Remove container
docker rm mcp-fetch

# Remove image
docker rmi mcp-fetch-node:latest

# Check image size
docker images mcp-fetch-node

# Inspect container
docker inspect mcp-fetch

# Execute command in running container
docker exec -it mcp-fetch sh
```

### Common Docker Compose Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# Start development service
docker-compose --profile dev up -d mcp-fetch-dev
```

### Common Clawcloud Run Commands

```bash
# Deploy service
clawcloud run deploy --image mcp-fetch-node:latest --name mcp-fetch

# View service details
clawcloud run services describe mcp-fetch

# View logs
clawcloud run logs read --service mcp-fetch

# Update environment variables
clawcloud run services update mcp-fetch --set-env-vars KEY=VALUE

# Delete service
clawcloud run services delete mcp-fetch
```

## Additional Resources

- [MCP Fetch Node README](./README.md)
- [Performance Guide](./PERFORMANCE.md)
- [Docker Documentation](https://docs.docker.com/)
- [Clawcloud Run Documentation](https://cloud.google.com/run/docs)
- [Docker Build Notes](./.docker-build-notes.md)

## Support

For issues or questions:
- GitHub Issues: https://github.com/tgambet/mcp-fetch-node/issues
- Docker Hub: https://hub.docker.com/r/tgambet/mcp-fetch-node
