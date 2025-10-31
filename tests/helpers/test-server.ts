import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

export type TestServerHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void;

export async function createTestServer(
  handler: TestServerHandler = (_req, res) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/plain');
    res.end('ok');
  },
): Promise<TestServer> {
  const server = http.createServer(handler);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
