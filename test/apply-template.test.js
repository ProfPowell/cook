/**
 * @file apply-template.test.js
 * @description Tests the REAL apply-template plugin
 * (scripts/plugins/apply-template.js) for the data-template HTML page
 * layout system: template discovery, page-data extraction, and merge.
 *
 * Layouts are seeded into store.cachedLayouts so no disk I/O happens.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import applyTemplate from '../scripts/plugins/apply-template.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_LAYOUT = `<!doctype html>
<html lang="en">
<head><title>\${title}</title><meta name="description" content="\${description}"></head>
<body>
<main>\${content}</main>
</body>
</html>`;

function makeFile(src) {
  return { ext: 'html', path: 'dist/index.html', name: 'index', src };
}

/** Run the real plugin against a page source with the given layouts. */
async function run(src, layouts = { default: DEFAULT_LAYOUT }) {
  const file = makeFile(src);
  await applyTemplate({ file, store: { cachedLayouts: layouts }, allowType: ['.html'] });
  return file;
}

// ============================================================================
// Tests
// ============================================================================

describe('Apply Template Plugin', () => {

  describe('template discovery (data-template)', () => {

    it('should find and apply data-template on <html>', async () => {
      const file = await run(
        '<html data-template="default" lang="en"><head><title>My Page</title></head><body><main><p>Content</p></main></body></html>'
      );
      assert.ok(file.src.includes('<!doctype html>'), 'layout applied');
      assert.ok(file.src.includes('<title>My Page</title>'));
      assert.ok(file.src.includes('<main><p>Content</p></main>'));
    });

    it('should find and apply data-template on <body>', async () => {
      const layouts = { product: '<div id="product-layout">${content}</div>' };
      const file = await run(
        '<html><head><title>P</title></head><body data-template="product"><main><p>Prod</p></main></body></html>',
        layouts
      );
      assert.ok(file.src.includes('id="product-layout"'));
      assert.ok(file.src.includes('<p>Prod</p>'));
    });

    it('should leave the page unchanged when no data-template exists', async () => {
      const src = '<html lang="en"><head><title>Normal</title></head><body><main><p>Regular page</p></main></body></html>';
      const file = await run(src);
      assert.strictEqual(file.src, src);
    });

    it('should handle data-template with other attributes around it', async () => {
      const file = await run(
        '<html lang="en" data-template="default" class="no-js"><head><title>T</title></head><body><main><p>C</p></main></body></html>'
      );
      assert.ok(file.src.includes('<!doctype html>'));
      assert.ok(file.src.includes('<title>T</title>'));
    });

    it('should be case-insensitive for tag names', async () => {
      const file = await run(
        '<HTML data-template="default"><HEAD><title>Caps</title></HEAD><BODY><main><p>C</p></main></BODY></HTML>'
      );
      assert.ok(file.src.includes('<!doctype html>'));
      assert.ok(file.src.includes('<title>Caps</title>'));
    });

    it('should leave the page unchanged when template name is not found in cache', async () => {
      const src = '<html data-template="missing"><head><title>T</title></head><body><main><p>C</p></main></body></html>';
      // Seed as null (the plugin caches misses as null)
      const file = await run(src, { missing: null });
      assert.strictEqual(file.src, src);
    });
  });

  describe('page data extraction', () => {

    it('should extract title from <head> into the layout', async () => {
      const layouts = { default: '<h1>${title}</h1><main>${content}</main>' };
      const file = await run(
        '<html data-template="default"><head><title>My Page</title></head><body><main><p>C</p></main></body></html>',
        layouts
      );
      assert.ok(file.src.includes('<h1>My Page</h1>'));
    });

    it('should extract meta description into the layout', async () => {
      const layouts = { default: '<meta name="description" content="${description}"><main>${content}</main>' };
      const file = await run(
        '<html data-template="default"><head><meta name="description" content="Page description"></head><body><main><p>C</p></main></body></html>',
        layouts
      );
      assert.ok(file.src.includes('content="Page description"'));
    });

    it('should extract content from <main>', async () => {
      const layouts = { default: '<main id="out">${content}</main>' };
      const file = await run(
        '<html data-template="default"><head><title>Test</title></head><body><main><h1>Hello</h1><p>World</p></main></body></html>',
        layouts
      );
      assert.ok(file.src.includes('<main id="out"><h1>Hello</h1><p>World</p></main>'));
    });

    it('should fall back to <body> content when no <main>', async () => {
      const layouts = { default: '<main id="out">${content}</main>' };
      const file = await run(
        '<html data-template="default"><head><title>Test</title></head><body><h1>Hello</h1></body></html>',
        layouts
      );
      assert.ok(file.src.includes('<main id="out"><h1>Hello</h1></main>'));
    });

    it('should extract custom data-* attributes as template variables', async () => {
      const layouts = { default: '<p>Price: ${price}</p><p>Category: ${category}</p><main>${content}</main>' };
      const file = await run(
        '<html data-template="default" data-price="189" data-category="packs"><head><title>Test</title></head><body><main><p>C</p></main></body></html>',
        layouts
      );
      assert.ok(file.src.includes('Price: 189'));
      assert.ok(file.src.includes('Category: packs'));
    });

    it('should convert kebab-case data attributes to camelCase', async () => {
      const layouts = { default: '<h2>${productName}</h2><main>${content}</main>' };
      const file = await run(
        '<html data-template="default" data-product-name="Trail Pack"><head><title>Test</title></head><body><main><p>C</p></main></body></html>',
        layouts
      );
      assert.ok(file.src.includes('<h2>Trail Pack</h2>'));
    });

    it('should not include data-template itself as a variable', async () => {
      const layouts = { default: '<p>${template}</p><p>${author}</p><main>${content}</main>' };
      const file = await run(
        '<html data-template="default" data-author="Kim"><head><title>Test</title></head><body><main><p>C</p></main></body></html>',
        layouts
      );
      // ${template} has no value — stays literal for later processing
      assert.ok(file.src.includes('<p>${template}</p>'));
      assert.ok(file.src.includes('<p>Kim</p>'));
    });

    it('should keep template variables inside an extracted title literal', async () => {
      const layouts = { default: '<title>${title}</title><main>${content}</main>' };
      const file = await run(
        '<html data-template="default"><head><title>Products — ${siteTitle}</title></head><body><main><p>C</p></main></body></html>',
        layouts
      );
      // Insertions are literal and never rescanned — ${siteTitle} survives
      assert.ok(file.src.includes('<title>Products — ${siteTitle}</title>'));
    });
  });

  describe('template application', () => {

    it('should inject content into the ${content} slot', async () => {
      const file = await run(
        '<html data-template="default"><head><title>My Page</title><meta name="description" content="A page"></head><body><main><h1>Hello</h1></main></body></html>'
      );
      assert.ok(file.src.includes('<main><h1>Hello</h1></main>'));
    });

    it('should replace title and description placeholders', async () => {
      const file = await run(
        '<html data-template="default"><head><title>My Page</title><meta name="description" content="A page"></head><body><main><p>Hi</p></main></body></html>'
      );
      assert.ok(file.src.includes('<title>My Page</title>'));
      assert.ok(file.src.includes('content="A page"'));
    });

    it('should leave unmatched placeholders for later processing', async () => {
      // Page has no meta description — layout keeps ${description}
      const file = await run(
        '<html data-template="default"><head><title>Test</title></head><body><main><p>Hi</p></main></body></html>'
      );
      assert.ok(file.src.includes('${description}'));
    });

    it('should handle empty content', async () => {
      const file = await run(
        '<html data-template="default"><head><title>Empty</title><meta name="description" content="Nothing here"></head><body><main></main></body></html>'
      );
      assert.ok(file.src.includes('<main></main>'));
    });

    it('should handle multiple ${content} occurrences', async () => {
      const layouts = { default: '<div>${content}</div><aside>${content}</aside>' };
      const file = await run(
        '<html data-template="default"><head><title>T</title></head><body><main>X</main></body></html>',
        layouts
      );
      assert.strictEqual(file.src, '<div>X</div><aside>X</aside>');
    });

    it('should insert custom data-* values containing $-patterns literally', async () => {
      const layouts = { default: '<p>Price: ${price}</p>\n${content}' };
      const file = await run(
        '<html data-template="default" data-price="$189"><head><title>T</title></head><body><main><p>Details</p></main></body></html>',
        layouts
      );
      assert.ok(file.src.includes('Price: $189'));
      assert.ok(file.src.includes('<p>Details</p>'));
    });
  });

  describe('End-to-end flow', () => {

    it('should transform a data-template page into a full page', async () => {
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

      const file = await run(sourcePage, { default: layoutTemplate });

      assert.ok(file.src.includes('<!doctype html>'));
      assert.ok(file.src.includes('<title>About Us — Gear Co</title>'));
      assert.ok(file.src.includes('content="About our company"'));
      assert.ok(file.src.includes('<link rel="stylesheet" href="/styles.css">'));
      assert.ok(file.src.includes('<header>Nav</header>'));
      assert.ok(file.src.includes('<h1>About Us</h1>'));
      assert.ok(file.src.includes('<footer>Footer</footer>'));
      // The original page wrapper is gone
      assert.ok(!file.src.includes('data-template'));
    });

    it('should not transform pages without data-template', async () => {
      const normalPage = `<!doctype html>
<html lang="en">
<head><title>Normal</title></head>
<body><main><p>Regular page</p></main></body>
</html>`;

      const file = await run(normalPage);
      assert.strictEqual(file.src, normalPage);
    });
  });
});
