/**
 * @file nested-expansion.test.js
 * @description Tests the REAL replace-components and repeat-collection
 * plugins for composition: nested components, components-in-templates,
 * nested repeats with lexical context, and robust DSD template parsing.
 *
 * Previously all of these silently shipped raw markers: the plugins
 * snapshotted the DOM once, and nodes created via string re-insertion
 * were never rescanned.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import replaceComponents from '../scripts/plugins/replace-components.js';
import repeatCollection from '../scripts/plugins/repeat-collection.js';

const PAGE = (body) => `<!DOCTYPE html>
<html lang="en">
<head><title>t</title></head>
<body>${body}</body>
</html>`;

async function runComponents(body, cachedComponents, data = {}) {
  const file = { ext: 'html', path: 'dist/index.html', name: 'index', src: PAGE(body) };
  await replaceComponents({ file, store: { cachedComponents }, data, allowType: ['.html'] });
  return file;
}

async function runRepeat(body, data) {
  const file = { ext: 'html', path: 'dist/index.html', name: 'index', src: PAGE(body) };
  await repeatCollection({ file, data, store: {}, allowType: ['.html'] });
  return file;
}

describe('replace-components: nested expansion', () => {

  test('component nested in another component slot expands', async () => {
    const file = await runComponents(
      `<my-card><my-button>Hi</my-button></my-card>`,
      {
        'my-card.html': `<div class="card">\${slot}</div>`,
        'my-button.html': `<button class="btn">\${slot}</button>`,
      }
    );

    const { document } = parseHTML(file.src);
    assert.ok(!!document.querySelector('.card .btn'), `nested component not expanded:\n${file.src}`);
    assert.ok(!file.src.includes('<my-button'), `raw <my-button> shipped:\n${file.src}`);
  });

  test('component referenced inside another component TEMPLATE expands', async () => {
    const file = await runComponents(
      `<my-hero title="Welcome"></my-hero>`,
      {
        'my-hero.html': `<section class="hero"><h1>\${title}</h1><my-button>Go</my-button></section>`,
        'my-button.html': `<button class="btn">\${slot}</button>`,
      }
    );

    const { document } = parseHTML(file.src);
    assert.ok(!!document.querySelector('.hero .btn'), `template-nested component not expanded:\n${file.src}`);
    assert.ok(!file.src.includes('<my-button'), `raw <my-button> shipped:\n${file.src}`);
  });

  test('three levels of nesting expand', async () => {
    const file = await runComponents(
      `<my-a></my-a>`,
      {
        'my-a.html': `<div class="a"><my-b></my-b></div>`,
        'my-b.html': `<div class="b"><my-c></my-c></div>`,
        'my-c.html': `<div class="c">deep</div>`,
      }
    );

    const { document } = parseHTML(file.src);
    assert.ok(!!document.querySelector('.a .b .c'), `3-level nesting failed:\n${file.src}`);
  });

  test('unknown component does not cause an infinite loop and stays in place', async () => {
    const file = await runComponents(
      `<my-known></my-known><my-unknown>keep me</my-unknown>`,
      { 'my-known.html': `<div class="k">k</div>`, 'my-unknown.html': null }
    );

    const { document } = parseHTML(file.src);
    assert.ok(!!document.querySelector('.k'));
    assert.ok(file.src.includes('<my-unknown>keep me</my-unknown>'), `unknown component mangled:\n${file.src}`);
  });
});

describe('replace-components: DSD template parsing', () => {

  test('template with attributes before shadowrootmode still renders as DSD', async () => {
    const file = await runComponents(
      `<my-tabs>content</my-tabs>`,
      { 'my-tabs.html': `<template id="tabs-tpl" shadowrootmode="open"><slot></slot></template>` }
    );

    // Element must be preserved (DSD), not flat-rendered
    assert.ok(file.src.includes('<my-tabs'), `element not preserved:\n${file.src}`);
    assert.ok(file.src.includes('shadowrootmode="open"'), `no shadow template injected:\n${file.src}`);
    // The raw template must not leak as flat page content
    assert.ok(!file.src.includes('id="tabs-tpl"'), `raw template leaked into page:\n${file.src}`);
  });

  test('shadow content containing a nested <template> is not truncated', async () => {
    const file = await runComponents(
      `<my-list>items</my-list>`,
      { 'my-list.html': `<template shadowrootmode="open"><div class="wrap"><template class="row-tpl">row</template><div class="after">after</div></div></template>` }
    );

    const { document } = parseHTML(file.src);
    const host = document.querySelector('my-list');
    assert.ok(!!host);
    const shadow = host.querySelector('template[shadowrootmode]');
    assert.ok(!!shadow, `no shadow template:\n${file.src}`);
    const inner = shadow.innerHTML;
    assert.ok(inner.includes('class="after"'), `shadow content truncated at inner </template>:\n${file.src}`);
  });
});

describe('repeat-collection: nested repeats', () => {

  test('inner repeat over the outer loop variable expands', async () => {
    const file = await runRepeat(
      `<ul data-repeat="posts as post"><li class="post">\${post.title}<span data-repeat="post.tags as tag" class="tag">\${tag}</span></li></ul>`,
      { posts: [
        { title: 'Alpha', tags: ['x', 'y'] },
        { title: 'Beta', tags: ['z'] },
      ]}
    );

    assert.ok(!file.src.includes('data-repeat'), `raw data-repeat shipped:\n${file.src}`);
    assert.ok(!file.src.includes('${tag}'), `unresolved \${tag}:\n${file.src}`);
    const { document } = parseHTML(file.src);
    const tags = Array.from(document.querySelectorAll('.tag')).map(el => el.textContent);
    assert.deepEqual(tags, ['x', 'y', 'z']);
  });

  test('flat repeat still works', async () => {
    const file = await runRepeat(
      `<article data-repeat="items as item"><h2>\${item.name}</h2></article>`,
      { items: [{ name: 'One' }, { name: 'Two' }] }
    );

    const { document } = parseHTML(file.src);
    const names = Array.from(document.querySelectorAll('h2')).map(el => el.textContent);
    assert.deepEqual(names, ['One', 'Two']);
  });
});
