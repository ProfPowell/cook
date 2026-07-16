/**
 * @file external-link-protocol.test.js
 * @description Tests the REAL replace-external-link-protocol plugin.
 * It has been a silent no-op since the linkedom migration: it looked for
 * 'localhost' in href values, which only appeared when real JSDOM
 * resolved relative URLs against a localhost base.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import replaceExternalLinkProtocol from '../scripts/plugins/replace-external-link-protocol.js';

const PAGE = (body) => `<!DOCTYPE html>
<html lang="en">
<head><title>t</title></head>
<body>${body}</body>
</html>`;

async function run(body) {
  const file = { ext: 'html', path: 'dist/index.html', name: 'index', src: PAGE(body) };
  await replaceExternalLinkProtocol({ file, allowType: ['.html'] });
  return file;
}

describe('replace-external-link-protocol', () => {

  test('www. href without protocol gets http://', async () => {
    const file = await run(`<a href="www.example.com">ex</a>`);
    assert.ok(file.src.includes('href="http://www.example.com"'), file.src);
  });

  test('cdn. script src without protocol gets http://', async () => {
    const file = await run(`<script src="cdn.example.com/lib.js"></script>`);
    assert.ok(file.src.includes('src="http://cdn.example.com/lib.js"'), file.src);
  });

  test('links that already have a protocol are untouched', async () => {
    const file = await run(`<a href="https://www.example.com">ex</a><a href="mailto:x@y.com">m</a>`);
    assert.ok(file.src.includes('href="https://www.example.com"'), file.src);
    assert.ok(file.src.includes('href="mailto:x@y.com"'), file.src);
  });

  test('relative and protocol-relative paths are untouched', async () => {
    const file = await run(
      `<a href="/www-guide/">g</a><a href="//cdn.example.com/x.js">p</a><a href="docs/page.html">d</a>`
    );
    assert.ok(file.src.includes('href="/www-guide/"'), file.src);
    assert.ok(file.src.includes('href="//cdn.example.com/x.js"'), file.src);
    assert.ok(file.src.includes('href="docs/page.html"'), file.src);
  });
});
