/**
 * @file site-root.test.js
 * @description `siteRoot` — a subfolder of dist served at "/".
 *
 * Sites that keep pages in src/pages and deploy dist/pages (Vanilla Breeze
 * docs) got no active links at all after active-link matching moved to full
 * paths: the page resolved to /pages/docs/x/ while every link said /docs/x/.
 * The sitemap and the post-build page snapshot had the same /pages prefix.
 * Also covers aria-current on the active link and the sitemap staying off
 * when `sitemap.url` is empty.
 */

import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

import { normalizeSiteRoot, siteRootDir, fileToUrlPath } from '../scripts/utils/site-root/site-root.js';
import setActiveLinks from '../scripts/plugins/set-active-links.js';
import generateSitemap from '../scripts/plugins/generate-sitemap-xml.js';
import { collectSitePages } from '../scripts/utils/site-pages/site-pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
describe('site-root helpers', () => {
  test('normalizeSiteRoot trims slashes and empties', () => {
    assert.equal(normalizeSiteRoot(''), '');
    assert.equal(normalizeSiteRoot(undefined), '');
    assert.equal(normalizeSiteRoot('/pages/'), 'pages');
    assert.equal(normalizeSiteRoot('site/public'), 'site/public');
  });

  test('siteRootDir', () => {
    assert.equal(siteRootDir('dist', ''), 'dist');
    assert.equal(siteRootDir('dist', 'pages'), 'dist/pages');
    assert.equal(siteRootDir('dist', '/pages/'), 'dist/pages');
  });

  test('fileToUrlPath without siteRoot (dist is the web root)', () => {
    assert.equal(fileToUrlPath('dist/index.html', 'dist', ''), '/');
    assert.equal(fileToUrlPath('dist/blog/post/index.html', 'dist', ''), '/blog/post/');
    assert.equal(fileToUrlPath('dist/about.html', 'dist', ''), '/about.html');
    // Paths handed over without the dist prefix still resolve
    assert.equal(fileToUrlPath('about/index.html', 'dist', ''), '/about/');
  });

  test('fileToUrlPath with siteRoot strips the served folder', () => {
    assert.equal(fileToUrlPath('dist/pages/index.html', 'dist', 'pages'), '/');
    assert.equal(fileToUrlPath('dist/pages/docs/x/index.html', 'dist', 'pages'), '/docs/x/');
  });

  test('fileToUrlPath returns null outside the served folder', () => {
    assert.equal(fileToUrlPath('dist/assets/x/index.html', 'dist', 'pages'), null);
    // A sibling whose name only starts with the root is outside it
    assert.equal(fileToUrlPath('dist/pages-old/index.html', 'dist', 'pages'), null);
  });
});

// ---------------------------------------------------------------------------
const PAGE = (body) => `<!DOCTYPE html>
<html lang="en"><head><title>t</title></head><body><nav>${body}</nav></body></html>`;

async function activeRun(pagePath, body, siteRoot) {
  const file = { ext: 'html', path: pagePath, name: 'index', src: PAGE(body) };
  await setActiveLinks({ file, allowType: ['.html'], siteRoot });
  return parseHTML(file.src).document;
}
const cls = (doc, sel) => (doc.querySelector(sel).getAttribute('class') || '').split(/\s+/).filter(Boolean);

describe('set-active-links with siteRoot', () => {
  test('page under dist/pages matches root-relative links', async () => {
    const doc = await activeRun('dist/pages/docs/x/index.html',
      `<a id="a" href="/docs/x/">X</a><a id="p" href="/docs/">Docs</a><a id="o" href="/blog/">Blog</a>`, 'pages');
    assert.deepEqual(cls(doc, '#a'), ['active']);
    assert.deepEqual(cls(doc, '#p'), ['active-parent']);
    assert.deepEqual(cls(doc, '#o'), []);
  });

  test('without siteRoot the same page gets no false matches', async () => {
    // /pages/docs/x/ is the URL when dist is the root — /docs/x/ must not match
    const doc = await activeRun('dist/pages/docs/x/index.html', `<a id="a" href="/docs/x/">X</a>`, '');
    assert.deepEqual(cls(doc, '#a'), []);
  });

  test('pages outside the served folder are left untouched', async () => {
    const doc = await activeRun('dist/assets/demo/index.html', `<a id="a" href="/assets/demo/">D</a>`, 'pages');
    assert.deepEqual(cls(doc, '#a'), []);
  });
});

describe('set-active-links aria-current', () => {
  test('exact match gets aria-current="page"; parent does not', async () => {
    const doc = await activeRun('dist/legal/about/index.html',
      `<a id="a" href="/legal/about/">About</a><a id="p" href="/legal/">Legal</a>`, '');
    assert.equal(doc.querySelector('#a').getAttribute('aria-current'), 'page');
    assert.equal(doc.querySelector('#p').hasAttribute('aria-current'), false);
  });

  test('an author-set aria-current is preserved', async () => {
    const doc = await activeRun('dist/wizard/index.html',
      `<a id="a" href="/wizard/" aria-current="step">Step</a>`, '');
    assert.equal(doc.querySelector('#a').getAttribute('aria-current'), 'step');
  });
});

// ---------------------------------------------------------------------------
const fixtureAbs = path.join(__dirname, 'fixtures-site-root');
const DIST = 'test/fixtures-site-root';

async function makeNestedSite() {
  await fs.rm(fixtureAbs, { recursive: true, force: true });
  for (const d of ['pages', 'pages/docs/intro', 'assets/demo']) {
    await fs.mkdir(path.join(fixtureAbs, d), { recursive: true });
  }
  const html = (t) => `<!DOCTYPE html><html><head><title>${t}</title></head><body><main>${t}</main></body></html>`;
  await fs.writeFile(path.join(fixtureAbs, 'pages/index.html'), html('Home'));
  await fs.writeFile(path.join(fixtureAbs, 'pages/docs/intro/index.html'), html('Intro'));
  // Outside the served folder: never reachable, never listed
  await fs.writeFile(path.join(fixtureAbs, 'assets/demo/index.html'), html('Demo'));
}

beforeEach(makeNestedSite);
after(async () => { await fs.rm(fixtureAbs, { recursive: true, force: true }); });

describe('generate-sitemap-xml with siteRoot', () => {
  test('lists served URLs and writes sitemap.xml into the served folder', async () => {
    await generateSitemap({ distPath: DIST, siteRoot: 'pages', sitemap: { url: 'https://example.com' } });
    assert.ok(!existsSync(path.join(fixtureAbs, 'sitemap.xml')), 'sitemap written outside the served folder');
    const xml = await fs.readFile(path.join(fixtureAbs, 'pages/sitemap.xml'), 'utf-8');
    assert.ok(xml.includes('<loc>https://example.com/docs/intro</loc>'), xml);
    assert.ok(!xml.includes('/pages'), `served-folder prefix leaked into URLs:\n${xml}`);
    assert.ok(!xml.includes('demo'), `page outside the served folder listed:\n${xml}`);
  });

  test('empty sitemap.url writes no sitemap (the default)', async () => {
    await generateSitemap({ distPath: DIST, siteRoot: 'pages', sitemap: { url: '' } });
    assert.ok(!existsSync(path.join(fixtureAbs, 'pages/sitemap.xml')));
    assert.ok(!existsSync(path.join(fixtureAbs, 'sitemap.xml')));
  });
});

describe('collectSitePages with siteRoot', () => {
  test('urlPaths are visitor URLs and only served pages are collected', async () => {
    const pages = await collectSitePages(DIST, 'pages');
    const urls = pages.map(p => p.urlPath).sort();
    assert.deepEqual(urls, ['/', '/docs/intro/']);
  });
});
