import assert from 'node:assert';
import { describe, it } from 'node:test';
import { paginate } from '../src/utils/paginate.js';
import { extract } from '../src/utils/extract.js';
import { processURL } from '../src/utils/process-url.js';

describe('Utility Functions', () => {
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

  describe('extract', () => {
    it('should extract content from HTML', () => {
      const html = '<div><h1>Title</h1><p>Content</p><nav>Menu</nav></div>';
      const result = extract(html);
      assert.ok(result.includes('Title'));
      assert.ok(result.includes('Content'));
      assert.ok(!result.includes('Menu')); // nav should be removed
    });
  });

  describe('processURL', () => {
    it('should process HTML content', async () => {
      const result = await processURL(
        'https://example.com',
        'test-user-agent',
        false,
      );
      assert.ok(result.content.length > 0);
      assert.equal(result.prefix, '');
      assert.ok(result.metadata.title);
    });

    it('should handle raw content request', async () => {
      const result = await processURL(
        'https://example.com',
        'test-user-agent',
        true,
      );
      assert.ok(result.content.includes('<html'));
      assert.ok(result.prefix.includes('raw'));
      assert.ok(result.metadata.title);
    });
  });
});
