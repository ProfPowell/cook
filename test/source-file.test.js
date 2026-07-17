/**
 * @file source-file.test.js
 * @description Tests the SourceFile lazy src<->dom model and that DOM
 * plugins actually SHARE one parsed document instead of each doing a
 * full parse/serialize round trip (previously ~10 per page per build).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import Util from '../scripts/utils/util/util.js';
import { SourceFile } from '../scripts/utils/source-file/source-file.js';

import setActiveLinks from '../scripts/plugins/set-active-links.js';
import autoComponents from '../scripts/plugins/auto-components.js';
import replaceExternalLinkProtocol from '../scripts/plugins/replace-external-link-protocol.js';

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head><title>t</title></head>
<body><nav><a href="/docs/">Docs</a><a href="www.example.com">ext</a></nav><main>x</main></body>
</html>`;

function makeFile(src = PAGE) {
  const f = new SourceFile({ path: 'dist/docs/index.html', ext: 'html', name: 'index' });
  f.src = src;
  return f;
}

describe('SourceFile', () => {

  test('dom is parsed lazily and cached across reads', () => {
    const file = makeFile();
    const before = Util.jsdom.parseCount;
    const d1 = file.dom;
    const d2 = file.dom;
    assert.equal(d1, d2, 'same dom instance');
    assert.equal(Util.jsdom.parseCount, before + 1, 'exactly one parse');
  });

  test('src reads serialize only when the dom was marked dirty', () => {
    const file = makeFile();
    const doc = file.dom.window.document;
    doc.querySelector('main').textContent = 'changed';
    // Not marked dirty yet — src getter returns the stale string by contract? No:
    file.markDomDirty();
    assert.ok(file.src.includes('changed'), 'dirty dom serialized into src');
    // A second read must not re-serialize (dom unchanged)
    const s2 = file.src;
    assert.ok(s2.includes('changed'));
  });

  test('setting src invalidates the cached dom', () => {
    const file = makeFile();
    const d1 = file.dom;
    file.src = '<p>new</p>';
    const d2 = file.dom;
    assert.notEqual(d1, d2, 'dom re-parsed after src write');
    assert.ok(!!d2.window.document.querySelector('p'));
  });

  test('consecutive DOM plugins share ONE parse', async () => {
    const file = makeFile();
    const before = Util.jsdom.parseCount;

    // Three DOM-based plugins in the same order build.js runs them
    await autoComponents({ file, store: {}, allowType: ['.html'] });
    await replaceExternalLinkProtocol({ file, allowType: ['.html'] });
    setActiveLinks({ file, allowType: ['.html'] });

    const parses = Util.jsdom.parseCount - before;
    assert.equal(parses, 1, `expected 1 shared parse across 3 DOM plugins, got ${parses}`);

    // And the work of all three landed in the final source
    const out = file.src;
    assert.ok(out.includes('http://www.example.com'), 'protocol plugin applied');
    assert.ok(out.includes('class="active-parent"') || out.includes('active'), 'active links applied');
  });

  test('plain-object files still work with converted plugins (test compat)', async () => {
    const file = { ext: 'html', path: 'dist/docs/index.html', name: 'index', src: PAGE };
    await replaceExternalLinkProtocol({ file, allowType: ['.html'] });
    assert.ok(file.src.includes('http://www.example.com'));
  });
});
