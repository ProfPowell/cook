/**
 * @file user-data.test.js
 * @description Tests the shared user-data loader.
 * config/data.js was previously loaded AND invoked independently by
 * build.js and get-src.js: a function export produced two divergent
 * data instances, so pages added via addDynamicPage on one were
 * invisible to getDynamicFiles reading the other — dynamic pages
 * silently never built (and remote fetches ran twice).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadUserData } from '../scripts/utils/user-data/user-data.js';
import defaultData from '../scripts/utils/user-data/user-data.js';
import { getDynamicFiles } from '../scripts/utils/get-src/get-src.js';
import { addDynamicPage } from '../scripts/utils/util/util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureBase = path.join(__dirname, 'fixtures-data');

describe('user-data loader', () => {

  test('function-export data.js is evaluated exactly once', async () => {
    const a = await loadUserData(fixtureBase);
    const b = await loadUserData(fixtureBase);

    assert.equal(a, b, 'both loads must return the SAME instance');
    assert.equal(a.fromFunction, true);
    assert.equal(globalThis.__cookDataCallCount, 1, 'data function must run once, not per-importer');
  });

  test('dynamic pages added to the shared data are visible to getDynamicFiles', async () => {
    addDynamicPage('/dyn-test-page', '<html><body>dyn</body></html>', defaultData);

    const files = getDynamicFiles([]);
    assert.ok(
      files.some(f => f && f.path === '/dyn-test-page'),
      'getDynamicFiles must read the same data instance build.js writes to'
    );
  });
});
