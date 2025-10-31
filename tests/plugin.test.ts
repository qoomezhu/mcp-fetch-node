import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import {
  PluginRegistry,
  ContentProcessor,
  ProcessorContext,
  ProcessorResult,
} from '../src/core/plugin.js';

class MockTextProcessor implements ContentProcessor {
  readonly name = 'text-processor';
  readonly supportedMimeTypes = ['text/plain'];

  process(context: ProcessorContext): ProcessorResult {
    return {
      content: context.content.toUpperCase(),
      prefix: 'Processed text:',
    };
  }
}

class MockHtmlProcessor implements ContentProcessor {
  readonly name = 'html-processor';

  canProcess(context: ProcessorContext): boolean {
    return context.content.includes('<html>');
  }

  process(context: ProcessorContext): ProcessorResult {
    return {
      content: `# Processed HTML\n${context.content}`,
      prefix: '',
    };
  }
}

describe('Plugin System', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('should register processors', () => {
    const processor = new MockTextProcessor();
    registry.register(processor);

    const all = registry.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].name, 'text-processor');
  });

  it('should unregister processors', () => {
    const processor = new MockTextProcessor();
    registry.register(processor);
    registry.unregister('text-processor');

    const all = registry.getAll();
    assert.equal(all.length, 0);
  });

  it('should find processor by MIME type', () => {
    const processor = new MockTextProcessor();
    registry.register(processor);

    const context: ProcessorContext = {
      url: 'http://example.com',
      content: 'hello world',
      contentType: 'text/plain',
      userAgent: 'test',
      raw: false,
    };

    const found = registry.findProcessor(context);
    assert.ok(found);
    assert.equal(found.name, 'text-processor');
  });

  it('should find processor by canProcess method', () => {
    const processor = new MockHtmlProcessor();
    registry.register(processor);

    const context: ProcessorContext = {
      url: 'http://example.com',
      content: '<html><body>test</body></html>',
      contentType: 'text/html',
      userAgent: 'test',
      raw: false,
    };

    const found = registry.findProcessor(context);
    assert.ok(found);
    assert.equal(found.name, 'html-processor');
  });

  it('should return null when no processor matches', () => {
    const context: ProcessorContext = {
      url: 'http://example.com',
      content: 'some content',
      contentType: 'application/json',
      userAgent: 'test',
      raw: false,
    };

    const found = registry.findProcessor(context);
    assert.equal(found, null);
  });

  it('should process content with registered processor', () => {
    const processor = new MockTextProcessor();
    registry.register(processor);

    const context: ProcessorContext = {
      url: 'http://example.com',
      content: 'hello world',
      contentType: 'text/plain',
      userAgent: 'test',
      raw: false,
    };

    const found = registry.findProcessor(context);
    const result = found?.process(context);

    assert.ok(result);
    assert.equal(result.content, 'HELLO WORLD');
    assert.equal(result.prefix, 'Processed text:');
  });

  it('should support multiple processors', () => {
    registry.register(new MockTextProcessor());
    registry.register(new MockHtmlProcessor());

    const all = registry.getAll();
    assert.equal(all.length, 2);
  });

  it('should match MIME types with charset', () => {
    const processor = new MockTextProcessor();
    registry.register(processor);

    const context: ProcessorContext = {
      url: 'http://example.com',
      content: 'hello',
      contentType: 'text/plain; charset=utf-8',
      userAgent: 'test',
      raw: false,
    };

    const found = registry.findProcessor(context);
    assert.ok(found);
    assert.equal(found.name, 'text-processor');
  });

  it('should clear all processors', () => {
    registry.register(new MockTextProcessor());
    registry.register(new MockHtmlProcessor());
    registry.clear();

    const all = registry.getAll();
    assert.equal(all.length, 0);
  });
});
