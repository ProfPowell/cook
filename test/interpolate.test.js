/**
 * @file interpolate.test.js
 * @description Tests the single shared ${var} interpolator that replaces
 * the four divergent implementations (components, repeat, layouts,
 * template-strings) — same author-facing syntax, same semantics.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { renderTemplate, getNested } from '../scripts/utils/interpolate/interpolate.js';

describe('renderTemplate', () => {

  test('flat and nested lookups, with trimmed keys', () => {
    const data = { title: 'T', user: { name: 'Kim' } };
    assert.equal(renderTemplate('<h1>${title}</h1>', data), '<h1>T</h1>');
    assert.equal(renderTemplate('<h1>${ title }</h1>', data), '<h1>T</h1>');
    assert.equal(renderTemplate('${user.name}', data), 'Kim');
  });

  test('unmatched vars are left as-is; Vue-style ${{x}} untouched', () => {
    assert.equal(renderTemplate('${missing} and ${{vue}}', {}), '${missing} and ${{vue}}');
  });

  test('values are inserted literally ($-patterns immune)', () => {
    const out = renderTemplate('${code}', { code: 'replace(/x/, "$&") costs $$5' });
    assert.equal(out, 'replace(/x/, "$&") costs $$5');
  });

  test('Date and Array formatting', () => {
    const d = new Date(2026, 0, 15);
    assert.equal(renderTemplate('${when}', { when: d }), d.toLocaleDateString());
    assert.equal(renderTemplate('${tags}', { tags: ['a', 'b'] }), 'a, b');
  });

  test('null/undefined values leave the placeholder', () => {
    assert.equal(renderTemplate('${x}', { x: null }), '${x}');
  });

  test('removeUnmatchedSlots clears only slot placeholders', () => {
    const out = renderTemplate('<a>${slot:side}</a><b>${other}</b>', {}, { removeUnmatchedSlots: true });
    assert.equal(out, '<a></a><b>${other}</b>');
  });

  test('provided slots resolve like any other key', () => {
    const out = renderTemplate('${slot:side}', { 'slot:side': '<em>x</em>' }, { removeUnmatchedSlots: true });
    assert.equal(out, '<em>x</em>');
  });

  test('getNested walks dot paths safely', () => {
    assert.equal(getNested({ a: { b: { c: 1 } } }, 'a.b.c'), 1);
    assert.equal(getNested({ a: null }, 'a.b'), undefined);
    assert.equal(getNested(null, 'a'), undefined);
  });
});
