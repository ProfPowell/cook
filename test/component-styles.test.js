/**
 * @file component-styles.test.js
 * @description Tests component <style> extraction and deduplication in the
 * REAL replace-components plugin (scripts/plugins/replace-components.js).
 *
 * When component templates contain <style> blocks, the build extracts them,
 * deduplicates per component, resolves global template variables, and injects
 * a single consolidated <style> into <head>. No selector rewriting — authors
 * use native @scope and @layer for CSS scoping.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseHTML } from 'linkedom';

import replaceComponents from '../scripts/plugins/replace-components.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE = (body) => `<!DOCTYPE html>
<html lang="en">
<head><title>Test</title><link rel="stylesheet" href="/styles.css"></head>
<body>${body}</body>
</html>`;

async function run(body, cachedComponents, data = {}) {
  const file = { ext: 'html', path: 'dist/index.html', name: 'index', src: PAGE(body) };
  await replaceComponents({ file, store: { cachedComponents }, data, allowType: ['.html'] });
  return file;
}

/** Return the consolidated head <style> CSS text ('' when none injected). */
function headCss(file) {
  const { document } = parseHTML(file.src);
  const styles = document.querySelectorAll('head style');
  return Array.from(styles).map(s => s.textContent).join('\n');
}

// ============================================================================
// Tests
// ============================================================================

describe('Component Style Extraction', () => {

  // --------------------------------------------------------------------------
  // Extraction
  // --------------------------------------------------------------------------

  describe('style extraction', () => {

    it('should extract a single <style> block into <head>', async () => {
      const file = await run(
        '<my-card>hi</my-card>',
        {
          'my-card.html': `<style>
  .card { padding: 1rem; }
</style>
<article class="card">\${slot}</article>`,
        }
      );

      const { document } = parseHTML(file.src);
      assert.ok(!!document.querySelector('body article.card'), 'rendered HTML present');
      assert.ok(!document.querySelector('body style'), 'no <style> left in the body');
      assert.ok(headCss(file).includes('.card { padding: 1rem; }'));
    });

    it('should extract multiple <style> blocks from one component', async () => {
      const file = await run(
        '<my-multi></my-multi>',
        {
          'my-multi.html': `<style>.a { color: red; }</style>
<div class="a"></div>
<style>.b { color: blue; }</style>`,
        }
      );

      const css = headCss(file);
      assert.ok(css.includes('.a { color: red; }'));
      assert.ok(css.includes('.b { color: blue; }'));
      assert.ok(!parseHTML(file.src).document.querySelector('body style'));
    });

    it('should inject no <style> when the component has none', async () => {
      const file = await run(
        '<my-plain>content</my-plain>',
        { 'my-plain.html': '<article class="plain">${slot}</article>' }
      );

      const { document } = parseHTML(file.src);
      assert.ok(!document.querySelector('head style'), 'no consolidated style injected');
      assert.ok(!!document.querySelector('article.plain'));
    });

    it('should handle <style> with attributes', async () => {
      const file = await run(
        '<my-typed></my-typed>',
        { 'my-typed.html': '<style type="text/css">.card { margin: 0; }</style><div class="typed"></div>' }
      );

      assert.ok(headCss(file).includes('.card { margin: 0; }'));
      assert.ok(!parseHTML(file.src).document.querySelector('body style'));
    });

    it('should not collect empty <style> blocks', async () => {
      const file = await run(
        '<my-empty></my-empty>',
        { 'my-empty.html': '<style></style><div class="e">content</div>' }
      );

      const { document } = parseHTML(file.src);
      assert.ok(!document.querySelector('head style'), 'empty CSS should not be collected');
      assert.ok(!!document.querySelector('.e'));
    });

    it('should preserve @scope syntax in extracted CSS', async () => {
      const file = await run(
        '<my-scoped title="T">body</my-scoped>',
        {
          'my-scoped.html': `<style>
@scope (article.card) {
  h2 { color: var(--color-primary); }
  p { margin-block: var(--space-s); }
}
</style>
<article class="card"><h2>\${title}</h2><p>\${slot}</p></article>`,
        }
      );

      const css = headCss(file);
      assert.ok(css.includes('@scope (article.card)'));
      assert.ok(css.includes('h2 { color: var(--color-primary); }'));
      // @scope must not leak into the rendered body HTML
      const { document } = parseHTML(file.src);
      assert.ok(!document.querySelector('body').innerHTML.includes('@scope'));
    });

    it('should preserve @layer syntax in extracted CSS', async () => {
      const file = await run(
        '<my-alert>careful</my-alert>',
        {
          'my-alert.html': `<style>
@layer components {
  .alert { border: 1px solid currentColor; }
}
</style>
<div class="alert">\${slot}</div>`,
        }
      );

      const css = headCss(file);
      assert.ok(css.includes('@layer components'));
      assert.ok(css.includes('.alert { border: 1px solid currentColor; }'));
    });

    it('should preserve nested CSS selectors', async () => {
      const file = await run(
        '<my-nested></my-nested>',
        {
          'my-nested.html': `<style>
.card {
  padding: 1rem;
  & h2 { font-size: 1.5rem; }
  & .footer { border-top: 1px solid; }
}
</style>
<div class="card"></div>`,
        }
      );

      const css = headCss(file);
      assert.ok(css.includes('& h2 { font-size: 1.5rem; }'));
      assert.ok(css.includes('& .footer { border-top: 1px solid; }'));
    });

    it('should handle @scope with lower boundary', async () => {
      const file = await run(
        '<my-bounded>text</my-bounded>',
        {
          'my-bounded.html': `<style>
@scope (.card) to (.card-footer) {
  p { margin: 0; }
}
</style>
<div class="card"><p>\${slot}</p><div class="card-footer"></div></div>`,
        }
      );

      assert.ok(headCss(file).includes('@scope (.card) to (.card-footer)'));
    });
  });

  // --------------------------------------------------------------------------
  // Deduplication
  // --------------------------------------------------------------------------

  describe('deduplication', () => {

    it('should collect only one copy per component name', async () => {
      const file = await run(
        '<my-tag label="A"></my-tag><my-tag label="B"></my-tag><my-tag label="C"></my-tag>',
        { 'my-tag.html': '<style>.tag { display: inline-block; }</style><span class="tag">${label}</span>' }
      );

      const css = headCss(file);
      const copies = (css.match(/\.tag \{ display: inline-block; \}/g) || []).length;
      assert.strictEqual(copies, 1, `expected CSS once, found ${copies} copies`);
      const comments = (css.match(/\/\* my-tag\.html \*\//g) || []).length;
      assert.strictEqual(comments, 1);
      // All three instances rendered
      const { document } = parseHTML(file.src);
      assert.strictEqual(document.querySelectorAll('span.tag').length, 3);
    });

    it('should collect styles from different components separately', async () => {
      const file = await run(
        '<my-card></my-card><my-alert></my-alert>',
        {
          'my-card.html': '<style>.card { padding: 1rem; }</style><div class="card"></div>',
          'my-alert.html': '<style>.alert { border: 1px solid; }</style><div class="alert"></div>',
        }
      );

      const css = headCss(file);
      assert.ok(css.includes('/* my-card.html */'));
      assert.ok(css.includes('.card { padding: 1rem; }'));
      assert.ok(css.includes('/* my-alert.html */'));
      assert.ok(css.includes('.alert { border: 1px solid; }'));
    });

    it('should not collect styles from components without <style>', async () => {
      const file = await run(
        '<my-card></my-card><my-plain>text</my-plain>',
        {
          'my-card.html': '<style>.card { padding: 1rem; }</style><div class="card"></div>',
          'my-plain.html': '<blockquote>${slot}</blockquote>',
        }
      );

      const css = headCss(file);
      assert.ok(css.includes('/* my-card.html */'));
      assert.ok(!css.includes('my-plain'), 'style-less component must not be listed');
    });
  });

  // --------------------------------------------------------------------------
  // Template variable resolution in CSS
  // --------------------------------------------------------------------------

  describe('CSS template variable resolution', () => {

    it('should resolve global variables in extracted CSS', async () => {
      const file = await run(
        '<my-brand>b</my-brand>',
        { 'my-brand.html': '<style>.brand { color: ${brandColor}; }</style><div class="brand">${slot}</div>' },
        { brandColor: '#ff6600' }
      );

      assert.ok(headCss(file).includes('color: #ff6600;'));
    });

    it('should leave unresolved variables as-is for later processing', async () => {
      const file = await run(
        '<my-card></my-card>',
        { 'my-card.html': '<style>.card { background: ${cardBg}; }</style><div></div>' }
      );

      assert.ok(headCss(file).includes('${cardBg}'));
    });

    it('should resolve CSS custom property fallbacks authored with template vars', async () => {
      const file = await run(
        '<my-card></my-card>',
        { 'my-card.html': '<style>.card { color: var(--card-color, ${fallbackColor}); }</style><div></div>' },
        { fallbackColor: 'navy' }
      );

      assert.ok(headCss(file).includes('var(--card-color, navy)'));
    });

    it('should resolve CSS with global data only, not instance attributes', async () => {
      const file = await run(
        '<my-card accent="rebeccapurple"></my-card>',
        { 'my-card.html': '<style>.card { color: ${accent}; }</style><div class="card"></div>' }
      );

      // Instance attribute data must not leak into the consolidated CSS
      assert.ok(headCss(file).includes('${accent}'));
      assert.ok(!headCss(file).includes('rebeccapurple'));
    });
  });

  // --------------------------------------------------------------------------
  // Style injection into <head>
  // --------------------------------------------------------------------------

  describe('style injection', () => {

    it('should inject consolidated styles into a single <style> in <head>', async () => {
      const file = await run(
        '<my-card></my-card><my-alert></my-alert>',
        {
          'my-card.html': '<style>.card { padding: 1rem; }</style><div></div>',
          'my-alert.html': '<style>.alert { border: 1px solid; }</style><div></div>',
        }
      );

      const { document } = parseHTML(file.src);
      const styles = document.querySelectorAll('head style');
      assert.strictEqual(styles.length, 1, 'exactly one consolidated <style>');
      assert.ok(styles[0].textContent.includes('.card { padding: 1rem; }'));
      assert.ok(styles[0].textContent.includes('.alert { border: 1px solid; }'));
    });

    it('should include component name comments for debugging', async () => {
      const file = await run(
        '<my-card></my-card>',
        { 'my-card.html': '<style>.card { padding: 1rem; }</style><div></div>' }
      );

      assert.ok(headCss(file).includes('/* my-card.html */'));
    });

    it('should not inject anything when no styles collected', async () => {
      const file = await run(
        '<my-plain>x</my-plain>',
        { 'my-plain.html': '<div class="p">${slot}</div>' }
      );

      const { document } = parseHTML(file.src);
      assert.ok(!document.querySelector('head style'));
    });

    it('should append the style after existing head content', async () => {
      const file = await run(
        '<my-card></my-card>',
        { 'my-card.html': '<style>.card {}</style><div></div>' }
      );

      const { document } = parseHTML(file.src);
      const headHTML = document.head.innerHTML;
      const linkIdx = headHTML.indexOf('<link');
      const styleIdx = headHTML.indexOf('<style>');
      assert.ok(linkIdx !== -1 && styleIdx !== -1);
      assert.ok(styleIdx > linkIdx, 'style should appear after existing head content');
    });
  });

  // --------------------------------------------------------------------------
  // End-to-end: extraction → dedup → resolve → inject
  // --------------------------------------------------------------------------

  describe('End-to-end', () => {

    it('should process a component with @scope and inject into page', async () => {
      const file = await run(
        '<my-product name="Trail Pack" price="189"></my-product>',
        {
          'my-product.html': `<style>
@scope (article.product) {
  h3 { color: var(--color-primary); }
  .price { font-weight: bold; }
}
</style>
<article class="product">
  <h3>\${name}</h3>
  <span class="price">\${price}</span>
</article>`,
        }
      );

      const { document } = parseHTML(file.src);
      const article = document.querySelector('body article.product');
      assert.ok(!!article);
      assert.strictEqual(document.querySelector('.product h3').textContent, 'Trail Pack');
      assert.strictEqual(document.querySelector('.product .price').textContent, '189');
      assert.ok(!document.querySelector('body style'));

      const css = headCss(file);
      assert.ok(css.includes('@scope (article.product)'));
      assert.ok(css.includes('.price { font-weight: bold; }'));
    });

    it('should handle a page with multiple component types', async () => {
      const file = await run(
        '<my-card title="Hi">card body</my-card><my-alert>warn</my-alert><my-plain>quote</my-plain>',
        {
          'my-card.html': `<style>
@scope (.card) {
  h3 { margin: 0; }
}
</style>
<div class="card"><h3>\${title}</h3>\${slot}</div>`,
          'my-alert.html': `<style>
@layer components {
  .alert { padding: 0.5rem 1rem; border-left: 3px solid; }
}
</style>
<div class="alert" role="alert">\${slot}</div>`,
          'my-plain.html': '<blockquote>${slot}</blockquote>',
        }
      );

      const css = headCss(file);
      assert.ok(css.includes('@scope (.card)'));
      assert.ok(css.includes('@layer components'));
      assert.ok(css.includes('/* my-card.html */'));
      assert.ok(css.includes('/* my-alert.html */'));
      assert.ok(!css.includes('my-plain'), 'only styled components collected');

      const { document } = parseHTML(file.src);
      assert.ok(!!document.querySelector('.card h3'));
      assert.ok(!!document.querySelector('.alert[role="alert"]'));
      assert.ok(!!document.querySelector('blockquote'));
    });

    it('should produce correct output when same component used with different data', async () => {
      const file = await run(
        '<my-tag label="New"></my-tag><my-tag label="Sale"></my-tag>',
        { 'my-tag.html': '<style>.tag { display: inline-block; }</style><span class="tag">${label}</span>' }
      );

      const { document } = parseHTML(file.src);
      const labels = Array.from(document.querySelectorAll('span.tag')).map(el => el.textContent);
      assert.deepStrictEqual(labels, ['New', 'Sale']);

      const css = headCss(file);
      const copies = (css.match(/\.tag \{ display: inline-block; \}/g) || []).length;
      assert.strictEqual(copies, 1, 'one style entry despite two instances');
      assert.ok(!document.querySelector('body style'));
    });
  });
});
