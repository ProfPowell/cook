/**
 * @file run-build.test.js
 * @description build.js must export runBuild() and not auto-run on
 * import, so the dev server can rebuild in-process (warm module and
 * template caches) instead of spawning a cold Node process per save.
 * Two consecutive in-process builds must produce identical output.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';

describe('runBuild', () => {

  test('build.js exports runBuild and is import-safe', async () => {
    const mod = await import('../scripts/build.js');
    assert.equal(typeof mod.runBuild, 'function');
  });

  test('two consecutive in-process builds are idempotent', async () => {
    const { runBuild } = await import('../scripts/build.js');

    // Silence build/spinner output — raw control bytes on stdout corrupt
    // the test runner's IPC stream
    const write = process.stdout.write;
    const log = console.log;
    process.stdout.write = () => true;
    console.log = () => {};
    let first, second;
    try {
      await runBuild();
      first = await fs.readFile('dist/index.html', 'utf-8');

      await runBuild();
      second = await fs.readFile('dist/index.html', 'utf-8');
    } finally {
      process.stdout.write = write;
      console.log = log;
    }

    assert.ok(first.length > 500, 'built page has content');
    assert.equal(second, first, 'in-process rebuild must produce identical output');
    assert.notEqual(process.exitCode, 1, 'no page failures');
  });
});
