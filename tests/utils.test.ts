import assert from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import { paginate } from '../src/utils/paginate.js';
import { processURL } from '../src/utils/process-url.js';
import { createTestServer } from './helpers/test-server.js';
import {
  clearProcessorRegistry,
} from '../src/content/registry.js';
import {
  resetContentProcessorConfigs,
} from '../src/config/content-processors.js';

describe('Utility Functions', () => {
  afterEach(() => {
    resetContentProcessorConfigs();
    clearProcessorRegistry();
  });

  describe('paginate', () => {
    it('should correctly paginate content', () => {
      const content = 'Hello World!';
      const result = paginate('test-url', content, '', 0, 5);
      assert.ok(result.includes('Hello'));
      assert.ok(result.includes('truncated'));
    });

    it('should handle start index beyond content length', () => {
      const content = 'Hello World!';
      const result = paginate('test-url', content, '', 20, 5);
      assert.ok(result.includes('No more content available'));
    });
  });

  describe('processURL', () => {
    it('should extract main HTML content and filter noise', async () => {
      const html = `<!DOCTYPE html>
<html>
  <head>
    <title>Demo</title>
  </head>
  <body>
    <header>
      <nav>Navigation Menu</nav>
    </header>
    <main>
      <article>
        <h1>Important Article</h1>
        <p>This is the lead paragraph.</p>
      </article>
    </main>
    <aside>Sidebar content</aside>
    <footer>Footer information</footer>
  </body>
</html>`;

      const server = await createTestServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'text/html');
        res.end(html);
      });

      try {
        const [content, prefix] = await processURL(
          server.url,
          'test-user-agent',
          false,
        );

        assert.ok(content.includes('Important Article'));
        assert.ok(content.includes('This is the lead paragraph.'));
        assert.ok(!content.includes('Navigation Menu'));
        assert.ok(!content.includes('Sidebar content'));
        if (prefix) {
          assert.ok(prefix.includes('Metadata'));
        }
      } finally {
        await server.close();
      }
    });

    it('should handle raw content request', async () => {
      const html = '<html><body><h1>Hello raw</h1></body></html>';
      const server = await createTestServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'text/html');
        res.end(html);
      });

      try {
        const [content, prefix] = await processURL(
          server.url,
          'test-user-agent',
          true,
        );
        assert.equal(content, html);
        assert.ok(prefix.includes('raw'));
      } finally {
        await server.close();
      }
    });
  });
});
