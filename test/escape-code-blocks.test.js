/**
 * @file escape-code-blocks.test.js
 * @description Tests the REAL escape-code-blocks plugin and its restore
 * counterpart. Guards against: data-escape="true" leaving an orphaned
 * ="true" in the tag, and empty code blocks whose data-cook-esc=""
 * never matched the restore regex ([^"]+) and shipped encoded.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import escapeCodeBlocks, { restoreCodeBlocks } from '../scripts/plugins/escape-code-blocks.js';

async function escape(body) {
  const file = { ext: 'html', path: 'dist/index.html', name: 'index', src: body };
  await escapeCodeBlocks({ file, allowType: ['.html'] });
  return file;
}

describe('escape-code-blocks', () => {

  test('bare data-escape round-trips content as entities', async () => {
    const file = await escape(`<code-block data-escape language="html">\n<div class="x">hi</div>\n</code-block>`);
    assert.ok(file.src.includes('data-cook-esc='), file.src);
    assert.ok(!file.src.includes('<div class="x">'), 'content should be encoded away');

    const restored = restoreCodeBlocks(file.src);
    assert.ok(restored.includes('&lt;div class=&quot;x&quot;&gt;hi&lt;/div&gt;'), restored);
    assert.ok(!restored.includes('data-cook-esc'), restored);
  });

  test('data-escape="true" leaves no orphaned ="true" in the tag', async () => {
    const file = await escape(`<code-block data-escape="true" language="js">const a = 1;</code-block>`);
    assert.ok(!file.src.includes('="true"'), `orphaned attribute value:\n${file.src}`);

    const restored = restoreCodeBlocks(file.src);
    assert.ok(restored.includes('const a = 1;'), restored);
    assert.ok(restored.includes('language="js"'), restored);
  });

  test('empty code block round-trips cleanly', async () => {
    const file = await escape(`<code-block data-escape language="css"></code-block>`);
    const restored = restoreCodeBlocks(file.src);
    assert.ok(!restored.includes('data-cook-esc'), `encoded attr shipped:\n${restored}`);
    assert.ok(restored.includes('<code-block language="css"></code-block>'), restored);
  });

  test('content with ${vars} and $-patterns survives the round trip', async () => {
    const file = await escape(`<code-block data-escape>const t = \`\${title}\`; s.replace(/x/, "$&");</code-block>`);
    const restored = restoreCodeBlocks(file.src);
    assert.ok(restored.includes('${title}'), restored);
    assert.ok(restored.includes('$&'.replace('&', '&amp;')) || restored.includes('$&'), restored);
  });
});
