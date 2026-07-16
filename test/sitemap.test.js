/**
 * @file sitemap.test.js
 * @description Tests the REAL generate-sitemap-xml plugin.
 * Guards against: every _fragment.html shipping as a sitemap URL
 * (hundreds of duplicate-content entries), and unescaped & in <loc>
 * producing invalid XML.
 */

import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import generateSitemap from '../scripts/plugins/generate-sitemap-xml.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureAbs = path.join(__dirname, 'fixtures-sitemap');
const DIST = 'test/fixtures-sitemap';

async function makeSite() {
  await fs.rm(fixtureAbs, { recursive: true, force: true });
  const dirs = ['', 'about', 'docs/q&a'];
  for (const d of dirs) {
    await fs.mkdir(path.join(fixtureAbs, d), { recursive: true });
    await fs.writeFile(path.join(fixtureAbs, d, 'index.html'), '<html><body>x</body></html>');
  }
  // SPA fragments — must NOT appear in the sitemap
  await fs.writeFile(path.join(fixtureAbs, 'about/_fragment.html'), '<main>frag</main>');
  await fs.writeFile(path.join(fixtureAbs, '_fragment.html'), '<main>frag</main>');
}

beforeEach(makeSite);
after(async () => {
  await fs.rm(fixtureAbs, { recursive: true, force: true });
});

async function runAndRead() {
  await generateSitemap({ distPath: DIST, sitemap: { url: 'https://example.com' } });
  return fs.readFile(path.join(fixtureAbs, 'sitemap.xml'), 'utf-8');
}

describe('generate-sitemap-xml', () => {

  test('fragment files are excluded from the sitemap', async () => {
    const xml = await runAndRead();
    assert.ok(!xml.includes('_fragment'), `fragments leaked into sitemap:\n${xml}`);
  });

  test('regular pages are present with clean directory URLs', async () => {
    const xml = await runAndRead();
    assert.ok(xml.includes('<loc>https://example.com/about</loc>'), xml);
  });

  test('ampersands in paths are XML-escaped', async () => {
    const xml = await runAndRead();
    assert.ok(xml.includes('q&amp;a'), `unescaped & in loc:\n${xml}`);
    // No raw & anywhere outside entities
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml), `invalid raw & in XML:\n${xml}`);
  });
});
