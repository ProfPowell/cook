/**
 * @file apply-base-path.test.js
 * @description basePath: root-relative URL prefixing for sub-path hosting.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import applyBasePath, {
  normalizeBasePath,
  prefixUrl,
  prefixSrcset,
  prefixCssUrls,
  prefixImportMap,
  rewriteBasePath,
} from '../scripts/plugins/apply-base-path.js';

describe('apply-base-path', () => {

  describe('normalizeBasePath', () => {
    it('normalizes to a leading slash and no trailing slash', () => {
      assert.strictEqual(normalizeBasePath('cook'), '/cook');
      assert.strictEqual(normalizeBasePath('/cook/'), '/cook');
      assert.strictEqual(normalizeBasePath('//a/b//'), '/a/b');
    });
    it('treats empty and "/" as no base path', () => {
      for (const v of ['', '/', undefined, null, '  ']) assert.strictEqual(normalizeBasePath(v), '');
    });
  });

  describe('prefixUrl', () => {
    const base = '/cook';
    it('prefixes root-relative URLs', () => {
      assert.strictEqual(prefixUrl('/', base), '/cook/');
      assert.strictEqual(prefixUrl('/docs/', base), '/cook/docs/');
      assert.strictEqual(prefixUrl('/a.css?v=1#x', base), '/cook/a.css?v=1#x');
    });
    it('leaves relative, absolute, protocol-relative and special URLs alone', () => {
      for (const url of ['docs/', './a.css', '../x', '#top', '?q=1', '//cdn.x/a.js',
        'https://x.com/', 'mailto:a@b.c', 'data:image/png;base64,AA', '']) {
        assert.strictEqual(prefixUrl(url, base), url);
      }
    });
    it('is idempotent for URLs already under the base path', () => {
      for (const url of ['/cook', '/cook/', '/cook/docs/', '/cook?q', '/cook#h']) {
        assert.strictEqual(prefixUrl(url, base), url);
      }
    });
    it('still prefixes paths that merely start with the same letters', () => {
      assert.strictEqual(prefixUrl('/cookbook/', base), '/cook/cookbook/');
    });
  });

  it('prefixSrcset rewrites every candidate', () => {
    assert.strictEqual(
      prefixSrcset('/a-320.webp 320w, /a-640.webp 640w,https://x/a.webp 2x', '/cook'),
      '/cook/a-320.webp 320w, /cook/a-640.webp 640w,https://x/a.webp 2x'
    );
  });

  it('prefixCssUrls handles quoted, unquoted and non-root url()', () => {
    assert.strictEqual(
      prefixCssUrls(`a{background:url(/i.png)} b{background:url("/j.png")} c{background:url('k.png')} d{src:url(//cdn/f.woff)}`, '/cook'),
      `a{background:url(/cook/i.png)} b{background:url("/cook/j.png")} c{background:url('k.png')} d{src:url(//cdn/f.woff)}`
    );
  });

  it('prefixImportMap rewrites import and scope keys/values', () => {
    const out = JSON.parse(prefixImportMap(JSON.stringify({
      imports: { 'vb': '/assets/vb.js', '/lib/': '/assets/lib/', 'cdn': 'https://x/a.js' },
      scopes: { '/admin/': { 'vb': '/assets/vb-admin.js' } },
    }), '/cook'));
    assert.deepStrictEqual(out.imports, { 'vb': '/cook/assets/vb.js', '/cook/lib/': '/cook/assets/lib/', 'cdn': 'https://x/a.js' });
    assert.deepStrictEqual(out.scopes, { '/cook/admin/': { 'vb': '/cook/assets/vb-admin.js' } });
    assert.strictEqual(prefixImportMap('{not json', '/cook'), '{not json');
  });

  describe('rewriteBasePath', () => {
    it('rewrites URL attributes across element types', () => {
      const src = `<!doctype html><html><head><link rel="stylesheet" href="/a.css"><script src="/a.js"></script></head>`
        + `<body><a href="/docs/">d</a><img src="/i.png" srcset="/i-1.png 1x, /i-2.png 2x"><form action="/s"></form>`
        + `<video poster="/p.jpg"></video><svg><use href="/sprite.svg#x"></use></svg><a href="https://x.com/">x</a></body></html>`;
      const { html, rewrites } = rewriteBasePath(src, '/cook');
      for (const s of ['href="/cook/a.css"', 'src="/cook/a.js"', 'href="/cook/docs/"', 'src="/cook/i.png"',
        'srcset="/cook/i-1.png 1x, /cook/i-2.png 2x"', 'action="/cook/s"', 'poster="/cook/p.jpg"',
        'href="/cook/sprite.svg#x"', 'href="https://x.com/"']) {
        assert.ok(html.includes(s), `missing ${s}`);
      }
      assert.strictEqual(rewrites, 8);
      assert.ok(html.startsWith('<!doctype html>'), 'keeps the source doctype');
    });

    it('does not touch code shown as text', () => {
      const src = `<p><a href="/x/">x</a></p><pre><code>&lt;a href="/docs/"&gt;</code></pre>`;
      const { html } = rewriteBasePath(src, '/cook');
      assert.ok(html.includes('href="/cook/x/"'));
      assert.ok(html.includes('&lt;a href="/docs/"&gt;'));
    });

    it('rewrites style attributes, <style> blocks and import maps', () => {
      const src = `<div style="background:url(/bg.png)"></div><style>.a{background:url('/b.png')}</style>`
        + `<script type="importmap">{"imports":{"vb":"/assets/vb.js"}}</script>`;
      const { html } = rewriteBasePath(src, '/cook');
      assert.ok(html.includes('url(/cook/bg.png)'));
      assert.ok(html.includes(`url('/cook/b.png')`));
      assert.ok(html.includes('"vb":"/cook/assets/vb.js"'));
    });

    it('returns the input untouched when nothing changes or no base path is set', () => {
      const src = `<!DOCTYPE html><a href="docs/">  spacing  kept </a>`;
      assert.deepStrictEqual(rewriteBasePath(src, '/cook'), { html: src, rewrites: 0 });
      const root = `<a href="/docs/">d</a>`;
      assert.deepStrictEqual(rewriteBasePath(root, ''), { html: root, rewrites: 0 });
    });

    it('keeps fragments as fragments', () => {
      const { html } = rewriteBasePath(`<main><a href="/docs/">d</a></main>`, '/cook');
      assert.strictEqual(html, `<main><a href="/cook/docs/">d</a></main>`);
    });

    it('is idempotent', () => {
      const once = rewriteBasePath(`<a href="/docs/">d</a>`, '/cook').html;
      assert.deepStrictEqual(rewriteBasePath(once, '/cook'), { html: once, rewrites: 0 });
    });
  });

  describe('plugin', () => {
    let dir;
    const prevEnv = process.env.NODE_ENV;
    before(async () => {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-basepath-'));
      await fs.mkdir(path.join(dir, 'docs'), { recursive: true });
      await fs.writeFile(path.join(dir, 'index.html'), `<!doctype html><a href="/docs/">d</a>`);
      await fs.writeFile(path.join(dir, 'docs', 'index.html'), `<a href="/">home</a>`);
      await fs.writeFile(path.join(dir, 'site.css'), `a{background:url(/x.png)}`);
    });
    after(async () => {
      process.env.NODE_ENV = prevEnv;
      await fs.rm(dir, { recursive: true, force: true });
    });

    it('does nothing in development', async () => {
      process.env.NODE_ENV = 'development';
      await applyBasePath({ basePath: '/cook', distPath: dir, siteRoot: '' });
      assert.strictEqual(await fs.readFile(path.join(dir, 'index.html'), 'utf-8'), `<!doctype html><a href="/docs/">d</a>`);
    });

    it('rewrites every HTML file under the served root and leaves other files', async () => {
      process.env.NODE_ENV = 'production';
      await applyBasePath({ basePath: 'cook/', distPath: dir, siteRoot: '' });
      assert.strictEqual(await fs.readFile(path.join(dir, 'index.html'), 'utf-8'), `<!doctype html><a href="/cook/docs/">d</a>`);
      assert.strictEqual(await fs.readFile(path.join(dir, 'docs', 'index.html'), 'utf-8'), `<a href="/cook/">home</a>`);
      assert.strictEqual(await fs.readFile(path.join(dir, 'site.css'), 'utf-8'), `a{background:url(/x.png)}`);
    });
  });
});
