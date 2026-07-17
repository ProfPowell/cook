/**
 * @file site-pages.test.js
 * @description Tests the shared post-loop page snapshot: one dist walk
 * and ONE parse per page, consumed by generate-fragments and
 * generate-formats (each previously re-walked dist and re-parsed every
 * page independently).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Util from '../scripts/utils/util/util.js';
import { collectSitePages } from '../scripts/utils/site-pages/site-pages.js';
import generateFragments from '../scripts/plugins/generate-fragments.js';
import generateFormats from '../scripts/plugins/generate-formats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureAbs = path.join(__dirname, 'fixtures-site-pages');
const DIST = 'test/fixtures-site-pages';

const PAGE = (title, body) => `<!DOCTYPE html>
<html lang="en"><head><title>${title}</title><meta name="description" content="${title} desc"></head>
<body><main><h1>${title}</h1>${body}</main></body></html>`;

before(async () => {
  await fs.rm(fixtureAbs, { recursive: true, force: true });
  for (const d of ['', 'about', 'docs/intro']) {
    await fs.mkdir(path.join(fixtureAbs, d), { recursive: true });
  }
  await fs.writeFile(path.join(fixtureAbs, 'index.html'), PAGE('Home', '<p>home</p>'));
  await fs.writeFile(path.join(fixtureAbs, 'about/index.html'), PAGE('About', '<p>about</p>'));
  await fs.writeFile(path.join(fixtureAbs, 'docs/intro/index.html'), PAGE('Intro', '<p>intro</p>'));
});

after(async () => {
  await fs.rm(fixtureAbs, { recursive: true, force: true });
});

describe('collectSitePages', () => {

  test('returns one entry per index page with urlPath, src, and parsed dom', async () => {
    const pages = await collectSitePages(DIST);
    assert.equal(pages.length, 3);
    const urls = pages.map(p => p.urlPath).sort();
    assert.deepEqual(urls, ['/', '/about/', '/docs/intro/']);
    const about = pages.find(p => p.urlPath === '/about/');
    assert.ok(about.src.includes('<h1>About</h1>'));
    assert.equal(about.dom.window.document.querySelector('h1').textContent, 'About');
  });

  test('fragments + formats consume the snapshot with ZERO additional parses', async () => {
    const pages = await collectSitePages(DIST);

    const before = Util.jsdom.parseCount;
    await generateFragments({ pages, distPath: DIST });
    await generateFormats({ store: {}, data: { siteTitle: 'T' }, pages, distPath: DIST });
    const delta = Util.jsdom.parseCount - before;

    assert.equal(delta, 0, `expected 0 additional parses, got ${delta}`);

    // Fragments written from the shared doms
    assert.ok(existsSync(path.join(fixtureAbs, 'about/_fragment.html')));
    const frag = await fs.readFile(path.join(fixtureAbs, 'about/_fragment.html'), 'utf-8');
    assert.ok(frag.includes('<h1>About</h1>'));
    assert.ok(!/<html|<body/i.test(frag));

    // JSON metadata written from the shared doms
    const metaPath = path.join(fixtureAbs, 'api/about.json');
    assert.ok(existsSync(metaPath), 'api/about.json missing');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    assert.equal(meta.title, 'About');
    assert.equal(meta.description, 'About desc');
  });

  test('plugins still work standalone (no snapshot provided)', async () => {
    await fs.rm(path.join(fixtureAbs, 'about/_fragment.html'), { force: true });
    await generateFragments({ distPath: DIST });
    assert.ok(existsSync(path.join(fixtureAbs, 'about/_fragment.html')));
  });
});
