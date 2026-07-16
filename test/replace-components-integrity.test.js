/**
 * @file replace-components-integrity.test.js
 * @description Tests the REAL replace-components plugin for:
 * 1. Attribute value escaping — values are DOM-decoded then re-injected;
 *    without escaping, quotes truncate attributes and entities become live markup.
 * 2. Double-processing — an element matching both the custom-element and
 *    data-component patterns was processed twice.
 * 3. DSD idempotency — re-running the plugin duplicated shadow templates.
 * 4. transferAttributes — when rendered output starts with text, class/id
 *    leaked onto an unrelated pre-existing sibling.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import replaceComponents from '../scripts/plugins/replace-components.js';

const PAGE = (body) => `<!DOCTYPE html>
<html lang="en">
<head><title>t</title></head>
<body>${body}</body>
</html>`;

async function run(body, cachedComponents, { data = {}, store } = {}) {
  const file = { ext: 'html', path: 'dist/index.html', name: 'index', src: PAGE(body) };
  const theStore = store || { cachedComponents };
  await replaceComponents({ file, store: theStore, data, allowType: ['.html'] });
  return file;
}

describe('replace-components: attribute value escaping', () => {

  test('quotes and ampersands in attributes survive round-trip', async () => {
    const file = await run(
      `<my-card title="Q &amp; A &quot;live&quot;"></my-card>`,
      { 'my-card.html': `<h2 title="\${title}">\${title}</h2>` }
    );

    const { document } = parseHTML(file.src);
    const h2 = document.querySelector('h2');
    assert.ok(!!h2, `expected an <h2>, got:\n${file.src}`);
    assert.equal(h2.getAttribute('title'), 'Q & A "live"');
    // No junk outside the attribute
    assert.ok(!file.src.includes('live""'), `attribute leaked as junk:\n${file.src}`);
  });

  test('entity-encoded markup in an attribute does not become live elements', async () => {
    const file = await run(
      `<my-card title="&lt;img src=x onerror=alert(1)&gt;"></my-card>`,
      { 'my-card.html': `<h2>\${title}</h2>` }
    );

    const { document } = parseHTML(file.src);
    // NOTE: never pass a linkedom Element to assert.equal — the failure
    // diff walks the circular DOM graph and OOMs the test runner.
    assert.ok(!document.querySelector('img'), `injected <img> found:\n${file.src}`);
  });

  test('slot content is real HTML and is NOT escaped', async () => {
    const file = await run(
      `<my-card><em>hello</em></my-card>`,
      { 'my-card.html': `<div class="card">\${slot}</div>` }
    );

    const { document } = parseHTML(file.src);
    assert.ok(!!document.querySelector(".card em"), `slot HTML should stay HTML:\n${file.src}`);
  });
});

describe('replace-components: double-processing', () => {

  test('element matching both patterns renders exactly once', async () => {
    const file = await run(
      `<my-widget data-component="widget"></my-widget>`,
      {
        'my-widget.html': `<div class="w">expanded</div>`,
        'widget.html': `<div class="w">expanded</div>`,
      }
    );

    const count = (file.src.match(/class="w"/g) || []).length;
    assert.equal(count, 1, `component should render once, got ${count}:\n${file.src}`);
  });

  test('DSD element matching both patterns gets exactly one shadow template', async () => {
    const dsd = `<template shadowrootmode="open"><slot></slot></template>`;
    const file = await run(
      `<my-tabs data-component="tabs">content</my-tabs>`,
      { 'my-tabs.html': dsd, 'tabs.html': dsd }
    );

    const count = (file.src.match(/shadowrootmode/g) || []).length;
    assert.equal(count, 1, `expected 1 shadow template, got ${count}:\n${file.src}`);
  });
});

describe('replace-components: DSD idempotency', () => {

  test('re-running the plugin does not duplicate shadow templates', async () => {
    const cached = { 'my-tabs.html': `<template shadowrootmode="open"><slot></slot></template>` };
    const file = await run(`<my-tabs>content</my-tabs>`, cached);
    const onceSrc = file.src;

    // Simulate a second pass over already-processed output (dev rebuild)
    const file2 = { ext: 'html', path: 'dist/index.html', name: 'index', src: onceSrc };
    await replaceComponents({ file: file2, store: { cachedComponents: cached }, data: {}, allowType: ['.html'] });

    const count = (file2.src.match(/shadowrootmode/g) || []).length;
    assert.equal(count, 1, `expected 1 shadow template after re-run, got ${count}:\n${file2.src}`);
  });
});

describe('replace-components: transferAttributes', () => {

  test('class does not leak onto unrelated sibling when output starts with text', async () => {
    const file = await run(
      `<my-note class="warn">be careful</my-note><footer>f</footer>`,
      { 'my-note.html': `Note: \${slot}` }
    );

    const { document } = parseHTML(file.src);
    const footer = document.querySelector('footer');
    assert.ok(!!footer);
    assert.ok(!footer.classList.contains('warn'), `footer stole class="warn":\n${file.src}`);
    assert.ok(file.src.includes('Note: be careful'));
  });

  test('class transfers to the first rendered element when output starts with one', async () => {
    const file = await run(
      `<my-note class="warn" id="n1">x</my-note>`,
      { 'my-note.html': `<aside>\${slot}</aside>` }
    );

    const { document } = parseHTML(file.src);
    const aside = document.querySelector('aside');
    assert.ok(!!aside);
    assert.equal(aside.getAttribute('class'), 'warn');
    assert.equal(aside.getAttribute('id'), 'n1');
  });
});
