/**
 * @file set-src.test.js
 * @description Tests the real Util.jsdom.dom + Util.setSrc round trip.
 * Guards against structure loss: pages without <!DOCTYPE> were serialized
 * as head.innerHTML + body.innerHTML, silently dropping <html lang>,
 * body classes, and the document wrapper — on every DOM plugin pass.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import Util from '../scripts/utils/util/util.js';

function roundTrip(src) {
  const dom = Util.jsdom.dom({ src });
  return Util.setSrc({ dom });
}

describe('setSrc: document structure preservation', () => {

  test('doctype-less page keeps <html> attributes and body class', () => {
    const src = `<html lang="en" data-theme="dark"><head><title>t</title></head><body class="home"><p>hi</p></body></html>`;
    const out = roundTrip(src);

    assert.match(out, /<html[^>]*lang="en"/);
    assert.match(out, /<html[^>]*data-theme="dark"/);
    assert.match(out, /<body[^>]*class="home"/);
    assert.match(out, /<p>hi<\/p>/);
  });

  test('page with doctype keeps doctype and structure', () => {
    const src = `<!DOCTYPE html><html lang="fr"><head><title>t</title></head><body><p>hi</p></body></html>`;
    const out = roundTrip(src);

    assert.match(out, /<!doctype html>/i);
    assert.match(out, /<html[^>]*lang="fr"/);
  });

  test('partial content does not gain a document wrapper', () => {
    const src = `<nav><a href="/">Home</a></nav>`;
    const out = roundTrip(src);

    assert.ok(!/<html/i.test(out), `partial should not gain <html>, got: ${out}`);
    assert.match(out, /<nav><a href="\/">Home<\/a><\/nav>/);
  });

  // Issue #58: linkedom always serialized <!DOCTYPE html>, so every page with
  // the lowercase <!doctype html> that html-validate's doctype-style rule
  // wants came out uppercase.
  test('lowercase <!doctype html> survives the round trip', () => {
    const out = roundTrip(`<!doctype html><html lang="en"><head><title>t</title></head><body><p>x</p></body></html>`);
    assert.ok(out.startsWith('<!doctype html>'), out.slice(0, 40));
  });

  test('uppercase <!DOCTYPE html> is kept as written', () => {
    const out = roundTrip(`<!DOCTYPE html><html><head><title>t</title></head><body></body></html>`);
    assert.ok(out.startsWith('<!DOCTYPE html>'), out.slice(0, 40));
  });

  test('a page without a doctype does not gain one', () => {
    const out = roundTrip(`<html lang="en"><head><title>t</title></head><body></body></html>`);
    assert.ok(!/<!doctype/i.test(out), out.slice(0, 40));
  });
});
