/**
 * @file get-src.test.js
 * @description Tests the real getSrcConfig — source must be read back
 * byte-for-byte. Guards against the removeCommentTags mangler, which
 * corrupted any line containing `//` (protocol-relative URLs) by
 * stripping the first `<` and `>` from the rest of the line.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getSrcConfig } from '../scripts/utils/get-src/get-src.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, 'fixtures-get-src');

before(async () => {
  await fs.mkdir(fixtureDir, { recursive: true });
});

after(async () => {
  await fs.rm(fixtureDir, { recursive: true, force: true });
});

async function readBack(name, content) {
  const filePath = path.join(fixtureDir, name);
  await fs.writeFile(filePath, content);
  const file = await getSrcConfig({ fileName: filePath });
  return file.src;
}

describe('getSrcConfig: source integrity', () => {

  test('protocol-relative script URL survives untouched', async () => {
    const content = `<!DOCTYPE html>
<html>
<head>
  <script src="//unpkg.com/some-lib@1/dist/lib.js"></script>
</head>
<body><p>hi</p></body>
</html>`;
    assert.equal(await readBack('protocol-relative.html', content), content);
  });

  test('CSS with protocol-relative url() survives untouched', async () => {
    const content = `.hero { background: url(//cdn.example.com/img.png) no-repeat; }`;
    assert.equal(await readBack('proto.css', content), content);
  });

  test('JS line comments containing angle brackets survive untouched', async () => {
    const content = `// renders <my-widget> into the DOM
const el = document.createElement('my-widget');
/* block comment with <div> too */
export default el;`;
    assert.equal(await readBack('comments.js', content), content);
  });

  test('HTML comment containing an unclosed tag survives untouched', async () => {
    const content = `<!DOCTYPE html>
<html><body>
<!-- TODO: re-enable <aside> here -->
<p>content</p>
</body></html>`;
    assert.equal(await readBack('comment-tag.html', content), content);
  });
});
