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
