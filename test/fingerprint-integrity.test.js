/**
 * @file fingerprint-integrity.test.js
 * @description End-to-end tests for the REAL fingerprint-assets plugin.
 * Guards against:
 * 1. Fragment corruption — rewriting _fragment.html through a full-document
 *    serializer wrapped snippets in <html><head><body>, which SPA swaps
 *    then injected as nested documents.
 * 2. Broken module graphs — renamed .js files were only rewritten in
 *    <link>/<script> tags; import specifiers inside JS still pointed at
 *    the old names (runtime 404s).
 * 3. Stale importer hashes — an importer whose dependency changed must
 *    itself get a new hashed name, or immutable caching serves a stale
 *    importer pointing at a dead dependency file.
 */

import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fingerprintAssets from '../scripts/plugins/fingerprint-assets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureAbs = path.join(__dirname, 'fixtures-fingerprint');
const DIST = 'test/fixtures-fingerprint';

const FP_CONFIG = { enabled: true, hashLength: 8, types: ['.css', '.js'] };

async function makeSite({ helperBody = 'export const x = () => 1;' } = {}) {
  await fs.rm(fixtureAbs, { recursive: true, force: true });
  await fs.mkdir(path.join(fixtureAbs, 'assets'), { recursive: true });
  await fs.mkdir(path.join(fixtureAbs, 'about'), { recursive: true });

  await fs.writeFile(path.join(fixtureAbs, 'index.html'),
    `<!DOCTYPE html><html><head><script type="module" src="/assets/app.js"></script></head><body><main>home</main></body></html>`);
  await fs.writeFile(path.join(fixtureAbs, 'about/index.html'),
    `<!DOCTYPE html><html><head><script type="module" src="/assets/app.js"></script></head><body><main>about</main></body></html>`);
  // SPA fragment: a bare snippet, no document wrapper
  await fs.writeFile(path.join(fixtureAbs, 'about/_fragment.html'),
    `<main>about</main><script src="/assets/app.js"></script>`);

  await fs.writeFile(path.join(fixtureAbs, 'assets/app.js'),
    `import { x } from './helper.js';\nx();\n`);
  await fs.writeFile(path.join(fixtureAbs, 'assets/helper.js'), helperBody);
}

async function run() {
  await fingerprintAssets({ distPath: DIST, fingerprint: FP_CONFIG });
  const manifest = JSON.parse(await fs.readFile(path.join(fixtureAbs, 'asset-manifest.json'), 'utf-8'));
  return manifest;
}

beforeEach(() => makeSite());
after(async () => {
  await fs.rm(fixtureAbs, { recursive: true, force: true });
});

describe('fingerprint-assets: integrity', () => {

  test('fragments are rewritten without gaining a document wrapper', async () => {
    await run();

    const frag = await fs.readFile(path.join(fixtureAbs, 'about/_fragment.html'), 'utf-8');
    assert.ok(!/<html|<head|<body/i.test(frag), `fragment gained a document wrapper:\n${frag}`);
    assert.match(frag, /src="\/assets\/app\.[0-9a-f]{8}\.js"/, `fragment ref not rewritten:\n${frag}`);
  });

  test('import specifiers inside JS are rewritten to hashed names', async () => {
    const manifest = await run();

    const appNew = manifest['/assets/app.js'];
    const helperNew = manifest['/assets/helper.js'];
    assert.ok(appNew && helperNew, 'manifest missing entries');

    const appContent = await fs.readFile(path.join(fixtureAbs, appNew.slice(1)), 'utf-8');
    const helperBase = path.basename(helperNew);
    assert.ok(
      appContent.includes(`'./${helperBase}'`),
      `import specifier not rewritten. app content:\n${appContent}\nexpected ./${helperBase}`
    );
  });

  test('importer hash changes when its dependency changes', async () => {
    const manifest1 = await run();

    await makeSite({ helperBody: 'export const x = () => 2; // changed' });
    const manifest2 = await run();

    assert.notEqual(manifest2['/assets/helper.js'], manifest1['/assets/helper.js'],
      'helper hash should change');
    assert.notEqual(manifest2['/assets/app.js'], manifest1['/assets/app.js'],
      'importer hash must change when its dependency changes (immutable-cache correctness)');
  });
});
