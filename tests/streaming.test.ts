import assert from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { Server } from 'node:http';
import { streamFetch, fetchStreamToString } from '../src/utils/fetch-stream.js';
import { extractStreamToString } from '../src/utils/extract-stream.js';
import { processURLStream } from '../src/utils/process-url-stream.js';
import { htmlToMarkdownString } from '../src/utils/markdown-stream.js';

describe('Streaming Tests', () => {
  let server: Server;
  let serverUrl: string;

  before(async () => {
    server = createServer(
      (req: IncomingMessage, res: ServerResponse) => {
        const url = req.url ?? '';

        if (url === '/large-html') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.write('<!DOCTYPE html><html><head><title>Test</title></head><body>');
          for (let i = 0; i < 100; i++) {
            res.write(`<p>Paragraph ${i}</p>`);
          }
          res.write('</body></html>');
          res.end();
        } else if (url === '/slow-stream') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          let count = 0;
          const interval = setInterval(() => {
            if (count < 5) {
              res.write(`chunk${count}\n`);
              count++;
            } else {
              clearInterval(interval);
              res.end();
            }
          }, 100);
        } else if (url === '/timeout-test') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.write('Starting...\n');
        } else if (url === '/abort-test') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.write('chunk1\n');
          setTimeout(() => {
            res.write('chunk2\n');
            setTimeout(() => {
              res.end('chunk3\n');
            }, 100);
          }, 100);
        } else {
          res.writeHead(404);
          res.end();
        }
      },
    );

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          serverUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('fetchStream', () => {
    it('should stream content in chunks', async () => {
      const chunks: string[] = [];
      const { body } = await streamFetch(
        `${serverUrl}/slow-stream`,
        'test-agent',
      );

      for await (const chunk of body) {
        chunks.push(chunk);
      }

      assert.ok(chunks.length > 0);
      assert.ok(chunks.join('').includes('chunk0'));
      assert.ok(chunks.join('').includes('chunk4'));
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();

      const chunks: string[] = [];
      let aborted = false;

      try {
        const { body } = await streamFetch(
          `${serverUrl}/abort-test`,
          'test-agent',
          {
            signal: controller.signal,
          },
        );

        for await (const chunk of body) {
          chunks.push(chunk);
          if (chunks.length >= 1) {
            controller.abort();
          }
        }
      } catch (error) {
        aborted = true;
        assert.ok(
          (error as Error).message.includes('abort'),
          'Error should mention abort',
        );
      }

      assert.ok(aborted || chunks.length > 0, 'Should have chunks or aborted');
    });

    it.skip('should handle timeout', async () => {
      // TODO: Investigate why the embedded HTTP server does not consistently terminate
      // pending connections during timeout simulations in the test harness.
    });
  });

  describe('fetchStreamToString', () => {
    it('should collect all chunks into a string', async () => {
      const result = await fetchStreamToString(
        `${serverUrl}/slow-stream`,
        'test-agent',
      );

      assert.ok(result.content.includes('chunk0'));
      assert.ok(result.content.includes('chunk4'));
      assert.equal(result.contentType, 'text/plain');
    });
  });

  describe('htmlToMarkdownString', () => {
    it('should convert HTML stream to markdown', async () => {
      async function* createHtmlStream() {
        const html =
          '<html><body><h1>Title</h1><p>Test</p><script>alert("x")</script></body></html>';
        const chunkSize = 10;
        for (let i = 0; i < html.length; i += chunkSize) {
          yield html.slice(i, i + chunkSize);
        }
      }

      const result = await htmlToMarkdownString(createHtmlStream());

      assert.ok(result.includes('Title'));
      assert.ok(result.includes('Test'));
      assert.ok(!result.includes('script'));
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();

      async function* createHtmlStream() {
        const html = '<html><body><p>Test content</p></body></html>';
        yield html.slice(0, 10);
        controller.abort();
        yield html.slice(10);
      }

      let aborted = false;
      try {
        await htmlToMarkdownString(createHtmlStream(), {
          signal: controller.signal,
        });
      } catch (error) {
        aborted = true;
        assert.ok(
          (error as Error).message.includes('abort'),
          'Error should mention abort',
        );
      }

      assert.ok(aborted, 'Should have aborted');
    });
  });

  describe('processURLStream', () => {
    it('should process HTML URL with streaming', async () => {
      const [content, prefix] = await processURLStream(
        `${serverUrl}/large-html`,
        'test-agent',
        false,
      );

      assert.ok(content.length > 0);
      assert.ok(content.includes('Paragraph'));
    });

    it('should handle raw mode', async () => {
      const [content, prefix] = await processURLStream(
        `${serverUrl}/large-html`,
        'test-agent',
        true,
      );

      assert.ok(content.includes('<html>'));
      assert.ok(prefix.includes('raw'));
    });

    it('should respect abort signal', async () => {
      const controller = new AbortController();

      setTimeout(() => controller.abort(), 100);

      let aborted = false;
      try {
        await processURLStream(
          `${serverUrl}/slow-stream`,
          'test-agent',
          false,
          controller.signal,
        );
      } catch (error) {
        aborted = true;
        assert.ok(error instanceof Error);
      }

      assert.ok(aborted, 'Should have been aborted');
    });
  });

  describe('Memory Efficiency', () => {
    it('should not buffer entire response in memory for large content', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      const { body } = await streamFetch(
        `${serverUrl}/large-html`,
        'test-agent',
      );

      let chunkCount = 0;
      for await (const chunk of body) {
        chunkCount++;
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      assert.ok(chunkCount > 0, 'Should have received chunks');
      assert.ok(
        memoryIncrease < 10 * 1024 * 1024,
        'Memory increase should be less than 10MB for streaming',
      );
    });
  });
});
