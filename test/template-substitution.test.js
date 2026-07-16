/**
 * @file template-substitution.test.js
 * @description Tests the REAL apply-template and process-markdown plugins
 * (imported, not replicated) for content-substitution integrity.
 *
 * Guards against two corruption bugs fatal to documentation sites:
 * 1. `${content}` inserted via String.replace replacement-string semantics,
 *    so `$&`, `$$`, `` $` ``, `$'` inside page content get mangled.
 * 2. The `${var}` pass running over already-inserted page content, so a
 *    code sample showing `${title}` gets replaced with the page's title.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import applyTemplate from '../scripts/plugins/apply-template.js';
import { ProcessMarkdown } from '../scripts/plugins/process-markdown.js';

// ---------------------------------------------------------------
// apply-template (HTML pages with data-template)
// ---------------------------------------------------------------

const LAYOUT = `<!DOCTYPE html>
<html lang="en">
<head><title>\${title}</title></head>
<body><header>\${title}</header><main>\${content}</main></body>
</html>`;

function makePage(bodyContent, { title = 'Real Title' } = {}) {
  return {
    ext: 'html',
    path: 'dist/docs/index.html',
    name: 'index',
    src: `<!DOCTYPE html>
<html data-template="doc">
<head><title>${title}</title></head>
<body><main>${bodyContent}</main></body>
</html>`,
  };
}

function makeStore() {
  return { cachedLayouts: { doc: LAYOUT } };
}

describe('apply-template: content substitution integrity', () => {

  test('content containing $&, $$, $` survives verbatim', async () => {
    const code = 'str.replace(/x/, "$&") costs $$5 and $` too';
    const file = makePage(`<code>${code}</code>`);

    await applyTemplate({ file, store: makeStore(), allowType: ['.html'] });

    assert.ok(file.src.includes(code), `expected code sample intact, got:\n${file.src}`);
    // Layout was actually applied (title variable resolved)
    assert.match(file.src, /<header>Real Title<\/header>/);
  });

  test('${title} inside page content is not substituted by apply-template', async () => {
    const file = makePage('<code>Use ${title} in your layout</code>');

    await applyTemplate({ file, store: makeStore(), allowType: ['.html'] });

    // The layout's own ${title} resolves…
    assert.match(file.src, /<header>Real Title<\/header>/);
    // …but the one inside page content must remain literal
    assert.ok(
      file.src.includes('Use ${title} in your layout'),
      `expected literal \${title} in content, got:\n${file.src}`
    );
  });

  test('named slot content with $-patterns survives', async () => {
    const slotLayout = `<!DOCTYPE html><html><body><aside>\${slot:side}</aside><main>\${content}</main></body></html>`;
    const store = { cachedLayouts: { doc: slotLayout } };
    const file = makePage(`<template slot="side">price: $$9 or $&</template><p>body</p>`);

    await applyTemplate({ file, store, allowType: ['.html'] });

    assert.ok(file.src.includes('price: $$9 or $&'), `expected slot content intact, got:\n${file.src}`);
    assert.match(file.src, /<p>body<\/p>/);
  });
});

// ---------------------------------------------------------------
// process-markdown (markdown layout application)
// ---------------------------------------------------------------

describe('process-markdown: layout substitution integrity', () => {

  function makeProcessor(layout) {
    return new ProcessMarkdown({
      store: { cachedLayouts: { post: layout } },
      data: { siteName: 'My Site' },
    });
  }

  test('markdown content with $-patterns survives layout merge', async () => {
    const proc = makeProcessor('<html><body><h1>${title}</h1><main>${content}</main></body></html>');
    const content = '<pre><code>regex.replace(/a/, "$&amp;") // and $$ money $`</code></pre>';

    const html = await proc.applyLayout('post', { title: 'Post', content });

    assert.ok(html.includes(content), `expected content intact, got:\n${html}`);
    assert.match(html, /<h1>Post<\/h1>/);
  });

  test('${title} inside a markdown code sample is not substituted', async () => {
    const proc = makeProcessor('<html><body><h1>${title}</h1><main>${content}</main></body></html>');
    const content = '<pre><code>Set your layout heading to ${title}</code></pre>';

    const html = await proc.applyLayout('post', { title: 'Actual Title', content });

    assert.match(html, /<h1>Actual Title<\/h1>/);
    assert.ok(
      html.includes('to ${title}</code>'),
      `expected literal \${title} in code sample, got:\n${html}`
    );
  });

  test('global data still resolves in the layout itself', async () => {
    const proc = makeProcessor('<html><head><title>${title} — ${siteName}</title></head><body>${content}</body></html>');

    const html = await proc.applyLayout('post', { title: 'T', content: '<p>c</p>' });

    assert.match(html, /T — My Site/);
  });
});
