/**
 * @file collections.test.js
 * @description Shared collection helpers used by markdown and HTML collections.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { toCollectionItem, addToCollection, sortCollections } from '../scripts/utils/collections/collections.js';

describe('collections helpers', () => {
  test('toCollectionItem strips build-only keys', () => {
    const item = toCollectionItem({ title: 'A', url: '/a/', content: '<p>', sourcePath: 's', outputPath: 'o', collection: 'c', tags: ['x'] });
    assert.equal(item.title, 'A');
    assert.equal(item.url, '/a/');
    assert.deepEqual(item.tags, ['x']);
    for (const key of ['content', 'sourcePath', 'outputPath', 'collection']) {
      assert.ok(!(key in item), `${key} removed`);
    }
  });

  test('sortCollections orders newest first, undated last, stable', () => {
    const collections = { posts: [
      { id: 1, _dateSort: null },
      { id: 2, _dateSort: new Date('2026-01-01') },
      { id: 3, _dateSort: new Date('2026-06-01') },
      { id: 4, _dateSort: null },
    ] };
    sortCollections(collections);
    assert.deepEqual(collections.posts.map(i => i.id), [3, 2, 1, 4]);
  });

  test('addToCollection creates and appends', () => {
    const collections = {};
    addToCollection(collections, 'posts', { id: 1 });
    addToCollection(collections, 'posts', { id: 2 });
    assert.deepEqual(collections.posts.map(i => i.id), [1, 2]);
  });
});
