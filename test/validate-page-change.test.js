/**
 * @file validate-page-change.test.js
 * @description Tests the real validatePageChange used by dev incremental
 * builds. The old regex /\/(include)|(template)/ matched 'template'
 * ANYWHERE in the path (regex alternation precedence), so any page with
 * 'template' in its filename forced a full rebuild — while component and
 * layout changes incorrectly took the single-page fast path, copying
 * build-only files into dist and leaving dependent pages stale.
 */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { validatePageChange } from '../scripts/utils/util/util.js';

afterEach(() => {
  delete process.env.DEV_CHANGED_PAGE;
});

function check(path) {
  process.env.DEV_CHANGED_PAGE = path;
  return !!validatePageChange();
}

describe('validatePageChange', () => {

  test('regular page change takes the single-page fast path', () => {
    assert.equal(check('src/about/index.html'), true);
  });

  test('a PAGE with "template" in its name is still a fast-path page change', () => {
    assert.equal(check('src/products/template-strings-demo.html'), true);
  });

  test('include file change forces a full rebuild', () => {
    assert.equal(check('src/includes/nav.html'), false);
  });

  test('template/layout file change forces a full rebuild', () => {
    assert.equal(check('src/templates/doc.html'), false);
    assert.equal(check('src/layouts/post.html'), false);
  });

  test('component file change forces a full rebuild (stale-page fix)', () => {
    assert.equal(check('src/components/site-header.html'), false);
  });

  test('no change event means no fast path', () => {
    delete process.env.DEV_CHANGED_PAGE;
    assert.equal(!!validatePageChange(), false);
  });
});
