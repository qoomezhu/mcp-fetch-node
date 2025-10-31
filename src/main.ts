#!/usr/bin/env node

import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import { loadConfig } from './config/service.js';
import { setupMcpServer, setupExpressServer } from './server/mcp-server.js';

const config = loadConfig();

const mcp = setupMcpServer();
const app = setupExpressServer(mcp);

const server = app.listen(config.port);

console.log(`Server is running on port ${config.port.toString()}`);

const readline = createInterface({ input, output });

await readline.question('Press enter to exit...\n');

readline.close();

server.closeAllConnections();

await promisify(server.close.bind(server))();

await mcp.close();
