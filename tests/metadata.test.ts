import assert from 'node:assert';
import { describe, it } from 'node:test';
import { Buffer } from 'node:buffer';
import { extractMetadata } from '../src/utils/metadata.js';

describe('Metadata extraction', () => {
  it('should extract HTML metadata including Open Graph and Twitter cards', () => {
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Sample Page Title</title>
  <meta name="description" content="Sample description for testing.">
  <meta name="keywords" content="alpha, beta, gamma">
  <meta name="author" content="Site Author">
  <meta name="pubdate" content="2024-01-01">
  <meta property="og:title" content="OG Sample Title">
  <meta property="og:description" content="OG Sample Description">
  <meta property="og:image" content="https://example.com/og-image.jpg">
  <meta name="twitter:title" content="Twitter Title">
  <meta name="twitter:description" content="Twitter Description">
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Article","headline":"Article Headline","author":{"@type":"Person","name":"Jane Doe"}}
  </script>
</head>
<body>
  <h1>Fallback Heading</h1>
  <p>Body content for the sample page.</p>
  <div itemscope itemtype="https://schema.org/Article">
    <span itemprop="author">Microdata Author</span>
    <meta itemprop="datePublished" content="2024-02-02">
  </div>
</body>
</html>`;

    const metadata = extractMetadata({
      content: html,
      contentType: 'text/html; charset=utf-8',
    });

    assert.equal(metadata.title, 'Sample Page Title');
    assert.equal(metadata.description, 'Sample description for testing.');
    assert.equal(metadata.author, 'Site Author');
    assert.equal(metadata.publishDate, '2024-01-01');
    assert.deepEqual(metadata.keywords, ['alpha', 'beta', 'gamma']);
    assert.equal(metadata.language, 'en');
    assert.equal(metadata.charset?.toLowerCase(), 'utf-8');
    assert.equal(metadata.openGraph?.['og:title'], 'OG Sample Title');
    assert.equal(metadata.twitterCard?.['twitter:title'], 'Twitter Title');
    assert.ok(metadata.jsonLd && metadata.jsonLd.length === 1);
    assert.ok(metadata.microdata && metadata.microdata.length >= 1);
  });

  it('should extract metadata from JSON feeds', () => {
    const jsonFeed = JSON.stringify({
      title: 'JSON Feed Title',
      description: 'JSON Feed Description',
      language: 'en-US',
      author: { name: 'Feed Author' },
      keywords: ['json', 'feed'],
      home_page_url: 'https://example.com',
    });

    const metadata = extractMetadata({
      content: jsonFeed,
      contentType: 'application/feed+json',
    });

    assert.equal(metadata.title, 'JSON Feed Title');
    assert.equal(metadata.description, 'JSON Feed Description');
    assert.equal(metadata.author, 'Feed Author');
    assert.equal(metadata.language, 'en-US');
    assert.deepEqual(metadata.keywords, ['json', 'feed']);
    assert.equal(metadata.jsonFeed?.homePageURL, 'https://example.com');
  });

  it('should extract metadata from XML feeds', () => {
    const xmlFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>RSS Feed Title</title>
    <description>RSS Feed Description</description>
    <language>en-gb</language>
    <link>https://example.com/rss</link>
    <lastBuildDate>Mon, 01 Jan 2024 00:00:00 GMT</lastBuildDate>
  </channel>
</rss>`;

    const metadata = extractMetadata({
      content: xmlFeed,
      contentType: 'application/rss+xml',
    });

    assert.equal(metadata.title, 'RSS Feed Title');
    assert.equal(metadata.description, 'RSS Feed Description');
    assert.equal(metadata.language, 'en-gb');
    assert.equal(metadata.publishDate, 'Mon, 01 Jan 2024 00:00:00 GMT');
    assert.equal(metadata.xmlFeed?.link, 'https://example.com/rss');
  });

  it('should extract metadata from PDF content', () => {
    const pdfBuffer = Buffer.from(`%PDF-1.4\n1 0 obj\n<<\n/Title (Sample PDF Document)\n/Author (John Doe)\n/Subject (Metadata Test)\n/Creator (Unit Test Suite)\n/Producer (PDF Producer)\n/CreationDate (D:20240101010101Z)\n/ModDate (D:20240202020202+01'30')\n>>\nendobj\ntrailer\n<<\n/Info 1 0 R\n>>\n%%EOF`);

    const metadata = extractMetadata({
      content: pdfBuffer.toString('latin1'),
      contentType: 'application/pdf',
      arrayBuffer: pdfBuffer,
    });

    assert.equal(metadata.title, 'Sample PDF Document');
    assert.equal(metadata.author, 'John Doe');
    assert.equal(metadata.publishDate, '2024-01-01T01:01:01Z');
    assert.equal(metadata.pdf?.subject, 'Metadata Test');
    assert.equal(metadata.pdf?.creator, 'Unit Test Suite');
    assert.equal(metadata.pdf?.producer, 'PDF Producer');
    assert.equal(metadata.pdf?.modificationDate, '2024-02-02T02:02:02+01:30');
  });
});
