/**
 * @file dsd-components.test.js
 * @description Tests Declarative Shadow DOM component rendering in the REAL
 * replace-components plugin (scripts/plugins/replace-components.js).
 *
 * Covers the DSD code path (components with <template shadowrootmode>)
 * and regression tests for the flat component expansion path.
 *
 * Component templates are seeded into store.cachedComponents so no disk
 * I/O happens.
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
<head><title>t</title></head>
<body>${body}</body>
</html>`;

async function run(body, cachedComponents, data = {}) {
  const file = { ext: 'html', path: 'dist/index.html', name: 'index', src: PAGE(body) };
  await replaceComponents({ file, store: { cachedComponents }, data, allowType: ['.html'] });
  return file;
}

// ============================================================================
// Tests
// ============================================================================

describe('DSD Component Detection', () => {

  it('renders a shadowrootmode template as DSD (element preserved)', async () => {
    const file = await run(
      '<my-card title="Hello"><p>Content</p></my-card>',
      {
        'my-card.html': `<template shadowrootmode="open">
      <style>:host { display: block; }</style>
      <div><slot></slot></div>
    </template>`,
      }
    );
    assert.ok(file.src.includes('<my-card'), 'custom element preserved');
    assert.ok(file.src.includes('shadowrootmode="open"'));
  });

  it('renders closed mode DSD', async () => {
    const file = await run(
      '<my-vault>secret</my-vault>',
      { 'my-vault.html': '<template shadowrootmode="closed"><div><slot></slot></div></template>' }
    );
    assert.ok(file.src.includes('<my-vault'), 'custom element preserved');
    assert.ok(file.src.includes('shadowrootmode="closed"'));
  });

  it('renders a flat component (no shadowrootmode) as flat HTML', async () => {
    const file = await run(
      '<my-card>hi</my-card>',
      {
        'my-card.html': `<style>.card { border: 1px solid; }</style>
      <article class="card"><h3>\${name}</h3>\${slot}</article>`,
      }
    );
    assert.ok(!file.src.includes('<my-card'), 'custom element removed (flat render)');
    assert.ok(!file.src.includes('shadowrootmode'));
  });

  it('does not treat a regular <template> (no shadowrootmode) as DSD', async () => {
    const file = await run(
      '<my-thing></my-thing>',
      { 'my-thing.html': '<template id="my-template"><div>content</div></template>' }
    );
    // Flat-rendered: element removed, raw template shipped as page content
    assert.ok(!file.src.includes('<my-thing'), 'custom element removed');
    assert.ok(!file.src.includes('shadowrootmode'));
    assert.ok(file.src.includes('id="my-template"'));
  });

  it('is case insensitive about the <template> TAG name', async () => {
    const file = await run(
      '<my-loud>content</my-loud>',
      { 'my-loud.html': '<TEMPLATE shadowrootmode="open"><div class="in"><slot></slot></div></TEMPLATE>' }
    );
    assert.ok(file.src.includes('<my-loud'), 'custom element preserved');
    assert.ok(file.src.includes('shadowrootmode="open"'));
  });

  it('leaves the element untouched when the shadowrootmode ATTRIBUTE is uppercase', async () => {
    // REAL behavior: the DSD detection regex is case-insensitive, but the
    // renderer locates the shadow template via querySelector, and linkedom
    // preserves attribute-name case — so SHADOWROOTMODE is detected as DSD
    // intent yet never rendered. The host element passes through unmodified
    // (it is not flat-rendered either). Authors must lowercase the attribute.
    const file = await run(
      '<my-loud>content</my-loud>',
      { 'my-loud.html': '<TEMPLATE SHADOWROOTMODE="open"><div class="in"><slot></slot></div></TEMPLATE>' }
    );
    assert.ok(file.src.includes('<my-loud>content</my-loud>'), 'element left as-is');
    assert.ok(!file.src.includes('shadowrootmode='), 'no shadow template injected');
    assert.ok(!file.src.includes('class="in"'), 'not flat-rendered either');
  });
});


describe('DSD Component Rendering', () => {
  const dsdTemplate = `<template shadowrootmode="open">
  <style>:host { display: block; } .card { border: 1px solid #ccc; }</style>
  <div class="card">
    <h3>\${title}</h3>
    <slot></slot>
  </div>
</template>`;

  it('preserves the custom element in output', async () => {
    const file = await run(
      '<my-card title="Hello"><p>Content</p></my-card>',
      { 'my-card.html': dsdTemplate }
    );
    assert.ok(file.src.includes('<my-card'), 'custom element should be preserved');
    assert.ok(file.src.includes('</my-card>'), 'custom element closing tag should be preserved');
  });

  it('injects <template shadowrootmode="open">', async () => {
    const file = await run(
      '<my-card title="Test"><p>Hi</p></my-card>',
      { 'my-card.html': dsdTemplate }
    );
    assert.ok(file.src.includes('shadowrootmode="open"'), 'should contain shadowrootmode attribute');
  });

  it('resolves attribute variables in shadow content', async () => {
    const file = await run(
      '<my-card title="Resolved Title"><p>Body</p></my-card>',
      { 'my-card.html': dsdTemplate }
    );
    assert.ok(file.src.includes('Resolved Title'), 'title should be resolved from attribute');
    assert.ok(!file.src.includes('${title}'), 'template variable should not remain');
  });

  it('keeps styles inside the shadow root (not extracted to <head>)', async () => {
    const file = await run(
      '<my-card title="Test"></my-card>',
      { 'my-card.html': dsdTemplate }
    );
    const { document } = parseHTML(file.src);
    const headHTML = document.head ? document.head.innerHTML : '';
    assert.ok(!headHTML.includes(':host'), 'styles should NOT be in <head>');
    assert.ok(file.src.includes(':host { display: block; }'), 'styles should be in shadow root');
  });

  it('preserves <slot> elements in shadow template', async () => {
    const file = await run(
      '<my-card title="Test"><p>Slotted</p></my-card>',
      { 'my-card.html': dsdTemplate }
    );
    assert.ok(file.src.includes('<slot></slot>'), 'native <slot> should be preserved');
  });

  it('preserves light DOM children as host children', async () => {
    const file = await run(
      '<my-card title="Test"><p>Light DOM</p></my-card>',
      { 'my-card.html': dsdTemplate }
    );
    assert.ok(file.src.includes('<p>Light DOM</p>'), 'light DOM content should remain');
    const cardContent = file.src.match(/<my-card[^>]*>([\s\S]*?)<\/my-card>/);
    assert.ok(cardContent, 'should match my-card content');
    assert.ok(cardContent[1].includes('<p>Light DOM</p>'), 'light DOM should be inside the custom element');
  });

  it('handles named slots (preserves slot attributes on children)', async () => {
    const namedSlotTemplate = `<template shadowrootmode="open">
      <header><slot name="header"></slot></header>
      <main><slot></slot></main>
    </template>`;
    const file = await run(
      '<my-layout><h2 slot="header">Title</h2><p>Body</p></my-layout>',
      { 'my-layout.html': namedSlotTemplate }
    );
    assert.ok(file.src.includes('<slot name="header">'), 'named slot should be preserved');
    assert.ok(file.src.includes('slot="header"'), 'slot attribute on child should be preserved');
  });

  it('renders multiple instances with a separate <template> each', async () => {
    const file = await run(
      `<my-card title="First"><p>A</p></my-card>
      <my-card title="Second"><p>B</p></my-card>`,
      { 'my-card.html': dsdTemplate }
    );
    const matches = file.src.match(/shadowrootmode="open"/g);
    assert.strictEqual(matches?.length, 2, 'each instance should get its own DSD template');
    assert.ok(file.src.includes('First'), 'first instance attributes resolved');
    assert.ok(file.src.includes('Second'), 'second instance attributes resolved');
  });

  it('resolves global data in shadow content', async () => {
    const globalTemplate = `<template shadowrootmode="open">
      <p>\${siteName}</p>
      <slot></slot>
    </template>`;
    const file = await run(
      '<site-banner>content</site-banner>',
      { 'site-banner.html': globalTemplate },
      { siteName: 'My Site' }
    );
    assert.ok(file.src.includes('My Site'), 'global data should resolve in shadow content');
  });
});


describe('Flat Component Rendering (regression)', () => {
  const flatTemplate = `<style>.card { border: 1px solid; }</style>
<article class="card">
  <h3>\${name}</h3>
  <p>\${description}</p>
  \${slot}
</article>`;

  it('removes the custom element', async () => {
    const file = await run(
      '<product-card name="Pack" description="A backpack"><span>Details</span></product-card>',
      { 'product-card.html': flatTemplate }
    );
    assert.ok(!file.src.includes('<product-card'), 'custom element should be removed');
  });

  it('expands template with attribute data', async () => {
    const file = await run(
      '<product-card name="Trail Pack" description="Ultralight"></product-card>',
      { 'product-card.html': flatTemplate }
    );
    assert.ok(file.src.includes('Trail Pack'), 'name attribute should resolve');
    assert.ok(file.src.includes('Ultralight'), 'description attribute should resolve');
  });

  it('injects slot content', async () => {
    const file = await run(
      '<product-card name="X" description="Y"><em>Bonus</em></product-card>',
      { 'product-card.html': flatTemplate }
    );
    assert.ok(file.src.includes('<em>Bonus</em>'), 'slot content should be injected');
  });

  it('extracts flat component styles to <head> instead of shadow DOM', async () => {
    const file = await run(
      '<product-card name="X" description="Y">z</product-card>',
      { 'product-card.html': flatTemplate }
    );
    assert.ok(!file.src.includes('shadowrootmode'), 'flat component must not get a shadow root');
    const { document } = parseHTML(file.src);
    const headStyle = document.querySelector('head style');
    assert.ok(!!headStyle, 'component CSS should be consolidated into <head>');
    assert.ok(headStyle.textContent.includes('.card { border: 1px solid; }'));
    // Style must not be duplicated into the body
    assert.ok(!document.querySelector('body style'), 'no <style> should remain in the body');
  });
});
