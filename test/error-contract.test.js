/**
 * @file error-contract.test.js
 * @description Library code must not call process.exit for recoverable,
 * per-file problems. promiseAll killed the whole process on the first
 * rejection, addDynamicPage killed it on bad arguments, and
 * Logger.error/warning were silent no-ops unless LOGGER was set.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { promiseAll, addDynamicPage } from '../scripts/utils/util/util.js';
import Logger from '../scripts/utils/logger/logger.js';

describe('error contract', () => {

  test('promiseAll rejects instead of killing the process', async () => {
    await assert.rejects(
      promiseAll(
        [1, 2],
        async (n) => { if (n === 2) throw new Error('boom'); return n; },
        () => {},
        'test-label'
      ),
      /boom/
    );
  });

  test('promiseAll resolves normally when nothing throws', async () => {
    const result = await promiseAll([1, 2], async (n) => n * 2, () => {});
    assert.deepEqual(result, [2, 4]);
  });

  test('addDynamicPage throws on missing arguments instead of exiting', () => {
    assert.throws(() => addDynamicPage('', '<html></html>', {}), /page path/i);
    assert.throws(() => addDynamicPage('/x', '', {}), /page source/i);
    assert.throws(() => addDynamicPage('/x', '<html></html>', null), /data store/i);
  });

  test('Logger.error and Logger.warning are visible without LOGGER env', () => {
    assert.equal(process.env.LOGGER, undefined, 'test precondition: LOGGER unset');
    const calls = [];
    const original = console.log;
    console.log = (...args) => calls.push(args);
    try {
      Logger.error('something failed');
      Logger.warning('something is off');
    } finally {
      console.log = original;
    }
    assert.equal(calls.length, 2, 'error/warning must always print');
  });
});
