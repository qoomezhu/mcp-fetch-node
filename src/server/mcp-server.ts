import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express, { Express } from 'express';
import { fetchTool } from '../fetch.tool.js';
import { fetchPrompt } from '../fetch.prompt.js';

export function setupMcpServer(): McpServer {
  const mcp = new McpServer({
    name: 'mcp-fetch-node',
    version: '1.x.x',
  });

  mcp.tool(
    fetchTool.name,
    fetchTool.description,
    fetchTool.parameters,
    fetchTool.execute,
  );

  mcp.prompt(
    fetchPrompt.name,
    fetchPrompt.description,
    fetchPrompt.parameters,
    fetchPrompt.execute,
  );

  return mcp;
}

export function setupExpressServer(mcp: McpServer): Express {
  const app = express();
  const transports = new Map<string, SSEServerTransport>();

  app.get('/sse', async (_req, res) => {
    const transport = new SSEServerTransport(`/messages`, res);

    transports.set(transport.sessionId, transport);

    await mcp.connect(transport);

    res.on('close', () => {
      transport.close().catch((err: unknown) => {
        console.error(err);
      });
      transports.delete(transport.sessionId);
    });
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    const transport = transports.get(sessionId);

    if (!transport) {
      res.status(404).json({ error: 'Transport not found' });
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  return app;
}
