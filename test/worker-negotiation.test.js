/**
 * @file worker-negotiation.test.js
 * @description Tests the REAL Cloudflare worker for two routing bugs:
 * 1. Fallback responses were stamped with the NEGOTIATED Content-Type —
 *    an HTML page served to an Accept: text/markdown client (because no
 *    /md copy exists) was labeled text/markdown.
 * 2. Redirects (301/308 slash normalization from static assets) were
 *    treated as failures (.ok is 2xx-only), serving the 404 page instead
 *    of passing the redirect through.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker/index.js';

function makeEnv(files, { redirects = {} } = {}) {
  return {
    ASSETS: {
      async fetch(requestOrUrl) {
        const url = new URL(requestOrUrl.url || requestOrUrl);
        if (redirects[url.pathname]) {
          return new Response(null, {
            status: 301,
            headers: { Location: redirects[url.pathname] },
          });
        }
        const body = files[url.pathname];
        if (body === undefined) return new Response('nf', { status: 404 });
        const type = url.pathname.endsWith('.md') ? 'text/markdown'
          : url.pathname.endsWith('.json') ? 'application/json'
          : 'text/html; charset=utf-8';
        return new Response(body, { status: 200, headers: { 'Content-Type': type } });
      },
    },
  };
}

function req(path, headers = {}) {
  return new Request(`https://site.test${path}`, { headers });
}

describe('worker: content-type integrity', () => {

  test('markdown request served from /md gets text/markdown', async () => {
    const env = makeEnv({
      '/docs/': '<html>page</html>',
      '/md/docs/index.md': '# Docs',
    });
    const res = await worker.fetch(req('/docs/', { Accept: 'text/markdown' }), env);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('Content-Type'), /text\/markdown/);
  });

  test('markdown request FALLING BACK to HTML keeps the HTML content-type', async () => {
    const env = makeEnv({
      '/docs/': '<html>page</html>',
      // no /md copy exists
    });
    const res = await worker.fetch(req('/docs/', { Accept: 'text/markdown' }), env);
    assert.equal(res.status, 200);
    const ct = res.headers.get('Content-Type') || '';
    assert.ok(!ct.includes('text/markdown'), `HTML fallback mislabeled as ${ct}`);
    assert.ok(ct.includes('text/html'), `expected text/html, got ${ct}`);
  });

  test('json fallback to HTML keeps HTML content-type', async () => {
    const env = makeEnv({ '/docs/': '<html>page</html>' });
    const res = await worker.fetch(req('/docs/', { Accept: 'application/json' }), env);
    assert.equal(res.status, 200);
    const ct = res.headers.get('Content-Type') || '';
    assert.ok(!ct.includes('application/json'), `HTML fallback mislabeled as ${ct}`);
  });
});

describe('worker: redirect passthrough', () => {

  test('301 slash-normalization redirect passes through instead of 404', async () => {
    const env = makeEnv(
      { '/about/': '<html>about</html>', '/404.html': '<html>404</html>' },
      { redirects: { '/about': '/about/' } }
    );
    const res = await worker.fetch(req('/about'), env);
    assert.equal(res.status, 301, `expected redirect, got ${res.status}`);
    assert.equal(res.headers.get('Location'), '/about/');
  });
});

describe('worker: /.well-known pass-through', () => {
  const files = {
    '/.well-known/about.md': '---\nsummary: "hi"\n---\n\nHello\n',
    '/.well-known/following.opml': '<opml/>',
    '/.well-known/contact.vcf': 'BEGIN:VCARD',
    '/.well-known/security.txt': 'Contact: x',
    '/md/.well-known/about.md/index.md': '# WRONG',
    '/.well-known/about.md/_fragment.html': 'WRONG',
  };

  test('Accept: text/markdown for about.md is not rewritten to /md/', async () => {
    const res = await worker.fetch(req('/.well-known/about.md', { Accept: 'text/markdown' }), makeEnv(files));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), files['/.well-known/about.md']);
  });

  test('htmlstar and json negotiation are skipped too', async () => {
    const env = makeEnv(files);
    const a = await worker.fetch(req('/.well-known/about.md', { 'X-Requested-With': 'htmlstar' }), env);
    assert.equal(await a.text(), files['/.well-known/about.md']);
    const j = await worker.fetch(req('/.well-known/contact.vcf', { Accept: 'application/json' }), env);
    assert.equal(await j.text(), 'BEGIN:VCARD');
  });

  test('CORS header is present on the three SocialSpec paths', async () => {
    const env = makeEnv(files);
    for (const p of ['following.opml', 'about.md', 'contact.vcf']) {
      const res = await worker.fetch(req(`/.well-known/${p}`), env);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*', p);
    }
  });

  test('CORS header is absent elsewhere, and other well-known files are untouched', async () => {
    const env = makeEnv({ ...files, '/docs/': '<html/>' });
    const sec = await worker.fetch(req('/.well-known/security.txt'), env);
    assert.equal(await sec.text(), 'Contact: x');
    assert.equal(sec.headers.get('Access-Control-Allow-Origin'), null);
    const page = await worker.fetch(req('/docs/'), env);
    assert.equal(page.headers.get('Access-Control-Allow-Origin'), null);
  });

  test('a missing well-known file is a plain 404', async () => {
    const res = await worker.fetch(req('/.well-known/nope.txt'), makeEnv(files));
    assert.equal(res.status, 404);
  });
});
