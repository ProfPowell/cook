/**
 * @file set-active-links.test.js
 * @description Tests the REAL set-active-links plugin. The old logic
 * reduced both link href and page path to the last path segment, so
 * /company/about/ was marked active on /legal/about/, and even external
 * links like https://example.com/pricing matched /pricing/.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import setActiveLinks from '../scripts/plugins/set-active-links.js';

const PAGE = (body) => `<!DOCTYPE html>
<html lang="en">
<head><title>t</title></head>
<body><nav>${body}</nav></body>
</html>`;

async function run(pagePath, body) {
  const file = { ext: 'html', path: pagePath, name: 'index', src: PAGE(body) };
  await setActiveLinks({ file, allowType: ['.html'] });
  return parseHTML(file.src).document;
}

function classesOf(document, selector) {
  return (document.querySelector(selector).getAttribute('class') || '').split(/\s+/).filter(Boolean);
}

describe('set-active-links', () => {

  test('exact path match gets active', async () => {
    const doc = await run('dist/legal/about/index.html', `<a id="l" href="/legal/about/">About</a>`);
    assert.deepEqual(classesOf(doc, '#l'), ['active']);
  });

  test('same last segment under a DIFFERENT parent is NOT active', async () => {
    const doc = await run('dist/legal/about/index.html', `<a id="l" href="/company/about/">Company About</a>`);
    assert.deepEqual(classesOf(doc, '#l'), [], 'false-positive active on sibling path');
  });

  test('external link with matching segment is NOT active', async () => {
    const doc = await run('dist/pricing/index.html', `<a id="l" href="https://example.com/pricing">Ext</a>`);
    assert.deepEqual(classesOf(doc, '#l'), [], 'external link falsely marked active');
  });

  test('ancestor path gets active-parent', async () => {
    const doc = await run('dist/legal/about/index.html', `<a id="l" href="/legal/">Legal</a>`);
    assert.deepEqual(classesOf(doc, '#l'), ['active-parent']);
  });

  test('root link is not active-parent everywhere, but active on home', async () => {
    const sub = await run('dist/docs/index.html', `<a id="l" href="/">Home</a>`);
    assert.deepEqual(classesOf(sub, '#l'), [], 'root link marked on subpage');

    const home = await run('dist/index.html', `<a id="l" href="/">Home</a>`);
    assert.deepEqual(classesOf(home, '#l'), ['active']);
  });

  test('.html-style link matches its directory-converted page', async () => {
    const doc = await run('dist/contact/index.html', `<a id="l" href="/contact.html">Contact</a>`);
    assert.deepEqual(classesOf(doc, '#l'), ['active']);
  });
});
