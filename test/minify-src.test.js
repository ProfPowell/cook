/**
 * @file minify-src.test.js
 * @description Tests the real minify-src plugin (imported, not replicated).
 * Guards against the inline-script scratch-register bug where a page
 * containing a non-JS <script> (JSON-LD, importmap) had its entire
 * source replaced by that script's text in production builds.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import minifySrc from '../scripts/plugins/minify-src.js';

// The plugin early-exits when NODE_ENV is 'development'.
// Tests must run in production mode.
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';
process.on('exit', () => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

const PAGE_SHELL = (inner) => `<!DOCTYPE html>
<html lang="en">
<head><title>Test Page</title></head>
<body>
  <h1>Real page content</h1>
  <p>This must survive minification.</p>
  ${inner}
</body>
</html>`;

function makeFile(src, ext = 'html', path = 'dist/test/index.html') {
  return { src, ext, path, name: 'index' };
}

describe('minify-src: non-JS inline scripts', () => {

  test('page with JSON-LD script is not replaced by the script content', async () => {
    const jsonLd = '{"@context":"https://schema.org","@type":"Article","headline":"Hi"}';
    const file = makeFile(PAGE_SHELL(`<script type="application/ld+json">${jsonLd}</script>`));

    await minifySrc({ file, disallowType: ['.json', '.webmanifest'] });

    // The page must still be a page…
    assert.match(file.src, /<h1>Real page content<\/h1>/);
    assert.match(file.src, /<title>Test Page<\/title>/);
    // …and the JSON-LD must still be present and intact
    assert.ok(file.src.includes('schema.org'), 'JSON-LD content should be preserved');
    // …and the file must NOT have collapsed to just the script text
    assert.notEqual(file.src.trim(), jsonLd);
  });

  test('page with an import map is not destroyed', async () => {
    const importMap = '{"imports":{"vb/":"/assets/components/"}}';
    const file = makeFile(PAGE_SHELL(`<script type="importmap">${importMap}</script>`));

    await minifySrc({ file, disallowType: ['.json', '.webmanifest'] });

    assert.match(file.src, /<h1>Real page content<\/h1>/);
    assert.ok(file.src.includes('"imports"'), 'import map content should be preserved');
  });

  test('regular inline JS is still minified', async () => {
    const file = makeFile(PAGE_SHELL(`<script>const answer = 1 + 1; console.log( answer );</script>`));

    await minifySrc({ file, disallowType: ['.json', '.webmanifest'] });

    assert.match(file.src, /<h1>Real page content<\/h1>/);
    // Whitespace inside the script should be gone after terser
    assert.ok(!file.src.includes('const answer = 1 + 1;'), 'inline JS should be minified');
    assert.ok(file.src.includes('console.log'), 'inline JS behavior should be preserved');
  });

  test('inline module script survives (import syntax)', async () => {
    const file = makeFile(PAGE_SHELL(`<script type="module">import { x } from '/assets/x.js'; x();</script>`));

    await minifySrc({ file, disallowType: ['.json', '.webmanifest'] });

    assert.match(file.src, /<h1>Real page content<\/h1>/);
    assert.ok(file.src.includes('/assets/x.js'), 'module import specifier should be preserved');
  });
});

describe('minify-src: file.src integrity', () => {

  test('unrecognized extension leaves file.src unchanged (not undefined)', async () => {
    const original = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const file = makeFile(original, 'svg', 'dist/img/logo.svg');

    await minifySrc({ file, disallowType: ['.json', '.webmanifest'] });

    assert.equal(file.src, original);
  });

  test('standalone JS file with a syntax error keeps its original source', async () => {
    const broken = 'function ( { oops';
    const file = makeFile(broken, 'js', 'dist/assets/broken.js');

    await minifySrc({ file, disallowType: ['.json', '.webmanifest'] });

    assert.equal(typeof file.src, 'string', 'file.src must remain a string');
    assert.equal(file.src, broken);
  });
});
