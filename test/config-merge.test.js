/**
 * @file config-merge.test.js
 * @description Tests the REAL config merge behavior.
 * lodash.merge combined arrays index-by-index: a user setting
 * images.formats: ['webp'] got ['webp','webp'] (default was
 * ['avif','webp']), user excludePaths silently DELETED the vendor
 * default at index 0, and arrays could never be shrunk or cleared.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { mergeConfigs } from '../scripts/utils/config/config.js';

describe('config merge', () => {

  test('user arrays REPLACE default arrays (no index-wise blending)', () => {
    const defaults = { images: { formats: ['avif', 'webp'], widths: [320, 640, 960] } };
    const user = { images: { formats: ['webp'], widths: [400] } };

    const merged = mergeConfigs(defaults, user);

    assert.deepEqual(merged.images.formats, ['webp']);
    assert.deepEqual(merged.images.widths, [400]);
  });

  test('an empty user array clears the default', () => {
    const defaults = { excludePaths: [/dist\/assets\/vendor/] };
    const merged = mergeConfigs(defaults, { excludePaths: [] });
    assert.deepEqual(merged.excludePaths, []);
  });

  test('untouched defaults survive nested merges', () => {
    const defaults = {
      images: { enabled: true, widths: [320], quality: { avif: 60, webp: 75 } },
      distPath: 'dist',
    };
    const merged = mergeConfigs(defaults, { images: { quality: { webp: 80 } } });

    assert.equal(merged.images.enabled, true);
    assert.deepEqual(merged.images.widths, [320]);
    assert.equal(merged.images.quality.avif, 60);
    assert.equal(merged.images.quality.webp, 80);
    assert.equal(merged.distPath, 'dist');
  });

  test('RegExp values are assigned, not recursed into', () => {
    const defaults = { pattern: /old/ };
    const merged = mergeConfigs(defaults, { pattern: /new/g });
    assert.ok(merged.pattern instanceof RegExp);
    assert.equal(merged.pattern.source, 'new');
    assert.equal(merged.pattern.flags, 'g');
  });

  test('scalar overrides and additions work', () => {
    const merged = mergeConfigs({ a: 1, nested: { b: 2 } }, { a: 9, c: 3, nested: { d: 4 } });
    assert.equal(merged.a, 9);
    assert.equal(merged.c, 3);
    assert.equal(merged.nested.b, 2);
    assert.equal(merged.nested.d, 4);
  });
});
