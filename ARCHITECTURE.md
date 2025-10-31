# Architecture Overview

This project implements a Model Context Protocol (MCP) server with a modular architecture designed for extensibility and configurability.

## Module Layout

The source is organised into dedicated domains:

- `src/core/` — fundamental building blocks (fetching, parsing, converting, caching, plugin contracts, robots.txt guard, pagination).
- `src/config/` — configuration schema and loading service with support for multiple sources.
- `src/infrastructure/` — low-level helpers such as CLI parsing and configuration file handling.
- `src/processors/` — pluggable content processors (e.g. HTML → Markdown pipeline).
- `src/pipelines/` — orchestrated workflows assembled from core components (URL processing pipeline).
- `src/server/` — Express + MCP wiring and server bootstrap logic.
- `src/utils/` — backwards-compatible shims that expose historical helper APIs while delegating to the new core modules.

## Processing Pipeline

1. **Fetcher** downloads content while honouring the configured user agent.
2. **Robots checker** ensures automatic fetching obeys `robots.txt` rules (unless disabled).
3. **Plugin registry** selects a processor based on the response MIME type or custom logic.
4. **Processors** transform the payload (e.g. HTML sanitisation + Markdown conversion).
5. **Paginator** paginates the processed output for the MCP tool response.
6. Results are cached for repeated requests with the same URL, user agent, and mode.

## Plugin System

Content processors implement the `ContentProcessor` contract defined in `src/core/plugin.ts`:

```ts
interface ContentProcessor {
  name: string;
  supportedMimeTypes?: string[];
  canProcess?(context: ProcessorContext): boolean;
  process(context: ProcessorContext): Promise<ProcessorResult> | ProcessorResult;
}
```

Processors can opt into MIME-type matching or custom heuristics via `canProcess`. The project registers an `HtmlProcessor` plugin by default, which sanitises HTML and converts it to Markdown. Custom processors can be registered at runtime through the shared registry before invoking the URL pipeline.

## Configuration Loading

Configuration is resolved in the following order (lowest to highest priority):

1. Built-in defaults (`port = 8080`, cache size, etc.).
2. `config.json` / `config.yaml` / `config.yml` in the project root.
3. Environment variables (`MCP_FETCH_PORT`, `MCP_FETCH_USER_AGENT`, `MCP_FETCH_IGNORE_ROBOTS_TXT`, `MCP_FETCH_CACHE_MAX_SIZE`).
4. CLI arguments (`--port`, `--user-agent`, `--ignore-robots-txt`, `--cache-max-size`).

All configuration is validated with Zod and exposed through `loadConfig` / `getConfig` utilities (`src/config/service.ts`).

## Compatibility Layer

Legacy imports under `src/utils/` forward to the new implementation to keep the public surface area backwards compatible with previous releases.
