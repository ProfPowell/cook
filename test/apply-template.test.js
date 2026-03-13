/**
 * @file apply-template.test.js
 * @description Tests for the data-template HTML page layout system
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ---------------------------------------------------------------------------
// Replicate the core logic from apply-template.js for isolated testing
// ---------------------------------------------------------------------------

function findTemplateName(src) {
  const match = src.match(/<(?:html|body)\s[^>]*data-template="([^"]+)"/i);
  return match ? match[1] : null;
}

function extractPageData(src) {
  const data = {};

  const titleMatch = src.match(/<title>([^<]*)<\/title>/i);
  if (titleMatch) data.title = titleMatch[1];

  const descMatch = src.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  if (descMatch) data.description = descMatch[1];

  const templateElMatch = src.match(/<(?:html|body)\s([^>]*data-template="[^"]*"[^>]*)>/i);
  if (templateElMatch) {
    const attrs = templateElMatch[1];
    const attrPattern = /data-(?!template)([a-z][a-z0-9-]*)="([^"]*)"/gi;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(attrs)) !== null) {
      const key = attrMatch[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      data[key] = attrMatch[2];
    }
  }

  const mainMatch = src.match(/<main[^>]*>([\s\S]*)<\/main>/i);
  if (mainMatch) {
    data.content = mainMatch[1].trim();
  } else {
    const bodyMatch = src.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      data.content = bodyMatch[1].trim();
    }
  }

  return data;
}

function applyTemplate(template, pageData) {
  let html = template;
  html = html.replace(/\$\{content\}/g, pageData.content || '');
  html = html.replace(/\$\{([^}]+)\}/g, (match, key) => {
    const trimmedKey = key.trim();
    if (trimmedKey === 'content') return match;
    if (pageData[trimmedKey] !== undefined) return pageData[trimmedKey];
    return match;
  });
  return html;
}

// ============================================================================
// Tests
// ============================================================================

describe('Apply Template Plugin', () => {

  describe('findTemplateName', () => {

    it('should find data-template on <html>', () => {
      const src = '<html data-template="default" lang="en"><head></head><body></body></html>';
      assert.strictEqual(findTemplateName(src), 'default');
    });

    it('should find data-template on <body>', () => {
      const src = '<html><head></head><body data-template="product"></body></html>';
      assert.strictEqual(findTemplateName(src), 'product');
    });

    it('should return null when no data-template exists', () => {
      const src = '<html lang="en"><head></head><body></body></html>';
      assert.strictEqual(findTemplateName(src), null);
    });

    it('should handle data-template with other attributes around it', () => {
      const src = '<html lang="en" data-template="default" class="no-js"><head></head><body></body></html>';
      assert.strictEqual(findTemplateName(src), 'default');
    });

    it('should be case-insensitive for tag names', () => {
      const src = '<HTML data-template="default"><HEAD></HEAD><BODY></BODY></HTML>';
      assert.strictEqual(findTemplateName(src), 'default');
    });
  });

  describe('extractPageData', () => {

    it('should extract title from <head>', () => {
      const src = `<html data-template="default">
<head><title>My Page</title></head>
<body><main><p>Content</p></main></body></html>`;
      const data = extractPageData(src);
      assert.strictEqual(data.title, 'My Page');
    });

    it('should extract meta description', () => {
      const src = `<html data-template="default">
<head><meta name="description" content="Page description"></head>
<body><main><p>Content</p></main></body></html>`;
      const data = extractPageData(src);
      assert.strictEqual(data.description, 'Page description');
    });

    it('should extract content from <main>', () => {
      const src = `<html data-template="default">
<head><title>Test</title></head>
<body><main><h1>Hello</h1><p>World</p></main></body></html>`;
      const data = extractPageData(src);
      assert.strictEqual(data.content, '<h1>Hello</h1><p>World</p>');
    });

    it('should fall back to <body> content when no <main>', () => {
      const src = `<html data-template="default">
<head><title>Test</title></head>
<body><h1>Hello</h1></body></html>`;
      const data = extractPageData(src);
      assert.strictEqual(data.content, '<h1>Hello</h1>');
    });

    it('should extract custom data-* attributes as template variables', () => {
      const src = `<html data-template="product" data-price="189" data-category="packs">
<head><title>Test</title></head>
<body><main><p>Content</p></main></body></html>`;
      const data = extractPageData(src);
      assert.strictEqual(data.price, '189');
      assert.strictEqual(data.category, 'packs');
    });

    it('should convert kebab-case data attributes to camelCase', () => {
      const src = `<html data-template="default" data-product-name="Trail Pack">
<head><title>Test</title></head>
<body><main><p>Content</p></main></body></html>`;
      const data = extractPageData(src);
      assert.strictEqual(data.productName, 'Trail Pack');
    });

    it('should not include data-template itself as a variable', () => {
      const src = `<html data-template="default" data-author="Kim">
<head><title>Test</title></head>
<body><main><p>Content</p></main></body></html>`;
      const data = extractPageData(src);
      assert.strictEqual(data.template, undefined);
      assert.strictEqual(data.author, 'Kim');
    });

    it('should handle title containing template variables', () => {
      const src = `<html data-template="default">
<head><title>Products — \${siteTitle}</title></head>
<body><main><p>Content</p></main></body></html>`;
      const data = extractPageData(src);
      assert.strictEqual(data.title, 'Products — ${siteTitle}');
    });
  });

  describe('applyTemplate', () => {

    const template = `<!doctype html>
<html lang="en">
<head><title>\${title}</title><meta name="description" content="\${description}"></head>
<body>
<main>\${content}</main>
</body>
</html>`;

    it('should inject content into ${content} slot', () => {
      const result = applyTemplate(template, {
        title: 'My Page',
        description: 'A page',
        content: '<h1>Hello</h1>',
      });
      assert.ok(result.includes('<main><h1>Hello</h1></main>'));
    });

    it('should replace title and description placeholders', () => {
      const result = applyTemplate(template, {
        title: 'My Page',
        description: 'A page',
        content: '<p>Hi</p>',
      });
      assert.ok(result.includes('<title>My Page</title>'));
      assert.ok(result.includes('content="A page"'));
    });

    it('should leave unmatched placeholders for later processing', () => {
      const result = applyTemplate(template, {
        title: 'Test',
        content: '<p>Hi</p>',
      });
      // description was not provided — should remain as ${description}
      assert.ok(result.includes('${description}'));
    });

    it('should handle empty content', () => {
      const result = applyTemplate(template, {
        title: 'Empty',
        description: 'Nothing here',
        content: '',
      });
      assert.ok(result.includes('<main></main>'));
    });

    it('should handle multiple ${content} occurrences', () => {
      const multiTemplate = '<div>${content}</div><aside>${content}</aside>';
      const result = applyTemplate(multiTemplate, { content: 'X' });
      assert.strictEqual(result, '<div>X</div><aside>X</aside>');
    });

    it('should pass through custom data-* variables to template', () => {
      const customTemplate = '<p>Price: ${price}</p>\n${content}';
      const result = applyTemplate(customTemplate, {
        price: '$189',
        content: '<p>Details</p>',
      });
      assert.ok(result.includes('Price: $189'));
      assert.ok(result.includes('<p>Details</p>'));
    });
  });

  describe('End-to-end flow', () => {

    it('should transform a data-template page into a full page', () => {
      const sourcePage = `<html data-template="default">
<head>
  <title>About Us — Gear Co</title>
  <meta name="description" content="About our company">
</head>
<body>
<main>
  <h1>About Us</h1>
  <p>We make gear.</p>
</main>
</body>
</html>`;

      const layoutTemplate = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>\${title}</title>
  <meta name="description" content="\${description}">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header>Nav</header>
  <main>\${content}</main>
  <footer>Footer</footer>
</body>
</html>`;

      // Step 1: Find template name
      const name = findTemplateName(sourcePage);
      assert.strictEqual(name, 'default');

      // Step 2: Extract page data
      const pageData = extractPageData(sourcePage);
      assert.strictEqual(pageData.title, 'About Us — Gear Co');
      assert.strictEqual(pageData.description, 'About our company');
      assert.ok(pageData.content.includes('<h1>About Us</h1>'));

      // Step 3: Apply template
      const result = applyTemplate(layoutTemplate, pageData);

      // Verify final output
      assert.ok(result.includes('<!doctype html>'));
      assert.ok(result.includes('<title>About Us — Gear Co</title>'));
      assert.ok(result.includes('content="About our company"'));
      assert.ok(result.includes('<link rel="stylesheet" href="/styles.css">'));
      assert.ok(result.includes('<header>Nav</header>'));
      assert.ok(result.includes('<h1>About Us</h1>'));
      assert.ok(result.includes('<footer>Footer</footer>'));
    });

    it('should not transform pages without data-template', () => {
      const normalPage = `<!doctype html>
<html lang="en">
<head><title>Normal</title></head>
<body><main><p>Regular page</p></main></body>
</html>`;

      const name = findTemplateName(normalPage);
      assert.strictEqual(name, null);
      // Plugin would exit early — page stays unchanged
    });
  });
});
