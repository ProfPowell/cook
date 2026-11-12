/**
 * @file replace-include.test.js
 * @description Tests the REAL replace-include plugin.
 * Guards against: bare include= pages being skipped entirely,
 * <include-file> markers with attributes before src never matching,
 * and a single missing include aborting the whole build via process.exit.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import replaceInclude from '../scripts/plugins/replace-include.js';

const PAGE = (body) => `<!DOCTYPE html>
<html lang="en">
<head><title>t</title></head>
<body>${body}</body>
</html>`;

const NAV = `<nav class="site-nav"><a href="/">Home</a></nav>`;
const MARKED = `<!-- layout-fragment -->\n${NAV}\n`;

// The plugin resolves includes against `${srcPath}/` (srcPath = 'src'),
// checking store.cachedIncludes first — seed the cache so tests need no
// files on disk. Keys are absolute resolved paths.
function seededStore() {
  return {
    cachedIncludes: {
      [path.resolve('src/includes/nav.html')]: NAV,
      [path.resolve('src/includes/marked.html')]: MARKED,
      [path.resolve('src/includes/plain-comment.html')]: '<!-- note -->\n' + NAV,
    },
  };
}

async function run(body, store = seededStore()) {
  const file = { ext: 'html', path: 'dist/docs/index.html', name: 'index', src: PAGE(body) };
  await replaceInclude({ file, store, allowType: ['.html'] });
  return file;
}

describe('replace-include: marker matching', () => {

  test('data-include element is replaced', async () => {
    const file = await run(`<div data-include="/includes/nav.html"></div>`);
    assert.ok(file.src.includes('site-nav'), `include not resolved:\n${file.src}`);
    assert.ok(!file.src.includes('data-include'), `marker shipped:\n${file.src}`);
  });

  test('bare include attribute is replaced (not skipped by early exit)', async () => {
    const file = await run(`<div include="/includes/nav.html"></div>`);
    assert.ok(file.src.includes('site-nav'), `bare include= not resolved:\n${file.src}`);
    assert.ok(!file.src.includes('include='), `marker shipped:\n${file.src}`);
  });

  test('include-file with attributes before src is replaced', async () => {
    const file = await run(`<include-file lazy src="/includes/nav.html"></include-file>`);
    assert.ok(file.src.includes('site-nav'), `attr-order include-file not resolved:\n${file.src}`);
    assert.ok(!file.src.includes('<include-file'), `marker shipped:\n${file.src}`);
  });

  test('extensionless include path gets .html appended and resolves from cache', async () => {
    const file = await run(`<div data-include="/includes/nav"></div>`);
    assert.ok(file.src.includes('site-nav'), `extensionless include not resolved:\n${file.src}`);
  });
});

describe('replace-include: error handling', () => {

  test('missing include does not kill the process and leaves a marker comment', async () => {
    const file = await run(
      `<div data-include="/includes/does-not-exist.html"></div><p class="rest">still here</p>`
    );

    // The rest of the page survives, the raw marker is gone,
    // and a diagnostic comment marks the failure
    assert.ok(file.src.includes('class="rest"'));
    assert.ok(!file.src.includes('data-include='), `raw marker shipped:\n${file.src}`);
    assert.ok(file.src.includes('include-not-found'), `no diagnostic comment:\n${file.src}`);
  });

  test('one missing include does not prevent later includes from resolving', async () => {
    const file = await run(
      `<div data-include="/includes/does-not-exist.html"></div><div data-include="/includes/nav.html"></div>`
    );

    assert.ok(file.src.includes('site-nav'), `good include blocked by bad one:\n${file.src}`);
  });
});

describe('replace-include: the layout-fragment marker', () => {

  test('a marked include ships without its marker line', async () => {
    const file = await run(`<div data-include="/includes/marked.html"></div><p>after</p>`);
    assert.ok(!file.src.includes('layout-fragment'), `marker shipped:\n${file.src}`);
    assert.equal(file.src, PAGE(`${NAV}\n<p>after</p>`));
  });

  test('an unmarked include is inlined byte for byte', async () => {
    const file = await run(`<div data-include="/includes/plain-comment.html"></div>`);
    assert.equal(file.src, PAGE(`<!-- note -->\n${NAV}`));
  });
});
