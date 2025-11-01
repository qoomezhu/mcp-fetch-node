# Fetch MCP Server

A port of the official [Fetch MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch) for Node.js. Please check the [key differences with original project](#key-differences-with-the-original-project) section for more details.

## Description

A [Model Context Protocol](https://modelcontextprotocol.io/) server that provides web content fetching capabilities. This server enables LLMs to retrieve and process content from web pages, converting HTML to markdown for easier consumption.

The fetch tool will truncate the response, but by using the `start_index` argument, you can specify where to start the content extraction. This lets models read a webpage in chunks, until they find the information they need.

### Available Tools

- `fetch` - Fetches a URL from the internet and extracts its contents as markdown.
  - `url` (string, required): URL to fetch
  - `max_length` (integer, optional): Maximum number of characters to return (default: 5000)
  - `start_index` (integer, optional): Start content from this character index (default: 0)
  - `raw` (boolean, optional): Get raw content without markdown conversion (default: false)

### Available Prompts

- `fetch` - Fetch a URL and extract its contents as markdown
  - `url` (string, required): URL to fetch

## Usage

`mcp-fetch-node` exposes an SSE endpoint at `/sse` on port 8080 by default.

Node.js:

```bash
npx -y mcp-fetch-node
```

Docker:

```bash
docker run -it tgambet/mcp-fetch-node
```

### Customization - robots.txt

By default, the server will obey a websites robots.txt file if the request came from the model (via a tool), but not if the request was user initiated (via a prompt). This can be disabled by adding the argument `--ignore-robots-txt` to the run command.

### Customization - User-agent

By default, depending on if the request came from the model (via a tool), or was user initiated (via a prompt), the server will use either the user-agent

```
# Tool call
ModelContextProtocol/1.0 (Autonomous; +https://github.com/tgambet/mcp-fetch-node)

# Prompt
ModelContextProtocol/1.0 (User-Specified; +https://github.com/tgambet/mcp-fetch-node)
```

This can be customized by adding the argument `--user-agent=YourUserAgent` to the run command, which will override both.

### Customization - Performance

The server supports configurable concurrency and connection pooling for optimal performance:

```bash
# Request queue settings
--concurrency 10              # Max concurrent requests (default: 10)
--queue-timeout 30000         # Request timeout in ms (optional)
--rate-limit 100              # Max requests per interval (optional)
--rate-interval 60000         # Rate limit window in ms (optional)

# Connection pool settings
--pool-connections 100        # Max connections in pool (default: 100)
--pool-pipelining 1           # HTTP pipelining level (default: 1)
--pool-keepalive-timeout 4000 # Keep-alive timeout in ms (default: 4000)
```

For example, to run with 20 concurrent requests and a larger connection pool:

```bash
npx -y mcp-fetch-node --concurrency 20 --pool-connections 100
```

For more details on performance optimization and benchmarks, see [PERFORMANCE.md](./PERFORMANCE.md).

### Customization - Resilience

The server implements robust error handling with retry strategies and circuit breaker patterns:

```bash
# Request timeout
--request-timeout 30000            # Request timeout in ms (default: 30000)

# Retry configuration
--retry-max-attempts 3             # Max retry attempts (default: 3)
--retry-initial-delay 1000         # Initial retry delay in ms (default: 1000)
--retry-max-delay 10000            # Maximum retry delay in ms (default: 10000)

# Circuit breaker configuration
--circuit-breaker-threshold 5      # Failures before opening circuit (default: 5)
--circuit-breaker-cooldown 60000   # Cooldown period in ms (default: 60000)
```

For example, to run with aggressive retry and tolerance settings:

```bash
npx -y mcp-fetch-node \
  --retry-max-attempts 5 \
  --circuit-breaker-threshold 10 \
  --request-timeout 60000
```

For more details on resilience features, see [RESILIENCE.md](./RESILIENCE.md).

## Key differences with the original project

- This implementation is written in TypeScript and targets the Node.js runtime.
  It is suited for situations where python is not available.

- This implementation provides an SSE interface instead of stdio.
  It is more suitable for deployment as a web service, increasing flexibility.

- This implementation does not rely on Readability.js library for content extraction.
  It uses a custom implementation that is more generic and suited for websites other that news-related ones.

The api and tool description is, however, the same as the original project so you can try `mcp-fetch-node` as a drop-in replacement for the original project.

Please report any issue to the [issue tracker](https://github.com/tgambet/mcp-fetch-node/issues).

## Features

- Fetch and extract relevant content from a URL
- Respect `robots.txt` (can be disabled)
- User-Agent customization
- Configurable request queue with concurrency and rate limiting
- Shared HTTP connection pool powered by Undici
- **Robust error handling and retry mechanisms**
  - Intelligent error classification (timeouts, DNS, 4xx, 5xx, etc.)
  - Exponential backoff with jitter
  - Circuit breaker pattern per domain
  - Configurable request timeouts
- Markdown conversion
- Pagination
- Built-in performance benchmarks (see [PERFORMANCE.md](./PERFORMANCE.md))

## Development

```bash
pnpm install
pnpm dev
pnpm lint:fix
pnpm format
pnpm test
pnpm build
pnpm start
pnpm inspect
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT](https://choosealicense.com/licenses/mit/)

## TODO

- [ ] Add user logs and progress
- [x] Add documentation & examples
- [x] Performance benchmarks and improvements
- [ ] Benchmarks for extraction quality: cf https://github.com/adbar/trafilatura/blob/master/tests/comparison_small.py
