/**
 * @file fingerprint-site-root.test.js
 * @description Fingerprinting with `siteRoot`: web paths are relative to the
 * served folder (dist/pages is "/"), files outside it are left alone.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fingerprintAssets from '../scripts/plugins/fingerprint-assets.js';

let tmp;
let dist;
const write = async (rel, content) => {
  await fs.mkdir(path.dirname(path.join(dist, rel)), { recursive: true });
  await fs.writeFile(path.join(dist, rel), content);
};
const exists = (rel) => fs.access(path.join(dist, rel)).then(() => true, () => false);

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-fp-root-'));
  dist = path.join(tmp, 'dist');
  await write('pages/index.html',
    '<html><head><link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/app.js"></script></head><body></body></html>');
  await write('pages/assets/site.css', 'body { color: red; }');
  await write('pages/assets/app.js', `import { u } from './util.js';\nconsole.log(u);\n`);
  await write('pages/assets/util.js', 'export const u = 1;\n');
  await write('outside.css', 'p { margin: 0; }');
  await write('outside.html', '<html><head><link rel="stylesheet" href="/outside.css"></head></html>');
  await fingerprintAssets({
    distPath: dist,
    siteRoot: 'pages',
    fingerprint: { enabled: true },
  });
});

after(() => fs.rm(tmp, { recursive: true, force: true }));

describe('fingerprint-assets with siteRoot', () => {
  test('manifest keys are relative to the served root, written there', async () => {
    assert.ok(!(await exists('asset-manifest.json')));
    const manifest = JSON.parse(await fs.readFile(path.join(dist, 'pages/asset-manifest.json'), 'utf-8'));
    assert.deepEqual(Object.keys(manifest).sort(), ['/assets/app.js', '/assets/site.css', '/assets/util.js']);
    for (const [k, v] of Object.entries(manifest)) {
      assert.match(v, /^\/assets\/[a-z]+\.[0-9a-f]{8}\.(css|js)$/);
      assert.ok(await exists(`pages${v}`), `${v} exists`);
      assert.ok(!(await exists(`pages${k}`)), `${k} renamed away`);
    }
  });

  test('HTML references are rewritten to hashed names', async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(dist, 'pages/asset-manifest.json'), 'utf-8'));
    const html = await fs.readFile(path.join(dist, 'pages/index.html'), 'utf-8');
    assert.ok(html.includes(manifest['/assets/site.css']));
    assert.ok(html.includes(manifest['/assets/app.js']));
  });

  test('relative imports between assets are rewritten', async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(dist, 'pages/asset-manifest.json'), 'utf-8'));
    const app = await fs.readFile(path.join(dist, 'pages', manifest['/assets/app.js']), 'utf-8');
    assert.ok(app.includes(`./${path.basename(manifest['/assets/util.js'])}`));
  });

  test('files outside the served root are untouched', async () => {
    assert.ok(await exists('outside.css'));
    assert.match(await fs.readFile(path.join(dist, 'outside.html'), 'utf-8'), /href="\/outside\.css"/);
  });
});
