/**
 * @file component-styles.test.js
 * @description Tests for component <style> extraction and deduplication
 *
 * When component templates contain <style> blocks, the build extracts them,
 * deduplicates per component, resolves global template variables, and injects
 * a single consolidated <style> into <head>. No selector rewriting — authors
 * use native @scope and @layer for CSS scoping.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

// ---------------------------------------------------------------------------
// Replicate the core style-extraction logic from replace-components.js
// ---------------------------------------------------------------------------

function extractStyles(template) {
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const cssBlocks = [];
  let match;

  while ((match = styleRegex.exec(template)) !== null) {
    const block = match[1].trim();
    if (block) cssBlocks.push(block);
  }

  const html = template.replace(styleRegex, '').trim();
  const css = cssBlocks.join('\n');

  return { html, css };
}

function renderTemplate(template, data) {
  return template.replace(/\$\{([^}]+)\}/g, (match, key) => {
    const trimmedKey = key.trim();
    if (data[trimmedKey] !== undefined && data[trimmedKey] !== null) {
      return data[trimmedKey];
    }
    if (trimmedKey.startsWith('slot:')) return '';
    return match;
  });
}

function injectCollectedStyles(headHTML, collectedStyles) {
  const entries = Object.entries(collectedStyles);
  if (entries.length === 0) return headHTML;

  const cssText = entries
    .map(([name, css]) => `/* ${name} */\n${css}`)
    .join('\n\n');

  const dom = new JSDOM(`<!doctype html><html><head>${headHTML}</head><body></body></html>`);
  const document = dom.window.document;

  const styleEl = document.createElement('style');
  styleEl.textContent = cssText;
  document.head.appendChild(styleEl);

  return document.head.innerHTML;
}

// ============================================================================
// Tests
// ============================================================================

describe('Component Style Extraction', () => {

  // --------------------------------------------------------------------------
  // extractStyles
  // --------------------------------------------------------------------------

  describe('extractStyles', () => {

    it('should extract a single <style> block', () => {
      const template = `<style>
  .card { padding: 1rem; }
</style>
<article class="card">\${slot}</article>`;

      const { html, css } = extractStyles(template);
      assert.ok(!html.includes('<style>'));
      assert.ok(html.includes('<article'));
      assert.ok(css.includes('.card { padding: 1rem; }'));
    });

    it('should extract multiple <style> blocks', () => {
      const template = `<style>.a { color: red; }</style>
<div class="a"></div>
<style>.b { color: blue; }</style>`;

      const { html, css } = extractStyles(template);
      assert.ok(!html.includes('<style>'));
      assert.ok(css.includes('.a { color: red; }'));
      assert.ok(css.includes('.b { color: blue; }'));
    });

    it('should return empty css when no <style> blocks exist', () => {
      const template = '<article>\${slot}</article>';
      const { html, css } = extractStyles(template);
      assert.strictEqual(css, '');
      assert.strictEqual(html, '<article>${slot}</article>');
    });

    it('should handle <style> with attributes', () => {
      const template = '<style type="text/css">.card { margin: 0; }</style><div></div>';
      const { html, css } = extractStyles(template);
      assert.ok(!html.includes('<style'));
      assert.ok(css.includes('.card { margin: 0; }'));
    });

    it('should handle empty <style> blocks', () => {
      const template = '<style></style><div>content</div>';
      const { html, css } = extractStyles(template);
      assert.strictEqual(css, '');
      assert.strictEqual(html, '<div>content</div>');
    });

    it('should preserve @scope syntax in extracted CSS', () => {
      const template = `<style>
@scope (article.card) {
  h2 { color: var(--color-primary); }
  p { margin-block: var(--space-s); }
}
</style>
<article class="card"><h2>\${title}</h2><p>\${slot}</p></article>`;

      const { html, css } = extractStyles(template);
      assert.ok(css.includes('@scope (article.card)'));
      assert.ok(css.includes('h2 { color: var(--color-primary); }'));
      assert.ok(!html.includes('@scope'));
    });

    it('should preserve @layer syntax in extracted CSS', () => {
      const template = `<style>
@layer components {
  .alert { border: 1px solid currentColor; }
}
</style>
<div class="alert">\${slot}</div>`;

      const { css } = extractStyles(template);
      assert.ok(css.includes('@layer components'));
      assert.ok(css.includes('.alert { border: 1px solid currentColor; }'));
    });

    it('should preserve nested CSS selectors', () => {
      const template = `<style>
.card {
  padding: 1rem;
  & h2 { font-size: 1.5rem; }
  & .footer { border-top: 1px solid; }
}
</style>
<div class="card"></div>`;

      const { css } = extractStyles(template);
      assert.ok(css.includes('& h2 { font-size: 1.5rem; }'));
      assert.ok(css.includes('& .footer { border-top: 1px solid; }'));
    });

    it('should handle @scope with lower boundary', () => {
      const template = `<style>
@scope (.card) to (.card-footer) {
  p { margin: 0; }
}
</style>
<div class="card"><p>\${slot}</p><div class="card-footer"></div></div>`;

      const { css } = extractStyles(template);
      assert.ok(css.includes('@scope (.card) to (.card-footer)'));
    });
  });

  // --------------------------------------------------------------------------
  // Deduplication
  // --------------------------------------------------------------------------

  describe('Deduplication', () => {

    it('should collect only one copy per component name', () => {
      const template = `<style>.card { padding: 1rem; }</style>
<article>\${slot}</article>`;

      const collectedStyles = {};
      const componentName = 'product-card.html';

      // Simulate processing same component 3 times
      for (let i = 0; i < 3; i++) {
        const { css } = extractStyles(template);
        if (css && !collectedStyles[componentName]) {
          collectedStyles[componentName] = css;
        }
      }

      assert.strictEqual(Object.keys(collectedStyles).length, 1);
      assert.strictEqual(collectedStyles[componentName], '.card { padding: 1rem; }');
    });

    it('should collect styles from different components separately', () => {
      const cardTemplate = '<style>.card { padding: 1rem; }</style><div></div>';
      const alertTemplate = '<style>.alert { border: 1px solid; }</style><div></div>';

      const collectedStyles = {};

      const { css: cardCss } = extractStyles(cardTemplate);
      if (cardCss) collectedStyles['card.html'] = cardCss;

      const { css: alertCss } = extractStyles(alertTemplate);
      if (alertCss) collectedStyles['alert.html'] = alertCss;

      assert.strictEqual(Object.keys(collectedStyles).length, 2);
      assert.ok(collectedStyles['card.html'].includes('.card'));
      assert.ok(collectedStyles['alert.html'].includes('.alert'));
    });

    it('should not collect styles from components without <style>', () => {
      const template = '<div>${slot}</div>';
      const collectedStyles = {};

      const { css } = extractStyles(template);
      if (css) collectedStyles['plain.html'] = css;

      assert.strictEqual(Object.keys(collectedStyles).length, 0);
    });
  });

  // --------------------------------------------------------------------------
  // Template variable resolution in CSS
  // --------------------------------------------------------------------------

  describe('CSS template variable resolution', () => {

    it('should resolve global variables in extracted CSS', () => {
      const template = `<style>
.brand { color: \${brandColor}; }
</style>
<div class="brand">\${slot}</div>`;

      const { css } = extractStyles(template);
      const resolved = renderTemplate(css, { brandColor: '#ff6600' });
      assert.ok(resolved.includes('color: #ff6600;'));
    });

    it('should leave unresolved variables as-is for later processing', () => {
      const template = `<style>
.card { background: \${cardBg}; }
</style>
<div></div>`;

      const { css } = extractStyles(template);
      const resolved = renderTemplate(css, {});
      assert.ok(resolved.includes('${cardBg}'));
    });

    it('should resolve CSS custom property fallbacks authored with template vars', () => {
      const template = `<style>
.card { color: var(--card-color, \${fallbackColor}); }
</style>
<div></div>`;

      const { css } = extractStyles(template);
      const resolved = renderTemplate(css, { fallbackColor: 'navy' });
      assert.ok(resolved.includes('var(--card-color, navy)'));
    });
  });

  // --------------------------------------------------------------------------
  // Style injection into <head>
  // --------------------------------------------------------------------------

  describe('Style injection', () => {

    it('should inject consolidated styles into <head>', () => {
      const collectedStyles = {
        'card.html': '.card { padding: 1rem; }',
        'alert.html': '.alert { border: 1px solid; }',
      };

      const result = injectCollectedStyles('<title>Test</title>', collectedStyles);
      assert.ok(result.includes('<style>'));
      assert.ok(result.includes('.card { padding: 1rem; }'));
      assert.ok(result.includes('.alert { border: 1px solid; }'));
    });

    it('should include component name comments for debugging', () => {
      const collectedStyles = {
        'card.html': '.card { padding: 1rem; }',
      };

      const result = injectCollectedStyles('<title>Test</title>', collectedStyles);
      assert.ok(result.includes('/* card.html */'));
    });

    it('should not inject anything when no styles collected', () => {
      const original = '<title>Test</title>';
      const result = injectCollectedStyles(original, {});
      assert.strictEqual(result, original);
    });

    it('should append style after existing head content', () => {
      const collectedStyles = { 'card.html': '.card {}' };
      const result = injectCollectedStyles(
        '<meta charset="utf-8"><link rel="stylesheet" href="/styles.css">',
        collectedStyles
      );
      // The <style> should come after the existing link
      const linkIdx = result.indexOf('<link');
      const styleIdx = result.indexOf('<style>');
      assert.ok(styleIdx > linkIdx, 'style should appear after existing head content');
    });
  });

  // --------------------------------------------------------------------------
  // End-to-end: extraction → dedup → resolve → inject
  // --------------------------------------------------------------------------

  describe('End-to-end', () => {

    it('should process a component with @scope and inject into page', () => {
      const template = `<style>
@scope (article.product) {
  h3 { color: var(--color-primary); }
  .price { font-weight: bold; }
}
</style>
<article class="product">
  <h3>\${name}</h3>
  <span class="price">\${price}</span>
</article>`;

      // Extract
      const { html, css } = extractStyles(template);
      assert.ok(!html.includes('<style>'));
      assert.ok(html.includes('<article class="product">'));

      // Resolve (global data)
      const resolvedCss = renderTemplate(css, {});

      // Render HTML (instance data)
      const renderedHtml = renderTemplate(html, { name: 'Trail Pack', price: '$189' });
      assert.ok(renderedHtml.includes('Trail Pack'));
      assert.ok(renderedHtml.includes('$189'));

      // Inject
      const collectedStyles = { 'product.html': resolvedCss };
      const headResult = injectCollectedStyles('<title>Products</title>', collectedStyles);
      assert.ok(headResult.includes('@scope (article.product)'));
      assert.ok(headResult.includes('.price { font-weight: bold; }'));
    });

    it('should handle a page with multiple component types', () => {
      const cardTemplate = `<style>
@scope (.card) {
  h3 { margin: 0; }
}
</style>
<div class="card"><h3>\${title}</h3>\${slot}</div>`;

      const alertTemplate = `<style>
@layer components {
  .alert { padding: 0.5rem 1rem; border-left: 3px solid; }
}
</style>
<div class="alert" role="alert">\${slot}</div>`;

      const plainTemplate = '<blockquote>\${slot}</blockquote>';

      // Process all three
      const collectedStyles = {};

      const card = extractStyles(cardTemplate);
      if (card.css) collectedStyles['card.html'] = card.css;

      const alert = extractStyles(alertTemplate);
      if (alert.css) collectedStyles['alert.html'] = alert.css;

      const plain = extractStyles(plainTemplate);
      if (plain.css) collectedStyles['plain.html'] = plain.css;

      // Only card and alert should have styles
      assert.strictEqual(Object.keys(collectedStyles).length, 2);

      const headResult = injectCollectedStyles('<title>Page</title>', collectedStyles);
      assert.ok(headResult.includes('@scope (.card)'));
      assert.ok(headResult.includes('@layer components'));
      assert.ok(headResult.includes('/* card.html */'));
      assert.ok(headResult.includes('/* alert.html */'));
    });

    it('should produce correct output when same component used with different data', () => {
      const template = `<style>.tag { display: inline-block; }</style>
<span class="tag">\${label}</span>`;

      const collectedStyles = {};

      // First instance
      const first = extractStyles(template);
      if (first.css && !collectedStyles['tag.html']) {
        collectedStyles['tag.html'] = first.css;
      }
      const html1 = renderTemplate(first.html, { label: 'New' });

      // Second instance
      const second = extractStyles(template);
      if (second.css && !collectedStyles['tag.html']) {
        collectedStyles['tag.html'] = second.css;
      }
      const html2 = renderTemplate(second.html, { label: 'Sale' });

      // One style entry, two different rendered outputs
      assert.strictEqual(Object.keys(collectedStyles).length, 1);
      assert.ok(html1.includes('New'));
      assert.ok(html2.includes('Sale'));
      assert.ok(!html1.includes('<style>'));
      assert.ok(!html2.includes('<style>'));
    });
  });
});
