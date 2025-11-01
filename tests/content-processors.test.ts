import assert from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { processURL } from '../src/utils/process-url.js';
import { createTestServer } from './helpers/test-server.js';
import {
  overrideContentProcessorConfigs,
  resetContentProcessorConfigs,
} from '../src/config/content-processors.js';
import { clearProcessorRegistry } from '../src/content/registry.js';

async function withServer(handler: Parameters<typeof createTestServer>[0], run: (url: string) => Promise<void>) {
  const server = await createTestServer(handler);
  try {
    await run(server.url);
  } finally {
    await server.close();
  }
}

describe('Content processors', () => {
  afterEach(() => {
    resetContentProcessorConfigs();
    clearProcessorRegistry();
  });

  it('pretty prints JSON and emits a summary for large payloads', async () => {
    overrideContentProcessorConfigs({ json: { summaryThreshold: 10 } });
    clearProcessorRegistry();

    const payload = JSON.stringify(
      {
        name: 'Example',
        version: 2,
        items: Array.from({ length: 4 }, (_, index) => ({
          id: index + 1,
          name: `Item ${index + 1}`,
          tags: ['alpha', 'beta', 'gamma'],
        })),
      },
      null,
      2,
    );

    await withServer(
      (_req, res) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(payload);
      },
      async (url) => {
        const [content, prefix] = await processURL(url, 'test-user-agent', false);
        assert.ok(content.includes('## JSON Summary'));
        assert.ok(content.includes('## JSON Document'));
        assert.ok(content.includes('"name": "Item 1"'));
        assert.ok(prefix.includes('summaryIncluded'));
      },
    );
  });

  it('falls back to raw output when JSON processor disabled', async () => {
    overrideContentProcessorConfigs({ json: { enabled: false } });
    clearProcessorRegistry();

    const payload = '{"status":"ok"}';

    await withServer(
      (_req, res) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(payload);
      },
      async (url) => {
        const [content, prefix] = await processURL(url, 'test-user-agent', false);
        assert.equal(content, payload);
        assert.ok(prefix.includes('cannot be simplified'));
      },
    );
  });

  it('converts RSS feeds to structured Markdown', async () => {
    const rss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Sample Feed</title>
    <description>An example RSS feed</description>
    <link>https://example.com</link>
    <item>
      <title>First story</title>
      <link>https://example.com/1</link>
      <description>First entry summary</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 +0000</pubDate>
    </item>
    <item>
      <title>Second story</title>
      <link>https://example.com/2</link>
      <description>Second entry summary</description>
      <pubDate>Tue, 02 Jan 2024 00:00:00 +0000</pubDate>
    </item>
  </channel>
</rss>`;

    await withServer(
      (_req, res) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/rss+xml');
        res.end(rss);
      },
      async (url) => {
        const [content, prefix] = await processURL(url, 'test-user-agent', false);
        assert.ok(content.includes('## Feed Entries'));
        assert.ok(content.includes('First story'));
        assert.ok(content.includes('Second story'));
        assert.ok(prefix.includes('Metadata'));
      },
    );
  });

  it('extracts text from PDF documents', async () => {
    const pdfPath = new URL('./fixtures/sample.pdf', import.meta.url);
    const pdfBuffer = await readFile(pdfPath);

    await withServer(
      (_req, res) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/pdf');
        res.end(pdfBuffer);
      },
      async (url) => {
        const [content, prefix] = await processURL(url, 'test-user-agent', false);
        assert.ok(content.includes('## PDF Document'));
        assert.ok(content.toLowerCase().includes('hello from sample pdf'));
        assert.ok(prefix.includes('pages'));
      },
    );
  });
});
