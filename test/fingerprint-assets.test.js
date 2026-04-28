/**
 * @file fingerprint-assets.test.js
 * @description Tests for asset fingerprinting helpers.
 *
 * Covers:
 * - Hash stability (same content → same hash)
 * - Hash invalidation (changed content → changed hash)
 * - Filename format (foo.css → foo.{hash}.css; .map handling)
 * - HTML ref rewriting (with skips for external/data URIs)
 * - Manifest passthrough behavior
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  computeHash,
  fingerprintFilename,
  isExternalRef,
  splitUrlSuffix,
  rewriteHrefs,
} from '../scripts/plugins/fingerprint-assets.js';


describe('Asset Fingerprinting', () => {

  // --------------------------------------------------------------------------
  // computeHash
  // --------------------------------------------------------------------------

  describe('computeHash', () => {

    it('returns identical hash for identical content', () => {
      const a = computeHash('body { color: red; }', 8);
      const b = computeHash('body { color: red; }', 8);
      assert.strictEqual(a, b);
    });

    it('returns different hash when content changes', () => {
      const a = computeHash('body { color: red; }', 8);
      const b = computeHash('body { color: blue; }', 8);
      assert.notStrictEqual(a, b);
    });

    it('respects requested length', () => {
      assert.strictEqual(computeHash('hi', 8).length, 8);
      assert.strictEqual(computeHash('hi', 12).length, 12);
      assert.strictEqual(computeHash('hi', 16).length, 16);
    });

    it('produces hex-only output', () => {
      const h = computeHash('whatever', 16);
      assert.match(h, /^[0-9a-f]+$/);
    });

    it('handles Buffer input the same as string', () => {
      const fromString = computeHash('hello', 8);
      const fromBuffer = computeHash(Buffer.from('hello'), 8);
      assert.strictEqual(fromString, fromBuffer);
    });

    it('uses sha256 by default', () => {
      // sha256("a") truncated to 8 chars
      assert.strictEqual(computeHash('a', 8), 'ca978112');
    });
  });

  // --------------------------------------------------------------------------
  // fingerprintFilename
  // --------------------------------------------------------------------------

  describe('fingerprintFilename', () => {

    it('inserts hash before single extension', () => {
      assert.strictEqual(fingerprintFilename('site.css', 'abc12345'), 'site.abc12345.css');
      assert.strictEqual(fingerprintFilename('app.js', 'abc12345'), 'app.abc12345.js');
    });

    it('handles names with dots in the stem', () => {
      assert.strictEqual(
        fingerprintFilename('vendor.min.js', 'abc12345'),
        'vendor.min.abc12345.js'
      );
    });

    it('keeps .js.map paired with the source hash', () => {
      assert.strictEqual(
        fingerprintFilename('app.js.map', 'abc12345'),
        'app.abc12345.js.map'
      );
    });

    it('keeps .css.map paired with the source hash', () => {
      assert.strictEqual(
        fingerprintFilename('site.css.map', 'abc12345'),
        'site.abc12345.css.map'
      );
    });

    it('falls back to appending hash for extensionless names', () => {
      assert.strictEqual(fingerprintFilename('LICENSE', 'abc12345'), 'LICENSE.abc12345');
    });
  });

  // --------------------------------------------------------------------------
  // isExternalRef
  // --------------------------------------------------------------------------

  describe('isExternalRef', () => {

    it('treats absolute http(s) URLs as external', () => {
      assert.strictEqual(isExternalRef('http://example.com/a.css'), true);
      assert.strictEqual(isExternalRef('https://example.com/a.css'), true);
    });

    it('treats protocol-relative URLs as external', () => {
      assert.strictEqual(isExternalRef('//cdn.example.com/a.js'), true);
    });

    it('treats data URIs as external', () => {
      assert.strictEqual(isExternalRef('data:text/css;base64,Zm9v'), true);
    });

    it('treats mailto/tel as external', () => {
      assert.strictEqual(isExternalRef('mailto:hi@example.com'), true);
      assert.strictEqual(isExternalRef('tel:+15551234'), true);
    });

    it('treats local refs as not external', () => {
      assert.strictEqual(isExternalRef('/assets/site.css'), false);
      assert.strictEqual(isExternalRef('assets/site.css'), false);
      assert.strictEqual(isExternalRef('./site.css'), false);
    });

    it('treats empty / null as external (skip)', () => {
      assert.strictEqual(isExternalRef(''), true);
      assert.strictEqual(isExternalRef(null), true);
    });
  });

  // --------------------------------------------------------------------------
  // splitUrlSuffix
  // --------------------------------------------------------------------------

  describe('splitUrlSuffix', () => {

    it('returns whole path when no query or fragment', () => {
      assert.deepStrictEqual(
        splitUrlSuffix('/assets/site.css'),
        { path: '/assets/site.css', suffix: '' }
      );
    });

    it('splits off ?query', () => {
      assert.deepStrictEqual(
        splitUrlSuffix('/assets/site.css?v=2'),
        { path: '/assets/site.css', suffix: '?v=2' }
      );
    });

    it('splits off #fragment', () => {
      assert.deepStrictEqual(
        splitUrlSuffix('/app.js#thing'),
        { path: '/app.js', suffix: '#thing' }
      );
    });
  });

  // --------------------------------------------------------------------------
  // rewriteHrefs
  // --------------------------------------------------------------------------

  describe('rewriteHrefs', () => {

    const manifest = {
      '/assets/css/site.css': '/assets/css/site.abc12345.css',
      '/assets/js/app.js': '/assets/js/app.def67890.js',
    };

    it('rewrites <link href> for known assets', () => {
      const html = '<!doctype html><html><head><link rel="stylesheet" href="/assets/css/site.css"></head><body></body></html>';
      const { html: out, rewrites } = rewriteHrefs(html, manifest);
      assert.strictEqual(rewrites, 1);
      assert.ok(out.includes('href="/assets/css/site.abc12345.css"'));
      assert.ok(!out.includes('href="/assets/css/site.css"'));
    });

    it('rewrites <script src> for known assets', () => {
      const html = '<!doctype html><html><body><script src="/assets/js/app.js"></script></body></html>';
      const { html: out, rewrites } = rewriteHrefs(html, manifest);
      assert.strictEqual(rewrites, 1);
      assert.ok(out.includes('src="/assets/js/app.def67890.js"'));
    });

    it('leaves external URLs untouched', () => {
      const html = '<!doctype html><html><head><link rel="stylesheet" href="https://cdn.example.com/x.css"><script src="//cdn.example.com/y.js"></script></head></html>';
      const { rewrites } = rewriteHrefs(html, manifest);
      assert.strictEqual(rewrites, 0);
    });

    it('leaves data URIs untouched', () => {
      const html = '<!doctype html><html><head><link rel="icon" href="data:image/png;base64,ZmFr"></head></html>';
      const { rewrites } = rewriteHrefs(html, manifest);
      assert.strictEqual(rewrites, 0);
    });

    it('leaves unknown local refs untouched', () => {
      const html = '<!doctype html><html><head><link rel="stylesheet" href="/assets/css/unknown.css"></head></html>';
      const { html: out, rewrites } = rewriteHrefs(html, manifest);
      assert.strictEqual(rewrites, 0);
      assert.ok(out.includes('href="/assets/css/unknown.css"'));
    });

    it('preserves ?query and #fragment when rewriting', () => {
      const html = '<!doctype html><html><head><link rel="stylesheet" href="/assets/css/site.css?v=2"></head></html>';
      const { html: out, rewrites } = rewriteHrefs(html, manifest);
      assert.strictEqual(rewrites, 1);
      assert.ok(out.includes('href="/assets/css/site.abc12345.css?v=2"'));
    });

    it('preserves leading-slash style of original (relative stays relative)', () => {
      const html = '<!doctype html><html><head><link rel="stylesheet" href="assets/css/site.css"></head></html>';
      const { html: out, rewrites } = rewriteHrefs(html, manifest);
      assert.strictEqual(rewrites, 1);
      assert.ok(out.includes('href="assets/css/site.abc12345.css"'));
      assert.ok(!out.includes('href="/assets/css/site.abc12345.css"'));
    });

    it('rewrites multiple refs in one document', () => {
      const html = `<!doctype html><html>
        <head>
          <link rel="stylesheet" href="/assets/css/site.css">
          <link rel="preload" href="/assets/js/app.js" as="script">
        </head>
        <body><script src="/assets/js/app.js"></script></body>
      </html>`;
      const { html: out, rewrites } = rewriteHrefs(html, manifest);
      assert.strictEqual(rewrites, 3);
      assert.ok(out.includes('site.abc12345.css'));
      // Both link[rel=preload] and script[src] should be rewritten
      const appMatches = out.match(/app\.def67890\.js/g);
      assert.strictEqual(appMatches.length, 2);
    });

    it('returns input unchanged when manifest is empty', () => {
      const html = '<!doctype html><html><head><link href="/assets/css/site.css"></head></html>';
      const { html: out, rewrites } = rewriteHrefs(html, {});
      assert.strictEqual(rewrites, 0);
      assert.strictEqual(out, html);
    });
  });

  // --------------------------------------------------------------------------
  // Cache invalidation behavior (integration-y, but stays in helper land)
  // --------------------------------------------------------------------------

  describe('Cache invalidation', () => {

    it('unchanged content yields stable filename across builds', () => {
      const content = 'body { color: red; }';
      const h1 = computeHash(content, 8);
      const h2 = computeHash(content, 8);
      assert.strictEqual(
        fingerprintFilename('site.css', h1),
        fingerprintFilename('site.css', h2)
      );
    });

    it('modified content yields different filename', () => {
      const before = computeHash('body { color: red; }', 8);
      const after = computeHash('body { color: blue; }', 8);
      assert.notStrictEqual(
        fingerprintFilename('site.css', before),
        fingerprintFilename('site.css', after)
      );
    });
  });
});
